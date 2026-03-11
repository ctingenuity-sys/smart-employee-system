
import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, getDocs, query, where, Timestamp, serverTimestamp, doc, updateDoc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { AttendanceLog, Schedule, LocationCheckRequest, ActionLog } from '../types';
import Toast from '../components/Toast';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import { calculateShiftStatus } from '../utils/attendanceLogic';
// @ts-ignore
import { onAuthStateChanged } from 'firebase/auth';
import { registerDevice, verifyDevice } from '../utils/webauthn';

const HOSPITAL_LAT = 21.584135549676002;
const HOSPITAL_LNG = 39.208052479784165; 
const ALLOWED_RADIUS_KM = 0.08; 


// --- Helpers ---
const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  var R = 6371; 
  var dLat = deg2rad(lat2-lat1); 
  var dLon = deg2rad(lon2-lon1); 
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}
const deg2rad = (deg: number) => deg * (Math.PI/180);

const convertTo24Hour = (timeStr: string): string => {
    if (!timeStr) return '00:00';
    let s = timeStr.toLowerCase().trim();
    s = s.replace(/(\d+)\.(\d+)/, '$1:$2');
    if (s.includes('mn') || s.includes('midnight') || s === '24:00') return '24:00';
    if (s.includes('noon')) return '12:00';
    let modifier = null;
    if (s.includes('pm') || s.includes('p.m') || s.includes('م') || s.includes('مساء')) modifier = 'pm'; else if (s.includes('am') || s.includes('a.m') || s.includes('ص') || s.includes('صباح')) modifier = 'am';
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

// --- STYLES INJECTION ---
const styles = `
@keyframes float {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-15px); }
    100% { transform: translateY(0px); }
}
@keyframes pulse-ring {
    0% { transform: scale(0.85); opacity: 0; }
    50% { opacity: 0.6; }
    100% { transform: scale(1.4); opacity: 0; }
}
@keyframes rotate-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
@keyframes rotate-reverse {
    from { transform: rotate(360deg); }
    to { transform: rotate(0deg); }
}
@keyframes scan-line {
    0% { top: 0%; opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
}
.animate-float { animation: float 8s ease-in-out infinite; }
.animate-pulse-ring { animation: pulse-ring 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.animate-rotate-slow { animation: rotate-slow 25s linear infinite; }
.animate-rotate-reverse { animation: rotate-reverse 20s linear infinite; }
.animate-scan { animation: scan-line 2.5s ease-in-out infinite; }
.glass-panel {
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.glass-button {
    background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: inset 0 0 20px rgba(255,255,255,0.05), 0 10px 40px rgba(0,0,0,0.5);
}
.neon-text-glow {
    text-shadow: 0 0 15px currentColor, 0 0 30px currentColor;
}
.text-gradient {
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}
`;

// --- MEMOIZED COMPONENTS ---

const DigitalClock = memo(({ date }: { date: Date }) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const dayName = date.toLocaleDateString('en-US', {weekday: 'long'});
    const dateStr = date.toLocaleDateString('en-US', {day: 'numeric', month: 'short', year: 'numeric'});

    return (
        <div className="mb-10 relative flex flex-col items-center z-10 select-none pointer-events-none">
            <div className="flex items-baseline gap-2">
                <span className="text-[5.5rem] md:text-[8rem] font-light tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white/90 to-white/30 drop-shadow-[0_0_30px_rgba(255,255,255,0.2)] tabular-nums font-mono">
                    {hours}<span className="animate-pulse opacity-50">:</span>{minutes}
                </span>
                <span className="text-2xl md:text-3xl font-light text-cyan-400/80 tabular-nums font-mono neon-text-glow ml-2">
                    {seconds}
                </span>
            </div>
            <div className="flex items-center gap-4 mt-1 bg-white/5 px-6 py-2.5 rounded-full backdrop-blur-xl border border-white/10 shadow-[0_0_20px_rgba(0,0,0,0.2)]">
                <span className="text-cyan-400 font-bold uppercase tracking-[0.25em] text-xs">{dayName}</span>
                <span className="w-1.5 h-1.5 bg-white/30 rounded-full"></span>
                <span className="text-slate-300 font-medium text-xs tracking-widest uppercase">{dateStr}</span>
            </div>
        </div>
    );
});

const OFFLINE_PUNCHES_KEY = 'offline_punches';

const saveOfflinePunch = (punchData: any) => {
    const existing = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
    existing.push({
        ...punchData,
        _offlineTimestamp: Date.now()
    });
    localStorage.setItem(OFFLINE_PUNCHES_KEY, JSON.stringify(existing));
};

export const syncOfflinePunches = async () => {
    if (!navigator.onLine) return;
    const existing = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
    if (existing.length === 0) return;

    const successfulSyncs: number[] = [];
    
    for (let i = 0; i < existing.length; i++) {
        const p = existing[i];
        try {
            const payload = { ...p };
            delete payload._offlineTimestamp;
            
            if (payload.clientTimestampMs) {
                payload.clientTimestamp = Timestamp.fromMillis(payload.clientTimestampMs);
                delete payload.clientTimestampMs;
            }
            
            payload.timestamp = serverTimestamp();
            payload.isOfflineSync = true;

            await addDoc(collection(db, 'attendance_logs'), payload);
            successfulSyncs.push(i);
        } catch (e) {
            console.error("Failed to sync offline punch", e);
        }
    }
    
    if (successfulSyncs.length > 0) {
        const remaining = existing.filter((_: any, idx: number) => !successfulSyncs.includes(idx));
        localStorage.setItem(OFFLINE_PUNCHES_KEY, JSON.stringify(remaining));
        window.dispatchEvent(new Event('offline-sync-complete'));
    }
};

