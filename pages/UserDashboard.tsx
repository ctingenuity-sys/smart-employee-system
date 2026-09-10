
import React, { useEffect, useState } from 'react';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import { useLanguage, getTranslationKeyForArabic } from '../contexts/LanguageContext';
import { Schedule, Announcement, SwapRequest, OpenShift, User, AttendanceLog, ActionLog, Penalty } from '../types';
import Toast from '../components/Toast';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../contexts/ThemeContext';
import { useAttendanceStatus } from '../hooks/useAttendanceStatus';
import { useDepartment } from '../contexts/DepartmentContext';

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
  const { t, dir, language, toggleLanguage } = useLanguage();
  const { isDark } = useTheme();
  const { selectedDepartmentId, departments } = useDepartment();
  const navigate = useNavigate();
  const currentUserId = auth.currentUser?.uid;
  const shiftStatus = useAttendanceStatus(currentUserId);
  const currentUserName = localStorage.getItem('username') || t('role.user');
  const currentUserRole = localStorage.getItem('role') || 'user';
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
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
  const [pendingPenalties, setPendingPenalties] = useState<Penalty[]>([]);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedPenaltyAction, setSelectedPenaltyAction] = useState<Penalty | null>(null);

  
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
    if (!announcementsLoading && announcements.length > 0) {
      const lastDismissed = localStorage.getItem('announcements_dismissed_at');
      const now = new Date().getTime();
      
      // إذا لم يتم الإغلاق مسبقاً أو مر أكثر من 12 ساعة (12 * 60 * 60 * 1000 ملين ثانية)
      if (!lastDismissed || (now - parseInt(lastDismissed)) > 43200000) {
        setShowAnnouncementsModal(true);
      }
    }
  }, [announcements, announcementsLoading]);

  const closeAnnouncements = () => {
    localStorage.setItem('announcements_dismissed_at', new Date().getTime().toString());
    setShowAnnouncementsModal(false);
  };

  const handlePenaltyAction = async (penaltyId: string, status: 'accepted' | 'rejected') => {
      const penaltyRef = doc(db, 'penalties', penaltyId);
      await updateDoc(penaltyRef, {
          status,
          rejectionReason: status === 'rejected' ? rejectionReason : ''
      });
      setToast({ msg: 'تم تحديث حالة الجزاء بنجاح', type: 'success' });
      setSelectedPenaltyAction(null);
      setRejectionReason('');
  };

  // --- Data Loading ---
  useEffect(() => {
    if (!currentUserId || !selectedDepartmentId) return;

    // 1. Announcements
    setAnnouncementsLoading(true);
    const qAnnounce = query(
        collection(db, 'announcements'), 
        where('isActive', '==', true), 
        where('departmentId', '==', selectedDepartmentId)
    );
    
    const unsubAnnounce = onSnapshot(qAnnounce, (snap: any) => {
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); 
        
        const list = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Announcement)).filter((ann: any) => {
            if (!ann.createdAt) return false;
            const createdDate = ann.createdAt.toDate ? ann.createdAt.toDate() : new Date(ann.createdAt);
            if (createdDate < cutoffTime) return false;
            if (currentUserId && ann.seenBy?.includes(currentUserId)) return false;
            return true;
        });
        setAnnouncements(list);
        setAnnouncementsLoading(false);
    }, (err) => {
        console.error("Announcements error:", err);
        setAnnouncementsLoading(false);
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
        const data = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Schedule));
        setCurrentSchedules(data); // Stores *all* schedules for logic
    });

    // 5. My Logs (Today)
    const todayStr = getLocalDateStr(now);
    const qLogs = query(collection(db, 'attendance_logs'), where('userId', '==', currentUserId), where('date', '==', todayStr));
    const unsubLogs = onSnapshot(qLogs, (snap: any) => {
        setTodayLogs(snap.docs.map((d: any) => d.data()));
    });

    // 5b. All Logs (Today) - For "Who is on shift" widget accuracy
    const qAllLogs = query(collection(db, 'attendance_logs'), where('date', '==', todayStr));
    const unsubAllLogs = onSnapshot(qAllLogs, (snap: any) => {
        setAllTodayLogs(snap.docs.map((d: any) => d.data() as AttendanceLog));
    }, (error) => {
        console.log("Cannot fetch global logs for widget", error);
    });
    
    // 6. Fetch Users for names
    getDocs(collection(db, 'users')).then(snap => {
        const fetchedUsers = snap.docs.map((d: any) => ({ ...d.data() as any, id: d.id } as User));
        setAllUsers(fetchedUsers.filter(u => !['admin', 'supervisor', 'manager'].includes(u.role)));
    });

    // 6.5 Penalties
    const qPenalties = query(collection(db, 'penalties'), where('employeeId', '==', currentUserId), where('status', '==', 'pending'));
    const unsubPenalties = onSnapshot(qPenalties, (snap: any) => {
        setPendingPenalties(snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Penalty)));
    });

    // 7. Calculate Incoming Count (Real-time)
    let unsubSwaps: any;
    let unsubLeavesReliever: any;
    let unsubLeavesSup: any;
    let unsubLeavesMan: any;

    const setupIncomingListeners = () => {
        let swapsCount = 0;
        let relieverCount = 0;
        let supCount = 0;
        let manCount = 0;

        const updateTotal = () => setIncomingCount(swapsCount + relieverCount + supCount + manCount);

        // Swaps
        const qSwaps = query(collection(db, 'swapRequests'), where('to', '==', currentUserId), where('status', '==', 'pending'));
        unsubSwaps = onSnapshot(qSwaps, snap => {
            swapsCount = snap.size;
            updateTotal();
        });
        
        // Leaves (Reliever)
        const qLeavesReliever = query(collection(db, 'leaveRequests'), where('relieverIds', 'array-contains', currentUserId), where('status', '==', 'pending_reliever'));
        unsubLeavesReliever = onSnapshot(qLeavesReliever, snap => {
            let c = 0;
            snap.docs.forEach(d => {
                const data = d.data();
                if (!data.relieverApprovals || !data.relieverApprovals[currentUserId]) {
                    c++;
                }
            });
            relieverCount = c;
            updateTotal();
        });

        // Leaves (Supervisor)
        const qLeavesSup = query(collection(db, 'leaveRequests'), where('supervisorId', '==', currentUserId), where('status', '==', 'pending_supervisor'));
        unsubLeavesSup = onSnapshot(qLeavesSup, snap => {
            supCount = snap.size;
            updateTotal();
        });

        // Leaves (Manager)
        const qLeavesMan = query(collection(db, 'leaveRequests'), where('managerId', '==', currentUserId), where('status', '==', 'pending_manager'));
        unsubLeavesMan = onSnapshot(qLeavesMan, snap => {
            manCount = snap.size;
            updateTotal();
        });
    };
    setupIncomingListeners();

    // NEW: Fetch Actions/Leaves for current user
    // We fetch broader range or all to simplify, or last 30 days
    const qActions = query(collection(db, 'actions'), where('employeeId', '==', currentUserId));
    getDocs(qActions).then((snap: any) => {
        setUserActions(snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as ActionLog)));
    });

    return () => {
        unsubAnnounce();
        unsubLogs();
        unsubAllLogs();
        unsubPenalties();
        if (unsubSwaps) unsubSwaps();
        if (unsubLeavesReliever) unsubLeavesReliever();
        if (unsubLeavesSup) unsubLeavesSup();
        if (unsubLeavesMan) unsubLeavesMan();
    };
  }, [currentUserId, refreshTrigger, selectedDepartmentId]);

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

  // --- ENHANCED HERO LOGIC (BILINGUAL) ---
  const getHeroInfo = () => {
    const s = shiftStatus;
    const isRtl = dir === 'rtl';
    
    let mode = 'off';
    let title = s.message;
    let subtitle = s.sub;
    let location = isRtl ? 'المستشفى العام' : 'General Hospital';

    if (s.state === 'LOADING') {
        mode = 'off';
        title = isRtl ? 'جاري التحميل...' : 'Loading...';
        subtitle = isRtl ? 'مزامنة الحالة والورديات' : 'Syncing Status';
    } else if (s.state === 'ON_LEAVE') {
        mode = 'leave';
        location = s.actionDetails?.reason || (isRtl ? 'إجازة معتمدة' : 'Approved Leave');
        title = s.actionDetails?.title || (isRtl ? 'إجازة رسمية معتمدة' : 'Approved Official Leave');
        subtitle = s.actionDetails?.subtitle || s.actionDetails?.reason || (isRtl ? 'إجازة معتمدة مسجلة بالنظام' : 'Official leave logged in the system');
    } else if (s.state === 'ABSENT') {
        mode = 'absent';
        location = s.actionDetails?.reason || (isRtl ? 'سجل الغياب' : 'Absence Record');
        title = s.actionDetails?.title || (isRtl ? 'غياب غير مسجل' : 'Unexcused Absence');
        subtitle = s.actionDetails?.subtitle || s.actionDetails?.reason || (isRtl ? 'تم قيد حالة غياب في سجل الإجراءات اليومي' : 'Absence recorded in daily log');
    } else if (s.state === 'PERMISSION') {
        mode = 'permission';
        location = s.actionDetails?.reason || (isRtl ? 'إذن مصرح به' : 'Authorized Permission');
        title = s.actionDetails?.title || (isRtl ? 'تصريح إذن ساعي نشط' : 'Hourly Permission Active');
        subtitle = s.actionDetails?.subtitle || (s.actionDetails?.timeFrom ? (isRtl ? `إذن من ${s.actionDetails.timeFrom} إلى ${s.actionDetails.timeTo}` : `Permission from ${s.actionDetails.timeFrom} to ${s.actionDetails.timeTo}`) : (isRtl ? 'تصريح إذن خروج ساعي موثق بالنظام' : 'Authorized hourly exit permission'));
    } else if (s.state === 'MISSION') {
        mode = 'mission';
        location = s.actionDetails?.reason || (isRtl ? 'مأمورية خارج المستشفى' : 'External Mission');
        title = s.actionDetails?.title || (isRtl ? 'مأمورية عمل رسمية' : 'Official Work Mission');
        subtitle = s.actionDetails?.subtitle || s.actionDetails?.reason || (isRtl ? 'مكلف بمهمة عمل رسمية خارج المستشفى' : 'Assigned to official mission outside hospital');
    } else if (s.state === 'SUSPENDED') {
        mode = 'suspended';
        location = s.actionDetails?.reason || (isRtl ? 'إيقاف إداري' : 'Administrative Suspension');
        title = s.actionDetails?.title || (isRtl ? 'إيقاف مؤقت عن العمل' : 'Temporary Suspension');
        subtitle = s.actionDetails?.subtitle || s.actionDetails?.reason || (isRtl ? 'قرار إداري بالإيقاف المؤقت عن العمل' : 'Temporary administrative suspension order');
    } else if (s.state === 'READY_IN') {
        const isLate = s.message && s.message.includes('LATE');
        mode = isLate ? 'late' : 'upcoming';
        location = isRtl ? 'نافذة تسجيل الحضور' : 'Check-in Window';
        if (isRtl) {
            title = isLate ? (s.shiftIdx ? `تسجيل حضور متأخر (وردية ${s.shiftIdx})` : 'تسجيل حضور متأخر') : (s.shiftIdx ? `بدء الوردية ${s.shiftIdx}` : 'تسجيل الحضور متاح');
            subtitle = isLate ? 'تأخرت عن موعد بدء الوردية، سجل بصمتك الآن' : (s.shiftIdx ? `حان موعد تسجيل الحضور للوردية ${s.shiftIdx}` : 'اضغط على زر البصمة لتسجيل الدخول');
        } else {
            title = isLate ? (s.shiftIdx ? `Late Check-In (Shift ${s.shiftIdx})` : 'Late Check-In') : (s.shiftIdx ? `Start Shift ${s.shiftIdx}` : 'Ready to Check In');
            subtitle = isLate ? 'Past shift start time, please punch in now' : (s.shiftIdx ? `Shift ${s.shiftIdx} check-in window is open` : 'Tap biometric button to check in');
        }
    } else if (s.state === 'READY_OUT') {
        mode = 'active';
        location = isRtl ? 'على رأس العمل' : 'On Duty';
        title = isRtl ? (s.shiftIdx ? `إنهاء الوردية ${s.shiftIdx}` : 'تسجيل الانصراف متاح') : (s.shiftIdx ? `End Shift ${s.shiftIdx}` : 'Ready to Check Out');
        subtitle = isRtl ? 'دوامك جاري وموثق داخل النظام، اضغط لتسجيل الانصراف' : 'Your shift is active in the system, tap to check out';
    } else if (s.state === 'LOCKED') {
        mode = 'upcoming';
        location = isRtl ? 'قبل موعد الوردية' : 'Too Early';
        const isDuty = s.message === 'ON DUTY';
        title = isRtl ? (isDuty ? 'على رأس العمل (مغلق)' : 'قبل موعد الوردية') : (isDuty ? 'On Duty (Locked)' : 'Too Early');
        subtitle = s.sub ? (isRtl && s.sub.includes('Unlock in') ? s.sub.replace('Unlock in', 'يفتح الانصراف خلال') : s.sub) : (isRtl ? 'في انتظار فتح نافذة البصمة' : 'Waiting for punch window');
    } else if (s.state === 'COMPLETED') {
        mode = 'complete';
        location = isRtl ? 'تم إنجاز الدوام' : 'Duty Completed';
        title = isRtl ? 'اكتملت الورديات بنجاح' : 'All Shifts Completed';
        subtitle = isRtl ? 'تم تسجيل كافة بصمات الحضور والانصراف المقررة اليوم' : 'All scheduled punches recorded successfully today';
    } else if (s.state === 'MISSED_OUT') {
        mode = 'late'; 
        location = isRtl ? 'مطلوب إجراء' : 'Action Required';
        title = isRtl ? 'فائت بصمة انصراف' : 'Missed Check-Out';
        subtitle = isRtl ? 'انتهت نافذة الانصراف دون تسجيل بصمة خروج' : 'Departure window closed without recorded checkout';
    } else if (s.state === 'WAITING') {
        mode = 'upcoming';
        location = isRtl ? 'استراحة' : 'Break Time';
        title = isRtl ? 'فترة استراحة بين الورديات' : 'Break Between Shifts';
        subtitle = s.timeRemaining ? (isRtl ? `الوردية القادمة تفتح خلال ${s.timeRemaining}` : `Next shift opens in ${s.timeRemaining}`) : (isRtl ? 'في انتظار بداية الوردية التالية' : 'Waiting for next shift window');
    } else if (s.state === 'UPCOMING') {
        mode = 'upcoming';
        location = isRtl ? 'مجدول اليوم' : 'Scheduled Today';
        title = isRtl ? 'الوردية القادمة مجدولة' : 'Upcoming Shift Scheduled';
        subtitle = s.sub || (isRtl ? 'في انتظار بداية وقت الوردية المقررة اليوم' : 'Waiting for scheduled shift to start');
    } else if (s.state === 'OFF') {
        mode = 'off';
        location = isRtl ? 'خارج أوقات العمل' : 'Off Duty';
        title = isRtl ? 'خارج أوقات الدوام الرسمي' : 'Off Duty Today';
        subtitle = isRtl ? 'لا توجد ورديات نشطة أو مجدولة لك اليوم' : 'No active or scheduled shifts for today';
    }

    return { mode, title, subtitle, location };
  };

  const heroInfo = getHeroInfo();

  // --- MENU ITEMS WITH GRADIENTS ---
  const menuItems = [
      { 
          id: 'attendance', 
          title: t('user.dashboard.menu.attendance'), 
          subtitle: t('user.dashboard.menu.attendance.subtitle'),
          icon: 'fa-fingerprint', 
          gradient: 'from-emerald-500 to-teal-600', 
          path: '/attendance-punch',
      },
      { 
          id: 'schedule', 
          title: t('user.tab.schedule'), 
          subtitle: t('user.tab.schedule.subtitle'),
          icon: 'fa-calendar-alt', 
          gradient: 'from-blue-500 to-indigo-600', 
          path: '/user/schedule',
      },
      { 
          id: 'market', 
          title: t('user.tab.market'), 
          subtitle: t('user.tab.market.subtitle'),
          icon: 'fa-store', 
          gradient: 'from-amber-400 to-orange-500', 
          path: '/user/market',
          badge: openShiftsCount,
      },
      { 
          id: 'requests', 
          title: t('user.dashboard.menu.requests'), 
          subtitle: t('user.dashboard.menu.requests.subtitle'),
          icon: 'fa-paper-plane', 
          gradient: 'from-purple-500 to-fuchsia-600', 
          path: '/user/requests',
      },
      { 
          id: 'incoming', 
          title: t('user.tab.incoming'), 
          subtitle: t('user.tab.incoming.subtitle'),
          icon: 'fa-inbox', 
          gradient: 'from-pink-500 to-rose-600', 
          path: '/user/incoming',
          badge: incomingCount,
      },
      { 
          id: 'history', 
          title: t('user.tab.history'), 
          subtitle: t('user.tab.history.subtitle'),
          icon: 'fa-history', 
          gradient: 'from-slate-500 to-slate-700', 
          path: '/user/history',
      },
      { 
          id: 'profile', 
          title: t('user.tab.profile'), 
          subtitle: t('user.dashboard.menu.profile.subtitle'),
          icon: 'fa-id-card', 
          gradient: 'from-cyan-500 to-blue-600', 
          path: '/user/profile',
      },
      { 
          id: 'performance', // NEW ITEM
          title: t('user.dashboard.menu.performance'), 
          subtitle: t('user.dashboard.menu.performance.subtitle'),
          icon: 'fa-chart-line', 
          gradient: 'from-violet-500 to-purple-600', 
          path: '/user/performance',
      },
     
      {
          id: 'tasks',
          title: t('user.dashboard.menu.tasks'),
          subtitle: t('user.dashboard.menu.tasks.subtitle'),
          icon: 'fa-tasks',
          gradient: 'from-lime-500 to-green-600',
          path: '/tasks'
      }
  ];

  // Add Appointments ONLY if ON DUTY (Punched In)
  if (shiftStatus.state === 'READY_OUT' || shiftStatus.state === 'LOCKED') {
      menuItems.splice(1, 0, {
          id: 'appointments',
          title: t('nav.appointments'),
          subtitle: 'إدارة المواعيد',
          icon: 'fa-calendar-check',
          gradient: 'from-cyan-500 to-blue-500',
          path: '/appointments',
          badge: 0
      });
  }

  // --- ENHANCED HERO STYLING CONFIG ---
  const heroStyles: Record<string, any> = {
    active: {
      gradient: 'from-emerald-900/80 via-slate-800 to-slate-900',
      blob1: 'bg-emerald-500/25',
      blob2: 'bg-teal-400/20',
      accentText: 'text-emerald-400',
      glassBorder: 'border-emerald-500/40',
      iconBg: 'bg-gradient-to-br from-emerald-400 to-teal-600 shadow-emerald-500/30 text-slate-950',
      badge: 'bg-emerald-100 text-emerald-950 border-emerald-400 dark:bg-emerald-950/80 dark:text-emerald-100 dark:border-emerald-500/60 shadow-xs font-black',
      glow: 'from-emerald-500/25 to-teal-500/15',
      subText: 'text-emerald-200',
      button: 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 text-slate-950 font-black shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:scale-105',
      beacon: 'bg-emerald-600 dark:bg-emerald-400',
      beaconShadow: 'shadow-[0_0_12px_#34d399]',
      beaconText: t('dash.onDutyBeacon'),
      actionText: t('att.punch.checkOut')
    },
    late: {
      gradient: 'from-amber-900/80 via-slate-800 to-slate-900',
      blob1: 'bg-amber-500/25',
      blob2: 'bg-orange-500/20',
      accentText: 'text-amber-400',
      glassBorder: 'border-amber-500/40',
      iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30 text-slate-950',
      badge: 'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950/80 dark:text-amber-100 dark:border-amber-500/60 shadow-xs font-black',
      glow: 'from-amber-500/25 to-orange-500/15',
      subText: 'text-amber-200',
      button: 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-slate-950 font-black shadow-[0_0_25px_rgba(245,158,11,0.4)] hover:scale-105',
      beacon: 'bg-amber-600 dark:bg-amber-400',
      beaconShadow: 'shadow-[0_0_12px_#fbbf24]',
      beaconText: t('dash.latePunchRequired'),
      actionText: t('att.punch.checkIn')
    },
    leave: {
      gradient: 'from-purple-900/80 via-slate-800 to-slate-900',
      blob1: 'bg-purple-500/25',
      blob2: 'bg-pink-500/20',
      accentText: 'text-purple-400',
      glassBorder: 'border-purple-500/40',
      iconBg: 'bg-gradient-to-br from-purple-500 to-pink-600 shadow-purple-500/30 text-white',
      badge: 'bg-purple-100 text-purple-950 border-purple-400 dark:bg-purple-950/80 dark:text-purple-100 dark:border-purple-500/60 shadow-xs font-black',
      glow: 'from-purple-500/25 to-pink-500/15',
      subText: 'text-purple-200',
      button: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black shadow-[0_0_25px_rgba(168,85,247,0.4)] hover:scale-105',
      beacon: 'bg-purple-600 dark:bg-purple-400',
      beaconShadow: 'shadow-[0_0_12px_#c084fc]',
      beaconText: t('dash.leaveBeacon'),
      actionText: t('user.tab.requests')
    },
    absent: {
      gradient: 'from-rose-900/80 via-slate-800 to-slate-900',
      blob1: 'bg-rose-600/25',
      blob2: 'bg-red-700/20',
      accentText: 'text-rose-400',
      glassBorder: 'border-rose-500/40',
      iconBg: 'bg-gradient-to-br from-rose-600 to-red-700 shadow-rose-500/30 text-white',
      badge: 'bg-rose-100 text-rose-950 border-rose-400 dark:bg-rose-950/80 dark:text-rose-100 dark:border-rose-500/60 shadow-xs font-black',
      glow: 'from-rose-600/25 to-red-600/15',
      subText: 'text-rose-200',
      button: 'bg-gradient-to-r from-rose-600 to-red-600 text-white font-black shadow-[0_0_25px_rgba(244,63,94,0.4)] hover:scale-105',
      beacon: 'bg-rose-600 dark:bg-rose-400',
      beaconShadow: 'shadow-[0_0_12px_#f43f5e]',
      beaconText: t('dash.absentBeacon'),
      actionText: t('att.punch.checkIn')
    },
    permission: {
      gradient: 'from-amber-900/80 via-slate-800 to-slate-900',
      blob1: 'bg-amber-500/25',
      blob2: 'bg-yellow-500/20',
      accentText: 'text-amber-400',
      glassBorder: 'border-amber-500/40',
      iconBg: 'bg-gradient-to-br from-amber-400 to-yellow-600 shadow-amber-500/30 text-slate-950',
      badge: 'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950/80 dark:text-amber-100 dark:border-amber-500/60 shadow-xs font-black',
      glow: 'from-amber-500/25 to-yellow-500/15',
      subText: 'text-amber-200',
      button: 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-slate-950 font-black shadow-[0_0_25px_rgba(245,158,11,0.4)] hover:scale-105',
      beacon: 'bg-amber-600 dark:bg-amber-400',
      beaconShadow: 'shadow-[0_0_12px_#fbbf24]',
      beaconText: t('dash.permissionBeacon'),
      actionText: t('user.tab.requests')
    },
    mission: {
      gradient: 'from-blue-900/80 via-slate-800 to-slate-900',
      blob1: 'bg-blue-500/25',
      blob2: 'bg-cyan-500/20',
      accentText: 'text-blue-400',
      glassBorder: 'border-blue-500/40',
      iconBg: 'bg-gradient-to-br from-blue-400 to-cyan-600 shadow-blue-500/30 text-white',
      badge: 'bg-blue-100 text-blue-950 border-blue-400 dark:bg-blue-950/80 dark:text-blue-100 dark:border-blue-500/60 shadow-xs font-black',
      glow: 'from-blue-500/25 to-cyan-500/15',
      subText: 'text-blue-200',
      button: 'bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500 text-white font-black shadow-[0_0_25px_rgba(59,130,246,0.4)] hover:scale-105',
      beacon: 'bg-blue-600 dark:bg-blue-400',
      beaconShadow: 'shadow-[0_0_12px_#60a5fa]',
      beaconText: t('dash.missionBeacon'),
      actionText: t('att.punch.checkIn')
    },
    suspended: {
      gradient: 'from-red-950 via-slate-850 to-slate-900',
      blob1: 'bg-red-600/30',
      blob2: 'bg-rose-700/20',
      accentText: 'text-red-400',
      glassBorder: 'border-red-500/50',
      iconBg: 'bg-gradient-to-br from-red-600 to-rose-700 shadow-red-500/40 text-white',
      badge: 'bg-red-100 text-red-950 border-red-400 dark:bg-red-950/80 dark:text-red-100 dark:border-red-500/60 shadow-xs font-black',
      glow: 'from-red-600/25 to-rose-600/15',
      subText: 'text-red-200',
      button: 'bg-gradient-to-r from-red-600 to-rose-700 text-white font-black shadow-[0_0_25px_rgba(239,68,68,0.4)] hover:scale-105',
      beacon: 'bg-red-600 dark:bg-red-400',
      beaconShadow: 'shadow-[0_0_12px_#f87171]',
      beaconText: t('dash.suspendedBeacon'),
      actionText: t('user.tab.requests')
    },
    upcoming: {
      gradient: 'from-cyan-900/80 via-slate-800 to-slate-900',
      blob1: 'bg-cyan-500/25',
      blob2: 'bg-blue-600/20',
      accentText: 'text-cyan-400',
      glassBorder: 'border-cyan-500/40',
      iconBg: 'bg-gradient-to-br from-cyan-400 to-blue-600 shadow-cyan-500/30 text-slate-950',
      badge: 'bg-cyan-100 text-cyan-950 border-cyan-400 dark:bg-cyan-950/80 dark:text-cyan-100 dark:border-cyan-500/60 shadow-xs font-black',
      glow: 'from-cyan-500/25 to-blue-500/15',
      subText: 'text-cyan-200',
      button: 'bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-500 text-slate-950 font-black shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:scale-105',
      beacon: 'bg-cyan-600 dark:bg-cyan-400',
      beaconShadow: 'shadow-[0_0_12px_#22d3ee]',
      beaconText: t('dash.upcomingBeacon'),
      actionText: t('att.punch.checkIn')
    },
    complete: {
      gradient: 'from-teal-900/80 via-slate-800 to-slate-900',
      blob1: 'bg-teal-500/25',
      blob2: 'bg-emerald-600/20',
      accentText: 'text-teal-400',
      glassBorder: 'border-teal-500/40',
      iconBg: 'bg-gradient-to-br from-teal-400 to-emerald-600 shadow-teal-500/30 text-slate-950',
      badge: 'bg-teal-100 text-teal-950 border-teal-400 dark:bg-teal-950/80 dark:text-teal-100 dark:border-teal-500/60 shadow-xs font-black',
      glow: 'from-teal-500/25 to-emerald-500/15',
      subText: 'text-teal-200',
      button: 'bg-gradient-to-r from-teal-400 to-emerald-500 text-slate-950 font-black shadow-[0_0_25px_rgba(20,184,166,0.4)] hover:scale-105',
      beacon: 'bg-teal-600 dark:bg-teal-400',
      beaconShadow: 'shadow-[0_0_12px_#2dd4bf]',
      beaconText: t('dash.completeBeacon'),
      actionText: t('dash.punchNow')
    },
    off: {
      gradient: 'from-slate-800 via-slate-850 to-indigo-950/70',
      blob1: 'bg-indigo-600/20',
      blob2: 'bg-slate-600/20',
      accentText: 'text-slate-300',
      glassBorder: 'border-slate-700/80',
      iconBg: 'bg-gradient-to-br from-slate-600 to-slate-700 shadow-slate-900/40 text-white',
      badge: 'bg-slate-200 text-slate-950 border-slate-300 dark:bg-slate-800/90 dark:text-slate-100 dark:border-slate-700 shadow-xs font-black',
      glow: 'from-indigo-500/20 to-slate-500/15',
      subText: 'text-slate-300',
      button: 'bg-white/15 hover:bg-white/25 text-white font-bold border border-white/20 shadow-lg hover:scale-105',
      beacon: 'bg-slate-600 dark:bg-slate-400',
      beaconShadow: 'shadow-[0_0_10px_#94a3b8]',
      beaconText: t('dash.offDutyBeacon'),
      actionText: t('dash.punchNow')
    }
  };

  const currentStyle = heroStyles[heroInfo.mode] || heroStyles.off;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('greeting.morning');
    if (hour < 18) return t('greeting.afternoon');
    return t('greeting.evening');
  };

  const currentUser = allUsers.find(u => u.uid === currentUserId || u.id === currentUserId);
  const currentDepartment = departments?.find(d => d.id === currentUser?.departmentId || d.id === selectedDepartmentId);
  const honorific = currentUser?.gender === 'male' ? (dir === 'rtl' ? 'السيد / ' : 'Mr. ') : currentUser?.gender === 'female' ? (dir === 'rtl' ? 'السيدة / ' : 'Ms. ') : '';

  return (
    <div className={`w-full min-h-screen font-sans relative overflow-x-hidden transition-colors duration-300 ${
        isDark 
            ? 'bg-slate-900 text-slate-100 selection:bg-cyan-500/30' 
            : 'bg-slate-100 text-slate-800 selection:bg-blue-500/20'
    }`} dir={dir}>
        
        {/* Ambient Top Aurora Glow */}
        <div className={`pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[450px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] blur-3xl z-0 transition-opacity duration-500 ${
            isDark 
                ? 'from-blue-700/20 via-cyan-700/10 to-transparent' 
                : 'from-blue-200/40 via-indigo-100/30 to-transparent'
        }`} />

        {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

        {/* --- PENDING PENALTIES MODAL --- */}
        {pendingPenalties.length > 0 && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                <div className={`border rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up transition-colors ${
                    isDark ? 'bg-slate-900 border-red-500/40' : 'bg-white border-red-300'
                }`}>
                    <div className="bg-gradient-to-r from-red-600 to-rose-700 p-5 text-white text-center shadow-lg">
                        <i className="fas fa-exclamation-triangle text-3xl mb-2 animate-bounce"></i>
                        <h2 className="text-xl font-black">{t('user.dashboard.penalties.title')}</h2>
                    </div>
                    <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar-dark space-y-4">
                        {pendingPenalties.map(p => (
                            <div key={p.id} className="bg-white/5 border border-red-500/20 p-4 rounded-2xl">
                                <div className="mb-3">
                                    <p className="text-xs text-white/50 mb-1 font-bold">{t('user.dashboard.penalty.type')}</p>
                                    <p className="font-black text-rose-400 text-base">{
                                        p.penaltyType === '1st Warning' ? t('penalty.1stWarning') :
                                        p.penaltyType === '2nd Warning' ? t('penalty.2ndWarning') :
                                        p.penaltyType === 'Final Warning' ? t('penalty.finalWarning') :
                                        p.penaltyType === 'Deduction' ? `${t('penalty.deduction')} (${p.deductionDays} ${t('penalty.days')})` :
                                        p.penaltyType === 'Suspension' ? `${t('penalty.suspension')} (${p.suspensionDays} ${t('penalty.days')})` :
                                        p.penaltyType === 'Dismissal' ? t('penalty.dismissal') : p.penaltyType
                                    }</p>
                                </div>
                                <div className="mb-3">
                                    <p className="text-xs text-white/50 mb-1 font-bold">{t('user.dashboard.penalty.description')}</p>
                                    <p className="font-medium text-sm text-slate-200">{getTranslationKeyForArabic(p.description) ? t(getTranslationKeyForArabic(p.description)!) : p.description}</p>
                                </div>
                                
                                {selectedPenaltyAction?.id === p.id ? (
                                    <div className="mt-4 bg-slate-950 p-3 rounded-xl border border-red-500/30">
                                        <textarea 
                                            className="w-full p-2.5 bg-slate-900 border border-white/10 rounded-xl mb-3 text-sm text-white focus:ring-2 focus:ring-red-500 outline-none" 
                                            placeholder={t('user.dashboard.penalty.reason.placeholder')} 
                                            value={rejectionReason} 
                                            onChange={(e) => setRejectionReason(e.target.value)} 
                                            rows={3}
                                        />
                                        <div className="flex gap-2">
                                            <button 
                                                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg cursor-pointer" 
                                                onClick={() => handlePenaltyAction(p.id, 'rejected')}
                                                disabled={!rejectionReason.trim()}
                                            >
                                                {t('user.dashboard.penalty.reject.confirm')}
                                            </button>
                                            <button 
                                                className="px-4 py-2.5 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-colors cursor-pointer" 
                                                onClick={() => {
                                                    setSelectedPenaltyAction(null);
                                                    setRejectionReason('');
                                                }}
                                            >
                                                {t('user.dashboard.penalty.cancel')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-3 mt-4">
                                        <button 
                                            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer" 
                                            onClick={() => handlePenaltyAction(p.id, 'accepted')}
                                        >
                                            <i className="fas fa-check"></i> {t('user.dashboard.penalty.accept')}
                                        </button>
                                        <button 
                                            className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer" 
                                            onClick={() => setSelectedPenaltyAction(p)}
                                        >
                                            <i className="fas fa-times"></i> {t('user.dashboard.penalty.reject')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* --- ANNOUNCEMENTS POPUP MODAL --- */}
        {!announcementsLoading && showAnnouncePopup && announcements.length > 0 && (
            <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
                <div 
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl transition-opacity"
                    onClick={() => setShowAnnouncePopup(false)}
                ></div>
                
                <div className={`relative border rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up transition-colors ${
                    isDark ? 'bg-slate-900 border-white/15' : 'bg-white border-slate-200 text-slate-800'
                }`}>
                    <div className="bg-gradient-to-br from-indigo-600 via-blue-700 to-slate-900 p-6 text-white relative">
                        <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-md shadow-inner">
                                <i className="fas fa-bullhorn text-xl text-cyan-300"></i>
                            </div>
                            <div>
                                <h3 className="text-lg font-black tracking-tight leading-none mb-1">تعميمات إدارية هامة</h3>
                                <p className="text-[10px] text-blue-200 uppercase font-mono font-bold opacity-75">Active Bulletins ({announcements.length})</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setShowAnnouncePopup(false)}
                            className="absolute top-6 right-6 rtl:right-auto rtl:left-6 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                        >
                            <i className="fas fa-times text-xs"></i>
                        </button>
                    </div>

                    <div className="max-h-[380px] overflow-y-auto p-5 space-y-3.5 custom-scrollbar-dark">
                        {announcements.map((ann, i) => (
                            <div key={i} className={`p-4 rounded-2xl border transition-all ${
                                isDark ? 'bg-white/5 border-white/10 hover:border-cyan-500/40 text-white' : 'bg-slate-50 border-slate-200 hover:border-blue-400 text-slate-800'
                            }`}>
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full text-white uppercase tracking-wider ${
                                        ann.priority === 'critical' ? 'bg-red-500 animate-pulse' : 'bg-blue-600'
                                    }`}>
                                        {ann.priority === 'critical' ? 'عاجل جداً' : 'تعميم'}
                                    </span>
                                    <span className={`text-[10px] font-mono ${isDark ? 'text-white/50' : 'text-slate-400'}`}>
                                        <i className="far fa-clock mr-1"></i>
                                        {ann.createdAt?.toDate ? ann.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                    </span>
                                </div>
                                <h4 className={`font-bold text-sm mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{ann.title}</h4>
                                <p className={`text-xs leading-relaxed font-normal ${isDark ? 'text-white/70' : 'text-slate-600'}`}>{ann.content}</p>
                            </div>
                        ))}
                    </div>

                    <div className={`p-4 border-t text-center ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                        <button 
                            onClick={async () => {
                                setShowAnnouncePopup(false);
                                try {
                                    const batch = writeBatch(db);
                                    announcements.forEach(ann => {
                                        if (currentUserId && !ann.seenBy?.includes(currentUserId)) {
                                            batch.update(doc(db, 'announcements', ann.id), {
                                                seenBy: arrayUnion(currentUserId)
                                            });
                                        }
                                    });
                                    await batch.commit();
                                } catch (e) {
                                    console.error("Failed to update seenBy", e);
                                }
                            }}
                            className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 rounded-2xl font-black text-xs shadow-lg transition-all cursor-pointer"
                        >
                            حسناً، تم الاطلاع والمتابعة
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- STICKY EXECUTIVE TOP APP BAR --- */}
        <header className={`sticky top-0 z-40 backdrop-blur-2xl transition-colors duration-300 px-3 sm:px-6 py-2.5 sm:py-3 ${
            isDark 
                ? 'bg-slate-900/90 border-b border-slate-800 text-white' 
                : 'bg-white/95 border-b border-slate-200 text-slate-800 shadow-xs'
        }`}>
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                
                {/* Executive Portal Header & Live Status */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 border border-white/20 shrink-0">
                        <i className="fas fa-hospital-user text-sm sm:text-base"></i>
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`text-xs sm:text-sm font-black tracking-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {t('dash.portalTitle')}
                            </span>
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold border ${currentStyle.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${currentStyle.beacon} ${currentStyle.beaconShadow}`} />
                                <span>{currentStyle.beaconText}</span>
                            </span>
                        </div>
                        <p className={`text-[10px] sm:text-[11px] font-medium truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {t('app.name')}
                        </p>
                    </div>
                </div>

                {/* Quick Action Toolbar */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                    
                    {/* Active Announcements Bell */}
                    {announcements.length > 0 && (
                        <button
                            onClick={() => setShowAnnouncePopup(true)}
                            className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-sm ${
                                isDark 
                                    ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300' 
                                    : 'bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-700'
                            }`}
                            title="عرض التعميمات"
                        >
                            <i className="fas fa-bell text-xs sm:text-sm animate-pulse"></i>
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center border-2 border-slate-900 shadow-md">
                                {announcements.length}
                            </span>
                        </button>
                    )}

                    {/* Location Code Button */}
                    <button
                        onClick={handleGenerateManualCode}
                        disabled={isGenerating}
                        className={`w-9 h-9 sm:w-auto sm:px-3.5 sm:h-10 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm text-xs font-bold ${
                            isDark 
                                ? 'bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300' 
                                : 'bg-cyan-50 hover:bg-cyan-100 border border-cyan-300 text-cyan-800'
                        }`}
                        title={t('dash.locationCode')}
                    >
                        {isGenerating ? (
                            <i className="fas fa-spinner fa-spin text-xs"></i>
                        ) : (
                            <i className="fas fa-qrcode text-xs sm:text-sm"></i>
                        )}
                        <span className="hidden sm:inline">{t('dash.locationCode')}</span>
                    </button>

                    {/* WhatsApp Shortcut */}
                    <a
                        href="https://chat.whatsapp.com/HO07MVE2Y1c9d9pSFBa8ly" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-sm ${
                            isDark 
                                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300' 
                                : 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700'
                        }`}
                        title="مجموعة واتساب"
                    >
                        <i className="fab fa-whatsapp text-sm sm:text-base"></i>
                    </a>

                    {/* IHMS External */}
                    <a 
                        href="http://192.168.0.8" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-sm ${
                            isDark 
                                ? 'bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300' 
                                : 'bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700'
                        }`}
                        title="IHMS Portal"
                    >
                        <i className="fas fa-desktop text-xs sm:text-sm"></i>
                    </a>

                    {/* Refresh Trigger */}
                    <button 
                        onClick={() => setRefreshTrigger(prev => prev + 1)}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer active:rotate-180 duration-500 shadow-sm ${
                            isDark 
                                ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white' 
                                : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 hover:text-slate-900'
                        }`}
                        title="تحديث البيانات"
                    >
                        <i className="fas fa-sync-alt text-xs"></i>
                    </button>

                    {/* Theme Switcher */}
                    <ThemeToggle />

                    {/* Language Switcher */}
                    <button
                        onClick={toggleLanguage}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer text-xs font-black shadow-sm ${
                            isDark 
                                ? 'bg-slate-800 hover:bg-slate-750 border border-slate-700 text-cyan-300' 
                                : 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800'
                        }`}
                        title="English / عربي"
                    >
                        {language === 'ar' ? 'EN' : 'عربي'}
                    </button>
                </div>
            </div>
        </header>

        {/* --- MAIN PAGE WRAPPER --- */}
        <main className="w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 pb-28 relative z-10 space-y-4 sm:space-y-6">
            
            {/* 0. PROMINENT EMPLOYEE IDENTITY SHOWCASE CARD */}
            <section className={`rounded-3xl border p-4 sm:p-6 shadow-xl relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors duration-300 ${
                isDark 
                    ? 'bg-gradient-to-r from-slate-800/95 via-slate-850 to-indigo-950/80 border-slate-700/80 text-white' 
                    : 'bg-gradient-to-r from-white via-slate-50 to-indigo-50/70 border-slate-200/90 text-slate-800 shadow-md'
            }`}>
                <div className={`absolute top-0 right-0 w-72 h-72 rounded-full blur-3xl pointer-events-none ${isDark ? 'bg-cyan-500/10' : 'bg-cyan-500/5'}`}></div>
                <div className="flex items-center gap-3.5 sm:gap-5 relative z-10 min-w-0">
                    <div className="relative shrink-0">
                        <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-2xl sm:text-3xl shadow-xl border border-white/20">
                            {currentUserName.charAt(0)}
                        </div>
                        <span className={`absolute -bottom-1 -right-1 rtl:-right-auto rtl:-left-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 sm:border-3 ${isDark ? 'border-slate-850' : 'border-white'} ${currentStyle.beacon} ${currentStyle.beaconShadow}`} />
                    </div>

                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`text-xs sm:text-sm font-black uppercase tracking-wide ${isDark ? 'text-cyan-400' : 'text-blue-600'}`}>
                                {getGreeting()}
                            </span>
                            <span className={`text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                                isDark ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                                {t(`role.${currentUserRole}`) || currentUserRole}
                            </span>
                            {currentDepartment?.name && (
                                <span className={`text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5 border ${
                                    isDark ? 'bg-slate-700/80 text-slate-300 border-slate-600/50' : 'bg-slate-100 text-slate-700 border-slate-300'
                                }`}>
                                    <i className={`fas fa-building text-[9px] ${isDark ? 'text-cyan-400' : 'text-blue-600'}`}></i>
                                    <span>{currentDepartment.name}</span>
                                </span>
                            )}
                        </div>
                        <h1 className={`text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight drop-shadow-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {honorific}{currentUserName}
                        </h1>
                    </div>
                </div>

                {/* Quick Live Clock / Date pill */}
                <div className={`relative z-10 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 w-full sm:w-auto ${
                    isDark ? 'border-slate-700/50' : 'border-slate-200'
                }`}>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-mono shadow-inner ${
                        isDark ? 'bg-slate-900/80 border-slate-700/80 text-cyan-300' : 'bg-white border-slate-300 text-blue-700 shadow-xs'
                    }`}>
                        <i className={`far fa-clock ${isDark ? 'text-cyan-400' : 'text-blue-600'}`}></i>
                        <span>{new Date().toLocaleTimeString(dir === 'rtl' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {new Date().toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </span>
                </div>
            </section>

            {/* 1. COCKPIT HERO STATUS CARD (MOBILE-OPTIMIZED) */}
            <section className={`relative rounded-[2rem] p-5 sm:p-7 md:p-8 border overflow-hidden shadow-2xl transition-all duration-700 ${
                isDark 
                    ? 'bg-slate-850/90 backdrop-blur-2xl border-slate-700/80 text-white' 
                    : 'bg-white backdrop-blur-2xl border-slate-200 text-slate-800 shadow-lg'
            }`}>
                
                {/* Dynamic Aura Gradient Mesh Behind Card */}
                <div className={`absolute inset-0 bg-gradient-to-br ${currentStyle.gradient} ${isDark ? 'opacity-90' : 'opacity-25'} pointer-events-none transition-colors duration-1000`}></div>
                <div className={`absolute -top-24 -left-24 w-72 h-72 rounded-full blur-3xl pointer-events-none ${currentStyle.blob1}`}></div>
                <div className={`absolute -bottom-24 -right-24 w-72 h-72 rounded-full blur-3xl pointer-events-none ${currentStyle.blob2}`}></div>

                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    
                    {/* Left Details Block */}
                    <div className="flex-1 min-w-0 space-y-3">
                        
                        {/* Live Status Beacon Pill */}
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-md ${currentStyle.badge}`}>
                                <span className={`w-2 h-2 rounded-full ${currentStyle.beacon} ${currentStyle.beaconShadow} animate-pulse`} />
                                <span>{currentStyle.beaconText}</span>
                            </span>

                            {hasAttendanceOverride && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-950 border border-amber-400 dark:bg-amber-950/80 dark:text-amber-100 dark:border-amber-500/40 shadow-xs">
                                    <i className="fas fa-shield-alt text-[9px] text-amber-700 dark:text-amber-400"></i>
                                    <span>{t('dash.activeOverride')}</span>
                                </span>
                            )}
                        </div>

                        {/* Duty Main Title & Subtitle */}
                        <div>
                            <h2 className={`text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {heroInfo.title}
                            </h2>
                            <p className={`text-xs sm:text-sm font-medium mt-1 tracking-wide ${isDark ? currentStyle.subText : 'text-slate-600 font-semibold'}`}>
                                {heroInfo.subtitle || (heroInfo.mode === 'active' ? (dir === 'rtl' ? 'دوامك جاري وموثق داخل النظام' : 'Your shift is active in the system') : (dir === 'rtl' ? 'تأكد من تسجيل الحضور في موعد الوردية' : 'Make sure to check in at shift time'))}
                            </p>
                        </div>

                        {/* Location & Department Tag */}
                        <div className={`flex flex-wrap items-center gap-2 text-xs pt-1 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border backdrop-blur-md ${
                                isDark ? 'bg-slate-900/60 border-slate-700/80 text-white/90' : 'bg-slate-100 border-slate-300 text-slate-800'
                            }`}>
                                <i className={`fas fa-map-marker-alt text-xs ${isDark ? 'text-cyan-400' : 'text-blue-600'}`}></i>
                                <span className="font-bold">{heroInfo.location || t('dash.generalHospital')}</span>
                            </div>
                            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border backdrop-blur-md font-mono text-[11px] ${
                                isDark ? 'bg-slate-900/60 border-slate-700/80 text-white/70' : 'bg-slate-100 border-slate-300 text-slate-600'
                            }`}>
                                <i className="far fa-clock opacity-60"></i>
                                <span>{new Date().toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Action: Direct Smart Punch CTA Button */}
                    <div className={`w-full md:w-auto flex md:flex-col items-center justify-between md:justify-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 shrink-0 ${
                        isDark ? 'border-white/10' : 'border-slate-200'
                    }`}>
                        <button
                            onClick={() => navigate('/attendance-punch')}
                            className={`w-full md:w-56 py-3.5 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 cursor-pointer ${currentStyle.button}`}
                        >
                            <div className="w-8 h-8 rounded-xl bg-black/15 flex items-center justify-center text-lg shrink-0">
                                <i className="fas fa-fingerprint"></i>
                            </div>
                            <div className="flex flex-col text-right rtl:text-right ltr:text-left">
                                <span className="text-xs sm:text-sm font-black tracking-tight leading-tight">
                                    {currentStyle.actionText}
                                </span>
                                <span className="text-[9px] opacity-80 uppercase tracking-widest font-mono">
                                    {t('dash.smartBiometric')}
                                </span>
                            </div>
                            <i className="fas fa-arrow-left rtl:rotate-0 rotate-180 text-xs mr-auto rtl:mr-auto rtl:ml-0 ltr:ml-auto ltr:mr-0 opacity-80"></i>
                        </button>
                    </div>

                </div>
            </section>

            {/* 2. LIVE QUICK STATS METRIC CAPSULES (4-COL RESPONSIVE) */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                
                {/* Metric 1: Today Punches */}
                <div 
                    onClick={() => navigate('/attendance-punch')}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 group shadow-md ${
                        isDark 
                            ? 'border-slate-700/80 hover:border-emerald-500/50 bg-slate-800/90 hover:bg-slate-750 text-white' 
                            : 'border-slate-200 hover:border-emerald-500 bg-white hover:bg-slate-50 text-slate-800 hover:shadow-lg'
                    }`}
                >
                    <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center text-lg group-hover:scale-110 transition-transform shrink-0 shadow-inner ${
                        isDark ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    }`}>
                        <i className="fas fa-fingerprint"></i>
                    </div>
                    <div className="min-w-0">
                        <p className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('dash.punchesToday')}</p>
                        <p className={`text-xs sm:text-sm font-black truncate font-mono mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {todayLogs.length > 0 ? `${todayLogs.length} ${todayLogs.length === 1 ? t('dash.singlePunch') : t('dash.pluralPunches')}` : t('dash.noPunchesYet')}
                        </p>
                    </div>
                </div>

                {/* Metric 2: On Shift Staff */}
                <div 
                    onClick={() => setIsShiftWidgetOpen(true)}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 group shadow-md ${
                        isDark 
                            ? 'border-slate-700/80 hover:border-cyan-500/50 bg-slate-800/90 hover:bg-slate-750 text-white' 
                            : 'border-slate-200 hover:border-cyan-500 bg-white hover:bg-slate-50 text-slate-800 hover:shadow-lg'
                    }`}
                >
                    <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center text-lg group-hover:scale-110 transition-transform shrink-0 shadow-inner ${
                        isDark ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400' : 'bg-cyan-50 border-cyan-200 text-cyan-600'
                    }`}>
                        <i className="fas fa-user-clock"></i>
                    </div>
                    <div className="min-w-0">
                        <p className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('dash.activeStaff')}</p>
                        <p className={`text-xs sm:text-sm font-black truncate font-mono mt-0.5 ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>
                            {onShiftNow.length} {t('dash.staffOnline')}
                        </p>
                    </div>
                </div>

                {/* Metric 3: Shift Market */}
                <div 
                    onClick={() => navigate('/user/market')}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 group shadow-md ${
                        isDark 
                            ? 'border-slate-700/80 hover:border-amber-500/50 bg-slate-800/90 hover:bg-slate-750 text-white' 
                            : 'border-slate-200 hover:border-amber-500 bg-white hover:bg-slate-50 text-slate-800 hover:shadow-lg'
                    }`}
                >
                    <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center text-lg group-hover:scale-110 transition-transform shrink-0 shadow-inner ${
                        isDark ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-600'
                    }`}>
                        <i className="fas fa-store"></i>
                    </div>
                    <div className="min-w-0">
                        <p className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('dash.marketShifts')}</p>
                        <p className={`text-xs sm:text-sm font-black truncate font-mono mt-0.5 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                            {openShiftsCount} {t('dash.openAvailable')}
                        </p>
                    </div>
                </div>

                {/* Metric 4: Incoming Requests */}
                <div 
                    onClick={() => navigate('/user/incoming')}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 group shadow-md ${
                        isDark 
                            ? 'border-slate-700/80 hover:border-rose-500/50 bg-slate-800/90 hover:bg-slate-750 text-white' 
                            : 'border-slate-200 hover:border-rose-500 bg-white hover:bg-slate-50 text-slate-800 hover:shadow-lg'
                    }`}
                >
                    <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center text-lg group-hover:scale-110 transition-transform shrink-0 shadow-inner ${
                        isDark ? 'bg-rose-500/20 border-rose-500/30 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-600'
                    }`}>
                        <i className="fas fa-inbox"></i>
                    </div>
                    <div className="min-w-0">
                        <p className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('dash.incomingReqs')}</p>
                        <p className={`text-xs sm:text-sm font-black truncate font-mono mt-0.5 ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>
                            {incomingCount} {t('dash.pendingAction')}
                        </p>
                    </div>
                </div>
            </section>

            {/* 3. APP LAUNCHPAD (BENTO GRID OF MODULES) */}
            <section className="pt-2">
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className={`text-sm sm:text-base font-black uppercase tracking-wider flex items-center gap-2 ${
                        isDark ? 'text-white/90' : 'text-slate-800'
                    }`}>
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]"></span>
                        <span>{t('dash.portalTitle')}</span>
                    </h3>
                    <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {menuItems.length} {t('dash.availableServices')}
                    </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 animate-fade-in-up">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => navigate(item.path)}
                            className={`group relative rounded-3xl p-4 sm:p-5 border transition-all duration-300 flex flex-col items-center justify-center text-center h-44 sm:h-48 overflow-hidden cursor-pointer select-none active:scale-[0.97]
                                ${isDark 
                                    ? 'bg-slate-800/90 hover:bg-slate-750 border-slate-700/80 hover:border-cyan-500/50 shadow-lg hover:shadow-[0_15px_35px_rgba(0,0,0,0.4)]' 
                                    : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-blue-400 shadow-sm hover:shadow-xl'
                                }
                                ${item.id === 'attendance' ? (isDark ? 'ring-2 ring-emerald-500/40 bg-slate-800' : 'ring-2 ring-emerald-500/40 bg-emerald-50/30') : ''}
                            `}
                        >
                            {/* Ambient gradient glow on hover */}
                            <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-15 transition-opacity duration-500 pointer-events-none`} />

                            {/* Badge in top corner */}
                            {item.badge ? (
                                <span className="absolute top-3 right-3 rtl:right-auto rtl:left-3 px-2.5 py-0.5 bg-rose-600 text-white text-[11px] font-black rounded-full border border-rose-400 shadow-md animate-bounce z-20">
                                    {item.badge}
                                </span>
                            ) : (item as any).badgeText ? (
                                <span className="absolute top-3 right-3 rtl:right-auto rtl:left-3 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-500/30 z-20">
                                    {(item as any).badgeText}
                                </span>
                            ) : null}

                            {/* Center Icon - BIGGER AND CENTERED IN THE BOX */}
                            <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl flex items-center justify-center text-3xl sm:text-4xl shadow-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-2 bg-gradient-to-br ${item.gradient} text-white shrink-0 mb-3 relative z-10`}>
                                <i className={`fas ${item.icon}`}></i>
                            </div>

                            {/* Center Title & Subtitle */}
                            <div className="relative z-10 w-full flex flex-col items-center text-center px-1">
                                <h4 className={`font-black text-sm sm:text-base leading-snug text-center transition-colors ${
                                    isDark ? 'text-white group-hover:text-cyan-200' : 'text-slate-800 group-hover:text-blue-600'
                                }`}>
                                    {item.title}
                                </h4>
                                <p className={`text-[11px] sm:text-xs mt-1 font-medium text-center line-clamp-1 transition-colors ${
                                    isDark ? 'text-slate-300/80 group-hover:text-white' : 'text-slate-500 group-hover:text-slate-800'
                                }`}>
                                    {item.subtitle}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </section>

        </main>

        {/* --- 4. FLOATING / SLIDING "WHO'S ON SHIFT" WIDGET --- */}
        {/* Placed opposite to the sidebar: in RTL (sidebar on right) -> place on LEFT; in LTR (sidebar on left) -> place on RIGHT */}
        <div className={`fixed bottom-4 ${dir === 'rtl' ? 'left-3 sm:left-5' : 'right-3 sm:right-5'} z-[10010] transition-all duration-300 ${onShiftNow.length > 0 || isShiftWidgetOpen ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
            <div className={`backdrop-blur-2xl transition-all duration-300 overflow-hidden ${
                isDark 
                    ? 'bg-slate-900/95 shadow-[0_15px_35px_rgba(0,0,0,0.85)] border border-white/15' 
                    : 'bg-white/95 shadow-[0_15px_35px_rgba(0,0,0,0.15)] border border-slate-300'
            } ${isShiftWidgetOpen ? 'rounded-2xl w-[calc(100vw-24px)] sm:w-72 max-w-[280px]' : 'rounded-full hover:scale-105'}`}>
                
                {/* Header Bar / Capsule Toggle */}
                <div 
                    onClick={() => setIsShiftWidgetOpen(!isShiftWidgetOpen)}
                    className={`cursor-pointer flex items-center justify-between select-none ${
                        isShiftWidgetOpen 
                            ? (isDark ? 'p-2.5 bg-slate-950/80 border-b border-white/10' : 'p-2.5 bg-slate-100 border-b border-slate-200') 
                            : (isDark ? 'px-3.5 py-2 bg-slate-900 border border-white/20 text-white shadow-xl' : 'px-3.5 py-2 bg-white border border-slate-300 text-slate-800 shadow-xl')
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                        </span>
                        <h4 className={`font-black text-xs uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {t('dash.onShift')}
                        </h4>
                    </div>
                    
                    {isShiftWidgetOpen ? (
                        <i className={`fas fa-chevron-down text-[10px] ${isDark ? 'text-white/50' : 'text-slate-400'}`}></i>
                    ) : (
                        <span className="ml-2 rtl:ml-0 rtl:mr-2 text-[10px] font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                            {onShiftNow.length}
                        </span>
                    )}
                </div>
                
                {/* Expanded Drawer Content */}
                {isShiftWidgetOpen && (
                    <div className="flex flex-col">
                        
                        {/* Filter Toggle */}
                        <div className={`flex p-1.5 border-b gap-1 ${isDark ? 'bg-slate-950/50 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShiftFilterMode('present'); }} 
                                className={`flex-1 py-1 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${
                                    shiftFilterMode === 'present' 
                                        ? 'bg-emerald-500 text-slate-950 font-black shadow-xs' 
                                        : (isDark ? 'text-white/60 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60')
                                }`}
                            >
                                <i className="fas fa-check-circle mr-0.5"></i> {t('dash.filterActive')}
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShiftFilterMode('all'); }} 
                                className={`flex-1 py-1 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${
                                    shiftFilterMode === 'all' 
                                        ? 'bg-cyan-500 text-slate-950 font-black shadow-xs' 
                                        : (isDark ? 'text-white/60 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60')
                                }`}
                            >
                                <i className="fas fa-list mr-0.5"></i> {t('dash.filterAll')}
                            </button>
                        </div>

                        {/* Staff List */}
                        <div className="space-y-1 max-h-[220px] overflow-y-auto custom-scrollbar-dark p-2">
                            {onShiftNow.length === 0 ? (
                                <div className={`text-center py-4 text-[11px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
                                    <i className="far fa-user-slash text-base mb-1 block opacity-40"></i>
                                    {t('dash.noActiveStaff')}
                                </div>
                            ) : (
                                onShiftNow.map((p, i) => (
                                    <div key={i} className={`flex items-center justify-between p-2 rounded-xl transition-colors border ${
                                        p.role === 'doctor' 
                                            ? (isDark ? 'bg-cyan-950/30 border-cyan-500/30' : 'bg-cyan-50 border-cyan-200') 
                                            : (isDark ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100')
                                    }`}>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1">
                                                {p.role !== 'doctor' && (
                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.isPresent ? 'bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse' : (isDark ? 'bg-white/30' : 'bg-slate-300')}`}></div>
                                                )}
                                                <span className={`font-bold text-[11px] truncate max-w-[110px] ${
                                                    p.role === 'doctor' 
                                                        ? (isDark ? 'text-cyan-200' : 'text-cyan-800') 
                                                        : (isDark ? 'text-white' : 'text-slate-900')
                                                }`}>
                                                    {p.name}
                                                </span>
                                                {p.role === 'doctor' && <i className="fas fa-user-md text-[9px] text-cyan-400 shrink-0"></i>}
                                                {p.isPP && (
                                                    <span className="shrink-0 text-[7px] bg-amber-400 text-black px-1 rounded font-black border border-amber-600" title="Portable & Procedure">
                                                        PP
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`text-[9px] block truncate max-w-[130px] pl-2 rtl:pl-0 rtl:pr-2 mt-0.5 ${isDark ? 'text-white/40' : 'text-slate-500'}`}>{p.location}</span>
                                        </div>

                                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${isDark ? 'bg-black/40 text-white/70' : 'bg-slate-200 text-slate-700'}`}>
                                                {p.time}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {p.role !== 'doctor' && (
                                                    p.isPresent ? (
                                                        <span className="text-[7px] font-bold text-emerald-300 bg-emerald-500/20 px-1 py-0.2 rounded border border-emerald-500/30 flex items-center gap-0.5">
                                                            <i className="fas fa-check text-[6px]"></i> {t('status.in')}
                                                        </span>
                                                    ) : (
                                                        <span className={`text-[7px] font-bold px-1 py-0.2 rounded border ${
                                                            isDark ? 'text-white/40 bg-white/5 border-white/10' : 'text-slate-500 bg-slate-100 border-slate-300'
                                                        }`}>
                                                            {t('status.notyet')}
                                                        </span>
                                                    )
                                                )}
                                                {p.phone && (
                                                    <a 
                                                        href={`tel:${p.phone}`}
                                                        className="w-4 h-4 flex items-center justify-center rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40 border border-emerald-500/30 transition-colors cursor-pointer"
                                                        title={t('dash.call')}
                                                    >
                                                        <i className="fas fa-phone text-[8px]"></i>
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

        {/* --- 5. LOCATION CODE GENERATED MODAL --- */}
        {generatedCode && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
                <div 
                    className={`absolute inset-0 backdrop-blur-2xl ${isDark ? 'bg-slate-950/90' : 'bg-slate-900/60'}`}
                    onClick={() => setGeneratedCode(null)}
                ></div>

                <div className={`relative w-full max-w-[340px] border rounded-[2.5rem] p-7 flex flex-col items-center animate-in zoom-in-95 duration-200 ${
                    isDark 
                        ? 'bg-slate-900 border-cyan-500/40 shadow-[0_0_60px_rgba(6,182,212,0.25)]' 
                        : 'bg-white border-slate-300 shadow-2xl'
                }`}>
                    
                    <div className={`w-18 h-18 rounded-3xl flex items-center justify-center mb-5 shadow-inner border ${
                        isDark ? 'bg-cyan-500/15 border-cyan-500/30' : 'bg-blue-50 border-blue-200'
                    }`}>
                        <i className={`fas fa-qrcode text-4xl animate-pulse ${isDark ? 'text-cyan-400' : 'text-blue-600'}`}></i>
                    </div>

                    <h3 className={`font-black text-xl mb-1.5 tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{t('user.code')}</h3>
                    <p className={`text-xs text-center mb-5 font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        أظهر هذا الكود للمشرف لتأكيد تواجدك الجغرافي بالقسم
                    </p>

                    <div 
                        className={`w-full rounded-2xl p-4 border flex items-center justify-between gap-2 mb-5 group cursor-pointer relative overflow-hidden ${
                            isDark ? 'bg-black/60 border-cyan-500/30' : 'bg-slate-100 border-slate-300'
                        }`} 
                        onClick={() => { 
                            navigator.clipboard.writeText(generatedCode); 
                            setToast({msg: 'تم نسخ الكود بنجاح', type: 'success'}); 
                        }}
                    >
                        <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <code className={`font-mono font-bold text-base tracking-wider break-all line-clamp-1 ${isDark ? 'text-cyan-300' : 'text-blue-700'}`}>
                            {generatedCode}
                        </code>
                        <i className={`far fa-copy text-sm shrink-0 ${isDark ? 'text-white/50 group-hover:text-cyan-400' : 'text-slate-500 group-hover:text-blue-600'}`}></i>
                    </div>

                    <button 
                        onClick={() => setGeneratedCode(null)}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs shadow-lg transition-all cursor-pointer"
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
