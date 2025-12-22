
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, getDocs, writeBatch, limit, orderBy } from 'firebase/firestore';
import { User, Schedule, AttendanceLog } from '../../types';
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

    lateMinutes: number;
    earlyMinutes: number;
    dailyWorkMinutes: number;
    overtimeMinutes: number;
    status: 'Present' | 'Absent' | 'Incomplete' | 'Off';
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
    const [expandedUser, setExpandedUser] = useState<string | null>(null);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);

    // Map Modal
    const [mapModal, setMapModal] = useState<{isOpen: boolean, lat: number, lng: number, title: string}>({ isOpen: false, lat: 0, lng: 0, title: '' });

    useEffect(() => {
        getDocs(collection(db, 'users')).then(snap => setUsers(snap.docs.map(d => ({id:d.id, ...d.data()} as User))));
    }, []);

    const calculateAttendance = async () => {
    setIsCalculatingAtt(true);
    setAttendanceSummaries([]);
    try {
        const startD = new Date(attFilterStart);
        const endD = new Date(attFilterEnd);
        // نزيد يوماً واحداً في البحث لجلب بصمات الخروج التي تقع في صباح اليوم التالي
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

        const qSch = query(collection(db, 'schedules')); 
        const snapSch = await getDocs(qSch);
        const schedules = snapSch.docs.map(doc => doc.data() as Schedule);

        // جلب اللوجات للفترة المطلوبة + يوم إضافي
        const qLogs = query(
            collection(db, 'attendance_logs'), 
            where('date', '>=', startD.toISOString().split('T')[0]), 
            where('date', '<=', fetchEndD.toISOString().split('T')[0])
        );
        const snapLogs = await getDocs(qLogs);
        const allLogs = snapLogs.docs.map(doc => doc.data() as AttendanceLog);
        
        // ترتيب كل اللوجات زمنياً لضمان دقة الربط
        const allLogsSorted = allLogs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayOfWeek = d.getDay();

            usersToProcess.forEach(user => {
                const summary = summaryMap.get(user.id)!;
                let myShifts: { start: string, end: string }[] = [];
                
                // --- (هنا يبقى منطق استخراج الجدول myShifts كما هو في كودك الأصلي) ---
                const userSchedules = schedules.filter(s => s.userId === user.id);
                const specific = userSchedules.find(s => s.date === dateStr);
                if (specific) {
                    myShifts = specific.shifts || parseMultiShifts(specific.note || "");
                } else {
                    userSchedules.forEach(sch => {
                        if (sch.date) return;
                        let applies = false;
                        const isFri = (sch.locationId || '').toLowerCase().includes('friday');
                        if (dayOfWeek === 5) { if (isFri) applies = true; } else { if (!isFri && !(sch.locationId || '').includes('Holiday')) applies = true; }
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

                // --- منطق الربط الجديد (يدعم الشفت الليلي وبصمة مقصود) ---
                
                // 1. بصمات الدخول لهذا اليوم الفعلي
                const insToday = allLogsSorted.filter(l => l.userId === user.id && l.type === 'IN' && l.date === dateStr);
                // 2. بصمات الخروج لهذا اليوم الفعلي (قد تشمل بصمة خروج مقصود)
                const outsToday = allLogsSorted.filter(l => l.userId === user.id && l.type === 'OUT' && l.date === dateStr);

                let in1 = null, out1 = null, in2 = null, out2 = null;

                if (insToday.length > 0) {
                    in1 = insToday[0];
                    // نبحث عن أول خروج "بعد" هذا الدخول (حتى لو في يوم آخر) في كامل المصفوفة المرتبة
                    out1 = allLogsSorted.find(o => 
                        o.userId === user.id && 
                        o.type === 'OUT' && 
                        o.timestamp.seconds > in1.timestamp.seconds &&
                        (o.timestamp.seconds - in1.timestamp.seconds) < 57600 // أقصى مدة 16 ساعة
                    );

                    if (insToday.length > 1) {
                        in2 = insToday[1];
                        out2 = allLogsSorted.find(o => 
                            o.userId === user.id && 
                            o.type === 'OUT' && 
                            o.timestamp.seconds > in2.timestamp.seconds &&
                            o.timestamp.seconds !== out1?.timestamp.seconds
                        );
                    }
                } 

                // حالة "مقصود": إذا لم نجد دخول اليوم، ولكن يوجد خروج اليوم غير مرتبط بدخول سابق
                if (!in1 && outsToday.length > 0) {
                    // نتحقق إذا كان الخروج يخص شفت بدأ بالأمس (عبر منتصف الليل)
                    const linkedToYesterday = allLogsSorted.find(i => 
                        i.userId === user.id && i.type === 'IN' && 
                        i.timestamp.seconds < outsToday[0].timestamp.seconds &&
                        (outsToday[0].timestamp.seconds - i.timestamp.seconds) < 57600
                    );
                    
                    if (!linkedToYesterday) {
                        out1 = outsToday[0]; // أظهر البصمة كخروج وحيد
                    }
                }

                // --- حسابات الحالة والوقت ---
                let status: 'Present'|'Absent'|'Incomplete'|'Off' = 'Absent';
                let lateMins = 0;
                let workMinutes = 0;
                let flags: string[] = [];

                const fmtTime = (log: any) => log ? log.timestamp.toDate().toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit'}) : null;

                if (in1 || out1) {
                    status = (in1 && out1) ? 'Present' : 'Incomplete';
                    summary.totalWorkDays++;
                    if (dayOfWeek === 5) summary.fridaysWorked++;

                    if (in1 && out1) {
                        workMinutes += Math.round((out1.timestamp.seconds - in1.timestamp.seconds) / 60);
                    }
                    
                    // تأخر الشفت الأول
                    if (myShifts[0] && in1) {
                        const schedStart = timeToMinutes(myShifts[0].start);
                        const actStart = timeToMinutes(fmtTime(in1)!);
                        if (actStart > schedStart + 15) lateMins += (actStart - schedStart);
                    }
                } else {
                    status = myShifts.length > 0 ? 'Absent' : 'Off';
                    if (status === 'Absent') summary.absentDays++;
                }

                // إضافة المخاطر (Fake Loc)
                [in1, out1, in2, out2].forEach(l => {
                    if (l && l.distanceKm && l.distanceKm > 0.15) flags.push(`Fake Loc`);
                });

                summary.totalLateMinutes += lateMins;
                if (flags.length > 0) summary.riskCount++;

                summary.details.push({
                    date: dateStr, 
                    day: d.toLocaleDateString('en-US', {weekday:'short'}),
                    shiftsScheduled: myShifts,
                    actualIn1: fmtTime(in1),
                    actualOut1: fmtTime(out1),
                    in1Lat: in1?.locationLat, in1Lng: in1?.locationLng,
                    out1Lat: out1?.locationLat, out1Lng: out1?.locationLng,
                    actualIn2: fmtTime(in2),
                    actualOut2: fmtTime(out2),
                    in2Lat: in2?.locationLat, in2Lng: in2?.locationLng,
                    out2Lat: out2?.locationLat, out2Lng: out2?.locationLng,
                    lateMinutes: lateMins, 
                    earlyMinutes: 0,
                    dailyWorkMinutes: workMinutes, 
                    overtimeMinutes: workMinutes > 540 ? workMinutes - 540 : 0, 
                    status,
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

    const handleExportExcel = () => {
        if (attendanceSummaries.length === 0) return setToast({ msg: 'No data to export', type: 'error' });
        
        try {
            const wb = window.XLSX.utils.book_new();

            // 1. Summary Sheet
            const summaryData = attendanceSummaries.map(s => ({
                "Employee Name": s.userName,
                "Work Days": s.totalWorkDays,
                "Fridays Worked": s.fridaysWorked,
                "Absent Days": s.absentDays,
                "Total Late (Mins)": s.totalLateMinutes,
                "Total Overtime (Hrs)": s.totalOvertimeHours.toFixed(2),
                "Risk Flags": s.riskCount
            }));
            const wsSummary = window.XLSX.utils.json_to_sheet(summaryData);
            window.XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

            // 2. Detailed Sheet
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
                        "Status": d.status,
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
                        <button onClick={handleExportExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2">
                            <i className="fas fa-file-excel"></i> Export Excel
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
                                <p className="text-pink-100 font-bold text-xs uppercase tracking-wider mb-1">Total Absence</p>
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
                                            <th className="p-3 text-center text-emerald-600">Overtime (Hrs)</th>
                                            <th className="p-3 text-center text-purple-600">Risks</th>
                                            <th className="p-3 text-center print:hidden">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                                        {attendanceSummaries.length === 0 ? (
                                            <tr><td colSpan={9} className="p-8 text-center text-slate-400">Click 'Refresh Report' to load data.</td></tr>
                                        ) : (
                                            attendanceSummaries.map((summary, i) => (
                                                <React.Fragment key={summary.userId}>
                                                    <tr className="hover:bg-slate-50/50 print:break-inside-avoid">
                                                        <td className="p-3 font-bold text-slate-800">{summary.userName}</td>
                                                        <td className="p-3 text-center font-mono">{summary.totalWorkDays}</td>
                                                        <td className="p-3 text-center font-mono">{summary.fridaysWorked}</td>
                                                        <td className="p-3 text-center font-bold text-red-600">{summary.absentDays}</td>
                                                        <td className="p-3 text-center font-bold text-amber-600">{summary.totalLateMinutes}</td>
                                                        <td className="p-3 text-center font-bold text-emerald-600">{summary.totalOvertimeHours > 0 ? summary.totalOvertimeHours.toFixed(1) : '-'}</td>
                                                        <td className="p-3 text-center font-bold text-purple-600">
                                                            {summary.riskCount > 0 ? <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded animate-pulse">{summary.riskCount} Flags</span> : '-'}
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
                                                    {/* Expanded Details - UPDATED FOR 4 PUNCHES */}
                                                    {(expandedUser === summary.userId) && (
                                                        <tr>
                                                            <td colSpan={9} className="p-0 bg-slate-50/50">
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
                                                                                <th className="p-2 text-center">Status</th>
                                                                                <th className="p-2 text-center">Risks</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-100 bg-white">
                                                                            {summary.details.map((detail, idx) => (
                                                                                <tr key={idx}>
                                                                                    <td className="p-2">{detail.date}</td>
                                                                                    <td className="p-2">{detail.day}</td>
                                                                                    
                                                                                    {/* Shift 1 */}
                                                                                    <td className="p-2 text-center font-mono text-emerald-600 border-l border-slate-100">
                                                                                        {detail.actualIn1 || '-'}
                                                                                        {detail.in1Lat && <button onClick={() => openMapModal(detail.in1Lat!, detail.in1Lng!, 'IN 1')} className="ml-1 text-blue-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                    </td>
                                                                                    <td className="p-2 text-center font-mono text-red-500">
                                                                                        {detail.actualOut1 || '-'}
                                                                                        {detail.out1Lat && <button onClick={() => openMapModal(detail.out1Lat!, detail.out1Lng!, 'OUT 1')} className="ml-1 text-red-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                    </td>

                                                                                    {/* Shift 2 */}
                                                                                    <td className="p-2 text-center font-mono text-emerald-600 border-l border-slate-100">
                                                                                        {detail.actualIn2 || '-'}
                                                                                        {detail.in2Lat && <button onClick={() => openMapModal(detail.in2Lat!, detail.in2Lng!, 'IN 2')} className="ml-1 text-blue-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                    </td>
                                                                                    <td className="p-2 text-center font-mono text-red-500">
                                                                                        {detail.actualOut2 || '-'}
                                                                                        {detail.out2Lat && <button onClick={() => openMapModal(detail.out2Lat!, detail.out2Lng!, 'OUT 2')} className="ml-1 text-red-400"><i className="fas fa-map-marker-alt"></i></button>}
                                                                                    </td>

                                                                                    <td className="p-2 text-center font-mono border-l border-slate-100">{detail.dailyWorkMinutes > 0 ? detail.dailyWorkMinutes : '-'}</td>
                                                                                    <td className="p-2 text-center">
                                                                                        <span className={`px-2 py-0.5 rounded ${detail.status === 'Present' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{detail.status}</span>
                                                                                    </td>
                                                                                    <td className="p-2 text-center">
                                                                                        {detail.riskFlags.length > 0 ? (
                                                                                            <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 rounded border border-red-100">!</span>
                                                                                        ) : <span className="text-green-400"><i className="fas fa-check"></i></span>}
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

            {/* Map Modal with Embedded Iframe */}
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
        </div>
    );
};

export default SupervisorAttendance;
