
// ... existing imports
import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
import { db as certDb } from '../firebaseData';
// @ts-ignore
import { collection, query, where, getDocs, orderBy, limit, Timestamp, addDoc, writeBatch, doc, QuerySnapshot, DocumentData, onSnapshot } from 'firebase/firestore';
import { User, SwapRequest, LeaveRequest, AttendanceLog, Schedule } from '../types';
import { isOperationalStaff, getOperationalStaffList } from '../utils/staffUtils';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import { useLanguage } from '../contexts/LanguageContext';
import { PrintHeader } from '../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDepartment } from '../contexts/DepartmentContext';
import { UserRole } from '../types';

interface DashboardAlert {
    id: string;
    title: string;
    subtitle: string;
    date: string;
    type: 'warning' | 'danger';
    link: string;
    icon: string;
}

const convertTo24Hour = (timeStr: string): string | null => {
    if (!timeStr) return null;
    let s = timeStr.toLowerCase().trim();
    if (/^\d{1,2}$/.test(s)) return `${s.padStart(2, '0')}:00`;
    s = s.replace(/(\d+)\.(\d+)/, '$1:$2');
    if (s.match(/\b12\s*:?\s*0{0,2}\s*mn\b/) || s.includes('midnight')) return '24:00';
    if (s.match(/\b12\s*:?\s*0{0,2}\s*n\b/) || s.includes('noon')) return '12:00';
    let modifier = null;
    if (s.includes('pm')) modifier = 'pm'; else if (s.includes('am')) modifier = 'am';
    const cleanTime = s.replace(/[^\d:]/g, ''); 
    const parts = cleanTime.split(':');
    if (parts.length === 0) return null;
    let h = parseInt(parts[0], 10);
    let m = parts[1] ? parseInt(parts[1], 10) : 0;
    if (modifier) { if (modifier === 'pm' && h < 12) h += 12; if (modifier === 'am' && h === 12) h = 0; }
    if (h === 24) return '24:00';
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const parseMultiShifts = (text: string) => {
    if (!text) return [];
    let cleanText = text.trim();
    const segments = cleanText.split(/[\/,]|\s+and\s+|&|\s+(?=\d{1,2}(?::\d{2})?\s*(?:am|pm|mn|noon))/i);
    const shifts: { start: string, end: string }[] = [];
    segments.forEach(seg => {
        const trimmed = seg.trim();
        const rangeParts = trimmed.replace(/[()]/g, '').split(/\s*(?:[-–—]|\bto\b)\s*/i);
        if (rangeParts.length >= 2) {
            const startStr = rangeParts[0].trim();
            const endStr = rangeParts[rangeParts.length - 1].trim(); 
            const s = convertTo24Hour(startStr);
            const e = convertTo24Hour(endStr);
            if (s && e) shifts.push({ start: s, end: e });
        }
    });
    return shifts;
};

// Expanded Regex to match (PP), [PP], {PP} or standalone PP
const ppRegex = /(?:\(|\[|\{)\s*pp\s*(?:\)|\]|\})|(?:\bPP\b)/i;

const SupervisorDashboard: React.FC = () => {
  const { t, dir } = useLanguage();
  const navigate = useNavigate();
  const { role: authRole, permissions } = useAuth();
  const { departments, selectedDepartmentId, setSelectedDepartmentId } = useDepartment();
  
  const isAdmin = authRole === UserRole.ADMIN || String(authRole).toLowerCase() === 'admin' || localStorage.getItem('role') === 'admin';

  const canAccess = (feature: string) => {
      if (isAdmin) return true;
      if (!permissions) return true; // Legacy users
      return permissions.includes(feature);
  };

  const activeDepartment = useMemo(() => {
      if (!selectedDepartmentId) return null;
      return departments.find(d => d.id === selectedDepartmentId) || null;
  }, [departments, selectedDepartmentId]);

  const [users, setUsers] = useState<User[]>([]);
  const [swapRequestsCount, setSwapRequestsCount] = useState(0);
  const [leaveRequestsCount, setLeaveRequestsCount] = useState(0);
  const [openShiftsCount, setOpenShiftsCount] = useState(0);
  const [todayApptCount, setTodayApptCount] = useState(0);
  const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([]);
  const [allTodayLogs, setAllTodayLogs] = useState<AttendanceLog[]>([]); // For logic calculation
  
  // Who's on Shift State
  const [onShiftNow, setOnShiftNow] = useState<{name: string, location: string, time: string, role?: string, phone?: string, isPresent: boolean, isPP: boolean}[]>([]);
  const [isShiftWidgetOpen, setIsShiftWidgetOpen] = useState(false);
  const [shiftFilterMode, setShiftFilterMode] = useState<'present' | 'all'>('present'); // 'present' = active only, 'all' = everyone scheduled
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  
  const [selectedEmpForAction, setSelectedEmpForAction] = useState('');
  const [feedbackModal, setFeedbackModal] = useState<{isOpen: boolean, type: 'kudos' | 'flag', userId: string}>({
      isOpen: false, type: 'kudos', userId: ''
  });
  const [feedbackForm, setFeedbackForm] = useState({ message: '', category: '' });
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error', duration?: number} | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  
  // Dashboard UI enhancements
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'staff' | 'operations' | 'facilities' | 'logbooks' | 'analytics'>('all');
  const [activityFilter, setActivityFilter] = useState<'all' | 'IN' | 'OUT'>('all');
  const [alertFilter, setAlertFilter] = useState<'all' | 'danger' | 'warning'>('all');

  const currentAdminName = localStorage.getItem('username') || 'Admin';
  const currentAdminId = auth.currentUser?.uid;

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // --- Data Loading (Overview with strict Department isolation) ---
  useEffect(() => {
      let unsubSwaps: any;
      let unsubLeavesSup: any;
      let unsubLeavesMan: any;
      let unsubMarket: any;
      let unsubAppt: any;

      // 1. Users Count & List - Filtered strictly by department (not by role)
      const qUsers = query(collection(db, 'users'));
      getDocs(qUsers).then(snap => {
          const fetchedUsers = snap.docs.map(d => ({id: d.id, ...d.data()} as User));
          
          let filtered = fetchedUsers.filter(u => {
              if (!u || u.isHidden) return false;
              
              // If a department is selected (by Admin or assigned to Supervisor/Manager)
              if (selectedDepartmentId) {
                  return (
                      u.departmentId === selectedDepartmentId ||
                      (Array.isArray(u.departments) && u.departments.includes(selectedDepartmentId)) ||
                      (selectedDepartmentId === 'legacy_radiology' && !u.departmentId)
                  );
              }
              
              // If no department is selected ("All Departments" for Admin)
              if (isAdmin) {
                  return true;
              }
              
              if (authRole === UserRole.SUPERVISOR) {
                  return u.departmentId === selectedDepartmentId || u.supervisorId === currentAdminId;
              } else if (authRole === UserRole.MANAGER) {
                  return u.departmentId === selectedDepartmentId || u.managerId === currentAdminId;
              }
              
              return true;
          });
          
          setUsers(filtered);

          // Setup pending requests counts strictly for these filtered users / department
          const qSwaps = query(collection(db, 'swapRequests'), where('status', '==', 'approvedByUser'));
          unsubSwaps = onSnapshot(qSwaps, (snap: QuerySnapshot<DocumentData>) => {
              const allSwaps = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
              if (!selectedDepartmentId) {
                  if (authRole === UserRole.ADMIN) {
                      setSwapRequestsCount(allSwaps.length);
                  } else {
                      const deptSwaps = allSwaps.filter(data => filtered.some((u: any) => u.id === data.from || u.id === data.to));
                      setSwapRequestsCount(deptSwaps.length);
                  }
              } else {
                  const deptSwaps = allSwaps.filter(data => 
                      data.departmentId === selectedDepartmentId || 
                      filtered.some((u: any) => u.id === data.from || u.id === data.to)
                  );
                  setSwapRequestsCount(deptSwaps.length);
              }
          });
      });

      // 2. Pending Leave Requests - Filtered by department / users
      let supCount = 0;
      let manCount = 0;
      const updateLeaveCount = (sup: number, man: number) => setLeaveRequestsCount(sup + man);

      const qLeavesSup = query(collection(db, 'leaveRequests'), where('status', '==', 'pending_supervisor'));
      unsubLeavesSup = onSnapshot(qLeavesSup, (snap: QuerySnapshot<DocumentData>) => {
          const docs = snap.docs.map(d => d.data() as LeaveRequest);
          if (selectedDepartmentId) {
              supCount = docs.filter(d => d.departmentId === selectedDepartmentId || (users.length > 0 && users.some(u => u.id === d.from || u.id === d.userId))).length;
          } else if (authRole === UserRole.ADMIN) {
              supCount = snap.size;
          } else {
              supCount = docs.filter(d => d.supervisorId === currentAdminId || (users.length > 0 && users.some(u => u.id === d.from || u.id === d.userId))).length;
          }
          updateLeaveCount(supCount, manCount);
      });

      const qLeavesMan = query(collection(db, 'leaveRequests'), where('status', '==', 'pending_manager'));
      unsubLeavesMan = onSnapshot(qLeavesMan, (snap: QuerySnapshot<DocumentData>) => {
          const docs = snap.docs.map(d => d.data() as LeaveRequest);
          if (selectedDepartmentId) {
              manCount = docs.filter(d => d.departmentId === selectedDepartmentId || (users.length > 0 && users.some(u => u.id === d.from || u.id === d.userId))).length;
          } else if (authRole === UserRole.ADMIN) {
              manCount = snap.size;
          } else {
              manCount = docs.filter(d => d.managerId === currentAdminId || (users.length > 0 && users.some(u => u.id === d.from || u.id === d.userId))).length;
          }
          updateLeaveCount(supCount, manCount);
      });

      // 3. Open Shifts Market - Filtered by department
      let qMarket = query(collection(db, 'openShifts'), where('status', '==', 'claimed'));
      unsubMarket = onSnapshot(qMarket, (snap: QuerySnapshot<DocumentData>) => {
          const shifts = snap.docs.map(d => d.data() as any);
          if (selectedDepartmentId) {
              setOpenShiftsCount(shifts.filter(s => s.departmentId === selectedDepartmentId || (users.length > 0 && users.some(u => u.id === s.userId || u.id === s.claimedBy))).length);
          } else {
              setOpenShiftsCount(snap.size);
          }
      });

      // 4. Today's Appointments - Filtered by department
      const todayDate = new Date().toISOString().split('T')[0];
      const qAppt = query(collection(db, 'appointments'), where('date', '==', todayDate));
      unsubAppt = onSnapshot(qAppt, (snap: QuerySnapshot<DocumentData>) => {
          const appts = snap.docs.map(d => d.data() as any);
          if (selectedDepartmentId) {
              setTodayApptCount(appts.filter(a => a.departmentId === selectedDepartmentId || (!a.departmentId && selectedDepartmentId === 'legacy_radiology')).length);
          } else {
              setTodayApptCount(snap.size);
          }
      });

      // 5. Live Logs - Filtered by department
      let qLogs = query(collection(db, 'attendance_logs'), where('date', '==', todayDate)); 
      getDocs(qLogs).then((snap: QuerySnapshot<DocumentData>) => {
          const logs = snap.docs.map(d => d.data() as AttendanceLog);
          let filteredLogs = logs;
          if (selectedDepartmentId) {
              filteredLogs = logs.filter(log => log.departmentId === selectedDepartmentId || (users.length > 0 && users.some(u => u.id === log.userId)));
          }
          const sortedLogs = [...filteredLogs].sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
          setTodayLogs(sortedLogs.slice(0, 20));
          setAllTodayLogs(filteredLogs);
      });

      // 6. Schedules for "Who is on shift"
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      
      const prevMonthDate = new Date(now);
      prevMonthDate.setMonth(now.getMonth() - 1);
      const prevMonth = prevMonthDate.toISOString().slice(0, 7);

      const nextMonthDate = new Date(now);
      nextMonthDate.setMonth(now.getMonth() + 1);
      const nextMonth = nextMonthDate.toISOString().slice(0, 7);

      let qSch;
      if (selectedDepartmentId) {
          qSch = query(collection(db, 'schedules'), where('month', 'in', [prevMonth, currentMonth, nextMonth]), where('departmentId', '==', selectedDepartmentId));
      } else {
          qSch = query(collection(db, 'schedules'), where('month', 'in', [prevMonth, currentMonth, nextMonth]));
      }
      getDocs(qSch).then(snap => {
          setSchedules(snap.docs.map(d => d.data() as Schedule));
      });

      return () => {
          if (unsubSwaps) unsubSwaps();
          if (unsubLeavesSup) unsubLeavesSup();
          if (unsubLeavesMan) unsubLeavesMan();
          if (unsubMarket) unsubMarket();
          if (unsubAppt) unsubAppt();
      };
  }, [refreshTrigger, currentAdminId, authRole, selectedDepartmentId]);

  // --- Fetch Expiry Alerts ---
  useEffect(() => {
      if (users.length === 0) return;

      const fetchAlerts = async () => {
          const newAlerts: DashboardAlert[] = [];
          const today = new Date();
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(today.getDate() + 30);

          const checkExpiry = (dateStr: string | undefined, title: string, subtitle: string, link: string, icon: string) => {
              if (!dateStr) return;
              const expiry = new Date(dateStr);
              if (isNaN(expiry.getTime())) return;

              if (expiry < today) {
                  newAlerts.push({ id: Math.random().toString(), title, subtitle, date: dateStr, type: 'danger', link, icon });
              } else if (expiry <= thirtyDaysFromNow) {
                  newAlerts.push({ id: Math.random().toString(), title, subtitle, date: dateStr, type: 'warning', link, icon });
              }
          };

          try {
              // 1. Employee Certificates
              const empSnap = await getDocs(collection(certDb, 'employee_records'));
              empSnap.forEach(doc => {
                  const data = doc.data();
                  const userName = users.find(u => u.id === doc.id)?.name || 'Employee';
                  
                  checkExpiry(data.licenseExpiry, 'License Expiry', userName, '/supervisor/employees', 'fa-id-card');
                  checkExpiry(data.registrationExpiry, 'Registration Expiry', userName, '/supervisor/employees', 'fa-file-contract');
                  checkExpiry(data.nrrcExpiry, 'NRRC Expiry', userName, '/supervisor/employees', 'fa-radiation');
                  
                  if (data.documents && Array.isArray(data.documents)) {
                      data.documents.forEach((d: any) => {
                          if (d.expiryDate) {
                              checkExpiry(d.expiryDate, `Document: ${d.name}`, userName, '/supervisor/employees', 'fa-file-alt');
                          }
                      });
                  }
              });

              // 2. Device Inventory (Filtered by selected department if applicable)
              const devSnap = await getDocs(collection(certDb, 'inventory_devices'));
              devSnap.forEach(doc => {
                  const data = doc.data();
                  if (selectedDepartmentId && data.departmentId && data.departmentId !== selectedDepartmentId) return;
                  checkExpiry(data.maintDate, 'Device PPM Expiry', data.name || `Device ${data.serial}`, '/supervisor/devices', 'fa-tools');
                  checkExpiry(data.qualDate, 'Device QC Expiry', data.name || `Device ${data.serial}`, '/supervisor/devices', 'fa-microscope');
              });

              // 3. FMS Reports (Filtered by selected department if applicable)
              const fmsSnap = await getDocs(collection(certDb, 'fms_reports'));
              fmsSnap.forEach(doc => {
                  const data = doc.data();
                  if (selectedDepartmentId && data.departmentId && data.departmentId !== selectedDepartmentId) return;
                  if (data.items && data.items.length > 0) {
                      const sortedItems = data.items.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                      const latestDate = sortedItems[0].date;
                      checkExpiry(latestDate, 'FMS Report Expiry', data.name || 'Report', '/supervisor/fms', 'fa-fire-extinguisher');
                  }
              });

              // 4. Room Reports (Filtered by selected department if applicable)
              const roomSnap = await getDocs(collection(certDb, 'room_reports'));
              roomSnap.forEach(doc => {
                  const data = doc.data();
                  if (selectedDepartmentId && data.departmentId && data.departmentId !== selectedDepartmentId) return;
                  if (data.surveyDate) {
                      const expiry = new Date(data.surveyDate);
                      expiry.setFullYear(expiry.getFullYear() + 1); // 1 year validity
                      checkExpiry(expiry.toISOString().split('T')[0], 'Room Survey Expiry', `Room ${data.number}`, '/supervisor/rooms', 'fa-door-open');
                  }
              });

              // Sort alerts: danger first, then warning, then by date
              newAlerts.sort((a, b) => {
                  if (a.type === 'danger' && b.type === 'warning') return -1;
                  if (a.type === 'warning' && b.type === 'danger') return 1;
                  return new Date(a.date).getTime() - new Date(b.date).getTime();
              });

              setAlerts(newAlerts);
          } catch (error) {
              console.error("Error fetching alerts:", error);
          }
      };

      fetchAlerts();
  }, [users, selectedDepartmentId]);

  // --- On Shift Logic (Updated for Presence) ---
  useEffect(() => {
      if (schedules.length === 0 || users.length === 0) return;

      const now = new Date();
      const currentDayStr = now.toISOString().split('T')[0];
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const dayOfWeek = now.getDay();
      
      const toMinutes = (timeStr: string) => {
          if (!timeStr) return 0;
          let cleanStr = timeStr.toLowerCase().trim();
          if(cleanStr.includes('mn') || cleanStr === '24:00') return 1440; 
          const parts = cleanStr.replace(/[a-zم ص]/g, '').split(/[:.]/);
          let h = parseInt(parts[0]);
          let m = parts[1] ? parseInt(parts[1]) : 0;
          if (cleanStr.includes('pm') && h < 12) h += 12;
          if (cleanStr.includes('am') && h === 12) h = 0;
          return h * 60 + m;
      };

      // Determine who is physically present based on logs
      const presentUserIds = new Set<string>();
      
      // Group logs by user
      const logsByUser: Record<string, AttendanceLog[]> = {};
      allTodayLogs.forEach(log => {
          if(!logsByUser[log.userId]) logsByUser[log.userId] = [];
          logsByUser[log.userId].push(log);
      });

      // Check last status for each user
      Object.entries(logsByUser).forEach(([uid, userLogs]) => {
          // Sort by time ascending
          userLogs.sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
          const lastLog = userLogs[userLogs.length - 1];
          if (lastLog && lastLog.type === 'IN') {
              presentUserIds.add(uid);
          }
      });

      const activePeople: any[] = [];

      schedules.forEach(sch => {
          let appliesToday = false;
          if (sch.date === currentDayStr) {
              appliesToday = true;
          } else if (!sch.date) {
              const isFriday = (sch.locationId || '').toLowerCase().includes('friday') || (sch.note && sch.note.toLowerCase().includes('friday'));
              if (dayOfWeek === 5) {
                  if (isFriday) appliesToday = true;
              } else {
                  if (!isFriday && !(sch.locationId || '').includes('Holiday')) appliesToday = true;
              }
              if (appliesToday && sch.validFrom && currentDayStr < sch.validFrom) appliesToday = false;
              if (appliesToday && sch.validTo && currentDayStr > sch.validTo) appliesToday = false;
          }
          
          if (appliesToday) {
              let effectiveShifts = sch.shifts || parseMultiShifts(sch.note || "") || [{start: '08:00', end: '16:00'}];
              effectiveShifts.forEach(shift => {
                  const startM = toMinutes(shift.start);
                  let endM = toMinutes(shift.end);
                  if (endM < startM) endM += 1440; // Cross midnight

                  let adjustedCurrent = currentMinutes;
                  // Handle midnight crossing context
                  if (endM > 1440 && currentMinutes < endM - 1440) adjustedCurrent += 1440;

                  if (adjustedCurrent >= startM && adjustedCurrent < endM) {
                      const uData = users.find(u => u.id === sch.userId);
                      
                      // Check PP in snapshot name (from schedule) OR note
                      // This ensures even if user is linked, we check the schedule-specific name for (PP)
                      const snapshotName = (sch as any).staffName || "";
                      const isPP = ppRegex.test(snapshotName) || ppRegex.test(sch.note || '');
                      
                      // Clean name: Prefer User Profile Name if linked, otherwise snapshot name
                      let rawName = uData ? (uData.name || uData.email) : snapshotName;
                      let name = rawName.replace(ppRegex, '').trim();

                      const role = uData?.role;
                      const isPresent = presentUserIds.has(sch.userId);

                      // LOGIC: Show based on Filter Mode
                      // If 'present': Show doctors OR actively present staff
                      // If 'all': Show everyone scheduled
                      let shouldShow = false;
                      if (shiftFilterMode === 'present') {
                          shouldShow = (role === 'doctor') || isPresent;
                      } else {
                          shouldShow = true;
                      }

                      // Exclude if already added
                      if (shouldShow && !activePeople.some(p => p.name === name)) {
                          activePeople.push({ 
                              name, 
                              location: sch.locationId === 'common_duty' && sch.note ? sch.note.split('-')[0] : sch.locationId, 
                              time: `${shift.start} - ${shift.end}`,
                              role: role,
                              phone: uData?.phone,
                              isPresent: isPresent,
                              isPP: isPP
                          });
                      }
                  }
              });
          }
      });
      setOnShiftNow(activePeople);
  }, [schedules, users, allTodayLogs, shiftFilterMode]);

  const activeNowCount = onShiftNow.length;

  // Active employees list: accurate operational staff roster (strictly excluding Admin, Supervisor, Manager & individual tools)
  const activeStaffList = useMemo(() => {
      return getOperationalStaffList(users, departments);
  }, [users, departments]);

  const activeEmployeesCount = activeStaffList.length;

  const handleSubmitFeedback = async () => {
      if(!feedbackModal.userId || !feedbackForm.message) return setToast({msg: 'Please select user and message', type: 'error'});
      
      const targetUser = users.find(u => u.id === feedbackModal.userId);
      const targetName = targetUser ? (targetUser.name || targetUser.email) : 'Employee';
      const todayStr = new Date().toISOString().split('T')[0];

      try {
          if (feedbackModal.type === 'kudos') {
              await addDoc(collection(db, 'peer_recognition'), {
                  fromUserId: currentAdminId || 'supervisor',
                  fromUserName: currentAdminName,
                  toUserId: feedbackModal.userId,
                  toUserName: targetName,
                  type: feedbackForm.category || 'hero',
                  message: feedbackForm.message,
                  createdAt: Timestamp.now()
              });
              setToast({ msg: `Appreciation sent to ${targetName} 🎉`, type: 'success' });
          } else {
              await addDoc(collection(db, 'actions'), {
                  employeeId: feedbackModal.userId,
                  type: feedbackForm.category || 'violation',
                  description: feedbackForm.message,
                  fromDate: todayStr,
                  toDate: todayStr,
                  createdAt: Timestamp.now()
              });
              setToast({ msg: `Flag recorded for ${targetName}`, type: 'info' });
          }
          setFeedbackModal({ ...feedbackModal, isOpen: false });
          setFeedbackForm({ message: '', category: '' });
      } catch(e) {
          console.error(e);
          setToast({ msg: 'Error saving feedback', type: 'error' });
      }
  };

  // Categorized Menu Items with rich subtitles and color schemes
  const allNavItems = [
      // Staff & Rosters Category
      { 
          id: 'employees', 
          title: t('sup.tab.users') || 'دليل الموظفين', 
          subtitle: dir === 'rtl' ? 'ملفات الموظفين والتراخيص والصلاحيات' : 'Employee profiles, licenses & roles',
          icon: 'fa-users', 
          path: '/supervisor/employees', 
          gradient: 'from-blue-500 to-indigo-600',
          shadowColor: 'shadow-blue-500/20',
          category: 'staff', 
          permission: 'sup_employees' 
      },
      { 
          id: 'rotations', 
          title: dir === 'rtl' ? 'تدوير وجداول العمل' : 'Rotations & Rosters', 
          subtitle: dir === 'rtl' ? 'مصفوفة التدوير والأنصبة والورديات' : 'Rotation matrix, quotas & duty cycles',
          icon: 'fa-sync-alt', 
          path: '/supervisor/rotation', 
          gradient: 'from-teal-500 to-emerald-600',
          shadowColor: 'shadow-teal-500/20',
          category: 'staff', 
          permission: 'sup_rotation' 
      },
      { 
          id: 'locations', 
          title: t('sup.tab.locations') || 'مواقع العمل', 
          subtitle: dir === 'rtl' ? 'إدارة غرف وأقسام ومواقع المناوبة' : 'Duty locations, rooms & stations',
          icon: 'fa-map-marker-alt', 
          path: '/supervisor/locations', 
          gradient: 'from-emerald-500 to-teal-700',
          shadowColor: 'shadow-emerald-500/20',
          category: 'staff', 
          permission: 'sup_locations' 
      },

      // Operations & Approvals Category
      { 
          id: 'swaps', 
          title: t('sup.tab.swaps') || 'طلبات التبديل', 
          subtitle: dir === 'rtl' ? 'اعتماد ومراجعة تبادل المناوبات' : 'Approve & review shift swaps',
          icon: 'fa-exchange-alt', 
          path: '/supervisor/swaps', 
          badge: swapRequestsCount, 
          gradient: 'from-purple-500 to-violet-600',
          shadowColor: 'shadow-purple-500/20',
          category: 'operations', 
          permission: 'sup_swaps' 
      },
      { 
          id: 'leaves', 
          title: t('sup.tab.leaves') || 'طلبات الإجازات', 
          subtitle: dir === 'rtl' ? 'طلبات الإجازة السنوية والمرضية' : 'Annual & sick leave requests',
          icon: 'fa-umbrella-beach', 
          path: '/supervisor/leaves', 
          badge: leaveRequestsCount, 
          gradient: 'from-rose-500 to-pink-600',
          shadowColor: 'shadow-rose-500/20',
          category: 'operations', 
          permission: 'sup_leaves' 
      },
      { 
          id: 'market', 
          title: t('sup.tab.market') || 'سوق الشفتات', 
          subtitle: dir === 'rtl' ? 'الشفتات الشاغرة والمطالبات' : 'Open shifts & cover claims',
          icon: 'fa-store', 
          path: '/supervisor/market', 
          badge: openShiftsCount, 
          gradient: 'from-amber-500 to-orange-600',
          shadowColor: 'shadow-amber-500/20',
          category: 'operations', 
          permission: 'sup_market' 
      },
      { 
          id: 'appointments', 
          title: t('nav.appointments') || 'حجوزات المرضى', 
          subtitle: dir === 'rtl' ? 'جدول المواعيد وفحوصات اليوم' : "Patient bookings & schedules",
          icon: 'fa-calendar-check', 
          path: '/appointments', 
          badge: todayApptCount, 
          gradient: 'from-cyan-500 to-blue-600',
          shadowColor: 'shadow-cyan-500/20',
          category: 'operations', 
          permission: 'appointments' 
      },
      { 
          id: 'panic', 
          title: dir === 'rtl' ? 'تقارير الطوارئ' : 'Panic Reports', 
          subtitle: dir === 'rtl' ? 'بلاغات الطوارئ وسجلات الإنذار' : 'Incident alerts & safety flags',
          icon: 'fa-exclamation-triangle', 
          path: '/supervisor/panic-reports', 
          gradient: 'from-red-500 to-rose-700',
          shadowColor: 'shadow-red-500/20',
          category: 'operations', 
          permission: 'sup_panic' 
      },

      // Analytics & Intelligence Category
      { 
          id: 'attendance', 
          title: dir === 'rtl' ? 'المحلل الذكي' : 'Smart Analyzer', 
          subtitle: dir === 'rtl' ? 'تحليل ساعات العمل والغياب والتأخير' : 'Attendance insights & punch logs',
          icon: 'fa-chart-pie', 
          path: '/supervisor/attendance', 
          gradient: 'from-indigo-600 to-blue-700',
          shadowColor: 'shadow-indigo-500/20',
          category: 'analytics', 
          permission: 'sup_attendance' 
      },
      { 
          id: 'performance', 
          title: dir === 'rtl' ? 'مؤشرات الأداء' : 'Performance KPIs', 
          subtitle: dir === 'rtl' ? 'تقييم الإنتاجية ونقاط التميز' : 'Staff metrics, badges & scores',
          icon: 'fa-chart-bar', 
          path: '/supervisor/performance', 
          gradient: 'from-violet-600 to-purple-800',
          shadowColor: 'shadow-violet-500/20',
          category: 'analytics', 
          permission: 'sup_performance' 
      },
      { 
          id: 'reports', 
          title: t('sup.tab.reports') || 'مركز التقارير', 
          subtitle: dir === 'rtl' ? 'تقارير الأداء الشهرية والتصدير' : 'Monthly audit reports & prints',
          icon: 'fa-file-alt', 
          path: '/reports', 
          gradient: 'from-emerald-600 to-teal-800',
          shadowColor: 'shadow-emerald-500/20',
          category: 'analytics', 
          permission: 'sup_reports' 
      },
      { 
          id: 'history', 
          title: dir === 'rtl' ? 'سجل العمليات' : 'Audit History', 
          subtitle: dir === 'rtl' ? 'سجل الحركات والتغييرات بالنظام' : 'System change log & activity history',
          icon: 'fa-history', 
          path: '/supervisor/history', 
          gradient: 'from-slate-600 to-slate-800',
          shadowColor: 'shadow-slate-500/20',
          category: 'analytics', 
          permission: 'sup_history' 
      },
      { 
          id: 'archive', 
          title: dir === 'rtl' ? 'الأرشفة السحابية' : 'Data Archiver', 
          subtitle: dir === 'rtl' ? 'حفظ وأرشفة البيانات التاريخية' : 'Cloud archive & historical records',
          icon: 'fa-box-archive', 
          path: '/supervisor/archive', 
          gradient: 'from-zinc-700 to-slate-900',
          shadowColor: 'shadow-zinc-500/20',
          category: 'analytics', 
          permission: 'sup_archive' 
      },
  ].filter(item => canAccess(item.permission));

  // Facility & Safety items
  const safetyItems = [
      { 
          id: 'devices', 
          title: dir === 'rtl' ? 'أجهزة ومعدات القسم' : 'Device Inventory & PPM', 
          subtitle: dir === 'rtl' ? 'فحوصات الصيانة الدورية والجودة' : 'PPM maintenance & QC schedules',
          icon: 'fa-microscope', 
          path: '/supervisor/devices', 
          gradient: 'from-sky-500 to-blue-600', 
          permission: 'sup_devices' 
      },
      { 
          id: 'fms', 
          title: dir === 'rtl' ? 'تقارير السلامة (FMS)' : 'FMS Safety Reports', 
          subtitle: dir === 'rtl' ? 'مكافحة الحريق والسلامة البيئية' : 'Fire safety, hazardous & environment',
          icon: 'fa-fire-extinguisher', 
          path: '/supervisor/fms', 
          gradient: 'from-orange-500 to-amber-600', 
          permission: 'sup_fms' 
      },
      { 
          id: 'rooms', 
          title: dir === 'rtl' ? 'مسح الغرف الإشعاعية' : 'Room Survey Reports', 
          subtitle: dir === 'rtl' ? 'شهادات المسح الإشعاعي وصلاحية الغرف' : 'Radiation protection & room certs',
          icon: 'fa-door-open', 
          path: '/supervisor/rooms', 
          gradient: 'from-indigo-500 to-purple-600', 
          permission: 'sup_rooms' 
      },
  ].filter(item => canAccess(item.permission));

  // Logbook Modality items
  const logbookItems = [
      { 
          id: 'mri', 
          title: dir === 'rtl' ? 'سجل الرنين (MRI)' : 'MRI Logbook', 
          subtitle: dir === 'rtl' ? 'سجل فحوصات وحالات الرنين المغناطيسي' : 'Magnetic resonance cases log',
          icon: 'fa-magnet', 
          path: '/logbook/mri', 
          gradient: 'from-blue-600 to-indigo-700', 
          permission: 'sup_logbooks' 
      },
      { 
          id: 'ct', 
          title: dir === 'rtl' ? 'سجل المقطعية (CT)' : 'CT Scan Logbook', 
          subtitle: dir === 'rtl' ? 'فحوصات الأشعة المقطعية والصبغة' : 'Computed tomography procedures',
          icon: 'fa-ring', 
          path: '/logbook/ct', 
          gradient: 'from-emerald-600 to-teal-700', 
          permission: 'sup_logbooks' 
      },
      { 
          id: 'us', 
          title: dir === 'rtl' ? 'سجل السونار (US)' : 'Ultrasound Logbook', 
          subtitle: dir === 'rtl' ? 'فحوصات الموجات فوق الصوتية والدوبلر' : 'Ultrasound & Doppler exam registry',
          icon: 'fa-wave-square', 
          path: '/logbook/us', 
          gradient: 'from-violet-600 to-purple-700', 
          permission: 'sup_logbooks' 
      },
      { 
          id: 'xray', 
          title: dir === 'rtl' ? 'سجل الأشعة العامة (X-Ray)' : 'X-Ray & Gen Log', 
          subtitle: dir === 'rtl' ? 'فحوصات الأشعة السينية والأجهزة المتنقلة' : 'Plain X-Ray & general procedures',
          icon: 'fa-x-ray', 
          path: '/logbook/xray', 
          gradient: 'from-slate-700 to-slate-900', 
          permission: 'sup_logbooks' 
      },
  ].filter(item => canAccess(item.permission));

  // Filtered menu items based on Search & Category
  const filteredNavItems = useMemo(() => {
      return allNavItems.filter(item => {
          const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
          const searchLower = searchQuery.toLowerCase().trim();
          const matchesSearch = !searchLower || 
              item.title.toLowerCase().includes(searchLower) || 
              item.subtitle.toLowerCase().includes(searchLower);
          return matchesCategory && matchesSearch;
      });
  }, [allNavItems, selectedCategory, searchQuery]);

  // Filtered Live Logs
  const filteredLogs = useMemo(() => {
      if (activityFilter === 'all') return todayLogs;
      return todayLogs.filter(l => l.type === activityFilter);
  }, [todayLogs, activityFilter]);

  // Filtered Alerts
  const filteredAlerts = useMemo(() => {
      if (alertFilter === 'all') return alerts;
      return alerts.filter(a => a.type === alertFilter);
  }, [alerts, alertFilter]);

  const categories = [
      { id: 'all', label: dir === 'rtl' ? 'جميع الأقسام' : 'All Modules', count: allNavItems.length, icon: 'fa-th-large' },
      { id: 'staff', label: dir === 'rtl' ? 'الموظفون والجداول' : 'Staff & Rosters', count: allNavItems.filter(i => i.category === 'staff').length, icon: 'fa-users' },
      { id: 'operations', label: dir === 'rtl' ? 'العمليات والموافقات' : 'Operations & Requests', count: allNavItems.filter(i => i.category === 'operations').length, icon: 'fa-bolt' },
      { id: 'analytics', label: dir === 'rtl' ? 'التحليلات والتقارير' : 'Analytics & Audits', count: allNavItems.filter(i => i.category === 'analytics').length, icon: 'fa-chart-pie' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100/80 font-sans pb-24 text-slate-800" dir={dir}>
        
        {toast && <Toast message={toast.msg} type={toast.type} duration={toast.duration} onClose={() => setToast(null)} />}

        {/* 1. Header & Quick Action Hub */}
        <header className="bg-white/85 backdrop-blur-md shadow-xs border-b border-slate-200/80 py-5 px-4 md:px-10 mb-8 sticky top-0 z-30 transition-all">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-blue-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-indigo-200/60 ring-4 ring-indigo-50">
                        <i className="fas fa-th-large"></i>
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
                                {t('nav.dashboard')}
                            </h1>
                            <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-full border border-emerald-200 inline-flex items-center gap-1.5 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                {t('system_active') || 'النظام متصل ونشط'}
                            </span>
                        </div>
                        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-medium flex items-center gap-2">
                            <span>{t('welcome')}, <strong className="text-slate-800">{currentAdminName}</strong></span>
                            <span className="text-slate-300">•</span>
                            <span className="text-indigo-600 font-semibold">{authRole === UserRole.ADMIN ? (dir === 'rtl' ? 'مدير النظام العام' : 'System Administrator') : (dir === 'rtl' ? 'مشرف القسم' : 'Department Supervisor')}</span>
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Live Calendar Date Pill */}
                    <div className="px-3.5 py-2 bg-slate-100/90 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-2 shadow-2xs">
                        <i className="fas fa-calendar-alt text-indigo-500"></i>
                        <span>{new Date().toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>

                    {/* Quick Jump Buttons */}
                    <button 
                        onClick={() => navigate('/supervisor/rotation')}
                        className="px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200/80 rounded-2xl transition-all text-xs font-bold flex items-center gap-1.5 shadow-2xs hover:scale-105"
                        title="الانتقال السريع إلى جدول التدوير"
                    >
                        <i className="fas fa-sync-alt text-teal-600"></i>
                        <span>{t('nav.rotation')}</span>
                    </button>

                    <button 
                        onClick={() => navigate('/supervisor/attendance')}
                        className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-2xl transition-all text-xs font-bold flex items-center gap-1.5 shadow-2xs hover:scale-105"
                        title="المحلل الذكي للحضور والغياب"
                    >
                        <i className="fas fa-chart-pie text-indigo-600"></i>
                        <span>{dir === 'rtl' ? 'المحلل الذكي' : 'Analyzer'}</span>
                    </button>

                    <button 
                        onClick={() => setRefreshTrigger(prev => prev + 1)}
                        className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-2xl transition-all text-xs border border-slate-200 shadow-2xs"
                        title={t('refresh') || 'تحديث البيانات'}
                    >
                        <i className="fas fa-redo-alt"></i>
                    </button>
                </div>
            </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 md:px-8 space-y-8 animate-fade-in">
            
            {/* 1.5. Interactive Department Switcher Banner (Admin Only) or Department Badge (Supervisor) */}
            {isAdmin ? (
                <section aria-label="Department Switcher" className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-slate-200/90 relative overflow-hidden">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-start sm:items-center gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-xl shrink-0 shadow-2xs">
                                <i className="fas fa-hospital-user"></i>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="text-base md:text-lg font-black text-slate-800 tracking-tight">
                                        {dir === 'rtl' ? 'تصفية بيانات اللوحة حسب القسم (خاص بالإدارة)' : 'Dashboard Department Filter (Admin Only)'}
                                    </h2>
                                    {activeDepartment ? (
                                        <span className="text-[11px] bg-indigo-100/80 text-indigo-800 font-bold px-3 py-0.5 rounded-full border border-indigo-200 inline-flex items-center gap-1.5 shadow-2xs">
                                            <i className="fas fa-check-circle text-indigo-600"></i>
                                            <span>{activeDepartment.name}</span>
                                        </span>
                                    ) : (
                                        <span className="text-[11px] bg-slate-100 text-slate-700 font-bold px-3 py-0.5 rounded-full border border-slate-200 inline-flex items-center gap-1.5 shadow-2xs">
                                            <i className="fas fa-globe text-slate-500"></i>
                                            <span>{dir === 'rtl' ? 'جميع الأقسام (عرض عام)' : 'All Departments (Global)'}</span>
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1 font-medium flex items-center gap-1.5">
                                    {activeDepartment ? (
                                        <span>{dir === 'rtl' ? `يتم الآن عرض موظفي ومناوبات وسجلات قسم "${activeDepartment.name}" فقط بدقة تامة.` : `Viewing data, staff & requests strictly for ${activeDepartment.name}.`}</span>
                                    ) : (
                                        <span>{dir === 'rtl' ? 'اختر قسماً محدداً (مثل التمريض، الأشعة، المختبر...) لعزل وعرض بياناته وموظفيه فقط.' : 'Select a specific department to isolate and view only its dedicated records.'}</span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Department Dropdown / Quick Select */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="relative min-w-[200px] sm:min-w-[240px]">
                                <select
                                    value={selectedDepartmentId || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setSelectedDepartmentId(val === '' ? null : val);
                                    }}
                                    className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-2xl py-2.5 px-4 text-xs md:text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all shadow-2xs cursor-pointer"
                                >
                                    <option value="">{dir === 'rtl' ? '🌐 جميع الأقسام (All Departments)' : '🌐 All Departments'}</option>
                                    {departments.map(dept => (
                                        <option key={dept.id} value={dept.id}>
                                            {dept.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedDepartmentId && (
                                <button
                                    onClick={() => setSelectedDepartmentId(null)}
                                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                                    title={dir === 'rtl' ? 'إلغاء التصفية وعرض الكل' : 'Clear filter'}
                                >
                                    <i className="fas fa-times"></i>
                                    <span>{dir === 'rtl' ? 'عرض الكل' : 'Show All'}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick Department Chips */}
                    {departments.length > 0 && (
                        <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                            <button
                                onClick={() => setSelectedDepartmentId(null)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                                    !selectedDepartmentId
                                        ? 'bg-indigo-600 text-white shadow-xs'
                                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                                }`}
                            >
                                <i className="fas fa-layer-group text-[11px]"></i>
                                <span>{dir === 'rtl' ? 'الكل' : 'All'}</span>
                            </button>
                            {departments.map(dept => {
                                const isSelected = selectedDepartmentId === dept.id;
                                return (
                                    <button
                                        key={dept.id}
                                        onClick={() => setSelectedDepartmentId(dept.id)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                                            isSelected
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                                        }`}
                                    >
                                        <i className="fas fa-clinic-medical text-[11px]"></i>
                                        <span>{dept.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>
            ) : (
                /* Supervisor / Manager Fixed Department Badge */
                activeDepartment && (
                    <div className="bg-white/90 backdrop-blur-md rounded-2xl p-4 px-5 border border-slate-200 flex items-center justify-between shadow-2xs">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-lg shadow-2xs">
                                <i className="fas fa-hospital-user"></i>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">
                                    {dir === 'rtl' ? `لوحة تحكم: ${activeDepartment.name}` : `Dashboard: ${activeDepartment.name}`}
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">
                                    {dir === 'rtl' ? 'يتم عرض البيانات والموظفين والمناوبات الخاصة بقسمك فقط' : 'Viewing data strictly assigned to your department'}
                                </p>
                            </div>
                        </div>
                        <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded-full border border-indigo-200 shadow-2xs">
                            {activeDepartment.name}
                        </span>
                    </div>
                )
            )}

            {/* 2. Hero KPI Cards (Overview Metrics) */}
            <section aria-label="KPI Overview" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Active Employees Card */}
                <div 
                    onClick={() => navigate('/supervisor/rotation')}
                    className="cursor-pointer bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-800 rounded-[2rem] p-6 text-white shadow-xl shadow-indigo-200/50 relative overflow-hidden group hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-300/60 transition-all duration-300 border border-white/15"
                >
                    <div className="absolute -right-8 -top-8 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500"></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <p className="text-indigo-100 font-bold text-xs uppercase tracking-wider">
                                    {activeDepartment ? (dir === 'rtl' ? `موظفو ${activeDepartment.name}` : `${activeDepartment.name} Staff`) : (t('sup.totalEmp') || 'الموظفون الفعليون')}
                                </p>
                                <span className="text-[10px] bg-white/20 text-white font-bold px-2.5 py-0.5 rounded-full backdrop-blur-sm">
                                    {activeDepartment ? (dir === 'rtl' ? 'بالقسم' : 'Dept') : (dir === 'rtl' ? 'إجمالي النظام' : 'Total')}
                                </span>
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight">{activeEmployeesCount}</h2>
                            <p className="text-xs text-indigo-100/90 mt-2.5 font-medium flex items-center gap-1.5">
                                <i className="fas fa-check-circle text-emerald-300 text-xs"></i>
                                <span>{activeDepartment ? (dir === 'rtl' ? `العدد الفعلي المعتمد لقسم ${activeDepartment.name}` : `Active staff in ${activeDepartment.name}`) : (dir === 'rtl' ? 'العدد الفعلي المعتمد دون تكرار' : 'Active roster (deduplicated)')}</span>
                            </p>
                        </div>
                        <div className="w-13 h-13 bg-white/15 rounded-2xl flex items-center justify-center text-2xl backdrop-blur-md shadow-inner group-hover:rotate-6 group-hover:scale-110 transition-transform">
                            <i className="fas fa-user-check"></i>
                        </div>
                    </div>
                </div>

                {/* Pending Requests Card */}
                <div 
                    onClick={() => navigate('/supervisor/swaps')}
                    className="cursor-pointer bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 rounded-[2rem] p-6 text-white shadow-xl shadow-orange-200/50 relative overflow-hidden group hover:scale-[1.02] hover:shadow-2xl hover:shadow-orange-300/60 transition-all duration-300 border border-white/15"
                >
                    <div className="absolute -right-8 -top-8 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500"></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <p className="text-orange-100 font-bold text-xs uppercase tracking-wider">{t('sup.pending') || 'الطلبات المعلقة'}</p>
                                <span className="text-[10px] bg-white/20 text-white font-bold px-2.5 py-0.5 rounded-full backdrop-blur-sm animate-pulse">
                                    {dir === 'rtl' ? 'بانتظار الاعتماد' : 'Pending Approval'}
                                </span>
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight">{swapRequestsCount + leaveRequestsCount + openShiftsCount}</h2>
                            <div className="text-[11px] text-orange-100/90 mt-2.5 font-medium flex items-center gap-2 flex-wrap">
                                <span>{dir === 'rtl' ? 'تبديل:' : 'Swaps:'} <strong>{swapRequestsCount}</strong></span>
                                <span>•</span>
                                <span>{dir === 'rtl' ? 'إجازة:' : 'Leaves:'} <strong>{leaveRequestsCount}</strong></span>
                                <span>•</span>
                                <span>{dir === 'rtl' ? 'سوق:' : 'Market:'} <strong>{openShiftsCount}</strong></span>
                            </div>
                        </div>
                        <div className="w-13 h-13 bg-white/15 rounded-2xl flex items-center justify-center text-2xl backdrop-blur-md shadow-inner group-hover:scale-110 transition-transform">
                            <i className="fas fa-inbox"></i>
                        </div>
                    </div>
                </div>

                {/* Today Appointments Card */}
                <div 
                    onClick={() => navigate('/appointments')}
                    className="cursor-pointer bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 rounded-[2rem] p-6 text-white shadow-xl shadow-cyan-200/50 relative overflow-hidden group hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-300/60 transition-all duration-300 border border-white/15"
                >
                    <div className="absolute -right-8 -top-8 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500"></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <p className="text-cyan-100 font-bold text-xs uppercase tracking-wider">{t('nav.appointments') || 'مواعيد اليوم'}</p>
                                <span className="text-[10px] bg-white/20 text-white font-bold px-2.5 py-0.5 rounded-full backdrop-blur-sm">
                                    {dir === 'rtl' ? 'جدول العيادة' : 'Today'}
                                </span>
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight">{todayApptCount}</h2>
                            <p className="text-xs text-cyan-100/90 mt-2.5 font-medium flex items-center gap-1.5">
                                <i className="fas fa-calendar-check text-cyan-200 text-xs"></i>
                                <span>{dir === 'rtl' ? 'إجمالي الحجوزات المجدولة اليوم' : "Scheduled appointments today"}</span>
                            </p>
                        </div>
                        <div className="w-13 h-13 bg-white/15 rounded-2xl flex items-center justify-center text-2xl backdrop-blur-md shadow-inner group-hover:scale-110 transition-transform">
                            <i className="fas fa-calendar-day"></i>
                        </div>
                    </div>
                </div>

                {/* On-Duty Now Card */}
                <div 
                    onClick={() => setIsShiftWidgetOpen(true)}
                    className="cursor-pointer bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 rounded-[2rem] p-6 text-white shadow-xl shadow-emerald-200/50 relative overflow-hidden group hover:scale-[1.02] hover:shadow-2xl hover:shadow-emerald-300/60 transition-all duration-300 border border-white/15"
                >
                    <div className="absolute -right-8 -top-8 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500"></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <p className="text-emerald-100 font-bold text-xs uppercase tracking-wider">{t('dash.activeNow') || 'المناوبون الآن'}</p>
                                <span className="text-[10px] bg-white/20 text-white font-bold px-2.5 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                    {dir === 'rtl' ? 'مباشر' : 'Live'}
                                </span>
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight">{activeNowCount}</h2>
                            <p className="text-xs text-emerald-100/90 mt-2.5 font-medium flex items-center gap-1.5">
                                <i className="fas fa-fingerprint text-emerald-200 text-xs"></i>
                                <span>{dir === 'rtl' ? 'على رأس العمل الآن في الأقسام' : 'Staff currently active on shift'}</span>
                            </p>
                        </div>
                        <div className="w-13 h-13 bg-white/15 rounded-2xl flex items-center justify-center text-2xl backdrop-blur-md shadow-inner group-hover:scale-110 transition-transform">
                            <i className="fas fa-user-clock"></i>
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. Search & Interactive Category Filter Bar */}
            <section aria-label="Tool Filter" className="bg-white rounded-3xl p-4 md:p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4">
                {/* Category Pills */}
                <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 custom-scrollbar">
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id as any)}
                            className={`px-4 py-2 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap ${
                                selectedCategory === cat.id 
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 ring-2 ring-indigo-600/20' 
                                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70'
                            }`}
                        >
                            <i className={`fas ${cat.icon} text-xs`}></i>
                            <span>{cat.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                selectedCategory === cat.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                            }`}>
                                {cat.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Fast Search Input */}
                <div className="relative w-full md:w-72">
                    <i className="fas fa-search absolute left-4 rtl:left-auto rtl:right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input 
                        type="text"
                        placeholder={dir === 'rtl' ? 'ابحث في الشاشات والأدوات...' : 'Search tools & modules...'}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200/90 rounded-2xl pl-10 pr-4 rtl:pl-4 rtl:pr-10 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all placeholder:text-slate-400"
                    />
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 rtl:right-auto rtl:left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                        >
                            <i className="fas fa-times-circle"></i>
                        </button>
                    )}
                </div>
            </section>

            {/* 4. Primary Modular Management Grid */}
            <section aria-label="Management Grid">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredNavItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => navigate(item.path)}
                            className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/90 flex flex-col justify-between transition-all hover:shadow-lg hover:-translate-y-1.5 group relative overflow-hidden text-left rtl:text-right"
                        >
                            {/* Ambient gradient top accent line */}
                            <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${item.gradient} opacity-90 group-hover:h-2 transition-all`}></div>

                            <div>
                                <div className="flex items-center justify-between mb-4 mt-1">
                                    <div className={`w-13 h-13 rounded-2xl bg-gradient-to-tr ${item.gradient} flex items-center justify-center text-white text-xl shadow-md ${item.shadowColor} group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
                                        <i className={`fas ${item.icon}`}></i>
                                    </div>
                                    {item.badge ? (
                                        <span className="bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full animate-bounce shadow-md border-2 border-white">
                                            {item.badge}
                                        </span>
                                    ) : (
                                        <span className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-colors">
                                            <i className="fas fa-arrow-right rtl:rotate-180 text-xs"></i>
                                        </span>
                                    )}
                                </div>

                                <h3 className="font-black text-slate-800 text-base group-hover:text-indigo-600 transition-colors">
                                    {item.title}
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                                    {item.subtitle}
                                </p>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 group-hover:text-indigo-500 transition-colors">
                                <span>{dir === 'rtl' ? 'فتح الأداة' : 'Open module'}</span>
                                <i className="fas fa-chevron-left rtl:rotate-180 text-[10px]"></i>
                            </div>
                        </button>
                    ))}
                </div>

                {filteredNavItems.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400 text-xl">
                            <i className="fas fa-search"></i>
                        </div>
                        <p className="text-sm font-bold text-slate-600">{dir === 'rtl' ? 'لم يتم العثور على شاشات مطابقة' : 'No modules match your search'}</p>
                        <button 
                            onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                            className="mt-3 px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors"
                        >
                            {dir === 'rtl' ? 'إعادة ضبط الفلاتر' : 'Reset filters'}
                        </button>
                    </div>
                )}
            </section>

            {/* 5. Safety, Facilities & Device Management (Bento Section) */}
            {safetyItems.length > 0 && (
                <section aria-label="Facility and Safety" className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-6">
                            <div>
                                <h3 className="text-xl md:text-2xl font-black flex items-center gap-2.5">
                                    <span className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center text-lg">
                                        <i className="fas fa-hard-hat"></i>
                                    </span>
                                    {dir === 'rtl' ? 'إدارة السلامة ومعدات القسم' : 'Facility, Devices & Safety Management'}
                                </h3>
                                <p className="text-xs text-slate-400 mt-1 font-medium">
                                    {dir === 'rtl' ? 'متابعة كفاءة الأجهزة، الصيانة الوقائية (PPM)، تقارير السلامة ومسح الغرف الإشعاعية' : 'PPM maintenance, FMS safety reports, and radiation room surveys'}
                                </p>
                            </div>
                            <span className="text-xs bg-white/10 text-slate-300 font-bold px-3 py-1.5 rounded-full border border-white/10 self-start md:self-auto">
                                3 {dir === 'rtl' ? 'أنظمة تفتيش' : 'Audit Modules'}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {safetyItems.map(item => (
                                <button 
                                    key={item.id}
                                    onClick={() => navigate(item.path)}
                                    className="bg-white/10 hover:bg-white/15 p-5 rounded-2xl border border-white/10 flex flex-col justify-between transition-all hover:scale-[1.02] hover:shadow-lg group text-left rtl:text-right backdrop-blur-sm"
                                >
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${item.gradient} flex items-center justify-center text-white text-xl shadow-md group-hover:scale-110 transition-transform`}>
                                            <i className={`fas ${item.icon}`}></i>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-bold text-white text-base group-hover:text-orange-300 transition-colors truncate">
                                                {item.title}
                                            </h4>
                                            <p className="text-xs text-slate-300/80 font-normal truncate mt-0.5">
                                                {item.subtitle}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-xs font-bold text-slate-400 group-hover:text-white transition-colors pt-2 border-t border-white/10">
                                        <span>{dir === 'rtl' ? 'عرض السجلات والتقارير' : 'View records & logs'}</span>
                                        <i className="fas fa-arrow-right rtl:rotate-180 text-xs"></i>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* 6. Department Logbooks Quick Access */}
            {logbookItems.length > 0 && (
                <section aria-label="Department Logbooks">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg md:text-xl font-black text-slate-800 flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">
                                <i className="fas fa-book-medical"></i>
                            </span>
                            {dir === 'rtl' ? 'سجلات غرف الأشعة والفحوصات (Logbooks)' : 'Department Modality Logbooks'}
                        </h3>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                            {dir === 'rtl' ? 'تسجيل ومراجعة الحالات' : 'Procedure Registries'}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {logbookItems.map(item => (
                            <button 
                                key={item.id}
                                onClick={() => navigate(item.path)}
                                className="bg-white p-5 rounded-3xl shadow-xs border border-slate-200/90 flex flex-col items-center justify-center text-center gap-3 transition-all hover:shadow-lg hover:-translate-y-1.5 group relative overflow-hidden"
                            >
                                <div className={`w-14 h-14 bg-gradient-to-tr ${item.gradient} rounded-2xl flex items-center justify-center text-white text-2xl shadow-md group-hover:scale-110 transition-transform`}>
                                    <i className={`fas ${item.icon}`}></i>
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">
                                        {item.title}
                                    </h4>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5 line-clamp-1">
                                        {item.subtitle}
                                    </p>
                                </div>
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    {dir === 'rtl' ? 'فتح السجل' : 'Open Logbook'}
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* 7. Quick Action Hub & Live Activity Stream (2-Column) */}
            <section aria-label="Operations and Feed" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Quick Action Center */}
                <div className="lg:col-span-2 bg-white rounded-3xl shadow-xs border border-slate-200/90 p-6 md:p-8 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
                                <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-base">
                                    <i className="fas fa-bolt"></i>
                                </span>
                                {dir === 'rtl' ? 'مركز التقدير والإجراءات الفورية' : 'Quick Action & Recognition Center'}
                            </h3>
                            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                                {dir === 'rtl' ? 'إجراءات المشرف' : 'Supervisor Direct Actions'}
                            </span>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                                    {dir === 'rtl' ? 'اختر الموظف المستهدف:' : 'Select Employee:'}
                                </label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all cursor-pointer"
                                    value={selectedEmpForAction}
                                    onChange={e => setSelectedEmpForAction(e.target.value)}
                                >
                                    <option value="">-- {dir === 'rtl' ? 'اختر موظفاً من القائمة' : 'Choose an employee'} --</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.name || u.email} {u.role ? `(${u.role})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                <button 
                                    disabled={!selectedEmpForAction}
                                    onClick={() => setFeedbackModal({isOpen: true, type: 'kudos', userId: selectedEmpForAction})}
                                    className="p-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-2xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 shadow-2xs hover:scale-[1.02]"
                                >
                                    <i className="fas fa-heart text-emerald-600 text-lg"></i>
                                    <span>{dir === 'rtl' ? 'إرسال شكر وتقدير (Kudos)' : 'Send Kudos / Appreciation'}</span>
                                </button>

                                <button 
                                    disabled={!selectedEmpForAction}
                                    onClick={() => setFeedbackModal({isOpen: true, type: 'flag', userId: selectedEmpForAction})}
                                    className="p-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 shadow-2xs hover:scale-[1.02]"
                                >
                                    <i className="fas fa-flag text-rose-600 text-lg"></i>
                                    <span>{dir === 'rtl' ? 'تسجيل ملاحظة / مخالفة' : 'Flag Issue / Violation'}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
                        <span>{dir === 'rtl' ? '💡 التقدير والملاحظات تظهر فوراً في ملف الموظف وسجل الأداء' : '💡 Feedback is immediately recorded on the staff profile & scorecard'}</span>
                    </div>
                </div>

                {/* Live Activity Feed (Terminal Monitor) */}
                <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col h-[380px] border border-slate-800 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-base flex items-center gap-2.5">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </span>
                            {t('dash.liveActivity') || 'سجل الحضور المباشر'}
                        </h3>

                        {/* Export to CSV button */}
                        <button 
                            onClick={() => {
                                if (allTodayLogs.length === 0) return;
                                const dataToExport = allTodayLogs.map(log => ({
                                    Employee: log.userName,
                                    Type: log.type,
                                    Time: log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString() : '',
                                    Date: log.date
                                }));
                                const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
                                    + Object.keys(dataToExport[0]).join(",") + "\n"
                                    + dataToExport.map(e => Object.values(e).map(v => `"${v || ''}"`).join(",")).join("\n");
                                const encodedUri = encodeURI(csvContent);
                                const link = document.createElement("a");
                                link.setAttribute("href", encodedUri);
                                link.setAttribute("download", `live_attendance_${new Date().toISOString().split('T')[0]}.csv`);
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }}
                            className="bg-white/10 hover:bg-white/20 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                            title="تصدير إلى ملف Excel / CSV"
                        >
                            <i className="fas fa-file-excel text-emerald-400"></i>
                            <span>{t('export') || 'تصدير'}</span>
                        </button>
                    </div>

                    {/* Filter Tabs for IN / OUT / ALL */}
                    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl mb-3 border border-white/5 text-xs font-bold">
                        <button 
                            onClick={() => setActivityFilter('all')}
                            className={`flex-1 py-1 rounded-lg transition-all ${activityFilter === 'all' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            {dir === 'rtl' ? 'الكل' : 'All'} ({todayLogs.length})
                        </button>
                        <button 
                            onClick={() => setActivityFilter('IN')}
                            className={`flex-1 py-1 rounded-lg transition-all ${activityFilter === 'IN' ? 'bg-emerald-500/30 text-emerald-300' : 'text-slate-400 hover:text-white'}`}
                        >
                            {dir === 'rtl' ? 'دخول (IN)' : 'Punched IN'}
                        </button>
                        <button 
                            onClick={() => setActivityFilter('OUT')}
                            className={`flex-1 py-1 rounded-lg transition-all ${activityFilter === 'OUT' ? 'bg-red-500/30 text-red-300' : 'text-slate-400 hover:text-white'}`}
                        >
                            {dir === 'rtl' ? 'خروج (OUT)' : 'Punched OUT'}
                        </button>
                    </div>

                    {/* Logs Stream */}
                    <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar-dark">
                        {filteredLogs.map((log, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${log.type === 'IN' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' : 'bg-rose-500 text-white shadow-sm shadow-rose-500/30'}`}>
                                    {log.type}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate text-slate-200">{log.userName || 'Employee'}</p>
                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}) : ''}
                                    </p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${log.type === 'IN' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                                    {log.type === 'IN' ? (dir === 'rtl' ? 'تسجيل دخول' : 'In') : (dir === 'rtl' ? 'تسجيل انصراف' : 'Out')}
                                </span>
                            </div>
                        ))}
                        {filteredLogs.length === 0 && (
                            <div className="text-center text-slate-500 text-xs py-12 flex flex-col items-center justify-center">
                                <i className="fas fa-fingerprint text-2xl mb-2 opacity-40"></i>
                                <span>{t('dash.noActivity') || 'لا توجد حركات حضور مسجلة اليوم'}</span>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* 8. Expiry & Regulatory Compliance Alerts Panel */}
            {alerts.length > 0 && (
                <section aria-label="Compliance Alerts" className="bg-white rounded-3xl shadow-xs border border-slate-200/90 p-6 md:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
                            <span className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-base">
                                <i className="fas fa-exclamation-triangle"></i>
                            </span>
                            {dir === 'rtl' ? 'تنبيهات الصلاحيات والتراخيص' : 'Expiry & Regulatory Alerts'}
                            <span className="bg-red-100 text-red-700 text-xs font-black px-2.5 py-0.5 rounded-full">
                                {alerts.length}
                            </span>
                        </h3>

                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
                            <button 
                                onClick={() => setAlertFilter('all')}
                                className={`px-3 py-1 rounded-lg transition-all ${alertFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'}`}
                            >
                                {dir === 'rtl' ? 'الكل' : 'All'} ({alerts.length})
                            </button>
                            <button 
                                onClick={() => setAlertFilter('danger')}
                                className={`px-3 py-1 rounded-lg transition-all ${alertFilter === 'danger' ? 'bg-red-500 text-white shadow-2xs' : 'text-red-600'}`}
                            >
                                {dir === 'rtl' ? 'منتهي الصلاحية 🔴' : 'Expired'}
                            </button>
                            <button 
                                onClick={() => setAlertFilter('warning')}
                                className={`px-3 py-1 rounded-lg transition-all ${alertFilter === 'warning' ? 'bg-amber-500 text-white shadow-2xs' : 'text-amber-700'}`}
                            >
                                {dir === 'rtl' ? 'قريب الانتهاء 🟡' : 'Near Expiry'}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[360px] overflow-y-auto custom-scrollbar pr-2">
                        {filteredAlerts.map(alert => (
                            <div 
                                key={alert.id} 
                                onClick={() => navigate(alert.link)} 
                                className={`cursor-pointer p-4 rounded-2xl border transition-all hover:scale-[1.02] flex items-start gap-3.5 ${
                                    alert.type === 'danger' 
                                        ? 'bg-red-50/70 border-red-200/80 hover:bg-red-100/70' 
                                        : 'bg-amber-50/70 border-amber-200/80 hover:bg-amber-100/70'
                                }`}
                            >
                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg shrink-0 ${
                                    alert.type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                                }`}>
                                    <i className={`fas ${alert.icon}`}></i>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className={`font-black text-sm truncate ${alert.type === 'danger' ? 'text-red-900' : 'text-amber-900'}`}>
                                        {alert.title}
                                    </h4>
                                    <p className={`text-xs font-semibold truncate ${alert.type === 'danger' ? 'text-red-700' : 'text-amber-700'}`}>
                                        {alert.subtitle}
                                    </p>
                                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-200/40">
                                        <span className={`text-[10px] font-mono font-bold ${alert.type === 'danger' ? 'text-red-600' : 'text-amber-600'}`}>
                                            {alert.type === 'danger' ? (dir === 'rtl' ? 'انتهى في:' : 'Expired:') : (dir === 'rtl' ? 'ينتهي في:' : 'Expires:')} {alert.date}
                                        </span>
                                        <span className="text-[10px] font-bold underline text-slate-500">
                                            {dir === 'rtl' ? 'معالجة' : 'Resolve'} →
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

        </main>

        {/* 9. Floating On Shift Monitor Capsule */}
        <div className={`fixed bottom-6 left-6 z-40 transition-all duration-300 ${onShiftNow.length > 0 || isShiftWidgetOpen ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
            <div className={`bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 transition-all duration-300 overflow-hidden ${isShiftWidgetOpen ? 'rounded-3xl w-84' : 'rounded-full w-auto hover:scale-105'}`}>
                
                <div 
                    onClick={() => setIsShiftWidgetOpen(!isShiftWidgetOpen)}
                    className={`cursor-pointer flex items-center justify-between p-3.5 ${isShiftWidgetOpen ? 'bg-slate-50 border-b border-slate-100' : 'bg-slate-900 text-white px-5 py-3.5'}`}
                >
                    <div className="flex items-center gap-2.5">
                        <span className="relative flex h-3 w-3">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isShiftWidgetOpen ? 'bg-cyan-500' : 'bg-emerald-400'}`}></span>
                            <span className={`relative inline-flex rounded-full h-3 w-3 ${isShiftWidgetOpen ? 'bg-cyan-600' : 'bg-emerald-500'}`}></span>
                        </span>
                        <h4 className={`font-black text-xs uppercase tracking-wider ${isShiftWidgetOpen ? 'text-slate-800' : 'text-white'}`}>
                            {t('dash.onShift') || 'المناوبون الآن'}
                        </h4>
                    </div>
                    
                    {isShiftWidgetOpen ? (
                        <i className="fas fa-chevron-down text-slate-400 text-xs"></i>
                    ) : (
                        <span className="ml-3 text-xs font-bold bg-white/20 px-2.5 py-0.5 rounded-full">
                            {onShiftNow.length}
                        </span>
                    )}
                </div>
                
                {isShiftWidgetOpen && (
                    <div className="flex flex-col">
                        {/* Filter Toggle */}
                        <div className="flex p-2 bg-slate-50 border-b border-slate-100 gap-1.5">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShiftFilterMode('present'); }} 
                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-xl transition-all ${shiftFilterMode === 'present' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                            >
                                <i className="fas fa-check-circle mr-1"></i> {t('dash.filterActive') || 'الحاضرون الآن'}
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShiftFilterMode('all'); }} 
                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-xl transition-all ${shiftFilterMode === 'all' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                            >
                                <i className="fas fa-list mr-1"></i> {t('dash.filterAll') || 'كل المجدولين'}
                            </button>
                        </div>

                        <div className="space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar-dark p-2">
                            {onShiftNow.length === 0 ? (
                                <div className="text-center py-6 text-xs text-slate-400 font-bold">
                                    {t('dash.noActiveStaff') || 'لا يوجد موظفون في هذا الفلتر حالياً'}
                                </div>
                            ) : (
                                onShiftNow.map((p, i) => (
                                    <div key={i} className={`flex items-center justify-between p-2.5 rounded-2xl transition-colors ${p.role === 'doctor' ? 'bg-cyan-50 border border-cyan-100' : 'hover:bg-slate-50'}`}>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                {p.role !== 'doctor' && (
                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${p.isPresent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                                )}

                                                <span className={`font-bold text-xs truncate max-w-[110px] ${p.role === 'doctor' ? 'text-cyan-900' : 'text-slate-700'}`}>
                                                    {p.name}
                                                </span>
                                                {p.role === 'doctor' && <i className="fas fa-user-md text-[10px] text-cyan-500 shrink-0"></i>}
                                                {p.isPP && (
                                                    <span className="shrink-0 text-[9px] bg-yellow-400 text-black px-1 rounded font-black border border-yellow-600 shadow-xs" title="Portable & Procedure">
                                                        PP
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-slate-400 block truncate max-w-[150px] pl-3.5">{p.location}</span>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 pl-2">
                                            <div className="text-[9px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-mono whitespace-nowrap">
                                                {p.time}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {p.isPresent ? (
                                                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                                        <i className="fas fa-check-circle text-[8px]"></i> {t('status.in') || 'حاضر'}
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                                        {t('status.notyet') || 'لم يحضر'}
                                                    </span>
                                                )}
                                                {p.phone && (
                                                    <a 
                                                        href={`tel:${p.phone}`}
                                                        className="w-5 h-5 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors shadow-2xs"
                                                        title={t('dash.call') || 'اتصال'}
                                                    >
                                                        <i className="fas fa-phone text-[9px]"></i>
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* 10. Modal: Feedback (Kudos / Flag) */}
        <Modal 
            isOpen={feedbackModal.isOpen} 
            onClose={() => setFeedbackModal({...feedbackModal, isOpen: false})} 
            title={feedbackModal.type === 'kudos' ? (dir === 'rtl' ? 'إرسال شكر وتقدير للموظف' : 'Send Appreciation') : (dir === 'rtl' ? 'تسجيل ملاحظة / مخالفة' : 'Issue Flag')}
        >
            <div className="space-y-4">
                <div className={`p-4 rounded-2xl border ${feedbackModal.type === 'kudos' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl bg-white shadow-xs">
                            {feedbackModal.type === 'kudos' ? '🎉' : '⚠️'}
                        </div>
                        <div>
                            <h4 className="font-bold">{feedbackModal.type === 'kudos' ? (dir === 'rtl' ? 'شهادة تقدير وإشادة' : 'Appreciation & Kudos') : (dir === 'rtl' ? 'تسجيل ملاحظة إدارية' : 'Administrative Flag')}</h4>
                            <p className="text-xs opacity-80 mt-0.5">{dir === 'rtl' ? 'سيتم تدوين الإجراء في السجل المهني للموظف' : 'This action is saved to the staff record'}</p>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">{dir === 'rtl' ? 'التصنيف' : 'Category'}</label>
                    <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100"
                        value={feedbackForm.category}
                        onChange={e => setFeedbackForm({...feedbackForm, category: e.target.value})}
                    >
                        <option value="">-- {dir === 'rtl' ? 'اختر التصنيف' : 'Select category'} --</option>
                        {feedbackModal.type === 'kudos' ? (
                            <>
                                <option value="hero">{dir === 'rtl' ? 'بطل المناوبة (Super Hero)' : 'Super Hero'}</option>
                                <option value="thankyou">{dir === 'rtl' ? 'شكر على المساعدة (Thank You)' : 'Thank You'}</option>
                                <option value="teamplayer">{dir === 'rtl' ? 'روح الفريق والتعاون (Team Player)' : 'Team Player'}</option>
                            </>
                        ) : (
                            <>
                                <option value="late">{dir === 'rtl' ? 'تأخر عن موعد الوردية (Late Arrival)' : 'Late Arrival'}</option>
                                <option value="violation">{dir === 'rtl' ? 'ملاحظة سلوكية / مهنية (Behavior Violation)' : 'Behavior Violation'}</option>
                                <option value="unjustified_absence">{dir === 'rtl' ? 'غياب غير مبرر (Unjustified Absence)' : 'Unjustified Absence'}</option>
                            </>
                        )}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">{dir === 'rtl' ? 'تفاصيل الملاحظة / الرسالة' : 'Message / Details'}</label>
                    <textarea 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-sm outline-none min-h-[100px] focus:ring-2 focus:ring-indigo-100"
                        placeholder={dir === 'rtl' ? 'اكتب التفاصيل والملاحظات هنا...' : 'Write details here...'}
                        value={feedbackForm.message}
                        onChange={e => setFeedbackForm({...feedbackForm, message: e.target.value})}
                    ></textarea>
                </div>

                <button 
                    onClick={handleSubmitFeedback}
                    className={`w-full py-3.5 rounded-2xl font-bold text-white shadow-lg transition-all hover:scale-[1.02] ${feedbackModal.type === 'kudos' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}
                >
                    {dir === 'rtl' ? 'حفظ وإرسال الإجراء' : 'Submit Feedback'}
                </button>
            </div>
        </Modal>

    </div>
  );
};

export default SupervisorDashboard;
