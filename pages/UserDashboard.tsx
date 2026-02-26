
import React, { useEffect, useState } from 'react';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { Schedule, Announcement, SwapRequest, OpenShift, User, AttendanceLog, ActionLog } from '../types';
import Toast from '../components/Toast';
import { useAttendanceStatus } from '../hooks/useAttendanceStatus';

// --- Helpers ---
const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const convertTo24Hour = (timeStr: string): string | null => {
    if (!timeStr) return null;
    let s = timeStr.toLowerCase().trim();
    if (/^\d{1,2}$/.test(s)) {
        const h = parseInt(s, 10);
        if (h >= 0 && h <= 24) return `${h.toString().padStart(2, '0')}:00`;
    }
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

const parseMultiShifts = (text: string) => {
    if (!text) return [];
    let cleanText = text.trim();
    const segments = cleanText.split(/[\/,]|\s+and\s+|&|\s+(?=\d{1,2}(?::\d{2})?\s*(?:am|pm|mn|noon))/i);
    const shifts: { start: string, end: string }[] = [];
    segments.forEach(seg => {
        const trimmed = seg.trim();
        if(!trimmed) return;
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

const formatTime12 = (time24: string) => {
  if (!time24) return '--:--';
  const [h, m] = time24.split(':');
  let hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${m} ${ampm}`;
};

const constructDateTime = (dateStr: string, timeStr: string, defaultTime: string = '00:00'): Date => {
    let t = timeStr;
    if (!t || t.length < 5) t = defaultTime;
    if (t === '24:00') {
        const d = new Date(`${dateStr}T00:00:00`);
        d.setDate(d.getDate() + 1);
        return d;
    }
    return new Date(`${dateStr}T${t}`);
};

// Expanded Regex
const ppRegex = /(?:\(|\[|\{)\s*pp\s*(?:\)|\]|\})|(?:\bPP\b)/i;

const UserDashboard: React.FC = () => {
  const { t, dir } = useLanguage();
  const navigate = useNavigate();
  const currentUserId = auth.currentUser?.uid;
  const shiftStatus = useAttendanceStatus(currentUserId);
  const currentUserName = localStorage.getItem('username') || t('role.user');
  const currentUserRole = localStorage.getItem('role') || 'user';
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [openShiftsCount, setOpenShiftsCount] = useState(0);
  const [incomingCount, setIncomingCount] = useState(0);
  const [currentSchedules, setCurrentSchedules] = useState<Schedule[]>([]);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [allTodayLogs, setAllTodayLogs] = useState<AttendanceLog[]>([]); // For "Who's on shift" widget accuracy
  const [hasAttendanceOverride, setHasAttendanceOverride] = useState(false);
  
  // NEW: Store Actions (Leaves, Absences)
  const [userActions, setUserActions] = useState<ActionLog[]>([]);

  // Who's on Shift State
  const [onShiftNow, setOnShiftNow] = useState<{name: string, location: string, time: string, role?: string, phone?: string, isPresent: boolean, isPP: boolean}[]>([]);
  const [isShiftWidgetOpen, setIsShiftWidgetOpen] = useState(false);
  const [shiftFilterMode, setShiftFilterMode] = useState<'present' | 'all'>('present');
  const [allUsers, setAllUsers] = useState<User[]>([]);

const [showAnnouncePopup, setShowAnnouncePopup] = useState(true);
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState(false);

  
const [generatedCode, setGeneratedCode] = useState<string | null>(null);
const [isGenerating, setIsGenerating] = useState(false);
const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

const handleGenerateManualCode = () => {
    setIsGenerating(true);
    if (!navigator.geolocation) {
        setToast({ msg: "متصفحك لا يدعم تحديد الموقع", type: 'error' });
        setIsGenerating(false);
        return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const timestamp = Math.floor(Date.now() / 1000);
        const userId = auth.currentUser?.uid || 'unknown';
        const rawData = `${lat}|${lng}|${timestamp}|${userId}`;
        const encoded = btoa(rawData);
        setGeneratedCode(encoded);
        setIsGenerating(false);
        setToast({ msg: "تم توليد كود الموقع بنجاح", type: 'success' });
    }, (err) => {
        setToast({ msg: "فشل جلب الموقع، تأكد من تفعيل GPS", type: 'error' });
        setIsGenerating(false);
    }, { enableHighAccuracy: true });
};
  // منطق التحقق من الـ 12 ساعة
  useEffect(() => {
    if (announcements.length > 0) {
      const lastDismissed = localStorage.getItem('announcements_dismissed_at');
      const now = new Date().getTime();
      
      // إذا لم يتم الإغلاق مسبقاً أو مر أكثر من 12 ساعة (12 * 60 * 60 * 1000 ملين ثانية)
      if (!lastDismissed || (now - parseInt(lastDismissed)) > 43200000) {
        setShowAnnouncementsModal(true);
      }
    }
  }, [announcements]);

  const closeAnnouncements = () => {
    localStorage.setItem('announcements_dismissed_at', new Date().getTime().toString());
    setShowAnnouncementsModal(false);
  };

  // --- Data Loading ---
  useEffect(() => {
    if (!currentUserId) return;

    // 1. Announcements
    const qAnnounce = query(collection(db, 'announcements'), where('isActive', '==', true));
    getDocs(qAnnounce).then((snap: any) => {
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); 
        
        const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Announcement)).filter((ann: any) => {
            if (!ann.createdAt) return false;
            const createdDate = ann.createdAt.toDate ? ann.createdAt.toDate() : new Date(ann.createdAt);
            return createdDate >= cutoffTime; 
        });
        setAnnouncements(list);
    });

    // 2. Counts
    const qOpenShifts = query(collection(db, 'openShifts'), where('status', '==', 'open'));
    getDocs(qOpenShifts).then((snap: any) => setOpenShiftsCount(snap.size));

    const qIncoming = query(collection(db, 'swapRequests'), where('to', '==', currentUserId), where('status', '==', 'pending'));
    getDocs(qIncoming).then((snap: any) => setIncomingCount(snap.size));

    // 3. Override
    const qOverride = query(collection(db, 'attendance_overrides'), where('userId', '==', currentUserId));
    getDocs(qOverride).then((snap: any) => {
        let active = false;
        const now = new Date();
        snap.docs.forEach((d: any) => {
            if (d.data().validUntil && d.data().validUntil.toDate() > now) active = true;
        });
        setHasAttendanceOverride(active);
    });

    // 4. Schedules (Previous, Current AND Next Month to catch shifts at month boundaries)
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    
    // Add Previous Month Logic
    const prevMonthDate = new Date(now);
    prevMonthDate.setMonth(now.getMonth() - 1);
    const prevMonth = prevMonthDate.toISOString().slice(0, 7);

    const nextMonthDate = new Date(now);
    nextMonthDate.setMonth(now.getMonth() + 1);
    const nextMonth = nextMonthDate.toISOString().slice(0, 7);

    // Filter by IN array of 3 months
    const qSchedule = query(collection(db, 'schedules'), where('month', 'in', [prevMonth, currentMonth, nextMonth]));
    getDocs(qSchedule).then((snap: any) => {
        const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Schedule));
        setCurrentSchedules(data); // Stores *all* schedules for logic
    });

    // 5. My Logs (Today)
    const todayStr = getLocalDateStr(now);
    const qLogs = query(collection(db, 'attendance_logs'), where('userId', '==', currentUserId), where('date', '==', todayStr));
    getDocs(qLogs).then((snap: any) => {
        setTodayLogs(snap.docs.map((d: any) => d.data()));
    });

    // 5b. All Logs (Today) - For "Who is on shift" widget accuracy
    const qAllLogs = query(collection(db, 'attendance_logs'), where('date', '==', todayStr));
    getDocs(qAllLogs).then((snap: any) => {
        setAllTodayLogs(snap.docs.map((d: any) => d.data() as AttendanceLog));
    }).catch((error) => {
        console.log("Cannot fetch global logs for widget", error);
    });
    
    // 6. Fetch Users for names
    getDocs(collection(db, 'users')).then(snap => {
        setAllUsers(snap.docs.map((d: any) => ({ id: d.id, ...d.data() as any } as User)));
    });

    // NEW: Fetch Actions/Leaves for current user
    // We fetch broader range or all to simplify, or last 30 days
    const qActions = query(collection(db, 'actions'), where('employeeId', '==', currentUserId));
    getDocs(qActions).then((snap: any) => {
        setUserActions(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as ActionLog)));
    });

  }, [currentUserId, refreshTrigger]);

  // --- On Shift Logic (Corrected) ---
  useEffect(() => {
      if (currentSchedules.length === 0 || allUsers.length === 0) return;

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

      // Determine who is physically present
      const presentUserIds = new Set<string>();
      const logsByUser: Record<string, AttendanceLog[]> = {};
      allTodayLogs.forEach(log => {
          if(!logsByUser[log.userId]) logsByUser[log.userId] = [];
          logsByUser[log.userId].push(log);
      });
      Object.entries(logsByUser).forEach(([uid, userLogs]) => {
          userLogs.sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
          const lastLog = userLogs[userLogs.length - 1];
          if (lastLog && lastLog.type === 'IN') {
              presentUserIds.add(uid);
          }
      });

      const activePeople: any[] = [];

      currentSchedules.forEach(sch => {
          let appliesToday = false;
          if (sch.date === currentDayStr) {
              appliesToday = true;
          } else if (!sch.date) {
              const isFriday = (sch.locationId || '').toLowerCase().includes('friday') || (sch.note && sch.note.toLowerCase().includes('friday'));
              // FIX: Allow Holiday Shift to apply on any day (overriding normal logic if needed)
              const isHoliday = (sch.locationId || '').includes('Holiday Shift');

              if (isHoliday) {
                  appliesToday = true;
              } else if (dayOfWeek === 5) {
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
                      const uData = allUsers.find(u => u.id === sch.userId);
                      
                      // Snapshot Name Check
                      const snapshotName = (sch as any).staffName || "";
                      // Check for PP in snapshot name OR note
                      const isPP = ppRegex.test(snapshotName) || ppRegex.test(sch.note || '');
                      
                      // Clean Name
                      let rawName = uData ? (uData.name || uData.email) : snapshotName;
                      let name = rawName.replace(ppRegex, '').trim();

                      const role = uData?.role;
                      
                      const isPresent = presentUserIds.has(sch.userId);
                      
                      let shouldShow = false;
                      if (shiftFilterMode === 'present') {
                          shouldShow = (role === 'doctor') || isPresent;
                      } else {
                          shouldShow = true;
                      }

                      if (shouldShow && !activePeople.some(p => p.name === name)) {
                          activePeople.push({ 
                              name, 
                              // Safe string split for note
                              location: sch.locationId === 'common_duty' && sch.note ? String(sch.note).split('-')[0] : sch.locationId, 
                              time: `${shift.start} - ${shift.end}`,
                              role: role,
                              phone: uData?.phone,
                              isPresent: isPresent,
                              isPP
                          });
                      }
                  }
              });
          }
      });
      setOnShiftNow(activePeople);
  }, [currentSchedules, allUsers, allTodayLogs, shiftFilterMode]);

  // --- ENHANCED HERO LOGIC ---
  const getHeroInfo = () => {
    const s = shiftStatus;
    
    let mode = 'off';
    let title = s.message;
    let subtitle = s.sub;
    let location = 'Hospital';

    if (s.state === 'LOADING') {
        mode = 'off';
        title = 'Loading...';
        subtitle = 'Syncing Status';
    } else if (s.state === 'ON_LEAVE') {
        mode = 'leave';
        location = 'System Update';
    } else if (s.state === 'READY_IN') {
        mode = s.message.includes('LATE') ? 'late' : 'upcoming';
        location = 'Pending Check-in';
    } else if (s.state === 'READY_OUT') {
        mode = 'active';
        location = 'On Duty';
    } else if (s.state === 'LOCKED') {
        mode = 'upcoming';
        location = 'Waiting';
    } else if (s.state === 'COMPLETED') {
        mode = 'complete';
        location = 'Done';
    } else if (s.state === 'MISSED_OUT') {
        mode = 'late'; 
        location = 'Action Required';
    } else if (s.state === 'ABSENT') {
        mode = 'absent';
        location = 'Action Required';
    } else if (s.state === 'WAITING') {
        mode = 'upcoming'; 
        location = 'On Break';
        if (s.timeRemaining) subtitle = `Next shift in ${s.timeRemaining}`;
    } else if (s.state === 'UPCOMING') {
        mode = 'upcoming';
        location = 'Scheduled';
    } else if (s.state === 'OFF') {
        mode = 'off';
        location = 'Off Duty';
    }

    return { mode, title, subtitle, location };
  };

  const heroInfo = getHeroInfo();

  // --- MENU ITEMS WITH GRADIENTS ---
  const menuItems = [
      { 
          id: 'attendance', 
          title: 'تسجيل البصمة', 
          subtitle: 'الحضور والانصراف',
          icon: 'fa-fingerprint', 
          gradient: 'from-emerald-500 to-teal-600', 
          path: '/attendance-punch',
      },
      { 
          id: 'schedule', 
          title: t('user.tab.schedule'), 
          subtitle: 'جدول الورديات',
          icon: 'fa-calendar-alt', 
          gradient: 'from-blue-500 to-indigo-600', 
          path: '/user/schedule',
      },
      { 
          id: 'market', 
          title: t('user.tab.market'), 
          subtitle: 'تغطية وردية (أوفر تايم)',
          icon: 'fa-store', 
          gradient: 'from-amber-400 to-orange-500', 
          path: '/user/market',
          badge: openShiftsCount,
      },
      { 
          id: 'requests', 
          title: 'الطلبات', 
          subtitle: 'إجازة / تبديل',
          icon: 'fa-paper-plane', 
          gradient: 'from-purple-500 to-fuchsia-600', 
          path: '/user/requests',
      },
      { 
          id: 'incoming', 
          title: t('user.tab.incoming'), 
          subtitle: 'الطلبات الواردة',
          icon: 'fa-inbox', 
          gradient: 'from-pink-500 to-rose-600', 
          path: '/user/incoming',
          badge: incomingCount,
      },
      { 
          id: 'history', 
          title: t('user.tab.history'), 
          subtitle: 'الأرشيف والسجل',
          icon: 'fa-history', 
          gradient: 'from-slate-500 to-slate-700', 
          path: '/user/history',
      },
      { 
          id: 'profile', 
          title: t('user.tab.profile'), 
          subtitle: 'ملفي الشخصي',
          icon: 'fa-id-card', 
          gradient: 'from-cyan-500 to-blue-600', 
          path: '/user/profile',
      },
      { 
          id: 'performance', // NEW ITEM
          title: 'أدائي (إحصائيات)', 
          subtitle: 'مؤشرات الأداء',
          icon: 'fa-chart-line', 
          gradient: 'from-violet-500 to-purple-600', 
          path: '/user/performance',
      },
     
      {
          id: 'tasks',
          title: 'المهام',
          subtitle: 'إدارة المهام',
          icon: 'fa-tasks',
          gradient: 'from-lime-500 to-green-600',
          path: '/tasks'
      }
  ];

  // --- ENHANCED HERO STYLING CONFIG ---
  const heroStyles: Record<string, any> = {
    active: {
      gradient: 'bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900',
      blob1: 'bg-emerald-500',
      blob2: 'bg-teal-400',
      accentText: 'text-emerald-400',
      glassBorder: 'border-emerald-500/30',
      iconBg: 'bg-gradient-to-br from-emerald-400 to-teal-500',
      badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
      glow: 'from-emerald-500 to-cyan-500',
      subText: 'text-emerald-200',
      button: 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/50',
      dot: 'bg-emerald-400',
      dotShadow: 'shadow-[0_0_10px_#34d399]'
    },
    late: {
      gradient: 'bg-gradient-to-br from-red-900 via-rose-900 to-slate-900',
      blob1: 'bg-red-600',
      blob2: 'bg-orange-500',
      accentText: 'text-red-400',
      glassBorder: 'border-red-500/30',
      iconBg: 'bg-gradient-to-br from-red-500 to-orange-600',
      badge: 'bg-red-500/20 text-red-200 border-red-500/30',
      glow: 'from-red-500 to-orange-500',
      subText: 'text-red-200',
      button: 'bg-red-500 hover:bg-red-400 text-white shadow-red-500/50',
      dot: 'bg-red-500',
      dotShadow: 'shadow-[0_0_10px_#ef4444]'
    },
    leave: {
      gradient: 'bg-gradient-to-br from-purple-900 via-fuchsia-900 to-slate-900',
      blob1: 'bg-purple-500',
      blob2: 'bg-pink-500',
      accentText: 'text-purple-400',
      glassBorder: 'border-purple-500/30',
      iconBg: 'bg-gradient-to-br from-purple-500 to-pink-500',
      badge: 'bg-purple-500/20 text-purple-200 border-purple-500/30',
      glow: 'from-purple-500 to-pink-500',
      subText: 'text-purple-200',
      button: 'bg-purple-500 hover:bg-purple-400 text-white shadow-purple-500/50',
      dot: 'bg-purple-400',
      dotShadow: 'shadow-[0_0_10px_#c084fc]'
    },
    absent: {
      gradient: 'bg-gradient-to-br from-rose-950 via-red-950 to-slate-950',
      blob1: 'bg-rose-700',
      blob2: 'bg-red-800',
      accentText: 'text-rose-500',
      glassBorder: 'border-rose-500/30',
      iconBg: 'bg-gradient-to-br from-rose-600 to-red-700',
      badge: 'bg-rose-500/20 text-rose-200 border-rose-500/30',
      glow: 'from-rose-600 to-red-900',
      subText: 'text-rose-200',
      button: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/50',
      dot: 'bg-rose-500',
      dotShadow: 'shadow-[0_0_10px_#f43f5e]'
    },
    upcoming: {
      gradient: 'bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900',
      blob1: 'bg-blue-500',
      blob2: 'bg-indigo-500',
      accentText: 'text-blue-400',
      glassBorder: 'border-blue-500/30',
      iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
      badge: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
      glow: 'from-blue-500 to-indigo-500',
      subText: 'text-blue-200',
      button: 'bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/50',
      dot: 'bg-blue-400',
      dotShadow: 'shadow-[0_0_10px_#60a5fa]'
    },
    complete: {
      gradient: 'bg-gradient-to-br from-cyan-900 via-sky-900 to-slate-900',
      blob1: 'bg-cyan-500',
      blob2: 'bg-sky-500',
      accentText: 'text-cyan-400',
      glassBorder: 'border-cyan-500/30',
      iconBg: 'bg-gradient-to-br from-cyan-500 to-sky-600',
      badge: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30',
      glow: 'from-cyan-500 to-sky-500',
      subText: 'text-cyan-200',
      button: 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-cyan-500/50',
      dot: 'bg-cyan-400',
      dotShadow: 'shadow-[0_0_10px_#22d3ee]'
    },
    off: {
      gradient: 'bg-gradient-to-br from-slate-800 via-gray-900 to-black',
      blob1: 'bg-slate-600',
      blob2: 'bg-gray-600',
      accentText: 'text-slate-400',
      glassBorder: 'border-slate-500/30',
      iconBg: 'bg-slate-700 text-white/60',
      badge: 'bg-white/10 border-white/20 text-white/60',
      glow: 'from-slate-500 to-gray-500',
      subText: 'text-slate-400',
      button: 'bg-slate-600 hover:bg-slate-500 text-white shadow-slate-500/50',
      dot: 'bg-slate-500',
      dotShadow: 'shadow-[0_0_10px_#94a3b8]'
    }
  };

  const currentStyle = heroStyles[heroInfo.mode] || heroStyles.off;

  const styles = `
    @keyframes aurora {
      0% { background-position: 50% 50%, 50% 50%; }
      50% { background-position: 100% 0%, 0% 100%; }
      100% { background-position: 50% 50%, 50% 50%; }
    }
    .animate-aurora {
      animation: aurora 20s ease infinite alternate;
      background-size: 200% 200%;
    }
    @keyframes float-icon {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-10px) rotate(5deg); }
    }
    .animate-float-icon {
      animation: float-icon 6s ease-in-out infinite;
    }
    .glass-card {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
    }
  `;

  return (
    <div className="min-h-screen bg-slate-50 font-sans" dir={dir}>
        <style>{styles}</style>
        
        {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

        {/* Announcements Banner */}
     {showAnnouncePopup && announcements.length > 0 && (
            <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
                {/* خلفية معتمة قابلة للنقر للإغلاق */}
                <div 
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
                    onClick={() => setShowAnnouncePopup(false)}
                ></div>
                
                {/* محتوى النافذة المنبثقة */}
                <div className="relative bg-white rounded-[35px] shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up border border-white/20">
                    
                    {/* Header: تدرج لوني جذاب */}
                    <div className="bg-gradient-to-br from-indigo-600 via-blue-700 to-slate-900 p-6 text-white relative">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-lg shadow-inner">
                                <i className="fas fa-bell text-xl animate-ring"></i>
                            </div>
                            <div>
                                <h3 className="text-xl font-black tracking-tight leading-none mb-1">تعميمات إدارية</h3>
                                <p className="text-[10px] text-blue-200 uppercase font-bold tracking-widest opacity-70">Active Announcements</p>
                            </div>
                        </div>
                        {/* زر إغلاق علوي */}
                        <button 
                            onClick={() => setShowAnnouncePopup(false)}
                            className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 hover:bg-white hover:text-slate-900 transition-all"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    {/* قائمة التعميمات مع سكرول داخلي إذا كثرت */}
                    <div className="max-h-[400px] overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {announcements.map((ann, i) => (
                            <div key={i} className="group bg-slate-50 p-5 rounded-[24px] border border-slate-100 hover:border-blue-200 transition-all duration-300">
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[9px] font-black px-3 py-1 rounded-full text-white uppercase tracking-tighter ${
                                        ann.priority === 'critical' ? 'bg-red-500 animate-pulse' : 'bg-blue-600'
                                    }`}>
                                        {ann.priority === 'critical' ? 'عاجل جداً' : 'تعميم'}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-bold bg-white px-2 py-1 rounded-lg shadow-sm">
                                        <i className="far fa-clock mr-1"></i>
                                        {ann.createdAt?.toDate ? ann.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                    </span>
                                </div>
                                <h4 className="font-bold text-slate-800 text-md mb-2 group-hover:text-blue-700 transition-colors">{ann.title}</h4>
                                <p className="text-sm text-slate-600 leading-relaxed font-medium">{ann.content}</p>
                            </div>
                        ))}
                    </div>

                    {/* زر التأكيد السفلي */}
                    <div className="p-6 bg-slate-50/50 border-t border-slate-100 text-center">
                        <button 
                            onClick={() => setShowAnnouncePopup(false)}
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-[0_10px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_15px_25px_rgba(0,0,0,0.2)] active:scale-95 transition-all"
                        >
                            حسناً، تم الاطلاع
                        </button>
                        <p className="mt-3 text-[10px] text-slate-400 font-medium italic">
                            ملاحظة: التعميم يختفي تلقائياً بعد مرور 24 ساعة على نشره
                        </p>
                    </div>
                </div>
            </div>
        )}
        {/* --- MAGICAL HERO SECTION --- */}
        <div className="relative overflow-hidden mb-12 rounded-b-[50px] shadow-2xl transition-all duration-1000 min-h-[480px] flex items-center -mx-4 -mt-4">
            
            {/* Dynamic Animated Background */}
            <div className={`absolute inset-0 transition-colors duration-1000 animate-aurora ${currentStyle.gradient}`}>
                {/* Floating Blobs */}
                <div className={`absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full mix-blend-screen filter blur-[100px] opacity-30 animate-pulse-slow ${currentStyle.blob1}`}></div>
                <div className={`absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full mix-blend-screen filter blur-[100px] opacity-20 animate-pulse-slow delay-1000 ${currentStyle.blob2}`}></div>
                
                {/* Grain Texture Overlay */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay"></div>
            </div>

            <div className="max-w-7xl mx-auto px-6 w-full relative z-10 grid lg:grid-cols-2 gap-16 items-center pt-12 pb-16">
                
                {/* Left Column: Greeting & Info */}
                <div className={`space-y-8 ${dir === 'rtl' ? 'lg:text-right' : 'lg:text-left'} text-center lg:text-left`}>
                    
                    <div className="flex items-center gap-4 justify-center lg:justify-start">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/10 backdrop-blur-md shadow-lg group hover:bg-white/20 transition-all cursor-default">
                            <span className={`w-2.5 h-2.5 rounded-full ${currentStyle.dot} animate-pulse ${currentStyle.dotShadow}`}></span>
                            <span className="text-[11px] font-bold text-white tracking-widest uppercase group-hover:tracking-[0.2em] transition-all">System Online</span>
                        </div>
                        <button 
                            onClick={() => setRefreshTrigger(prev => prev + 1)}
                            className="bg-white/10 hover:bg-white/20 text-white rounded-full w-9 h-9 flex items-center justify-center backdrop-blur-md transition-all border border-white/10 hover:rotate-180 duration-500"
                            title="تحديث البيانات"
                        >
                            <i className="fas fa-sync-alt text-xs"></i>
                        </button>
                    </div>

                    <div>
                        <h2 className={`text-xl font-medium mb-2 tracking-wide ${currentStyle.subText}`}>{t('user.hero.welcome')}</h2>
                        <h1 className="text-6xl lg:text-7xl font-black text-white leading-[0.9] drop-shadow-2xl tracking-tight">
                            {currentUserName.split(' ')[0]}
                            <span className={`text-transparent bg-clip-text bg-gradient-to-tr from-white to-white/50`}>.</span>
                        </h1>
                    </div>

                    <div className={`flex flex-wrap items-center gap-4 ${dir === 'rtl' ? 'justify-center md:justify-start' : 'justify-center md:justify-start'}`}>
                        <div className={`glass-card px-6 py-3 rounded-2xl flex items-center gap-4 transition-all hover:scale-105 cursor-default hover:bg-white/10 ${currentStyle.glassBorder}`}>
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg ${currentStyle.iconBg}`}>
                                <i className="fas fa-id-badge"></i>
                            </div>
                            <div className="text-left">
                                <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider mb-0.5">Role</p>
                                <p className="text-base font-bold text-white capitalize">{t(`role.${currentUserRole}`)}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <a 
                                href="http://192.168.0.8" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white text-white hover:text-blue-600 flex items-center justify-center transition-all backdrop-blur-md border border-white/10 shadow-lg group tooltip-container relative"
                                title="Open IHMS"
                            >
                                <i className="fas fa-desktop text-lg group-hover:scale-110 transition-transform"></i>
                            </a>
                            <a 
                                href="https://chat.whatsapp.com/HO07MVE2Y1c9d9pSFBa8ly" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="w-12 h-12 rounded-2xl bg-[#25D366]/20 hover:bg-[#25D366] text-[#25D366] hover:text-white flex items-center justify-center transition-all backdrop-blur-md border border-[#25D366]/30 shadow-lg group"
                                title="WhatsApp Group"
                            >
                                <i className="fab fa-whatsapp text-xl group-hover:scale-110 transition-transform"></i>
                            </a>
                            <button 
                                onClick={handleGenerateManualCode}
                                disabled={isGenerating}
                                className={`h-12 px-6 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm shadow-lg transition-all flex items-center gap-3 border border-white/10 backdrop-blur-md group`}
                            >
                                {isGenerating ? (
                                    <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                    <i className="fas fa-shield-check text-lg group-hover:rotate-12 transition-transform"></i>
                                )}
                                <span>{generatedCode ? t('update') : t('dash.locationCode')}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Column: The "Glass Card" Status Widget */}
                <div className="flex justify-center lg:justify-end perspective-1000">
                    <div className="relative group w-full max-w-md">
                        {/* Glow behind card */}
                        <div className={`absolute inset-0 bg-gradient-to-r blur-3xl opacity-30 transition-colors duration-1000 rounded-[40px] transform scale-105 group-hover:opacity-50 ${currentStyle.glow}`}></div>

                        <div className={`glass-card w-full p-8 rounded-[40px] relative z-10 transition-all duration-500 transform group-hover:translate-y-[-5px] shadow-2xl backdrop-blur-2xl bg-white/5 ${currentStyle.glassBorder}`}>
                            
                            {/* Top Row: Icon & Status Label */}
                            <div className="flex justify-between items-start mb-10">
                                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-4xl shadow-2xl animate-float-icon ring-4 ring-white/10 ${currentStyle.iconBg}`}>
                                    {heroInfo.mode === 'active' ? <i className="fas fa-bolt"></i> : 
                                     heroInfo.mode === 'late' ? <i className="fas fa-exclamation-triangle"></i> :
                                     heroInfo.mode === 'leave' ? <i className="fas fa-umbrella-beach"></i> :
                                     heroInfo.mode === 'absent' ? <i className="fas fa-user-times"></i> :
                                     heroInfo.mode === 'upcoming' ? <i className="fas fa-hourglass-half"></i> :
                                     <i className="fas fa-moon"></i>}
                                </div>
                                <div className="text-right">
                                    <span className={`inline-block px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border shadow-lg backdrop-blur-md ${currentStyle.badge}`}>
                                        {heroInfo.mode === 'active' ? 'On Duty' : heroInfo.mode}
                                    </span>
                                </div>
                            </div>

                            {/* Middle: Big Title */}
                            <div className="mb-8">
                                <h3 className="text-4xl lg:text-5xl font-black text-white leading-[0.9] mb-2 tracking-tight">{heroInfo.title}</h3>
                                <p className={`text-sm font-bold uppercase tracking-[0.15em] opacity-90 ${currentStyle.subText}`}>
                                    {heroInfo.subtitle}
                                </p>
                            </div>

                            {/* Bottom: Location & Action */}
                            <div className="flex items-center justify-between pt-6 border-t border-white/10">
                                <div className="flex items-center gap-3 text-white/80 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                                    <i className="fas fa-map-marker-alt text-lg text-white"></i>
                                    <span className="text-xs font-bold tracking-wide">{heroInfo.location || 'Unknown'}</span>
                                </div>
                                
                                {heroInfo.mode === 'active' || heroInfo.mode === 'late' ? (
                                    <button onClick={() => navigate('/attendance-punch')} className={`w-14 h-14 rounded-full flex items-center justify-center hover:scale-110 transition-transform animate-pulse group-hover:animate-none ${currentStyle.button}`}>
                                        <i className="fas fa-fingerprint text-2xl"></i>
                                    </button>
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                        <i className="fas fa-check text-white/40"></i>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                </div>

            </div>
        </div>

        {/* --- MAIN MENU GRID --- */}
        <div className="max-w-5xl mx-auto px-4 -mt-16 pb-12 relative z-20">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 animate-fade-in-up">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => navigate(item.path)}
                        className={`group bg-white rounded-[24px] p-5 shadow-lg shadow-slate-200/50 border border-slate-100 flex flex-col items-start justify-between text-right relative overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 h-36 z-10`}
                    >
                        {/* Gradient Mesh bg on hover */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`}></div>
                        
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner mb-3 transition-transform group-hover:scale-110 group-hover:rotate-6 bg-gradient-to-br ${item.gradient} text-white`}>
                            <i className={`fas ${item.icon}`}></i>
                        </div>
                        
                        <div className="relative z-10 w-full">
                            <h3 className="font-bold text-lg text-slate-800 leading-tight group-hover:text-blue-900 transition-colors">{item.title}</h3>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium group-hover:text-slate-600">{item.subtitle}</p>
                        </div>

                        {item.badge ? (
                            <span className="absolute top-4 right-4 w-6 h-6 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow-md animate-bounce">
                                {item.badge}
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>
        </div>

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

{/* --- هذا الجزء يوضع في نهاية الملف قبل إغلاق آخر div --- */}
        {generatedCode && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
                {/* خلفية معتمة تغطي الشاشة بالكامل */}
                <div 
                    className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
                    onClick={() => setGeneratedCode(null)}
                ></div>

                {/* صندوق الكود العائم - عناصر تحت بعض للجوال */}
                <div className="relative w-full max-w-[320px] bg-slate-900 border border-cyan-500/40 rounded-[2.5rem] p-8 flex flex-col items-center shadow-[0_0_50px_rgba(6,182,212,0.2)] animate-in zoom-in-95 duration-200">
                    
                    {/* أيقونة علوية */}
                    <div className="w-20 h-20 rounded-3xl bg-cyan-500/20 flex items-center justify-center mb-6 shadow-inner border border-cyan-500/30">
                        <i className="fas fa-qrcode text-4xl text-cyan-400 animate-pulse"></i>
                    </div>

                    <h3 className="text-white font-black text-xl mb-2 tracking-wide">{t('user.code')}</h3>
                    <p className="text-slate-400 text-xs text-center mb-6 font-medium leading-relaxed">
                        أظهر هذا الكود للمشرف لتأكيد تواجدك في الموقع
                    </p>

                    {/* الكود نفسه */}
                    <div className="w-full bg-black/50 rounded-2xl p-4 border border-cyan-500/20 flex items-center justify-center gap-3 mb-6 group cursor-pointer relative overflow-hidden" 
                         onClick={() => { navigator.clipboard.writeText(generatedCode); setToast({msg: 'تم النسخ', type: 'success'}) }}>
                        
                        <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        
                        <code className="text-cyan-300 font-mono font-bold text-lg tracking-wider break-all text-center line-clamp-1">
                            {generatedCode}
                        </code>
                        <i className="far fa-copy text-slate-500 group-hover:text-cyan-400 transition-colors"></i>
                    </div>

                    <button 
                        onClick={() => setGeneratedCode(null)}
                        className="w-full py-4 rounded-2xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-700 transition-all border border-slate-700 shadow-lg"
                    >
                        {t('close')}
                    </button>
                </div>
            </div>
        )}

    </div>
  );
};

export default UserDashboard;
