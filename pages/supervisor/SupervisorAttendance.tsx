
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { doc, collection, query, where, getDocs, writeBatch, limit, orderBy, addDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { User, Schedule, AttendanceLog, ActionLog } from '../../types';
import Toast from '../../components/Toast';
import Modal from '../../components/Modal';
import { useLanguage } from '../../contexts/LanguageContext';
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

    serverTimestamp?: any;
    clientTimestamp?: any;

    lateMinutes: number;
    earlyMinutes: number;
    dailyWorkMinutes: number;
    overtimeMinutes: number;
    status: 'Present' | 'Absent' | 'Incomplete' | 'Off' | 'Partial Absent';
    absentValue: number; // 0, 0.5, 1.0
    riskFlags: string[];
}

interface EmployeeAttendanceSummary {
    userId: string;
    userName: string;
    totalWorkDays: number;
    fridaysWorked: number;
    totalLateMinutes: number;
    totalEarlyMinutes: number;
    totalOvertimeHours: number;
    absentDays: number;
    riskCount: number;
    details: DailyDetail[];
}

const SupervisorAttendance: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
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

    // Map Modal
    const [mapModal, setMapModal] = useState<{isOpen: boolean, lat: number, lng: number, title: string}>({ isOpen: false, lat: 0, lng: 0, title: '' });

    // Manual Log Modal State
    const [manualModal, setManualModal] = useState<{isOpen: boolean, uid: string, name: string, date: string, type: 'IN' | 'OUT' | string}>({
        isOpen: false, uid: '', name: '', date: '', type: 'IN'
    });
    const [manualTime, setManualTime] = useState('08:00');

    useEffect(() => {
        getDocs(collection(db, 'users')).then(snap => setUsers(snap.docs.map(d => ({id:d.id, ...d.data()} as User))));
    }, []);

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
            totalLateMinutes: 0, 
            totalEarlyMinutes: 0,
            totalOvertimeHours: 0, 
            absentDays: 0, 
            riskCount: 0,
            details: []
        }));

        // --- 1. OPTIMIZED SCHEDULE FETCHING ---
        let qSch;
        if (attFilterUser) {
            qSch = query(collection(db, 'schedules'), where('userId', '==', attFilterUser));
        } else {
            qSch = query(collection(db, 'schedules'), where('validTo', '>=', attFilterStart));
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

        // --- 2. FETCH LOGS ---
        const qLogs = query(
            collection(db, 'attendance_logs'), 
            where('date', '>=', startD.toISOString().split('T')[0]), 
            where('date', '<=', fetchEndD.toISOString().split('T')[0])
        );
        const snapLogs = await getDocs(qLogs);
        const allLogs = snapLogs.docs.map(doc => doc.data() as AttendanceLog);
        
        const logsMap = new Map<string, AttendanceLog[]>();
        allLogs.forEach(log => {
            const key = `${log.userId}_${log.date}`;
            if (!logsMap.has(key)) logsMap.set(key, []);
            logsMap.get(key)!.push(log);
        });
        
        logsMap.forEach((logsList) => {
            logsList.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
        });

        // --- 3. FETCH LEAVES ---
        const qLeaves = query(collection(db, 'leaveRequests'), where('status', '==', 'approved'));
        const snapLeaves = await getDocs(qLeaves);
        const leaves = snapLeaves.docs.map(d => d.data());

        // --- 4. MAIN CALCULATION LOOP ---
        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayOfWeek = d.getDay();

            usersToProcess.forEach(user => {
                const summary = summaryMap.get(user.id)!;
                let myShifts: { start: string, end: string }[] = [];
                
                const userSchedules = schedulesByUser.get(user.id) || [];
                const specific = userSchedules.find(s => s.date === dateStr);
                if (specific) {
                    myShifts = specific.shifts || parseMultiShifts(specific.note || "");
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
                            if (parsed.length > 0) myShifts = parsed;
                        }
                    });
                }

                // --- Match Logs ---
                const todayLogs = logsMap.get(`${user.id}_${dateStr}`) || [];
                const insToday = todayLogs.filter(l => l.type === 'IN');
                const outsToday = todayLogs.filter(l => l.type === 'OUT');

                let in1 = null, out1 = null, in2 = null, out2 = null;

                if (insToday.length > 0) {
                    in1 = insToday[0];
                    out1 = outsToday.find(o => 
                        o.timestamp.seconds > in1!.timestamp.seconds &&
                        (o.timestamp.seconds - in1!.timestamp.seconds) < 57600
                    );
                    
                    if (!out1) {
                        const nextD = new Date(d);
                        nextD.setDate(d.getDate() + 1);
                        const nextDateStr = nextD.toISOString().split('T')[0];
                        const nextDayLogs = logsMap.get(`${user.id}_${nextDateStr}`) || [];
                        out1 = nextDayLogs.find(o => 
                            o.type === 'OUT' &&
                            (o.timestamp.seconds - in1!.timestamp.seconds) < 57600 
                        );
                    }

                    if (insToday.length > 1) {
                        in2 = insToday[1];
                        out2 = outsToday.find(o => 
                            o.timestamp.seconds > in2!.timestamp.seconds &&
                            o.timestamp.seconds !== out1?.timestamp.seconds
                        );
                    }
                } 

                if (!in1 && outsToday.length > 0) {
                    const prevD = new Date(d);
                    prevD.setDate(d.getDate() - 1);
                    const prevDateStr = prevD.toISOString().split('T')[0];
                    const prevLogs = logsMap.get(`${user.id}_${prevDateStr}`) || [];
                    const lastInPrev = prevLogs.filter(l => l.type === 'IN').pop();
                    const isLinkedToPrev = lastInPrev && (outsToday[0].timestamp.seconds - lastInPrev.timestamp.seconds) < 57600;
                    if (!isLinkedToPrev) {
                        out1 = outsToday[0];
                    }
                }

                // --- Calculations ---
                let status: 'Present'|'Absent'|'Incomplete'|'Off'|'Partial Absent' = 'Absent';
                let lateMins = 0;
                let earlyMins = 0;
                let workMinutes = 0;
                let absentValue = 0;
                let flags: string[] = [];

                const fmtTime = (log: any) => log ? log.timestamp.toDate().toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit'}) : null;

                const isOnLeave = leaves.some(l => l.from === user.id && l.startDate <= dateStr && l.endDate >= dateStr);

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
                } else {
                    status = 'Off';
                }

                if (status === 'Present' || status === 'Partial Absent' || status === 'Incomplete') {
                    summary.totalWorkDays++;
                    if (dayOfWeek === 5) summary.fridaysWorked++;
                    
                    if (in1 && out1) workMinutes += Math.round((out1.timestamp.seconds - in1.timestamp.seconds) / 60);
                    if (in2 && out2) workMinutes += Math.round((out2.timestamp.seconds - in2.timestamp.seconds) / 60);

                    // Late Logic (Shift 1)
                    if (myShifts[0] && in1) {
                        const schedStart = timeToMinutes(myShifts[0].start);
                        const actStart = timeToMinutes(fmtTime(in1)!);
                        if (actStart > schedStart + 15) lateMins += (actStart - schedStart);
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

                summary.absentDays += absentValue;
                summary.totalLateMinutes += lateMins;
                summary.totalEarlyMinutes += earlyMins;

                [in1, out1, in2, out2].forEach(l => {
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
                    lateMinutes: lateMins, 
                    earlyMinutes: earlyMins,
                    serverTimestamp: in1?.timestamp,
                    clientTimestamp: in1?.clientTimestamp,
                    dailyWorkMinutes: workMinutes, 
                    overtimeMinutes: workMinutes > 540 ? workMinutes - 540 : 0, 
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
                            const newDoc = doc(actionRef);
                            batch.set(newDoc, {
                                employeeId: summary.userId,
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
                "Total Late (Mins)": s.totalLateMinutes,
                "Total Early Leave (Mins)": s.totalEarlyMinutes,
                "Total Overtime (Hrs)": s.totalOvertimeHours.toFixed(2),
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
                        "Work (Mins)": d.dailyWorkMinutes,
                        "Late (Mins)": d.lateMinutes,
                        "Early (Mins)": d.earlyMinutes,
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
    const totalLate = attendanceSummaries.reduce((acc, curr) => acc + curr.totalLateMinutes, 0);
    const totalOvertime = attendanceSummaries.reduce((acc, curr) => acc + curr.totalOvertimeHours, 0);

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-12 print:bg-white print:pb-0" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
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
                        <input type="date" className="bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold text-slate-700" value={attFilterStart} onChange={e => setAttFilterStart(e.target.value)} />
                        <span className="text-slate-400">➜</span>
                        <input type="date" className="bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold text-slate-700" value={attFilterEnd} onChange={e => setAttFilterEnd(e.target.value)} />
                        <div className="h-6 w-px bg-slate-200 mx-1"></div>
                        <select className="bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold text-slate-700 outline-none" value={attFilterUser} onChange={e => setAttFilterUser(e.target.value)}>
                            <option value="">All Staff</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                        </select>
                        <button onClick={calculateAttendance} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-2">
                            {isCalculatingAtt ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>} Refresh
                        </button>
                        
                        {/* Show Suspicious Toggle */}
                        <button 
                            onClick={() => setShowOnlySuspicious(!showOnlySuspicious)} 
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${showOnlySuspicious ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-500'}`}
                            title="Show only rows with fraud or risk"
                        >
                            <i className="fas fa-shield-alt"></i> Risk Filter
                        </button>

                        <button onClick={handleSyncAbsences} disabled={isSyncing || attendanceSummaries.length === 0} className="bg-rose-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" title="Register absent days to reports">
                            {isSyncing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-export"></i>} Sync
                        </button>
                        <button onClick={handleExportExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2">
                            <i className="fas fa-file-excel"></i> Export
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
                                <h3 className="text-3xl font-black">{totalLate} <span className="text-sm font-medium opacity-80">Mins</span></h3>
                            </div>
                            <div className="bg-white/20 p-3 rounded-xl"><i className="fas fa-clock text-2xl"></i></div>
                        </div>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-emerald-100 font-bold text-xs uppercase tracking-wider mb-1">Total Overtime</p>
                                <h3 className="text-3xl font-black">{totalOvertime.toFixed(1)} <span className="text-sm font-medium opacity-80">Hours</span></h3>
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
                                            <th className="p-3 text-center text-amber-600">Late (Mins)</th>
                                            <th className="p-3 text-center text-orange-600">Early (Mins)</th>
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
                                                        <td className="p-3 text-center font-bold text-amber-600">{summary.totalLateMinutes}</td>
                                                        <td className="p-3 text-center font-bold text-orange-600">{summary.totalEarlyMinutes}</td>
                                                        <td className="p-3 text-center font-bold text-emerald-600">{summary.totalOvertimeHours > 0 ? summary.totalOvertimeHours.toFixed(1) : '-'}</td>
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
                                                    {(expandedUser === summary.userId || showOnlySuspicious) && (
                                                        <tr>
                                                            <td colSpan={10} className="p-0 bg-slate-50/50">
                                                                <div className="p-2 border-b border-slate-200">
                                                                    <table className="w-full text-[10px]">
                                                                        <thead className="bg-slate-200 text-slate-600 uppercase">
                                                                            <tr>
                                                                                <th className="p-2">Date</th>
                                                                                <th className="p-2">Day</th>
                                                                                <th className="p-2 text-center text-blue-700 border-l border-slate-300">Shift 1 In</th>
                                                                                <th className="p-2 text-center text-blue-700">Shift 1 Out</th>
                                                                                <th className="p-2 text-center text-indigo-700 border-l border-slate-300">Shift 2 In</th>
                                                                                <th className="p-2 text-center text-indigo-700">Shift 2 Out</th>
                                                                                <th className="p-2 text-center border-l border-slate-300">Work (Mins)</th>
                                                                                <th className="p-2 text-center text-amber-700">Late</th>
                                                                                <th className="p-2 text-center text-orange-700">Early</th>
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

                                                                                    <td className="p-2 text-center font-mono border-l border-slate-100">{detail.dailyWorkMinutes > 0 ? detail.dailyWorkMinutes : '-'}</td>
                                                                                    <td className="p-2 text-center text-amber-600 font-bold">{detail.lateMinutes > 0 ? detail.lateMinutes : '-'}</td>
                                                                                    <td className="p-2 text-center text-orange-600 font-bold">{detail.earlyMinutes > 0 ? detail.earlyMinutes : '-'}</td>
                                                                                    
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
                                                    )}
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
