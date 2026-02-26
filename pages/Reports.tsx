
// ... existing imports
import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { User, ActionLog, Appointment, Schedule, AttendanceLog } from '../types';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import { PrintHeader, PrintFooter } from '../components/PrintLayout';
// @ts-ignore
import { collection, getDocs, addDoc, deleteDoc, updateDoc, doc, Timestamp, query, where, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Helper to safely render date
const safeDate = (val: any) => {
    if (!val) return '-';
    if (typeof val === 'string') return val;
    if (val.toDate) return val.toDate().toLocaleDateString('en-US'); // Firestore Timestamp
    return String(val);
};

// ... existing code ...

// Inside the component return, specifically the Action Log Table:
/*
   Replace the old row rendering with this safer version
*/

// ... inside Reports.tsx ...
// (Locate the Action Log List section)

/* 
   <td className="p-4 text-xs font-mono text-slate-600 border-r print:border-slate-300">
       {safeDate(act.fromDate)} 
       {safeDate(act.fromDate) !== safeDate(act.toDate) && <><br/><i className="fas fa-arrow-down text-[10px] my-1 opacity-50 print:hidden"></i><span className="hidden print:inline"> - </span><br/>{safeDate(act.toDate)}</>}
   </td>
*/

// Full Reports.tsx Content below for safety
const POINTS_PER_MONTH = 120;

const Reports: React.FC = () => {
    // --- State ---
    const { t, dir } = useLanguage();
    const [employees, setEmployees] = useState<User[]>([]);
    const [actions, setActions] = useState<ActionLog[]>([]);
    const [swaps, setSwaps] = useState<any[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'attendance' | 'productivity'>('attendance');

    const [filterEmp, setFilterEmp] = useState('');
    const [filterMonth, setFilterMonth] = useState((new Date().getMonth() + 1).toString());
    const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
    const [filterFromDate, setFilterFromDate] = useState('');
    const [filterToDate, setFilterToDate] = useState('');
    
    // NEW: Productivity Search
    const [prodSearch, setProdSearch] = useState('');

    const [productivityData, setProductivityData] = useState<Appointment[]>([]);
    const [isProductivityLoading, setIsProductivityLoading] = useState(false);

    // --- Modals state ---
    const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
    const [selectedPatientForAppt, setSelectedPatientForAppt] = useState<Appointment | null>(null);
    const [newApptDate, setNewApptDate] = useState('');
    const [newApptTime, setNewApptTime] = useState('');
    const [newApptNote, setNewApptNote] = useState('');

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        employeeId: '',
        type: 'annual_leave',
        fromDate: new Date().toISOString().split('T')[0],
        toDate: new Date().toISOString().split('T')[0],
        description: ''
    });

    const ACTION_WEIGHTS: Record<string, number> = {
        'annual_leave': 0, 
        'sick_leave': 1, 
        'justified_absence': 2, 
        'unjustified_absence': 10,
        'late': 3, 
        'mission': 0, 
        'violation': 10,
        'positive': -5
    };

    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [includeLateness, setIncludeLateness] = useState(true);

    // --- Helpers for Date Range ---
    const getDateRange = () => {
        let start = filterFromDate;
        let end = filterToDate;

        if (!start && !end) {
            if (filterYear && filterMonth) {
                const y = parseInt(filterYear);
                const m = parseInt(filterMonth);
                const mStr = m.toString().padStart(2, '0');
                const lastDayObj = new Date(y, m, 0);
                const yStr = y;
                const lastDStr = lastDayObj.getDate().toString().padStart(2,'0');

                start = `${yStr}-${mStr}-01`;
                end = `${yStr}-${mStr}-${lastDStr}`;
            } else {
                const now = new Date();
                start = now.toISOString().split('T')[0];
                end = now.toISOString().split('T')[0];
            }
        }
        return { start, end };
    };

    const getMonthCount = () => {
        if (filterFromDate && filterToDate) {
            const start = new Date(filterFromDate);
            const end = new Date(filterToDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
            return Math.max(1, Math.round(diffDays / 30)); 
        }
        if (filterYear && !filterMonth) return 12;
        return 1;
    };

    // --- Initial Load (Users & Actions) ---
    useEffect(() => {
        const init = async () => {
            try {
                const aSnap = await getDocs(collection(db, 'actions'));
                setActions(aSnap.docs.map(d => ({ id: d.id, ...d.data() } as ActionLog)));

                const uSnap = await getDocs(collection(db, 'users'));
                setEmployees(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));

                const sSnap = await getDocs(collection(db, 'swapRequests'));
                setSwaps(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [refreshTrigger]);

    // --- Fetch Schedules & Attendance Logs ---
    useEffect(() => {
        const fetchAttendanceData = async () => {
            const { start, end } = getDateRange();
            if (!start || !end) return;

            try {
                // 1. Calculate months in range for fetching monthly schedules
                const months: string[] = [];
                let cur = new Date(start);
                const last = new Date(end);
                let safety = 0;
                while(cur <= last && safety < 24) {
                    const mStr = `${cur.getFullYear()}-${(cur.getMonth()+1).toString().padStart(2,'0')}`;
                    if(!months.includes(mStr)) months.push(mStr);
                    cur.setMonth(cur.getMonth() + 1);
                    safety++;
                }

                // 2. Fetch Daily Schedules
                const qSchDate = query(collection(db, 'schedules'), where('date', '>=', start), where('date', '<=', end));
                const schDateSnap = await getDocs(qSchDate);

                // 3. Fetch Monthly Schedules
                let schMonthDocs: any[] = [];
                if (months.length > 0) {
                    const qSchMonth = query(collection(db, 'schedules'), where('month', 'in', months.slice(0, 10)));
                    const schMonthSnap = await getDocs(qSchMonth);
                    schMonthDocs = schMonthSnap.docs;
                }

                const allSchedules = [
                    ...schDateSnap.docs.map(d => ({ id: d.id, ...d.data() } as Schedule)),
                    ...schMonthDocs.map(d => ({ id: d.id, ...d.data() } as Schedule))
                ];
                
                // Deduplicate by ID
                const uniqueSchedules = Array.from(new Map(allSchedules.map(item => [item.id, item])).values());
                setSchedules(uniqueSchedules);

                // Fetch Attendance Logs
                const startDate = new Date(start + 'T00:00:00');
                const endDate = new Date(end + 'T23:59:59');
                const qLogs = query(collection(db, 'attendance_logs'), 
                    where('timestamp', '>=', Timestamp.fromDate(startDate)),
                    where('timestamp', '<=', Timestamp.fromDate(endDate))
                );
                const logsSnap = await getDocs(qLogs);
                setAttendanceLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog)));
            } catch (err) {
                console.error("Error fetching attendance data for reports:", err);
            }
        };
        fetchAttendanceData();
    }, [filterMonth, filterYear, filterFromDate, filterToDate, refreshTrigger]);

    // --- REAL-TIME PRODUCTIVITY FETCH (FROM SUPABASE) ---
    useEffect(() => {
        setIsProductivityLoading(true);
        const { start, end } = getDateRange();

        const fetchSupabaseData = async () => {
            try {
                const { data, error } = await supabase
                    .from('appointments')
                    .select('*')
                    .gte('date', start)
                    .lte('date', end)
                    .eq('status', 'done') 
                    .order('date', { ascending: true })
                    .order('time', { ascending: true });

                if (error) throw error;

                if (data) {
                    setProductivityData(data as unknown as Appointment[]);
                }
            } catch(e) {
                console.error("Supabase Report Error:", e);
            } finally {
                setIsProductivityLoading(false);
            }
        };

        fetchSupabaseData();

    }, [filterMonth, filterYear, filterFromDate, filterToDate]);


    // --- Attendance Calculations ---
    const autoActions = useMemo(() => {
        const generated: ActionLog[] = [];
        const { start, end } = getDateRange();
        if (!start || !end) return [];

        const todayStr = new Date().toISOString().split('T')[0];
        // Don't predict future: limit end date to today
        const effectiveEnd = end < todayStr ? end : todayStr;

        // Generate array of dates to check
        const dates: string[] = [];
        let curr = new Date(start);
        const last = new Date(effectiveEnd);
        
        // Safety check
        if (curr > last) return [];

        while (curr <= last) {
            dates.push(curr.toISOString().split('T')[0]);
            curr.setDate(curr.getDate() + 1);
        }

        employees.forEach(emp => {
            dates.forEach(dateStr => {
                // 1. Find Schedule for this User on this Date
                // Priority: Specific Date > Monthly
                let sch = schedules.find(s => s.userId === emp.id && s.date === dateStr);
                if (!sch) {
                    const monthStr = dateStr.substring(0, 7); // YYYY-MM
                    sch = schedules.find(s => s.userId === emp.id && s.month === monthStr);
                }

                if (!sch || !sch.shifts || sch.shifts.length === 0) return; // No schedule for this day

                // 2. Check for Manual Actions (Leave, Absence, Mission, etc.)
                // If there is ANY manual action covering this day, skip auto-generation
                const hasManual = actions.some(act => {
                    if (act.employeeId !== emp.id) return false;
                    const actStart = safeDate(act.fromDate);
                    const actEnd = safeDate(act.toDate);
                    return dateStr >= actStart && dateStr <= actEnd;
                });

                if (hasManual) return;

                // 3. Check Attendance Logs
                const userLogs = attendanceLogs.filter(log => {
                    if (log.userId !== emp.id) return false;
                    const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
                    return logDate.toLocaleDateString('en-CA') === dateStr;
                });

                const inLogs = userLogs.filter(l => l.type === 'IN').sort((a, b) => {
                    const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
                    const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
                    return da.getTime() - db.getTime();
                });

                if (inLogs.length === 0) {
                    // No IN log -> Unjustified Absence
                    generated.push({
                        id: `auto-abs-${emp.id}-${dateStr}`,
                        employeeId: emp.id,
                        type: 'unjustified_absence',
                        fromDate: dateStr,
                        toDate: dateStr,
                        description: 'غياب بدون إذن (تلقائي)',
                        createdAt: new Date()
                    } as ActionLog);
                } else {
                    // Check for Late
                    const firstShift = sch!.shifts[0];
                    if (firstShift && firstShift.start) {
                        const firstInLog = inLogs[0];
                        const logTime = firstInLog.timestamp?.toDate ? firstInLog.timestamp.toDate() : new Date(firstInLog.timestamp);
                        
                        const [h, m] = firstShift.start.split(':').map(Number);
                        const shiftStart = new Date(dateStr + 'T00:00:00');
                        shiftStart.setHours(h, m, 0, 0);

                        const gracePeriodMins = 15;
                        const lateThreshold = new Date(shiftStart.getTime() + gracePeriodMins * 60000);

                        if (logTime > lateThreshold) {
                            const lateMins = Math.floor((logTime.getTime() - shiftStart.getTime()) / 60000);
                            generated.push({
                                id: `auto-late-${emp.id}-${dateStr}`,
                                employeeId: emp.id,
                                type: 'late',
                                fromDate: dateStr,
                                toDate: dateStr,
                                description: `تأخير ${lateMins} دقيقة (تلقائي)`,
                                createdAt: new Date()
                            } as ActionLog);
                        }
                    }
                }
            });
        });

        return generated;
    }, [schedules, attendanceLogs, actions, employees, filterFromDate, filterToDate, filterMonth, filterYear]);

    const allCombinedActions = useMemo(() => {
        return [...actions, ...autoActions];
    }, [actions, autoActions]);

    const baseFilteredActions = useMemo(() => {
        const { start, end } = getDateRange();
        return allCombinedActions.filter(act => {
            const actStart = safeDate(act.fromDate);
            const actEnd = safeDate(act.toDate);
            if (start && actEnd < start) return false;
            if (end && actStart > end) return false;
            return true;
        });
    }, [allCombinedActions, filterMonth, filterYear, filterFromDate, filterToDate]);

    const filteredActions = useMemo(() => {
        return baseFilteredActions.filter(act => {
            if (filterEmp && act.employeeId !== filterEmp) return false;
            return true;
        }).sort((a, b) => new Date(safeDate(b.fromDate)).getTime() - new Date(safeDate(a.fromDate)).getTime());
    }, [baseFilteredActions, filterEmp]);

    const allEvaluations = useMemo(() => {
        const months = getMonthCount();
        const maxScore = months * POINTS_PER_MONTH;
        const { start, end } = getDateRange();
        
        return employees.map(emp => {
            const empActions = baseFilteredActions.filter(act => act.employeeId === emp.id);
            
            // Calculate next leave date
            const allEmpActions = actions.filter(act => act.employeeId === emp.id);
            const annualLeaves = allEmpActions.filter(act => act.type === 'annual_leave');
            let lastLeaveDate: Date | null = null;
            if (annualLeaves.length > 0) {
                annualLeaves.sort((a, b) => new Date(safeDate(b.toDate)).getTime() - new Date(safeDate(a.toDate)).getTime());
                lastLeaveDate = new Date(safeDate(annualLeaves[0].toDate));
            } else if (emp.hireDate) {
                lastLeaveDate = new Date(emp.hireDate);
            }

            let nextLeaveDate: Date | null = null;
            if (lastLeaveDate) {
                nextLeaveDate = new Date(lastLeaveDate);
                nextLeaveDate.setMonth(nextLeaveDate.getMonth() + 11);
            }

            let totalDeductions = 0;
            let lates = 0;
            let absences = 0;
            let sickLeaves = 0;
            let positives = 0;
            let annualLeaveDays = 0;
            
            empActions.forEach(act => {
                let weight = ACTION_WEIGHTS[act.type] || 0;
                
                // If lateness is excluded, set weight to 0 for 'late' actions
                if (!includeLateness && act.type === 'late') {
                    weight = 0;
                }

                const s = new Date(safeDate(act.fromDate));
                const e = new Date(safeDate(act.toDate));
                const diff = Math.abs(e.getTime() - s.getTime());
                const days = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1; 
                
                totalDeductions += (weight * days);
                
                if (act.type === 'late') lates += days;
                if (act.type === 'unjustified_absence' || act.type === 'justified_absence') absences += days;
                if (act.type === 'sick_leave') sickLeaves += days;
                if (act.type === 'positive') positives += days;
                if (act.type === 'annual_leave') annualLeaveDays += days;
            });

            // Calculate swaps for this employee in the period
            const empSwaps = swaps.filter(s => {
                if (s.status !== 'approvedBySupervisor') return false;
                if (s.requesterId !== emp.id && s.targetUserId !== emp.id) return false;
                // Check if swap date is within range
                const swapDate = s.date || s.shiftDate || s.createdAt; // Try to find a date
                if (swapDate) {
                    const d = new Date(swapDate);
                    if (start && d < new Date(start)) return false;
                    if (end && d > new Date(end)) return false;
                }
                return true;
            });

            // Calculate productivity (exams) for this employee
            const empExams = productivityData.filter(p => p.performedByName === emp.name || p.performedByName === emp.email);

            const finalScore = Math.min(maxScore + 100, Math.max(0, maxScore - totalDeductions)); 
            const percentage = Math.round((finalScore / maxScore) * 100);

            let grade = t('grade.excellent');
            let color = 'text-emerald-500 stroke-emerald-500';
            let bg = 'bg-emerald-50';
            
            if (percentage < 50) { grade = t('grade.weak'); color = 'text-red-500 stroke-red-500'; bg = 'bg-red-50'; }
            else if (percentage < 70) { grade = t('grade.acceptable'); color = 'text-orange-500 stroke-orange-500'; bg = 'bg-orange-50'; }
            else if (percentage < 85) { grade = t('grade.vgood'); color = 'text-blue-500 stroke-blue-500'; bg = 'bg-blue-50'; }

            // Check if employee has any attendance logs in this period
            const hasAttendance = attendanceLogs.some(log => log.userId === emp.id);

            return { 
                employee: emp,
                months, 
                maxScore, 
                totalDeductions, 
                finalScore, 
                percentage, 
                grade, 
                color, 
                bg,
                hasAttendance,
                stats: { 
                    lates, 
                    absences, 
                    sickLeaves, 
                    positives, 
                    annualLeaveDays, 
                    swapCount: empSwaps.length, 
                    examCount: empExams.length 
                },
                nextLeaveDate
            };
        }).sort((a, b) => b.percentage - a.percentage);
    }, [baseFilteredActions, actions, employees, swaps, productivityData, filterMonth, filterYear, filterFromDate, filterToDate, t, attendanceLogs, includeLateness]);

    const chartEvaluations = useMemo(() => {
        return allEvaluations.filter(ev => {
            // Exclude doctors who don't have any attendance logs (fingerprint)
            if (ev.employee.role === 'doctor' && !ev.hasAttendance) return false;
            return true;
        });
    }, [allEvaluations]);

    const needsImprovementList = useMemo(() => {
        return chartEvaluations.filter(ev => ev.percentage < 70);
    }, [chartEvaluations]);

    const getImprovementAreas = (stats: any) => {
        const areas = [];
        if (stats.lates > 0) areas.push(`${t('action.late')}: ${stats.lates}`);
        if (stats.absences > 0) areas.push(`${t('action.unjustified_absence')}: ${stats.absences}`);
        if (stats.sickLeaves > 5) areas.push(`${t('action.sick_leave')}: ${stats.sickLeaves}`); // Example threshold
        return areas.join('، ');
    };

    const evaluation = useMemo(() => {
        if (!filterEmp) return null;
        return allEvaluations.find(e => e.employee.id === filterEmp) || null;
    }, [allEvaluations, filterEmp]);

    // --- Productivity Filter & Chart Data ---
    const filteredProductivity = useMemo(() => {
        if(!prodSearch) return productivityData;
        return productivityData.filter(p => 
            (p.fileNumber && p.fileNumber.includes(prodSearch)) || 
            (p.patientName && p.patientName.toLowerCase().includes(prodSearch.toLowerCase()))
        );
    }, [productivityData, prodSearch]);

    const productivityChartData = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredProductivity.forEach(p => {
            const name = p.performedByName || 'Unknown';
            counts[name] = (counts[name] || 0) + 1;
        });
        
        const maxVal = Math.max(...Object.values(counts), 1);

        return Object.entries(counts)
            .map(([name, count]) => ({ name, count, percentage: (count / maxVal) * 100 }))
            .sort((a, b) => b.count - a.count);
    }, [filteredProductivity]);

    // --- Handlers ---
    const handleSubmit = async () => {
        if (!formData.employeeId || !formData.type) return alert('Missing Data');
        const payload = { ...formData, createdAt: new Date() };
        try {
            if (editingId) {
                await updateDoc(doc(db, 'actions', editingId), payload);
            } else {
                await addDoc(collection(db, 'actions'), payload);
            }
            setIsFormOpen(false);
            setEditingId(null);
            setFormData({ ...formData, description: '', type: 'late' });
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (id: string) => {
        if (confirm(t('confirm') + '?')) {
            await deleteDoc(doc(db, 'actions', id));
        }
    };

    const handleEdit = (act: ActionLog) => {
        setFormData({
            employeeId: act.employeeId,
            type: act.type,
            fromDate: safeDate(act.fromDate),
            toDate: safeDate(act.toDate),
            description: act.description
        });
        setEditingId(act.id);
        setIsFormOpen(true);
    };
    
    const openFollowUpModal = (appt: Appointment) => {
        setSelectedPatientForAppt(appt);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setNewApptDate(tomorrow.toISOString().split('T')[0]);
        setNewApptTime('09:00');
        setNewApptNote(`Follow-up: ${appt.examType}`);
        setIsFollowUpModalOpen(true);
    };

    const handleSaveAppointment = async () => {
        if (!selectedPatientForAppt || !newApptDate || !newApptTime) return;
        try {
            const { error } = await supabase.from('appointments').insert({
                id: `FOLLOWUP_${Date.now()}`,
                patientName: selectedPatientForAppt.patientName,
                fileNumber: selectedPatientForAppt.fileNumber || '',
                examType: selectedPatientForAppt.examType,
                date: newApptDate,
                time: newApptTime,
                notes: newApptNote,
                status: 'pending',
                createdBy: 'Supervisor',
                createdByName: 'Admin',
                createdAt: new Date().toISOString()
            });

            if (error) throw error;

            alert('تم حجز الموعد بنجاح ✅');
            setIsFollowUpModalOpen(false);
        } catch (e) { console.error(e); alert('خطأ في الحفظ'); }
    };

    const handlePrint = () => window.print();

    if (loading) return <Loading />;

    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = evaluation ? circumference - (evaluation.percentage / 100) * circumference : 0;
    const dateTitle = filterFromDate && filterToDate ? `${filterFromDate} - ${filterToDate}` : `${filterYear}-${filterMonth.padStart(2, '0')}`;

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-12 print:bg-white print:p-0 print:pb-0" dir={dir}>
            
            <PrintHeader 
                title={t('rep.title')} 
                subtitle={`REPORT: ${activeTab === 'productivity' ? 'Completed Exams Log' : 'HR & Attendance'}`} 
                month={dateTitle} 
            />

            {/* Header (Hidden in Print) */}
            <div className="bg-slate-900 text-white pt-8 pb-16 px-6 print:hidden">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight">{t('rep.title')}</h1>
                        <p className="text-slate-400 mt-2">{t('rep.subtitle')}</p>
                    </div>
                    {activeTab === 'attendance' && (
                        <button 
                            onClick={() => { 
                                setEditingId(null); 
                                setFormData({
                                    employeeId: filterEmp || '',
                                    type: 'annual_leave',
                                    fromDate: new Date().toISOString().split('T')[0],
                                    toDate: new Date().toISOString().split('T')[0],
                                    description: ''
                                });
                                setIsFormOpen(true); 
                            }}
                            className="bg-blue-600 hover:bg-blue-50 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <i className="fas fa-plus-circle"></i> {t('rep.add')}
                        </button>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 -mt-10 print:mt-0 print:px-0">
                
                {/* Filters Bar */}
                <div className="bg-white rounded-2xl shadow-lg p-4 mb-8 flex flex-wrap gap-4 items-center border border-gray-100 print:hidden">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button 
                            onClick={() => setActiveTab('attendance')} 
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'attendance' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                        >
                            HR & Attendance
                        </button>
                        <button 
                            onClick={() => setActiveTab('productivity')} 
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'productivity' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}
                        >
                            Completed Exams
                        </button>
                    </div>

                    {activeTab === 'attendance' && (
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-gray-400 mb-1">{t('rep.filter.emp')}</label>
                            <select className="w-full bg-slate-50 border-none rounded-lg font-bold text-slate-700 focus:ring-2 focus:ring-blue-200" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
                                <option value="">-- All --</option>
                                {employees.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                            </select>
                        </div>
                    )}
                    
                    {/* NEW: File Search for Productivity Tab */}
                    {activeTab === 'productivity' && (
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-gray-400 mb-1">Search File / Name</label>
                            <input 
                                className="w-full bg-slate-50 border-none rounded-lg font-bold text-slate-700 focus:ring-2 focus:ring-emerald-200 px-3 py-2 text-sm" 
                                placeholder="رقم الملف أو الاسم..."
                                value={prodSearch} 
                                onChange={e => setProdSearch(e.target.value)}
                            />
                        </div>
                    )}
                    
                    <div className="w-[120px]">
                        <label className="block text-xs font-bold text-gray-400 mb-1">{t('month')}</label>
                        <select className="w-full bg-slate-50 border-none rounded-lg font-bold text-slate-700" value={filterMonth} onChange={e => {setFilterMonth(e.target.value); setFilterFromDate(''); setFilterToDate('');}}>
                            {[...Array(12)].map((_, i) => <option key={i} value={i+1}>{i+1}</option>)}
                        </select>
                    </div>

                    <div className="w-[120px]">
                        <label className="block text-xs font-bold text-gray-400 mb-1">{t('year')}</label>
                        <select className="w-full bg-slate-50 border-none rounded-lg font-bold text-slate-700" value={filterYear} onChange={e => {setFilterYear(e.target.value); setFilterFromDate(''); setFilterToDate('');}}>
                            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    {activeTab === 'attendance' && (
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                            <input 
                                type="checkbox" 
                                id="includeLateness" 
                                checked={includeLateness} 
                                onChange={e => setIncludeLateness(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="includeLateness" className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                                احتساب التأخير
                            </label>
                        </div>
                    )}

                    <button onClick={handlePrint} className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center ml-auto">
                        <i className="fas fa-print"></i>
                    </button>
                </div>

                {activeTab === 'productivity' ? (
                    <div className="space-y-6">
                        
                        {/* 1. Productivity Chart */}
                        {productivityChartData.length > 0 && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 print:break-inside-avoid">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <i className="fas fa-chart-bar text-emerald-500"></i> أداء الموظفين (عدد الحالات)
                                </h3>
                                <div className="space-y-3">
                                    {productivityChartData.map((item, index) => (
                                        <div key={index} className="flex items-center gap-4">
                                            <div className="w-32 text-xs font-bold text-slate-600 truncate text-right">{item.name}</div>
                                            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full" 
                                                    style={{ width: `${item.percentage}%` }}
                                                ></div>
                                            </div>
                                            <div className="w-10 text-xs font-black text-slate-800 text-left">{item.count}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 2. Productivity Table */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:border-2 print:border-slate-800 print:shadow-none animate-fade-in">
                            <div className="p-6 bg-slate-50 border-b border-slate-200 print:bg-white print:border-slate-800 flex justify-between items-center">
                                <h3 className="font-bold text-lg text-slate-800 uppercase tracking-wide">
                                    <i className="fas fa-check-circle text-emerald-500 mr-2"></i> سجل الفحوصات المنجزة
                                </h3>
                                <span className="text-xs bg-white border px-2 py-1 rounded shadow-sm text-slate-500 font-bold">
                                    {isProductivityLoading ? 'Syncing...' : `${filteredProductivity.length} Records`}
                                </span>
                            </div>
                            {isProductivityLoading && productivityData.length === 0 ? (
                                <div className="p-10"><Loading /></div>
                            ) : (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white text-slate-500 font-bold text-xs uppercase border-b border-slate-100 print:border-slate-800 print:text-black">
                                        <tr>
                                            <th className="p-4 w-10 text-center">#</th>
                                            <th className="p-4">التاريخ والوقت</th>
                                            <th className="p-4">اسم المريض</th>
                                            <th className="p-4">رقم الملف</th>
                                            <th className="p-4">نوع الفحص</th>
                                            <th className="p-4">تم بواسطة</th>
                                            <th className="p-4 print:hidden text-center">إجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 print:divide-slate-300">
                                        {filteredProductivity.length === 0 ? (
                                            <tr><td colSpan={7} className="p-8 text-center text-slate-400">No completed exams found for this period.</td></tr>
                                        ) : (
                                            filteredProductivity.map((data, i) => (
                                                <tr key={i} className="hover:bg-slate-50 print:break-inside-avoid animate-fade-in">
                                                    <td className="p-4 text-center font-black text-slate-300 print:text-black">{i + 1}</td>
                                                    <td className="p-4 font-mono text-xs text-slate-500 print:text-black">
                                                        {data.date} <span className="text-slate-400">|</span> {data.time}
                                                    </td>
                                                    <td className="p-4 font-bold text-slate-800 print:text-black">{data.patientName}</td>
                                                    <td className="p-4 font-mono text-slate-600 print:text-black">{data.fileNumber}</td>
                                                    <td className="p-4">
                                                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold border border-slate-200 print:border-black print:bg-transparent print:text-black">
                                                            {data.examType}
                                                        </span>
                                                        {data.notes && <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] truncate">{data.notes}</p>}
                                                    </td>
                                                    <td className="p-4 font-bold text-emerald-700 print:text-black">
                                                        {data.performedByName || 'Unknown'}
                                                    </td>
                                                    <td className="p-4 print:hidden text-center">
                                                        <button 
                                                            onClick={() => openFollowUpModal(data)}
                                                            className="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-2 rounded-lg transition-colors"
                                                            title="جدولة موعد متابعة / إعادة"
                                                        >
                                                            <i className="fas fa-calendar-plus"></i>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                ) : (
                    // ... (HR & Attendance Tab Content) ...
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:block">
                        {/* Evaluation Card or Dashboard */}
                        <div className="lg:col-span-1 print:mb-6 print:break-inside-avoid">
                            {evaluation ? (
                                <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 sticky top-4 print:border-2 print:border-slate-800 print:shadow-none">
                                    <div className={`p-6 text-center ${evaluation.bg} border-b border-gray-100 print:bg-white print:border-b-2 print:border-slate-800`}>
                                        <h2 className="text-xl font-bold text-slate-800 mb-4 uppercase">{t('rep.card')}</h2>
                                        
                                        <div className="relative w-48 h-48 mx-auto mb-4">
                                            <svg className="w-full h-full transform -rotate-90">
                                                <circle cx="96" cy="96" r={radius} className="text-gray-200 fill-none stroke-current" strokeWidth="12" />
                                                <circle cx="96" cy="96" r={radius} className={`${evaluation.color.split(' ')[0]} fill-none transition-all duration-1000 ease-out`} strokeWidth="12" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                                            </svg>
                                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                                                <span className={`text-4xl font-black ${evaluation.color.split(' ')[0]}`}>{evaluation.percentage}%</span>
                                                <span className="block text-xs font-bold text-gray-400 mt-1 uppercase">{evaluation.grade}</span>
                                            </div>
                                        </div>

                                        <div className="flex justify-center gap-2 mb-2">
                                            <span className="bg-white border px-3 py-1 rounded-full text-xs font-bold shadow-sm text-slate-600">
                                                {evaluation.months} {t('month')}
                                            </span>
                                            <span className="bg-white border px-3 py-1 rounded-full text-xs font-bold shadow-sm text-slate-600">
                                                {filteredActions.length} Actions
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-6 space-y-4">
                                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-200">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center print:bg-transparent print:text-black print:border"><i className="fas fa-star"></i></div>
                                                <span className="text-sm font-bold text-gray-600 uppercase">{t('rep.base')}</span>
                                            </div>
                                            <span className="font-bold text-lg text-slate-800">{evaluation.maxScore}</span>
                                        </div>

                                        <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center print:bg-transparent print:text-black print:border"><i className="fas fa-minus-circle"></i></div>
                                                <span className="text-sm font-bold text-gray-600 uppercase">{t('rep.deduct')}</span>
                                            </div>
                                            <span className="font-bold text-lg text-red-600">-{evaluation.totalDeductions}</span>
                                        </div>

                                        <div className="border-t-2 border-dashed border-gray-300 pt-4 mt-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-lg font-black text-slate-800 uppercase">{t('rep.net')}</span>
                                                <span className={`text-2xl font-black ${evaluation.color.split(' ')[0]}`}>{evaluation.finalScore}</span>
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-200 pt-4 mt-4 grid grid-cols-2 gap-2 text-center">
                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">تأخير</div>
                                                <div className="text-lg font-black text-orange-500">{evaluation.stats.lates}</div>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">غياب</div>
                                                <div className="text-lg font-black text-red-500">{evaluation.stats.absences}</div>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">إجازات مرضية</div>
                                                <div className="text-lg font-black text-blue-500">{evaluation.stats.sickLeaves}</div>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">إجازات سنوية</div>
                                                <div className="text-lg font-black text-purple-500">{evaluation.stats.annualLeaveDays}</div>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">تبديلات</div>
                                                <div className="text-lg font-black text-indigo-500">{evaluation.stats.swapCount}</div>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">حالات منجزة</div>
                                                <div className="text-lg font-black text-emerald-500">{evaluation.stats.examCount}</div>
                                            </div>
                                        </div>

                                        {evaluation.nextLeaveDate && (
                                            <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                                    <i className="fas fa-plane-departure"></i>
                                                </div>
                                                <div className="text-right flex-1">
                                                    <div className="text-[10px] font-bold text-blue-400 uppercase">استحقاق الإجازة القادمة</div>
                                                    <div className="text-sm font-black text-blue-700">
                                                        {evaluation.nextLeaveDate.toLocaleDateString('en-GB')}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 print:border-2 print:border-slate-800 print:shadow-none">
                                    <div className="p-6 border-b border-gray-100 bg-slate-50">
                                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                            <i className="fas fa-users text-blue-500"></i> لوحة تقييم الموظفين
                                        </h2>
                                        <p className="text-xs text-slate-500 mt-1">ملخص أداء جميع الموظفين للفترة المحددة</p>
                                    </div>
                                    <div className="p-0 overflow-x-auto">
                                        <table className="w-full text-sm text-right">
                                            <thead className="bg-white text-slate-500 font-bold text-xs uppercase border-b border-slate-100">
                                                <tr>
                                                    <th className="p-4">الموظف</th>
                                                    <th className="p-4 text-center">التقييم</th>
                                                    <th className="p-4 text-center">الخصم</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {allEvaluations.map((ev, i) => (
                                                    <tr key={ev.employee.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setFilterEmp(ev.employee.id)}>
                                                        <td className="p-4">
                                                            <div className="font-bold text-slate-800">{ev.employee.name || ev.employee.email}</div>
                                                            <div className="text-[10px] text-slate-400 flex gap-2 mt-1">
                                                                <span title="تأخير" className={ev.stats.lates > 0 ? 'text-orange-500' : ''}><i className="fas fa-clock"></i> {ev.stats.lates}</span>
                                                                <span title="غياب" className={ev.stats.absences > 0 ? 'text-red-500' : ''}><i className="fas fa-user-times"></i> {ev.stats.absences}</span>
                                                                <span title="إجازات مرضية" className={ev.stats.sickLeaves > 0 ? 'text-blue-500' : ''}><i className="fas fa-procedures"></i> {ev.stats.sickLeaves}</span>
                                                                <span title="إجازات سنوية" className={ev.stats.annualLeaveDays > 0 ? 'text-purple-500' : ''}><i className="fas fa-plane"></i> {ev.stats.annualLeaveDays}</span>
                                                                <span title="تبديلات" className={ev.stats.swapCount > 0 ? 'text-indigo-500' : ''}><i className="fas fa-exchange-alt"></i> {ev.stats.swapCount}</span>
                                                                <span title="حالات منجزة" className={ev.stats.examCount > 0 ? 'text-emerald-500' : ''}><i className="fas fa-check-circle"></i> {ev.stats.examCount}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <div className={`text-lg font-black ${ev.color.split(' ')[0]}`}>{ev.percentage}%</div>
                                                            <div className="text-[10px] font-bold text-slate-400 uppercase">{ev.grade}</div>
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <span className="bg-red-50 text-red-600 px-2 py-1 rounded text-xs font-bold border border-red-100">
                                                                -{ev.totalDeductions}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action Log List / Performance Charts */}
                        <div className="lg:col-span-2 space-y-6 print:w-full">
                            {!filterEmp ? (
                                <div className="space-y-6">
                                    {/* Top Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Best Performer */}
                                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-100 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 opacity-50"></div>
                                            <div className="relative z-10">
                                                <div className="text-xs font-bold text-emerald-600 uppercase mb-2">الأفضل أداءً</div>
                                                <div className="text-2xl font-black text-slate-800">
                                                    {chartEvaluations[0]?.employee.name || '-'}
                                                </div>
                                                <div className="text-sm font-bold text-emerald-500 mt-1">
                                                    {chartEvaluations[0]?.percentage}% - {chartEvaluations[0]?.grade}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Needs Improvement - List */}
                                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-red-100 relative overflow-hidden row-span-2 md:row-span-1">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-bl-full -mr-4 -mt-4 opacity-50"></div>
                                            <div className="relative z-10 h-full flex flex-col">
                                                <div className="text-xs font-bold text-red-600 uppercase mb-2">يحتاج تحسين ({needsImprovementList.length})</div>
                                                
                                                {needsImprovementList.length === 0 ? (
                                                    <div className="text-slate-400 text-sm italic mt-2">لا يوجد موظفين بحاجة لتحسين</div>
                                                ) : (
                                                    <div className="flex-1 overflow-y-auto max-h-[120px] pr-2 space-y-3 custom-scrollbar">
                                                        {needsImprovementList.map(emp => (
                                                            <div key={emp.employee.id} className="border-b border-red-50 pb-2 last:border-0 last:pb-0">
                                                                <div className="flex justify-between items-center">
                                                                    <div className="font-bold text-slate-800 text-sm">{emp.employee.name}</div>
                                                                    <div className="text-xs font-bold text-red-500">{emp.percentage}%</div>
                                                                </div>
                                                                <div className="text-[10px] text-slate-500 mt-1">
                                                                    {getImprovementAreas(emp.stats)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Average */}
                                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-blue-100 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 opacity-50"></div>
                                            <div className="relative z-10">
                                                <div className="text-xs font-bold text-blue-600 uppercase mb-2">متوسط الأداء</div>
                                                <div className="text-2xl font-black text-slate-800">
                                                    {Math.round(chartEvaluations.reduce((acc, curr) => acc + curr.percentage, 0) / (chartEvaluations.length || 1))}%
                                                </div>
                                                <div className="text-sm font-bold text-blue-400 mt-1">
                                                    للموظفين النشطين ({chartEvaluations.length})
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Chart */}
                                    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
                                        <h3 className="font-bold text-slate-800 text-lg mb-6 flex items-center gap-2">
                                            <i className="fas fa-chart-bar text-blue-500"></i>
                                            تحليل الأداء العام
                                        </h3>
                                        <div className="h-[400px] w-full" dir="ltr">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={chartEvaluations} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis 
                                                        dataKey="employee.name" 
                                                        angle={-45} 
                                                        textAnchor="end" 
                                                        interval={0} 
                                                        height={80} 
                                                        tick={{ fontSize: 10, fill: '#64748b' }}
                                                    />
                                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} domain={[0, 100]} />
                                                    <Tooltip 
                                                        cursor={{ fill: '#f8fafc' }}
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                                    />
                                                    <Bar dataKey="percentage" radius={[4, 4, 0, 0]} barSize={40}>
                                                        {chartEvaluations.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.percentage >= 85 ? '#10b981' : entry.percentage >= 70 ? '#3b82f6' : entry.percentage >= 50 ? '#f97316' : '#ef4444'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden print:border-2 print:border-slate-800 print:shadow-none print:rounded-lg">
                                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 print:bg-white print:border-b-2 print:border-slate-800">
                                        <div className="flex items-center gap-4">
                                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 uppercase">
                                                <i className="fas fa-history text-blue-500 print:hidden"></i> 
                                                {filterEmp ? `${t('rep.log')} - ${employees.find(e => e.id === filterEmp)?.name}` : 'سجل الإجراءات لجميع الموظفين'}
                                            </h3>
                                            {filterEmp && (
                                                <button 
                                                    onClick={() => setFilterEmp('')}
                                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full transition-colors print:hidden"
                                                >
                                                    العودة للوحة التقييم
                                                </button>
                                            )}
                                        </div>
                                        <span className="text-xs font-bold bg-white px-2 py-1 rounded border text-gray-500">{filteredActions.length}</span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className={`w-full text-sm ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                            <thead className="bg-gray-50 text-gray-500 font-medium print:bg-white print:text-black print:border-b-2 print:border-slate-800">
                                                <tr>
                                                    <th className="p-4">{t('rep.filter.emp')}</th>
                                                    <th className="p-4">{t('req.type')}</th>
                                                    <th className="p-4">{t('date')}</th>
                                                    <th className="p-4">Points</th>
                                                    <th className="p-4 print:hidden">{t('actions')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50 print:divide-slate-300">
                                                {filteredActions.length === 0 ? (
                                                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">---</td></tr>
                                                ) : filteredActions.map(act => {
                                                    const weight = ACTION_WEIGHTS[act.type];
                                                    const isPositive = weight < 0;
                                                    return (
                                                        <tr key={act.id} className="hover:bg-slate-50 transition-colors group print:hover:bg-transparent">
                                                            <td className="p-4 border-r print:border-slate-300">
                                                                <div className="font-bold text-slate-700">{employees.find(e => e.id === act.employeeId)?.name || 'Unknown'}</div>
                                                                <div className="text-xs text-slate-400 print:text-slate-600">{act.description}</div>
                                                            </td>
                                                            <td className="p-4 border-r print:border-slate-300">
                                                                <span className={`px-2 py-1 rounded text-xs font-bold border ${isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'} print:border-none print:bg-transparent print:text-black print:p-0`}>
                                                                    {t(`action.${act.type}`)}
                                                                </span>
                                                            </td>
                                                            {/* Fixed Date Rendering */}
                                                            <td className="p-4 text-xs font-mono text-slate-600 border-r print:border-slate-300">
                                                                {safeDate(act.fromDate)} 
                                                                {safeDate(act.fromDate) !== safeDate(act.toDate) && <><br/><i className="fas fa-arrow-down text-[10px] my-1 opacity-50 print:hidden"></i><span className="hidden print:inline"> - </span><br/>{safeDate(act.toDate)}</>}
                                                            </td>
                                                            <td className="p-4 font-bold border-r print:border-slate-300">
                                                                {isPositive ? (
                                                                    <span className="text-emerald-500">+{Math.abs(weight)}</span>
                                                                ) : (
                                                                    <span className="text-red-500">-{weight}</span>
                                                                )}
                                                            </td>
                                                            <td className="p-4 print:hidden">
                                                                {!act.id.startsWith('auto-') && (
                                                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <button onClick={() => handleEdit(act)} className="w-8 h-8 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"><i className="fas fa-pen text-xs"></i></button>
                                                                        <button onClick={() => handleDelete(act.id)} className="w-8 h-8 rounded bg-red-50 text-red-600 hover:bg-red-100"><i className="fas fa-trash text-xs"></i></button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <PrintFooter />

            {/* Modal for Adding/Editing Action */}
            <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editingId ? t('edit') : t('add')}>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">{t('rep.filter.emp')}</label>
                        <select 
                            className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-100"
                            value={formData.employeeId}
                            onChange={e => setFormData({...formData, employeeId: e.target.value})}
                            disabled={!!filterEmp && !editingId} 
                        >
                            <option value="">Select...</option>
                            {employees.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">{t('from')}</label>
                            <input type="date" className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-sm" value={formData.fromDate} onChange={e => setFormData({...formData, fromDate: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">{t('to')}</label>
                            <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" value={formData.toDate} onChange={e => setFormData({...formData, toDate: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">{t('req.type')}</label>
                        <select 
                            className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-100"
                            value={formData.type}
                            onChange={e => setFormData({...formData, type: e.target.value})}
                        >
                            <option value="annual_leave">{t('action.annual_leave')} (0)</option>
                            <option value="sick_leave">{t('action.sick_leave')} (-1)</option>
                            <option value="justified_absence">{t('action.justified_absence')} (-2)</option>
                            <option value="mission">{t('action.mission')} (0)</option>
                            <option value="violation">{t('action.violation')} (-10)</option>
                            <option value="positive">{t('action.positive')} (+5)</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">{t('notes')}</label>
                        <textarea 
                            className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-100 min-h-[80px]"
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                        ></textarea>
                    </div>

                    <button onClick={handleSubmit} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg">
                        {t('save')}
                    </button>
                </div>
            </Modal>

            {/* Modal for Booking Appointment from Reports */}
            <Modal isOpen={isFollowUpModalOpen} onClose={() => setIsFollowUpModalOpen(false)} title="جدولة موعد متابعة / إعادة">
                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-900">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-bold uppercase opacity-70">المريض</p>
                                <h4 className="font-bold text-lg">{selectedPatientForAppt?.patientName}</h4>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold uppercase opacity-70">الفحص السابق</p>
                                <span className="bg-white px-2 py-0.5 rounded text-sm font-bold shadow-sm">{selectedPatientForAppt?.examType}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ الموعد الجديد</label>
                            <input 
                                type="date" 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                                value={newApptDate}
                                onChange={e => setNewApptDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">الوقت</label>
                            <input 
                                type="time" 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                                value={newApptTime}
                                onChange={e => setNewApptTime(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات / سبب الموعد</label>
                        <textarea 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-medium min-h-[80px]"
                            value={newApptNote}
                            onChange={e => setNewApptNote(e.target.value)}
                            placeholder="مثلاً: إعادة الفحص لعدم وضوح الصورة، أو متابعة دورية..."
                        ></textarea>
                    </div>

                    <button 
                        onClick={handleSaveAppointment}
                        className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all"
                    >
                        تأكيد الحجز
                    </button>
                </div>
            </Modal>

        </div>
    );
}

export default Reports;
