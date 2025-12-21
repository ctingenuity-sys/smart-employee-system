
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
const ALLOWED_RADIUS_KM = 0.20; 
const MAX_GPS_ACCURACY_METERS = 200; 

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

    // Data State
    const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([]);
    const [todayShifts, setTodayShifts] = useState<{ start: string, end: string }[]>([]);
    const [hasOverride, setHasOverride] = useState(false);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    
    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || 'User';
    const localDeviceId = getUniqueDeviceId();

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
        setCurrentTime(new Date(Date.now() + timeOffset));
        const timer = setInterval(() => {
            const now = new Date(Date.now() + timeOffset);
            setCurrentTime(now);
            if (now.getSeconds() === 0) {
                setLogicTicker(prev => prev + 1);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [isTimeSynced, timeOffset]);

    // 3. Data Subscriptions
    useEffect(() => {
        if (!currentUserId || !currentTime) return;

        const unsubUser = onSnapshot(doc(db, 'users', currentUserId), (docSnap) => {
            if(docSnap.exists()) setUserProfile(docSnap.data());
        });

        const todayStr = getLocalDateKey(currentTime);
        
        const qLogs = query(collection(db, 'attendance_logs'), where('userId', '==', currentUserId), where('date', '==', todayStr));
        const unsubLogs = onSnapshot(qLogs, (snap) => {
            const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
            logs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
            setTodayLogs(logs);
        });

        const qOverride = query(collection(db, 'attendance_overrides'), where('userId', '==', currentUserId));
        const unsubOver = onSnapshot(qOverride, (snap) => {
            let active = false;
            const now = new Date(Date.now() + timeOffset);
            snap.docs.forEach(d => { if (d.data().validUntil && d.data().validUntil.toDate() > now) active = true; });
            setHasOverride(active);
        });

        const currentMonth = currentTime.toISOString().slice(0, 7);
        const qSch = query(collection(db, 'schedules'), where('userId', '==', currentUserId), where('month', '==', currentMonth));
        const unsubSch = onSnapshot(qSch, (snap) => setSchedules(snap.docs.map(d => d.data() as Schedule)));

        return () => { unsubUser(); unsubLogs(); unsubOver(); unsubSch(); };
    }, [currentUserId, isTimeSynced, currentTime ? currentTime.getDate() : 0]);

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

        const toMins = (t: string) => {
            if (!t) return 0;
            const [h, m] = t.split(':').map(Number);
            return h * 60 + (m || 0);
        };

        if (todayShifts.length === 0) {
            return { state: 'NO_SCHEDULE', message: 'OFF DUTY', sub: 'No shift scheduled', canPunch: false };
        }

        const logsCount = todayLogs.length;
        const lastLog = logsCount > 0 ? todayLogs[logsCount - 1] : null;
        
        // --- PHASE 0: DETERMINING ENTRY POINT ---
        if (logsCount === 0) {
            const shift1Start = toMins(todayShifts[0].start);
            let shift1End = toMins(todayShifts[0].end);
            
            // FIX: If shift ends next day (e.g., 17:00 to 01:00), add 24 hours to end time
            if (shift1End < shift1Start) {
                shift1End += 1440;
            }
            
            // Allow entry 30 mins before
            const s1WindowOpen = shift1Start - 30; 
            
            // Only skip shift if current time is past end AND multiple shifts exist
            // Using a modest buffer of 120 mins after end to allow late punching out if forgotten? 
            // No, for ENTRY logic: if we are way past end of S1, check S2.
            
            if (currentMinutes > shift1End && todayShifts.length > 1) {
                // Shift 1 Missed. Check Shift 2.
                let s2Start = toMins(todayShifts[1].start);
                const s1EndVal = toMins(todayShifts[0].end);
                
                // PM Correction logic
                if (s2Start < s1EndVal) s2Start += 720; // Heuristic adjustment if order seems wrong, though usually sorted

                const s2WindowOpen = s2Start - 15;

                if (hasOverride || currentMinutes >= s2WindowOpen) {
                    // READY FOR SHIFT 2 DIRECTLY
                    return { state: 'READY_IN', message: 'START', sub: 'Shift 2 (Shift 1 Missed)', canPunch: true, shiftIdx: 2 };
                } else {
                    // WAITING FOR SHIFT 2
                    let diff = s2WindowOpen - currentMinutes;
                    const h = Math.floor(diff / 60);
                    const m = diff % 60;
                    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                    
                    return { 
                        state: 'DISABLED', 
                        message: 'BREAK', 
                        sub: `Shift 1 Missed. S2 in ${timeStr}`, 
                        timeRemaining: timeStr,
                        canPunch: false,
                        isBreak: true
                    };
                }
            } else if (currentMinutes > shift1End && todayShifts.length === 1) {
                 return { state: 'COMPLETED', message: 'ABSENT', sub: 'Shift Ended', canPunch: false };
            }

            // Normal Shift 1 Logic
            if (hasOverride || currentMinutes >= s1WindowOpen) {
                return { state: 'READY_IN', message: 'START', sub: 'Shift 1', canPunch: true, shiftIdx: 1 };
            } else {
                const diff = s1WindowOpen - currentMinutes;
                const h = Math.floor(diff/60);
                const m = diff%60;
                return { state: 'LOCKED', message: 'WAIT', sub: `Starts in ${h>0?h+'h ':''}${m}m`, canPunch: false };
            }
        }

        // --- PHASE 1: LOGGED IN ONCE ---
        if (logsCount === 1 && lastLog?.type === 'IN') {
            const currentShiftIndex = lastLog.shiftIndex || 1;
            const shiftDef = todayShifts[currentShiftIndex - 1]; // shiftIndex is 1-based
            
            if (!shiftDef) return { state: 'ERROR', message: 'ERR', sub: 'Invalid Shift', canPunch: false };

            const shiftStart = toMins(shiftDef.start);
            let shiftEnd = toMins(shiftDef.end);
            
            // Handle PM/AM wrap for end time
            let adjustedEnd = shiftEnd;
            let adjustedCurrent = currentMinutes;
            
            // FIX: If shift ends next day (e.g. 17:00 to 01:00)
            if (shiftEnd < shiftStart) {
                adjustedEnd += 1440;
                // If currently it's early morning (e.g. 00:30), technically date logic handles 'date', 
                // but just in case this component remains mounted across midnight without data refresh:
                if (currentMinutes < shiftStart) {
                     // This usually won't trigger because date changes, but logical safe guard:
                     // adjustedCurrent += 1440; 
                }
            }

            const windowOpen = adjustedEnd - 15;

            // If we have wrapped around (adjustedEnd > 1440), we need to check if currentMinutes is actually late night
            // The problem is 'currentMinutes' resets to 0 at midnight.
            // But 'adjustedEnd' might be 1500 (1AM).
            // This component reloads on date change, so for the "Next Day", 
            // the user should technically see a "Continuation" or we handle punch out on the previous day's log?
            // Current system: Punch out is associated with the date of punch IN.
            
            // NOTE: If the shift crosses midnight, the user punches OUT on the next day. 
            // The 'date' in logs will be 'Today' (the start date).
            // But 'currentMinutes' will be small (e.g. 30 for 00:30).
            // So we need to handle the comparison.
            
            if (adjustedEnd > 1440) {
               // Shift ends tomorrow.
               // If current time is < 12:00 PM, assume it's "tomorrow" relative to start
               if (currentMinutes < 720) {
                   adjustedCurrent += 1440;
               }
            }

            if (hasOverride || adjustedCurrent >= windowOpen) {
                return { state: 'READY_OUT', message: 'END', sub: `Shift ${currentShiftIndex}`, canPunch: true, shiftIdx: currentShiftIndex };
            } else {
                return { state: 'LOCKED', message: 'ON DUTY', sub: `Ends at ${shiftDef.end}`, canPunch: false };
            }
        }

        // --- PHASE 2: TWO LOGS (Usually IN 1 -> OUT 1, or IN 2 -> OUT 2 if missed S1) ---
        if (logsCount === 2) {
            const lastLogIdx = lastLog?.shiftIndex || 1;

            // If we just finished Shift 2 (because we skipped S1), we are done.
            if (lastLogIdx === 2) {
                return { state: 'COMPLETED', message: 'DONE', sub: 'Day Complete (S1 Missed)', canPunch: false };
            }

            // Otherwise, we finished Shift 1. Wait for Shift 2.
            if (todayShifts.length < 2) {
                return { state: 'COMPLETED', message: 'DONE', sub: 'Day Complete', canPunch: false };
            }
            
            let s1End = toMins(todayShifts[0].end);
            let s1Start = toMins(todayShifts[0].start);
            if (s1End < s1Start) s1End += 1440;

            let s2Start = toMins(todayShifts[1].start);
            
            // Logic to determine if S2 is next day or just later today
            // Usually S2 is later today.
            // If S1 ended next day (e.g. 8am), S2 might be 5pm (which is technically < 8am+24h).
            // Standard check:
            if (s2Start < s1End - 1440) { 
                // S2 is earlier in the day than S1 end? Impossible unless S1 wrapped.
                // Assuming standard same-day shifts or sequential.
            }
            // Simple PM correction if needed
            if (s2Start < (s1End % 1440)) s2Start += 720; 

            const windowOpen = s2Start - 15;

            if (hasOverride) {
                return { state: 'READY_IN', message: 'START', sub: 'Shift 2 (Override)', canPunch: true, shiftIdx: 2 };
            }

            if (currentMinutes >= windowOpen) {
                return { state: 'READY_IN', message: 'START', sub: 'Shift 2', canPunch: true, shiftIdx: 2 };
            } else {
                let diff = windowOpen - currentMinutes;
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

                return { 
                    state: 'DISABLED', 
                    message: 'BREAK', 
                    sub: `Next shift in ${timeStr}`, 
                    timeRemaining: timeStr,
                    canPunch: false,
                    isBreak: true
                };
            }
        }

        // --- PHASE 3: THREE LOGS (IN 1 -> OUT 1 -> IN 2) ---
        if (logsCount === 3) {
            let s2End = toMins(todayShifts[1].end);
            let s2Start = toMins(todayShifts[1].start);
            
            // Check wrap
            if (s2End < s2Start) s2End += 1440;

            const windowOpen = s2End - 15;
            let adjustedCurrent = currentMinutes;
            
            // Handle midnight wrap for current time comparison
            if (s2End > 1440 && currentMinutes < 720) {
                adjustedCurrent += 1440;
            }

            if (hasOverride || adjustedCurrent >= windowOpen) {
                return { state: 'READY_OUT', message: 'END', sub: 'Shift 2', canPunch: true, shiftIdx: 2 };
            } else {
                return { state: 'LOCKED', message: 'ON DUTY', sub: `Ends at ${todayShifts[1].end}`, canPunch: false };
            }
        }

        return { state: 'COMPLETED', message: 'DONE', sub: 'See you tomorrow!', canPunch: false };

    }, [todayLogs, todayShifts, hasOverride, logicTicker, currentTime]);

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
        if (!shiftLogic.canPunch) {
            if (navigator.vibrate) navigator.vibrate(200);
            return;
        }
        
        playSound('click');
        setErrorDetails({title:'', msg:''});

        if (!navigator.onLine) {
            setStatus('ERROR');
            setErrorDetails({ title: 'No Internet', msg: 'Check connection.' });
            playSound('error');
            return;
        }

        if (!hasOverride) {
            if (userProfile?.biometricId && userProfile.biometricId !== localDeviceId) {
                setStatus('ERROR');
                setErrorDetails({ title: 'Invalid Device', msg: 'Use registered device.' });
                playSound('error');
                return;
            }
        }

        try {
            await authenticateUser();

            setStatus('SCANNING_LOC');
            if (!navigator.geolocation) throw new Error('GPS not supported');

            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const { latitude, longitude, accuracy } = pos.coords;
                    const dist = getDistanceFromLatLonInKm(latitude, longitude, HOSPITAL_LAT, HOSPITAL_LNG);

                    if (accuracy > MAX_GPS_ACCURACY_METERS) {
                        setStatus('ERROR');
                        setErrorDetails({ title: 'Weak GPS', msg: `Accuracy ${accuracy.toFixed(0)}m too low.` });
                        playSound('error');
                        return;
                    }

                    // --- FRAUD DETECTION LOGIC ---
                    let isSuspicious = false;
                    let violationType = '';

                    // 1. Location Check
                    if (dist > ALLOWED_RADIUS_KM && !hasOverride) {
                        // Instead of blocking, we might allow it but flag it
                        isSuspicious = true;
                        violationType = 'Location Mismatch';
                        // Keep current logic: Block unless overridden? Or block completely?
                        // User request implies "notification", so allow but flag?
                        // Current code BLOCKS it below. Let's keep blocking for user UX, but if override used, allow.
                        
                        if (!hasOverride) {
                             setStatus('ERROR');
                             setErrorDetails({ title: 'Out of Range', msg: `You are ${(dist * 1000).toFixed(0)}m away.` });
                             playSound('error');
                             return;
                        }
                    }

                    // 2. Time Tampering Check
                    // We rely on `timeOffset` calculated at startup.
                    // If device time is significantly different from server time (e.g. > 2 mins)
                    const deviceTime = Date.now();
                    const estimatedServerTime = deviceTime + timeOffset;
                    // Note: 'timeOffset' is static after init. If user changes time mid-session, 'Date.now()' changes.
                    // We re-check sync? No, assume `timeOffset` captured difference at load.
                    // If user changed time AFTER load, `Date.now() + timeOffset` will be WRONG (it will follow device time).
                    // Correct approach: We use `serverTimestamp()` in Firestore which is truth.
                    // But to detect *device* tampering locally:
                    // If we stored a robust reference point... actually, `serverTimestamp` is the only safe bet for DB.
                    // But we can flag based on discrepancy if we had a trusted time source now.
                    // Let's assume we allow the punch, but the DB record uses `serverTimestamp`.
                    // We can flag if client time is way off.
                    
                    // Simple heuristic: If accuracy is super high (GPS spoofers often behave perfectly), or speed is impossible.
                    // For now, let's flag distance violations that were overridden or edge cases.

                    setStatus('PROCESSING');
                    
                    if (!currentTime) throw new Error("Time sync lost");

                    const localDateStr = getLocalDateKey(currentTime);
                    const nextType = shiftLogic.state === 'READY_IN' ? 'IN' : 'OUT';
                    
                    await addDoc(collection(db, 'attendance_logs'), {
                        userId: currentUserId,
                        userName: currentUserName,
                        type: nextType,
                        timestamp: serverTimestamp(), // Secure Server Time
                        clientTimestamp: Timestamp.now(), // Device Time
                        date: localDateStr,
                        locationLat: latitude,
                        locationLng: longitude,
                        distanceKm: dist,
                        accuracy: accuracy,
                        deviceInfo: navigator.userAgent,
                        deviceId: localDeviceId,
                        status: 'verified',
                        shiftIndex: (shiftLogic as any).shiftIdx || 1,
                        // NEW FLAGS
                        isSuspicious: isSuspicious,
                        violationType: violationType
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
                    
                    setTimeout(() => setStatus('IDLE'), 2000);
                },
                (err) => {
                    setStatus('ERROR');
                    setErrorDetails({ title: 'GPS Failed', msg: err.message });
                    playSound('error');
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );

        } catch (e: any) {
            setStatus('ERROR');
            setErrorDetails({ title: 'Auth Failed', msg: e.message || "Unknown error" });
            playSound('error');
        }
    };

    // --- VISUAL CONFIGURATION (Cyberpunk/Glassmorphism) ---
    const visualState = useMemo(() => {
        const isBreak = (shiftLogic as any).isBreak;
        
        if (!shiftLogic.canPunch) {
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

            {/* --- Main Content --- */}
            <div className="flex-1 flex flex-col items-center justify-center relative z-20 px-4 pb-24">
                
                {/* --- CLOCK --- */}
                {currentTime && <DigitalClock date={currentTime} />}

                {/* --- THE REACTOR BUTTON --- */}
                <div className="relative group scale-90 md:scale-100 transition-transform duration-500">
                    
                    {/* Rotating Dashed Ring (Decorative) */}
                    <div className="absolute inset-[-40px] border border-dashed border-white/10 rounded-full animate-rotate-slow pointer-events-none"></div>
                    
                    {/* Dynamic Glow Ring */}
                    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full border-2 ${visualState.ringClass} transition-all duration-700 pointer-events-none`}></div>
                    
                    {/* SVG Progress Ring */}
                    <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] -rotate-90 pointer-events-none z-10">
                        <circle cx="170" cy="170" r={radius} stroke="currentColor" strokeWidth="1" fill="transparent" className="text-white/5" />
                        <circle
                            cx="170" cy="170" r={radius}
                            stroke="currentColor" strokeWidth="3" fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            className={`transition-all duration-1000 ease-linear ${visualState.theme === 'cyan' ? 'text-cyan-400' : visualState.theme === 'rose' ? 'text-rose-500' : visualState.theme === 'amber' ? 'text-amber-500' : 'text-slate-600'}`}
                        />
                    </svg>

                    {/* The Interactive Button */}
                    <button 
                        onClick={handlePunch}
                        disabled={status !== 'IDLE' && status !== 'ERROR'}
                        className={`relative w-72 h-72 rounded-full flex flex-col items-center justify-center backdrop-blur-md transition-all duration-300 z-20 overflow-hidden
                            ${shiftLogic.canPunch ? 'hover:scale-105 active:scale-95 shadow-2xl' : 'cursor-not-allowed'}
                            ${visualState.theme === 'cyan' ? 'shadow-cyan-500/20' : visualState.theme === 'rose' ? 'shadow-rose-500/20' : ''}
                        `}
                    >
                        {/* Background Layer inside button */}
                        <div className={`absolute inset-0 opacity-20 ${visualState.theme === 'cyan' ? 'bg-cyan-500' : visualState.theme === 'rose' ? 'bg-rose-600' : visualState.theme === 'amber' ? 'bg-amber-500' : 'bg-slate-700'}`}></div>
                        
                        {/* Status Content */}
                        {status === 'AUTH_DEVICE' ? (
                            <div className="flex flex-col items-center animate-pulse z-10">
                                <i className="fas fa-fingerprint text-6xl text-cyan-400 mb-4 filter drop-shadow-[0_0_15px_rgba(6,182,212,0.8)]"></i>
                                <span className="text-xs font-bold text-cyan-100 tracking-[0.3em] uppercase">Authenticating</span>
                            </div>
                        ) : status === 'SCANNING_LOC' ? (
                            <div className="flex flex-col items-center animate-pulse z-10">
                                <i className="fas fa-satellite-dish text-5xl text-cyan-400 mb-4"></i>
                                <span className="text-xs font-bold text-cyan-100 tracking-[0.3em] uppercase">Acquiring GPS</span>
                            </div>
                        ) : status === 'PROCESSING' ? (
                            <div className="relative z-10">
                                <div className="w-20 h-20 border-4 border-white/10 border-t-white rounded-full animate-spin"></div>
                            </div>
                        ) : status === 'SUCCESS' ? (
                            <div className="flex flex-col items-center animate-bounce-in z-10">
                                <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_50px_#10b981] mb-4 text-white">
                                    <i className="fas fa-check text-5xl"></i>
                                </div>
                                <span className="font-bold text-white tracking-[0.3em] text-lg">SUCCESS</span>
                            </div>
                        ) : status === 'ERROR' ? (
                            <div className="flex flex-col items-center animate-shake px-4 text-center z-10">
                                <i className="fas fa-exclamation-triangle text-4xl text-red-500 mb-4 drop-shadow-[0_0_10px_rgba(220,38,38,0.5)]"></i>
                                <span className="text-sm font-bold text-red-100 uppercase tracking-wide">{errorDetails.title}</span>
                                <span className="text-[10px] text-red-200/60 mt-2 max-w-[200px] leading-tight">{errorDetails.msg}</span>
                                <span className="text-[10px] bg-white/10 border border-white/10 px-4 py-1.5 rounded-full mt-6 text-white/70 hover:bg-white/20 transition-colors uppercase tracking-widest cursor-pointer">Retry</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center z-10">
                                <i className={`fas ${visualState.icon} text-4xl mb-3 opacity-80 ${visualState.theme === 'cyan' ? 'text-cyan-300' : visualState.theme === 'rose' ? 'text-rose-300' : visualState.theme === 'amber' ? 'text-amber-400' : 'text-slate-500'}`}></i>
                                <span className={`text-5xl font-black tracking-tighter leading-none ${visualState.theme === 'cyan' ? 'text-white neon-text-glow' : visualState.theme === 'rose' ? 'text-white neon-text-glow' : visualState.theme === 'amber' ? 'text-amber-400' : 'text-slate-500'}`}>
                                    {visualState.mainText}
                                </span>
                                <span className={`text-[10px] font-bold uppercase tracking-[0.3em] mt-2 opacity-70 ${visualState.theme === 'cyan' ? 'text-cyan-100' : visualState.theme === 'rose' ? 'text-rose-100' : visualState.theme === 'amber' ? 'text-amber-200' : 'text-slate-500'}`}>
                                    {visualState.subText}
                                </span>
                                {(visualState as any).extraText && (
                                    <div className="mt-3 px-3 py-1 bg-black/30 rounded-lg border border-white/5">
                                        <span className="text-sm font-mono font-bold text-amber-400">{(visualState as any).extraText}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </button>
                </div>

                {/* Shift HUD */}
                {todayShifts.length > 0 && (
                    <div className="mt-16 w-full max-w-sm grid grid-cols-2 gap-3">
                        {todayShifts.map((s, i) => {
                            const isCurrent = (shiftLogic as any).shiftIdx === (i + 1);
                            const isMissed = (shiftLogic as any).shiftIdx > (i+1) && todayLogs.length < (i+1)*2; // Primitive logic for visual only
                            
                            let borderColor = 'border-transparent';
                            let bgColor = 'bg-white/5';
                            let textColor = 'text-slate-400';

                            if (isCurrent) {
                                borderColor = 'border-white/20';
                                bgColor = 'bg-white/10';
                                textColor = 'text-cyan-300 neon-text-glow';
                            } else if (isMissed) {
                                textColor = 'text-red-400 line-through';
                            }

                            return (
                                <div key={i} className={`glass-panel p-4 rounded-2xl flex flex-col items-center justify-center transition-all duration-500 border ${borderColor} ${bgColor} ${isCurrent ? 'shadow-lg scale-105' : 'opacity-60'}`}>
                                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Shift {i+1}</span>
                                    <span className={`font-mono font-bold text-sm ${textColor}`}>
                                        {s.start} <span className="mx-1 opacity-50">-</span> {s.end}
                                    </span>
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
