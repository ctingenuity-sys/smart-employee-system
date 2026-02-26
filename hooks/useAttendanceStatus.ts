import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { AttendanceLog, Schedule, ActionLog } from '../types';
import { calculateShiftStatus, toMins } from '../utils/attendanceLogic';

const getLocalDateKey = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseMultiShifts = (text: string) => {
    if (!text) return [];
    let cleanText = text.trim();
    const segments = cleanText.split(/[\/,]|\s+and\s+|&|\s+(?=\d{1,2}(?::\d{2})?\s*(?:am|pm|mn|noon))/i);
    const shifts: { start: string, end: string }[] = [];
    
    const convertTo24Hour = (timeStr: string): string | null => {
        if (!timeStr) return null;
        let s = timeStr.toLowerCase().trim();
        s = s.replace(/(\d+)\.(\d+)/, '$1:$2');
        if (s.match(/\b12\s*:?\s*0{0,2}\s*mn\b/) || s.includes('midnight') || s.includes('12mn')) return '24:00';
        if (s.match(/\b12\s*:?\s*0{0,2}\s*n\b/) || s.includes('noon')) return '12:00';
        let modifier = null;
        if (s.includes('pm') || s.includes('p.m') || s.includes('م') || s.includes('مساء')) modifier = 'pm';
        else if (s.includes('am') || s.includes('a.m') || s.includes('ص') || s.includes('صباح')) modifier = 'am';
        const cleanTime = s.replace(/[^\d:]/g, ''); 
        const parts = cleanTime.split(':');
        if (parts.length === 0 || parts[0] === '') return null;
        let h = parseInt(parts[0], 10);
        let m = parts[1] ? parseInt(parts[1], 10) : 0;
        if (modifier) {
            if (modifier === 'pm' && h < 12) h += 12;
            if (modifier === 'am' && h === 12) h = 0;
        }
        if (h === 24) return '24:00';
        if (h > 24) return null;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    segments.forEach(seg => {
        const trimmed = seg.trim();
        if(!trimmed) return;
        if (trimmed.toLowerCase().includes('starting')) return;

        const rangeParts = trimmed.replace(/[()]/g, '').split(/\s*(?:[-–—]|\bto\b)\s*/i);
        if (rangeParts.length >= 2) {
            const startStr = rangeParts[0].trim();
            const endStr = rangeParts[rangeParts.length - 1].trim(); 
            const s = convertTo24Hour(startStr);
            const e = convertTo24Hour(endStr);
            if (s && e) {
                shifts.push({ start: s, end: e });
            }
        }
    });
    return shifts;
};

export const useAttendanceStatus = (userId: string | undefined) => {
    const [currentTime, setCurrentTime] = useState<Date>(new Date());
    const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([]);
    const [yesterdayLogs, setYesterdayLogs] = useState<AttendanceLog[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [todayAction, setTodayAction] = useState<string | null>(null);
    const [hasOverride, setHasOverride] = useState(false);
    const [logicTicker, setLogicTicker] = useState(0);

    // Time ticker
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
            setLogicTicker(prev => prev + 1);
        }, 10000); // update every 10s
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!userId) return;

        const todayDate = new Date();
        const todayStr = getLocalDateKey(todayDate);
        const yesterdayDate = new Date(todayDate);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = getLocalDateKey(yesterdayDate);

        // 1. Fetch Schedules
        const qSchedules = query(collection(db, 'schedules'), where('userId', '==', userId));
        const unsubSchedules = onSnapshot(qSchedules, snap => {
            setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() } as Schedule)));
        });

        // 2. Fetch Today Logs
        const qLogsToday = query(collection(db, 'attendance_logs'), where('userId', '==', userId), where('date', '==', todayStr));
        const unsubLogsToday = onSnapshot(qLogsToday, snap => {
            setTodayLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog)));
        });

        // 3. Fetch Yesterday Logs
        const qLogsYesterday = query(collection(db, 'attendance_logs'), where('userId', '==', userId), where('date', '==', yesterdayStr));
        const unsubLogsYesterday = onSnapshot(qLogsYesterday, snap => {
            setYesterdayLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog)));
        });

        // 4. Fetch Actions
        const qActions = query(collection(db, 'action_logs'), where('userId', '==', userId));
        const unsubActions = onSnapshot(qActions, snap => {
            const actions = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActionLog));
            const active = actions.find(a => a.fromDate <= todayStr && a.toDate >= todayStr);
            setTodayAction(active ? active.type : null);
        });

        // 5. Fetch Overrides
        const qOverride = query(collection(db, 'attendance_overrides'), where('userId', '==', userId));
        const unsubOver = onSnapshot(qOverride, snap => {
            const validDoc = snap.docs.find(d => {
                const data = d.data();
                const expiry = data.validUntil?.toDate();
                return expiry && expiry > new Date();
            });
            setHasOverride(!!validDoc);
        });

        return () => {
            unsubSchedules();
            unsubLogsToday();
            unsubLogsYesterday();
            unsubActions();
            unsubOver();
        };
    }, [userId]);

    const getShiftsForDate = (targetDate: Date) => {
        const dateStr = getLocalDateKey(targetDate);
        const dayOfWeek = targetDate.getDay();
        
        const specific = schedules.find(s => s.date === dateStr);
        if (specific) {
            if ((specific.locationId || '').includes('Off') || (specific.note || '').includes('Off')) {
                return [];
            }
            return specific.shifts || parseMultiShifts(specific.note || "");
        }

        const applicable = schedules.filter(sch => {
            if (sch.date) return false;
            if (sch.validFrom && dateStr < sch.validFrom) return false;
            if (sch.validTo && dateStr > sch.validTo) return false;

            const isFri = (sch.locationId || '').toLowerCase().includes('friday') || (sch.note || '').toLowerCase().includes('friday');
            
            if (dayOfWeek === 5) {
                return isFri;
            } else {
                if (isFri) return false;
                if ((sch.locationId || '').includes('Holiday')) return false;
                return true;
            }
        });

        applicable.sort((a, b) => {
            const aHasRange = !!a.validFrom;
            const bHasRange = !!b.validFrom;
            if (aHasRange && !bHasRange) return -1;
            if (!aHasRange && bHasRange) return 1;
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

    const shiftLogic = useMemo(() => {
        const todayShifts = getShiftsForDate(currentTime);
        const yestDate = new Date(currentTime);
        yestDate.setDate(yestDate.getDate() - 1);
        const yesterdayShifts = getShiftsForDate(yestDate);

        return calculateShiftStatus(currentTime, todayLogs, yesterdayLogs, todayShifts, hasOverride, yesterdayShifts, todayAction);
    }, [todayLogs, yesterdayLogs, schedules, hasOverride, logicTicker, currentTime, todayAction]);

    return shiftLogic;
};
