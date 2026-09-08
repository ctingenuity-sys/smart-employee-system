
import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, getDocs, query, where, Timestamp, serverTimestamp, doc, updateDoc, setDoc, getDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
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
    50% { transform: translateY(-8px); }
    100% { transform: translateY(0px); }
}
@keyframes pulse-ring {
    0% { transform: scale(0.92); opacity: 0; }
    50% { opacity: 0.5; }
    100% { transform: scale(1.28); opacity: 0; }
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
    15% { opacity: 1; }
    85% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
}
@keyframes breathe {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 10px currentColor); }
    50% { transform: scale(1.06); filter: drop-shadow(0 0 22px currentColor); }
}
.animate-float { animation: float 8s ease-in-out infinite; }
.animate-pulse-ring { animation: pulse-ring 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.animate-rotate-slow { animation: rotate-slow 28s linear infinite; }
.animate-rotate-reverse { animation: rotate-reverse 22s linear infinite; }
.animate-scan { animation: scan-line 2s ease-in-out infinite; }
.animate-breathe { animation: breathe 3s ease-in-out infinite; }
.glass-panel {
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.glass-button {
    background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 100%);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow: inset 0 0 24px rgba(255,255,255,0.06), 0 10px 40px rgba(0,0,0,0.5);
}
.neon-text-glow {
    text-shadow: 0 0 12px currentColor, 0 0 24px currentColor;
}
.custom-scrollbar-dark::-webkit-scrollbar {
    width: 5px;
}
.custom-scrollbar-dark::-webkit-scrollbar-track {
    background: rgba(0,0,0,0.2);
}
.custom-scrollbar-dark::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.15);
    border-radius: 9999px;
}
`;

// --- MEMOIZED COMPONENTS ---

const DigitalClock = memo(({ date }: { date: Date }) => {
    const { language } = useLanguage();
    let h = date.getHours();
    const isPM = h >= 12;
    const ampmEn = isPM ? 'PM' : 'AM';
    const ampmAr = isPM ? 'م' : 'ص';
    h = h % 12;
    h = h ? h : 12; 
    const hours = h.toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const isAr = language === 'ar';
    const dayName = date.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { weekday: 'long' });
    const dayNameEn = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = date.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });

    return (
        <div className="relative flex flex-col items-center select-none pointer-events-none mb-1">
            <div className="flex items-baseline justify-center gap-2 sm:gap-3">
                <span className="text-5xl sm:text-6xl md:text-7xl font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white/95 to-white/40 drop-shadow-[0_0_30px_rgba(255,255,255,0.25)] tabular-nums leading-none">
                    {hours}<span className="animate-pulse opacity-40 mx-0.5">:</span>{minutes}
                </span>
                <div className="flex flex-col items-start leading-none">
                    <span className="text-base sm:text-xl md:text-2xl font-black text-cyan-400 tracking-wider neon-text-glow">
                        {isAr ? (
                            <>{ampmAr} <span className="text-[10px] sm:text-xs font-mono text-cyan-300/60 font-normal">({ampmEn})</span></>
                        ) : (
                            ampmEn
                        )}
                    </span>
                    <span className="text-xs sm:text-sm font-medium text-white/50 tabular-nums font-mono mt-1">
                        :{seconds}
                    </span>
                </div>
            </div>
            
            <div className="flex items-center gap-2 mt-2 bg-white/5 px-3.5 py-1 rounded-full backdrop-blur-xl border border-white/10 shadow-lg text-[11px] sm:text-xs">
                <span className="text-cyan-400 font-bold">{dayName}</span>
                <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                <span className="text-white/80 font-medium">{dateStr}</span>
                {isAr && (
                    <>
                        <span className="w-1 h-1 bg-white/30 rounded-full hidden sm:inline-block"></span>
                        <span className="text-white/40 font-mono hidden sm:inline-block uppercase text-[10px]">{dayNameEn}</span>
                    </>
                )}
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

let isSyncing = false;

export const syncOfflinePunches = async () => {
    if (!navigator.onLine || isSyncing) return;
    const existing = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
    if (existing.length === 0) return;

    isSyncing = true;
    const successfulSyncs: number[] = [];
    
    try {
        // 1. Get real time to validate device time
        let realTimeMs = Date.now();
        try {
            const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            if (response.ok) {
                const data = await response.json();
                realTimeMs = new Date(data.datetime).getTime();
            }
        } catch (e) {
            console.warn("Could not fetch real time, trusting device time");
        }

        const currentDeviceTime = Date.now();
        const timeDiffMinutes = Math.abs(currentDeviceTime - realTimeMs) / (1000 * 60);
        const isDeviceTimeManipulated = timeDiffMinutes > 5;

        for (let i = 0; i < existing.length; i++) {
            const p = existing[i];
            try {
                // If device time is manipulated, reject the punch
                if (isDeviceTimeManipulated) {
                    console.warn("Offline punch rejected due to time manipulation");
                    successfulSyncs.push(i);
                    window.dispatchEvent(new CustomEvent('offline-sync-rejected', { 
                        detail: 'تم إلغاء بصمة أوفلاين بسبب تلاعب في وقت الجهاز' 
                    }));
                    continue;
                }

                const payload = { ...p };
                const offlineId = payload._offlineTimestamp;
                delete payload._offlineTimestamp;
                
                if (payload.clientTimestampMs) {
                    payload.clientTimestamp = Timestamp.fromMillis(payload.clientTimestampMs);
                    // Set the main timestamp to the offline punch time!
                    payload.timestamp = Timestamp.fromMillis(payload.clientTimestampMs);
                    delete payload.clientTimestampMs;
                } else {
                    payload.timestamp = serverTimestamp();
                }
                
                payload.isOfflineSync = true;
                payload.offlineId = offlineId; // Add this for reliable deduplication
                payload.syncedAt = serverTimestamp(); // Track when it was actually synced

                await addDoc(collection(db, 'attendance_logs'), payload);
                successfulSyncs.push(i);
            } catch (e) {
                console.error("Failed to sync offline punch", e);
            }
        }
    } finally {
        isSyncing = false;
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
    const [drawerTab, setDrawerTab] = useState<'punches' | 'shifts'>('punches');
    const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
        try {
            return localStorage.getItem('punch_sound_enabled') !== 'false';
        } catch {
            return true;
        }
    });
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

    // Live distance from hospital geofence in meters
    const hospitalDistanceMeters = useMemo(() => {
        if (!cachedPosition) return null;
        const dKm = getDistanceFromLatLonInKm(
            cachedPosition.coords.latitude,
            cachedPosition.coords.longitude,
            HOSPITAL_LAT,
            HOSPITAL_LNG
        );
        return Math.round(dKm * 1000);
    }, [cachedPosition]);

    const isWithinHospitalRange = useMemo(() => {
        if (hospitalDistanceMeters === null) return null;
        return hospitalDistanceMeters <= (ALLOWED_RADIUS_KM * 1000);
    }, [hospitalDistanceMeters]);

    const toggleSound = () => {
        setSoundEnabled(prev => {
            const next = !prev;
            try { localStorage.setItem('punch_sound_enabled', String(next)); } catch (e) {}
            return next;
        });
    };

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
            setToast({msg: t('att.gps.unsupported'), type: 'error'});
            setStatus('IDLE');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setCachedPosition(pos);
                setGpsAccuracy(pos.coords.accuracy);
                setStatus('IDLE');
                setToast({ msg: t(`att.toast.gpsUpdated|acc:${pos.coords.accuracy.toFixed(0)}`), type: 'success' });
            },
            (err) => {
                setStatus('ERROR');
                setErrorDetails({ title: 'GPS Failed', msg: err.message });
                setToast({msg: t('att.toast.gpsFailed'), type: 'error'});
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
        const unsubLogs = onSnapshot(qLogs, (snap) => {
            const logs = snap.docs.map(d => ({ ...d.data(), id: d.id } as AttendanceLog));
            
            // --- ADD OFFLINE PUNCHES TO UI ---
            const offlinePunches = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
            const todayOfflinePunches = offlinePunches
                .filter((p: any) => p.date === todayStr && p.userId === currentUserId)
                // Deduplicate: Don't show offline punch if it already exists in Firestore logs
                .filter((p: any) => !logs.some(l => l.offlineId === p._offlineTimestamp))
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
        }, (err) => {
            console.warn("Failed to fetch today logs, using offline only", err);
            setTodayLogs(prev => {
                const offlinePunches = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
                const todayOfflinePunches = offlinePunches
                    .filter((p: any) => p.date === todayStr && p.userId === currentUserId)
                    // Deduplicate
                    .filter((p: any) => !prev.some(l => l.offlineId === p._offlineTimestamp))
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
        const unsubYesterday = onSnapshot(qLogsYesterday, (snap) => {
            const logs = snap.docs.map(d => ({ ...d.data(), id: d.id } as AttendanceLog));
            
            // --- ADD OFFLINE PUNCHES TO UI ---
            const offlinePunches = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
            const yesterdayOfflinePunches = offlinePunches
                .filter((p: any) => p.date === yesterdayStr && p.userId === currentUserId)
                .filter((p: any) => !logs.some(l => l.offlineId === p._offlineTimestamp))
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
        }, (err) => {
            console.warn("Failed to fetch yesterday logs, using offline only", err);
            setYesterdayLogs(prev => {
                const offlinePunches = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
                const yesterdayOfflinePunches = offlinePunches
                    .filter((p: any) => p.date === yesterdayStr && p.userId === currentUserId)
                    .filter((p: any) => !prev.some(l => l.offlineId === p._offlineTimestamp))
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
        const unsubOverride = onSnapshot(qOverride, (snap) => {
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
        const unsubActions = onSnapshot(qActions, (snap) => {
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
        const unsubSch = onSnapshot(qSch, (snap) => setSchedules(snap.docs.map(d => d.data() as Schedule)));

        return () => {
            unsubLogs();
            unsubYesterday();
            unsubOverride();
            unsubActions();
            unsubSch();
        };
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
        if (!soundEnabled) return;
        const sounds = {
            success: 'https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3',
            error: 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3',
            click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'
        };
        try {
            const audio = new Audio(sounds[type]);
            audio.volume = 0.5;
            audio.play().catch(() => {});
        } catch {}
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
                        let errorMsg = t('att.err.gpsGeneral');
                        if (err.code === 1) errorMsg = t('att.err.gpsPermission');
                        if (err.code === 2) errorMsg = t('att.err.gpsWeak');
                        if (err.code === 3) errorMsg = t('att.err.gpsTimeout');
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
            let userMsg = e.message || "Unknown error";
            if (userMsg.includes("NotAllowedError") || userMsg.includes("cancelled")) {
                userMsg = t('att.err.authCancelled');
            } else if (userMsg.includes("InvalidStateError")) {
                userMsg = t('att.err.deviceMismatch');
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
                
                setToast({msg: t('att.gps.sentSuccess'), type: 'success'});
                setActiveLiveCheck(null);
                setIsLiveCheckProcessing(false);
                setStatus('SUCCESS');
                setTimeout(() => setStatus('IDLE'), 2000);
            },
            async (err) => {
                setToast({msg: t('att.gps.failed'), type: 'error'});
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
                arabicMainText: isLiveCheckProcessing ? t('att.punch.sending') : t('att.punch.confirmLive'),
                subText: 'Supervisor Requested',
                arabicSubText: t('att.punch.supervisorReq'),
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
                arabicMainText: t('att.punch.nextShift'),
                subText: `Tomorrow ${nextShift.start}`,
                arabicSubText: t(`att.punch.tomorrowAt|time:${nextShift.start}`),
                icon: 'fa-calendar-day',
                ringClass: 'border-sky-500/20 shadow-[0_0_50px_rgba(56,189,248,0.1)]',
                btnClass: 'bg-sky-950/40 text-sky-400 border border-sky-500/30',
                pulse: false
            };
        }

        // Specific Handling for Leave State (Robust Check)
        if (shiftLogic.state === 'ON_LEAVE') {
            const colorStr = shiftLogic.color || '';
            const isRed = colorStr.includes('red') || colorStr.includes('rose');
            
            return {
                theme: isRed ? 'rose' : 'purple',
                mainText: shiftLogic.message,
                arabicMainText: t('att.punch.onLeave'),
                subText: shiftLogic.sub,
                arabicSubText: t('att.punch.onLeaveDesc'),
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
                    arabicMainText: t('att.punch.missedOut'),
                    subText: shiftLogic.sub,
                    arabicSubText: t('att.punch.missedOutDesc'),
                    icon: 'fa-user-clock',
                    ringClass: 'border-rose-500/20 shadow-[0_0_50px_rgba(244,63,94,0.1)]',
                    btnClass: 'bg-rose-950/40 text-rose-400 border border-rose-500/40 animate-pulse',
                    pulse: true
                };
            }
            if (shiftLogic.state === 'NEXT_SHIFT') {
                return {
                    theme: 'slate',
                    mainText: 'NEXT SHIFT',
                    arabicMainText: t('att.punch.upcomingShift'),
                    subText: shiftLogic.sub,
                    arabicSubText: t('att.punch.upcomingShiftDesc'),
                    icon: 'fa-moon',
                    ringClass: 'border-slate-500/20 shadow-[0_0_50px_rgba(100,116,139,0.1)]',
                    btnClass: 'bg-slate-900/40 text-slate-400 border border-slate-700/40',
                    pulse: false
                };
            }
            if (shiftLogic.state === 'ABSENT') {
                return {
                    theme: 'rose', 
                    mainText: 'ABSENT', 
                    arabicMainText: t('att.punch.absent'),
                    subText: shiftLogic.sub,
                    arabicSubText: t('att.punch.absentDesc'),
                    icon: 'fa-user-slash',
                    ringClass: 'border-rose-500/20 shadow-[0_0_50px_rgba(244,63,94,0.1)]',
                    btnClass: 'bg-rose-950/40 text-rose-400 border border-rose-500/30',
                    pulse: false
                };
            }
            if (shiftLogic.state === 'COMPLETED') {
                return {
                    theme: 'emerald',
                    mainText: shiftLogic.message, 
                    arabicMainText: t('att.punch.completed'),
                    subText: shiftLogic.sub,
                    arabicSubText: t('att.punch.completedDesc'),
                    icon: 'fa-check-circle',
                    ringClass: 'border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.1)]',
                    btnClass: 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30',
                    pulse: false
                };
            }
            if (isBreak || shiftLogic.state === 'WAITING') {
                return {
                    theme: 'amber',
                    mainText: shiftLogic.state === 'WAITING' ? 'WAITING' : 'BREAK',
                    arabicMainText: shiftLogic.state === 'WAITING' ? t('att.punch.waiting') : t('att.punch.break'),
                    subText: shiftLogic.sub,
                    arabicSubText: (shiftLogic as any).timeRemaining || t('att.punch.waitingDesc'),
                    extraText: (shiftLogic as any).timeRemaining,
                    icon: 'fa-coffee',
                    ringClass: 'border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.1)]',
                    btnClass: 'bg-amber-950/40 text-amber-400 border border-amber-500/30',
                    pulse: true 
                };
            }
            return {
                theme: 'slate',
                mainText: shiftLogic.message,
                arabicMainText: t('att.punch.unavailable'),
                subText: shiftLogic.sub,
                arabicSubText: t('att.punch.unavailableDesc'),
                icon: 'fa-lock',
                ringClass: 'border-slate-700/30',
                btnClass: 'bg-slate-800/40 text-slate-500 border border-slate-700/40',
                pulse: false
            };
        }

        const isCheckIn = shiftLogic.state === 'READY_IN';
        return {
            theme: isCheckIn ? 'cyan' : 'rose',
            mainText: isCheckIn ? 'CHECK IN' : 'CHECK OUT',
            arabicMainText: isCheckIn ? t('att.punch.checkIn') : t('att.punch.checkOut'),
            subText: shiftLogic.sub,
            arabicSubText: isCheckIn ? t('att.punch.touchIn') : t('att.punch.touchOut'),
            icon: isCheckIn ? 'fa-fingerprint' : 'fa-sign-out-alt',
            ringClass: isCheckIn 
                ? 'border-cyan-500/50 shadow-[0_0_80px_rgba(6,182,212,0.35)] animate-pulse-ring' 
                : 'border-rose-500/50 shadow-[0_0_80px_rgba(244,63,94,0.35)] animate-pulse-ring',
            btnClass: isCheckIn 
                ? 'bg-gradient-to-br from-cyan-400 via-cyan-500 to-cyan-600 text-slate-950 font-black shadow-[0_0_50px_rgba(6,182,212,0.5)] active:scale-95' 
                : 'bg-gradient-to-br from-rose-500 via-rose-600 to-rose-700 text-white font-black shadow-[0_0_50px_rgba(244,63,94,0.5)] active:scale-95',
            pulse: true
        };
    }, [shiftLogic, activeLiveCheck, isLiveCheckProcessing, tomorrowShifts, t]);

    // Responsive SVG circle calculations based on normalized viewBox 0 0 260 260
    const svgRadius = 116;
    const svgCircumference = 2 * Math.PI * svgRadius;
    const displayTime = currentTime || new Date();
    const svgDashoffset = svgCircumference - ((displayTime.getSeconds()) / 60) * svgCircumference;

    return (
        <div className="min-h-screen bg-[#030712] text-white font-sans flex flex-col justify-between relative overflow-hidden select-none" dir={dir}>
            <style>{styles}</style>
            
            {/* Immersive Atmospheric Ambient Glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className={`absolute top-[-10%] left-[-15%] w-[85vw] h-[85vw] max-w-[550px] max-h-[550px] rounded-full mix-blend-screen filter blur-[120px] opacity-25 animate-float transition-colors duration-[3000ms]
                    ${visualState.theme === 'cyan' ? 'bg-cyan-600' : visualState.theme === 'rose' ? 'bg-rose-600' : visualState.theme === 'amber' ? 'bg-amber-600' : visualState.theme === 'purple' ? 'bg-purple-600' : 'bg-slate-800'}`}>
                </div>
                <div className={`absolute bottom-[5%] right-[-15%] w-[75vw] h-[75vw] max-w-[500px] max-h-[500px] rounded-full mix-blend-screen filter blur-[110px] opacity-20 animate-float transition-colors duration-[3000ms] delay-1000
                    ${visualState.theme === 'cyan' ? 'bg-blue-600' : visualState.theme === 'rose' ? 'bg-orange-600' : 'bg-slate-700'}`}>
                </div>
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"></div>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* TOP HEADER BAR */}
            <header className="relative z-30 flex justify-between items-center px-4 py-3 sm:px-6 sm:py-4 glass-panel border-b border-white/5 shadow-none bg-transparent">
                <button 
                    onClick={() => navigate('/user')} 
                    className="group flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all backdrop-blur-xl shadow-sm cursor-pointer"
                    title={t('att.backToDashboard')}
                >
                    <i className="fas fa-arrow-right text-white/70 group-hover:text-white transition-colors rtl:rotate-0 rotate-180 text-xs sm:text-sm"></i>
                    <span className="text-[11px] sm:text-xs font-bold text-white/80 group-hover:text-white tracking-wide">{t('att.home')}</span>
                </button>
                
                <div className="flex items-center gap-2.5 sm:gap-3.5">
                    {/* Sound Mute/Unmute Toggle */}
                    <button
                        onClick={toggleSound}
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center border transition-all ${soundEnabled ? 'bg-white/5 border-white/10 text-cyan-400 hover:bg-white/10' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
                        title={soundEnabled ? t('att.sound.mute') : t('att.sound.unmute')}
                    >
                        <i className={`fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'} text-xs sm:text-sm`}></i>
                    </button>

                    {/* Live Sync Status Pill */}
                    <div className="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono">
                        <span className={`w-1.5 h-1.5 rounded-full ${navigator.onLine && isTimeSynced ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400 animate-pulse'}`}></span>
                        <span className="text-white/70">{isTimeSynced ? t('att.sync.online') : t('att.sync.syncing')}</span>
                    </div>

                    {/* User Profile Chip */}
                    <div className="flex items-center gap-2 pl-1 rtl:pl-0 rtl:pr-1">
                        <div className="text-right hidden sm:block">
                            <h2 className="text-xs font-bold text-white/90 leading-tight">{currentUserName}</h2>
                            <p className="text-[9px] text-white/40 font-mono">{t('att.registeredStaff')}</p>
                        </div>
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-white/15 to-white/5 border border-white/15 flex items-center justify-center text-xs sm:text-sm font-black text-white shadow-lg backdrop-blur-md">
                            {currentUserName.charAt(0)}
                        </div>
                    </div>
                </div>
            </header>

            {/* FLOATING OVERRIDE COUNTDOWN NOTIFICATION */}
            {hasOverride && timeLeft !== null && (
                <div className={`fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-[300px] px-4 transition-all duration-300 ${timeLeft <= 10 ? 'scale-105' : 'scale-100'}`}>
                    <div className={`
                        flex items-center justify-center gap-3 px-4 py-2.5 rounded-2xl shadow-2xl border backdrop-blur-xl
                        ${timeLeft <= 10 
                            ? 'bg-rose-600/90 border-rose-400 text-white animate-pulse' 
                            : 'bg-amber-600/90 border-amber-400 text-white'
                        }`}
                    >
                        <i className={`fas ${timeLeft <= 10 ? 'fa-triangle-exclamation' : 'fa-stopwatch'} text-lg`}></i>
                        <div className="flex flex-col text-center">
                            <span className="text-[10px] uppercase font-black tracking-wider leading-none">
                                {timeLeft <= 10 ? t('att.override.hurry') : t('att.override.active')}
                            </span>
                            <span className="text-sm font-black tabular-nums font-mono leading-none mt-1">
                                {t(`att.override.remaining|sec:${timeLeft}`)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN CONTENT WRAPPER */}
            <main className="relative z-20 flex-1 flex flex-col items-center justify-start pt-2 sm:pt-4 px-4 pb-20 w-full max-w-lg mx-auto overflow-y-auto custom-scrollbar-dark">
                
                {/* 1. SHIFT STATUS PILL */}
                {todayShifts.length > 0 ? (
                    <div className={`px-4 py-1.5 rounded-full border flex items-center gap-2 shadow-lg mb-2.5 backdrop-blur-xl ${isSwapShift ? 'bg-purple-900/30 border-purple-500/40 text-purple-300' : 'bg-slate-900/50 border-white/10 text-white/90'}`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isSwapShift ? 'bg-purple-400 shadow-[0_0_8px_#c084fc] animate-ping' : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'}`}></span>
                        <span className="text-[10px] sm:text-[11px] font-bold tracking-wide">
                            {isSwapShift ? t('att.shift.swap') : t('att.shift.today')}
                            <span className="font-mono text-cyan-300 font-semibold mr-1">{todayShifts.map(s => `${s.start} - ${s.end}`).join(' | ')}</span>
                        </span>
                    </div>
                ) : (
                    <div className="px-4 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 text-[10px] font-bold mb-2.5 backdrop-blur-xl">
                        🌙 {t('att.shift.none')}
                    </div>
                )}

                {/* 2. REFINED RESPONSIVE DIGITAL CLOCK */}
                {currentTime && <DigitalClock date={currentTime} />}

                {/* 3. GPS ACCURACY & HOSPITAL RADAR BADGE */}
                <div className="mt-2.5 mb-4 flex flex-wrap items-center justify-center gap-2 max-w-xs text-center">
                    {/* Geolocation Radius Status */}
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border backdrop-blur-md transition-all ${
                        isWithinHospitalRange === true 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                            : isWithinHospitalRange === false
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                            : 'bg-white/5 border-white/10 text-white/70'
                    }`}>
                        <i className={`fas ${
                            isWithinHospitalRange === true ? 'fa-check-circle text-emerald-400' :
                            isWithinHospitalRange === false ? 'fa-map-pin text-rose-400' : 'fa-satellite-dish text-cyan-400'
                        } text-xs`}></i>
                        <span>
                            {hospitalDistanceMeters !== null 
                                ? (isWithinHospitalRange 
                                    ? t(`att.gps.inside|dist:${hospitalDistanceMeters}`) 
                                    : t(`att.gps.outside|dist:${hospitalDistanceMeters}`))
                                : t('att.gps.scanning')}
                        </span>
                    </div>

                    {/* Quick GPS Refresh */}
                    <button 
                        onClick={refreshGPS}
                        disabled={status === 'SCANNING_LOC'}
                        className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 px-2.5 py-1 hover:bg-white/10 rounded-full transition-all border border-white/5 cursor-pointer"
                        title={t('att.gps.refreshTitle')}
                    >
                        <i className={`fas fa-sync-alt ${status === 'SCANNING_LOC' ? 'animate-spin' : ''} text-[9px]`}></i>
                        <span>{t('att.gps.refresh')}</span>
                    </button>
                </div>

                {/* 4. THE HERO BIOMETRIC PUNCH CENTERPIECE */}
                <div className="relative group w-60 h-60 sm:w-68 sm:h-68 md:w-72 md:h-72 flex items-center justify-center my-auto shrink-0 transition-transform duration-500">
                    
                    {/* Animated High-Tech Outer Orbit Rings */}
                    <div className="absolute inset-[-18px] sm:inset-[-22px] border border-dashed border-white/10 rounded-full animate-rotate-slow pointer-events-none opacity-40"></div>
                    <div className="absolute inset-[-8px] sm:inset-[-12px] border border-solid border-white/5 rounded-full animate-rotate-reverse pointer-events-none opacity-50"></div>
                    
                    {/* Glowing Pulse Ring for Active States */}
                    <div className={`absolute inset-0 rounded-full border-2 ${visualState.ringClass} pointer-events-none transition-all duration-700 ${visualState.pulse ? 'opacity-90 animate-pulse-ring' : 'opacity-20'}`}></div>

                    {/* Normalized Vector SVG Progress Ring */}
                    <svg 
                        viewBox="0 0 260 260" 
                        className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none z-10 overflow-visible"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        {/* Background Base Track */}
                        <circle
                            cx="130"
                            cy="130"
                            r={svgRadius}
                            stroke="rgba(255, 255, 255, 0.08)"
                            strokeWidth="4"
                            fill="transparent"
                        />
                        {/* Dynamic Second Progress Stroke */}
                        <circle
                            cx="130"
                            cy="130"
                            r={svgRadius}
                            stroke="currentColor"
                            strokeWidth="5"
                            fill="transparent"
                            strokeDasharray={svgCircumference}
                            strokeDashoffset={svgDashoffset}
                            strokeLinecap="round"
                            className={`transition-all duration-1000 ease-linear drop-shadow-[0_0_15px_currentColor] ${
                                visualState.theme === 'cyan' ? 'text-cyan-400' : 
                                visualState.theme === 'rose' ? 'text-rose-500' : 
                                visualState.theme === 'amber' ? 'text-amber-400' : 
                                visualState.theme === 'purple' ? 'text-purple-400' : 
                                visualState.theme === 'emerald' ? 'text-emerald-400' :
                                visualState.theme === 'sky' ? 'text-sky-400' : 'text-slate-600'
                            }`}
                        />
                    </svg>

                    {/* Interactive Biometric Button */}
                    <div className="relative z-20">
                        <button
                            type="button"
                            onClick={handlePunch}
                            disabled={status !== 'IDLE' && status !== 'ERROR' && !activeLiveCheck && !shiftLogic.canPunch}
                            className={`
                                relative w-48 h-48 sm:w-52 sm:h-52 md:w-56 md:h-56 rounded-full flex flex-col items-center justify-center 
                                transition-all duration-300 transform active:scale-95 overflow-hidden select-none cursor-pointer
                                ${visualState.theme === 'rose' && status === 'ERROR' ? 'bg-red-950/80 text-red-300 border-red-500/60' : visualState.btnClass} 
                                glass-button border-2
                                ${(status !== 'IDLE' && status !== 'ERROR' && !activeLiveCheck && !shiftLogic.canPunch) ? 'opacity-85 cursor-not-allowed grayscale-[20%]' : 'hover:scale-[1.02] hover:shadow-[0_0_50px_rgba(255,255,255,0.2)]'}
                            `}
                        >
                            {/* Scanning Laser Beam Line */}
                            {(status === 'SCANNING_LOC' || status === 'PROCESSING') && (
                                <div className="absolute left-0 w-full h-1 bg-cyan-300 shadow-[0_0_15px_#22d3ee] animate-scan z-20"></div>
                            )}

                            {/* Biometric Central Icon */}
                            <div className="mb-1.5 relative">
                                <i className={`fas ${status === 'ERROR' ? 'fa-exclamation-triangle text-amber-300' : status === 'SUCCESS' ? 'fa-check-circle text-emerald-300' : visualState.icon} text-4xl sm:text-5xl neon-text-glow z-10 ${status === 'IDLE' && shiftLogic.canPunch ? 'animate-breathe' : ''}`}></i>
                            </div>
                            
                            {/* Main Action Text in Arabic */}
                            <span className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-center px-3 z-10 drop-shadow-md">
                                {status === 'IDLE' ? (visualState.arabicMainText || visualState.mainText) : 
                                 status === 'SCANNING_LOC' ? t('att.punch.scanningLoc') :
                                 status === 'PROCESSING' ? t('att.punch.processing') :
                                 status === 'SUCCESS' ? t('att.punch.success') :
                                 status === 'ERROR' ? (errorDetails.title || t('att.punch.error')) : status}
                            </span>

                            {/* English Status Tag */}
                            <span className="text-[10px] sm:text-[11px] font-bold tracking-wider opacity-80 uppercase text-center px-4 mt-0.5 z-10 line-clamp-1">
                                {status === 'IDLE' ? (visualState.mainText) :
                                 status === 'ERROR' ? errorDetails.msg : 
                                 status === 'SUCCESS' ? t('att.punch.verified') : visualState.subText}
                            </span>

                            {/* Guidance Subtitle */}
                            {status === 'IDLE' && visualState.arabicSubText && (
                                <span className="text-[9px] font-medium text-white/60 tracking-normal text-center px-4 mt-1 z-10 line-clamp-1">
                                    {visualState.arabicSubText}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* 5. QUICK INFO STATS ROW */}
                <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm px-2 mt-4 mb-2">
                    <div className="glass-panel p-2.5 rounded-2xl border border-white/10 flex items-center gap-2.5 shadow-md">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-sm shrink-0">
                            <i className="fas fa-fingerprint"></i>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] text-white/50 font-bold uppercase">{t('att.stats.todayPunches')}</p>
                            <p className="text-xs font-black text-white truncate font-mono">
                                {todayLogs.length} {todayLogs.length === 1 ? t('att.stats.singlePunch') : t('att.stats.pluralPunches')}
                            </p>
                        </div>
                    </div>

                    <div className="glass-panel p-2.5 rounded-2xl border border-white/10 flex items-center gap-2.5 shadow-md">
                        <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 text-sm shrink-0">
                            <i className="fas fa-business-time"></i>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] text-white/50 font-bold uppercase">{t('att.stats.shiftStatus')}</p>
                            <p className="text-xs font-black text-white truncate">
                                {todayShifts.length > 0 ? t(`att.stats.scheduledShifts|count:${todayShifts.length}`) : t('att.stats.noShifts')}
                            </p>
                        </div>
                    </div>
                </div>

            </main>

            {/* 6. BOTTOM DRAWER (SLIDING SHEET FOR DETAILS & LOGS) */}
            <div className={`fixed bottom-0 left-0 right-0 glass-panel border-t border-white/15 transition-transform duration-500 ease-out z-40 flex flex-col rounded-t-[2rem] shadow-[0_-15px_60px_rgba(0,0,0,0.85)] backdrop-blur-3xl ${showHistory ? 'translate-y-0 h-[82vh]' : 'translate-y-[calc(100%-58px)] h-[82vh]'}`}>
                
                {/* Drawer Drag Bar & Header */}
                <div 
                    onClick={() => setShowHistory(!showHistory)}
                    className="w-full h-[58px] flex items-center justify-between px-6 cursor-pointer relative group select-none border-b border-white/5"
                >
                    <div className="flex items-center gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></div>
                        <span className="text-xs font-bold text-white/80 group-hover:text-white transition-colors">
                            {t('att.slide.title')}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 font-mono text-cyan-300 font-bold">
                            {todayLogs.length}
                        </span>
                    </div>

                    {/* Drag Handle Indicator */}
                    <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-12 h-1 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors"></div>

                    <div className="flex items-center gap-2 text-white/50 group-hover:text-white transition-colors">
                        <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">
                            {showHistory ? t('att.slide.close') : t('att.slide.viewDetails')}
                        </span>
                        <i className={`fas fa-chevron-up text-xs transition-transform duration-300 ${showHistory ? 'rotate-180' : ''}`}></i>
                    </div>
                </div>

                {/* Drawer Body */}
                <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 pt-3 pb-6 bg-gradient-to-b from-transparent to-black/50">
                    
                    {/* Tab Navigation */}
                    <div className="flex items-center gap-2 mb-4 bg-white/5 p-1 rounded-2xl border border-white/10">
                        <button
                            onClick={() => setDrawerTab('punches')}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${drawerTab === 'punches' ? 'bg-cyan-500 text-slate-950 shadow-md font-black' : 'text-white/60 hover:text-white'}`}
                        >
                            <i className="fas fa-history text-xs"></i>
                            <span>{t(`att.slide.tabPunches|count:${todayLogs.length}`)}</span>
                        </button>
                        <button
                            onClick={() => setDrawerTab('shifts')}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${drawerTab === 'shifts' ? 'bg-cyan-500 text-slate-950 shadow-md font-black' : 'text-white/60 hover:text-white'}`}
                        >
                            <i className="fas fa-calendar-alt text-xs"></i>
                            <span>{t(`att.slide.tabShifts|count:${todayShifts.length}`)}</span>
                        </button>
                    </div>

                    {/* Tab 1: Today's Punches */}
                    {drawerTab === 'punches' && (
                        <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar-dark pr-1">
                            {todayLogs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-white/30 glass-panel rounded-3xl border border-white/5">
                                    <i className="far fa-clock text-4xl mb-3 opacity-40"></i>
                                    <p className="text-xs font-bold">{t('att.slide.emptyPunches')}</p>
                                    <span className="text-[10px] text-white/20 mt-1">{t('att.slide.emptyPunchesHint')}</span>
                                </div>
                            ) : (
                                todayLogs.map((log, idx) => (
                                    <div 
                                        key={log.id} 
                                        className={`flex items-center justify-between bg-white/5 p-3.5 sm:p-4 rounded-2xl border ${log.isSuspicious ? 'border-red-500/50 bg-red-950/20 shadow-[0_0_20px_rgba(220,38,38,0.15)]' : 'border-white/5'} hover:bg-white/10 transition-all`}
                                    >
                                        <div className="flex items-center gap-3.5">
                                            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg shadow-inner shrink-0 ${log.type === 'IN' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                                                <i className={`fas ${log.type === 'IN' ? 'fa-sign-in-alt' : 'fa-sign-out-alt'}`}></i>
                                            </div>
                                            <div>
                                                <p className={`font-black text-sm tracking-wide ${log.type === 'IN' ? 'text-cyan-200' : 'text-rose-200'}`}>
                                                    {log.type === 'IN' ? t('att.slide.checkIn') : t('att.slide.checkOut')}
                                                </p>
                                                <p className="text-[10px] text-white/50 font-mono mt-0.5">
                                                    {t('att.slide.shift')} {log.shiftIndex || 1} <span className="mx-1 opacity-40">•</span> {t('att.slide.seq')} #{idx + 1}
                                                </p>
                                                {log.isSuspicious && (
                                                    <p className="text-[9px] text-red-400 font-bold mt-1 uppercase tracking-wider bg-red-500/20 inline-block px-2 py-0.5 rounded-full border border-red-500/30">
                                                        ⚠️ {log.violationType || 'SUSPICIOUS'}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="text-right flex flex-col items-end shrink-0">
                                            <p className="font-mono font-black text-white text-xl tracking-tight">
                                                {log.timestamp?.toDate 
                                                    ? log.timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: true}) 
                                                    : '--:--'}
                                            </p>
                                            <div className={`flex items-center justify-end gap-1.5 mt-1 px-2 py-0.5 rounded-full ${log.isOfflineSync ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                                                <i className={`fas ${log.isOfflineSync ? 'fa-wifi text-[7px]' : 'fa-check text-[7px]'}`}></i>
                                                <span className="text-[8px] font-bold uppercase tracking-wider">
                                                    {log.isOfflineSync ? t('att.slide.offline') : t('att.slide.synced')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Tab 2: Shift Schedule */}
                    {drawerTab === 'shifts' && (
                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar-dark pr-1">
                            {todayShifts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-white/30 glass-panel rounded-3xl border border-white/5">
                                    <i className="far fa-calendar-times text-4xl mb-3 opacity-40"></i>
                                    <p className="text-xs font-bold">{t('att.slide.emptyShifts')}</p>
                                </div>
                            ) : (
                                todayShifts.map((s, i) => {
                                    const isCurrent = (shiftLogic as any).shiftIdx === (i + 1);
                                    const isMissed = (shiftLogic as any).shiftIdx > (i + 1) && todayLogs.length < (i + 1) * 2; 
                                    
                                    const startH = parseInt(s.start.split(':')[0]);
                                    const endH = parseInt(s.end.split(':')[0]);
                                    const isOvernight = endH < startH;

                                    let bgColor = 'bg-white/5';
                                    let textColor = 'text-white/90';

                                    if (isCurrent) {
                                        bgColor = isSwapShift ? 'bg-purple-500/15 border-purple-500/40' : 'bg-cyan-500/15 border-cyan-500/40';
                                        textColor = isSwapShift ? 'text-purple-300' : 'text-cyan-300';
                                    } else if (isMissed) {
                                        textColor = 'text-red-400/50 line-through';
                                    }

                                    return (
                                        <div 
                                            key={i} 
                                            className={`glass-panel p-4 rounded-2xl flex flex-col gap-3 transition-all duration-300 border ${bgColor} ${isCurrent ? 'shadow-[0_10px_30px_rgba(0,0,0,0.5)] scale-[1.01] ring-1 ring-white/20' : 'opacity-70 hover:opacity-100'}`}
                                        >
                                            <div className="flex justify-between items-center border-b border-white/10 pb-2">
                                                <span className="text-xs font-black text-white/70 uppercase">
                                                    {t('att.slide.shift')} {i + 1} {isOvernight ? t('att.slide.overnight') : ''}
                                                </span>
                                                {isCurrent && (
                                                    <span className={`flex items-center gap-1.5 text-[9px] px-2.5 py-1 rounded-full font-bold shadow-md ${isSwapShift ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full animate-ping ${isSwapShift ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                                                        {isSwapShift ? t('att.slide.swapActive') : t('att.slide.activeNow')}
                                                    </span>
                                                )}
                                            </div>

                                            <div className={`flex justify-between items-center ${textColor}`}>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-white/40 mb-0.5">{t('att.slide.start')}</span>
                                                    <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
                                                        {s.start}
                                                    </span>
                                                </div>

                                                <div className="flex-grow mx-6 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent relative">
                                                    {isCurrent && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee]"></div>}
                                                </div>

                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] text-white/40 mb-0.5">{t('att.slide.end')}</span>
                                                    <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
                                                        {s.end}
                                                    </span>
                                                    {isOvernight && <span className="text-[8px] text-white/40 mt-0.5">{t('att.slide.plusOneDay')}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}

                </div>
            </div>

        </div>
    );
};

export default AttendancePage;
