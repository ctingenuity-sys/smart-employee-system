
import React, { useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const HOSPITAL_LAT = 21.584135549676002;
const HOSPITAL_LNG = 39.208052479784165; 
const ALLOWED_RADIUS_KM = 0.25; // السماح بـ 250 متر لتجنب أخطاء GPS البسيطة
const CHECK_INTERVAL_MS = 20 * 60 * 1000; // كل 20 دقيقة

const SilentTracker: React.FC = () => {
    const lastCheckRef = useRef<number>(0);

    const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        var R = 6371; 
        var dLat = deg2rad(lat2-lat1); 
        var dLon = deg2rad(lon2-lon1); 
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        return R * c;
    }
    const deg2rad = (deg: number) => deg * (Math.PI/180);

    const performSilentCheck = async () => {
        const user = auth.currentUser;
        if (!user) return;

        // منع التكرار المفرط (فقط كل 20 دقيقة كحد أدنى)
        const now = Date.now();
        const lastSaved = localStorage.getItem('last_silent_check');
        if (lastSaved && (now - parseInt(lastSaved) < CHECK_INTERVAL_MS)) {
            return; 
        }

        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                const dist = getDistanceFromLatLonInKm(latitude, longitude, HOSPITAL_LAT, HOSPITAL_LNG);
                
                // تحديث وقت آخر فحص محلياً
                localStorage.setItem('last_silent_check', Date.now().toString());

                // إذا كان خارج النطاق فقط (أو يمكن إزالة الشرط لتسجيل كل التحركات)
                if (dist > ALLOWED_RADIUS_KM) {
                    try {
                        // إرسال تقرير صامت لقاعدة البيانات
                        await addDoc(collection(db, 'attendance_logs'), {
                            userId: user.uid,
                            userName: localStorage.getItem('username') || 'Employee',
                            type: 'AUTO_TRACKING', // نوع مخفي لا يظهر في السجلات العادية
                            timestamp: serverTimestamp(),
                            clientTimestamp: serverTimestamp(),
                            date: new Date().toISOString().split('T')[0],
                            locationLat: latitude,
                            locationLng: longitude,
                            distanceKm: dist,
                            isSuspicious: true, // هذا العلم سيشغل جرس الإنذار عند المشرف
                            violationType: 'OUT_OF_RANGE_SILENT', // نوع المخالفة
                            deviceInfo: 'Silent Tracker (Background)',
                            isHidden: true // لا يظهر للموظف في سجله
                        });
                        console.log("Location logged silently.");
                    } catch (e) {
                        // Silent fail
                    }
                }
            },
            (err) => {
                // User denied GPS or Error - Do nothing to avoid suspicion
                console.log("Silent Check Failed", err);
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 } // Low accuracy is fine to save battery and be faster
        );
    };

    useEffect(() => {
        // 1. Check immediately on load
        performSilentCheck();

        // 2. Check periodically if page stays open
        const interval = setInterval(performSilentCheck, CHECK_INTERVAL_MS);

        // 3. Check when user switches tabs and comes back
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                performSilentCheck();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);

    // هذا المكون لا يعرض شيئاً على الشاشة (غير مرئي)
    return null;
};

export default SilentTracker;
