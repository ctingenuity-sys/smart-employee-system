
// ... existing imports
import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { User, ActionLog, Appointment, Schedule, AttendanceLog } from '../types';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import { PrintHeader, PrintFooter } from '../components/PrintLayout';
// @ts-ignore
import { collection, getDocs, addDoc, deleteDoc, updateDoc, doc, Timestamp, query, where, onSnapshot, setDoc, orderBy, serverTimestamp } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useDepartment } from '../contexts/DepartmentContext';
import { UserRole } from '../types';
import { useFilteredUsers } from '../hooks/useFilteredUsers';
import { isValidStaffName } from '../utils/staffUtils';
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
    const { role: authRole, user: currentUser, userName } = useAuth();
    const { departments, selectedDepartmentId: contextDeptId, setSelectedDepartmentId } = useDepartment();
    const isAdmin = authRole === UserRole.ADMIN || String(authRole).toLowerCase() === 'admin' || localStorage.getItem('role') === 'admin';
    const [selectedDept, setSelectedDept] = useState<string | null>(isAdmin ? contextDeptId : (contextDeptId || currentUser?.departmentId || null));
    const [allEmployees, setAllEmployees] = useState<User[]>([]);
    const [allSystemUsers, setAllSystemUsers] = useState<User[]>([]);
    const [allPenalties, setAllPenalties] = useState<any[]>([]);
    const employees = useFilteredUsers(allEmployees, selectedDept);

    useEffect(() => {
        if (!isAdmin) {
            setSelectedDept(contextDeptId || currentUser?.departmentId || null);
        }
    }, [isAdmin, contextDeptId, currentUser]);
    
    // Real-time collections state
    const [rawActions, setRawActions] = useState<ActionLog[]>([]);
    const [approvedLeaves, setApprovedLeaves] = useState<any[]>([]);
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
    const [isSingleDay, setIsSingleDay] = useState(true);
    const [isSubmittingAction, setIsSubmittingAction] = useState(false);
    const [successToast, setSuccessToast] = useState<string | null>(null);
    const [actionCategoryTab, setActionCategoryTab] = useState<'all' | 'disciplinary' | 'permissions' | 'leaves' | 'rewards'>('all');
    
    // State for the interactive "Send Penalty to Penalties Page?" prompt
    const [penaltyPromptModal, setPenaltyPromptModal] = useState<{
        isOpen: boolean;
        employeeId: string;
        employeeName: string;
        actionType: string;
        actionTitle: string;
        date: string;
        description: string;
        penaltyType: '1st Warning' | '2nd Warning' | 'Final Warning' | 'Deduction' | 'Suspension' | 'Dismissal';
        deductionDays: string;
        suspensionDays: string;
        suspensionFrom: string;
        suspensionTo: string;
    } | null>(null);

    const defaultFormData = {
        employeeId: '',
        type: 'violation',
        fromDate: new Date().toISOString().split('T')[0],
        toDate: new Date().toISOString().split('T')[0],
        description: '',
        hours: '',
        timeFrom: '',
        timeTo: '',
        sendPenalty: false,
        penaltyType: '1st Warning' as '1st Warning' | '2nd Warning' | 'Final Warning' | 'Deduction' | 'Suspension' | 'Dismissal',
        deductionDays: '',
        suspensionDays: '',
        suspensionFrom: '',
        suspensionTo: ''
    };

    const [formData, setFormData] = useState(defaultFormData);

    const ACTION_WEIGHTS: Record<string, number> = {
        'annual_leave': 0, 
        'sick_leave': 1, 
        'justified_absence': 2, 
        'unjustified_absence': 10,
        'late': 3, 
        'mission': 0, 
        'violation': 10,
        'positive': -5,
        'hourly_permission': 0,
        'early_leave': 2,
        'permitted_late': 1,
        'verbal_warning': 4,
        'neglect': 8,
        'conduct_violation': 10,
        'overtime': -4,
        'training': 0
    };

    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [includeLateness, setIncludeLateness] = useState(true);
    const [includeAutoAbsence, setIncludeAutoAbsence] = useState(true);

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

    // --- Real-time Listeners (Actions, Approved Leaves, Users & Swaps) ---
    useEffect(() => {
        // 1. Real-time listener for manual and logged actions
        const qActions = collection(db, 'actions');
        const unsubActions = onSnapshot(qActions, (snap) => {
            const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as ActionLog));
            setRawActions(list);
            setLoading(false);
        }, (err) => {
            console.error("Actions listener error:", err);
            setLoading(false);
        });

        // 2. Real-time listener for approved leave requests
        const qLeaves = collection(db, 'leaveRequests');
        const unsubLeaves = onSnapshot(qLeaves, (snap) => {
            const list = snap.docs
                .map(d => ({ ...d.data(), id: d.id }))
                .filter((leave: any) => {
                    const s = (leave.status || '').toLowerCase();
                    return (
                        s === 'approved' || 
                        s === 'approvedbymanager' || 
                        s === 'approvedbysupervisor' || 
                        s === 'accepted' || 
                        leave.managerApproval?.approved === true || 
                        (leave.supervisorApproval?.approved === true && !leave.hasManagers)
                    );
                });
            setApprovedLeaves(list);
        }, (err) => {
            console.error("Leaves listener error:", err);
        });

        // 3. Real-time listener for users
        const qUsers = collection(db, 'users');
        const unsubUsers = onSnapshot(qUsers, (snap) => {
            const fetchedUsers = snap.docs.map(d => ({ ...d.data(), id: d.id } as User));
            setAllSystemUsers(fetchedUsers);
            setAllEmployees(fetchedUsers.filter(u => !['admin', 'supervisor', 'manager'].includes(u.role)));
        }, (err) => {
            console.error("Users listener error:", err);
        });

        // 4. Real-time listener for penalties
        const qPenalties = collection(db, 'penalties');
        const unsubPenalties = onSnapshot(qPenalties, (snap) => {
            setAllPenalties(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        }, (err) => {
            console.error("Penalties listener error:", err);
        });

        // 5. Real-time listener for swaps
        const qSwaps = collection(db, 'swapRequests');
        const unsubSwaps = onSnapshot(qSwaps, (snap) => {
            setSwaps(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        }, (err) => {
            console.error("Swaps listener error:", err);
        });

        return () => {
            unsubActions();
            unsubLeaves();
            unsubUsers();
            unsubPenalties();
            unsubSwaps();
        };
    }, []);

    // Dynamically combine rawActions with approved leave requests in real time
    const actions = useMemo(() => {
        const list = [...rawActions];

        approvedLeaves.forEach((leave: any) => {
            const leaveEmpId = leave.from || leave.userId || leave.employeeId;
            const leaveTypeStr = (leave.typeOfLeave || leave.type || '').toString().toLowerCase();
            const isSick = leaveTypeStr.includes('sick') || leaveTypeStr.includes('مرض');
            const actionType = isSick ? 'sick_leave' : 'annual_leave';
            const leaveFrom = safeDate(leave.startDate || leave.fromDate);
            const leaveTo = safeDate(leave.endDate || leave.toDate || leave.startDate || leave.fromDate);

            if (!leaveEmpId || !leaveFrom) return;

            const alreadyExists = list.some(act => 
                (act.leaveRequestId && act.leaveRequestId === leave.id) ||
                (
                    (act.employeeId === leaveEmpId || (act as any).from === leaveEmpId || (act as any).userId === leaveEmpId) && 
                    act.type === actionType && 
                    safeDate(act.fromDate) === leaveFrom && 
                    safeDate(act.toDate) === leaveTo
                )
            );

            if (!alreadyExists) {
                list.push({
                    id: `leave-req-${leave.id}`,
                    employeeId: leaveEmpId,
                    from: leaveEmpId,
                    type: actionType,
                    fromDate: leaveFrom,
                    toDate: leaveTo,
                    description: `${t('action.' + actionType) || (actionType === 'sick_leave' ? 'إجازة مرضية' : 'إجازة سنوية')} (${leave.typeOfLeave || leave.type || 'معتمدة'})${leave.reason ? ': ' + leave.reason : ''}`,
                    leaveRequestId: leave.id,
                    createdAt: leave.createdAt ? (leave.createdAt.toDate ? leave.createdAt.toDate() : new Date(leave.createdAt)) : new Date()
                } as ActionLog);
            }
        });

        return list;
    }, [rawActions, approvedLeaves, t]);

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

                // 4. Fetch Attendance Logs (both by date string and timestamp range for 100% coverage)
                const logsMap = new Map<string, AttendanceLog>();

                try {
                    const qLogsDate = query(collection(db, 'attendance_logs'), 
                        where('date', '>=', start), 
                        where('date', '<=', end)
                    );
                    const snapDate = await getDocs(qLogsDate);
                    snapDate.docs.forEach(d => {
                        logsMap.set(d.id, { ...d.data(), id: d.id } as AttendanceLog);
                    });
                } catch (e) {
                    console.warn("Query attendance_logs by date error:", e);
                }

                try {
                    const startDate = new Date(start + 'T00:00:00');
                    const endDate = new Date(end + 'T23:59:59');
                    const qLogsTs = query(collection(db, 'attendance_logs'), 
                        where('timestamp', '>=', Timestamp.fromDate(startDate)),
                        where('timestamp', '<=', Timestamp.fromDate(endDate))
                    );
                    const snapTs = await getDocs(qLogsTs);
                    snapTs.docs.forEach(d => {
                        logsMap.set(d.id, { ...d.data(), id: d.id } as AttendanceLog);
                    });
                } catch (e) {
                    console.warn("Query attendance_logs by timestamp error:", e);
                }

                setAttendanceLogs(Array.from(logsMap.values()));
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
            const empUserId = emp.id;
            const empUid = (emp as any).uid;
            const empBiometricId = (emp as any).biometricId;

            dates.forEach(dateStr => {
                // 1. Find Schedule for this User on this Date
                // Priority: Specific Date schedule
                let sch = schedules.find(s => 
                    (s.userId === empUserId || (empUid && s.userId === empUid)) && s.date === dateStr
                );

                if (!sch) {
                    const monthStr = dateStr.substring(0, 7); // YYYY-MM
                    const mSch = schedules.find(s => 
                        (s.userId === empUserId || (empUid && s.userId === empUid)) && s.month === monthStr
                    );
                    if (mSch && mSch.shifts && mSch.shifts.length > 0) {
                        sch = mSch;
                    }
                }

                if (!sch || !sch.shifts || sch.shifts.length === 0) return; // No schedule for this day

                // 2. Check for Manual Actions (Leave, Absence, Mission, etc.)
                // If there is ANY manual action or approved leave covering this day, skip auto-generation
                const hasManual = actions.some(act => {
                    const isEmp = act.employeeId === empUserId || (empUid && act.employeeId === empUid) || (act as any).from === empUserId || (empUid && (act as any).from === empUid);
                    if (!isEmp) return false;
                    const actStart = safeDate(act.fromDate);
                    const actEnd = safeDate(act.toDate);
                    return dateStr >= actStart && dateStr <= actEnd;
                });

                if (hasManual) return;

                // 3. Check Attendance Logs
                const userLogs = attendanceLogs.filter(log => {
                    const logUser = log.userId || (log as any).employeeId || (log as any).from;
                    const isUser = logUser === empUserId || (empUid && logUser === empUid) || (empBiometricId && (log as any).biometricId === empBiometricId);
                    if (!isUser) return false;

                    let logDate = log.date;
                    if (!logDate) {
                        const ts = log.timestamp?.toDate ? log.timestamp.toDate() : (log.clientTimestamp?.toDate ? log.clientTimestamp.toDate() : new Date(log.timestamp || log.clientTimestamp));
                        if (ts && !isNaN(ts.getTime())) {
                            logDate = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`;
                        }
                    }
                    return logDate === dateStr;
                });

                const inLogs = userLogs.filter(l => l.type === 'IN').sort((a, b) => {
                    const da = a.timestamp?.toDate ? a.timestamp.toDate() : (a.clientTimestamp?.toDate ? a.clientTimestamp.toDate() : new Date(a.timestamp || a.clientTimestamp || 0));
                    const db = b.timestamp?.toDate ? b.timestamp.toDate() : (b.clientTimestamp?.toDate ? b.clientTimestamp.toDate() : new Date(b.timestamp || b.clientTimestamp || 0));
                    return da.getTime() - db.getTime();
                });

                if (includeAutoAbsence && inLogs.length === 0) {
                    generated.push({
                        id: `auto-abs-${empUserId}-${dateStr}`,
                        employeeId: empUserId,
                        from: empUserId,
                        type: 'unjustified_absence',
                        fromDate: dateStr,
                        toDate: dateStr,
                        description: t('rep.ranking.unjustifiedAbsenceAuto') || 'غياب بدون إذن (تلقائي)',
                        createdAt: new Date()
                    } as ActionLog);
                } else if (inLogs.length > 0 && includeLateness) {
                    // Check for Late
                    const firstShift = sch!.shifts[0];
                    if (firstShift && firstShift.start) {
                        const firstInLog = inLogs[0];
                        const logTime = firstInLog.timestamp?.toDate ? firstInLog.timestamp.toDate() : (firstInLog.clientTimestamp?.toDate ? firstInLog.clientTimestamp.toDate() : new Date(firstInLog.timestamp || firstInLog.clientTimestamp));
                        
                        if (logTime && !isNaN(logTime.getTime())) {
                            const [h, m] = firstShift.start.split(':').map(Number);
                            const shiftStart = new Date(dateStr + 'T00:00:00');
                            shiftStart.setHours(h, m, 0, 0);

                            const gracePeriodMins = 15;
                            const lateThreshold = new Date(shiftStart.getTime() + gracePeriodMins * 60000);

                            if (logTime > lateThreshold) {
                                const lateMins = Math.floor((logTime.getTime() - shiftStart.getTime()) / 60000);
                                generated.push({
                                    id: `auto-late-${empUserId}-${dateStr}`,
                                    employeeId: empUserId,
                                    from: empUserId,
                                    type: 'late',
                                    fromDate: dateStr,
                                    toDate: dateStr,
                                    description: `${t('action.late') || 'تأخير'} ${lateMins} ${t('rep.eval.timesUnit') || 'دقيقة'} (تلقائي)`,
                                    createdAt: new Date()
                                } as ActionLog);
                            }
                        }
                    }
                }
            });
        });

        return generated;
    }, [schedules, attendanceLogs, actions, employees, filterFromDate, filterToDate, filterMonth, filterYear, dateMode, includeAutoAbsence, includeLateness, t]);

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
        if (!employeeId && !act) return 'Unknown';

        // 1. Check in department-filtered employees
        let found = employees.find(e => 
            e.id === employeeId || 
            (e as any).uid === employeeId || 
            (act && ((e as any).uid === (act as any).from || e.id === (act as any).from || e.id === (act as any).userId))
        );
        if (found?.name) return found.name;

        // 2. Check in all system users (regardless of role or department)
        found = allSystemUsers.find(e => 
            e.id === employeeId || 
            (e as any).uid === employeeId || 
            (e as any).email === employeeId ||
            (act && ((e as any).uid === (act as any).from || e.id === (act as any).from || e.id === (act as any).userId))
        );
        if (found?.name) return found.name;

        // 3. Check directly in act payload properties
        if ((act as any)?.employeeName) return (act as any).employeeName;
        if ((act as any)?.userName) return (act as any).userName;
        if ((act as any)?.name) return (act as any).name;

        // 4. Check in penalties records
        const matchedPenalty = allPenalties.find(p => 
            (act?.penaltyId && p.id === act.penaltyId) || 
            (act?.id && p.actionId === act.id) || 
            p.employeeId === employeeId
        );
        if (matchedPenalty?.employeeName) return matchedPenalty.employeeName;

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
                const rawQuery = actionSearchQuery.toLowerCase().trim();
                const cleanQuery = rawQuery.replace(/^ref\s*#?|^#/i, '').trim();
                const empName = getEmpName(act.employeeId, act).toLowerCase();
                const desc = (act.description || '').toLowerCase();
                const typeText = (t(`action.${act.type}`) || act.type).toLowerCase();
                const actId = (act.id || '').toLowerCase();
                const actRef = (act.id ? act.id.slice(-6) : '').toLowerCase();
                const penaltyId = (act.penaltyId || '').toLowerCase();
                const penaltyRef = (act.penaltyId ? act.penaltyId.slice(-6) : '').toLowerCase();

                const matches = 
                    empName.includes(rawQuery) || 
                    desc.includes(rawQuery) || 
                    typeText.includes(rawQuery) ||
                    (cleanQuery ? (actId.includes(cleanQuery) || actRef.includes(cleanQuery) || penaltyId.includes(cleanQuery) || penaltyRef.includes(cleanQuery)) : false);

                if (!matches) {
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
        const penalties = pool.filter(act => ['violation', 'late', 'conduct_violation', 'neglect', 'verbal_warning', 'early_leave'].includes(act.type)).length;
        const absences = pool.filter(act => ['unjustified_absence', 'justified_absence'].includes(act.type)).length;
        const leaves = pool.filter(act => ['annual_leave', 'sick_leave'].includes(act.type)).length;
        const lates = pool.filter(act => ['late', 'permitted_late'].includes(act.type)).length;
        const positives = pool.filter(act => ['positive', 'overtime'].includes(act.type)).length;

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
        
        // Filter out doctors and any non-human names
        const nonDoctorEmployees = employees.filter(emp => 
            emp.role !== 'doctor' && 
            emp.jobCategory !== 'doctor' && 
            isValidStaffName(emp.name)
        );

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

    // --- Action Labels Map ---
    const actionLabels: Record<string, string> = {
        violation: t('action.violation') || 'مخالفة إدارية',
        conduct_violation: t('action.conduct_violation') || 'مخالفة سلوك / تعليمات',
        neglect: t('action.neglect') || 'إهمال / تقصير في العمل',
        verbal_warning: t('action.verbal_warning') || 'لفت نظر / تنبيه إداري',
        late: t('action.late') || 'تأخير مسجل',
        early_leave: t('action.early_leave') || 'انصراف مبكر',
        permitted_late: t('action.permitted_late') || 'تأخير بإذن مسبق',
        hourly_permission: t('action.hourly_permission') || 'إذن ساعي / استئذان بالوقت',
        unjustified_absence: t('action.unjustified_absence') || 'غياب بدون إذن',
        justified_absence: t('action.justified_absence') || 'غياب بعذر',
        sick_leave: t('action.sick_leave') || 'إجازة مرضية',
        annual_leave: t('action.annual_leave') || 'إجازة سنوية',
        mission: t('action.mission') || 'مأمورية عمل رسمية',
        training: t('action.training') || 'تدريب / نشاط علمي',
        positive: t('action.positive') || 'مكافأة / نقطة تميز',
        overtime: t('action.overtime') || 'ساعات إضافية (أوفر تايم)'
    };

    // --- Core Action & Penalty Executor ---
    const executeSaveActionAndPenalty = async (
        sendPenalty: boolean,
        customPenaltyType: any = '1st Warning',
        customDeductionDays: string = '',
        customSuspensionDays: string = '',
        customSuspensionFrom: string = '',
        customSuspensionTo: string = ''
    ) => {
        setIsSubmittingAction(true);
        try {
            const actualToDate = isSingleDay ? formData.fromDate : (formData.toDate || formData.fromDate);
            
            let finalDescription = formData.description || '';
            if (formData.hours) {
                finalDescription = `${finalDescription ? finalDescription + ' | ' : ''}المدة: ${formData.hours} ساعة`;
            }
            if (formData.timeFrom && formData.timeTo) {
                finalDescription = `${finalDescription ? finalDescription + ' | ' : ''}الوقت: من ${formData.timeFrom} إلى ${formData.timeTo}`;
            }

            const emp = employees.find(e => e.id === formData.employeeId) || allSystemUsers.find(e => e.id === formData.employeeId || (e as any).uid === formData.employeeId);
            const empName = emp?.name || emp?.email || 'الموظف';

            const payload: any = {
                employeeId: formData.employeeId,
                employeeName: empName,
                userName: empName,
                type: formData.type,
                fromDate: formData.fromDate,
                toDate: actualToDate,
                description: finalDescription,
                createdAt: new Date()
            };

            if (formData.hours) payload.hours = Number(formData.hours) || formData.hours;
            if (formData.timeFrom) payload.timeFrom = formData.timeFrom;
            if (formData.timeTo) payload.timeTo = formData.timeTo;

            // If sending penalty, write directly to the 'penalties' collection!
            if (sendPenalty && emp) {
                const pType = customPenaltyType || formData.penaltyType || '1st Warning';
                const actionLabel = actionLabels[formData.type] || formData.type;
                const penaltyDesc = finalDescription 
                    ? `${actionLabel} - ${finalDescription}`
                    : `${actionLabel} بتاريخ ${formData.fromDate}`;

                const penaltyPayload: any = {
                    employeeId: emp.id,
                    employeeName: empName,
                    managerId: currentUser?.uid || '',
                    managerName: userName || 'المشرف المسؤول',
                    penaltyType: pType,
                    description: penaltyDesc,
                    status: 'pending',
                    createdAt: serverTimestamp()
                };

                if (pType === 'Deduction') {
                    penaltyPayload.deductionDays = Number(customDeductionDays || formData.deductionDays) || 1;
                } else if (pType === 'Suspension') {
                    penaltyPayload.suspensionDays = Number(customSuspensionDays || formData.suspensionDays) || 1;
                    penaltyPayload.suspensionFrom = customSuspensionFrom || formData.suspensionFrom || formData.fromDate;
                    penaltyPayload.suspensionTo = customSuspensionTo || formData.suspensionTo || actualToDate;
                }

                const penaltyRef = await addDoc(collection(db, 'penalties'), penaltyPayload);
                payload.penaltyId = penaltyRef.id;

                // Send notification to employee about the penalty
                try {
                    await addDoc(collection(db, 'notifications'), {
                        userId: emp.id,
                        departmentId: emp.departmentId || '',
                        title: `⚖️ تم إصدار جزاء رسمي جديد`,
                        message: `تم توجيه جزاء إداري رسمي بحقك: ${penaltyDesc} - يرجى مراجعة صفحة الجزاءات للاطلاع والتوقيع.`,
                        readBy: [],
                        createdAt: new Date(),
                        type: 'penalty'
                    });
                } catch (nErr) {
                    console.warn("Penalty notification error:", nErr);
                }
            }

            // Save to actions collection
            const actionDocRef = await addDoc(collection(db, 'actions'), payload);

            // Cross-link actionId in penalties collection for bidirectional reference
            if (payload.penaltyId) {
                try {
                    await updateDoc(doc(db, 'penalties', payload.penaltyId), {
                        actionId: actionDocRef.id
                    });
                } catch (linkErr) {
                    console.warn("Could not link actionId to penalty doc:", linkErr);
                }
            }

            // Send notification for regular action if penalty was not sent
            if (emp && !sendPenalty) {
                try {
                    const actionTitle = actionLabels[formData.type] || t('rep.action.modalTitleAdd') || 'إجراء إداري جديد';
                    await addDoc(collection(db, 'notifications'), {
                        userId: emp.id,
                        departmentId: emp.departmentId || '',
                        title: `تم تسجيل ${actionTitle}`,
                        message: `تم تسجيل ${actionTitle} بتاريخ ${formData.fromDate}${finalDescription ? `: ${finalDescription}` : ''}`,
                        readBy: [],
                        createdAt: new Date(),
                        type: formData.type === 'positive' || formData.type === 'overtime' ? 'reward' : 'action'
                    });
                } catch (notifErr) {
                    console.warn("Notification dispatch failed (non-blocking):", notifErr);
                }
            }

            setSuccessToast(
                sendPenalty 
                    ? 'تم تسجيل الإجراء وإرسال الجزاء الرسمي إلى صفحة الجزاءات بنجاح ⚖️✅'
                    : (t('rep.action.toastAdded') || 'تم تسجيل الإجراء وتحديث تقارير الموظف فورياً بنجاح ✅')
            );

            setIsFormOpen(false);
            setPenaltyPromptModal(null);
            setEditingId(null);
            setFormData({
                employeeId: filterEmp || '',
                type: 'violation',
                fromDate: new Date().toISOString().split('T')[0],
                toDate: new Date().toISOString().split('T')[0],
                description: '',
                hours: '',
                timeFrom: '',
                timeTo: '',
                sendPenalty: false,
                penaltyType: '1st Warning',
                deductionDays: '',
                suspensionDays: '',
                suspensionFrom: '',
                suspensionTo: ''
            });
            setTimeout(() => setSuccessToast(null), 4500);
        } catch (e) {
            console.error("Error saving action and penalty:", e);
            alert(t('rep.action.saveErr') || 'حدث خطأ أثناء حفظ الإجراء، يرجى المحاولة مرة أخرى');
        } finally {
            setIsSubmittingAction(false);
        }
    };

    // --- Handlers ---
    const handleSubmit = async () => {
        if (!formData.employeeId) return alert(t('rep.action.errSelectEmp') || 'يرجى اختيار الموظف أولاً');
        if (!formData.type) return alert(t('rep.action.errSelectType') || 'يرجى تحديد نوع الإجراء');
        if (!formData.fromDate) return alert(t('rep.action.errSelectDate') || 'يرجى تحديد التاريخ');

        if (editingId) {
            const actualToDate = isSingleDay ? formData.fromDate : (formData.toDate || formData.fromDate);
            let finalDescription = formData.description || '';
            if (formData.hours) {
                finalDescription = `${finalDescription ? finalDescription + ' | ' : ''}المدة: ${formData.hours} ساعة`;
            }
            if (formData.timeFrom && formData.timeTo) {
                finalDescription = `${finalDescription ? finalDescription + ' | ' : ''}الوقت: من ${formData.timeFrom} إلى ${formData.timeTo}`;
            }

            const payload: any = {
                employeeId: formData.employeeId,
                type: formData.type,
                fromDate: formData.fromDate,
                toDate: actualToDate,
                description: finalDescription
            };
            if (formData.hours) payload.hours = Number(formData.hours) || formData.hours;
            if (formData.timeFrom) payload.timeFrom = formData.timeFrom;
            if (formData.timeTo) payload.timeTo = formData.timeTo;

            setIsSubmittingAction(true);
            try {
                await updateDoc(doc(db, 'actions', editingId), payload);
                setSuccessToast(t('rep.action.toastUpdated') || 'تم تحديث الإجراء بنجاح ✅');
                setIsFormOpen(false);
                setEditingId(null);
                setFormData({
                    employeeId: filterEmp || '',
                    type: 'violation',
                    fromDate: new Date().toISOString().split('T')[0],
                    toDate: new Date().toISOString().split('T')[0],
                    description: '',
                    hours: '',
                    timeFrom: '',
                    timeTo: '',
                    sendPenalty: false,
                    penaltyType: '1st Warning',
                    deductionDays: '',
                    suspensionDays: '',
                    suspensionFrom: '',
                    suspensionTo: ''
                });
                setTimeout(() => setSuccessToast(null), 4500);
            } catch (e) {
                console.error("Error updating action:", e);
                alert('حدث خطأ أثناء تحديث الإجراء');
            } finally {
                setIsSubmittingAction(false);
            }
            return;
        }

        // If user already checked the toggle in form
        if (formData.sendPenalty) {
            await executeSaveActionAndPenalty(
                true,
                formData.penaltyType,
                formData.deductionDays,
                formData.suspensionDays,
                formData.suspensionFrom,
                formData.suspensionTo
            );
            return;
        }

        // For positive reward or regular annual leave, save directly without prompting for penalty
        if (['positive', 'overtime', 'annual_leave'].includes(formData.type)) {
            await executeSaveActionAndPenalty(false);
            return;
        }

        // Interactive prompt asking whether to send penalty as requested:
        // "يسألني هل ابعت جزاء او لا لو قلت ابعت يبعتله جزاء في صفحه الجزاءات علي نفس السبب"
        const emp = employees.find(e => e.id === formData.employeeId);
        let finalDesc = formData.description || '';
        if (formData.hours) {
            finalDesc = `${finalDesc ? finalDesc + ' | ' : ''}المدة: ${formData.hours} ساعة`;
        }
        if (formData.timeFrom && formData.timeTo) {
            finalDesc = `${finalDesc ? finalDesc + ' | ' : ''}الوقت: من ${formData.timeFrom} إلى ${formData.timeTo}`;
        }

        setPenaltyPromptModal({
            isOpen: true,
            employeeId: formData.employeeId,
            employeeName: emp?.name || emp?.email || 'الموظف المعني',
            actionType: formData.type,
            actionTitle: actionLabels[formData.type] || formData.type,
            date: formData.fromDate,
            description: finalDesc || actionLabels[formData.type] || formData.type,
            penaltyType: '1st Warning',
            deductionDays: '',
            suspensionDays: '',
            suspensionFrom: formData.fromDate,
            suspensionTo: isSingleDay ? formData.fromDate : (formData.toDate || formData.fromDate)
        });
    };

    const handleDelete = async (id: string) => {
        if (confirm(t('rep.action.confirmDeleteMsg') || 'هل أنت متأكد من رغبتك في حذف هذا الإجراء نهائياً؟')) {
            try {
                // Find action to get details before deleting
                const targetAction = actions.find(a => a.id === id) || rawActions.find(a => a.id === id);

                // 1. Delete from actions collection
                await deleteDoc(doc(db, 'actions', id));

                // 2. If it was linked to a penalty directly via penaltyId
                if (targetAction?.penaltyId) {
                    try {
                        await deleteDoc(doc(db, 'penalties', targetAction.penaltyId));
                    } catch (pErr) {
                        console.warn("Could not delete penalty by penaltyId:", pErr);
                    }
                }

                // 3. Also query penalties collection where actionId == id
                try {
                    const qPenaltiesByActionId = query(collection(db, 'penalties'), where('actionId', '==', id));
                    const snapActionId = await getDocs(qPenaltiesByActionId);
                    for (const pDoc of snapActionId.docs) {
                        await deleteDoc(doc(db, 'penalties', pDoc.id));
                    }
                } catch (pErr) {
                    console.warn("Error deleting penalties by actionId query:", pErr);
                }

                // 4. Fallback search: if this action had an employeeId and description, match penalties
                if (targetAction?.employeeId) {
                    try {
                        const qEmpPenalties = query(collection(db, 'penalties'), where('employeeId', '==', targetAction.employeeId));
                        const snapEmpP = await getDocs(qEmpPenalties);
                        for (const pDoc of snapEmpP.docs) {
                            const pData = pDoc.data();
                            if (pDoc.id === targetAction.penaltyId || pData.actionId === id) {
                                await deleteDoc(doc(db, 'penalties', pDoc.id));
                            } else if (targetAction.description && pData.description) {
                                const cleanActionDesc = targetAction.description.replace(/^\[جزاء رسمي\]\s*/, '').trim();
                                if (cleanActionDesc && (pData.description.includes(cleanActionDesc) || cleanActionDesc.includes(pData.description))) {
                                    await deleteDoc(doc(db, 'penalties', pDoc.id));
                                }
                            }
                        }
                    } catch (pErr) {
                        console.warn("Fallback penalty cleanup error:", pErr);
                    }

                    // 5. Clean up any related notifications
                    try {
                        const qNotif = query(collection(db, 'notifications'), where('userId', '==', targetAction.employeeId));
                        const snapNotif = await getDocs(qNotif);
                        for (const nDoc of snapNotif.docs) {
                            const nData = nDoc.data();
                            if (nData.type === 'penalty' || nData.type === 'action') {
                                if (targetAction.description && nData.message && nData.message.includes(targetAction.description.slice(0, 20))) {
                                    await deleteDoc(doc(db, 'notifications', nDoc.id));
                                }
                            }
                        }
                    } catch (nErr) {
                        console.warn("Notification cleanup error:", nErr);
                    }
                }

                setSuccessToast(t('rep.action.toastDeleted') || 'تم حذف الإجراء والجزاء المرتبط وتحديث التقرير وصفحة الجزاءات والموظف فورياً ✅');
                setTimeout(() => setSuccessToast(null), 3500);
            } catch (e) {
                console.error("Error deleting action:", e);
                alert(t('cath.msgErr') || 'حدث خطأ أثناء الحذف');
            }
        }
    };

    const handleEdit = (act: ActionLog) => {
        const from = safeDate(act.fromDate);
        const to = safeDate(act.toDate);
        setFormData({
            employeeId: act.employeeId,
            type: act.type,
            fromDate: from,
            toDate: to,
            description: act.description || '',
            hours: act.hours ? String(act.hours) : '',
            timeFrom: act.timeFrom || '',
            timeTo: act.timeTo || '',
            sendPenalty: false,
            penaltyType: '1st Warning',
            deductionDays: '',
            suspensionDays: '',
            suspensionFrom: '',
            suspensionTo: ''
        });
        setIsSingleDay(from === to);
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
                                        ...defaultFormData,
                                        employeeId: filterEmp || '',
                                        type: 'annual_leave'
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
                
                {/* Real-time Toast Feedback Banner */}
                {successToast && (
                    <div className="mb-6 bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-xl shadow-emerald-600/20 flex items-center justify-between animate-fadeIn transition-all print:hidden">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                <i className="fas fa-check text-white"></i>
                            </div>
                            <span className="font-bold text-sm">{successToast}</span>
                        </div>
                        <button 
                            onClick={() => setSuccessToast(null)}
                            className="text-white/80 hover:text-white text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg transition"
                        >
                            {t('rep.action.close') || 'إغلاق'}
                        </button>
                    </div>
                )}

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
                                {t('rep.filter.byMonth') || 'بالشهر'}
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
                                {t('rep.filter.customPeriod') || 'فترة مخصصة (من - إلى)'}
                            </button>
                        </div>
                    </div>

                    {/* Middle Row: Primary Filter Selectors */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end pt-2 border-t border-slate-100">
                        {/* Department Filter (Global) */}
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('rep.filter.dept') || 'القسم'}</label>
                            {isAdmin ? (
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-blue-200 px-3 py-2 text-sm cursor-pointer"
                                    value={selectedDept || ''}
                                    onChange={e => setSelectedDept(e.target.value || null)}
                                >
                                    <option value="">{t('rep.filter.allDept') || 'جميع الأقسام'}</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            ) : (
                                <div className="w-full bg-slate-100/90 border border-slate-200/90 rounded-xl font-bold text-slate-700 px-3 py-2 text-sm flex items-center justify-between">
                                    <span className="truncate">
                                        {departments.find(d => d.id === (selectedDept || contextDeptId))?.name || (currentUser as any)?.departmentName || (dir === 'rtl' ? 'قسمك المخصص' : 'Your Department')}
                                    </span>
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-bold shrink-0">
                                        {dir === 'rtl' ? 'قسمك المباشر' : 'Assigned Dept'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Employee Filter */}
                        {activeTab === 'attendance' && (
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="block text-xs font-bold text-slate-400">{t('rep.filter.emp')}</label>
                                    {filterEmp && (
                                        <button onClick={() => setFilterEmp('')} className="text-[11px] font-bold text-blue-600 hover:underline">
                                            {t('rep.action.showAllEmployees') || 'عرض الكل'}
                                        </button>
                                    )}
                                </div>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-blue-200 px-3 py-2 text-sm" 
                                    value={filterEmp} 
                                    onChange={e => setFilterEmp(e.target.value)}
                                >
                                    <option value="">{t('rep.filter.allStaff') || '-- جميع الموظفين --'}</option>
                                    {employees.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                                </select>
                            </div>
                        )}

                        {/* Search for Productivity Tab */}
                        {activeTab === 'productivity' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('rep.filter.searchProd') || 'بحث في الحالات (اسم / ملف)'}</label>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-emerald-200 px-3 py-2 text-sm" 
                                    placeholder={t('rep.filter.prodPlaceholder') || 'رقم الملف أو الاسم...'}
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
                                        {[...Array(12)].map((_, i) => <option key={i} value={i+1}>{t('month')} {i+1}</option>)}
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
                                    <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('rep.filter.fromDate') || 'من تاريخ (From)'}</label>
                                    <input 
                                        type="date" 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 px-3 py-2 text-sm" 
                                        value={filterFromDate} 
                                        onChange={e => setFilterFromDate(e.target.value)} 
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('rep.filter.toDate') || 'إلى تاريخ (To)'}</label>
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
                                <i className="fas fa-bolt text-amber-500"></i> {t('rep.filter.shortcutsTitle') || 'اختصارات الفترة:'}
                            </span>
                            <button onClick={() => applyDateShortcut('today')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                {t('rep.filter.today') || 'اليوم'}
                            </button>
                            <button onClick={() => applyDateShortcut('this_week')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                {t('rep.filter.last7Days') || 'آخر 7 أيام'}
                            </button>
                            <button onClick={() => applyDateShortcut('this_month')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                {t('rep.filter.thisMonth') || 'هذا الشهر'}
                            </button>
                            <button onClick={() => applyDateShortcut('last_month')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                {t('rep.filter.lastMonth') || 'الشهر السابق'}
                            </button>
                            <button onClick={() => applyDateShortcut('last_30_days')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                {t('rep.filter.last30Days') || 'آخر 30 يوم'}
                            </button>
                            <button onClick={() => applyDateShortcut('this_quarter')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                {t('rep.filter.thisQuarter') || 'هذا الربع'}
                            </button>
                            <button onClick={() => applyDateShortcut('this_year')} className="px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg font-bold text-slate-700 border border-slate-200 shadow-2xs transition-colors">
                                {t('rep.filter.thisYear') || 'كامل السنة'}
                            </button>
                            <button 
                                onClick={() => {
                                    setFilterFromDate('');
                                    setFilterToDate('');
                                    setDateMode('month');
                                }} 
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-bold border border-red-200 transition-colors ml-auto"
                            >
                                <i className="fas fa-undo text-[10px] mr-1"></i> {t('rep.filter.reset') || 'إعادة ضبط'}
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
                                        {t('rep.cat.all') || 'الكل'}
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                            {actionCounts.total}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('actions_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'actions_only' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}
                                    >
                                        <i className="fas fa-bolt text-amber-300"></i>
                                        {t('rep.cat.actionsOnly') || 'الإجراءات فقط (بدون الغياب والإجازات)'}
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'actions_only' ? 'bg-blue-800 text-white' : 'bg-blue-200 text-blue-800'}`}>
                                            {actionCounts.actionsOnly}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('penalties_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'penalties_only' ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-500/20' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                                    >
                                        <i className="fas fa-gavel"></i>
                                        {t('rep.cat.penaltiesOnly') || 'المخالفات والجزاءات'}
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'penalties_only' ? 'bg-red-800 text-white' : 'bg-red-200 text-red-800'}`}>
                                            {actionCounts.penalties}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('absences_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'absences_only' ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-500/20' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}
                                    >
                                        <i className="fas fa-user-times"></i>
                                        {t('rep.cat.absencesOnly') || 'الغياب فقط'}
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'absences_only' ? 'bg-rose-800 text-white' : 'bg-rose-200 text-rose-800'}`}>
                                            {actionCounts.absences}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('leaves_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'leaves_only' ? 'bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-500/20' : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'}`}
                                    >
                                        <i className="fas fa-umbrella-beach"></i>
                                        {t('rep.cat.leavesOnly') || 'الإجازات فقط'}
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'leaves_only' ? 'bg-orange-800 text-white' : 'bg-orange-200 text-orange-800'}`}>
                                            {actionCounts.leaves}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('late_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'late_only' ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                                    >
                                        <i className="fas fa-clock"></i>
                                        {t('rep.cat.lateOnly') || 'التأخيرات'}
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${actionFilterCategory === 'late_only' ? 'bg-amber-800 text-white' : 'bg-amber-200 text-amber-800'}`}>
                                            {actionCounts.lates}
                                        </span>
                                    </button>

                                    <button 
                                        onClick={() => setActionFilterCategory('positives_only')} 
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${actionFilterCategory === 'positives_only' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
                                    >
                                        <i className="fas fa-star"></i>
                                        {t('rep.cat.positivesOnly') || 'المكافآت والتقديرات'}
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
                                            <i className="fas fa-chart-pie"></i> {t('rep.view.overview') || 'لوحة التقييم'}
                                        </button>
                                        <button 
                                            onClick={() => setMainViewTab('actions_table')} 
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${mainViewTab === 'actions_table' ? 'bg-white shadow text-blue-600 font-black' : 'text-slate-500'}`}
                                        >
                                            <i className="fas fa-table"></i> {t('rep.view.actionsTable') || 'سجل الإجراءات التفصيلي'}
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
                                        placeholder={t('rep.searchPlaceholder') || 'بحث بالرقم المرجعي (REF #)، اسم الموظف، الوصف أو النوع...'} 
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
                                        <option value="all">{t('rep.type.allTypes') || 'كل الأنواع المحددة'}</option>
                                        <option value="hourly_permission">{t('action.hourly_permission') || 'إذن ساعي / استئذان'}</option>
                                        <option value="early_leave">{t('action.early_leave') || 'انصراف مبكر'}</option>
                                        <option value="late">{t('action.late') || 'تأخير'}</option>
                                        <option value="permitted_late">{t('action.permitted_late') || 'تأخير بإذن'}</option>
                                        <option value="violation">{t('action.violation') || 'مخالفة إدارية'}</option>
                                        <option value="conduct_violation">{t('action.conduct_violation') || 'مخالفة سلوكية'}</option>
                                        <option value="neglect">{t('action.neglect') || 'إهمال وتقصير'}</option>
                                        <option value="verbal_warning">{t('action.verbal_warning') || 'لفت نظر / تنبيه'}</option>
                                        <option value="unjustified_absence">{t('action.unjustified_absence') || 'غياب بدون إذن'}</option>
                                        <option value="justified_absence">{t('action.justified_absence') || 'غياب بإذن'}</option>
                                        <option value="sick_leave">{t('action.sick_leave') || 'إجازة مرضية'}</option>
                                        <option value="annual_leave">{t('action.annual_leave') || 'إجازة سنوية'}</option>
                                        <option value="mission">{t('action.mission') || 'مأمورية'}</option>
                                        <option value="training">{t('action.training') || 'تدريب / نشاط علمي'}</option>
                                        <option value="positive">{t('action.positive') || 'مكافأة / إيجابي'}</option>
                                        <option value="overtime">{t('action.overtime') || 'عمل إضافي (أوفر تايم)'}</option>
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
                                        {t('rep.toggle.includeLateness') || 'احتساب التأخير'}
                                    </label>
                                </div>

                                {/* Include Auto Absence Toggle */}
                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                                    <input 
                                        type="checkbox" 
                                        id="includeAutoAbsence" 
                                        checked={includeAutoAbsence} 
                                        onChange={e => setIncludeAutoAbsence(e.target.checked)}
                                        className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500"
                                    />
                                    <label htmlFor="includeAutoAbsence" className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                                        {t('rep.toggle.includeAutoAbsence') || 'تضمين الغياب التلقائي (البصمة)'}
                                    </label>
                                </div>

                                {/* Export CSV Button */}
                                <button 
                                    onClick={exportActionsToCSV}
                                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                                >
                                    <i className="fas fa-file-excel text-emerald-600"></i>
                                    {t('rep.exportCSV') || 'تصدير CSV'}
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
                                            <i className="fas fa-users mr-1"></i> {t('rep.action.showAllEmployees') || 'كل الموظفين'}
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
                                                <span className="text-[11px] font-bold text-slate-400 block">{t('rep.eval.unjustifiedAbsence') || 'غياب بدون إذن'}</span>
                                                <span className="text-sm font-black text-red-600">
                                                    {evaluation.stats.unjustifiedAbsences} <span className="text-xs font-bold text-slate-400">{t('rep.eval.daysUnit') || 'يوم'}</span>
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">{t('rep.eval.lates') || 'تأخيرات'}</span>
                                                <span className="text-sm font-black text-amber-600">
                                                    {evaluation.stats.lates} <span className="text-xs font-bold text-slate-400">{t('rep.eval.timesUnit') || 'مرات'}</span>
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">{t('rep.eval.violations') || 'مخالفات / جزاءات'}</span>
                                                <span className="text-sm font-black text-rose-600">
                                                    {evaluation.stats.violations} <span className="text-xs font-bold text-slate-400">{t('rep.eval.actionUnit') || 'إجراء'}</span>
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">{t('rep.eval.positives') || 'إيجابيات / مكافآت'}</span>
                                                <span className="text-sm font-black text-emerald-600">
                                                    {evaluation.stats.positives} <span className="text-xs font-bold text-slate-400">{t('rep.eval.pointsUnit') || 'نقاط'}</span>
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">{t('rep.eval.annualLeaves') || 'إجازات سنوية'}</span>
                                                <span className="text-sm font-black text-purple-600">
                                                    {evaluation.stats.annualLeaveDays} <span className="text-xs font-bold text-slate-400">{t('rep.eval.daysUnit') || 'يوم'}</span>
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                                                <span className="text-[11px] font-bold text-slate-400 block">{t('rep.eval.sickLeaves') || 'إجازات مرضية'}</span>
                                                <span className="text-sm font-black text-blue-600">
                                                    {evaluation.stats.sickLeaves} <span className="text-xs font-bold text-slate-400">{t('rep.eval.daysUnit') || 'يوم'}</span>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Total Deductions Bar */}
                                        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center px-1">
                                            <span className="text-xs font-bold text-slate-500">{t('rep.ranking.totalDeductionPoints') || 'إجمالي نقاط الخصم:'}</span>
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
                                                    <div className="text-[10px] font-bold text-blue-400">{t('rep.ranking.nextLeaveEntitlement') || 'استحقاق الإجازة القادمة'}</div>
                                                    <div className="text-xs font-black text-blue-700">
                                                        {evaluation.nextLeaveDate.toLocaleDateString('en-GB')}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => {
                                                setEditingId(null);
                                                setFormData({
                                                    ...defaultFormData,
                                                    employeeId: evaluation.employee.id,
                                                    type: 'violation'
                                                });
                                                setIsSingleDay(true);
                                                setIsFormOpen(true);
                                            }}
                                            className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95 print:hidden"
                                        >
                                            <i className="fas fa-plus-circle text-blue-400"></i>
                                            {t('rep.action.addForThisEmp') || 'تسجيل مخالفة أو إجراء لهذا الموظف'}
                                        </button>
                                    </div>
                                ) : (
                                    /* Staff Ranking Overview Table */
                                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                                                <i className="fas fa-award text-amber-500"></i> {t('rep.ranking.title') || 'ترتيب وتقييم الموظفين'}
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
                                                                <span>{t('rep.ranking.deductionLabel') || 'خصم:'} -{ev.totalDeductions}</span>
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
                                                    <div className="text-xs font-bold text-emerald-600 uppercase mb-1">{t('rep.ranking.best') || 'الأفضل أداءً'}</div>
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
                                                    <div className="text-xs font-bold text-red-600 uppercase mb-1">{t('rep.ranking.needsImp') || 'يحتاج تحسين'} ({needsImprovementList.length})</div>
                                                    {needsImprovementList.length === 0 ? (
                                                        <div className="text-slate-400 text-xs italic mt-1">{t('rep.ranking.noNeedsImp') || 'لا يوجد موظفين بحاجة لتحسين'}</div>
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
                                                    <div className="text-xs font-bold text-blue-600 uppercase mb-1">{t('rep.ranking.avgPerf') || 'متوسط الأداء'}</div>
                                                    <div className="text-2xl font-black text-slate-800">
                                                        {Math.round(chartEvaluations.reduce((acc, curr) => acc + curr.percentage, 0) / (chartEvaluations.length || 1))}%
                                                    </div>
                                                    <div className="text-xs font-bold text-blue-400 mt-0.5">
                                                        {t('rep.ranking.activeStaff') || 'للموظفين النشطين'} ({chartEvaluations.length})
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Chart */}
                                        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
                                            <div className="flex justify-between items-center mb-6">
                                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                    <i className="fas fa-chart-bar text-blue-500"></i>
                                                    {t('rep.ranking.perfAnalysis') || 'تحليل الأداء العام للموظفين'}
                                                </h3>
                                                <button 
                                                    onClick={() => setMainViewTab('actions_table')} 
                                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-all"
                                                >
                                                    <i className="fas fa-table mr-1"></i> {t('rep.ranking.exploreTable') || 'استعراض سجل الإجراءات التفصيلي'} ({filteredActions.length})
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
                                                    {filterEmp ? `${t('rep.log') || 'سجل الإجراءات'} - ${employees.find(e => e.id === filterEmp)?.name}` : (t('rep.ranking.actionsReviewAll') || 'سجل الإجراءات والمراجعة (جميع الموظفين)')}
                                                </h3>
                                                {actionFilterCategory !== 'all' && (
                                                    <span className="text-[11px] font-bold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full">
                                                        {actionFilterCategory === 'actions_only' && `⚡ ${t('rep.cat.actionsOnly') || 'الإجراءات فقط'}`}
                                                        {actionFilterCategory === 'penalties_only' && `⚖️ ${t('rep.cat.penaltiesOnly') || 'المخالفات والجزاءات'}`}
                                                        {actionFilterCategory === 'absences_only' && `🚫 ${t('rep.cat.absencesOnly') || 'الغياب فقط'}`}
                                                        {actionFilterCategory === 'leaves_only' && `🏖️ ${t('rep.cat.leavesOnly') || 'الإجازات فقط'}`}
                                                        {actionFilterCategory === 'late_only' && `⏰ ${t('rep.cat.lateOnly') || 'التأخيرات'}`}
                                                        {actionFilterCategory === 'positives_only' && `🌟 ${t('rep.cat.positivesOnly') || 'المكافآت'}`}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={() => { 
                                                        setEditingId(null); 
                                                        setFormData({
                                                            ...defaultFormData,
                                                            employeeId: filterEmp || '',
                                                            type: 'violation'
                                                        });
                                                        setIsSingleDay(true);
                                                        setIsFormOpen(true); 
                                                    }}
                                                    className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 active:scale-95 print:hidden"
                                                >
                                                    <i className="fas fa-plus-circle"></i>
                                                    {t('rep.action.btnLog') || 'تسجيل إجراء / مخالفة'}
                                                </button>
                                                <span className="text-xs font-bold bg-white px-3 py-1.5 rounded-xl border text-slate-600 shadow-2xs">
                                                    {filteredActions.length} {t('rep.action.recordsCount') || 'سجل'}
                                                </span>
                                                {filterEmp && (
                                                    <button 
                                                        onClick={() => setFilterEmp('')}
                                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-white hover:bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200 transition-colors print:hidden"
                                                    >
                                                        {t('rep.action.showAllEmployees') || 'عرض كل الموظفين'}
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
                                                        <th className="p-4">{t('rep.pointsDeduction') || 'النقاط / الخصم'}</th>
                                                        <th className="p-4 print:hidden">{t('actions')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                                                    {filteredActions.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="p-12 text-center text-slate-400">
                                                                <i className="fas fa-inbox text-3xl mb-2 block opacity-30"></i>
                                                                {t('rep.emptyActions') || 'لا توجد إجراءات مطابقة للفلترة في الفترة المحددة'} ({dateTitle})
                                                            </td>
                                                        </tr>
                                                    ) : filteredActions.map(act => {
                                                        const weight = ACTION_WEIGHTS[act.type];
                                                        const isPositive = weight < 0;
                                                        return (
                                                            <tr key={act.id} className="hover:bg-slate-50/70 transition-colors group print:hover:bg-transparent">
                                                                <td className="p-4 border-r print:border-slate-300">
                                                                    <div className="font-bold text-slate-800">{getEmpName(act.employeeId, act)}</div>
                                                                    <div className="text-xs text-slate-500 print:text-slate-600 mt-0.5">{act.description}</div>
                                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 print:hidden">
                                                                        {act.id && (
                                                                            <button 
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    const refCode = act.id.slice(-6).toUpperCase();
                                                                                    navigator.clipboard.writeText(refCode);
                                                                                    setActionSearchQuery(refCode);
                                                                                }}
                                                                                className="inline-flex items-center gap-1 text-[10px] font-mono font-black text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-1.5 py-0.5 rounded shadow-2xs transition-colors cursor-pointer" 
                                                                                title="اضغط لنسخ الرقم المرجعي والفلترة به"
                                                                            >
                                                                                <i className="fas fa-hashtag text-[9px] text-slate-400"></i>
                                                                                REF #{act.id.slice(-6).toUpperCase()}
                                                                            </button>
                                                                        )}
                                                                        {act.hours && (
                                                                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                                                                                <i className="fas fa-clock text-[10px]"></i>
                                                                                {act.hours} ساعة {act.timeFrom && act.timeTo ? `(${act.timeFrom} - ${act.timeTo})` : ''}
                                                                            </span>
                                                                        )}
                                                                        {act.penaltyId && (
                                                                            <Link 
                                                                                to="/supervisor/penalties"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 hover:text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded transition-all shadow-2xs cursor-pointer group/link"
                                                                                title="انقر للانتقال إلى صفحة الجزاءات الرسمية"
                                                                            >
                                                                                <i className="fas fa-gavel text-[10px] text-red-500 group-hover/link:scale-110 transition-transform"></i>
                                                                                <span>جزاء رسمي بصفحة الجزاءات</span>
                                                                                <i className="fas fa-arrow-left text-[9px] mr-0.5 opacity-60"></i>
                                                                            </Link>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="p-4 border-r print:border-slate-300">
                                                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-block ${
                                                                        act.type === 'violation' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                        act.type === 'conduct_violation' ? 'bg-rose-50 text-rose-800 border-rose-300' :
                                                                        act.type === 'neglect' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                        act.type === 'verbal_warning' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                        act.type === 'late' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                        act.type === 'early_leave' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                                        act.type === 'permitted_late' ? 'bg-yellow-50 text-yellow-800 border-yellow-200' :
                                                                        act.type === 'hourly_permission' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                                                                        act.type === 'positive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                        act.type === 'overtime' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                                                                        act.type === 'mission' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                                        act.type === 'training' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                                                        act.type === 'unjustified_absence' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                                        act.type === 'justified_absence' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                                        act.type === 'sick_leave' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' :
                                                                        act.type === 'annual_leave' ? 'bg-purple-50 text-purple-700 border-purple-200' :
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
                                                                            {t('rep.filter.toDate') || 'إلى'} {safeDate(act.toDate)}
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
            <Modal 
                isOpen={isFormOpen} 
                onClose={() => {
                    setIsFormOpen(false);
                    setEditingId(null);
                }} 
                title={editingId ? (t('rep.action.modalTitleEdit') || 'تعديل الإجراء الإداري') : (t('rep.action.modalTitleAdd') || 'تسجيل إجراء أو مخالفة يدوية')}
            >
                <div className="space-y-4 text-right" dir={dir}>
                    {/* Selected Employee Display or Select Dropdown */}
                    <div>
                        <label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                            <span>{t('rep.action.targetEmp') || 'الموظف المعني'} <span className="text-red-500">*</span></span>
                            {formData.employeeId && (
                                <span className="text-[11px] font-normal text-blue-600">
                                    {employees.find(u => u.id === formData.employeeId)?.role || 'موظف'}
                                </span>
                            )}
                        </label>
                        <select 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                            value={formData.employeeId}
                            onChange={e => setFormData({...formData, employeeId: e.target.value})}
                            disabled={!!filterEmp && !editingId} 
                        >
                            <option value="">{t('rep.action.selectEmp') || '-- اختر الموظف --'}</option>
                            {employees.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.name || u.email} {u.phone ? `(${u.phone})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Action Category Tabs */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-slate-700">
                                {t('rep.action.actionTypeLabel') || 'نوع الإجراء / المخالفة'} <span className="text-red-500">*</span>
                            </label>
                            <span className="text-[11px] text-slate-400">{t('rep.action.selectCatAndType') || 'اختر التصنيف ونوع الإجراء'}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold mb-2.5">
                            {[
                                { id: 'all', label: t('rep.action.catAll') || 'الكل' },
                                { id: 'disciplinary', label: t('rep.action.catDisciplinary') || 'المخالفات والانضباط' },
                                { id: 'permissions', label: t('rep.action.catPermissions') || 'الاستئذان والأوقات' },
                                { id: 'leaves', label: t('rep.action.catLeaves') || 'الإجازات والغياب' },
                                { id: 'rewards', label: t('rep.action.catRewards') || 'الحوافز والإضافي' },
                            ].map(cat => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setActionCategoryTab(cat.id as any)}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${
                                        actionCategoryTab === cat.id 
                                            ? 'bg-white text-blue-700 shadow-xs font-black' 
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Action Types Visual Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[220px] overflow-y-auto p-1 border border-slate-100 rounded-xl bg-slate-50/50">
                            {[
                                // Disciplinary
                                { id: 'violation', category: 'disciplinary', label: t('action.violation') || 'مخالفة إدارية', points: -10, icon: 'fa-ban', color: 'border-red-500 bg-red-50 text-red-700' },
                                { id: 'conduct_violation', category: 'disciplinary', label: t('action.conduct_violation') || 'مخالفة سلوكية', points: -10, icon: 'fa-user-shield', color: 'border-rose-600 bg-rose-50 text-rose-800' },
                                { id: 'neglect', category: 'disciplinary', label: t('action.neglect') || 'إهمال وتقصير', points: -8, icon: 'fa-triangle-exclamation', color: 'border-red-400 bg-red-50 text-red-700' },
                                { id: 'verbal_warning', category: 'disciplinary', label: t('action.verbal_warning') || 'لفت نظر / تنبيه', points: -4, icon: 'fa-bullhorn', color: 'border-amber-500 bg-amber-50 text-amber-800' },
                                
                                // Permissions & Times
                                { id: 'hourly_permission', category: 'permissions', label: t('action.hourly_permission') || 'إذن ساعي / استئذان', points: 0, icon: 'fa-user-clock', color: 'border-sky-500 bg-sky-50 text-sky-700' },
                                { id: 'early_leave', category: 'permissions', label: t('action.early_leave') || 'انصراف مبكر', points: -2, icon: 'fa-person-walking-arrow-right', color: 'border-orange-500 bg-orange-50 text-orange-700' },
                                { id: 'late', category: 'permissions', label: t('action.late') || 'تأخير غير مبرر', points: -3, icon: 'fa-clock', color: 'border-amber-500 bg-amber-50 text-amber-700' },
                                { id: 'permitted_late', category: 'permissions', label: t('action.permitted_late') || 'تأخير بإذن', points: -1, icon: 'fa-business-time', color: 'border-yellow-600 bg-yellow-50 text-yellow-800' },
                                
                                // Leaves & Absences
                                { id: 'unjustified_absence', category: 'leaves', label: t('action.unjustified_absence') || 'غياب غير مبرر', points: -10, icon: 'fa-user-slash', color: 'border-rose-500 bg-rose-50 text-rose-700' },
                                { id: 'justified_absence', category: 'leaves', label: t('action.justified_absence') || 'غياب بعذر', points: -2, icon: 'fa-file-signature', color: 'border-orange-500 bg-orange-50 text-orange-700' },
                                { id: 'sick_leave', category: 'leaves', label: t('action.sick_leave') || 'إجازة مرضية', points: -1, icon: 'fa-notes-medical', color: 'border-cyan-500 bg-cyan-50 text-cyan-700' },
                                { id: 'annual_leave', category: 'leaves', label: t('action.annual_leave') || 'إجازة سنوية', points: 0, icon: 'fa-umbrella-beach', color: 'border-purple-500 bg-purple-50 text-purple-700' },
                                { id: 'mission', category: 'leaves', label: t('action.mission') || 'مأمورية رسمية', points: 0, icon: 'fa-briefcase', color: 'border-indigo-500 bg-indigo-50 text-indigo-700' },
                                { id: 'training', category: 'leaves', label: t('action.training') || 'تدريب / نشاط علمي', points: 0, icon: 'fa-graduation-cap', color: 'border-blue-500 bg-blue-50 text-blue-700' },
                                
                                // Rewards & Overtime
                                { id: 'positive', category: 'rewards', label: t('action.positive') || 'مكافأة / بونص', points: 5, icon: 'fa-star', color: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
                                { id: 'overtime', category: 'rewards', label: t('action.overtime') || 'عمل إضافي (أوفرتايم)', points: 4, icon: 'fa-stopwatch', color: 'border-teal-500 bg-teal-50 text-teal-700' },
                            ]
                            .filter(item => actionCategoryTab === 'all' || item.category === actionCategoryTab)
                            .map(item => {
                                const isSelected = formData.type === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, type: item.id })}
                                        className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 relative ${
                                            isSelected 
                                                ? `${item.color} font-black ring-2 ring-blue-500 shadow-sm scale-[1.02]` 
                                                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                                        }`}
                                    >
                                        <i className={`fas ${item.icon} text-sm ${isSelected ? '' : 'text-slate-400'}`}></i>
                                        <span className="text-[11px] leading-tight font-bold">{item.label}</span>
                                        <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                                            item.points > 0 ? 'bg-emerald-100 text-emerald-800' :
                                            item.points < 0 ? 'bg-red-100 text-red-800' :
                                            'bg-slate-100 text-slate-600'
                                        }`}>
                                            {item.points > 0 ? `+${item.points}` : item.points} {t('rep.action.pointsUnit') || 'نقطة'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Hourly Permission & Time Controls (Shown when action involves hours/time) */}
                    {['hourly_permission', 'early_leave', 'late', 'permitted_late', 'overtime'].includes(formData.type) && (
                        <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                                    <i className="fas fa-clock text-sky-600"></i>
                                    {t('rep.action.permissionTimeDetails') || 'تفاصيل ساعات الإذن / الوقت المستغرق'}
                                </span>
                                <span className="text-[11px] text-sky-700 font-medium">{t('rep.action.permissionTimeDesc') || 'مخصص للإذن الساعي والمواعيد'}</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-700 mb-1 block">{t('rep.action.hoursCount') || 'عدد الساعات'}</label>
                                    <input 
                                        type="number"
                                        step="0.5"
                                        min="0.5"
                                        max="24"
                                        placeholder={t('rep.action.hoursPlaceholder') || 'مثلاً: 2'}
                                        value={formData.hours}
                                        onChange={e => setFormData({ ...formData, hours: e.target.value })}
                                        className="w-full bg-white border border-sky-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-700 mb-1 block">{t('rep.action.timeFrom') || 'من الساعة'}</label>
                                    <input 
                                        type="time"
                                        value={formData.timeFrom}
                                        onChange={e => setFormData({ ...formData, timeFrom: e.target.value })}
                                        className="w-full bg-white border border-sky-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-700 mb-1 block">{t('rep.action.timeTo') || 'إلى الساعة'}</label>
                                    <input 
                                        type="time"
                                        value={formData.timeTo}
                                        onChange={e => setFormData({ ...formData, timeTo: e.target.value })}
                                        className="w-full bg-white border border-sky-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
                                    />
                                </div>
                            </div>

                            {/* Quick Hours Presets */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                <span className="text-[10px] font-bold text-sky-800">{t('rep.action.quickChoice') || 'اختيار سريع:'}</span>
                                {['0.5', '1', '1.5', '2', '3', '4'].map(h => (
                                    <button
                                        key={h}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, hours: h })}
                                        className={`px-2 py-0.5 rounded text-[11px] font-bold border transition ${
                                            formData.hours === h 
                                                ? 'bg-sky-600 text-white border-sky-600' 
                                                : 'bg-white text-sky-700 border-sky-200 hover:bg-sky-100'
                                        }`}
                                    >
                                        {h} {t('rep.action.hoursUnit') || 'ساعة'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Single Day vs Date Range Toggle */}
                    <div className="bg-slate-100 p-1.5 rounded-xl flex items-center gap-1 text-xs font-bold">
                        <button
                            type="button"
                            onClick={() => {
                                setIsSingleDay(true);
                                setFormData(prev => ({ ...prev, toDate: prev.fromDate }));
                            }}
                            className={`flex-1 py-1.5 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                                isSingleDay ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <i className="fas fa-calendar-day"></i>
                            {t('rep.action.singleDay') || 'يوم واحد فقط'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsSingleDay(false)}
                            className={`flex-1 py-1.5 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                                !isSingleDay ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <i className="fas fa-calendar-week"></i>
                            {t('rep.action.dateRange') || 'فترة ممتدة (من - إلى)'}
                        </button>
                    </div>

                    {/* Date Pickers */}
                    {isSingleDay ? (
                        <div>
                            <label className="text-xs font-bold text-slate-700 mb-1 block">
                                {t('rep.action.dateLabel') || 'تاريخ الإجراء / المخالفة'} <span className="text-red-500">*</span>
                            </label>
                            <input 
                                type="date" 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                                value={formData.fromDate} 
                                onChange={e => setFormData({ ...formData, fromDate: e.target.value, toDate: e.target.value })} 
                            />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-slate-700 mb-1 block">{t('from')} <span className="text-red-500">*</span></label>
                                <input 
                                    type="date" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                                    value={formData.fromDate} 
                                    onChange={e => setFormData({ ...formData, fromDate: e.target.value })} 
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-700 mb-1 block">{t('to')} <span className="text-red-500">*</span></label>
                                <input 
                                    type="date" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                                    value={formData.toDate} 
                                    onChange={e => setFormData({ ...formData, toDate: e.target.value })} 
                                />
                            </div>
                        </div>
                    )}

                    {/* Send as Penalty Section (Direct Toggle Inside Form) */}
                    <div className="p-3.5 bg-gradient-to-r from-red-50/80 to-amber-50/80 border border-red-200 rounded-xl transition-all">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input 
                                type="checkbox"
                                checked={formData.sendPenalty}
                                onChange={e => setFormData({ ...formData, sendPenalty: e.target.checked })}
                                className="w-5 h-5 text-red-600 rounded border-red-300 focus:ring-red-500"
                            />
                            <div>
                                <div className="text-xs font-black text-red-900 flex items-center gap-1.5">
                                    <i className="fas fa-gavel text-red-600"></i>
                                    {t('rep.action.sendPenaltyTitle') || 'إرسال هذا الإجراء كجزاء رسمي بصفحة الجزاءات مباشرة'}
                                </div>
                                <div className="text-[11px] text-slate-600 font-medium">
                                    {t('rep.action.sendPenaltyDesc') || 'عند تفعيل هذا الخيار سيتم تسجيل المخالفة وإصدار وثيقة جزاء رسمي للموظف للاطلاع والتوقيع'}
                                </div>
                            </div>
                        </label>

                        {/* Additional Penalty Options if checked */}
                        {formData.sendPenalty && (
                            <div className="mt-3 pt-3 border-t border-red-200/70 space-y-2.5">
                                <div>
                                    <label className="text-[11px] font-bold text-red-900 mb-1 block">{t('rep.action.penaltyTypeLabel') || 'نوع الجزاء الرسمي'}</label>
                                    <select 
                                        value={formData.penaltyType}
                                        onChange={e => setFormData({ ...formData, penaltyType: e.target.value as any })}
                                        className="w-full bg-white border border-red-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-400"
                                    >
                                        <option value="1st Warning">{t('rep.action.penaltyWarn1') || 'إنذار أول (1st Warning)'}</option>
                                        <option value="2nd Warning">{t('rep.action.penaltyWarn2') || 'إنذار ثانٍ (2nd Warning)'}</option>
                                        <option value="Final Warning">{t('rep.action.penaltyWarnFinal') || 'إنذار نهائي (Final Warning)'}</option>
                                        <option value="Deduction">{t('rep.action.penaltyDeduction') || 'خصم مالي من الراتب (Deduction)'}</option>
                                        <option value="Suspension">{t('rep.action.penaltySuspension') || 'إيقاف مؤقت عن العمل (Suspension)'}</option>
                                        <option value="Dismissal">{t('rep.action.penaltyDismissal') || 'فصل من العمل (Dismissal)'}</option>
                                    </select>
                                </div>

                                {formData.penaltyType === 'Deduction' && (
                                    <div>
                                        <label className="text-[11px] font-bold text-red-900 mb-1 block">{t('rep.action.deductionDaysLabel') || 'عدد أيام الخصم من الراتب'}</label>
                                        <input 
                                            type="number"
                                            min="0.25"
                                            step="0.25"
                                            placeholder={t('rep.action.deductionDaysPlaceholder') || 'مثلاً: 1 يوم أو 0.5'}
                                            value={formData.deductionDays}
                                            onChange={e => setFormData({ ...formData, deductionDays: e.target.value })}
                                            className="w-full bg-white border border-red-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-400"
                                        />
                                    </div>
                                )}

                                {formData.penaltyType === 'Suspension' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <div>
                                            <label className="text-[11px] font-bold text-red-900 mb-1 block">{t('rep.action.suspensionDaysLabel') || 'أيام الإيقاف'}</label>
                                            <input 
                                                type="number"
                                                min="1"
                                                placeholder={t('rep.action.suspensionDaysPlaceholder') || 'مثلاً: 3'}
                                                value={formData.suspensionDays}
                                                onChange={e => setFormData({ ...formData, suspensionDays: e.target.value })}
                                                className="w-full bg-white border border-red-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-red-900 mb-1 block">{t('rep.action.suspensionFrom') || 'من تاريخ'}</label>
                                            <input 
                                                type="date"
                                                value={formData.suspensionFrom || formData.fromDate}
                                                onChange={e => setFormData({ ...formData, suspensionFrom: e.target.value })}
                                                className="w-full bg-white border border-red-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-red-900 mb-1 block">{t('rep.action.suspensionTo') || 'إلى تاريخ'}</label>
                                            <input 
                                                type="date"
                                                value={formData.suspensionTo || formData.toDate}
                                                onChange={e => setFormData({ ...formData, suspensionTo: e.target.value })}
                                                className="w-full bg-white border border-red-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-400"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Quick Preset Reason Chips */}
                    <div>
                        <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                            {t('rep.action.presetsTitle') || 'أسباب وملاحظات شائعة (انقر للاختيار السريع):'}
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                { key: 'rep.action.preset.hourly_emergency', def: 'إذن ساعي لظرف شخصي طارئ' },
                                { key: 'rep.action.preset.early_health', def: 'انصراف مبكر لظرف صحي طارئ' },
                                { key: 'rep.action.preset.late_shift', def: 'تأخير عن موعد بدء الشيفت' },
                                { key: 'rep.action.preset.late_approved', def: 'تأخير بموافقة المشرف المسبقة' },
                                { key: 'rep.action.preset.uniform_violation', def: 'عدم الالتزام بالزي الرسمي المعتمد' },
                                { key: 'rep.action.preset.leaving_unauthorized', def: 'مغادرة مقر العمل بدون إذن مسبق' },
                                { key: 'rep.action.preset.phone_use', def: 'استخدام الهاتف أثناء العمل' },
                                { key: 'rep.action.preset.duty_neglect', def: 'إهمال في أداء المهام المكلف بها' },
                                { key: 'rep.action.preset.rules_violation', def: 'مخالفة تعليمات الإدارة ولوائح العمل' },
                                { key: 'rep.action.preset.external_mission', def: 'مأمورية عمل خارجية رسمية' },
                                { key: 'rep.action.preset.overtime_coverage', def: 'ساعات عمل إضافية لتغطية العجز' },
                                { key: 'rep.action.preset.exceptional_performance', def: 'أداء متميز وتفاني وإتقان في العمل' }
                            ].map((preset) => {
                                const presetText = t(preset.key) || preset.def;
                                return (
                                    <button
                                        key={preset.key}
                                        type="button"
                                        onClick={() => setFormData(prev => ({
                                            ...prev,
                                            description: prev.description ? `${prev.description} - ${presetText}` : presetText
                                        }))}
                                        className="text-[11px] bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 px-2.5 py-1 rounded-lg border border-slate-200 transition font-medium"
                                    >
                                        + {presetText}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Notes Textarea */}
                    <div>
                        <label className="text-xs font-bold text-slate-700 mb-1 block">
                            {t('notes')} {t('rep.action.notesDetail') || 'والبيان التفصيلي'}
                        </label>
                        <textarea 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-sm min-h-[75px] transition"
                            placeholder={t('rep.action.notesPlaceholder') || 'اكتب تفاصيل الإجراء أو الملاحظات هنا...'}
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                        ></textarea>
                    </div>

                    {/* Submit Button */}
                    <button 
                        type="button"
                        onClick={handleSubmit} 
                        disabled={isSubmittingAction || !formData.employeeId}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer disabled:cursor-not-allowed"
                    >
                        {isSubmittingAction ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                {t('rep.action.submitting') || 'جاري الحفظ وتحديث التقرير...'}
                            </>
                        ) : (
                            <>
                                <i className="fas fa-check-circle"></i>
                                {editingId ? (t('rep.action.saveChanges') || 'حفظ التعديلات') : (t('rep.action.saveInstant') || 'تسجيل الإجراء فورياً')}
                            </>
                        )}
                    </button>
                </div>
            </Modal>

            {/* Interactive Penalty Confirmation Modal (Prompting User: "هل ابعت جزاء أو لا") */}
            {penaltyPromptModal && (
                <Modal 
                    isOpen={penaltyPromptModal.isOpen} 
                    onClose={() => setPenaltyPromptModal(null)} 
                    title={t('rep.action.promptTitle') || 'تأكيد إرسال جزاء رسمي للموظف'}
                >
                    <div className="space-y-4 text-right" dir={dir}>
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm text-lg">
                                <i className="fas fa-gavel"></i>
                            </div>
                            <div>
                                <h4 className="font-black text-sm text-amber-900">
                                    {t('rep.action.promptQuestion') || 'هل ترغب في إرسال هذا الإجراء كجزاء رسمي في صفحة الجزاءات للموظف؟'}
                                </h4>
                                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                                    {t('rep.action.promptEmpLabel') || 'الموظف:'} <strong className="font-bold text-amber-950">{penaltyPromptModal.employeeName}</strong> | {t('rep.action.promptActionLabel') || 'الإجراء:'} <strong className="font-bold text-amber-950">{penaltyPromptModal.actionTitle}</strong>
                                </p>
                                <p className="text-[11px] text-amber-600 mt-0.5">
                                    {t('rep.action.promptDateLabel') || 'بتاريخ:'} {penaltyPromptModal.date} {penaltyPromptModal.description ? `(${penaltyPromptModal.description})` : ''}
                                </p>
                            </div>
                        </div>

                        {/* Penalty Type Configuration in Prompt */}
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                            <label className="text-xs font-bold text-slate-800 block">
                                {t('rep.action.promptSelectPenaltyType') || 'حدد نوع الجزاء الرسمي في حال الإرسال:'}
                            </label>
                            <select 
                                value={penaltyPromptModal.penaltyType}
                                onChange={e => setPenaltyPromptModal({
                                    ...penaltyPromptModal,
                                    penaltyType: e.target.value as any
                                })}
                                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="1st Warning">{t('rep.action.penaltyWarn1') || 'إنذار أول (1st Warning)'}</option>
                                <option value="2nd Warning">{t('rep.action.penaltyWarn2') || 'إنذار ثانٍ (2nd Warning)'}</option>
                                <option value="Final Warning">{t('rep.action.penaltyWarnFinal') || 'إنذار نهائي (Final Warning)'}</option>
                                <option value="Deduction">{t('rep.action.penaltyDeduction') || 'خصم مالي من الراتب (Deduction)'}</option>
                                <option value="Suspension">{t('rep.action.penaltySuspension') || 'إيقاف مؤقت عن العمل (Suspension)'}</option>
                                <option value="Dismissal">{t('rep.action.penaltyDismissal') || 'فصل من العمل (Dismissal)'}</option>
                            </select>

                            {penaltyPromptModal.penaltyType === 'Deduction' && (
                                <div>
                                    <label className="text-[11px] font-bold text-red-800 mb-1 block">{t('rep.action.promptDeductionDays') || 'عدد أيام الخصم:'}</label>
                                    <input 
                                        type="number"
                                        min="0.25"
                                        step="0.25"
                                        placeholder={t('rep.action.deductionDaysPlaceholder') || 'مثلاً: 1'}
                                        value={penaltyPromptModal.deductionDays}
                                        onChange={e => setPenaltyPromptModal({ ...penaltyPromptModal, deductionDays: e.target.value })}
                                        className="w-full bg-white border border-red-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-400"
                                    />
                                </div>
                            )}

                            {penaltyPromptModal.penaltyType === 'Suspension' && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[11px] font-bold text-red-800 mb-1 block">{t('rep.action.promptSuspensionDays') || 'أيام الإيقاف:'}</label>
                                        <input 
                                            type="number"
                                            min="1"
                                            placeholder={t('rep.action.suspensionDaysPlaceholder') || 'مثلاً: 3'}
                                            value={penaltyPromptModal.suspensionDays}
                                            onChange={e => setPenaltyPromptModal({ ...penaltyPromptModal, suspensionDays: e.target.value })}
                                            className="w-full bg-white border border-red-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-red-800 mb-1 block">{t('rep.action.promptFrom') || 'من:'}</label>
                                        <input 
                                            type="date"
                                            value={penaltyPromptModal.suspensionFrom}
                                            onChange={e => setPenaltyPromptModal({ ...penaltyPromptModal, suspensionFrom: e.target.value })}
                                            className="w-full bg-white border border-red-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-red-800 mb-1 block">{t('rep.action.promptTo') || 'إلى:'}</label>
                                        <input 
                                            type="date"
                                            value={penaltyPromptModal.suspensionTo}
                                            onChange={e => setPenaltyPromptModal({ ...penaltyPromptModal, suspensionTo: e.target.value })}
                                            className="w-full bg-white border border-red-200 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Interactive Decision Actions */}
                        <div className="space-y-2 pt-2">
                            <button
                                type="button"
                                disabled={isSubmittingAction}
                                onClick={() => executeSaveActionAndPenalty(
                                    true,
                                    penaltyPromptModal.penaltyType,
                                    penaltyPromptModal.deductionDays,
                                    penaltyPromptModal.suspensionDays,
                                    penaltyPromptModal.suspensionFrom,
                                    penaltyPromptModal.suspensionTo
                                )}
                                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-md shadow-red-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <i className="fas fa-paper-plane"></i>
                                {t('rep.action.btnSendPenalty') || 'نعم، أرسل جزاء رسمي وسجّل الإجراء ⚖️'}
                            </button>

                            <button
                                type="button"
                                disabled={isSubmittingAction}
                                onClick={() => executeSaveActionAndPenalty(false)}
                                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold border border-slate-200 transition flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <i className="fas fa-file-alt"></i>
                                {t('rep.action.btnLogOnly') || 'لا، تسجيل الإجراء في التقرير فقط بدون جزاء'}
                            </button>

                            <button
                                type="button"
                                onClick={() => setPenaltyPromptModal(null)}
                                className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition"
                            >
                                {t('rep.action.btnCancel') || 'تراجع وإلغاء'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

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
