
import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, onSnapshot, query, where, Timestamp, serverTimestamp, doc, updateDoc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { AttendanceLog, Schedule } from '../types';
import Toast from '../components/Toast';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const HOSPITAL_LAT = 21.584135549676002;
const HOSPITAL_LNG = 39.208052479784165; 
const ALLOWED_RADIUS_KM = 0.08; 
const MAX_GPS_ACCURACY_METERS = 80; 

// --- Helpers (Pure Functions) ---
const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  var R = 6371; 
  var dLat = deg2rad(lat2-lat1); 
  var dLon = deg2rad(lon2-lon1); 
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}
const deg2rad = (deg: number) => deg * (Math.PI/180);

const getUniqueDeviceId = () => {
    const key = 'app_unique_device_id';
    let id = localStorage.getItem(key);
    if (!id) {
        id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem(key, id);
    }
    return id;
};

const convertTo24Hour = (timeStr: string): string => {
    if (!timeStr) return '00:00';
    let s = timeStr.toLowerCase().trim();
    s = s.replace(/(\d+)\.(\d+)/, '$1:$2');
    if (s.includes('mn') || s.includes('midnight') || s === '24:00') return '24:00';
    if (s.includes('noon')) return '12:00';
    let modifier = null;
    if (s.includes('pm')) modifier = 'pm'; else if (s.includes('am')) modifier = 'am';
    const cleanTime = s.replace(/[^\d:]/g, ''); 
    const parts = cleanTime.split(':');
    let h = parseInt(parts[0], 10);
    let m = parts[1] ? parseInt(parts[1], 10) : 0;
    if (modifier) {
        if (modifier === 'pm' && h < 12) h += 12;
        if (modifier === 'am' && h === 12) h = 0;
    }
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const parseMultiShifts = (text: string) => {
    if (!text) return [];
    let cleanText = text.replace(/[()]/g, '').trim();
    const segments = cleanText.split(/[\/,]|\s+and\s+|&|\s+(?=\d{1,2}(?::\d{2})?\s*(?:am|pm|mn|noon))/i);
    const shifts: { start: string, end: string }[] = [];
    segments.forEach(seg => {
        const trimmed = seg.trim();
        const rangeParts = trimmed.split(/\s*(?:[-–—]|\bto\b)\s*/i);
        if (rangeParts.length >= 2) {
            const startStr = rangeParts[0].trim();
            const endStr = rangeParts[rangeParts.length - 1].trim(); 
            const s = convertTo24Hour(startStr);
            const e = convertTo24Hour(endStr);
            if (s && e) shifts.push({ start: s, end: e });
        }
    });
    return shifts;
};

const getLocalDateKey = (dateObj: Date) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- STYLES INJECTION (For Advanced Animations) ---
const styles = `
@keyframes float {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
    100% { transform: translateY(0px); }
}
@keyframes pulse-ring {
    0% { transform: scale(0.8); opacity: 0; }
    50% { opacity: 0.5; }
    100% { transform: scale(1.3); opacity: 0; }
}
@keyframes rotate-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
.animate-float { animation: float 6s ease-in-out infinite; }
.animate-pulse-ring { animation: pulse-ring 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.animate-rotate-slow { animation: rotate-slow 20s linear infinite; }
.glass-panel {
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}
.neon-text-glow {
    text-shadow: 0 0 20px currentColor;
}
`;

// --- MEMOIZED COMPONENTS ---

const DigitalClock = memo(({ date }: { date: Date }) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const dayName = date.toLocaleDateString('en-US', {weekday: 'long'});
    const dateStr = date.toLocaleDateString('en-US', {day: 'numeric', month: 'long', year: 'numeric'});

    return (
        <div className="mb-10 relative flex flex-col items-center z-10 select-none pointer-events-none">
            <div className="flex items-baseline gap-2">
                <span className="text-[6rem] md:text-[8.5rem] font-black leading-none tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 drop-shadow-2xl tabular-nums font-sans">
                    {hours}:{minutes}
                </span>
                <span className="text-2xl md:text-3xl font-bold text-white/30 tabular-nums">
                    {seconds}
                </span>
            </div>
            <div className="flex items-center gap-4 mt-2 bg-black/20 px-6 py-2 rounded-full backdrop-blur-md border border-white/5">
                <span className="text-cyan-400 font-bold uppercase tracking-[0.2em] text-xs">{dayName}</span>
                <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                <span className="text-slate-300 font-medium text-xs tracking-widest uppercase">{dateStr}</span>
            </div>
        </div>
    );
});

const AttendancePage: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    
    // UI State
    const [currentTime, setCurrentTime] = useState<Date | null>(null);
    const [logicTicker, setLogicTicker] = useState(0); 
    const [timeOffset, setTimeOffset] = useState<number>(0);
    const [isTimeSynced, setIsTimeSynced] = useState(false);
    
    const [status, setStatus] = useState<'IDLE' | 'AUTH_DEVICE' | 'SCANNING_LOC' | 'PROCESSING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [errorDetails, setErrorDetails] = useState<{title: string, msg: string}>({title: '', msg: ''});
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
 
// Data State
    const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([]);
    const [yesterdayLogs, setYesterdayLogs] = useState<AttendanceLog[]>([]); // <--- إضافة جديدة
    const [todayShifts, setTodayShifts] = useState<{ start: string, end: string }[]>([]);
    const [overrideExpiries, setOverrideExpiries] = useState<Date[]>([]);
    const [hasOverride, setHasOverride] = useState(false);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    
    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || 'User';
    const localDeviceId = getUniqueDeviceId();
    const isProcessingRef = useRef(false);


