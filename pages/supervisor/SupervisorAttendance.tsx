
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { doc, collection, query, where, getDocs, writeBatch, limit, orderBy, addDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { User, Schedule, AttendanceLog, ActionLog } from '../../types';
import Toast from '../../components/Toast';
import Modal from '../../components/Modal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDepartment } from '../../contexts/DepartmentContext';
import { PrintHeader, PrintFooter } from '../../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

// Ensure XLSX is available (loaded via CDN in index.html)
declare global {
    interface Window {
        XLSX: any;
    }
}

// --- Logic Helpers ---
const convertTo24Hour = (timeStr: string): string | null => {
    if (!timeStr) return null;
    let s = timeStr.toLowerCase().trim();
    s = s.replace(/(\d+)\.(\d+)/, '$1:$2');
    if (s.match(/\b12\s*:?\s*0{0,2}\s*mn\b/)) return '24:00';
    if (s.match(/\b12\s*:?\s*0{0,2}\s*n\b/)) return '12:00';
    let modifier = null;
    if (s.includes('pm')) modifier = 'pm'; else if (s.includes('am')) modifier = 'am';
    const cleanTime = s.replace(/[^\d:]/g, ''); 
    const parts = cleanTime.split(':');
    let h = parseInt(parts[0], 10);
    let m = parts[1] ? parseInt(parts[1], 10) : 0;
    if (modifier) { if (modifier === 'pm' && h < 12) h += 12; if (modifier === 'am' && h === 12) h = 0; }
    if (h === 24) return '24:00';
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};


const parseMultiShifts = (text: string) => {
    if (!text) return [];
    const segments = text.trim().split(/[\/,]|\s+and\s+|&/i);
    const shifts: { start: string, end: string }[] = [];
    segments.forEach(seg => {
        const rangeParts = seg.trim().split(/\s*(?:[-–—]|\bto\b)\s*/i);
        if (rangeParts.length >= 2) {
            const s = convertTo24Hour(rangeParts[0].trim());
            const e = convertTo24Hour(rangeParts[rangeParts.length - 1].trim());
            if (s && e) shifts.push({ start: s, end: e });
        }
    });
    return shifts;
};

const timeToMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
};

// --- Updated: Special Day Detection ---
const detectSpecialDay = (specific: any) => {
    if (!specific) return { category: null, name: null };
    const note = (specific.note || "").toLowerCase();
    const loc = (specific.locationId || "").toLowerCase();
    const period = (specific.periodName || "").toLowerCase();
    
    const isExceptionFlag = specific.isException === true || (specific.id && specific.id.includes('_Exception_'));
    const isHolidayFlag = loc.includes('holiday') || note.includes('holiday') || note.includes('عيد') || note.includes('eid') || note.includes('broken') || period.includes('eid');
    
    if (isHolidayFlag) {
        return { category: 'holiday', name: 'Eid / Holiday' };
    }
    
    if (isExceptionFlag || note.includes('استثنائية') || note.includes('exceptional') || note.includes('foundation') || note.includes('ramadan') || note.includes('pro') || note.includes('x-ray')) {
        if (note.includes('foundation') || period.includes('foundation')) return { category: 'exceptional', name: 'Foundation Day' };
        if (note.includes('ramadan') || period.includes('ramadan')) return { category: 'exceptional', name: 'Ramadan' };
        return { category: 'exceptional', name: 'Exceptional' };
    }
    
    if (note.includes('سكليف') || note.includes('sick')) {
        return { category: 'sick', name: null };
    }
    
    return { category: null, name: null };
};

// --- NEW HELPER: Format Hours to HH.MM (Minutes as decimal part) ---
const formatAsDotMinutes = (decimalHours: number) => {
    if (!decimalHours || isNaN(decimalHours)) return '0.00';
    const h = Math.floor(decimalHours);
    const m = Math.round((decimalHours - h) * 60);
    return `${h}.${m.toString().padStart(2, '0')}`;
};

// Helper to hydrate archived logs (convert ISO strings back to objects with .toDate)
const hydrateArchiveLogs = (jsonLogs: any[]): AttendanceLog[] => {
    return jsonLogs.map(log => {
        // Create mock Firestore Timestamp objects
        const createMockTimestamp = (isoStr: string) => {
            if (!isoStr) return null;
            const d = new Date(isoStr);
            return {
                seconds: Math.floor(d.getTime() / 1000),
                nanoseconds: 0,
                toDate: () => d
            };
        };

        return {
            ...log,
            timestamp: typeof log.timestamp === 'string' ? createMockTimestamp(log.timestamp) : log.timestamp,
            clientTimestamp: typeof log.clientTimestamp === 'string' ? createMockTimestamp(log.clientTimestamp) : log.clientTimestamp,
        };
    });
};

interface DailyDetail {
    date: string;
    day: string;
    shiftsScheduled: { start: string; end: string }[];
    
    // Shift 1
    actualIn1: string | null;
    actualOut1: string | null;
    in1Lat?: number;
    in1Lng?: number;
    out1Lat?: number;
    out1Lng?: number;

    // Shift 2
    actualIn2: string | null;
    actualOut2: string | null;
    in2Lat?: number;
    in2Lng?: number;
    out2Lat?: number;
    out2Lng?: number;

    // Shift 3
    actualIn3?: string | null;
    actualOut3?: string | null;
    in3Lat?: number;
    in3Lng?: number;
    out3Lat?: number;
    out3Lng?: number;

    // Shift 4
    actualIn4?: string | null;
    actualOut4?: string | null;
    in4Lat?: number;
    in4Lng?: number;
    out4Lat?: number;
    out4Lng?: number;

    serverTimestamp?: any;
    clientTimestamp?: any;

    lateHours: number;
    earlyHours: number;
    dailyWorkHours: number;
    overtimeHours: number;
    status: 'Present' | 'Absent' | 'Incomplete' | 'Off' | 'Partial Absent';
    absentValue: number; // 0, 0.5, 1.0
    riskFlags: string[];
}

interface EmployeeAttendanceSummary {
    userId: string;
    userName: string;
    totalWorkDays: number;
    fridaysWorked: number;
    totalLateHours: number;
    totalEarlyHours: number;
    totalOvertimeHours: number;
    absentDays: number;
    authorizedAbsenceDays: number; // NEW
    holidayDays: number; // NEW
    exceptionalDays: number; // NEW
    sickLeaveDays: number; // NEW
    specialDays: Record<string, number>; // NEW: Map of day name -> count
    riskCount: number;
    details: DailyDetail[];
}

