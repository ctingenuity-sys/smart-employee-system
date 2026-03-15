
import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const HOSPITAL_LAT = 21.584135549676002;
const HOSPITAL_LNG = 39.208052479784165; 
const ALLOWED_RADIUS_KM = 0.20; // 200 meters tolerance

const BackgroundTracker: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [isActive, setIsActive] = useState(false);
    const [lastCheck, setLastCheck] = useState<string>('--:--');
    const [nextCheck, setNextCheck] = useState<number>(0);
    const [statusLog, setStatusLog] = useState<string[]>([]);
    const [errorMsg, setErrorMsg] = useState('');
    const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

    const timerRef = useRef<any>(null);
    const countdownRef = useRef<any>(null);
    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || 'Employee';

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

    const addLog = (msg: string) => {
        const time = new Date().toLocaleTimeString();
        setStatusLog(prev => [`[${time}] ${msg}`, ...prev.slice(0, 10)]);
    };

    // --- Core Tracking Function ---
    const performCheck = async () => {
        if (!navigator.geolocation) {
            addLog("Error: GPS not supported");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                const dist = getDistanceFromLatLonInKm(latitude, longitude, HOSPITAL_LAT, HOSPITAL_LNG);
                const distMeters = (dist * 1000).toFixed(0);

                setLastCheck(new Date().toLocaleTimeString());

                if (dist > ALLOWED_RADIUS_KM) {
                    addLog(`⚠️ OUT OF RANGE (${distMeters}m). Reporting...`);
                    
                    // Send Alert to Database
                    try {
                        await addDoc(collection(db, 'attendance_logs'), {
                            userId: currentUserId,
                            userName: currentUserName,
                            type: 'AUTO_TRACKING',
                            timestamp: serverTimestamp(),
                            clientTimestamp: serverTimestamp(),
                            date: new Date().toISOString().split('T')[0],
                            locationLat: latitude,
                            locationLng: longitude,
                            distanceKm: dist,
                            isSuspicious: true, // This triggers the Supervisor Notification
                            violationType: 'OUT_OF_RANGE_AUTO_CHECK',
                            deviceInfo: 'Background Tracker'
                        });
                        addLog("🚨 Violation Reported to Supervisor.");
                    } catch (e) {
                        addLog("Error uploading report.");
                    }
                } else {
                    addLog(`✅ Location Verified (${distMeters}m). OK.`);
                }
            },
            (err) => {
                addLog(`GPS Error: ${err.message}`);
                setErrorMsg(err.message);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    // --- Timer Logic ---
    const toggleTracking = () => {
        if (isActive) {
            // Stop
            clearInterval(timerRef.current);
            clearInterval(countdownRef.current);
            setIsActive(false);
            addLog("Tracking Stopped.");
            setNextCheck(0);
        } else {
            // Start
            if (!currentUserId) {
                alert("Please login first");
                return;
            }
            setIsActive(true);
            addLog("Tracking Started. Next check in 30m.");
            performCheck(); // Check immediately

            // Set Interval (30 Minutes = 1800000 ms)
            const INTERVAL_MS = 30 * 60 * 1000; 
            
            // Main Check Timer
            timerRef.current = setInterval(() => {
                performCheck();
                setNextCheck(INTERVAL_MS / 1000); // Reset countdown display
            }, INTERVAL_MS);

            // Visual Countdown Timer (Updates every second)
            setNextCheck(INTERVAL_MS / 1000);
            countdownRef.current = setInterval(() => {
                setNextCheck(prev => prev > 0 ? prev - 1 : 0);
            }, 1000);
        }
    };

    // --- Battery Monitor (Optional) ---
    useEffect(() => {
        // @ts-ignore
        if (navigator.getBattery) {
            // @ts-ignore
            navigator.getBattery().then(battery => {
                setBatteryLevel(Math.floor(battery.level * 100));
            });
        }
        return () => {
            clearInterval(timerRef.current);
            clearInterval(countdownRef.current);
        }
    }, []);

    // Wake Lock to prevent sleep
    useEffect(() => {
        let wakeLock: any = null;
        const requestWakeLock = async () => {
            if (isActive && 'wakeLock' in navigator) {
                try {
                    // @ts-ignore
                    wakeLock = await navigator.wakeLock.request('screen');
                } catch (err) {
                    console.log('Wake Lock error', err);
                }
            }
        };
        requestWakeLock();
        return () => {
            if (wakeLock) wakeLock.release();
        };
    }, [isActive]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-black text-green-500 font-mono p-4 flex flex-col relative overflow-hidden">
            {/* Background Grid */}
            <div className="absolute inset-0 opacity-20 pointer-events-none" 
                 style={{backgroundImage: 'linear-gradient(rgba(0, 255, 0, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 0, 0.1) 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
            </div>

            {/* Header */}
            <div className="flex justify-between items-center z-10 border-b border-green-900 pb-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500 animate-ping' : 'bg-red-500'}`}></div>
                    <h1 className="text-xl font-bold tracking-widest uppercase">Duty Tracker</h1>
                </div>
                <button onClick={() => navigate(-1)} className="text-xs border border-green-700 px-3 py-1 hover:bg-green-900 transition-colors">
                    EXIT
                </button>
            </div>

            {/* Main Status */}
            <div className="flex-1 flex flex-col items-center justify-center z-10 space-y-8">
                
                <div className="relative">
                    <div className={`w-48 h-48 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-500 ${isActive ? 'border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.4)]' : 'border-red-900 opacity-50'}`}>
                        <span className="text-4xl font-bold">{isActive ? formatTime(nextCheck) : 'OFF'}</span>
                        <span className="text-xs mt-2 opacity-70 uppercase tracking-widest">{isActive ? 'Next Scan' : 'System Idle'}</span>
                    </div>
                    {isActive && (
                        <div className="absolute inset-0 border border-green-500/30 rounded-full animate-ping opacity-20"></div>
                    )}
                </div>

                <div className="text-center space-y-2">
                    <p className="text-xs text-green-700 uppercase">Current Status</p>
                    <h2 className={`text-2xl font-bold ${isActive ? 'text-green-400' : 'text-red-500'}`}>
                        {isActive ? 'MONITORING ACTIVE' : 'STOPPED'}
                    </h2>
                    <p className="text-xs max-w-xs mx-auto opacity-60">
                        Keeps checking your location every 30 minutes. If you leave the designated area, a report is sent to the supervisor.
                    </p>
                </div>

                <button 
                    onClick={toggleTracking}
                    className={`px-8 py-4 rounded-xl font-bold text-lg tracking-wider transition-all transform active:scale-95 shadow-lg ${isActive ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-black hover:bg-green-500'}`}
                >
                    {isActive ? 'STOP DUTY MODE' : 'START DUTY MODE'}
                </button>

            </div>

            {/* Logs Terminal */}
            <div className="z-10 mt-auto bg-green-900/10 border-t border-green-900/50 p-4 h-48 overflow-hidden font-xs">
                <div className="flex justify-between items-center mb-2 opacity-50 text-[10px] uppercase">
                    <span>System Logs</span>
                    <span>Last Check: {lastCheck}</span>
                    <span>Battery: {batteryLevel ? `${batteryLevel}%` : '--'}</span>
                </div>
                <div className="space-y-1 overflow-y-auto h-full custom-scrollbar pb-6">
                    {statusLog.map((log, i) => (
                        <div key={i} className="text-xs opacity-80 border-b border-green-900/20 pb-1">
                            {log}
                        </div>
                    ))}
                    {statusLog.length === 0 && <div className="text-xs opacity-30 italic">Ready to initialize...</div>}
                </div>
            </div>

        </div>
    );
};

export default BackgroundTracker;
