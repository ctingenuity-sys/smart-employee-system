import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { AttendanceLog, Schedule, ActionLog, LeaveRequest } from '../types';
import { calculateShiftStatus, toMins, ActiveActionRecord } from '../utils/attendanceLogic';

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
    const [todayAction, setTodayAction] = useState<ActiveActionRecord | string | null>(null);
    const [hasOverride, setHasOverride] = useState(false);
    const [logicTicker, setLogicTicker] = useState(0);

    // Raw actions & leaves state
    const [actionsList, setActionsList] = useState<any[]>([]);
    const [leaveRequestsList, setLeaveRequestsList] = useState<LeaveRequest[]>([]);

    // Loading States
    const [loadingSchedules, setLoadingSchedules] = useState(true);
    const [loadingLogsToday, setLoadingLogsToday] = useState(true);
    const [loadingLogsYesterday, setLoadingLogsYesterday] = useState(true);
    const [loadingActions, setLoadingActions] = useState(true);
    const [loadingOverrides, setLoadingOverrides] = useState(true);

    // Time ticker
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
            setLogicTicker(prev => prev + 1);
        }, 10000); // update every 10s
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!userId) {
            setLoadingSchedules(false);
            setLoadingLogsToday(false);
            setLoadingLogsYesterday(false);
            setLoadingActions(false);
            setLoadingOverrides(false);
            return;
        }

        const todayDate = new Date();
        const todayStr = getLocalDateKey(todayDate);
        const yesterdayDate = new Date(todayDate);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = getLocalDateKey(yesterdayDate);

        // 1. Fetch Schedules
        const qSchedules = query(
            collection(db, 'schedules'), 
            where('userId', '==', userId)
        );
        const unsubSchedules = onSnapshot(qSchedules, snap => {
            setSchedules(snap.docs.map(d => ({ ...d.data(), id: d.id } as Schedule)));
            setLoadingSchedules(false);
        });

        // 2. Fetch Today Logs
        const qLogsToday = query(collection(db, 'attendance_logs'), where('userId', '==', userId), where('date', '==', todayStr));
        const unsubLogsToday = onSnapshot(qLogsToday, snap => {
            setTodayLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as AttendanceLog)));
            setLoadingLogsToday(false);
        });

        // 3. Fetch Yesterday Logs
        const qLogsYesterday = query(collection(db, 'attendance_logs'), where('userId', '==', userId), where('date', '==', yesterdayStr));
        const unsubLogsYesterday = onSnapshot(qLogsYesterday, snap => {
            setYesterdayLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as AttendanceLog)));
            setLoadingLogsYesterday(false);
        });

        // 4. Fetch Actions from 'actions' (by employeeId and by userId) & 'action_logs'
        const qActionsEmp = query(collection(db, 'actions'), where('employeeId', '==', userId));
        const qActionsUser = query(collection(db, 'actions'), where('userId', '==', userId));
        const qActionLogs = query(collection(db, 'action_logs'), where('userId', '==', userId));

        let actionsMap: Record<string, any> = {};

        const updateCombinedActions = () => {
            const allItems = Object.values(actionsMap);
            setActionsList(allItems);
            setLoadingActions(false);
        };

        const unsubActEmp = onSnapshot(qActionsEmp, snap => {
            snap.docs.forEach(d => { actionsMap[`emp_${d.id}`] = { ...d.data(), id: d.id }; });
            updateCombinedActions();
        }, () => setLoadingActions(false));

        const unsubActUser = onSnapshot(qActionsUser, snap => {
            snap.docs.forEach(d => { actionsMap[`usr_${d.id}`] = { ...d.data(), id: d.id }; });
            updateCombinedActions();
        }, () => setLoadingActions(false));

        const unsubActLogs = onSnapshot(qActionLogs, snap => {
            snap.docs.forEach(d => { actionsMap[`log_${d.id}`] = { ...d.data(), id: d.id }; });
            updateCombinedActions();
        }, () => setLoadingActions(false));

        // 5. Fetch Approved Leave Requests
        const qLeaves = query(collection(db, 'leaveRequests'), where('from', '==', userId));
        const unsubLeaves = onSnapshot(qLeaves, snap => {
            const leaves = snap.docs.map(d => ({ ...d.data(), id: d.id } as LeaveRequest));
            setLeaveRequestsList(leaves);
        }, () => {});

        // 6. Fetch Overrides
        const qOverride = query(collection(db, 'attendance_overrides'), where('userId', '==', userId));
        const unsubOver = onSnapshot(qOverride, snap => {
            const validDoc = snap.docs.find(d => {
                const data = d.data();
                const expiry = data.validUntil?.toDate();
                return expiry && expiry > new Date();
            });
            setHasOverride(!!validDoc);
            setLoadingOverrides(false);
        });

        return () => {
            unsubSchedules();
            unsubLogsToday();
            unsubLogsYesterday();
            unsubActEmp();
            unsubActUser();
            unsubActLogs();
            unsubLeaves();
            unsubOver();
        };
    }, [userId]);

    // Active action calculation for today
    useEffect(() => {
        const todayStr = getLocalDateKey(currentTime);

        // 1. Check approved leaves
        const activeApprovedLeave = leaveRequestsList.find(l => {
            const isApproved = (l.status as string) === 'approved' || (l.status as string) === 'approvedBySupervisor' || (l.status as string) === 'approvedByManager';
            if (!isApproved) return false;
            const start = l.startDate;
            const end = l.endDate || l.startDate;
            return start <= todayStr && end >= todayStr;
        });

        if (activeApprovedLeave) {
            const leaveTypeStr = activeApprovedLeave.typeOfLeave || 'إجازة رسمية';
            setTodayAction({
                type: activeApprovedLeave.typeOfLeave ? `leave_${activeApprovedLeave.typeOfLeave.toLowerCase()}` : 'annual_leave',
                title: `إجازة ${leaveTypeStr} معتمدة`,
                subtitle: activeApprovedLeave.reason || `معتمدة من ${activeApprovedLeave.startDate} إلى ${activeApprovedLeave.endDate}`,
                reason: activeApprovedLeave.reason,
                startDate: activeApprovedLeave.startDate,
                endDate: activeApprovedLeave.endDate
            });
            return;
        }

        // 2. Check actions / penalties / permissions / delays / absences in actions collection
        const activeActionItem = actionsList.find(a => {
            const from = a.fromDate || a.date || a.startDate;
            const to = a.toDate || a.date || a.endDate || from;
            if (!from) return false;
            return from <= todayStr && to >= todayStr;
        });

        if (activeActionItem) {
            const type = activeActionItem.type || 'action';
            setTodayAction({
                type,
                title: activeActionItem.title || activeActionItem.name,
                subtitle: activeActionItem.subtitle || activeActionItem.description,
                description: activeActionItem.description || activeActionItem.notes,
                reason: activeActionItem.reason || activeActionItem.description,
                hours: activeActionItem.hours || activeActionItem.duration,
                timeFrom: activeActionItem.timeFrom,
                timeTo: activeActionItem.timeTo,
                startDate: activeActionItem.fromDate || activeActionItem.date,
                endDate: activeActionItem.toDate || activeActionItem.date
            });
            return;
        }

        setTodayAction(null);
    }, [currentTime, actionsList, leaveRequestsList]);

    const getShiftsForDate = (targetDate: Date) => {
        // ... (existing implementation) ...
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

    const loading = loadingSchedules || loadingLogsToday || loadingLogsYesterday || loadingActions || loadingOverrides;

    return { ...shiftLogic, loading };
};