function toMins(time: string): number {
    if (!time) return 0;

    const [h, m] = time.split(':').map(Number);
    return (h * 60) + (m || 0);
}


const hasNightInFromYesterday = useMemo(() => {
    if (yesterdayLogs.length === 0 || todayShifts.length === 0) return false;

    const last = yesterdayLogs[yesterdayLogs.length - 1];
    if (last.type !== 'IN') return false;

    const shiftIdx = last.shiftIndex || 1;
    const shift = todayShifts[shiftIdx - 1];
    if (!shift) return false;

    const s = toMins(shift.start);
    const e = toMins(shift.end);

    return e < s; // وردية ليلية فقط
}, [yesterdayLogs, todayShifts]);


    
    // 1. SYNC SERVER TIME
    useEffect(() => {
        const syncServerTime = async () => {
            try {
                const tempDocRef = doc(collection(db, 'system_sync'));
                await setDoc(tempDocRef, { timestamp: serverTimestamp() });
                const snap = await getDoc(tempDocRef);
                
                if (snap.exists()) {
                    const serverTime = snap.data().timestamp.toDate().getTime();
                    const deviceTime = Date.now();
                    const offset = serverTime - deviceTime;
                    
                    setTimeOffset(offset);
                    setIsTimeSynced(true);
                    await deleteDoc(tempDocRef);
                }
            } catch (e) {
                console.error("Sync fallback", e);
                setIsTimeSynced(true);
            }
        };
        syncServerTime();
    }, []);

    
    // 2. Clock Logic
useEffect(() => {
    if (!isTimeSynced) return;
    const timer = setInterval(() => {
        const now = new Date(Date.now() + timeOffset);
        setCurrentTime(now);

        // --- حساب العداد التنازلي ---
        // نبحث عن أقرب وقت انتهاء مستقبلي
        const activeExpiry = overrideExpiries.find(expiry => expiry > now);
        
        if (activeExpiry) {
            setHasOverride(true);
            // حساب الفرق بالثواني
            const seconds = Math.max(0, Math.round((activeExpiry.getTime() - now.getTime()) / 1000));
            setTimeLeft(seconds);
        } else {
            setHasOverride(false);
            setTimeLeft(null);
        }

        if (now.getSeconds() === 0) {
            setLogicTicker(prev => prev + 1);
        }
    }, 1000);
    return () => clearInterval(timer);
}, [isTimeSynced, timeOffset, overrideExpiries]);


    // 3. Data Subscriptions (MODIFIED FOR NIGHT SHIFT)

useEffect(() => {
        if (!currentUserId || !currentTime) return;

        const unsubUser = onSnapshot(doc(db, 'users', currentUserId), (docSnap) => {
            if(docSnap.exists()) setUserProfile(docSnap.data());
        });

        // جلب سجلات اليوم
        const todayStr = getLocalDateKey(currentTime);
        const qLogs = query(collection(db, 'attendance_logs'), where('userId', '==', currentUserId), where('date', '==', todayStr));
        const unsubLogs = onSnapshot(qLogs, (snap) => {
            const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
            logs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
            setTodayLogs(logs);
        });

        // --- إضافة جديدة: جلب سجلات الأمس لمعالجة الدوام الليلي ---
        const yesterdayDate = new Date(currentTime);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = getLocalDateKey(yesterdayDate);
        
        const qLogsYesterday = query(collection(db, 'attendance_logs'), where('userId', '==', currentUserId), where('date', '==', yesterdayStr));
        const unsubLogsYesterday = onSnapshot(qLogsYesterday, (snap) => {
            const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
            logs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
            setYesterdayLogs(logs);
        });
        // -------------------------------------------------------

// داخل الـ useEffect الثالث الخاص بالبيانات
const qOverride = query(collection(db, 'attendance_overrides'), where('userId', '==', currentUserId));
const unsubOver = onSnapshot(qOverride, (snap) => {
    // جلب كل التواريخ المتاحة للأذونات
    const expiries = snap.docs
        .map(d => d.data().validUntil?.toDate())
        .filter(date => date != null);
    
    setOverrideExpiries(
  expiries.sort((a, b) => a.getTime() - b.getTime())
);
});
        const currentMonth = currentTime.toISOString().slice(0, 7);
        const qSch = query(collection(db, 'schedules'), where('userId', '==', currentUserId), where('month', '==', currentMonth));
        const unsubSch = onSnapshot(qSch, (snap) => setSchedules(snap.docs.map(d => d.data() as Schedule)));

        return () => { unsubUser(); unsubLogs(); unsubLogsYesterday(); unsubOver(); unsubSch(); };
    }, [currentUserId, isTimeSynced, currentTime?.toDateString()]);



    // 4. Calculate Shifts (Data layer)
    useEffect(() => {
        if (!currentTime) return;
        const dateStr = getLocalDateKey(currentTime);
        const dayOfWeek = currentTime.getDay(); 

        let myShifts: { start: string, end: string }[] = [];
        const specific = schedules.find(s => s.date === dateStr);
        
        if (specific) {
            myShifts = specific.shifts || parseMultiShifts(specific.note || "");
        } else {
            schedules.forEach(sch => {
                if (sch.date) return;
                let applies = false;
                const isFri = (sch.locationId || '').toLowerCase().includes('friday') || (sch.note || '').toLowerCase().includes('friday');
                if (dayOfWeek === 5) { if (isFri) applies = true; } else { if (!isFri && !(sch.locationId || '').includes('Holiday')) applies = true; }
                
                if (applies) {
                    if (sch.validFrom && dateStr < sch.validFrom) applies = false;
                    if (sch.validTo && dateStr > sch.validTo) applies = false;
                }
                if (applies) {
                    const parsed = sch.shifts || parseMultiShifts(sch.note || "");
                    if (parsed.length > 0) myShifts = parsed;
                }
            });
        }
        setTodayShifts(myShifts);
    }, [schedules, currentTime]);

    // --- 5. THE ULTIMATE SHIFT LOGIC (GENIUS EDITION V5.0 - AUTO SKIP & RELATIVE GATING) ---
