
import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, getDocs, orderBy, limit, Timestamp, addDoc, writeBatch, doc } from 'firebase/firestore';
import { User, SwapRequest, LeaveRequest, AttendanceLog, Schedule } from '../types';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import { useLanguage } from '../contexts/LanguageContext';
import { PrintHeader } from '../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

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

  const currentAdminName = localStorage.getItem('username') || 'Admin';
  const currentAdminId = auth.currentUser?.uid;

  // --- Data Loading (Overview Only) ---
  useEffect(() => {
      // 1. Users Count & List
      const qUsers = query(collection(db, 'users'));
      getDocs(qUsers).then(snap => setUsers(snap.docs.map(d => ({id: d.id, ...d.data()} as User))));

      // 2. Pending Requests Counts
      const qSwaps = query(collection(db, 'swapRequests'), where('status', 'in', ['pending', 'approvedByUser']));
      const unsubSwaps = onSnapshot(qSwaps, snap => setSwapRequestsCount(snap.size));

      const qLeaves = query(collection(db, 'leaveRequests'), where('status', '==', 'pending'));
      const unsubLeaves = onSnapshot(qLeaves, snap => setLeaveRequestsCount(snap.size));

      const qMarket = query(collection(db, 'openShifts'), where('status', '==', 'claimed'));
      const unsubMarket = onSnapshot(qMarket, snap => setOpenShiftsCount(snap.size));

      // 3. Today's Appointments
      const todayDate = new Date().toISOString().split('T')[0];
      const qAppt = query(collection(db, 'appointments'), where('date', '==', todayDate));
      const unsubAppt = onSnapshot(qAppt, snap => setTodayApptCount(snap.size));

      // 4. Live Logs (Fetch ALL for today to calculate presence)
      const qLogs = query(collection(db, 'attendance_logs'), where('date', '==', todayDate)); 
      const unsubLogs = onSnapshot(qLogs, snap => {
          const logs = snap.docs.map(d => d.data() as AttendanceLog);
          // Sort for the feed
          const sortedLogs = [...logs].sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
          setTodayLogs(sortedLogs.slice(0, 20)); // Limit feed display
          setAllTodayLogs(logs); // Keep all for logic
      });

      // 5. Schedules for "Who is on shift" - UPDATED to fetch surrounding months
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      
      const prevMonthDate = new Date(now);
      prevMonthDate.setMonth(now.getMonth() - 1);
      const prevMonth = prevMonthDate.toISOString().slice(0, 7);

      const nextMonthDate = new Date(now);
      nextMonthDate.setMonth(now.getMonth() + 1);
      const nextMonth = nextMonthDate.toISOString().slice(0, 7);

      const qSch = query(collection(db, 'schedules'), where('month', 'in', [prevMonth, currentMonth, nextMonth]));
      getDocs(qSch).then(snap => {
          setSchedules(snap.docs.map(d => d.data() as Schedule));
      });

      return () => { unsubSwaps(); unsubLeaves(); unsubMarket(); unsubAppt(); unsubLogs(); };
  }, []);

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

  const menuItems = [
      { id: 'attendance', title: 'Smart Analyzer', icon: 'fa-chart-pie', path: '/supervisor/attendance', color: 'bg-indigo-600' },
      { id: 'appointments', title: t('nav.appointments'), icon: 'fa-calendar-check', path: '/appointments', badge: todayApptCount, color: 'bg-cyan-600' },
      { id: 'employees', title: t('sup.tab.users'), icon: 'fa-users', path: '/supervisor/employees', color: 'bg-blue-600' },
      { id: 'swaps', title: t('sup.tab.swaps'), icon: 'fa-exchange-alt', path: '/supervisor/swaps', badge: swapRequestsCount, color: 'bg-purple-600' },
      { id: 'leaves', title: t('sup.tab.leaves'), icon: 'fa-umbrella-beach', path: '/supervisor/leaves', badge: leaveRequestsCount, color: 'bg-rose-600' },
      { id: 'market', title: t('sup.tab.market'), icon: 'fa-store', path: '/supervisor/market', badge: openShiftsCount, color: 'bg-amber-500' },
      { id: 'locations', title: t('sup.tab.locations'), icon: 'fa-map-marker-alt', path: '/supervisor/locations', color: 'bg-emerald-600' },
      { id: 'history', title: 'History', icon: 'fa-history', path: '/supervisor/history', color: 'bg-slate-600' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20" dir={dir}>
        
        {toast && <Toast message={toast.msg} type={toast.type} duration={toast.duration} onClose={() => setToast(null)} />}

        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200 py-6 px-6 md:px-12 mb-8">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">{t('nav.dashboard')}</h1>
                    <p className="text-slate-500 mt-1">{t('welcome')}, {currentAdminName}.</p>
                </div>
            </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-8 animate-fade-in relative">
            
            {/* 1. Hero Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-[2rem] p-6 text-white shadow-xl shadow-indigo-200 relative overflow-hidden group hover:scale-[1.02] transition-transform">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-xl"></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <p className="text-indigo-100 font-bold text-xs uppercase tracking-widest mb-1">{t('sup.totalEmp')}</p>
                            <h3 className="text-4xl font-black">{users.length}</h3>
                        </div>
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl backdrop-blur-md">
                            <i className="fas fa-users"></i>
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-[2rem] p-6 text-white shadow-xl shadow-orange-200 relative overflow-hidden group hover:scale-[1.02] transition-transform">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-xl"></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <p className="text-orange-100 font-bold text-xs uppercase tracking-widest mb-1">{t('sup.pending')}</p>
                            <h3 className="text-4xl font-black">{swapRequestsCount + leaveRequestsCount + openShiftsCount}</h3>
                        </div>
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl backdrop-blur-md animate-pulse">
                            <i className="fas fa-bell"></i>
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-cyan-500 to-blue-500 rounded-[2rem] p-6 text-white shadow-xl shadow-cyan-200 relative overflow-hidden group hover:scale-[1.02] transition-transform">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-xl"></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <p className="text-cyan-100 font-bold text-xs uppercase tracking-widest mb-1">{t('nav.appointments')}</p>
                            <h3 className="text-4xl font-black">{todayApptCount}</h3>
                        </div>
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl backdrop-blur-md">
                            <i className="fas fa-calendar-check"></i>
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[2rem] p-6 text-white shadow-xl shadow-emerald-200 relative overflow-hidden group hover:scale-[1.02] transition-transform">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-xl"></div>
                    <div className="flex justify-between items-start relative z-10">
                        <div>
                            <p className="text-emerald-100 font-bold text-xs uppercase tracking-widest mb-1">{t('dash.activeNow')}</p>
                            <h3 className="text-4xl font-black">{activeNowCount}</h3>
                        </div>
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl backdrop-blur-md">
                            <i className="fas fa-fingerprint"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Navigation Menu */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 mb-8">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => navigate(item.path)}
                        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-3 transition-all hover:shadow-md hover:-translate-y-1 group relative overflow-hidden"
                    >
                        <div className={`w-14 h-14 ${item.color} rounded-xl flex items-center justify-center text-white text-2xl shadow-lg group-hover:scale-110 transition-transform`}>
                            <i className={`fas ${item.icon}`}></i>
                        </div>
                        <h3 className="font-bold text-slate-700 group-hover:text-slate-900">{item.title}</h3>
                        {item.badge ? (
                            <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full animate-bounce shadow-sm border-2 border-white">
                                {item.badge}
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>

            {/* 3. Quick Action & Live Feed */}
            <div className="grid lg:grid-cols-3 gap-8">
                {/* Quick Action */}
                <div className="lg:col-span-2 bg-white rounded-[2rem] shadow-sm border border-slate-200 p-8 relative overflow-hidden">
                    <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2 relative z-10">
                        <i className="fas fa-bolt text-amber-500"></i> Quick Action Center
                    </h3>
                    <div className="flex flex-col gap-4 relative z-10">
                        <div className="flex flex-col md:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
                                <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Select Employee</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer hover:bg-slate-100"
                                    value={selectedEmpForAction}
                                    onChange={e => setSelectedEmpForAction(e.target.value)}
                                >
                                    <option value="">-- Choose Employee --</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                                </select>
                            </div>
                            <button 
                                disabled={!selectedEmpForAction}
                                onClick={() => setFeedbackModal({isOpen: true, type: 'kudos', userId: selectedEmpForAction})}
                                className="flex-1 md:flex-none px-6 py-4 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl font-bold hover:bg-emerald-100 hover:shadow-lg hover:-translate-y-1 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-heart text-lg"></i> Send Kudos
                            </button>
                            <button 
                                disabled={!selectedEmpForAction}
                                onClick={() => setFeedbackModal({isOpen: true, type: 'flag', userId: selectedEmpForAction})}
                                className="flex-1 md:flex-none px-6 py-4 bg-red-50 text-red-600 border border-red-100 rounded-xl font-bold hover:bg-red-100 hover:shadow-lg hover:-translate-y-1 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-flag text-lg"></i> Flag Issue
                            </button>
                        </div>
                        
                    </div>
                </div>

                {/* Live Feed */}
                <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl flex flex-col h-[300px]">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        Live Activity
                    </h3>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar-dark space-y-3">
                        {todayLogs.map((log, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${log.type === 'IN' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                    {log.type}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate text-slate-200">{log.userName}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">
                                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'}) : ''}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {todayLogs.length === 0 && <p className="text-center text-slate-500 text-xs py-10">No activity yet.</p>}
                    </div>
                </div>
            </div>

            {/* Floating On Shift Widget */}
            {/* Floating On Shift Widget */}
            <div className={`fixed bottom-6 left-6 z-40 transition-all duration-300 ${onShiftNow.length > 0 || isShiftWidgetOpen ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
                <div className={`bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 transition-all duration-300 overflow-hidden ${isShiftWidgetOpen ? 'rounded-3xl w-80' : 'rounded-full w-auto hover:scale-105'}`}>
                    
                    <div 
                        onClick={() => setIsShiftWidgetOpen(!isShiftWidgetOpen)}
                        className={`cursor-pointer flex items-center justify-between p-3 ${isShiftWidgetOpen ? 'bg-slate-50 border-b border-slate-100' : 'bg-slate-900 text-white px-5 py-3'}`}
                    >
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2.5 w-2.5">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isShiftWidgetOpen ? 'bg-cyan-500' : 'bg-emerald-400'}`}></span>
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isShiftWidgetOpen ? 'bg-cyan-600' : 'bg-emerald-500'}`}></span>
                            </span>
                            <h4 className={`font-black text-sm uppercase tracking-wide ${isShiftWidgetOpen ? 'text-slate-800' : 'text-white'}`}>{t('dash.onShift')}</h4>
                        </div>
                        
                        {isShiftWidgetOpen ? (
                            <i className="fas fa-chevron-down text-slate-400 text-xs"></i>
                        ) : (
                            <span className="ml-3 text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">{onShiftNow.length}</span>
                        )}
                    </div>
                    
                    {isShiftWidgetOpen && (
                        <div className="flex flex-col">
                            {/* Filter Toggle */}
                            <div className="flex p-2 bg-slate-50 border-b border-slate-100 gap-1">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setShiftFilterMode('present'); }} 
                                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${shiftFilterMode === 'present' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                                >
                                    <i className="fas fa-check-circle mr-1"></i> {t('dash.filterActive')}
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setShiftFilterMode('all'); }} 
                                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${shiftFilterMode === 'all' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
                                >
                                    <i className="fas fa-list mr-1"></i> {t('dash.filterAll')}
                                </button>
                            </div>

                            <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar-dark p-2">
                                {onShiftNow.length === 0 ? (
                                    <div className="text-center py-4 text-xs text-slate-400">{t('dash.noActiveStaff')}</div>
                                ) : (
                                    onShiftNow.map((p, i) => (
                                        <div key={i} className={`flex items-center justify-between p-2 rounded-xl transition-colors ${p.role === 'doctor' ? 'bg-cyan-50 border border-cyan-100' : 'hover:bg-slate-50'}`}>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1">
                                                    {p.role !== 'doctor' && (
                                                        <div
                                                            className={`w-2 h-2 rounded-full mr-1 ${
                                                            p.isPresent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                                                            }`}
                                                        ></div>
                                                        )}
                                                    <span className={`font-bold text-xs truncate max-w-[100px] ${p.role === 'doctor' ? 'text-cyan-900' : 'text-slate-700'}`}>
                                                        {p.name}
                                                    </span>
                                                    {p.role === 'doctor' && <i className="fas fa-user-md text-[10px] text-cyan-500 shrink-0"></i>}
                                                    {p.isPP && (
                                                        <span className="shrink-0 text-[9px] bg-yellow-400 text-black px-1 rounded font-black border border-yellow-600 shadow-sm" title="Portable & Procedure">
                                                            PP
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-slate-400 block truncate max-w-[150px] pl-3">{p.location}</span>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 pl-2">
                                                <div className="text-[9px] bg-slate-100 px-2 py-1 rounded text-slate-500 font-mono whitespace-nowrap">
                                                    {p.time}
                                                </div>
                                                {/* VISIBLE STATUS INDICATOR */}
                                                {p.role !== 'doctor' && (
                                                    p.isPresent ? (
                                                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                                        <i className="fas fa-check-circle text-[8px]"></i> {t('status.in')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                                        {t('status.notyet')}
                                                        </span>
                                                    )
                                                    )}
                                                {p.phone && (
                                                     <a 
                                                        href={`tel:${p.phone}`}
                                                        className="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors shadow-sm"
                                                        title={t('dash.call')}
                                                    >
                                                        <i className="fas fa-phone text-[10px]"></i>
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>

        {/* Modal: Feedback (Kudos / Flag) */}
        <Modal isOpen={feedbackModal.isOpen} onClose={() => setFeedbackModal({...feedbackModal, isOpen: false})} title={feedbackModal.type === 'kudos' ? 'Send Appreciation' : 'Issue Flag'}>
            <div className="space-y-4">
                <div className={`p-4 rounded-xl border ${feedbackModal.type === 'kudos' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl bg-white shadow-sm`}>
                            {feedbackModal.type === 'kudos' ? '🎉' : '⚠️'}
                        </div>
                        <div>
                            <h4 className="font-bold">{feedbackModal.type === 'kudos' ? 'Send Kudos' : 'Record Violation'}</h4>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Category</label>
                    <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none"
                        value={feedbackForm.category}
                        onChange={e => setFeedbackForm({...feedbackForm, category: e.target.value})}
                    >
                        <option value="">Select...</option>
                        {feedbackModal.type === 'kudos' ? (
                            <>
                                <option value="hero">Super Hero</option>
                                <option value="thankyou">Thank You</option>
                                <option value="teamplayer">Team Player</option>
                            </>
                        ) : (
                            <>
                                <option value="late">Late Arrival</option>
                                <option value="violation">Behavior Violation</option>
                                <option value="unjustified_absence">Unjustified Absence</option>
                            </>
                        )}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Message / Details</label>
                    <textarea 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none min-h-[100px]"
                        placeholder="Write details..."
                        value={feedbackForm.message}
                        onChange={e => setFeedbackForm({...feedbackForm, message: e.target.value})}
                    ></textarea>
                </div>

                <button 
                    onClick={handleSubmitFeedback}
                    className={`w-full py-3 rounded-xl font-bold text-white shadow-lg ${feedbackModal.type === 'kudos' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                >
                    Submit
                </button>
            </div>
        </Modal>

    </div>
  );
};

export default SupervisorDashboard;