const AttendancePage: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    
    // UI State - Initialize IMMEDIATELY to avoid loading state
    const [currentTime, setCurrentTime] = useState<Date | null>(new Date());
    const [logicTicker, setLogicTicker] = useState(0); 
    const [timeOffset, setTimeOffset] = useState<number>(0);
    const [isTimeSynced, setIsTimeSynced] = useState(false);
    const [syncTrigger, setSyncTrigger] = useState(0);
    
    const [status, setStatus] = useState<'IDLE' | 'AUTH_DEVICE' | 'SCANNING_LOC' | 'PROCESSING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [errorDetails, setErrorDetails] = useState<{title: string, msg: string}>({title: '', msg: ''});
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
 
    // Data State
    const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([]);
    const [yesterdayLogs, setYesterdayLogs] = useState<AttendanceLog[]>([]);
    const [todayShifts, setTodayShifts] = useState<{ start: string, end: string }[]>([]);
    const [yesterdayShifts, setYesterdayShifts] = useState<{ start: string, end: string }[]>([]);
    const [tomorrowShifts, setTomorrowShifts] = useState<{ start: string, end: string }[]>([]);
    
    // NEW: Action/Leave State
    const [todayAction, setTodayAction] = useState<string | null>(null);
    const [isSwapShift, setIsSwapShift] = useState(false); // Track if today is a swap
    
    const [activeOverrideId, setActiveOverrideId] = useState<string | null>(null);
    const [overrideExpiry, setOverrideExpiry] = useState<Date | null>(null);
    const [hasOverride, setHasOverride] = useState(false);
    
    const [userProfile, setUserProfile] = useState<any>(null);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [activeLiveCheck, setActiveLiveCheck] = useState<LocationCheckRequest | null>(null);
    const [isLiveCheckProcessing, setIsLiveCheckProcessing] = useState(false);
    
    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || 'User';
    const isProcessingRef = useRef(false);
    const [realUserId, setRealUserId] = useState<string | null>(null);

    // --- Performance Optimization: Cached GPS ---
    // Instead of waiting for GPS on click, we watch it and use the latest value if fresh.
    const [cachedPosition, setCachedPosition] = useState<GeolocationPosition | null>(null);
    const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

    // Initial Startup Optimization
    useEffect(() => {
        // 1. Force logic tick immediately for fast UI
        setLogicTicker(prev => prev + 1);

        // 2. Warm up GPS silently
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setCachedPosition(pos);
                    setGpsAccuracy(pos.coords.accuracy);
                }, 
                (err) => console.log("GPS Warmup:", err), 
                { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
            );
        }
    }, []);

    useEffect(() => {
        let watchId: number;
        if ('geolocation' in navigator) {
            // Warm-up call immediately
            navigator.geolocation.getCurrentPosition(()=>{},()=>{},{timeout: 3000, maximumAge: 0});

            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    setCachedPosition(pos);
                    setGpsAccuracy(pos.coords.accuracy);
                }, 
                (err) => {
                    console.log("GPS Watch Error (non-fatal):", err);
                }, 
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
            );
        }
        return () => {
            if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
        };
    }, []);

    // Manual Refresh GPS Function
    const refreshGPS = () => {
        setCachedPosition(null);
        setGpsAccuracy(null);
        setStatus('SCANNING_LOC');
        
        if (!navigator.geolocation) {
            setToast({msg: 'GPS not supported', type: 'error'});
            setStatus('IDLE');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setCachedPosition(pos);
                setGpsAccuracy(pos.coords.accuracy);
                setStatus('IDLE');
                setToast({ msg: `تم تحديث الإشارة: دقة ${pos.coords.accuracy.toFixed(0)} متر`, type: 'success' });
            },
            (err) => {
                setStatus('ERROR');
                setErrorDetails({ title: 'GPS Failed', msg: err.message });
                setToast({msg: 'فشل تحديث الموقع. تأكد من تفعيل GPS', type: 'error'});
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

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

    // 2. Clock Logic & Override Expiry Check
    useEffect(() => {
        const timer = setInterval(() => {
            const nowMs = Date.now() + timeOffset; // Synced server time
            const now = new Date(nowMs);
            setCurrentTime(now);

            // --- Override Countdown (Strict Server Time Check) ---
            if (overrideExpiry) {
                if (overrideExpiry.getTime() > nowMs) {
                    setHasOverride(true);
                    const diffSeconds = Math.round((overrideExpiry.getTime() - nowMs) / 1000);
                    // Cap display to 30s even if logic is 45s (buffer)
                    const displayedSeconds = Math.min(30, Math.max(0, diffSeconds)); 
                    setTimeLeft(displayedSeconds);
                } else {
                    // Expired
                    setHasOverride(false);
                    setTimeLeft(null);
                    setActiveOverrideId(null);
                    setOverrideExpiry(null);
                }
            } else {
                setHasOverride(false);
                setTimeLeft(null);
            }

            if (now.getSeconds() === 0) {
                setLogicTicker(prev => prev + 1);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [isTimeSynced, timeOffset, overrideExpiry]);


    // 3. Data Subscriptions (DEPEND ON currentTime to refresh when day changes)
    const todayDateKey = useMemo(() => currentTime ? getLocalDateKey(currentTime) : '', [currentTime ? currentTime.getDate() : 0]);

    useEffect(() => {
        if (!currentUserId || !currentTime) return;

        getDoc(doc(db, 'users', currentUserId)).then((docSnap) => {
            if(docSnap.exists()) setUserProfile(docSnap.data());
        });

        // Use todayDateKey to ensure it refreshes if the day changes
        const todayStr = getLocalDateKey(currentTime);
        const qLogs = query(collection(db, 'attendance_logs'), where('userId', '==', currentUserId), where('date', '==', todayStr));
        getDocs(qLogs).then((snap) => {
            const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
            
            // --- ADD OFFLINE PUNCHES TO UI ---
            const offlinePunches = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
            const todayOfflinePunches = offlinePunches
                .filter((p: any) => p.date === todayStr && p.userId === currentUserId)
                .map((p: any) => ({
                    id: 'offline_' + p._offlineTimestamp,
                    ...p,
                    timestamp: { seconds: Math.floor(p.clientTimestampMs / 1000), nanoseconds: 0 },
                    isOfflineSync: true // UI flag
                }));

            const combinedLogs = [...logs, ...todayOfflinePunches];

            // Fix: Sort with safe timestamp check to prevent crash on pending writes
            combinedLogs.sort((a, b) => {
                const tA = a.timestamp?.seconds || a.clientTimestamp?.seconds || 0;
                const tB = b.timestamp?.seconds || b.clientTimestamp?.seconds || 0;
                return tA - tB;
            });
            
            setTodayLogs(combinedLogs);
        }).catch(err => {
            console.warn("Failed to fetch today logs, using offline only", err);
            setTodayLogs(prev => {
                const offlinePunches = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
                const todayOfflinePunches = offlinePunches
                    .filter((p: any) => p.date === todayStr && p.userId === currentUserId)
                    .map((p: any) => ({
                        id: 'offline_' + p._offlineTimestamp,
                        ...p,
                        timestamp: { seconds: Math.floor(p.clientTimestampMs / 1000), nanoseconds: 0 },
                        isOfflineSync: true
                    }));
                
                const onlinePrev = prev.filter(p => !p.id.startsWith('offline_'));
                const combined = [...onlinePrev, ...todayOfflinePunches];
                combined.sort((a, b) => {
                    const tA = a.timestamp?.seconds || a.clientTimestamp?.seconds || 0;
                    const tB = b.timestamp?.seconds || b.clientTimestamp?.seconds || 0;
                    return tA - tB;
                });
                return combined;
            });
        });

        const yesterdayDate = new Date(currentTime);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = getLocalDateKey(yesterdayDate);
        
        const qLogsYesterday = query(collection(db, 'attendance_logs'), where('userId', '==', currentUserId), where('date', '==', yesterdayStr));
        getDocs(qLogsYesterday).then((snap) => {
            const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
            
            // --- ADD OFFLINE PUNCHES TO UI ---
            const offlinePunches = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
            const yesterdayOfflinePunches = offlinePunches
                .filter((p: any) => p.date === yesterdayStr && p.userId === currentUserId)
                .map((p: any) => ({
                    id: 'offline_' + p._offlineTimestamp,
                    ...p,
                    timestamp: { seconds: Math.floor(p.clientTimestampMs / 1000), nanoseconds: 0 },
                    isOfflineSync: true
                }));

            const combinedLogs = [...logs, ...yesterdayOfflinePunches];

            combinedLogs.sort((a, b) => {
                const tA = a.timestamp?.seconds || a.clientTimestamp?.seconds || 0;
                const tB = b.timestamp?.seconds || b.clientTimestamp?.seconds || 0;
                return tA - tB;
            });
            setYesterdayLogs(combinedLogs);
        }).catch(err => {
            console.warn("Failed to fetch yesterday logs, using offline only", err);
            setYesterdayLogs(prev => {
                const offlinePunches = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
                const yesterdayOfflinePunches = offlinePunches
                    .filter((p: any) => p.date === yesterdayStr && p.userId === currentUserId)
                    .map((p: any) => ({
                        id: 'offline_' + p._offlineTimestamp,
                        ...p,
                        timestamp: { seconds: Math.floor(p.clientTimestampMs / 1000), nanoseconds: 0 },
                        isOfflineSync: true
                    }));
                
                const onlinePrev = prev.filter(p => !p.id.startsWith('offline_'));
                const combined = [...onlinePrev, ...yesterdayOfflinePunches];
                combined.sort((a, b) => {
                    const tA = a.timestamp?.seconds || a.clientTimestamp?.seconds || 0;
                    const tB = b.timestamp?.seconds || b.clientTimestamp?.seconds || 0;
                    return tA - tB;
                });
                return combined;
            });
        });

        // OVERRIDE LISTENER (Robust)
        const qOverride = query(collection(db, 'attendance_overrides'), where('userId', '==', currentUserId));
        getDocs(qOverride).then((snap) => {
            // Find any valid override based on server time logic
            // We do the time check in the interval to handle expiration smoothly
            const validDoc = snap.docs.find(d => {
                const data = d.data();
                const expiry = data.validUntil?.toDate();
                if (!expiry) return false;
                // Basic check here, strict check in timer
                return expiry.getTime() > (Date.now() + timeOffset); 
            });

            if (validDoc) {
                setActiveOverrideId(validDoc.id);
                setOverrideExpiry(validDoc.data().validUntil.toDate());
            } else {
                setActiveOverrideId(null);
                setOverrideExpiry(null);
            }
        });

        // NEW: Fetch Actions/Leaves for Today to Lock Attendance
        const qActions = query(collection(db, 'actions'), where('employeeId', '==', currentUserId));
        getDocs(qActions).then((snap) => {
            const actions = snap.docs.map(d => d.data() as ActionLog);
            // Check if any active action covers today
            const active = actions.find(a => a.fromDate <= todayStr && a.toDate >= todayStr);
            
            if (active) {
                // Ignore 'positive' or simple notes, prioritize absence/leave types
                if (['annual_leave', 'sick_leave', 'unjustified_absence', 'justified_absence', 'mission'].includes(active.type)) {
                    setTodayAction(active.type);
                } else {
                    setTodayAction(null);
                }
            } else {
                setTodayAction(null);
            }
        });

        // UPDATED LOGIC: Fetch Previous, Current, AND Next Month to cover all recurring bases
        const currentMonth = currentTime.toISOString().slice(0, 7);
        const prevDate = new Date(currentTime); prevDate.setMonth(prevDate.getMonth() - 1);
        const prevMonth = prevDate.toISOString().slice(0, 7);
        const nextDate = new Date(currentTime); nextDate.setMonth(nextDate.getMonth() + 1);
        const nextMonth = nextDate.toISOString().slice(0, 7);

        const qSch = query(collection(db, 'schedules'), where('userId', '==', currentUserId), where('month', 'in', [prevMonth, currentMonth, nextMonth]));
        getDocs(qSch).then((snap) => setSchedules(snap.docs.map(d => d.data() as Schedule)));
    }, [currentUserId, isTimeSynced, timeOffset, todayDateKey, syncTrigger]); // Depends on todayDateKey to refresh daily


    // 4. Calculate Shifts (OPTIMIZED: only runs when schedules change or day changes)
    useEffect(() => {
        if (!currentTime) return;
        
        // Helper to check if it's a swap shift for UI purposes
        const checkIsSwap = (sch: Schedule | undefined) => {
            if (!sch) return false;
            return (sch.locationId || '').includes('Swap') || (sch.note || '').includes('Swap');
        };

        const getShiftsForDate = (targetDate: Date, setSwapState = false) => {
            const dateStr = getLocalDateKey(targetDate);
            const dayOfWeek = targetDate.getDay();
            
            // --- PRIORITY LOGIC: Exact Date > Specific Range > Recurring ---
            
            // 1. Exact Date (Highest Priority) - Includes Swaps
            const specific = schedules.find(s => s.date === dateStr);
            if (specific) {
                if (setSwapState) setIsSwapShift(checkIsSwap(specific));
                
                // CRITICAL: Handle "Swap Duty - Off" case
                // If I swapped my shift OUT, I should have an entry for this date with "Off" or similar
                if ((specific.locationId || '').includes('Off') || (specific.note || '').includes('Off')) {
                    return []; // Return empty shifts -> OFF DUTY
                }

                return specific.shifts || parseMultiShifts(specific.note || "");
            }

            if (setSwapState) setIsSwapShift(false);

            // 2. Filter all applicable recurring schedules
            const applicable = schedules.filter(sch => {
                if (sch.date) return false; // Already checked

                // Date Range Check
                if (sch.validFrom && dateStr < sch.validFrom) return false;
                if (sch.validTo && dateStr > sch.validTo) return false;

                // Day Type Check
                const isFri = (sch.locationId || '').toLowerCase().includes('friday') || (sch.note || '').toLowerCase().includes('friday');
                
                if (dayOfWeek === 5) {
                    // It is Friday
                    return isFri;
                } else {
                    // It is NOT Friday
                    if (isFri) return false;
                    if ((sch.locationId || '').includes('Holiday')) return false;
                    return true;
                }
            });

            // 3. Sort by Priority
            // Priority 1: Has explicit date range (validFrom/validTo) vs Open ended
            // Priority 2: Newest created
            applicable.sort((a, b) => {
                // Check if one has range and other doesn't
                const aHasRange = !!a.validFrom;
                const bHasRange = !!b.validFrom;
                
                if (aHasRange && !bHasRange) return -1; // a comes first
                if (!aHasRange && bHasRange) return 1;  // b comes first
                
                // If both have range or both don't, use creation time (Newest wins)
                const tA = a.createdAt?.seconds || 0;
                const tB = b.createdAt?.seconds || 0;
                return tB - tA;
            });

            if (applicable.length > 0) {
                const winner = applicable[0];
                return winner.shifts || parseMultiShifts(winner.note || "");
            }

            return [];
        };

        // Today (Enable Swap Check)
        setTodayShifts(getShiftsForDate(currentTime, true));

        // Yesterday
        const yestDate = new Date(currentTime);
        yestDate.setDate(yestDate.getDate() - 1);
        setYesterdayShifts(getShiftsForDate(yestDate));

        // Tomorrow
        const tomDate = new Date(currentTime);
        tomDate.setDate(tomDate.getDate() + 1);
        setTomorrowShifts(getShiftsForDate(tomDate));

    }, [schedules, todayDateKey]); // Key Optimization: Only update shifts if schedules or date changes

    // Use the logic from separate file
    const shiftLogic = useMemo(() => {
        // Pass yesterdayShifts to support overnight logic
        // NEW: Pass todayAction to logic so it returns ON_LEAVE state
        return calculateShiftStatus(currentTime, todayLogs, yesterdayLogs, todayShifts, hasOverride, yesterdayShifts, todayAction);
    }, [todayLogs, yesterdayLogs, todayShifts, yesterdayShifts, hasOverride, logicTicker, currentTime, todayAction]);

    // --- ACTIONS ---
    const playSound = (type: 'success' | 'error' | 'click') => {
        const sounds = {
            success: 'https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3',
            error: 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3',
            click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'
        };
        new Audio(sounds[type]).play().catch(() => {});
    };

    // --- WEBAUTHN DEVICE BINDING LOGIC ---
    // If user has no biometricId: Register
    // If user has biometricId: Verify
    const handleDeviceAuthentication = async (): Promise<string | null> => {
        setStatus('AUTH_DEVICE');
        try {
            if (!userProfile?.biometricId) {
                // 1. REGISTER NEW DEVICE
                // هذا الإجراء سيطلب بصمة الجهاز وينشئ مفتاحاً مرتبطاً بالجهاز حصراً
                const newCredId = await registerDevice(currentUserName);
                
                // Save this Credential ID to Firestore immediately
                await updateDoc(doc(db, 'users', currentUserId!), {
                    biometricId: newCredId,
                    biometricRegisteredAt: Timestamp.now()
                });
                
                return newCredId;
            } else {
                // 2. VERIFY EXISTING DEVICE
                const storedCredId = userProfile.biometricId;
                
                // Check if it's the old "DEV_" format or new "WA_" format
                if (!storedCredId.startsWith('WA_')) {
                    throw new Error("تحديث أمني: يرجى طلب إعادة ضبط البصمة من المشرف لتسجيل جهازك الحالي.");
                }

                // هذا الإجراء يتحقق أن البصمة قادمة من نفس الجهاز المسجل
                const isValid = await verifyDevice(storedCredId);
                if (isValid) {
                    return storedCredId;
                } else {
                    throw new Error("فشل التحقق من البصمة.");
                }
            }
        } catch (error: any) {
            console.error("Device Auth Failed", error);
            throw error;
        }
    };

    const handlePunch = async () => {
        if (activeLiveCheck) {
            handleLiveCheck();
            return;
        }

        if (isProcessingRef.current || !shiftLogic.canPunch) return;

        isProcessingRef.current = true; 
        playSound('click');
        setErrorDetails({title:'', msg:''});

        const releaseLock = (delay = 2000) => {
            setTimeout(() => {
                isProcessingRef.current = false;
            }, delay);
        };

        if (!navigator.onLine && !userProfile?.biometricId) {
            setStatus('ERROR');
            setErrorDetails({ title: 'No Internet', msg: 'Internet required for first-time device registration.' });
            playSound('error');
            releaseLock(); 
            return;
        }

        try {
            // 1. Authenticate Device (WebAuthn)
            // Skip check ONLY if Override is active
            let credentialUsed = 'OVERRIDE';
            if (!hasOverride) {
                // سيظهر للمستخدم طلب "Passkey" (وهو طلب البصمة)
                // إذا لم يكن مسجلاً، سيطلب التسجيل.
                // إذا كان مسجلاً، سيطلب التأكيد.
                credentialUsed = await handleDeviceAuthentication() || 'UNKNOWN';
            }

            // 2. Get GPS (FAST MODE: Use Cached if Fresh)
            setStatus('SCANNING_LOC');

            if (!navigator.geolocation) {
                throw new Error('GPS not supported');
            }

            // --- OPTIMIZATION: Check Cached GPS First ---
            // If we have a cached position younger than 30 seconds, USE IT!
            let positionToUse: GeolocationPosition | null = null;
            
            if (cachedPosition && (Date.now() - cachedPosition.timestamp < 30000) && cachedPosition.coords.accuracy < 100) {
                console.log("Using Cached Position (Speed Boost 🚀)");
                positionToUse = cachedPosition;
            }

            const processPosition = async (pos: GeolocationPosition) => {
                try {
                    const { latitude, longitude, accuracy } = pos.coords;
                    // @ts-ignore
                    const isMocked = pos.coords.mocked || false; 

                    const deviceTime = Date.now();
                    const serverTimeFromOffset = deviceTime + timeOffset;
                    const timeDiffMinutes = Math.abs(deviceTime - serverTimeFromOffset) / (1000 * 60);
                    
                    let isSuspicious = false;
                    let violationType = '';

                    if (timeDiffMinutes > 5) { 
                        isSuspicious = true;
                        violationType = 'MANUAL_TIME_CHANGE';
                    }

                    if (isMocked) {
                        isSuspicious = true;
                        violationType = 'MOCK_LOCATION_DETECTED';
                    }

                    const dist = getDistanceFromLatLonInKm(latitude, longitude, HOSPITAL_LAT, HOSPITAL_LNG);

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
                    
                    const currentShiftIdx = (shiftLogic as any).shiftIdx || 1;

                    // --- ADD LOG ---
                    const payload = {
                        userId: currentUserId,
                        userName: currentUserName,
                        type: nextType,
                        date: localDateStr,
                        locationLat: latitude,
                        locationLng: longitude,
                        distanceKm: dist,
                        accuracy: accuracy,
                        deviceInfo: navigator.userAgent,
                        deviceId: credentialUsed, // Store the WebAuthn Credential ID
                        status: isSuspicious ? 'flagged' : 'verified', 
                        shiftIndex: currentShiftIdx, 
                        isSuspicious: isSuspicious, 
                        violationType: violationType 
                    };

                    if (!navigator.onLine) {
                        const payloadWithTime = {
                            ...payload,
                            clientTimestampMs: Date.now()
                        };
                        saveOfflinePunch(payloadWithTime);
                        
                        // Trigger re-fetch to update UI immediately
                        setSyncTrigger(prev => prev + 1);
                        
                        setStatus('SUCCESS');
                        setErrorDetails({ title: 'Offline Punch Saved', msg: 'Will sync when online.' });
                    } else {
                        await addDoc(collection(db, 'attendance_logs'), {
                            ...payload,
                            timestamp: serverTimestamp(),
                            clientTimestamp: Timestamp.now()
                        });
                        setStatus('SUCCESS');
                    }

                    // --- CONSUME OVERRIDE (One Time Use) ---
                    if (hasOverride && activeOverrideId && navigator.onLine) {
                        await deleteDoc(doc(db, 'attendance_overrides', activeOverrideId));
                        // Optimistically clear local state
                        setHasOverride(false);
                        setTimeLeft(null);
                        setActiveOverrideId(null);
                        setOverrideExpiry(null);
                    }

                    playSound('success');
                    if (navigator.vibrate) navigator.vibrate([100]);
                    
                    setTimeout(() => setStatus('IDLE'), 2000);
                    releaseLock(3000); 

                } catch (innerError: any) {
                    console.error(innerError);
                    setStatus('ERROR');
                    setErrorDetails({ title: 'Process Error', msg: innerError.message });
                    releaseLock();
                }
            };

            if (positionToUse) {
                // Instant punch path
                await processPosition(positionToUse);
            } else {
                // Fallback to fetch (slower)
                navigator.geolocation.getCurrentPosition(
                    processPosition,
                    (err) => {
                        let errorMsg = "حدث خطأ في تحديد الموقع";
                        if (err.code === 1) errorMsg = "يرجى تفعيل صلاحية الموقع للمتصفح";
                        if (err.code === 2) errorMsg = "إشارة الـ GPS ضعيفة جداً";
                        if (err.code === 3) errorMsg = "استغرق تحديد الموقع وقتاً طويلاً";
                        setStatus('ERROR');
                        setErrorDetails({ title: 'GPS Failed', msg: errorMsg });
                        playSound('error');
                        setTimeout(() => setStatus('IDLE'), 3000);
                        releaseLock();
                    },
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                );
            }

        } catch (e: any) {
            setStatus('ERROR');
            // تحسين رسالة الخطأ للمستخدم
            let userMsg = e.message || "Unknown error";
            if (userMsg.includes("NotAllowedError") || userMsg.includes("cancelled")) {
                userMsg = "تم إلغاء المصادقة. يرجى تأكيد البصمة.";
            } else if (userMsg.includes("InvalidStateError")) {
                userMsg = "الجهاز غير مطابق. يرجى استخدام الجهاز المسجل.";
            }
            
            setErrorDetails({ title: 'Auth Failed', msg: userMsg });
            playSound('error');
            releaseLock();
        }
    };

    // --- LIVE CHECK LISTENER ---
    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, (user: any) => {
            if (user) {
                setRealUserId(user.uid);
            } else {
                setRealUserId(null);
            }
        });
        return () => unsubAuth();
    }, []);

    useEffect(() => {
        const handleOnline = () => {
            syncOfflinePunches();
        };
        const handleSyncComplete = () => {
            setSyncTrigger(prev => prev + 1);
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline-sync-complete', handleSyncComplete);
        
        // Also try syncing on mount in case we are already online
        syncOfflinePunches();
        
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline-sync-complete', handleSyncComplete);
        };
    }, []);

    useEffect(() => {
        if (!realUserId) return;

        const qLiveCheck = query(
            collection(db, 'location_checks'), 
            where('targetUserId', '==', realUserId), 
            where('status', '==', 'pending')
        );

        getDocs(qLiveCheck).then(async (snap) => {
            if (!snap.empty) {
                const docRef = snap.docs[0];
                const docData = docRef.data();
                const req = { id: docRef.id, ...docData } as LocationCheckRequest;
                
                setActiveLiveCheck(req);
                new Audio('https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3').play().catch(()=>{});
            } else {
                setActiveLiveCheck(null);
            }
        });

        return () => {};
    }, [realUserId]);

    const handleLiveCheck = async () => {
        if(!activeLiveCheck) return;
        setIsLiveCheckProcessing(true);
        setStatus('SCANNING_LOC');

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                await updateDoc(doc(db, 'location_checks', activeLiveCheck.id), {
                    status: 'completed',
                    userName: currentUserName,
                    locationLat: pos.coords.latitude,
                    locationLng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    completedAt: serverTimestamp(),
                    deviceId: 'LIVE_CHECK'
                });
                
                setToast({msg: 'تم إرسال الموقع بنجاح ✅', type: 'success'});
                setActiveLiveCheck(null);
                setIsLiveCheckProcessing(false);
                setStatus('SUCCESS');
                setTimeout(() => setStatus('IDLE'), 2000);
            },
            async (err) => {
                setToast({msg: 'فشل تحديد الموقع، حاول مرة أخرى', type: 'error'});
                setIsLiveCheckProcessing(false);
                setStatus('IDLE');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    // --- VISUAL CONFIGURATION ---
    const visualState = useMemo(() => {
        if (activeLiveCheck) {
            return {
                theme: 'rose',
                mainText: isLiveCheckProcessing ? 'SENDING...' : 'CONFIRM LOCATION',
                subText: 'Supervisor Requested',
                icon: 'fa-map-marker-alt',
                ringClass: 'border-red-500 shadow-[0_0_80px_rgba(239,68,68,0.6)] animate-pulse-ring',
                btnClass: 'bg-red-600 text-white hover:bg-red-700 animate-pulse',
                pulse: true
            };
        }

        // Logic Override for "OFF DUTY" -> Show Next Shift
        if (shiftLogic.state === 'OFF' && tomorrowShifts.length > 0) {
            const nextShift = tomorrowShifts[0];
            return {
                theme: 'sky',
                mainText: 'NEXT SHIFT',
                subText: `Tomorrow ${nextShift.start}`,
                icon: 'fa-calendar-day',
                ringClass: 'border-sky-500/20 shadow-[0_0_50px_rgba(56,189,248,0.1)]',
                btnClass: 'bg-sky-900/10 text-sky-500',
                pulse: false
            };
        }

        // NEW: Specific Handling for Leave State (Robust Check)
        if (shiftLogic.state === 'ON_LEAVE') {
            const colorStr = shiftLogic.color || '';
            const isRed = colorStr.includes('red') || colorStr.includes('rose');
            
            return {
                theme: isRed ? 'rose' : 'purple',
                mainText: shiftLogic.message,
                subText: shiftLogic.sub,
                icon: 'fa-umbrella-beach',
                ringClass: `border-${isRed ? 'red' : 'purple'}-500/20 shadow-[0_0_50px_rgba(200,200,200,0.1)]`,
                btnClass: `${colorStr || 'bg-purple-900/40 text-purple-400'} cursor-not-allowed`,
                pulse: false
            };
        }

        const isBreak = (shiftLogic as any).isBreak;
        
        if (!shiftLogic.canPunch) {
            if (shiftLogic.state === 'MISSED_OUT') {
                return {
                    theme: 'rose',
                    mainText: 'MISSED OUT',
                    subText: shiftLogic.sub,
                    icon: 'fa-user-clock',
                    ringClass: 'border-rose-500/20 shadow-[0_0_50px_rgba(244,63,94,0.1)]',
                    btnClass: 'bg-rose-900/10 text-rose-500 animate-pulse',
                    pulse: true
                };
            }
            if (shiftLogic.state === 'NEXT_SHIFT') {
                return {
                    theme: 'slate',
                    mainText: 'NEXT SHIFT',
                    subText: shiftLogic.sub,
                    icon: 'fa-moon',
                    ringClass: 'border-slate-500/20 shadow-[0_0_50px_rgba(100,116,139,0.1)]',
                    btnClass: 'bg-slate-900/10 text-slate-500',
                    pulse: false
                };
            }
            if (shiftLogic.state === 'ABSENT') {
                return {
                    theme: 'rose', 
                    mainText: 'ABSENT', 
                    subText: shiftLogic.sub,
                    icon: 'fa-user-slash',
                    ringClass: 'border-rose-500/20 shadow-[0_0_50px_rgba(244,63,94,0.1)]',
                    btnClass: 'bg-rose-900/10 text-rose-500',
                    pulse: false
                };
            }
            if (shiftLogic.state === 'COMPLETED') {
                return {
                    theme: 'emerald',
                    mainText: shiftLogic.message, 
                    subText: shiftLogic.sub,
                    icon: 'fa-check-circle',
                    ringClass: 'border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.1)]',
                    btnClass: 'bg-emerald-900/10 text-emerald-500',
                    pulse: false
                };
            }
            if (isBreak || shiftLogic.state === 'WAITING') {
                return {
                    theme: 'amber',
                    mainText: shiftLogic.state === 'WAITING' ? 'WAITING' : 'BREAK',
                    subText: shiftLogic.sub,
                    extraText: (shiftLogic as any).timeRemaining,
                    icon: 'fa-coffee',
                    ringClass: 'border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.1)]',
                    btnClass: 'bg-amber-900/10 text-amber-500',
                    pulse: true 
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
            mainText: shiftLogic.message,
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
    }, [shiftLogic, activeLiveCheck, isLiveCheckProcessing, tomorrowShifts]);

    const radius = 140;
    const circumference = 2 * Math.PI * radius;
    const displayTime = currentTime || new Date();
    const strokeDashoffset = circumference - ((displayTime.getSeconds()) / 60) * circumference;

    return (
        <div className="min-h-screen bg-[#030712] text-white font-sans flex flex-col relative overflow-hidden selection:bg-cyan-500/30" dir={dir}>
            <style>{styles}</style>
            
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {/* Immersive Atmospheric Background */}
                <div className={`absolute top-[-20%] left-[-10%] w-[80vw] h-[80vw] rounded-full mix-blend-screen filter blur-[140px] opacity-20 animate-float transition-colors duration-[3000ms]
                    ${visualState.theme === 'cyan' ? 'bg-cyan-600' : visualState.theme === 'rose' ? 'bg-rose-600' : visualState.theme === 'amber' ? 'bg-amber-600' : visualState.theme === 'purple' ? 'bg-purple-600' : 'bg-slate-800'}`}>
                </div>
                <div className={`absolute bottom-[-20%] right-[-10%] w-[70vw] h-[70vw] rounded-full mix-blend-screen filter blur-[120px] opacity-15 animate-float transition-colors duration-[3000ms] delay-1000
                    ${visualState.theme === 'cyan' ? 'bg-blue-600' : visualState.theme === 'rose' ? 'bg-orange-600' : 'bg-slate-700'}`}>
                </div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div className="relative z-30 flex justify-between items-center p-6 glass-panel border-b border-white/5 shadow-none bg-transparent">
                <button onClick={() => navigate('/user')} className="group flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all backdrop-blur-xl shadow-lg">
                    <i className="fas fa-chevron-left text-white/70 group-hover:text-white transition-colors rtl:rotate-180"></i>
                    <span className="text-[11px] font-bold text-white/80 group-hover:text-white uppercase tracking-[0.15em]">Dashboard</span>
                </button>
                
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <h2 className="text-sm font-bold text-white/90 tracking-wide">{currentUserName}</h2>
                        <div className="flex items-center justify-end gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${navigator.onLine && isTimeSynced ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-rose-500 animate-pulse shadow-[0_0_10px_#f43f5e]'}`}></div>
                            <span className={`text-[10px] font-mono tracking-widest uppercase ${navigator.onLine && isTimeSynced ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>{isTimeSynced ? 'ONLINE' : 'SYNCING'}</span>
                        </div>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-lg font-bold shadow-xl text-white backdrop-blur-md">
                        {currentUserName.charAt(0)}
                    </div>
                </div>
            </div>

            {/* VISUAL SHIFT INDICATOR */}
            {todayShifts.length > 0 && (
                <div className="relative z-30 flex justify-center -mt-5 mb-4">
                    <div className={`backdrop-blur-xl px-5 py-2 rounded-full border flex items-center gap-3 shadow-2xl ${isSwapShift ? 'bg-purple-900/40 border-purple-500/30' : 'bg-slate-900/60 border-white/10'}`}>
                        <span className={`w-2 h-2 rounded-full animate-pulse ${isSwapShift ? 'bg-purple-400 shadow-[0_0_8px_#c084fc]' : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'}`}></span>
                        <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isSwapShift ? 'text-purple-300' : 'text-emerald-300'}`}>
                            {isSwapShift ? 'SWAP SHIFT: ' : "Today's Shift: "} <span className="text-white/90 ml-1">{todayShifts.map(s => `${s.start}-${s.end}`).join(', ')}</span>
                        </span>
                    </div>
                </div>
            )}

          {hasOverride && timeLeft !== null && (
            <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-[280px] transition-all duration-500 ${timeLeft <= 10 ? 'scale-110' : 'scale-100'}`}>
                <div className={`
                    flex items-center justify-center gap-3 px-6 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl transition-colors duration-300
                    ${timeLeft <= 10 
                        ? 'bg-red-600/90 border-red-400 animate-shake' 
                        : 'bg-orange-600/80 border-white/20 animate-bounce'
                    } text-white`}
                >
                    <i className={`fas ${timeLeft <= 10 ? 'fa-triangle-exclamation' : 'fa-clock-rotate-left'} text-xl`}></i>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-black tracking-widest opacity-80 leading-none">
                            {timeLeft <= 10 ? 'Hurry Up!' : 'Override Active'}
                        </span>
                        <span className="text-lg font-black tabular-nums leading-none mt-1">
                            Window: <span className="underline decoration-2 underline-offset-4">{timeLeft}s</span>
                        </span>
                    </div>
                </div>
            </div>
        )}
            <div className="flex-1 flex flex-col items-center justify-center relative z-20 px-4 pb-24">
                
                {currentTime && <DigitalClock date={currentTime} />}

                {/* GPS Status & Refresh Button */}
                <div className="mb-6 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 bg-white/5 rounded-full px-4 py-1.5 border border-white/5 backdrop-blur-sm">
                        <div className={`w-2 h-2 rounded-full ${gpsAccuracy && gpsAccuracy < 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                        <span className="text-[10px] text-white/70 font-bold uppercase tracking-wide">
                            GPS ACCURACY: {gpsAccuracy ? `~${gpsAccuracy.toFixed(0)}m` : 'Scanning...'}
                        </span>
                    </div>
                    <button 
                        onClick={refreshGPS}
                        disabled={status === 'SCANNING_LOC'}
                        className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 uppercase tracking-widest flex items-center gap-2 px-3 py-1 hover:bg-white/5 rounded-full transition-all"
                    >
                        <i className={`fas fa-sync-alt ${status === 'SCANNING_LOC' ? 'animate-spin' : ''}`}></i>
                        تحديث الموقع (Refresh GPS)
                    </button>
                </div>

<div className="relative group scale-90 md:scale-100 transition-transform duration-700 flex items-center justify-center mt-4">
    
    {/* High-Tech Outer Rings */}
    <div className="absolute inset-[-60px] border border-dashed border-white/10 rounded-full animate-rotate-slow pointer-events-none opacity-50"></div>
    <div className="absolute inset-[-40px] border border-solid border-white/5 rounded-full animate-rotate-reverse pointer-events-none opacity-70"></div>
    <div className={`absolute w-[360px] h-[360px] rounded-full border-[3px] ${visualState.ringClass} transition-all duration-1000 pointer-events-none opacity-80`}></div>
    
    {/* SVG Progress Circle */}
    <svg 
        viewBox="0 0 360 360" 
        className="absolute w-[360px] h-[360px] -rotate-90 pointer-events-none z-10 overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle
            cx="180"
            cy="180"
            r={radius}
            stroke="currentColor"
            strokeWidth="4"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`transition-all duration-1000 ease-linear drop-shadow-[0_0_15px_currentColor] ${
                visualState.theme === 'cyan' ? 'text-cyan-400' : 
                visualState.theme === 'rose' ? 'text-rose-500' : 
                visualState.theme === 'amber' ? 'text-amber-500' : 
                visualState.theme === 'purple' ? 'text-purple-500' : 
                visualState.theme === 'sky' ? 'text-sky-400' : 'text-slate-600'
            }`}
        />
    </svg>

    <div className="relative z-20">
       <button
            onClick={handlePunch}
            disabled={status !== 'IDLE' && status !== 'ERROR' && !activeLiveCheck && !shiftLogic.canPunch}
            className={`
                relative w-[280px] h-[280px] rounded-full flex flex-col items-center justify-center 
                transition-all duration-500 transform active:scale-[0.97] overflow-hidden
                ${visualState.theme === 'rose' && status === 'ERROR' ? 'bg-red-950/60 text-red-400 border-red-500/50' : visualState.btnClass} 
                glass-button border-[3px]
                ${(status !== 'IDLE' && status !== 'ERROR' && !activeLiveCheck && !shiftLogic.canPunch) ? 'opacity-80 cursor-not-allowed grayscale-[30%]' : 'hover:shadow-[0_0_60px_rgba(255,255,255,0.1)]'}
            `}
        >
            {/* Scanning Line Animation */}
            {(status === 'SCANNING_LOC' || status === 'PROCESSING') && (
                <div className="absolute left-0 w-full h-1 bg-cyan-400/80 shadow-[0_0_20px_#22d3ee] animate-scan z-0"></div>
            )}

            <i className={`fas ${status === 'ERROR' ? 'fa-exclamation-triangle' : visualState.icon} text-6xl mb-5 neon-text-glow z-10 ${status === 'IDLE' && shiftLogic.canPunch ? 'animate-breathe' : ''}`}></i>
            
            <span className="text-3xl font-black tracking-tighter uppercase leading-none text-center px-4 z-10 drop-shadow-lg">
                {status === 'IDLE' ? visualState.mainText : 
                status === 'ERROR' ? errorDetails.title : 
                status} 
            </span>

            <span className="text-[11px] mt-3 font-bold tracking-[0.25em] opacity-70 uppercase text-center px-6 z-10">
                {status === 'ERROR' ? errorDetails.msg : visualState.subText}
            </span>
        </button>
    </div>
</div>

{todayShifts.length > 0 && (
    <div className="mt-10 w-full max-w-2xl flex flex-col gap-6 px-4">
        {todayShifts.map((s, i) => {
            const isCurrent = (shiftLogic as any).shiftIdx === (i + 1);
            const isMissed = (shiftLogic as any).shiftIdx > (i + 1) && todayLogs.length < (i + 1) * 2; 
            
            const startH = parseInt(s.start.split(':')[0]);
            const endH = parseInt(s.end.split(':')[0]);
            const isOvernight = endH < startH;

            let borderColor = 'border-white/10';
            let bgColor = 'bg-white/5';
            let textColor = 'text-white/90';

            if (isCurrent) {
                borderColor = isSwapShift ? 'border-purple-500/40' : 'border-cyan-500/40';
                bgColor = isSwapShift ? 'bg-purple-500/10' : 'bg-cyan-500/10';
                textColor = isSwapShift ? 'text-purple-300 neon-text-glow' : 'text-cyan-300 neon-text-glow';
            } else if (isMissed) {
                textColor = 'text-red-400/50 line-through';
            }

            return (
                <div 
                    key={i} 
                    className={`glass-panel p-6 rounded-3xl flex flex-col gap-4 transition-all duration-500 border border-white/10 ${bgColor} ${isCurrent ? 'shadow-[0_10px_40px_rgba(0,0,0,0.5)] scale-[1.02] ring-1 ring-white/20' : 'opacity-60 hover:opacity-100'}`}
                >
                    <div className="flex justify-between items-center border-b border-white/10 pb-3">
                        <span className="text-[11px] font-black text-white/40 uppercase tracking-[0.3em]">
                            Shift {i + 1} {isOvernight ? '(OVERNIGHT)' : ''}
                        </span>
                        {isCurrent && (
                            <span className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full font-bold shadow-lg ${isSwapShift ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full animate-ping ${isSwapShift ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                                {isSwapShift ? 'SWAP ACTIVE' : 'ACTIVE NOW'}
                            </span>
                        )}
                    </div>

                    <div className={`flex justify-between items-center ${textColor}`}>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-white/30 mb-1 uppercase tracking-widest">Start</span>
                            <span className="text-3xl md:text-4xl font-light font-mono tracking-tighter">
                                {s.start}
                            </span>
                        </div>

                        <div className="flex-grow mx-8 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent relative">
                            {isCurrent && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee]"></div>}
                        </div>

                        <div className="flex flex-col items-end">
                            <span className="text-[10px] text-white/30 mb-1 uppercase tracking-widest">End</span>
                            <span className="text-3xl md:text-4xl font-light font-mono tracking-tighter">
                                {s.end}
                            </span>
                            {isOvernight && <span className="text-[9px] text-white/40 mt-1 uppercase tracking-widest">+1 Day</span>}
                        </div>
                    </div>
                </div>
            )
        })}
    </div>
)}
            </div>

            <div className={`fixed bottom-0 left-0 right-0 glass-panel border-t border-white/10 transition-transform duration-700 ease-in-out z-40 flex flex-col rounded-t-[2.5rem] shadow-[0_-20px_80px_rgba(0,0,0,0.8)] backdrop-blur-3xl ${showHistory ? 'translate-y-0 h-[80vh]' : 'translate-y-[calc(100%-90px)] h-[80vh]'}`}>
                <div 
                    onClick={() => setShowHistory(!showHistory)}
                    className="w-full h-[90px] flex flex-col items-center justify-start pt-5 cursor-pointer relative group"
                >
                    <div className="w-16 h-1.5 rounded-full bg-white/20 group-hover:bg-white/50 transition-colors mb-3 shadow-[0_0_10px_rgba(255,255,255,0.1)]"></div>
                    <span className="text-[10px] font-bold text-white/50 uppercase tracking-[0.3em] group-hover:text-white/90 transition-colors">
                        {showHistory ? 'Close History' : 'Pull for History'}
                    </span>
                </div>
                
                <div className="flex-1 overflow-y-auto px-6 pb-8 space-y-4 custom-scrollbar-dark bg-gradient-to-b from-transparent to-black/40">
                    <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.4em] mb-6 pl-2">Today's Activity</h3>
                    {todayLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-white/20 glass-panel rounded-3xl border border-white/5">
                            <i className="far fa-clock text-4xl mb-4 opacity-40"></i>
                            <p className="text-xs font-bold uppercase tracking-widest">No Activity Yet</p>
                        </div>
                    ) : (
                        todayLogs.map((log, idx) => (
                            <div key={log.id} className={`flex items-center justify-between bg-white/5 p-5 rounded-3xl border ${log.isSuspicious ? 'border-red-500/50 bg-red-900/10 shadow-[0_0_20px_rgba(220,38,38,0.1)]' : 'border-white/5'} hover:bg-white/10 transition-all group`}>
                                <div className="flex items-center gap-5">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner ${log.type === 'IN' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                                        <i className={`fas ${log.type === 'IN' ? 'fa-sign-in-alt' : 'fa-sign-out-alt'}`}></i>
                                    </div>
                                    <div>
                                        <p className={`font-bold text-sm uppercase tracking-widest ${log.type === 'IN' ? 'text-cyan-100' : 'text-rose-100'}`}>{log.type === 'IN' ? 'Check In' : 'Check Out'}</p>
                                        <p className="text-[10px] text-white/40 font-mono mt-1 uppercase tracking-widest">Shift {log.shiftIndex || 1} <span className="mx-1 opacity-50">•</span> Seq #{idx+1}</p>
                                        {log.isSuspicious && <p className="text-[9px] text-red-400 font-bold mt-1.5 uppercase tracking-[0.2em] bg-red-500/10 inline-block px-2 py-0.5 rounded-full">⚠️ {log.violationType || 'SUSPICIOUS'}</p>}
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <p className="font-mono font-light text-white text-2xl tracking-tighter">
                                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false}) : '--:--'}
                                    </p>
                                    <div className={`flex items-center justify-end gap-1.5 mt-1.5 px-2 py-0.5 rounded-full ${log.isOfflineSync ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                        <i className={`fas ${log.isOfflineSync ? 'fa-wifi text-[8px]' : 'fa-check text-[8px]'}`}></i>
                                        <span className="text-[9px] font-bold uppercase tracking-widest">{log.isOfflineSync ? 'Offline' : 'Synced'}</span>
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
