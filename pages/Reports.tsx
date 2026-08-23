
// ... existing imports
import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { User, ActionLog, Appointment, Schedule, AttendanceLog } from '../types';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import { PrintHeader, PrintFooter } from '../components/PrintLayout';
// @ts-ignore
import { collection, getDocs, addDoc, deleteDoc, updateDoc, doc, Timestamp, query, where, onSnapshot, setDoc, orderBy } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useDepartment } from '../contexts/DepartmentContext';
import { UserRole } from '../types';
import { useFilteredUsers } from '../hooks/useFilteredUsers';
import { appointmentsDb } from '../firebaseAppointments';
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
    const { role: authRole, user: currentUser } = useAuth();
    const { departments, selectedDepartmentId: contextDeptId, setSelectedDepartmentId } = useDepartment();
    const [selectedDept, setSelectedDept] = useState<string | null>(contextDeptId);
    const [allEmployees, setAllEmployees] = useState<User[]>([]);
    const baseEmployees = useFilteredUsers(allEmployees);
    const employees = useMemo(() => {
        if (!selectedDept) return baseEmployees;
        return baseEmployees.filter(emp => emp.departmentId === selectedDept);
    }, [baseEmployees, selectedDept]);
    const [actions, setActions] = useState<ActionLog[]>([]);
    const [swaps, setSwaps] = useState<any[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'attendance' | 'productivity'>('attendance');

    const [filterEmp, setFilterEmp] = useState('');
    const [dateMode, setDateMode] = useState<'month' | 'custom'>('month');
    const [filterMonth, setFilterMonth] = useState((new Date().getMonth() + 1).toString());
    const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
    const [filterFromDate, setFilterFromDate] = useState('');
    const [filterToDate, setFilterToDate] = useState('');
    
    // NEW: Action Category Filters & View
    const [actionFilterCategory, setActionFilterCategory] = useState<'all' | 'actions_only' | 'penalties_only' | 'absences_only' | 'leaves_only' | 'late_only' | 'positives_only'>('all');
    const [actionSpecificType, setActionSpecificType] = useState<string>('all');
    const [actionSearchQuery, setActionSearchQuery] = useState<string>('');
    const [mainViewTab, setMainViewTab] = useState<'overview' | 'actions_table'>('overview');

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
        let start = '';
        let end = '';

        if (dateMode === 'custom') {
            const todayStr = new Date().toISOString().split('T')[0];
            start = filterFromDate || `${new Date().getFullYear()}-01-01`;
            end = filterToDate || todayStr;
        } else {
            const y = parseInt(filterYear) || new Date().getFullYear();
            const m = parseInt(filterMonth) || (new Date().getMonth() + 1);
            const mStr = m.toString().padStart(2, '0');
            const lastDayObj = new Date(y, m, 0);
            const lastDStr = lastDayObj.getDate().toString().padStart(2, '0');

            start = `${y}-${mStr}-01`;
            end = `${y}-${mStr}-${lastDStr}`;
        }
        return { start, end };
    };

    const applyDateShortcut = (preset: 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_30_days' | 'this_quarter' | 'this_year') => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        setDateMode('custom');

        if (preset === 'today') {
            setFilterFromDate(todayStr);
            setFilterToDate(todayStr);
        } else if (preset === 'this_week') {
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - 6);
            setFilterFromDate(startOfWeek.toISOString().split('T')[0]);
            setFilterToDate(todayStr);
        } else if (preset === 'this_month') {
            const y = now.getFullYear();
            const m = (now.getMonth() + 1).toString().padStart(2, '0');
            const lastDay = new Date(y, now.getMonth() + 1, 0).getDate().toString().padStart(2, '0');
            setFilterFromDate(`${y}-${m}-01`);
            setFilterToDate(`${y}-${m}-${lastDay}`);
        } else if (preset === 'last_month') {
            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const y = prevMonth.getFullYear();
            const m = (prevMonth.getMonth() + 1).toString().padStart(2, '0');
            const lastDay = new Date(y, prevMonth.getMonth() + 1, 0).getDate().toString().padStart(2, '0');
            setFilterFromDate(`${y}-${m}-01`);
            setFilterToDate(`${y}-${m}-${lastDay}`);
        } else if (preset === 'last_30_days') {
            const past30 = new Date();
            past30.setDate(now.getDate() - 30);
            setFilterFromDate(past30.toISOString().split('T')[0]);
            setFilterToDate(todayStr);
        } else if (preset === 'this_quarter') {
            const quarter = Math.floor(now.getMonth() / 3);
            const startMonth = quarter * 3;
            const y = now.getFullYear();
            const startQ = new Date(y, startMonth, 1).toISOString().split('T')[0];
            const endQ = new Date(y, startMonth + 3, 0).toISOString().split('T')[0];
            setFilterFromDate(startQ);
            setFilterToDate(endQ);
        } else if (preset === 'this_year') {
            const y = now.getFullYear();
            setFilterFromDate(`${y}-01-01`);
            setFilterToDate(`${y}-12-31`);
        }
    };

    const getMonthCount = () => {
        if (dateMode === 'custom' && filterFromDate && filterToDate) {
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
                const actionsList = aSnap.docs.map(d => ({ ...d.data(), id: d.id } as ActionLog));

                // Fetch approved leaveRequests to ensure all approved leaves appear seamlessly
                try {
                    const lSnap = await getDocs(query(collection(db, 'leaveRequests'), where('status', '==', 'approved')));
                    const approvedLeaves = lSnap.docs.map(d => ({ ...d.data(), id: d.id }));

                    approvedLeaves.forEach((leave: any) => {
                        const leaveEmpId = leave.from || leave.userId || leave.employeeId;
                        const actionType = (leave.typeOfLeave?.toLowerCase().includes('sick') || leave.typeOfLeave === 'مرضية') ? 'sick_leave' : 'annual_leave';
                        const leaveFrom = leave.startDate;
                        const leaveTo = leave.endDate || leave.startDate;

                        const alreadyExists = actionsList.some(act => 
                            (act.leaveRequestId && act.leaveRequestId === leave.id) ||
                            ((act.employeeId === leaveEmpId || (act as any).from === leaveEmpId) && act.type === actionType && safeDate(act.fromDate) === leaveFrom && safeDate(act.toDate) === leaveTo)
                        );

                        if (!alreadyExists && leaveEmpId && leaveFrom) {
                            actionsList.push({
                                id: `leave-req-${leave.id}`,
                                employeeId: leaveEmpId,
                                type: actionType,
                                fromDate: leaveFrom,
                                toDate: leaveTo,
                                description: `إجازة معتمدة (${leave.typeOfLeave || 'سنوية'}): ${leave.reason || ''}`,
                                leaveRequestId: leave.id,
                                createdAt: leave.createdAt ? (leave.createdAt.toDate ? leave.createdAt.toDate() : new Date(leave.createdAt)) : new Date()
                            } as ActionLog);
                        }
                    });
                } catch (lErr) {
                    console.error("Error fetching approved leaves:", lErr);
                }

                setActions(actionsList);

                const uSnap = await getDocs(collection(db, 'users'));
                const fetchedUsers = uSnap.docs.map(d => ({ ...d.data(), id: d.id } as User));
                setAllEmployees(fetchedUsers.filter(u => !['admin', 'supervisor', 'manager'].includes(u.role)));

                const sSnap = await getDocs(collection(db, 'swapRequests'));
                setSwaps(sSnap.docs.map(d => ({ ...d.data(), id: d.id })));
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
                    ...schDateSnap.docs.map(d => ({ ...d.data(), id: d.id } as Schedule)),
                    ...schMonthDocs.map(d => ({ ...d.data(), id: d.id } as Schedule))
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
                setAttendanceLogs(logsSnap.docs.map(d => ({ ...d.data(), id: d.id } as AttendanceLog)));
            } catch (err) {
                console.error("Error fetching attendance data for reports:", err);
            }
        };
        fetchAttendanceData();
    }, [filterMonth, filterYear, filterFromDate, filterToDate, dateMode, refreshTrigger]);

    // --- REAL-TIME PRODUCTIVITY FETCH (FROM SUPABASE) ---
    useEffect(() => {
        setIsProductivityLoading(true);
        const { start, end } = getDateRange();

        const fetchSupabaseData = async () => {
            try {
                const qData = query(collection(appointmentsDb, 'appointments'), where('date', '>=', start), where('date', '<=', end), where('status', '==', 'done'), orderBy('date', 'asc'), orderBy('time', 'asc'));
                const dataSnap = await getDocs(qData);
                const data = dataSnap.docs.map(d => ({ ...d.data(), id: d.id }));
                const error = null;

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

    }, [filterMonth, filterYear, filterFromDate, filterToDate, dateMode]);


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
    }, [schedules, attendanceLogs, actions, employees, filterFromDate, filterToDate, filterMonth, filterYear, dateMode]);

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
    }, [allCombinedActions, filterMonth, filterYear, filterFromDate, filterToDate, dateMode]);

    const getEmpName = (employeeId: string, act?: ActionLog) => {
        const found = employees.find(e => 
            e.id === employeeId || 
            (e as any).uid === employeeId || 
            (act && ((e as any).uid === (act as any).from || e.id === (act as any).from || e.id === (act as any).userId))
        );
        if (found?.name) return found.name;
        if ((act as any)?.userName) return (act as any).userName;
        if ((act as any)?.employeeName) return (act as any).employeeName;
        return employeeId || 'Unknown';
    };

    const filteredActions = useMemo(() => {
        return baseFilteredActions.filter(act => {
            if (filterEmp && act.employeeId !== filterEmp && (act as any).from !== filterEmp) return false;

            // Category Filter
            if (actionFilterCategory === 'actions_only') {
                // Procedures only: exclude absences and leaves
                if (['unjustified_absence', 'justified_absence', 'annual_leave', 'sick_leave'].includes(act.type)) {
                    return false;
                }
            } else if (actionFilterCategory === 'penalties_only') {
                if (!['violation', 'late'].includes(act.type)) return false;
            } else if (actionFilterCategory === 'absences_only') {
                // Absences only (without leaves)
                if (!['unjustified_absence', 'justified_absence'].includes(act.type)) return false;
            } else if (actionFilterCategory === 'leaves_only') {
                // Leaves only (annual, sick)
                if (!['annual_leave', 'sick_leave'].includes(act.type)) return false;
            } else if (actionFilterCategory === 'late_only') {
                if (act.type !== 'late') return false;
            } else if (actionFilterCategory === 'positives_only') {
                if (act.type !== 'positive') return false;
            }

            // Specific Type
            if (actionSpecificType !== 'all' && act.type !== actionSpecificType) {
                return false;
            }

            // Text search
            if (actionSearchQuery.trim()) {
                const query = actionSearchQuery.toLowerCase().trim();
                const empName = getEmpName(act.employeeId, act).toLowerCase();
                const desc = (act.description || '').toLowerCase();
                const typeText = (t(`action.${act.type}`) || act.type).toLowerCase();
                if (!empName.includes(query) && !desc.includes(query) && !typeText.includes(query)) {
                    return false;
                }
            }

            return true;
        }).sort((a, b) => new Date(safeDate(b.fromDate)).getTime() - new Date(safeDate(a.fromDate)).getTime());
    }, [baseFilteredActions, filterEmp, actionFilterCategory, actionSpecificType, actionSearchQuery, employees, t]);

    const actionCounts = useMemo(() => {
        const pool = filterEmp 
            ? baseFilteredActions.filter(act => act.employeeId === filterEmp || (act as any).from === filterEmp)
            : baseFilteredActions;

        const total = pool.length;
        const actionsOnly = pool.filter(act => !['unjustified_absence', 'justified_absence', 'annual_leave', 'sick_leave'].includes(act.type)).length;
        const penalties = pool.filter(act => ['violation', 'late'].includes(act.type)).length;
        const absences = pool.filter(act => ['unjustified_absence', 'justified_absence'].includes(act.type)).length;
        const leaves = pool.filter(act => ['annual_leave', 'sick_leave'].includes(act.type)).length;
        const lates = pool.filter(act => act.type === 'late').length;
        const positives = pool.filter(act => act.type === 'positive').length;

        return { total, actionsOnly, penalties, absences, leaves, lates, positives };
    }, [baseFilteredActions, filterEmp]);

    const exportActionsToCSV = () => {
        if (filteredActions.length === 0) {
            alert('لا توجد سجلات مطابقة للفلترة لتصديرها');
            return;
        }
        
        const headers = ['الموظف', 'نوع الإجراء', 'من تاريخ', 'إلى تاريخ', 'النقاط/الخصم', 'الوصف/الملاحظات'];
        const rows = filteredActions.map(act => {
            const empName = getEmpName(act.employeeId, act);
            const typeLabel = t(`action.${act.type}`) || act.type;
            const fromD = safeDate(act.fromDate);
            const toD = safeDate(act.toDate);
            const weight = ACTION_WEIGHTS[act.type] || 0;
            const points = weight < 0 ? `+${Math.abs(weight)}` : `-${weight}`;
            const desc = (act.description || '').replace(/"/g, '""');
            return `"${empName}","${typeLabel}","${fromD}","${toD}","${points}","${desc}"`;
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const dTitle = dateMode === 'custom' && filterFromDate && filterToDate ? `${filterFromDate}_to_${filterToDate}` : `${filterYear}_${filterMonth}`;
        link.setAttribute('download', `Actions_Report_${dTitle}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const allEvaluations = useMemo(() => {
        const months = getMonthCount();
        const maxScore = months * POINTS_PER_MONTH;
        const { start, end } = getDateRange();
        
        // Filter out doctors
        const nonDoctorEmployees = employees.filter(emp => emp.role !== 'doctor' && emp.jobCategory !== 'doctor');

        return nonDoctorEmployees.map(emp => {
            const empActions = baseFilteredActions.filter(act => 
                act.employeeId === emp.id || 
                (emp as any).uid === act.employeeId || 
                (act as any).from === emp.id || 
                (act as any).from === (emp as any).uid
            );
            
            // Calculate next leave date
            const allEmpActions = actions.filter(act => 
                act.employeeId === emp.id || 
                (emp as any).uid === act.employeeId || 
                (act as any).from === emp.id || 
                (act as any).from === (emp as any).uid
            );
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
            let unjustifiedAbsences = 0;
            let justifiedAbsences = 0;
            let absences = 0;
            let sickLeaves = 0;
            let violations = 0;
            let positives = 0;
            let annualLeaveDays = 0;
            let missions = 0;
            
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
                if (act.type === 'unjustified_absence') unjustifiedAbsences += days;
                if (act.type === 'justified_absence') justifiedAbsences += days;
                if (act.type === 'unjustified_absence' || act.type === 'justified_absence') absences += days;
                if (act.type === 'sick_leave') sickLeaves += days;
                if (act.type === 'violation') violations += days;
                if (act.type === 'positive') positives += days;
                if (act.type === 'annual_leave') annualLeaveDays += days;
                if (act.type === 'mission') missions += days;
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

            let finalScore = 0;
            let percentage = 0;
            const isDoctor = emp.role === 'doctor' || emp.jobCategory === 'doctor';

            if (isDoctor) {
                // Doctor Evaluation Logic: Base 80 + Productivity - Deductions
                const productivityBonus = empExams.length * 2; // 2 points per exam
                finalScore = Math.min(maxScore, Math.max(0, 80 + productivityBonus - totalDeductions));
                percentage = Math.round((finalScore / maxScore) * 100);
            } else {
                // Standard Employee Logic
                finalScore = Math.min(maxScore + 100, Math.max(0, maxScore - totalDeductions)); 
                percentage = Math.round((finalScore / maxScore) * 100);
            }

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
                    unjustifiedAbsences,
                    justifiedAbsences,
                    sickLeaves, 
                    violations,
                    positives, 
                    annualLeaveDays, 
                    missions,
                    swapCount: empSwaps.length, 
                    examCount: empExams.length 
                },
                nextLeaveDate
            };
        }).sort((a, b) => b.percentage - a.percentage);
    }, [baseFilteredActions, actions, employees, swaps, productivityData, filterMonth, filterYear, filterFromDate, filterToDate, t, attendanceLogs, includeLateness]);

    const chartEvaluations = useMemo(() => {
        return allEvaluations;
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
            const newId = `FOLLOWUP_${Date.now()}`;
            await setDoc(doc(appointmentsDb, 'appointments', newId), {
                id: newId,
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

            const error = null;
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
    const dateTitle = dateMode === 'custom' && filterFromDate && filterToDate 
        ? `${filterFromDate} إلى ${filterToDate}` 
        : `${filterYear}-${filterMonth.padStart(2, '0')}`;

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-12 print:bg-white print:p-0 print:pb-0" dir={dir}>
            
            <PrintHeader 
                title={t('rep.title')} 
                subtitle={`REPORT: ${activeTab === 'productivity' ? 'Completed Exams Log' : 'HR & Attendance'}`} 
                month={dateTitle} 
            />

            {/* Header (Hidden in Print) */}
            <div className="bg-slate-900 text-white pt-8 pb-16 px-6 print:hidden">
                <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight">{t('rep.title')}</h1>
                        <p className="text-slate-400 mt-1">{t('rep.subtitle')}</p>
                    </div>
                    <div className="flex items-center gap-3">
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
                                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center gap-2 text-sm"
                            >
                                <i className="fas fa-plus-circle"></i> {t('rep.add')}
                            </button>
                        )}
                        <button 
                            onClick={handlePrint} 
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 text-sm border border-slate-700"
                        >
                            <i className="fas fa-print"></i> {t('print')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 -mt-10 print:mt-0 print:px-0">
                
                {/* Main Filters Bar */}
                <div className="bg-white rounded-3xl shadow-lg p-5 mb-8 border border-slate-100 print:hidden space-y-4">
                    
                    {/* Top Row: Main Tabs & Date Mode */}
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        {/* Tab Switcher */}
                        <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                            <button 
                                onClick={() => setActiveTab('attendance')} 
                                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'attendance' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                <i className="fas fa-user-check"></i>
                                {t('nav.reports') || 'التقارير والمراجعة'}
                            </button>
                            <button 
                                onClick={() => setActiveTab('productivity')} 
                                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeTab === 'productivity' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                <i className="fas fa-procedures"></i>
                                Completed Exams
                            </button>
                        </div>

                        {/* Date Mode Switcher */}
                        <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                            <button 
                                onClick={() => setDateMode('month')} 
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${dateMode === 'month' ? 'bg-white shadow-sm text-blue-600 font-black' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                <i className="fas fa-calendar-alt text-xs"></i>
                                بالشهر
                            </button>
                            <button 
                                onClick={() => {
                                    setDateMode('custom');
                                    if (!filterFromDate && !filterToDate) {
                                        applyDateShortcut('this_month');
                                    }
                                }} 
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${dateMode === 'custom' ? 'bg-white shadow-sm text-indigo-600 font-black' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                <i className="fas fa-calendar-week text-xs"></i>
                                فترة مخصصة (من - إلى)
                            </button>
                        </div>
                    </div>

                    {/* Middle Row: Primary Filter Selectors */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end pt-2 border-t border-slate-100">
                        {/* Department Filter (Global) */}
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1.5">القسم</label>
                            <select 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-blue-200 px-3 py-2 text-sm"
                                value={selectedDept || ''}
                                onChange={e => setSelectedDept(e.target.value || null)}
                            >
                                <option value="">جميع الأقسام</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>

                        {/* Employee Filter */}
                        {activeTab === 'attendance' && (
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="block text-xs font-bold text-slate-400">{t('rep.filter.emp')}</label>
                                    {filterEmp && (
                                        <button onClick={() => setFilterEmp('')} className="text-[11px] font-bold text-blue-600 hover:underline">
                                            عرض الكل
                                        </button>
                                    )}
                                </div>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-blue-200 px-3 py-2 text-sm" 
                                    value={filterEmp} 
                                    onChange={e => setFilterEmp(e.target.value)}
                                >
                                    <option value="">-- جميع الموظفين --</option>
                                    {employees.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                                </select>
                            </div>
                        )}

                        {/* Search for Productivity Tab */}
                        {activeTab === 'productivity' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1.5">بحث في الحالات (اسم / ملف)</label>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-emerald-200 px-3 py-2 text-sm" 
                                    placeholder="رقم الملف أو الاسم..."
                                    value={prodSearch} 
                                    onChange={e => setProdSearch(e.target.value)}
                                />
                            </div>
                        )}

                        {/* Date Controls depending on dateMode */}
                        {dateMode === 'month' ? (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('month')}</label>
                                    <select 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 px-3 py-2 text-sm" 
                                        value={filterMonth} 
                                        onChange={e => { setFilterMonth(e.target.value); setFilterFromDate(''); setFilterToDate(''); }}
                                    >
                                        {[...Array(12)].map((_, i) => <option key={i} value={i+1}>شهر {i+1}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('year')}</label>
                                    <select 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 px-3 py-2 text-sm" 
                                        value={filterYear} 
                                        onChange={e => { setFilterYear(e.target.value); setFilterFromDate(''); setFilterToDate(''); }}
                                    >
                                        {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1.5">من تاريخ (From)</label>
                                    <input 
                                        type="date" 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 px-3 py-2 text-sm" 
                                        value={filterFromDate} 
                                        onChange={e => setFilterFromDate(e.target.value)} 
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1.5">إلى تاريخ (To)</label>
                                    <input 
                                        type="date" 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 px-3 py-2 text-sm" 
                                        value={filterToDate} 
                                        onChange={e => setFilterToDate(e.target.value)} 
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Date Shortcuts (When in Custom Range Mode) */}
                    {dateMode === 'custom' && (
                        <div className="flex flex-wrap gap-2 pt-2 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                            <span className="font-bold text-slate-400 flex items-center gap-1">
                                <i className="fas fa-bolt text-amber-500"></i> اختصارات الفترة:
                            </span>
                            <button onClick={() => applyDateShortcut('today')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                اليوم
                            </button>
                            <button onClick={() => applyDateShortcut('this_week')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                آخر 7 أيام
                            </button>
                            <button onClick={() => applyDateShortcut('this_month')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                هذا الشهر
                            </button>
                            <button onClick={() => applyDateShortcut('last_month')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                الشهر السابق
                            </button>
                            <button onClick={() => applyDateShortcut('last_30_days')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                آخر 30 يوم
                            </button>
                            <button onClick={() => applyDateShortcut('this_quarter')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                هذا الربع
                            </button>
                            <button onClick={() => applyDateShortcut('this_year')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                كامل السنة
                            </button>
                            <button 
                                onClick={() => {
                                    setFilterFromDate('');
                                    setFilterToDate('');
                                    setDateMode('month');
                                }} 
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-bold border border-red-200 transition-colors ml-auto"
                            >
                                <i className="fas fa-undo text-[10px] mr-1"></i> إعادة ضبط
                            </button>
                        </div>
                    )}
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
                    <div className="space-y-6">

                        {/* Secondary Action Toolbar: Category Pills & Specific Filter & Search */}
                        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4 print:hidden">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                {/* Action Category Filters (Including "الإجراءات فقط بدون الغياب والإجازات") */}
                                <div className="flex flex-wrap gap-2 items-center">
                                    <button 
                                        onClick={() => setActionFilterCategory('all')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'all' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        <i className="fas fa-list-ul"></i>
                                        الكل
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                            {actionCounts.total}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('actions_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'actions_only' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}
                                    >
                                        <i className="fas fa-bolt text-amber-300"></i>
                                        الإجراءات فقط (بدون الغياب والإجازات)
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'actions_only' ? 'bg-blue-800 text-white' : 'bg-blue-200 text-blue-800'}`}>
                                            {actionCounts.actionsOnly}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('penalties_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'penalties_only' ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-500/20' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                                    >
                                        <i className="fas fa-gavel"></i>
                                        المخالفات والجزاءات
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'penalties_only' ? 'bg-red-800 text-white' : 'bg-red-200 text-red-800'}`}>
                                            {actionCounts.penalties}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('absences_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'absences_only' ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-500/20' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}
                                    >
                                        <i className="fas fa-user-times"></i>
                                        الغياب فقط
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'absences_only' ? 'bg-rose-800 text-white' : 'bg-rose-200 text-rose-800'}`}>
                                            {actionCounts.absences}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('leaves_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'leaves_only' ? 'bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-500/20' : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'}`}
                                    >
                                        <i className="fas fa-umbrella-beach"></i>
                                        الإجازات فقط
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'leaves_only' ? 'bg-orange-800 text-white' : 'bg-orange-200 text-orange-800'}`}>
                                            {actionCounts.leaves}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('late_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'late_only' ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                                    >
                                        <i className="fas fa-clock"></i>
                                        التأخيرات
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'late_only' ? 'bg-amber-800 text-white' : 'bg-amber-200 text-amber-800'}`}>
                                            {actionCounts.lates}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('positives_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'positives_only' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
                                    >
                                        <i className="fas fa-star"></i>
                                        المكافآت والتقديرات
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'positives_only' ? 'bg-emerald-800 text-white' : 'bg-emerald-200 text-emerald-800'}`}>
                                            {actionCounts.positives}
                                        </span>
                                    </button>
                                </div>

                                {/* View Mode Switcher (Overview vs Actions Log Table) */}
                                {!filterEmp && (
                                    <div className="flex bg-slate-100 p-1 rounded-xl">
                                        <button 
                                            onClick={() => setMainViewTab('overview')} 
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${mainViewTab === 'overview' ? 'bg-white shadow text-slate-900 font-black' : 'text-slate-500'}`}
                                        >
                                            <i className="fas fa-chart-pie"></i> لوحة التقييم
                                        </button>
                                        <button 
                                            onClick={() => setMainViewTab('actions_table')} 
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${mainViewTab === 'actions_table' ? 'bg-white shadow text-blue-600 font-black' : 'text-slate-500'}`}
                                        >
                                            <i className="fas fa-table"></i> سجل الإجراءات التفصيلي
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Search & Specific Action Type Bar */}
                            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
                                {/* Search input */}
                                <div className="flex-1 min-w-[240px] relative">
                                    <i className="fas fa-search absolute right-3 top-3 text-slate-400 text-xs"></i>
                                    <input 
                                        type="text" 
                                        placeholder="بحث في الوصف أو الملاحظات أو اسم الموظف..." 
                                        value={actionSearchQuery} 
                                        onChange={e => setActionSearchQuery(e.target.value)} 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-200 outline-none"
                                    />
                                    {actionSearchQuery && (
                                        <button onClick={() => setActionSearchQuery('')} className="absolute left-3 top-2.5 text-xs text-slate-400 hover:text-slate-600">
                                            <i className="fas fa-times"></i>
                                        </button>
                                    )}
                                </div>

                                {/* Specific Type Filter */}
                                <div className="w-full sm:w-[220px]">
                                    <select 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
                                        value={actionSpecificType}
                                        onChange={e => setActionSpecificType(e.target.value)}
                                    >
                                        <option value="all">كل الأنواع المحددة</option>
                                        <option value="annual_leave">إجازة سنوية</option>
                                        <option value="sick_leave">إجازة مرضية</option>
                                        <option value="justified_absence">غياب بإذن</option>
                                        <option value="unjustified_absence">غياب بدون إذن</option>
                                        <option value="late">تأخير</option>
                                        <option value="violation">مخالفة / جزاء</option>
                                        <option value="mission">مأمورية</option>
                                        <option value="positive">مكافأة / إيجابي</option>
                                    </select>
                                </div>

                                {/* Include Lateness Toggle */}
                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
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

                                {/* Export CSV Button */}
                                <button 
                                    onClick={exportActionsToCSV}
                                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                                >
                                    <i className="fas fa-file-excel text-emerald-600"></i>
                                    تصدير CSV
                                </button>
                            </div>
                        </div>

                        {/* Content Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            
                            {/* Left Column: Staff Evaluation Card or Summary List */}
                            <div className="space-y-6">
                                {filterEmp && evaluation ? (
                                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 text-center relative overflow-hidden print:border-2 print:border-slate-800">
                                        <button 
                                            onClick={() => setFilterEmp('')} 
                                            className="absolute top-4 left-4 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-all print:hidden"
                                        >
                                            <i className="fas fa-users mr-1"></i> كل الموظفين
                                        </button>

                                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-2xl font-black text-slate-700 mx-auto mb-3 shadow-inner">
                                            {evaluation.employee.name.charAt(0)}
                                        </div>
                                        <h3 className="font-bold text-xl text-slate-800">{evaluation.employee.name}</h3>
                                        <p className="text-xs font-bold text-slate-400 mt-0.5">{evaluation.employee.email}</p>

                                        {/* Score Gauge */}
                                        <div className="relative w-32 h-32 mx-auto my-6 flex items-center justify-center">
                                            <svg className="w-full h-full transform -rotate-90">
                                                <circle cx="64" cy="64" r={radius} stroke="#f1f5f9" strokeWidth="10" fill="transparent" />
                                                <circle 
                                                    cx="64" cy="64" r={radius} 
                                                    stroke={evaluation.percentage >= 85 ? '#10b981' : evaluation.percentage >= 70 ? '#3b82f6' : evaluation.percentage >= 50 ? '#f97316' : '#ef4444'} 
                                                    strokeWidth="10" 
                                                    strokeDasharray={circumference} 
                                                    strokeDashoffset={offset} 
                                                    strokeLinecap="round" 
                                                    fill="transparent" 
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <span className="text-2xl font-black text-slate-800">{evaluation.percentage}%</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">{evaluation.grade}</span>
                                            </div>
                                        </div>

                                        {/* Evaluation Breakdown */}
                                        <div className="grid grid-cols-2 gap-2.5 text-right">
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">غياب بدون إذن</span>
                                                <span className="text-sm font-black text-red-600">
                                                    {evaluation.stats.unjustifiedAbsences} <span className="text-xs font-bold text-slate-400">يوم</span>
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">تأخيرات</span>
                                                <span className="text-sm font-black text-amber-600">
                                                    {evaluation.stats.lates} <span className="text-xs font-bold text-slate-400">مرات</span>
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">مخالفات / جزاءات</span>
                                                <span className="text-sm font-black text-rose-600">
                                                    {evaluation.stats.violations} <span className="text-xs font-bold text-slate-400">إجراء</span>
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">إيجابيات / مكافآت</span>
                                                <span className="text-sm font-black text-emerald-600">
                                                    {evaluation.stats.positives} <span className="text-xs font-bold text-slate-400">نقاط</span>
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">إجازات سنوية</span>
                                                <span className="text-sm font-black text-purple-600">
                                                    {evaluation.stats.annualLeaveDays} <span className="text-xs font-bold text-slate-400">يوم</span>
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">إجازات مرضية</span>
                                                <span className="text-sm font-black text-blue-600">
                                                    {evaluation.stats.sickLeaves} <span className="text-xs font-bold text-slate-400">يوم</span>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Total Deductions Bar */}
                                        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center px-1">
                                            <span className="text-xs font-bold text-slate-500">إجمالي نقاط الخصم:</span>
                                            <span className="text-sm font-black text-red-600 bg-red-50 px-2.5 py-0.5 rounded-lg border border-red-100">
                                                -{evaluation.totalDeductions}
                                            </span>
                                        </div>

                                        {evaluation.nextLeaveDate && (
                                            <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl p-2.5 flex items-center gap-2.5 text-right">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                                    <i className="fas fa-plane-departure text-xs"></i>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-[10px] font-bold text-blue-400">استحقاق الإجازة القادمة</div>
                                                    <div className="text-xs font-black text-blue-700">
                                                        {evaluation.nextLeaveDate.toLocaleDateString('en-GB')}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Staff Ranking Overview Table */
                                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                                                <i className="fas fa-award text-amber-500"></i> ترتيب وتقييم الموظفين
                                            </h4>
                                            <span className="text-xs font-bold bg-white px-2 py-0.5 rounded-full border text-slate-500">
                                                {allEvaluations.length}
                                            </span>
                                        </div>
                                        <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-50 custom-scrollbar">
                                            {allEvaluations.map((ev, i) => (
                                                <div 
                                                    key={ev.employee.id} 
                                                    onClick={() => setFilterEmp(ev.employee.id)}
                                                    className={`p-3.5 hover:bg-blue-50/50 cursor-pointer transition-colors flex items-center justify-between ${filterEmp === ev.employee.id ? 'bg-blue-50 border-r-4 border-blue-600' : ''}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-6 text-center text-xs font-bold text-slate-400">#{i + 1}</span>
                                                        <div>
                                                            <div className="font-bold text-xs text-slate-800">{ev.employee.name}</div>
                                                            <div className="text-[10px] text-slate-400 flex gap-2 mt-0.5">
                                                                <span>خصم: -{ev.totalDeductions}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-left">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${ev.percentage >= 85 ? 'bg-emerald-50 text-emerald-600' : ev.percentage >= 70 ? 'bg-blue-50 text-blue-600' : ev.percentage >= 50 ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'}`}>
                                                            {ev.percentage}%
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right 2 Columns: Performance Overview OR Actions Log Table */}
                            <div className="lg:col-span-2 space-y-6 print:w-full">
                                {(!filterEmp && mainViewTab === 'overview') ? (
                                    <div className="space-y-6">
                                        {/* Top Summary Cards */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {/* Best Performer */}
                                            <div className="bg-white p-5 rounded-3xl shadow-sm border border-emerald-100 relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 opacity-50"></div>
                                                <div className="relative z-10">
                                                    <div className="text-xs font-bold text-emerald-600 uppercase mb-1">الأفضل أداءً</div>
                                                    <div className="text-xl font-black text-slate-800 truncate">
                                                        {chartEvaluations[0]?.employee.name || '-'}
                                                    </div>
                                                    <div className="text-xs font-bold text-emerald-500 mt-1">
                                                        {chartEvaluations[0]?.percentage}% - {chartEvaluations[0]?.grade}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Needs Improvement */}
                                            <div className="bg-white p-5 rounded-3xl shadow-sm border border-red-100 relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-bl-full -mr-4 -mt-4 opacity-50"></div>
                                                <div className="relative z-10">
                                                    <div className="text-xs font-bold text-red-600 uppercase mb-1">يحتاج تحسين ({needsImprovementList.length})</div>
                                                    {needsImprovementList.length === 0 ? (
                                                        <div className="text-slate-400 text-xs italic mt-1">لا يوجد موظفين بحاجة لتحسين</div>
                                                    ) : (
                                                        <div className="text-sm font-black text-slate-800 truncate">
                                                            {needsImprovementList[0]?.employee.name} ({needsImprovementList[0]?.percentage}%)
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Average */}
                                            <div className="bg-white p-5 rounded-3xl shadow-sm border border-blue-100 relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 opacity-50"></div>
                                                <div className="relative z-10">
                                                    <div className="text-xs font-bold text-blue-600 uppercase mb-1">متوسط الأداء</div>
                                                    <div className="text-2xl font-black text-slate-800">
                                                        {Math.round(chartEvaluations.reduce((acc, curr) => acc + curr.percentage, 0) / (chartEvaluations.length || 1))}%
                                                    </div>
                                                    <div className="text-xs font-bold text-blue-400 mt-0.5">
                                                        للموظفين النشطين ({chartEvaluations.length})
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Chart */}
                                        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
                                            <div className="flex justify-between items-center mb-6">
                                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                    <i className="fas fa-chart-bar text-blue-500"></i>
                                                    تحليل الأداء العام للموظفين
                                                </h3>
                                                <button 
                                                    onClick={() => setMainViewTab('actions_table')} 
                                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-all"
                                                >
                                                    <i className="fas fa-table mr-1"></i> استعراض سجل الإجراءات التفصيلي ({filteredActions.length})
                                                </button>
                                            </div>
                                            <div className="h-[360px] w-full" dir="ltr">
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
                                ) : null}

                                {/* Actions & Procedures Log Table (Shown when tab is actions_table OR an employee is selected OR during print) */}
                                {(mainViewTab === 'actions_table' || filterEmp || true) && (
                                    <div className={`bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:border-2 print:border-slate-800 print:shadow-none print:rounded-lg ${(!filterEmp && mainViewTab === 'overview') ? 'print:block' : ''}`}>
                                        <div className="p-5 border-b border-slate-100 flex flex-wrap justify-between items-center bg-slate-50/70 print:bg-white print:border-b-2 print:border-slate-800 gap-3">
                                            <div className="flex items-center gap-3">
                                                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                                                    <i className="fas fa-history text-blue-500 print:hidden"></i> 
                                                    {filterEmp ? `سجل الإجراءات - ${employees.find(e => e.id === filterEmp)?.name}` : 'سجل الإجراءات والمراجعة (جميع الموظفين)'}
                                                </h3>
                                                {actionFilterCategory !== 'all' && (
                                                    <span className="text-[11px] font-bold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full">
                                                        {actionFilterCategory === 'actions_only' && '⚡ الإجراءات فقط (بدون غياب وإجازات)'}
                                                        {actionFilterCategory === 'penalties_only' && '⚖️ الجزاءات والمخالفات'}
                                                        {actionFilterCategory === 'absences_only' && '🚫 الغياب فقط'}
                                                        {actionFilterCategory === 'leaves_only' && '🏖️ الإجازات فقط'}
                                                        {actionFilterCategory === 'late_only' && '⏰ التأخيرات'}
                                                        {actionFilterCategory === 'positives_only' && '🌟 المكافآت'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold bg-white px-3 py-1 rounded-full border text-slate-600 shadow-2xs">
                                                    {filteredActions.length} سجل
                                                </span>
                                                {filterEmp && (
                                                    <button 
                                                        onClick={() => setFilterEmp('')}
                                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-white hover:bg-blue-50 px-3 py-1 rounded-full border border-blue-200 transition-colors print:hidden"
                                                    >
                                                        عرض كل الموظفين
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className={`w-full text-sm ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                                <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase print:bg-white print:text-black print:border-b-2 print:border-slate-800">
                                                    <tr>
                                                        <th className="p-4">{t('rep.filter.emp')}</th>
                                                        <th className="p-4">{t('req.type')}</th>
                                                        <th className="p-4">{t('date')}</th>
                                                        <th className="p-4">النقاط / الخصم</th>
                                                        <th className="p-4 print:hidden">{t('actions')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                                                    {filteredActions.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="p-12 text-center text-slate-400">
                                                                <i className="fas fa-inbox text-3xl mb-2 block opacity-30"></i>
                                                                لا توجد إجراءات مطابقة للفلترة في الفترة المحددة ({dateTitle})
                                                            </td>
                                                        </tr>
                                                    ) : filteredActions.map(act => {
                                                        const weight = ACTION_WEIGHTS[act.type];
                                                        const isPositive = weight < 0;
                                                        return (
                                                            <tr key={act.id} className="hover:bg-slate-50/70 transition-colors group print:hover:bg-transparent">
                                                                <td className="p-4 border-r print:border-slate-300">
                                                                    <div className="font-bold text-slate-800">{getEmpName(act.employeeId, act)}</div>
                                                                    <div className="text-xs text-slate-400 print:text-slate-600 mt-0.5">{act.description}</div>
                                                                </td>
                                                                <td className="p-4 border-r print:border-slate-300">
                                                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-block ${
                                                                        act.type === 'violation' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                        act.type === 'late' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                        act.type === 'positive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                        act.type === 'mission' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                                        act.type === 'unjustified_absence' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                                        'bg-slate-100 text-slate-700 border-slate-200'
                                                                    } print:border-none print:bg-transparent print:text-black print:p-0`}>
                                                                        {t(`action.${act.type}`) || act.type}
                                                                    </span>
                                                                </td>
                                                                <td className="p-4 text-xs font-mono text-slate-600 border-r print:border-slate-300">
                                                                    <div className="font-bold">{safeDate(act.fromDate)}</div>
                                                                    {safeDate(act.fromDate) !== safeDate(act.toDate) && (
                                                                        <div className="text-[11px] text-slate-400 mt-0.5">
                                                                            <i className="fas fa-arrow-down text-[10px] mx-1 text-slate-300 print:hidden"></i>
                                                                            إلى {safeDate(act.toDate)}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="p-4 font-bold border-r print:border-slate-300">
                                                                    {isPositive ? (
                                                                        <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-xs font-black">+{Math.abs(weight)}</span>
                                                                    ) : weight > 0 ? (
                                                                        <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100 text-xs font-black">-{weight}</span>
                                                                    ) : (
                                                                        <span className="text-slate-400 text-xs">0</span>
                                                                    )}
                                                                </td>
                                                                <td className="p-4 print:hidden">
                                                                    {!act.id.startsWith('auto-') && (
                                                                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <button onClick={() => handleEdit(act)} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center"><i className="fas fa-pen text-xs"></i></button>
                                                                            <button onClick={() => handleDelete(act.id)} className="w-7 h-7 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center"><i className="fas fa-trash text-xs"></i></button>
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