const shiftLogic = useMemo(() => {
        if (!currentTime) return { state: 'LOADING', message: 'SYNCING', sub: 'Server Time', canPunch: false };

        const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();



        
        // --- 1. تجهيز السجلات (المنطق الذكي الجديد) ---
        let effectiveLogs = [...todayLogs];
        // هذا يسمح للمنطق برؤية اليوم كأنه "فارغ" في المساء، فيفتح زر START لليلة الثانية
        if (effectiveLogs.length > 0 && effectiveLogs[0].type === 'OUT') {
            effectiveLogs = effectiveLogs.slice(1);
        }

        let isContinuationFromYesterday = false;
        
        // التحقق من سجلات الأمس (استخدام effectiveLogs هنا بدلاً من todayLogs)
        if (effectiveLogs.length === 0 && yesterdayLogs.length > 0) {
            const lastYesterday = yesterdayLogs[yesterdayLogs.length - 1];
            
            if (lastYesterday.type === 'IN') {
                const yShiftIdx = lastYesterday.shiftIndex || 1;
                const yShiftDef = todayShifts[yShiftIdx - 1] || todayShifts[0];

                if (yShiftDef) {
                    const yEnd = toMins(yShiftDef.end);
                    const yStart = toMins(yShiftDef.start);
                    let isExpired = false;
                    
                    if (yEnd < yStart) { 
                        // وردية ليلية ممتدة للصباح
                        if (currentMinutes > (yEnd + 60)) {
                            isExpired = true; 
                        }
                    } else {
                        // وردية نهارية عادية انتهت أمس
                        isExpired = true;
                    }

                    if (!isExpired) {
                        effectiveLogs = [lastYesterday];
                        isContinuationFromYesterday = true;
                    } 
                }
            }
        }

const logsCount = effectiveLogs.length;
const lastLog = logsCount > 0 ? effectiveLogs[logsCount - 1] : null;

// ============================================================
// 🛑 المرحلة 0: لا توجد سجلات (بداية يوم جديد أو بعد انتهاء وردية الأمس)
// ============================================================
if (logsCount === 0) {
    if (todayShifts.length > 0) {
        const firstShift = todayShifts[0];
        const sStart = toMins(firstShift.start);
        let sEnd = toMins(firstShift.end);
        
        // حساب متى نفتح نافذة الدخول (مثلاً قبل الموعد بـ 15 دقيقة)
        const windowOpen = sStart - 15; 
        
        let adjustedCurrent = currentMinutes;
        
        // Handle midnight crossover for end time logic
        if (sEnd < sStart) sEnd += 1440;
        if (sEnd > 1440 && currentMinutes < 720) adjustedCurrent += 1440;


 const missedWindowEnd = sEnd + 75; 


 if (!hasOverride && adjustedCurrent > sEnd && adjustedCurrent <= missedWindowEnd) {

    // ✔ يوجد بصمة واحدة (وردية ليلية مكتملة)
    if (hasNightInFromYesterday) {
        return {
            state: 'COMPLETED',
            message: 'COMPLETED DAY',
            sub: 'Night shift completed',
            canPunch: false
        };
    }

    // ❌ لا توجد أي بصمة
    return {
        state: 'MISSED',
        message: 'MISSED',
        sub: 'No attendance recorded',
        canPunch: false
    };
}


                // Transition to next shift or break after the 60 min "Missed" window
                if (!hasOverride && adjustedCurrent > missedWindowEnd) {
                    if (todayShifts.length > 1) {
                        let s2Start = toMins(todayShifts[1].start);
                        const s2Window = s2Start - 15;
                        if (currentMinutes >= s2Window) {
                            return { state: 'READY_IN', message: 'START', sub: 'Shift 2', canPunch: true, shiftIdx: 2 };
                        } else {
                            let diff = s2Window - currentMinutes;
                            if(diff < 0) diff += 1440;
                            const h = Math.floor(diff / 60);
                            const m = diff % 60;
                            return { 
                                    state: 'WAITING',
                                    message: 'WAITING',
                                    sub: `Next shift in ${h}h ${m}m`,
                                    canPunch: false
                                };
                        }
                    } else {
                            return {
                                    state: 'COMPLETED',
                                    message: 'DONE',
                                    sub: 'Day Complete',
                                    canPunch: false
                                };
                    }
                }

                if (hasOverride || currentMinutes >= windowOpen) {
                    return { state: 'READY_IN', message: 'START', sub: 'Shift 1', canPunch: true, shiftIdx: 1 };
                } else {
                    return { state: 'LOCKED', message: 'TOO EARLY', sub: `Starts at ${firstShift.start}`, canPunch: false };
                }
            } else {
                return { state: 'ERROR', message: 'NO SHIFT', sub: 'Contact Admin', canPunch: false };
            }
        }
// --- PHASE 1: LOGGED IN ONCE ---
if (logsCount === 1 && lastLog?.type === 'IN') {
    const currentShiftIndex = lastLog.shiftIndex || 1;
    let shiftDef = todayShifts[currentShiftIndex - 1];
    
    // معالجة حالة الاستمرار من الأمس (Night Shift Continuation)
    if (!shiftDef && isContinuationFromYesterday) {
         shiftDef = todayShifts[0]; // محاولة الحصول على تعريف الوردية الأولى
    }
    
    if (!shiftDef) return { state: 'ERROR', message: 'ERR', sub: 'Invalid Shift', canPunch: false };

    const shiftStart = toMins(shiftDef.start);
    let shiftEnd = toMins(shiftDef.end);
    
    let adjustedEnd = shiftEnd;
    let adjustedCurrent = currentMinutes;
    
    // --- منطق معالجة الدوام الليلي (المطور) ---
    const isOvernight = shiftEnd < shiftStart;

    if (isOvernight) {
        // إذا كان الدوام ليللي ونحن الآن في ساعات الصباح (حتى الظهر 720 دقيقة)
        // نعتبر الوقت الحالي ممتداً من اليوم السابق (+1440)
        if (currentMinutes < 720) {
            adjustedCurrent += 1440;
        }
        adjustedEnd += 1440;
    }

    // تصحيح إضافي في حالة الاستمرار من الأمس لضمان دقة المقارنة
    if (isContinuationFromYesterday && !isOvernight) {
        // إذا لم يكن لولياً ولكنه قادم من الأمس (نادر الحدوث برمجياً لكن للاحتياط)
        adjustedCurrent += 1440;
    }

    const GRACE_PERIOD_MINUTES = 60; // ساعة سماحية بعد انتهاء الدوام
    const autoCloseTime = adjustedEnd + GRACE_PERIOD_MINUTES;
    
    const hasSecondShift = todayShifts.length > currentShiftIndex;

    // --- سيناريو انتهاء وقت الخروج (Auto-Close or Next Shift Transition) ---
    if (!hasOverride && adjustedCurrent > autoCloseTime) {
        // التحقق من وجود وردية ثانية للانتقال إليها
        if (hasSecondShift) {
            let s2Start = toMins(todayShifts[currentShiftIndex].start); // الوردية التالية
            let adjustedS2Window = s2Start - 15;
            let adjustedCurrentForS2 = currentMinutes;

            // معالجة التفاف الوقت للوردية الثانية
            if (adjustedS2Window < adjustedCurrentForS2 && (adjustedCurrentForS2 - adjustedS2Window) > 720) {
                 adjustedS2Window += 1440;
            }
            
            // إذا حان وقت الوردية الثانية
            if (adjustedCurrentForS2 >= adjustedS2Window) {
                 return { 
                    state: 'READY_IN', 
                    message: 'START', 
                    sub: `Shift ${currentShiftIndex + 1}`, 
                    canPunch: true, 
                    shiftIdx: currentShiftIndex + 1 
                };
            }

            // إذا كنا في وقت الاستراحة بين الورديتين
            let diff = adjustedS2Window - adjustedCurrentForS2;
            if (diff < 0) diff += 1440;
            const h = Math.floor(diff / 60);
            const m = diff % 60;

            return {
                state: 'DISABLED',
                message: 'BREAK',
                sub: `Next shift in ${h}h ${m}m`,
                canPunch: false,
                isBreak: true
            };
        }

        // لا توجد وردية ثانية والوقت انتهى
        return {
            state: 'COMPLETED',
            message: 'CLOSED',
            sub: 'Checkout time expired',
            canPunch: false
        };
    }

    // --- سيناريو نافذة الخروج العادية ---
    const windowOpen = adjustedEnd - 15; // تفتح قبل نهاية الدوام بـ 15 دقيقة

    if (hasOverride || adjustedCurrent >= windowOpen) {
        return { 
            state: 'READY_OUT', 
            message: 'END', 
            sub: `Shift ${currentShiftIndex}`, 
            canPunch: true, 
            shiftIdx: currentShiftIndex 
        };
    } else {
        // الموظف لا يزال داخل وقت الدوام
        return { 
            state: 'LOCKED', 
            message: 'ON DUTY', 
            sub: `Ends at ${shiftDef.end}`, 
            canPunch: false 
        };
    }
}
        // --- PHASE 2: TWO LOGS ---
        if (logsCount === 2) {
            // (نفس الكود السابق، فقط تأكد من التعامل مع الحالة العادية)
            const lastLogIdx = lastLog?.shiftIndex || 1;
            if (lastLogIdx >= todayShifts.length) {
                return { state: 'COMPLETED', message: 'DONE', sub: 'Day Complete', canPunch: false };
            }
            if (todayShifts.length < 2) return { state: 'COMPLETED', message: 'DONE', sub: 'Day Complete', canPunch: false };
            
            let s2Start = toMins(todayShifts[1].start);
            // تصحيح بسيط لوقت الظهيرة
            let s1End = toMins(todayShifts[0].end);
            if(s1End > s2Start) s2Start += 1440; // مجرد حماية

            const windowOpen = s2Start - 15;
            if (hasOverride || currentMinutes >= windowOpen) {
                return { state: 'READY_IN', message: 'START', sub: 'Shift 2', canPunch: true, shiftIdx: 2 };
            } else {
                 let diff = windowOpen - currentMinutes;
                 if(diff < 0) diff += 1440; // تصحيح
                 const h = Math.floor(diff / 60);
                 const m = diff % 60;
                 return { state: 'DISABLED', message: 'BREAK', sub: `Next shift in ${h}h ${m}m`, timeRemaining: `${h}:${m}`, canPunch: false, isBreak: true };
            }
        }

        // --- PHASE 3: THREE LOGS ---
        if (logsCount === 3) {
            let s2End = toMins(todayShifts[1].end);
            let s2Start = toMins(todayShifts[1].start);
            if (s2End < s2Start) s2End += 1440;

            let adjustedCurrent = currentMinutes;
            if (s2End > 1440 && currentMinutes < 720) adjustedCurrent += 1440;

            // ============================================================
            // 🛑 التعديل الجديد للوردية الثانية
            // ============================================================
            const GRACE_PERIOD_MINUTES = 60;
            const autoCloseTime = s2End + GRACE_PERIOD_MINUTES;

            if (!hasOverride && adjustedCurrent > autoCloseTime) {
                return { 
                    state: 'COMPLETED', 
                    message: 'CLOSED', 
                    sub: 'S2 Timeout', 
                    canPunch: false 
                };
            }
            // ============================================================

            const windowOpen = s2End - 15;

            if (hasOverride || adjustedCurrent >= windowOpen) {
                return { state: 'READY_OUT', message: 'END', sub: 'Shift 2', canPunch: true, shiftIdx: 2 };
            } else {
                return { state: 'LOCKED', message: 'ON DUTY', sub: `Ends at ${todayShifts[1].end}`, canPunch: false };
            }
        }

        return { state: 'COMPLETED', message: 'DONE', sub: 'See you tomorrow!', canPunch: false };

    }, [todayLogs, yesterdayLogs, todayShifts, hasOverride, logicTicker, currentTime]);



    // --- ACTIONS ---
    const playSound = (type: 'success' | 'error' | 'click') => {
        const sounds = {
            success: 'https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3',
            error: 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3',
            click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'
        };
        new Audio(sounds[type]).play().catch(() => {});
    };

    const authenticateUser = async () => {
        if (window.PublicKeyCredential) {
            try {
                setStatus('AUTH_DEVICE');
                await navigator.credentials.create({
                    publicKey: {
                        challenge: new Uint8Array(32),
                        rp: { name: "Smart Employee System" },
                        user: { id: new Uint8Array(16), name: currentUserName, displayName: currentUserName },
                        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                        timeout: 60000
                    }
                });
                return true;
            } catch (error) {
                console.error("Auth failed", error);
                throw new Error("Device authentication failed.");
            }
        }
        return true; 
    };

    const handlePunch = async () => {
    // 1. المنع الفوري إذا كانت العملية قيد التنفيذ أو البصمة غير مسموحة
    if (isProcessingRef.current || !shiftLogic.canPunch) return;

    isProcessingRef.current = true; // قفل العملية فوراً
    
    playSound('click');
    setErrorDetails({title:'', msg:''});

    // دالة مساعدة لفتح القفل بعد وقت معين (لتجنب النقرات السريعة جداً)
    const releaseLock = (delay = 2000) => {
        setTimeout(() => {
            isProcessingRef.current = false;
        }, delay);
    };

    if (!navigator.onLine) {
        setStatus('ERROR');
        setErrorDetails({ title: 'No Internet', msg: 'Check connection.' });
        playSound('error');
        releaseLock(); // فتح القفل للمحاولة لاحقاً
        return;
    }

    if (!hasOverride) {
        if (userProfile?.biometricId && userProfile.biometricId !== localDeviceId) {
            setStatus('ERROR');
            setErrorDetails({ title: 'Invalid Device', msg: 'Use registered device.' });
            playSound('error');
            releaseLock();
            return;
        }
    }

    try {
        await authenticateUser();
        setStatus('SCANNING_LOC');

        if (!navigator.geolocation) {
            throw new Error('GPS not supported');
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const { latitude, longitude, accuracy } = pos.coords;
                    // @ts-ignore (لفحص ميزة mocked إذا كانت متاحة في المتصفح)
                    const isMocked = pos.coords.mocked || false; 

                    // 1. فحص التلاعب بالوقت (الفرق بين وقت الجهاز ووقت السيرفر المزامَن)
                    const deviceTime = Date.now();
                    const serverTimeFromOffset = deviceTime + timeOffset;
                    const timeDiffMinutes = Math.abs(deviceTime - serverTimeFromOffset) / (1000 * 60);
                    
                    let isSuspicious = false;
                    let violationType = '';

                    // كشف تغيير وقت الجهاز يدوياً
                    if (timeDiffMinutes > 5) { 
                        isSuspicious = true;
                        violationType = 'MANUAL_TIME_CHANGE';
                    }

                    // كشف المواقع الوهمية (Mock Location)
                    if (isMocked) {
                        isSuspicious = true;
                        violationType = 'MOCK_LOCATION_DETECTED';
                    }

                    const dist = getDistanceFromLatLonInKm(latitude, longitude, HOSPITAL_LAT, HOSPITAL_LNG);

                    // المنع الفوري إذا كان الموقع خارج النطاق وبدون إذن (Override)
                    if (dist > ALLOWED_RADIUS_KM && !hasOverride) {
                        setStatus('ERROR');
                        setErrorDetails({ title: 'Out of Range', msg: `You are ${(dist * 1000).toFixed(0)}m away.` });
                        playSound('error');
                        releaseLock();
                        return;
                    }

                    setStatus('PROCESSING');
                    
                    const localDateStr = getLocalDateKey(currentTime!);
                    const nextType = shiftLogic.state === 'READY_IN' ? 'IN' : 'OUT';
                    
                    // إرسال البيانات مع علامات التحذير للمشرف
                    await addDoc(collection(db, 'attendance_logs'), {
                        userId: currentUserId,
                        userName: currentUserName,
                        type: nextType,
                        timestamp: serverTimestamp(),
                        clientTimestamp: Timestamp.now(),
                        date: localDateStr,
                        locationLat: latitude,
                        locationLng: longitude,
                        distanceKm: dist,
                        accuracy: accuracy,
                        deviceInfo: navigator.userAgent,
                        deviceId: localDeviceId,
                        status: isSuspicious ? 'flagged' : 'verified', // تعليم السجل للمشرف
                        shiftIndex: (shiftLogic as any).shiftIdx || 1,
                        isSuspicious: isSuspicious, // سيظهر عند المشرف باللون الأحمر
                        violationType: violationType // نوع المخالفة (وقت أم موقع)
                    });

                    if (!userProfile?.biometricId) {
                        await updateDoc(doc(db, 'users', currentUserId), {
                            biometricId: localDeviceId,
                            biometricRegisteredAt: Timestamp.now()
                        });
                    }

                    setStatus('SUCCESS');
                    playSound('success');
                    if (navigator.vibrate) navigator.vibrate([100]);
                    
                    // في حالة النجاح ننتظر قليلاً قبل السماح ببصمة أخرى
                    setTimeout(() => setStatus('IDLE'), 2000);
                    releaseLock(3000); // تأخير إضافي بعد النجاح للأمان

                } catch (innerError: any) {
                    console.error(innerError);
                    setStatus('ERROR');
                    setErrorDetails({ title: 'Process Error', msg: innerError.message });
                    releaseLock();
                }
            },
            (err) => {
                setStatus('ERROR');
                setErrorDetails({ title: 'GPS Failed', msg: err.message });
                playSound('error');
                setTimeout(() => setStatus('IDLE'), 3000);
                releaseLock();
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );

    } catch (e: any) {
        setStatus('ERROR');
        setErrorDetails({ title: 'Auth Failed', msg: e.message || "Unknown error" });
        playSound('error');
        releaseLock();
    }
};
    // --- VISUAL CONFIGURATION (Cyberpunk/Glassmorphism) ---
    const visualState = useMemo(() => {
        const isBreak = (shiftLogic as any).isBreak;
        
        if (!shiftLogic.canPunch) {
            if (shiftLogic.state === 'MISSED') {
                return {
                    theme: 'rose', // Red Theme for missed
                    mainText: 'MISSED',
                    subText: 'Shift Expired',
                    icon: 'fa-user-slash',
                    ringClass: 'border-rose-500/20 shadow-[0_0_50px_rgba(244,63,94,0.1)]',
                    btnClass: 'bg-rose-900/10 text-rose-500',
                    pulse: false
                };
            }
            if (shiftLogic.state === 'COMPLETED') {
                return {
                    theme: 'emerald',
                    mainText: 'DONE',
                    subText: shiftLogic.sub || 'SHIFT COMPLETE',
                    icon: 'fa-check-circle',
                    ringClass: 'border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.1)]',
                    btnClass: 'bg-emerald-900/10 text-emerald-500',
                    pulse: false
                };
            }
            if (isBreak) {
                return {
                    theme: 'amber',
                    mainText: 'BREAK',
                    subText: shiftLogic.sub,
                    extraText: (shiftLogic as any).timeRemaining,
                    icon: 'fa-coffee',
                    ringClass: 'border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.1)]',
                    btnClass: 'bg-amber-900/10 text-amber-500',
                    pulse: true // Slow pulse
                };
            }
            return {
                theme: 'slate',
                mainText: shiftLogic.message,
                subText: shiftLogic.sub,
                icon: 'fa-lock',
                ringClass: 'border-slate-700/30',
                btnClass: 'bg-slate-800/40 text-slate-500',
                pulse: false
            };
        }

        const isCheckIn = shiftLogic.state === 'READY_IN';
        return {
            theme: isCheckIn ? 'cyan' : 'rose',
            mainText: isCheckIn ? 'START' : 'FINISH',
            subText: shiftLogic.sub,
            icon: isCheckIn ? 'fa-fingerprint' : 'fa-sign-out-alt',
            ringClass: isCheckIn 
                ? 'border-cyan-500/50 shadow-[0_0_80px_rgba(6,182,212,0.3)] animate-pulse-ring' 
                : 'border-rose-500/50 shadow-[0_0_80px_rgba(244,63,94,0.3)] animate-pulse-ring',
            btnClass: isCheckIn 
                ? 'bg-cyan-500 text-black hover:bg-cyan-400' 
                : 'bg-rose-600 text-white hover:bg-rose-500',
            pulse: true
        };
    }, [shiftLogic]);

    // Circular Progress for Seconds (Visual Candy)
    const radius = 140;
    const circumference = 2 * Math.PI * radius;
    const displayTime = currentTime || new Date();
    const strokeDashoffset = circumference - ((displayTime.getSeconds()) / 60) * circumference;

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col relative overflow-hidden selection:bg-cyan-500/30" dir={dir}>
            <style>{styles}</style>
            
            {/* --- LIVE AMBIENT BACKGROUND --- */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className={`absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-float transition-colors duration-[2000ms]
                    ${visualState.theme === 'cyan' ? 'bg-cyan-600' : visualState.theme === 'rose' ? 'bg-rose-600' : visualState.theme === 'amber' ? 'bg-amber-600' : 'bg-slate-800'}`}>
                </div>
                <div className={`absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full mix-blend-screen filter blur-[100px] opacity-10 animate-float transition-colors duration-[2000ms] delay-1000
                    ${visualState.theme === 'cyan' ? 'bg-blue-600' : visualState.theme === 'rose' ? 'bg-orange-600' : 'bg-slate-700'}`}>
                </div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5"></div>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* --- Header --- */}
            <div className="relative z-30 flex justify-between items-center p-6 glass-panel border-b border-white/5">
                <button onClick={() => navigate('/user')} className="group flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all backdrop-blur-md">
                    <i className="fas fa-chevron-left text-white/70 group-hover:text-white transition-colors rtl:rotate-180"></i>
                    <span className="text-xs font-bold text-white/70 group-hover:text-white uppercase tracking-wider">Dashboard</span>
                </button>
                
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <h2 className="text-sm font-bold text-white/90 tracking-wide">{currentUserName}</h2>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${navigator.onLine && isTimeSynced ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500 animate-pulse'}`}></div>
                            <span className="text-[9px] font-mono text-white/40 tracking-wider uppercase">{isTimeSynced ? 'ONLINE' : 'SYNCING'}</span>
                        </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center text-sm font-bold shadow-lg text-white">
                        {currentUserName.charAt(0)}
                    </div>
                </div>
            </div>

                {/* ✅ ضع الكود هنا بالظبط (تحت الهيدر مباشرة) ✅ */}
          {hasOverride && timeLeft !== null && (
    <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-[280px] transition-all duration-500 ${timeLeft <= 10 ? 'scale-110' : 'scale-100'}`}>
        <div className={`
            flex items-center justify-center gap-3 px-6 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl transition-colors duration-300
            ${timeLeft <= 10 
                ? 'bg-red-600/90 border-red-400 animate-shake' // تأثير الاهتزاز في آخر 5 ثواني
                : 'bg-orange-600/80 border-white/20 animate-bounce'
            } text-white`}
        >
            <i className={`fas ${timeLeft <= 10 ? 'fa-triangle-exclamation' : 'fa-clock-rotate-left'} text-xl`}></i>
            <div className="flex flex-col">
                <span className="text-[10px] uppercase font-black tracking-widest opacity-80 leading-none">
                    {timeLeft <= 10 ? 'Hurry Up!' : 'Access Window'}
                </span>
                <span className="text-lg font-black tabular-nums leading-none mt-1">
                    Closing in: <span className="underline decoration-2 underline-offset-4">{timeLeft}s</span>
                </span>
            </div>
        </div>
    </div>
)}
            {/* --- Main Content --- */}
            <div className="flex-1 flex flex-col items-center justify-center relative z-20 px-4 pb-24">
                
                {/* --- CLOCK --- */}
                {currentTime && <DigitalClock date={currentTime} />}

                {/* --- THE REACTOR BUTTON --- */}
<div className="relative group scale-90 md:scale-100 transition-transform duration-500 flex items-center justify-center">
    
    {/* 1. الخلفية: حلقات الزينة (Dashed & Glow) */}
    <div className="absolute inset-[-40px] border border-dashed border-white/10 rounded-full animate-rotate-slow pointer-events-none"></div>
    <div className={`absolute w-[340px] h-[340px] rounded-full border-2 ${visualState.ringClass} transition-all duration-700 pointer-events-none`}></div>
    
    {/* 2. الطبقة الوسطى: الخط الدائري المتحرك (SVG) */}
    {/* نضع z-10 ليكون فوق الخلفية وتحت محتوى الزر */}
    <svg 
        viewBox="0 0 340 340" 
        className="absolute w-[340px] h-[340px] -rotate-90 pointer-events-none z-10 overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle
            cx="170"
            cy="170"
            r={radius}
            stroke="currentColor"
            strokeWidth="3"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`transition-all duration-1000 ease-linear ${
                visualState.theme === 'cyan' ? 'text-cyan-400' : 
                visualState.theme === 'rose' ? 'text-rose-500' : 
                visualState.theme === 'amber' ? 'text-amber-500' : 'text-slate-600'
            }`}
        />
    </svg>

    {/* 3. الطبقة العليا: الزر الفعلي (الذي يحتوي على النص والأيقونة) */}
    {/* نضع z-20 لضمان أن النص فوق الخط تماماً ولا يتم تغطيته */}
    <div className="relative z-20">
       <button
    onClick={handlePunch}
    disabled={status !== 'IDLE' && status !== 'ERROR' || !shiftLogic.canPunch} // السماح بالضغط حتى لو كان هناك خطأ سابق للمحاولة مرة أخرى
    className={`
        relative w-64 h-64 rounded-full flex flex-col items-center justify-center 
        transition-all duration-500 transform active:scale-95 
        ${visualState.theme === 'rose' && status === 'ERROR' ? 'bg-red-900/40 text-red-500 border-red-500/50' : visualState.btnClass} 
        glass-panel border-4 border-white/5 shadow-2xl
        ${(status !== 'IDLE' && status !== 'ERROR') ? 'opacity-50 cursor-not-allowed' : ''}
    `}
>
    {/* محتوى الزر (أيقونة، نص رئيسي، نص فرعي) */}
    <i className={`fas ${status === 'ERROR' ? 'fa-exclamation-triangle' : visualState.icon} text-5xl mb-4 neon-text-glow`}></i>
    
    <span className="text-2xl font-black tracking-tighter uppercase leading-none text-center px-4">
        {status === 'IDLE' ? visualState.mainText : 
         status === 'ERROR' ? errorDetails.title : // هنا يظهر عنوان الخطأ بدلاً من كلمة ERROR
         status} 
    </span>

    <span className="text-[10px] mt-2 font-bold tracking-[0.2em] opacity-60 uppercase text-center px-4">
        {status === 'ERROR' ? errorDetails.msg : visualState.subText}
    </span>
</button>
    </div>
</div>

                {/* Shift HUD */}
{todayShifts.length > 0 && (
    <div className="mt-10 w-full max-w-2xl flex flex-col gap-6 px-4">
        {todayShifts.map((s, i) => {
            const isCurrent = (shiftLogic as any).shiftIdx === (i + 1);
            const isMissed = (shiftLogic as any).shiftIdx > (i + 1) && todayLogs.length < (i + 1) * 2;

            let borderColor = 'border-white/10';
            let bgColor = 'bg-white/5';
            let textColor = 'text-white/90';

            if (isCurrent) {
                borderColor = 'border-cyan-500/40';
                bgColor = 'bg-cyan-500/10';
                textColor = 'text-cyan-300 neon-text-glow';
            } else if (isMissed) {
                textColor = 'text-red-400/50 line-through';
            }

            return (
                <div 
                    key={i} 
                    className={`glass-panel p-6 rounded-3xl flex flex-col gap-4 transition-all duration-500 border-2 ${borderColor} ${bgColor} ${isCurrent ? 'shadow-2xl scale-[1.03]' : 'opacity-70'}`}
                >
                    {/* العنوان العلوي */}
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <span className="text-xs font-black text-white/30 uppercase tracking-[0.3em]">
                            Shift {i + 1}
                        </span>
                        {isCurrent && (
                            <span className="flex items-center gap-2 text-[10px] bg-cyan-500 text-black px-3 py-1 rounded-full font-bold">
                                <span className="w-1.5 h-1.5 bg-black rounded-full animate-ping" />
                                ACTIVE NOW
                            </span>
                        )}
                    </div>

                    {/* عرض الوقت: واحد في الأول وواحد في الآخر */}
                    <div className={`flex justify-between items-center ${textColor}`}>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-white/20 mb-1 uppercase">Start</span>
                            <span className="text-3xl md:text-4xl font-black font-mono tracking-tighter">
                                {s.start}
                            </span>
                        </div>

                        {/* خط واصل جمالي في المنتصف */}
                        <div className="flex-grow mx-8 h-[2px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                        <div className="flex flex-col items-end">
                            <span className="text-[10px] text-white/20 mb-1 uppercase">End</span>
                            <span className="text-3xl md:text-4xl font-black font-mono tracking-tighter">
                                {s.end}
                            </span>
                        </div>
                    </div>
                </div>
            )
        })}
    </div>
)}
            </div>

            {/* --- History Drawer (Bottom Sheet) --- */}
            <div className={`fixed bottom-0 left-0 right-0 glass-panel border-t border-white/10 transition-transform duration-500 z-40 flex flex-col rounded-t-[2.5rem] shadow-[0_-10px_60px_rgba(0,0,0,0.5)] ${showHistory ? 'translate-y-0 h-[75vh]' : 'translate-y-[calc(100%-90px)] h-[75vh]'}`}>
                <div 
                    onClick={() => setShowHistory(!showHistory)}
                    className="w-full h-[90px] flex flex-col items-center justify-start pt-4 cursor-pointer relative group"
                >
                    <div className="w-12 h-1.5 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors mb-3"></div>
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] group-hover:text-white/70 transition-colors">Pull for History</span>
                </div>
                
                <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3 custom-scrollbar-dark bg-black/20">
                    {todayLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-white/20">
                            <i className="far fa-clock text-3xl mb-3 opacity-50"></i>
                            <p className="text-xs font-bold uppercase tracking-widest">No Activity Yet</p>
                        </div>
                    ) : (
                        todayLogs.map((log, idx) => (
                            <div key={log.id} className={`flex items-center justify-between bg-white/5 p-4 rounded-2xl border ${log.isSuspicious ? 'border-red-500/50 bg-red-900/10' : 'border-white/5'} hover:bg-white/10 transition-all group`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg ${log.type === 'IN' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                                        <i className={`fas ${log.type === 'IN' ? 'fa-sign-in-alt' : 'fa-sign-out-alt'}`}></i>
                                    </div>
                                    <div>
                                        <p className={`font-bold text-sm uppercase tracking-wide ${log.type === 'IN' ? 'text-cyan-100' : 'text-rose-100'}`}>{log.type === 'IN' ? 'Check In' : 'Check Out'}</p>
                                        <p className="text-[10px] text-white/30 font-mono mt-0.5">Shift {log.shiftIndex || 1} • Seq #{idx+1}</p>
                                        {log.isSuspicious && <p className="text-[9px] text-red-400 font-bold mt-1 uppercase tracking-wider">⚠️ {log.violationType || 'SUSPICIOUS'}</p>}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono font-bold text-white text-lg tracking-tight">
                                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false}) : '--:--'}
                                    </p>
                                    <div className="flex items-center justify-end gap-1 mt-1 opacity-40">
                                        <i className="fas fa-check-circle text-[8px]"></i>
                                        <span className="text-[9px] font-bold">Synced</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

        </div>
    );
};

export default AttendancePage;