const SupervisorAttendance: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const { selectedDepartmentId, departments } = useDepartment();
    const [users, setUsers] = useState<User[]>([]);
    const [attendanceSummaries, setAttendanceSummaries] = useState<EmployeeAttendanceSummary[]>([]);
    const [attFilterUser, setAttFilterUser] = useState('');
    const [attFilterStart, setAttFilterStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [attFilterEnd, setAttFilterEnd] = useState(new Date().toISOString().split('T')[0]);
    const [isCalculatingAtt, setIsCalculatingAtt] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [expandedUser, setExpandedUser] = useState<string | null>(null);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'info'|'error'} | null>(null);
    const [showOnlySuspicious, setShowOnlySuspicious] = useState(false);
    
    // OVERTIME SETTING
    const [overtimeThreshold, setOvertimeThreshold] = useState<number>(9); // Default 9 hours

    // --- Offline Mode State ---
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [offlineLogs, setOfflineLogs] = useState<AttendanceLog[]>([]);

    // Map Modal
    const [mapModal, setMapModal] = useState<{isOpen: boolean, lat: number, lng: number, title: string}>({ isOpen: false, lat: 0, lng: 0, title: '' });

    // Manual Log Modal State
    const [manualModal, setManualModal] = useState<{isOpen: boolean, uid: string, name: string, date: string, type: 'IN' | 'OUT' | string}>({
        isOpen: false, uid: '', name: '', date: '', type: 'IN'
    });
    const [manualTime, setManualTime] = useState('08:00');

    useEffect(() => {
        const qUsers = selectedDepartmentId 
            ? query(collection(db, 'users'), where('departmentId', '==', selectedDepartmentId))
            : collection(db, 'users');
            
        getDocs(qUsers).then(snap => {
            const fetchedUsers = snap.docs.map(d => ({id:d.id, ...d.data()} as User));
            setUsers(fetchedUsers.filter(u => !['admin', 'supervisor', 'manager'].includes(u.role)));
        });
    }, [selectedDepartmentId]);

    const handleImportArchive = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    const hydrated = hydrateArchiveLogs(json);
                    setOfflineLogs(hydrated);
                    setIsOfflineMode(true);
                    
                    // Auto-set dates based on imported data
                    const dates = hydrated.map((l: any) => l.date).sort();
                    if (dates.length > 0) {
                        setAttFilterStart(dates[0]);
                        setAttFilterEnd(dates[dates.length - 1]);
                    }
                    
                    setToast({ msg: `تم استيراد ${hydrated.length} سجل. وضع الأوفلاين مفعل.`, type: 'success' });
                } else {
                    setToast({ msg: 'ملف غير صالح', type: 'error' });
                }
            } catch (err) {
                setToast({ msg: 'خطأ في قراءة الملف', type: 'error' });
            }
        };
        reader.readAsText(file);
    };

    const clearOfflineMode = () => {
        setIsOfflineMode(false);
        setOfflineLogs([]);
        setAttendanceSummaries([]);
        setToast({ msg: 'تم العودة للوضع المباشر', type: 'info' });
    };

    const calculateAttendance = async () => {
    setIsCalculatingAtt(true);
    setAttendanceSummaries([]);
    try {
        const startD = new Date(attFilterStart);
        const endD = new Date(attFilterEnd);
        // Extend fetch range by 2 days to catch late check-outs or overnight shifts
        const fetchEndD = new Date(endD); 
        fetchEndD.setDate(fetchEndD.getDate() + 2); 

        const summaryMap = new Map<string, EmployeeAttendanceSummary>();
        const usersToProcess = attFilterUser ? users.filter(u => u.id === attFilterUser) : users;
        
        usersToProcess.forEach(u => summaryMap.set(u.id, {
            userId: u.id, 
            userName: u.name || u.email, 
            totalWorkDays: 0, 
            fridaysWorked: 0, 
            totalLateHours: 0, 
            totalEarlyHours: 0,
            totalOvertimeHours: 0, 
            absentDays: 0, 
            authorizedAbsenceDays: 0, // NEW
            holidayDays: 0, // NEW
            exceptionalDays: 0, // NEW
            sickLeaveDays: 0, // NEW
            specialDays: {}, // NEW
            riskCount: 0,
            details: []
        }));

        // --- 1. OPTIMIZED SCHEDULE FETCHING ---
        const withDept = (baseQuery: any) => selectedDepartmentId ? query(baseQuery, where('departmentId', '==', selectedDepartmentId)) : baseQuery;

        let qSch;
        if (attFilterUser) {
            qSch = query(collection(db, 'schedules'), where('userId', '==', attFilterUser));
        } else {
            qSch = withDept(query(collection(db, 'schedules'), where('validTo', '>=', attFilterStart)));
        }
        
        const snapSch = await getDocs(qSch);
        const rawSchedules = snapSch.docs
            .map(doc => doc.data() as Schedule)
            .filter(s => !s.validFrom || s.validFrom <= attFilterEnd);

        const schedulesByUser = new Map<string, Schedule[]>();
        rawSchedules.forEach(s => {
            if (!schedulesByUser.has(s.userId)) schedulesByUser.set(s.userId, []);
            schedulesByUser.get(s.userId)!.push(s);
        });

        // --- 2. FETCH LOGS (LIVE OR OFFLINE) ---
        let allLogs: AttendanceLog[] = [];
        
        if (isOfflineMode) {
            // Filter offline logs by date
            const fetchEndDateStr = fetchEndD.toISOString().split('T')[0];
            const startStr = startD.toISOString().split('T')[0];
            allLogs = offlineLogs.filter(l => l.date >= startStr && l.date <= fetchEndDateStr);
        } else {
            // Fetch from Firebase
            let qLogs;
            if (attFilterUser) {
                qLogs = query(
                    collection(db, 'attendance_logs'), 
                    where('userId', '==', attFilterUser),
                    where('date', '>=', startD.toISOString().split('T')[0]), 
                    where('date', '<=', fetchEndD.toISOString().split('T')[0])
                );
            } else {
                qLogs = withDept(query(
                    collection(db, 'attendance_logs'), 
                    where('date', '>=', startD.toISOString().split('T')[0]), 
                    where('date', '<=', fetchEndD.toISOString().split('T')[0])
                ));
            }
            const snapLogs = await getDocs(qLogs);
            allLogs = snapLogs.docs.map(doc => doc.data() as AttendanceLog);
        }
        
        const logsMap = new Map<string, AttendanceLog[]>();
        allLogs.forEach(log => {
            const key = `${log.userId}_${log.date}`;
            if (!logsMap.has(key)) logsMap.set(key, []);
            logsMap.get(key)!.push(log);
        });
        
        logsMap.forEach((logsList) => {
            // FIX: Safe sort checking for null timestamps
            logsList.sort((a, b) => {
                const tA = a.timestamp?.seconds || a.clientTimestamp?.seconds || 0;
                const tB = b.timestamp?.seconds || b.clientTimestamp?.seconds || 0;
                return tA - tB;
            });
        });

        // --- 3. FETCH LEAVES ---
        const qLeaves = withDept(query(collection(db, 'leaveRequests'), where('status', '==', 'approved')));
        const snapLeaves = await getDocs(qLeaves);
        const leaves = snapLeaves.docs.map(d => d.data());

        // Overtime Threshold in Minutes
        const otThresholdMins = overtimeThreshold * 60;

        // --- 4. MAIN CALCULATION LOOP ---
        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayOfWeek = d.getDay();

            usersToProcess.forEach(user => {
                const summary = summaryMap.get(user.id)!;
                let myShifts: { start: string, end: string }[] = [];
                
                const userSchedules = schedulesByUser.get(user.id) || [];
                const specific = userSchedules.find(s => s.date === dateStr);
                
                let specialDayCategory = null;
                let specialDayName = null;

                if (specific) {
                    myShifts = specific.shifts || parseMultiShifts(specific.note || "");
                    const detected = detectSpecialDay(specific);
                    specialDayCategory = detected.category;
                    specialDayName = detected.name;
                } else {
                    userSchedules.forEach(sch => {
                        if (sch.date) return;
                        let applies = false;
                        const isFri = (sch.locationId || '').toLowerCase().includes('friday');
                        
                        if (dayOfWeek === 5) { 
                            if (isFri) applies = true; 
                        } else { 
                            if (!isFri && !(sch.locationId || '').includes('Holiday')) applies = true; 
                        }
                        
                        if (applies) {
                            if (sch.validFrom && dateStr < sch.validFrom) applies = false;
                            if (sch.validTo && dateStr > sch.validTo) applies = false;
                        }
                        
                        if (applies) {
                            const parsed = sch.shifts || parseMultiShifts(sch.note||"");
                            if (parsed.length > 0) {
                                myShifts = parsed;
                            }
                        }
                    });
                }

                if (specialDayCategory === 'holiday') summary.holidayDays++;
                else if (specialDayCategory === 'exceptional') summary.exceptionalDays++;
                else if (specialDayCategory === 'sick') summary.sickLeaveDays++;

                // Track special day by name
                if (specialDayName) {
                    summary.specialDays[specialDayName] = (summary.specialDays[specialDayName] || 0) + 1;
                }

                // --- Match Logs ---
                const getLogSeconds = (log: any) => log?.timestamp?.seconds || log?.clientTimestamp?.seconds || 0;
                
                let dayLogs = [...(logsMap.get(`${user.id}_${dateStr}`) || [])];
                
                const nextD = new Date(d);
                nextD.setDate(d.getDate() + 1);
                const nextDateStr = nextD.toISOString().split('T')[0];
                const nextDayLogs = [...(logsMap.get(`${user.id}_${nextDateStr}`) || [])].sort((a, b) => getLogSeconds(a) - getLogSeconds(b));
                
                let earlyNextDayOuts = [];
                for (const log of nextDayLogs) {
                    if (log.type === 'IN') break; // Stop at the first IN
                    if (log.type === 'OUT') {
                        const logDate = log.timestamp?.toDate() || log.clientTimestamp?.toDate();
                        if (logDate && logDate.getHours() < 12) {
                            earlyNextDayOuts.push(log);
                        }
                    }
                }
                
                let allRelevantLogs = [...dayLogs, ...earlyNextDayOuts].sort((a, b) => getLogSeconds(a) - getLogSeconds(b));
                
                // Remove early morning OUTs that belong to the previous day
                while (allRelevantLogs.length > 0 && allRelevantLogs[0].type === 'OUT') {
                    const firstOut = allRelevantLogs[0];
                    const logDate = firstOut.timestamp?.toDate() || firstOut.clientTimestamp?.toDate();
                    if (logDate && logDate.getHours() < 12 && firstOut.date === dateStr) {
                        allRelevantLogs.shift();
                    } else {
                        break;
                    }
                }
                
                // Clean up duplicate logs (within 60 minutes of the same type)
                let cleanedLogs: any[] = [];
                for (const log of allRelevantLogs) {
                    if (cleanedLogs.length === 0) {
                        cleanedLogs.push(log);
                        continue;
                    }
                    const lastLog = cleanedLogs[cleanedLogs.length - 1];
                    if (lastLog.type === log.type) {
                        const diffMins = (getLogSeconds(log) - getLogSeconds(lastLog)) / 60;
                        if (diffMins < 60) {
                            if (log.type === 'OUT') {
                                // For OUT, keep the LAST one
                                cleanedLogs[cleanedLogs.length - 1] = log;
                            }
                            // For IN, keep the FIRST one (do nothing)
                        } else {
                            cleanedLogs.push(log);
                        }
                    } else {
                        cleanedLogs.push(log);
                    }
                }
                allRelevantLogs = cleanedLogs;
                
                let pairs: { inLog: any, outLog: any }[] = [];
                let currentPair: { inLog: any, outLog: any } = { inLog: null, outLog: null };
                
                for (const log of allRelevantLogs) {
                    if (log.type === 'IN') {
                        if (currentPair.inLog) {
                            pairs.push({ ...currentPair });
                        }
                        currentPair = { inLog: log, outLog: null };
                    } else if (log.type === 'OUT') {
                        if (currentPair.inLog) {
                            currentPair.outLog = log;
                            pairs.push({ ...currentPair });
                            currentPair = { inLog: null, outLog: null };
                        } else {
                            if (log.date === dateStr) {
                                pairs.push({ inLog: null, outLog: log });
                            }
                        }
                    }
                }
                if (currentPair.inLog || currentPair.outLog) {
                    if (currentPair.inLog?.date === dateStr || currentPair.outLog?.date === dateStr) {
                        pairs.push({ ...currentPair });
                    }
                }
                
                let in1 = null, out1 = null, in2 = null, out2 = null, in3 = null, out3 = null, in4 = null, out4 = null;
                
                if (myShifts.length > 0) {
                    let assignedPairs: any[] = new Array(myShifts.length).fill(null);
                    let assignedDiffs: number[] = new Array(myShifts.length).fill(999999);
                    let extraPairs: any[] = [];
                    
                    for (const pair of pairs) {
                        let pairTimeMins = 0;
                        const refLog = pair.inLog || pair.outLog;
                        if (refLog) {
                            const dLog = refLog.timestamp?.toDate() || refLog.clientTimestamp?.toDate();
                            if (dLog) {
                                pairTimeMins = dLog.getHours() * 60 + dLog.getMinutes();
                                const logDateStr = `${dLog.getFullYear()}-${String(dLog.getMonth() + 1).padStart(2, '0')}-${String(dLog.getDate()).padStart(2, '0')}`;
                                if (logDateStr !== dateStr) {
                                    pairTimeMins += 1440; // Next day
                                }
                            }
                        }
                        
                        let closestShiftIdx = -1;
                        let minDiff = 999999;
                        
                        for (let i = 0; i < myShifts.length; i++) {
                            const shiftStart = timeToMinutes(myShifts[i].start);
                            let shiftEnd = timeToMinutes(myShifts[i].end);
                            if (shiftEnd < shiftStart) shiftEnd += 1440;
                            const shiftMid = (shiftStart + shiftEnd) / 2;
                            
                            const diff = Math.abs(pairTimeMins - shiftMid);
                            if (diff < minDiff) {
                                minDiff = diff;
                                closestShiftIdx = i;
                            }
                        }
                        
                        if (closestShiftIdx !== -1) {
                            if (!assignedPairs[closestShiftIdx]) {
                                assignedPairs[closestShiftIdx] = pair;
                                assignedDiffs[closestShiftIdx] = minDiff;
                            } else {
                                // Slot taken, compare diffs
                                if (minDiff < assignedDiffs[closestShiftIdx]) {
                                    // New pair is closer, push old pair to extra
                                    extraPairs.push(assignedPairs[closestShiftIdx]);
                                    assignedPairs[closestShiftIdx] = pair;
                                    assignedDiffs[closestShiftIdx] = minDiff;
                                } else {
                                    // Old pair is closer, push new pair to extra
                                    extraPairs.push(pair);
                                }
                            }
                        } else {
                            extraPairs.push(pair);
                        }
                    }
                    
                    // Fill remaining slots with extra pairs
                    for (let i = 0; i < myShifts.length; i++) {
                        if (!assignedPairs[i] && extraPairs.length > 0) {
                            assignedPairs[i] = extraPairs.shift();
                        }
                    }
                    
                    // Any remaining extra pairs go to the end
                    assignedPairs.push(...extraPairs);
                    
                    if (assignedPairs[0]) { in1 = assignedPairs[0].inLog; out1 = assignedPairs[0].outLog; }
                    if (assignedPairs[1]) { in2 = assignedPairs[1].inLog; out2 = assignedPairs[1].outLog; }
                    if (assignedPairs[2]) { in3 = assignedPairs[2].inLog; out3 = assignedPairs[2].outLog; }
                    if (assignedPairs[3]) { in4 = assignedPairs[3].inLog; out4 = assignedPairs[3].outLog; }
                } else {
                    if (pairs.length > 0) { in1 = pairs[0].inLog; out1 = pairs[0].outLog; }
                    if (pairs.length > 1) { in2 = pairs[1].inLog; out2 = pairs[1].outLog; }
                    if (pairs.length > 2) { in3 = pairs[2].inLog; out3 = pairs[2].outLog; }
                    if (pairs.length > 3) { in4 = pairs[3].inLog; out4 = pairs[3].outLog; }
                }

                // --- Calculations ---
                let status: 'Present'|'Absent'|'Incomplete'|'Off'|'Partial Absent' = 'Absent';
                let lateMins = 0;
                let earlyMins = 0;
                let workMinutes = 0;
                let absentValue = 0;
                let flags: string[] = [];

                const fmtTime = (log: any) => {
                    if (!log) return null;
                    const ts = log.timestamp || log.clientTimestamp;
                    if (!ts || !ts.toDate) return null;
                    return ts.toDate().toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit'});
                };

                const isOnLeave = (leaves as any[]).some(l => l.from === user.id && l.startDate <= dateStr && l.endDate >= dateStr);

                if (myShifts.length > 0 && !isOnLeave) {
                    if (myShifts.length === 2) {
                        let shiftsMissed = 0;
                        if (!in1 && !out1) shiftsMissed += 0.5;
                        if (!in2 && !out2) shiftsMissed += 0.5;

                        absentValue = shiftsMissed;
                        if (absentValue === 0) status = 'Present';
                        else if (absentValue === 0.5) status = 'Partial Absent';
                        else status = 'Absent';

                    } else {
                        if (!in1 && !out1) {
                            absentValue = 1.0;
                            status = 'Absent';
                        } else {
                            status = (in1 && out1) ? 'Present' : 'Incomplete';
                        }
                    }
                } else if (isOnLeave) {
                    status = 'Off';
                    summary.authorizedAbsenceDays += 1.0; // Count as authorized absence
                } else {
                    status = 'Off';
                }

                if (status === 'Present' || status === 'Partial Absent' || status === 'Incomplete') {
                    summary.totalWorkDays++;
                    if (dayOfWeek === 5) summary.fridaysWorked++;
                    
                    if (in1 && out1) workMinutes += Math.round((getLogSeconds(out1) - getLogSeconds(in1)) / 60);
                    if (in2 && out2) workMinutes += Math.round((getLogSeconds(out2) - getLogSeconds(in2)) / 60);
                    if (in3 && out3) workMinutes += Math.round((getLogSeconds(out3) - getLogSeconds(in3)) / 60);
                    if (in4 && out4) workMinutes += Math.round((getLogSeconds(out4) - getLogSeconds(in4)) / 60);

                    // Late Logic (Shift 1)
                    if (myShifts[0] && in1) {
                        const schedStart = timeToMinutes(myShifts[0].start);
                        const actStart = timeToMinutes(fmtTime(in1)!);
                        
                        // Modified Late Logic for Grace Period 15-20 min
                        const diff = actStart - schedStart;
                        if (diff > 15) {
                            if (diff <= 20) {
                                // If late between 15-20 mins:
                                // 1. Treat as full overtime (add lost minutes back to workMinutes)
                                // 2. Do not record as late minutes
                                workMinutes += diff; 
                            } else {
                                // If late > 20 mins:
                                // Full penalty
                                lateMins += diff;
                            }
                        }
                    }
                    
                    // Early Logic (Shift 1 - only if out1 exists)
                    if (myShifts[0] && out1) {
                        const schedEnd = timeToMinutes(myShifts[0].end);
                        let actEnd = timeToMinutes(fmtTime(out1)!);
                        
                        // Handle overnight crossing for accurate calculation
                        if (schedEnd < timeToMinutes(myShifts[0].start)) {
                             // Shift ends next day. 
                             // If out1 is early morning (e.g. 02:00), treat as +1440
                             if (actEnd < 720) actEnd += 1440;
                             // schedEnd also +1440
                             const adjSchedEnd = schedEnd + 1440;
                             if (actEnd < adjSchedEnd - 15) earlyMins += (adjSchedEnd - actEnd);
                        } else {
                             if (actEnd < schedEnd - 15) earlyMins += (schedEnd - actEnd);
                        }
                    }
                }

                // Overtime Calculation
                let dailyOvertime = 0;
                if (workMinutes > otThresholdMins) {
                    dailyOvertime = workMinutes - otThresholdMins;
                    
                    // --- NEW RULE: Round up OT if minutes part >= 40 ---
                    const remainder = dailyOvertime % 60;
                    if (remainder >= 40) {
                        // Add the missing minutes to reach the next full hour
                        dailyOvertime += (60 - remainder);
                    }
                }

                if (status === 'Absent') {
                    summary.absentDays += absentValue;
                }
                summary.totalLateHours += (lateMins / 60);
                summary.totalEarlyHours += (earlyMins / 60);
                summary.totalOvertimeHours += (dailyOvertime / 60); // Accumulate adjusted hours

                [in1, out1, in2, out2].forEach((l: any) => {
                    if (l) {
                        if (l.isSuspicious) {
                            const type = l.violationType || 'SUSPICIOUS_ACTIVITY';
                            flags.push(type === 'MOCK_LOCATION_DETECTED' ? 'FAKE_GPS' : type);
                        }
                        if (l.distanceKm && l.distanceKm > 0.15) {
                            flags.push('OUT_OF_RANGE');
                        }
                    }
                });
                
                if (flags.length > 0) summary.riskCount++;

                summary.details.push({
                    date: dateStr, 
                    day: d.toLocaleDateString('en-US', {weekday:'short'}),
                    shiftsScheduled: myShifts,
                    actualIn1: fmtTime(in1), actualOut1: fmtTime(out1),
                    in1Lat: in1?.locationLat, in1Lng: in1?.locationLng,
                    out1Lat: out1?.locationLat, out1Lng: out1?.locationLng,
                    actualIn2: fmtTime(in2), actualOut2: fmtTime(out2),
                    in2Lat: in2?.locationLat, in2Lng: in2?.locationLng,
                    out2Lat: out2?.locationLat, out2Lng: out2?.locationLng,
                    actualIn3: fmtTime(in3), actualOut3: fmtTime(out3),
                    in3Lat: in3?.locationLat, in3Lng: in3?.locationLng,
                    out3Lat: out3?.locationLat, out3Lng: out3?.locationLng,
                    actualIn4: fmtTime(in4), actualOut4: fmtTime(out4),
                    in4Lat: in4?.locationLat, in4Lng: in4?.locationLng,
                    out4Lat: out4?.locationLat, out4Lng: out4?.locationLng,
                    lateHours: lateMins / 60, 
                    earlyHours: earlyMins / 60,
                    serverTimestamp: in1?.timestamp,
                    clientTimestamp: in1?.clientTimestamp,
                    dailyWorkHours: workMinutes / 60, 
                    overtimeHours: dailyOvertime / 60, 
                    status,
                    absentValue,
                    riskFlags: [...new Set(flags)] 
                });
            });
        }
        setAttendanceSummaries(Array.from(summaryMap.values()));
    } catch(e) { 
        console.error(e); 
        setToast({msg:'Error calculating attendance', type:'error'}); 
    } finally { 
        setIsCalculatingAtt(false); 
    }
};

    const handleSyncAbsences = async () => {
        if (isOfflineMode) return setToast({ msg: 'Cannot sync absences in offline mode', type: 'error' });
        if (attendanceSummaries.length === 0) return setToast({msg: 'Please calculate attendance first', type: 'info'});
        if (!confirm(`Are you sure you want to register absences for the period ${attFilterStart} to ${attFilterEnd}? This will affect employee reports.`)) return;

        setIsSyncing(true);
        try {
            const batch = writeBatch(db);
            const actionRef = collection(db, 'actions');
            let count = 0;

            const qExist = query(
                actionRef, 
                where('type', '==', 'unjustified_absence'),
                where('fromDate', '>=', attFilterStart)
            );
            const existSnap = await getDocs(qExist);
            const existingKeys = new Set(
                existSnap.docs
                    .map(d => d.data())
                    .filter((d: any) => d.toDate <= attFilterEnd)
                    .map((d: any) => `${d.employeeId}_${d.fromDate}`)
            );

            for (const summary of attendanceSummaries) {
                for (const day of summary.details) {
                    if (day.absentValue > 0) {
                        const key = `${summary.userId}_${day.date}`;
                        if (!existingKeys.has(key)) {
                            // Find user to get departmentId
                            const userRecord = users.find(u => u.id === summary.userId);
                            
                            const newDoc = doc(actionRef);
                            batch.set(newDoc, {
                                employeeId: summary.userId,
                                departmentId: userRecord?.departmentId || selectedDepartmentId || null,
                                type: 'unjustified_absence',
                                fromDate: day.date,
                                toDate: day.date,
                                description: `System Auto-Absent: ${day.absentValue} Day(s) (No Punch)`,
                                weight: day.absentValue,
                                createdAt: Timestamp.now()
                            });
                            count++;
                        }
                    }
                }
            }

            if (count > 0) {
                await batch.commit();
                setToast({ msg: `Successfully registered ${count} absence records!`, type: 'success' });
            } else {
                setToast({ msg: 'No new absences to register.', type: 'info' });
            }

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Error syncing: ' + e.message, type: 'error' });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleExportExcel = () => {
        if (attendanceSummaries.length === 0) return setToast({ msg: 'No data to export', type: 'error' });
        
        try {
            const wb = window.XLSX.utils.book_new();

            const summaryData = attendanceSummaries.map(s => ({
                "Employee Name": s.userName,
                "Work Days": s.totalWorkDays,
                "Fridays Worked": s.fridaysWorked,
                "Absent Days": s.absentDays,
                "Holiday Days": s.holidayDays,
                "Exceptional Days": s.exceptionalDays,
                "Sick Leave Days": s.sickLeaveDays,
                "Total Late (Hrs.Mins)": formatAsDotMinutes(s.totalLateHours),
                "Total Early Leave (Hrs.Mins)": formatAsDotMinutes(s.totalEarlyHours),
                "Total Overtime (Hrs.Mins)": formatAsDotMinutes(s.totalOvertimeHours),
                "Risk Flags": s.riskCount
            }));
            const wsSummary = window.XLSX.utils.json_to_sheet(summaryData);
            window.XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

            const detailedData: any[] = [];
            attendanceSummaries.forEach(s => {
                s.details.forEach(d => {
                    detailedData.push({
                        "Employee": s.userName,
                        "Date": d.date,
                        "Day": d.day,
                        "Shift 1 In": d.actualIn1 || '--:--',
                        "Shift 1 Out": d.actualOut1 || '--:--',
                        "Shift 2 In": d.actualIn2 || '--:--',
                        "Shift 2 Out": d.actualOut2 || '--:--',
                        "Shift 3 In": d.actualIn3 || '--:--',
                        "Shift 3 Out": d.actualOut3 || '--:--',
                        "Shift 4 In": d.actualIn4 || '--:--',
                        "Shift 4 Out": d.actualOut4 || '--:--',
                        "Work (Hrs.Mins)": formatAsDotMinutes(d.dailyWorkHours),
                        "Late (Hrs.Mins)": formatAsDotMinutes(d.lateHours),
                        "Early (Hrs.Mins)": formatAsDotMinutes(d.earlyHours),
                        "Overtime (Hrs.Mins)": formatAsDotMinutes(d.overtimeHours),
                        "Status": d.status,
                        "Absence Value": d.absentValue,
                        "Risks": d.riskFlags.join(', ')
                    });
                });
            });
            const wsDetail = window.XLSX.utils.json_to_sheet(detailedData);
            window.XLSX.utils.book_append_sheet(wb, wsDetail, "Detailed Logs");

            window.XLSX.writeFile(wb, `Attendance_Report_${attFilterStart}_to_${attFilterEnd}.xlsx`);
            setToast({ msg: 'Excel Exported Successfully', type: 'success' });

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Export Failed', type: 'error' });
        }
    };

    const handlePayrollReport = () => {
        if (attendanceSummaries.length === 0) return setToast({ msg: 'No data to export', type: 'error' });
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const selectedDept = departments.find(d => d.id === selectedDepartmentId);
        const deptName = selectedDept ? selectedDept.name : 'Department of Radiology';

        let content = `
            <html>
                <head>
                    <title>Payroll Report</title>
                    <style>
                        @page { size: landscape; margin: 15px; }
                        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                        
                        /* Header Styles */
                        .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #2c3e50; padding-bottom: 15px; margin-bottom: 20px; }
                        .hospital-info { display: flex; align-items: center; gap: 15px; }
                        .logo-placeholder { width: 70px; height: 70px; background-color: #ecf0f1; border: 2px dashed #bdc3c7; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #7f8c8d; border-radius: 50%; font-weight: bold; }
                        .hospital-text h2 { margin: 0; color: #2c3e50; font-size: 22px; text-transform: uppercase; letter-spacing: 1px; outline: none; }
                        .hospital-text p { margin: 4px 0 0; color: #7f8c8d; font-size: 14px; outline: none; }
                        .report-title { text-align: right; }
                        .report-title h1 { margin: 0; font-size: 24px; color: #2c3e50; }
                        .report-title p { margin: 5px 0 0; font-size: 14px; color: #7f8c8d; font-weight: bold; }
                        
                        /* Table Styles */
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                        th, td { border: 1px solid #bdc3c7; padding: 8px 4px; text-align: center; }
                        th { background-color: #ecf0f1; color: #2c3e50; font-weight: bold; }
                        
                        /* Editable Elements */
                        .editable-cell { min-width: 60px; min-height: 16px; outline: none; cursor: text; }
                        .editable-cell:hover { background-color: #fdfd96; }
                        .editable-cell:focus { background-color: #fffacd; border-bottom: 1px solid #000; }
                        
                        /* Signatures */
                        .signatures { margin-top: 60px; display: flex; justify-content: space-around; }
                        .sig-box { width: 200px; border-top: 1px solid #000; padding-top: 10px; text-align: center; font-weight: bold; color: #2c3e50; }
                        
                        /* Print Button */
                        @media print {
                            .no-print { display: none !important; }
                            .editable-cell:hover, .editable-cell:focus { background-color: transparent; border-bottom: none; }
                        }
                        .controls {
                            position: fixed; top: 20px; right: 20px; display: flex; gap: 10px; z-index: 1000;
                        }
                        .action-btn {
                            padding: 10px 20px; color: white; border: none; border-radius: 5px;
                            cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                        }
                        .print-btn { background-color: #2980b9; }
                        .print-btn:hover { background-color: #3498db; }
                        .add-col-btn { background-color: #27ae60; }
                        .add-col-btn:hover { background-color: #2ecc71; }
                    </style>
                </head>
                <body>
                    <div class="no-print controls">
                        <button class="action-btn add-col-btn" onclick="addColumn()">+ Add Column</button>
                        <button class="action-btn print-btn" onclick="window.print()">Print Report</button>
                    </div>
                    
                    <div class="header">
                        <div class="hospital-info">
                            <div class="logo-placeholder">LOGO</div>
                            <div class="hospital-text">
                                <h2 contenteditable="true">Hospital Name</h2>
                                <p contenteditable="true">${deptName}</p>
                            </div>
                        </div>
                        <div class="report-title">
                            <h1>Payroll Report</h1>
                            <p>Period: ${attFilterStart} to ${attFilterEnd}</p>
                        </div>
                    </div>
                    
                    <table id="payrollTable">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Employee</th>
                                <th>Work Days</th>
                                <th>Fridays</th>
                                <th>Absent (Unauth)</th>
                                <th>Absent (Auth)</th>
                                <th>Sick Leave</th>
                                <th>Late (Hrs)</th>
                                <th>Early (Hrs)</th>
                                <th>Overtime (Hrs)</th>
                                <th><div class="editable-cell" contenteditable="true">Custom Column</div></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${attendanceSummaries.map((s, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td style="text-align: left; padding-left: 8px; font-weight: bold;">${s.userName}</td>
                                    <td>${s.totalWorkDays}</td>
                                    <td>${s.fridaysWorked}</td>
                                    <td>${s.absentDays}</td>
                                    <td>${s.authorizedAbsenceDays}</td>
                                    <td>${s.sickLeaveDays}</td>
                                    <td>${formatAsDotMinutes(s.totalLateHours)}</td>
                                    <td>${formatAsDotMinutes(s.totalEarlyHours)}</td>
                                    <td>${formatAsDotMinutes(s.totalOvertimeHours)}</td>
                                    <td><div class="editable-cell" contenteditable="true"></div></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div class="signatures">
                        <div class="sig-box">Manager Signature</div>
                        <div class="sig-box">Supervisor Signature</div>
                    </div>

                    <script>
                        function addColumn() {
                            const table = document.getElementById('payrollTable');
                            const theadRow = table.querySelector('thead tr');
                            const tbodyRows = table.querySelectorAll('tbody tr');
                            
                            // Add header cell
                            const th = document.createElement('th');
                            th.innerHTML = '<div class="editable-cell" contenteditable="true">New Column</div>';
                            theadRow.appendChild(th);
                            
                            // Add body cells
                            tbodyRows.forEach(row => {
                                const td = document.createElement('td');
                                td.innerHTML = '<div class="editable-cell" contenteditable="true"></div>';
                                row.appendChild(td);
                            });
                        }
                    </script>
                </body>
            </html>
        `;
        printWindow.document.write(content);
        printWindow.document.close();
    };

    const openMapModal = (lat: number, lng: number, title: string) => {
        setMapModal({ isOpen: true, lat, lng, title });
    };

    // --- MANUAL ENTRY FUNCTIONS ---
    const openManualLog = (uid: string, name: string, date: string, type: 'IN'|'OUT') => {
        setManualModal({ isOpen: true, uid, name, date, type });
        setManualTime('08:00'); 
    };

    const submitManualLog = async () => {
        if (!manualTime) return;
        try {
            const d = new Date(manualModal.date + 'T' + manualTime);
            
            // If offline mode, just update local state
            if (isOfflineMode) {
                const newLog: any = {
                    userId: manualModal.uid,
                    userName: manualModal.name,
                    date: manualModal.date,
                    type: manualModal.type,
                    timestamp: { seconds: d.getTime()/1000, toDate: () => d },
                    clientTimestamp: { seconds: d.getTime()/1000, toDate: () => d },
                    method: 'supervisor_manual_offline',
                    isSuspicious: false,
                    manualEntry: true
                };
                setOfflineLogs(prev => [...prev, newLog]);
                setToast({ msg: 'تمت الإضافة محلياً (لن تحفظ في قاعدة البيانات)', type: 'info' });
                setManualModal({ ...manualModal, isOpen: false });
                return;
            }

            await addDoc(collection(db, 'attendance_logs'), {
                userId: manualModal.uid,
                userName: manualModal.name,
                date: manualModal.date,
                type: manualModal.type,
                timestamp: Timestamp.fromDate(d),
                clientTimestamp: Timestamp.fromDate(d),
                method: 'supervisor_manual',
                isSuspicious: false,
                manualEntry: true
            });
            setToast({ msg: 'Log added successfully. Please Refresh.', type: 'success' });
            setManualModal({ ...manualModal, isOpen: false });
        } catch (e) {
            setToast({ msg: 'Error adding log', type: 'error' });
        }
    };

    const totalAbsent = attendanceSummaries.reduce((acc, curr) => acc + curr.absentDays, 0);
    const totalLate = attendanceSummaries.reduce((acc, curr) => acc + curr.totalLateHours, 0);
    const totalOvertime = attendanceSummaries.reduce((acc, curr) => acc + curr.totalOvertimeHours, 0);

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-12 print:bg-white print:pb-0" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* OFFLINE BANNER */}
            {isOfflineMode && (
                <div className="bg-amber-500 text-white text-center py-2 font-bold text-sm sticky top-0 z-50 shadow-md">
                    ⚠️ OFFLINE MODE: Viewing Archived Data ({offlineLogs.length} records)
                    <button onClick={clearOfflineMode} className="ml-4 bg-white text-amber-600 px-3 py-0.5 rounded text-xs hover:bg-slate-100">
                        Exit to Live
                    </button>
                </div>
            )}

            <PrintHeader title="Attendance Report" subtitle={`${attFilterStart} to ${attFilterEnd}`} />

            <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in print:p-0 print:max-w-none">
                
                {/* Controls (Screen Only) */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 print:hidden">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                            <i className="fas fa-arrow-left rtl:rotate-180"></i>
                        </button>
                        <h1 className="text-2xl font-black text-slate-800">{t('att.title')}</h1>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                        {/* OFFLINE IMPORT BUTTON */}
                        {!isOfflineMode && (
                            <label className="bg-amber-100 text-amber-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-200 transition-all flex items-center gap-2 cursor-pointer border border-amber-200">
                                <i className="fas fa-box-open"></i> Import Archive
                                <input type="file" accept=".json" className="hidden" onChange={handleImportArchive} />
                            </label>
                        )}

                        <input type="date" className="bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold text-slate-700" value={attFilterStart} onChange={e => setAttFilterStart(e.target.value)} />
                        <span className="text-slate-400">➜</span>
                        <input type="date" className="bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold text-slate-700" value={attFilterEnd} onChange={e => setAttFilterEnd(e.target.value)} />
                        <div className="h-6 w-px bg-slate-200 mx-1"></div>
                        <select className="bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold text-slate-700 outline-none" value={attFilterUser} onChange={e => setAttFilterUser(e.target.value)}>
                            <option value="">All Staff</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                        </select>
                        
                        {/* Overtime Setting */}
                        <div className="flex items-center gap-2 px-2 border-l border-slate-200">
                            <span className="text-xs font-bold text-slate-500">OT starts after:</span>
                            <input
                                type="number"
                                min="1"
                                max="24"
                                className="w-12 bg-slate-50 border-none rounded-lg text-xs font-bold text-center text-slate-700 focus:ring-2 focus:ring-emerald-200"
                                value={overtimeThreshold}
                                onChange={(e) => setOvertimeThreshold(Number(e.target.value))}
                            />
                            <span className="text-xs font-bold text-slate-500">Hrs</span>
                        </div>

                        <button onClick={calculateAttendance} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-2">
                            {isCalculatingAtt ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>} {isOfflineMode ? 'Recalculate' : 'Refresh'}
                        </button>
                        
                        {/* Show Suspicious Toggle */}
                        <button 
                            onClick={() => setShowOnlySuspicious(!showOnlySuspicious)} 
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${showOnlySuspicious ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-500'}`}
                            title="Show only rows with fraud or risk"
                        >
                            <i className="fas fa-shield-alt"></i> Risk Filter
                        </button>

                        <button onClick={handleSyncAbsences} disabled={isSyncing || attendanceSummaries.length === 0 || isOfflineMode} className="bg-rose-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" title="Register absent days to reports">
                            {isSyncing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-export"></i>} Sync
                        </button>
                        <button onClick={handleExportExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2">
                            <i className="fas fa-file-excel"></i> Export
                        </button>
                        <button onClick={handlePayrollReport} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-purple-700 transition-all flex items-center gap-2">
                            <i className="fas fa-file-invoice-dollar"></i> Payroll Report
                        </button>
                        <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition-all flex items-center gap-2">
                            <i className="fas fa-print"></i> Print
                        </button>
                    </div>
                </div>

                {/* Summary Cards (Screen Only) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 print:hidden">
                    <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-6 text-white shadow-lg">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-pink-100 font-bold text-xs uppercase tracking-wider mb-1">Total Absence Days</p>
                                <h3 className="text-3xl font-black">{totalAbsent} <span className="text-sm font-medium opacity-80">Days</span></h3>
                            </div>
                            <div className="bg-white/20 p-3 rounded-xl"><i className="fas fa-user-times text-2xl"></i></div>
                        </div>
                    </div>
                    <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-6 text-white shadow-lg">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-amber-100 font-bold text-xs uppercase tracking-wider mb-1">Total Lateness</p>
                                <h3 className="text-3xl font-black">{formatAsDotMinutes(totalLate)} <span className="text-sm font-medium opacity-80">Hrs</span></h3>
                            </div>
                            <div className="bg-white/20 p-3 rounded-xl"><i className="fas fa-clock text-2xl"></i></div>
                        </div>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-emerald-100 font-bold text-xs uppercase tracking-wider mb-1">Total Overtime</p>
                                <h3 className="text-3xl font-black">{formatAsDotMinutes(totalOvertime)} <span className="text-sm font-medium opacity-80">Hours</span></h3>
                            </div>
                            <div className="bg-white/20 p-3 rounded-xl"><i className="fas fa-coins text-2xl"></i></div>
                        </div>
                    </div>
                </div>

                {/* Detailed Table */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-2 print:border-slate-800 print:rounded-none">
                    
                            {/* Summary Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase border-b border-slate-200 print:bg-white print:border-black print:text-black">
                                        <tr>
                                            <th className="p-3">Employee</th>
                                            <th className="p-3 text-center">Work Days</th>
                                            <th className="p-3 text-center">Fridays</th>
                                            <th className="p-3 text-center text-red-600">Absent Days</th>
                                            <th className="p-3 text-center text-amber-600">Late (Hrs)</th>
                                            <th className="p-3 text-center text-orange-600">Early (Hrs)</th>
                                            <th className="p-3 text-center text-emerald-600">Overtime (Hrs)</th>
                                            <th className="p-3 text-center text-purple-600">Risks</th>
                                            <th className="p-3 text-center print:hidden">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                                        {attendanceSummaries.length === 0 ? (
                                            <tr><td colSpan={10} className="p-8 text-center text-slate-400">Click 'Refresh' to calculate.</td></tr>
                                        ) : (
                                            attendanceSummaries
                                            .filter(s => showOnlySuspicious ? s.riskCount > 0 : true)
                                            .map((summary, i) => (
                                                <React.Fragment key={summary.userId}>
                                                    <tr className="hover:bg-slate-50/50 print:break-inside-avoid">
                                                        <td className="p-3 font-bold text-slate-800">{summary.userName}</td>
                                                        <td className="p-3 text-center font-mono">{summary.totalWorkDays}</td>
                                                        <td className="p-3 text-center font-mono">{summary.fridaysWorked}</td>
                                                        <td className="p-3 text-center font-bold text-red-600">{summary.absentDays}</td>
                                                        <td className="p-3 text-center font-bold text-amber-600">{formatAsDotMinutes(summary.totalLateHours)}</td>
                                                        <td className="p-3 text-center font-bold text-orange-600">{formatAsDotMinutes(summary.totalEarlyHours)}</td>
                                                        <td className="p-3 text-center font-bold text-emerald-600">{summary.totalOvertimeHours > 0 ? formatAsDotMinutes(summary.totalOvertimeHours) : '-'}</td>
                                                        <td className="p-3 text-center font-bold text-purple-600">
                                                            {summary.riskCount > 0 ? <span className="bg-red-500 text-white px-2 py-0.5 rounded-full shadow-sm animate-pulse text-[10px]">{summary.riskCount} ALERTS</span> : '-'}
                                                        </td>
                                                        <td className="p-3 text-center print:hidden">
                                                            <button 
                                                                onClick={() => setExpandedUser(expandedUser === summary.userId ? null : summary.userId)}
                                                                className="text-slate-400 hover:text-indigo-600"
                                                            >
                                                                <i className={`fas fa-chevron-${expandedUser === summary.userId ? 'up' : 'down'}`}></i>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    {/* Expanded Details */}
                                                    {(expandedUser === summary.userId || showOnlySuspicious) && (() => {
                                                        const hasShift3 = summary.details.some(d => d.actualIn3 || d.actualOut3);
                                                        const hasShift4 = summary.details.some(d => d.actualIn4 || d.actualOut4);
                                                        return (
                                                        <tr>
                                                            <td colSpan={10} className="p-0 bg-slate-50/50">
                                                                <div className="p-2 border-b border-slate-200 overflow-x-auto">
                                                                    <table className="w-full text-[10px] min-w-max">
                                                                        <thead className="bg-slate-200 text-slate-600 uppercase">
                                                                            <tr>
                                                                                <th className="p-2">Date</th>
                                                                                <th className="p-2">Day</th>
                                                                                <th className="p-2 text-center text-blue-700 border-l border-slate-300">Shift 1 In</th>
                                                                                <th className="p-2 text-center text-blue-700">Shift 1 Out</th>
                                                                                <th className="p-2 text-center text-indigo-700 border-l border-slate-300">Shift 2 In</th>
                                                                                <th className="p-2 text-center text-indigo-700">Shift 2 Out</th>
                                                                                {hasShift3 && <th className="p-2 text-center text-purple-700 border-l border-slate-300">Shift 3 In</th>}
                                                                                {hasShift3 && <th className="p-2 text-center text-purple-700">Shift 3 Out</th>}
                                                                                {hasShift4 && <th className="p-2 text-center text-pink-700 border-l border-slate-300">Shift 4 In</th>}
                                                                                {hasShift4 && <th className="p-2 text-center text-pink-700">Shift 4 Out</th>}
                                                                                <th className="p-2 text-center border-l border-slate-300">Work (Hrs)</th>
                                                                                <th className="p-2 text-center text-amber-700">Late (Hrs)</th>
                                                                                <th className="p-2 text-center text-orange-700">Early (Hrs)</th>
                                                                                <th className="p-2 text-center text-emerald-700">Overtime</th>
                                                                                <th className="p-2 text-center">Status</th>
                                                                                <th className="p-2 text-center">Risk</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-100 bg-white">
                                                                            {summary.details
                                                                                .filter(d => showOnlySuspicious ? d.riskFlags.length > 0 : true)
                                                                                .map((detail, idx) => (
                                                                                <tr key={idx} className={`${detail.riskFlags.length > 0 ? 'bg-red-50 border-l-4 border-red-500' : detail.absentValue > 0 ? 'bg-orange-50' : ''}`}>
                                                                                    <td className="p-2">{detail.date}</td>
                                                                                    <td className="p-2">{detail.day}</td>
                                                                                    
                                                                                    {/* Shift 1 */}
                                                                                    <td className="p-2 text-center font-mono text-emerald-600 border-l border-slate-100 group relative">
                                                                                        {detail.actualIn1 || (
                                                                                            <button 
                                                                                                onClick={() => openManualLog(summary.userId, summary.userName, detail.date, 'IN')}
                                                                                                className="hidden group-hover:inline-block bg-emerald-100 text-emerald-700 text-[9px] px-1 rounded hover:bg-emerald-200"
                                                                                                title="Add IN Punch"
                                                                                            >+ IN</button>
                                                                                        )}
                                                                                        {detail.in1Lat && <button onClick={() => openMapModal(detail.in1Lat!, detail.in1Lng!, 'IN 1')} className="ml-1 text-blue-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                    </td>
                                                                                    <td className="p-2 text-center font-mono text-red-500 group relative">
                                                                                        {detail.actualOut1 || (
                                                                                            <button 
                                                                                                onClick={() => openManualLog(summary.userId, summary.userName, detail.date, 'OUT')}
                                                                                                className="hidden group-hover:inline-block bg-red-100 text-red-700 text-[9px] px-1 rounded hover:bg-red-200"
                                                                                                title="Add OUT Punch"
                                                                                            >+ OUT</button>
                                                                                        )}
                                                                                        {detail.out1Lat && <button onClick={() => openMapModal(detail.out1Lat!, detail.out1Lng!, 'OUT 1')} className="ml-1 text-red-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                    </td>

                                                                                    {/* Shift 2 */}
                                                                                    <td className="p-2 text-center font-mono text-emerald-600 border-l border-slate-100 group relative">
                                                                                        {detail.actualIn2 || (
                                                                                            <button 
                                                                                                onClick={() => openManualLog(summary.userId, summary.userName, detail.date, 'IN')}
                                                                                                className="hidden group-hover:inline-block bg-emerald-100 text-emerald-700 text-[9px] px-1 rounded hover:bg-emerald-200"
                                                                                                title="Add IN Punch"
                                                                                            >+ IN</button>
                                                                                        )}
                                                                                        {detail.in2Lat && <button onClick={() => openMapModal(detail.in2Lat!, detail.in2Lng!, 'IN 2')} className="ml-1 text-blue-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                    </td>
                                                                                    <td className="p-2 text-center font-mono text-red-500 group relative">
                                                                                        {detail.actualOut2 || (
                                                                                            <button 
                                                                                                onClick={() => openManualLog(summary.userId, summary.userName, detail.date, 'OUT')}
                                                                                                className="hidden group-hover:inline-block bg-red-100 text-red-700 text-[9px] px-1 rounded hover:bg-red-200"
                                                                                                title="Add OUT Punch"
                                                                                            >+ OUT</button>
                                                                                        )}
                                                                                        {detail.out2Lat && <button onClick={() => openMapModal(detail.out2Lat!, detail.out2Lng!, 'OUT 2')} className="ml-1 text-red-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                    </td>

                                                                                    {/* Shift 3 */}
                                                                                    {hasShift3 && (
                                                                                        <>
                                                                                            <td className="p-2 text-center font-mono text-emerald-600 border-l border-slate-100 group relative">
                                                                                                {detail.actualIn3 || '-'}
                                                                                                {detail.in3Lat && <button onClick={() => openMapModal(detail.in3Lat!, detail.in3Lng!, 'IN 3')} className="ml-1 text-blue-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                            </td>
                                                                                            <td className="p-2 text-center font-mono text-red-500 group relative">
                                                                                                {detail.actualOut3 || '-'}
                                                                                                {detail.out3Lat && <button onClick={() => openMapModal(detail.out3Lat!, detail.out3Lng!, 'OUT 3')} className="ml-1 text-red-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                            </td>
                                                                                        </>
                                                                                    )}

                                                                                    {/* Shift 4 */}
                                                                                    {hasShift4 && (
                                                                                        <>
                                                                                            <td className="p-2 text-center font-mono text-emerald-600 border-l border-slate-100 group relative">
                                                                                                {detail.actualIn4 || '-'}
                                                                                                {detail.in4Lat && <button onClick={() => openMapModal(detail.in4Lat!, detail.in4Lng!, 'IN 4')} className="ml-1 text-blue-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                            </td>
                                                                                            <td className="p-2 text-center font-mono text-red-500 group relative">
                                                                                                {detail.actualOut4 || '-'}
                                                                                                {detail.out4Lat && <button onClick={() => openMapModal(detail.out4Lat!, detail.out4Lng!, 'OUT 4')} className="ml-1 text-red-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                            </td>
                                                                                        </>
                                                                                    )}

                                                                                    <td className="p-2 text-center font-mono border-l border-slate-100">{detail.dailyWorkHours > 0 ? formatAsDotMinutes(detail.dailyWorkHours) : '-'}</td>
                                                                                    <td className="p-2 text-center text-amber-600 font-bold">{detail.lateHours > 0 ? formatAsDotMinutes(detail.lateHours) : '-'}</td>
                                                                                    <td className="p-2 text-center text-orange-600 font-bold">{detail.earlyHours > 0 ? formatAsDotMinutes(detail.earlyHours) : '-'}</td>
                                                                                    <td className="p-2 text-center text-emerald-600 font-bold">{detail.overtimeHours > 0 ? formatAsDotMinutes(detail.overtimeHours) : '-'}</td>
                                                                                    
                                                                                    <td className="p-2 text-center">
                                                                                        <span className={`px-2 py-0.5 rounded ${detail.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{detail.status}</span>
                                                                                    </td>
                                                                                    <td className="p-2 text-center">
                                                                                        {detail.riskFlags.length > 0 ? (
                                                                                            <div className="flex flex-col gap-1">
                                                                                                {detail.riskFlags.map((flag, fi) => (
                                                                                                    <span key={fi} className="text-[9px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                                                                                        {flag === 'MOCK_LOCATION_DETECTED' ? <><i className="fas fa-satellite-dish mr-1"></i> FAKE GPS</> : 
                                                                                                         flag === 'MANUAL_TIME_CHANGE' ? <><i className="fas fa-clock mr-1"></i> TIME MANIP</> : 
                                                                                                         flag === 'OUT_OF_RANGE' ? <><i className="fas fa-map-marked-alt mr-1"></i> FAR DIST</> : flag}
                                                                                                    </span>
                                                                                                ))}
                                                                                            </div>
                                                                                        ) : '-'}
                                                                                    </td>
                                                                                </tr>
                                                                                
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        );
                                                    })()}
                                                </React.Fragment>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        
                </div>

                <PrintFooter />
            </div>

            {/* Map Modal */}
            <Modal isOpen={mapModal.isOpen} onClose={() => setMapModal({...mapModal, isOpen: false})} title={mapModal.title}>
                <div className="p-2">
                    <p className="text-xs text-slate-500 mb-2">Coordinates: {mapModal.lat}, {mapModal.lng}</p>
                    <div className="w-full h-[400px] bg-slate-100 rounded-xl overflow-hidden mb-3 border border-slate-200">
                        <iframe 
                            width="100%" 
                            height="100%" 
                            frameBorder="0" 
                            scrolling="no" 
                            marginHeight={0} 
                            marginWidth={0} 
                            src={`https://maps.google.com/maps?q=${mapModal.lat},${mapModal.lng}&hl=en&z=15&output=embed`}
                            title="Location Map"
                        ></iframe>
                    </div>
                    <div className="flex justify-center">
                        <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${mapModal.lat},${mapModal.lng}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-blue-600 hover:underline text-xs font-bold flex items-center gap-1"
                        >
                            <i className="fas fa-external-link-alt"></i> Open in Google Maps App
                        </a>
                    </div>
                </div>
            </Modal>

            {/* Manual Entry Modal */}
            <Modal isOpen={manualModal.isOpen} onClose={() => setManualModal({...manualModal, isOpen: false})} title="Add Manual Log">
                <div className="space-y-4">
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs text-amber-800 font-bold">
                        Adding manual log for {manualModal.name} on {manualModal.date}
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold text-slate-500">Punch Type</label>
                        <div className="flex gap-2 mt-1">
                            <button onClick={() => setManualModal({...manualModal, type: 'IN'})} className={`flex-1 py-2 rounded-lg font-bold text-xs ${manualModal.type === 'IN' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>IN</button>
                            <button onClick={() => setManualModal({...manualModal, type: 'OUT'})} className={`flex-1 py-2 rounded-lg font-bold text-xs ${manualModal.type === 'OUT' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}>OUT</button>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-500">Time (HH:MM)</label>
                        <input 
                            type="time" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono font-bold"
                            value={manualTime}
                            onChange={e => setManualTime(e.target.value)}
                        />
                    </div>

                    <button onClick={submitManualLog} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-slate-800">
                        Save Log
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default SupervisorAttendance;
