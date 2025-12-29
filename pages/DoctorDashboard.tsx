
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { db, auth } from '../firebase';
import { Schedule, User, SwapRequest, LeaveRequest, Location, Announcement, OpenShift, ActionLog, PeerRecognition, AttendanceLog } from '../types';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import { useLanguage } from '../contexts/LanguageContext';

// @ts-ignore
import { collection, getDocs, addDoc, onSnapshot, query, where, doc, updateDoc, Timestamp, orderBy, limit } from 'firebase/firestore';

interface SwapRequestWithUser extends SwapRequest {
  id: string;
  fromUser: { id: string, name: string };
}
interface LeaveRequestWithId extends LeaveRequest {
  id: string;
}
interface LocationData extends Location {
  id: string;
}

interface DisplaySwapItem extends SwapRequest {
  id: string;
  otherUserName: string;
  isOutgoing: boolean;
}

interface UnifiedHistoryItem {
  id: string;
  rawType: 'swap' | 'leave';
  displayType: string;
  date: string;
  details: string;
  status: string;
  createdAt: any;
  isOutgoing?: boolean; 
}

const convertTo24Hour = (timeStr: string): string | null => {
    if (!timeStr) return null;
    let s = timeStr.toLowerCase().trim();
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
        if (trimmed.toLowerCase().includes('starting')) return;

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

const SHIFT_DESCRIPTIONS: Record<string, string> = {
    'Straight Morning': '9am-5pm\nXRAYS + USG',
    'Straight Evening': '5pm-1am\nXRAYS + USG',
    'Night Shift': '(SAT-THUR) (1am-9am)\n(FRIDAY 9pm-9am)',
    'Broken 1 (CT/MRI)': '9am-1pm & 5pm-9pm',
    'Broken 2 (Xray)': '9am-1pm & 5pm-9pm',
    'Broken 1': '9am-1pm & 5pm-9pm',
    'Broken 2': '9am-1pm & 5pm-9pm'
};

const formatTime12 = (time24: string) => {
  if (!time24) return '';
  if (time24 === '00:00' || time24 === '24:00') return '12:00 AM'; 
  try {
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr);
    const m = mStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${m} ${ampm}`;
  } catch (e) {
    return time24;
  }
};

const padTime = (time: string) => {
  if (!time) return '00:00';
  const [h, m] = time.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
};

const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const PersonalNotepad: React.FC = () => {
    const [note, setNote] = useState('');
    useEffect(() => {
        const saved = localStorage.getItem('dr_personal_note');
        if (saved) setNote(saved);
    }, []);
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setNote(val);
        localStorage.setItem('dr_personal_note', val);
    };
    return (
        <div className="bg-yellow-50 rounded-2xl p-4 shadow-inner border border-yellow-200 relative group h-full transition-all animate-fade-in-down">
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-yellow-800 text-sm flex items-center gap-2"><i className="fas fa-sticky-note"></i> Personal Notes</h4>
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
            </div>
            <textarea className="w-full bg-transparent border-none resize-none text-sm text-slate-700 focus:ring-0 min-h-[100px] font-medium leading-relaxed placeholder-yellow-300/50" placeholder="Write private reminders here... (Auto-saved)" value={note} onChange={handleChange} />
        </div>
    );
};

// Expanded Regex
const ppRegex = /(?:\(|\[|\{)\s*pp\s*(?:\)|\]|\})|(?:\bPP\b)/i;

const DoctorDashboard: React.FC = () => {
  const { t, dir } = useLanguage();
  
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [activeTab, setActiveTab] = useState('schedule');

  const [incomingSwaps, setIncomingSwaps] = useState<SwapRequestWithUser[]>([]);
  const [sentHistory, setSentHistory] = useState<DisplaySwapItem[]>([]);
  const [receivedHistory, setReceivedHistory] = useState<DisplaySwapItem[]>([]);
  const [leaveHistory, setLeaveHistory] = useState<LeaveRequestWithId[]>([]);

  const [histFilterType, setHistFilterType] = useState<'all' | 'swap' | 'leave'>('all');
  const [histFilterStatus, setHistFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [histFilterMonth, setHistFilterMonth] = useState('');

  const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error', duration?: number} | null>(null);
  const isFirstLoad = useRef(true);

  const [targetUser, setTargetUser] = useState('');
  const [swapType, setSwapType] = useState('day');
  const [swapDate, setSwapDate] = useState('');
  const [swapDetails, setSwapDetails] = useState('');

  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');

  const [onShiftNow, setOnShiftNow] = useState<{name: string, location: string, time: string, phone?: string, role?: string, isPP: boolean, isPresent: boolean}[]>([]);
  const [currentSchedules, setCurrentSchedules] = useState<Schedule[]>([]);
  const [todayAbsences, setTodayAbsences] = useState<Set<string>>(new Set());
  const [isShiftWidgetOpen, setIsShiftWidgetOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [shiftFilterMode, setShiftFilterMode] = useState<'present' | 'all'>('present');
  
  // NEW: State for all logs today
  const [allTodayLogs, setAllTodayLogs] = useState<AttendanceLog[]>([]);

  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false, title: '', message: '', onConfirm: () => {}
  });

  const currentUserId = auth.currentUser?.uid;
  const currentUserName = localStorage.getItem('username') || 'Doctor';

    // ... (filteredHistory memo remains same) ...
    const filteredHistory = useMemo(() => {
    const swaps: UnifiedHistoryItem[] = [...sentHistory, ...receivedHistory].map(s => ({ id: s.id, rawType: 'swap', displayType: s.type, date: s.startDate || '', details: `${s.isOutgoing ? t('user.req.to') : t('user.req.from')}: ${s.otherUserName} ${s.details ? `(${s.details})` : ''}`, status: s.status, createdAt: s.createdAt, isOutgoing: s.isOutgoing }));
    const leaves: UnifiedHistoryItem[] = leaveHistory.map(l => ({ id: l.id, rawType: 'leave', displayType: 'Leave', date: `${l.startDate} > ${l.endDate}`, details: l.reason, status: l.status, createdAt: l.createdAt }));
    let combined = [...swaps, ...leaves];
    combined.sort((a, b) => { const ta = a.createdAt?.seconds || 0; const tb = b.createdAt?.seconds || 0; return tb - ta; });
    return combined.filter(item => {
      if (histFilterType !== 'all' && item.rawType !== histFilterType) return false;
      if (histFilterStatus !== 'all') {
        const s = (item.status || '').toLowerCase();
        if (histFilterStatus === 'approved' && !s.includes('approved')) return false;
        if (histFilterStatus === 'rejected' && !s.includes('rejected')) return false;
        if (histFilterStatus === 'pending' && s !== 'pending' && s !== 'approvedbyuser') return false;
      }
      if (histFilterMonth && !item.date.startsWith(histFilterMonth)) return false;
      return true;
    });
  }, [sentHistory, receivedHistory, leaveHistory, histFilterType, histFilterStatus, histFilterMonth, t]);

  useEffect(() => {
    // ... (Initial Data loading - users, locations, announcements) ...
    setLoading(true);
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
        const userList = snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
        setUsers(userList);
    });
    const unsubLocs = onSnapshot(collection(db, 'locations'), (snap) => {
        setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as LocationData)));
    });
    const qAnnounce = query(collection(db, 'announcements'), where('isActive', '==', true));
    const unsubAnnounce = onSnapshot(qAnnounce, (snap) => {
      const now = new Date();
      const cutoffTime = new Date(now.getTime() - 48 * 60 * 60 * 1000); 
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Announcement))
        .filter(ann => {
          if (!ann.createdAt) return false;
          const createdDate = ann.createdAt.toDate ? ann.createdAt.toDate() : new Date(ann.createdAt);
          return createdDate >= cutoffTime;
        });
      list.sort((a, b) => { const ta = a.createdAt?.seconds || 0; const tb = b.createdAt?.seconds || 0; return tb - ta; });
      setAnnouncements(list);
    });
    return () => { unsubUsers(); unsubLocs(); unsubAnnounce(); };
  }, []);

  // ... (Schedules loading useEffect) ...
  useEffect(() => {
    if (!currentUserId) return;
    setLoading(true);
    const q = query(
      collection(db, 'schedules'),
      where('userId', '==', currentUserId),
      where('month', '==', selectedMonth)
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Schedule));
      data.sort((a, b) => {
        const aIsSwap = a.locationId === 'Swap' || (a.note && a.note.startsWith('Swap'));
        const bIsSwap = b.locationId === 'Swap' || (b.note && b.note.startsWith('Swap'));
        if (aIsSwap && !bIsSwap) return -1;
        if (!aIsSwap && bIsSwap) return 1;
        const getTimestamp = (item: Schedule) => {
            if (item.date) return new Date(item.date).getTime();
            if (item.validFrom) return new Date(item.validFrom).getTime();
            return 8640000000000000;
        };
        return getTimestamp(a) - getTimestamp(b);
      });
      setSchedules(data);
      setLoading(false);
    });
    return () => { unsub(); };
  }, [selectedMonth, currentUserId]);

  const getUserName = useCallback((userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? (user.name || user.email) : 'Unknown';
  }, [users]);

  const getLocationName = useCallback((sch: Schedule) => {
    if (sch.locationId === 'common_duty' && sch.note) {
        return sch.note.split(' - ')[0]; 
    }
    const loc = locations.find(l => l.id === sch.locationId);
    return loc ? loc.name : (sch.locationId === 'common_duty' ? 'Common Duty' : sch.locationId);
  }, [locations]);

  // ... (Requests loading useEffects) ...
  useEffect(() => {
    if (!currentUserId) return;
    const qIncoming = query(collection(db, 'swapRequests'), where('to', '==', currentUserId), where('status', '==', 'pending'));
    const unsubIncoming = onSnapshot(qIncoming, (snap) => {
      const reqs = snap.docs.map(d => {
        const data = d.data() as SwapRequest;
        return { id: d.id, ...data, fromUser: { id: data.from, name: getUserName(data.from) } };
      });
      setIncomingSwaps(reqs);
    });
    const qSent = query(collection(db, 'swapRequests'), where('from', '==', currentUserId));
    const unsubSent = onSnapshot(qSent, (snap) => {
      const list = snap.docs.map(d => { const data = d.data() as SwapRequest; return { id: d.id, ...data, isOutgoing: true, otherUserName: getUserName(data.to) }; });
      setSentHistory(list);
    });
    const qReceived = query(collection(db, 'swapRequests'), where('to', '==', currentUserId));
    const unsubReceived = onSnapshot(qReceived, (snap) => {
      const list = snap.docs.filter(d => d.data().status !== 'pending').map(d => { const data = d.data() as SwapRequest; return { id: d.id, ...data, isOutgoing: false, otherUserName: getUserName(data.from) }; });
      setReceivedHistory(list);
    });
    const qLeaves = query(collection(db, 'leaveRequests'), where('from', '==', currentUserId));
    const unsubLeaves = onSnapshot(qLeaves, (snap) => {
      setLeaveHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequestWithId)).reverse());
    });
    return () => { unsubIncoming(); unsubSent(); unsubReceived(); unsubLeaves(); };
  }, [currentUserId, users]);

  useEffect(() => {
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const currentDayStr = getLocalDateStr(now);
      const qActions = query(collection(db, 'actions'), where('toDate', '>=', currentDayStr));
      const unsubActions = onSnapshot(qActions, (snap) => {
          const absentIds = new Set<string>();
          snap.docs.forEach(doc => {
              const data = doc.data() as ActionLog;
              if (data.fromDate <= currentDayStr) {
                  if (['annual_leave', 'sick_leave', 'unjustified_absence', 'justified_absence'].includes(data.type)) { absentIds.add(data.employeeId); }
              }
          });
          setTodayAbsences(absentIds);
      });
      const qSchedule = query(collection(db, 'schedules'), where('month', '==', currentMonth));
      const unsubSchedule = onSnapshot(qSchedule, (snap) => {
          setCurrentSchedules(snap.docs.map(d => d.data() as Schedule));
      });
      
      // NEW: Fetch ALL Logs for Today for "On Shift" Widget
      const qAllLogs = query(collection(db, 'attendance_logs'), where('date', '==', currentDayStr));
      const unsubAllLogs = onSnapshot(qAllLogs, (snap) => {
          setAllTodayLogs(snap.docs.map(d => d.data() as AttendanceLog));
      });

      return () => { unsubActions(); unsubSchedule(); unsubAllLogs(); };
  }, []);

  // Updated On Shift Logic
  useEffect(() => {
      const now = new Date();
      const currentDayStr = getLocalDateStr(now);
      const activePeople: any[] = [];
      const dayOfWeek = now.getDay(); 
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
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

      // Determine Present Users (Logic similar to other dashboards)
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

      currentSchedules.forEach(sch => {
          if (todayAbsences.has(sch.userId)) return;
          
          let appliesToday = false;
          // ** LOGIC UPDATE: Better night shift detection for today **
          if (sch.date === currentDayStr) {
              appliesToday = true;
          } else if (!sch.date) {
              // Recurring
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
                  // Cross midnight
                  if (endM < startM) endM += 1440;

                  // Normalize current minutes if shift crosses midnight and we are in early morning
                  let adjustedCurrentMinutes = currentMinutes;
                  if (endM > 1440 && currentMinutes < endM - 1440) {
                      adjustedCurrentMinutes += 1440;
                  }

                  if (adjustedCurrentMinutes >= startM && adjustedCurrentMinutes < endM) {
                      const uData = users.find(u => u.id === sch.userId);
                      
                      // Snapshot Name Check
                      const snapshotName = (sch as any).staffName || "";
                      // Check for PP in snapshot name OR note
                      const isPP = ppRegex.test(snapshotName) || ppRegex.test(sch.note || '');
                      
                      // Clean Name
                      let rawName = uData ? (uData.name || uData.email) : snapshotName;
                      let name = rawName.replace(ppRegex, '').trim();

                      const role = uData ? uData.role : "user";
                      const isPresent = presentUserIds.has(sch.userId);

                      let shouldShow = false;
                      if (shiftFilterMode === 'present') {
                          shouldShow = (role === 'doctor') || isPresent;
                      } else {
                          shouldShow = true;
                      }

                      if (shouldShow) {
                        activePeople.push({ 
                            name, 
                            location: getLocationName(sch), 
                            time: `${formatTime12(shift.start)} - ${formatTime12(shift.end)}`, 
                            phone: uData?.phone, 
                            role,
                            isPP,
                            isPresent // Pass presence status
                        });
                      }
                  }
              });
          }
      });
      const unique = activePeople.filter((v,i,a)=>a.findIndex(t=>(t.name===v.name))===i);
      setOnShiftNow(unique);
  }, [currentSchedules, todayAbsences, users, locations, allTodayLogs, shiftFilterMode]);

  // --- SMART HERO LOGIC: OVERLAP RESOLUTION ---
  const getHeroInfo = () => {
    const now = new Date();
    const activeLeave = leaveHistory.find(l => { if(l.status !== 'approved') return false; const start = new Date(l.startDate); const end = new Date(l.endDate); start.setHours(0,0,0,0); end.setHours(23,59,59,999); return now >= start && now <= end; });
    if (activeLeave) { return { mode: 'leave', title: t('user.hero.leave'), subtitle: 'Enjoy!', location: 'Holiday', dateObj: now }; }
    
    // Dates for checking
    const todayDateStr = getLocalDateStr(now);
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    
    const flatShifts: any[] = [];

    schedules.forEach(sch => {
        const locationId = (sch.locationId || '').toLowerCase();
        const note = (sch.note || '').toLowerCase();
        const isFridayShift = locationId.includes('friday') || note.includes('friday');
        const isNightShift = note.includes('night') || locationId.includes('night');
        
        let effectiveShifts = sch.shifts;
        if (!effectiveShifts || effectiveShifts.length === 0) {
             const parsed = parseMultiShifts(sch.note || "");
             if (parsed.length > 0) effectiveShifts = parsed;
             else effectiveShifts = [{start: '08:00', end: '16:00'}];
        }

        // Process Yesterday, Today, Tomorrow
        [yesterday, now, tomorrow].forEach(checkDate => {
            const dateStr = getLocalDateStr(checkDate);
            const dayOfWeek = checkDate.getDay(); 
            
            let applies = false;
            
            if (sch.date) {
                if (sch.date === dateStr) applies = true;
            } else {
                const hasSpecific = schedules.some(s => s.date === dateStr);
                if (!hasSpecific) {
                    if (isFridayShift) { if (dayOfWeek === 5) applies = true; }
                    else { applies = true; } // Standard applies all days
                    
                    if (sch.validFrom && dateStr < sch.validFrom) applies = false;
                    if (sch.validTo && dateStr > sch.validTo) applies = false;
                }
            }

            if (applies) {
                effectiveShifts.forEach(s => {
                    const startStr = `${dateStr}T${padTime(s.start)}`;
                    const startD = new Date(startStr);
                    let endD = new Date(`${dateStr}T${padTime(s.end)}`);
                    
                    // --- KEY FIX: HANDLING LATE NIGHT SHIFTS (e.g., 1AM - 9AM) ---
                    // If a shift starts between 00:00 and 11:00 AM, and it's a "Night Shift", 
                    // it implies it starts the NEXT day relative to the schedule row date.
                    // E.g., Thursday Night Schedule = Starts Thursday night OR Friday morning 1AM.
                    
                    const startH = parseInt(s.start.split(':')[0]);
                    
                    if (isNightShift && startH < 12) {
                        // This shift block actually starts the next day
                        startD.setDate(startD.getDate() + 1);
                        endD.setDate(endD.getDate() + 1);
                    }

                    // Handle standard crossing midnight
                    if (endD <= startD && !(s.start === '00:00' && s.end === '00:00')) {
                        endD.setDate(endD.getDate() + 1);
                    } else if (s.start === '00:00' && s.end === '00:00') {
                        endD.setDate(endD.getDate() + 1);
                    }

                    flatShifts.push({
                        ...s,
                        date: dateStr,
                        locationId: sch.locationId,
                        startObj: startD,
                        endObj: endD,
                        isRecurring: !sch.date,
                        schedule: sch
                    });
                });
            }
        });
    });

    // Sort strictly by time
    flatShifts.sort((a, b) => a.startObj.getTime() - b.startObj.getTime());
    

    
    // Find Active Shift
    const active = flatShifts.find(s => now >= s.startObj && now < s.endObj);
    
    if (active) { 
        return { 
            mode: 'active', 
            title: t('user.hero.currentStatus'), 
            subtitle: `${formatTime12(active.start)} - ${formatTime12(active.end)}`, 
            location: getLocationName(active.schedule), 
            dateObj: active.startObj 
        }; 
    }
    
    const next = flatShifts.find(s => s.startObj > now);
    if (next) {
        let sub = ''; 
        const tom = new Date(now); tom.setDate(tom.getDate() + 1);
        const isToday = next.startObj.getDate() === now.getDate(); 
        const isTom = next.startObj.getDate() === tom.getDate();
        
        if (isToday) sub = `Today ${formatTime12(next.start)}`; 
        else if (isTom) sub = `Tomorrow ${formatTime12(next.start)}`; 
        else sub = `${next.startObj.toLocaleDateString()} ${formatTime12(next.start)}`;
        
        return { 
            mode: 'upcoming', 
            title: t('user.hero.nextShift'), 
            subtitle: sub, 
            location: getLocationName(next.schedule), 
            dateObj: next.startObj 
        };
    }

    return null;
  };

  const heroInfo = getHeroInfo();

  // ... (Rest of UI methods like getTicketStatus, getThemeClasses, handlers) ...
  const handleSwapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !targetUser) return setToast({ msg: 'Select colleague', type: 'error' });
    if (!swapDate) return setToast({ msg: 'Select date', type: 'error' });
    try {
        await addDoc(collection(db, 'swapRequests'), {
            from: currentUserId,
            to: targetUser,
            type: swapType,
            details: swapDetails,
            startDate: swapDate,
            status: 'pending',
            createdAt: Timestamp.now()
        });
        setToast({ msg: t('save'), type: 'success' });
        setTargetUser(''); setSwapDetails(''); setSwapDate('');
    } catch (e) {
        setToast({ msg: 'Error', type: 'error' });
    }
  };

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return;
    try {
      await addDoc(collection(db, 'leaveRequests'), { 
          from: currentUserId, 
          startDate: leaveStart, 
          endDate: leaveEnd, 
          reason: leaveReason, 
          status: 'pending', 
          createdAt: Timestamp.now() 
      });
      setToast({ msg: t('save'), type: 'success' });
      setLeaveStart(''); setLeaveEnd(''); setLeaveReason('');
    } catch (e) { 
        setToast({ msg: 'Error sending request', type: 'error' }); 
    }
  };

  const handleSwapAction = async (id:string, act:string) => {
    setConfirmModal({
        isOpen: true, 
        title: act === 'approved' ? t('user.incoming.accept') : t('sup.reject'), 
        message: t('confirm') + '?',
        onConfirm: async () => {
          setConfirmModal(prev => ({...prev, isOpen: false}));
          try { 
              const newStatus = act === 'approved' ? 'approvedByUser' : 'rejected'; 
              await updateDoc(doc(db, 'swapRequests', id), { status: newStatus, processedAt: Timestamp.now() }); 
              setToast({ msg: 'Success', type: 'success' }); 
          } catch (e) { 
              setToast({ msg: 'Error processing request', type: 'error' }); 
          }
        }
      });
  };

  const getTicketStatus = (sch: Schedule) => {
    if (!sch.date) {
      if(sch.locationId === 'Doctor Schedule') return { label: 'Weekly Roster', theme: 'cyan', icon: 'fa-user-md' };
      if((sch.locationId || '').includes('Friday')) return { label: 'Friday Duty', theme: 'teal', icon: 'fa-mosque' };
      return { label: 'Recurring', theme: 'blue', icon: 'fa-calendar' };
    }
    const shiftDate = new Date(sch.date);
    const today = new Date(); today.setHours(0,0,0,0); shiftDate.setHours(0,0,0,0);
    if (shiftDate < today) return { label: 'Completed', theme: 'slate', icon: 'fa-check-circle', grayscale: true };
    if (shiftDate.getTime() === today.getTime()) return { label: 'Today', theme: 'amber', icon: 'fa-briefcase', pulse: true };
    return { label: 'Upcoming', theme: 'sky', icon: 'fa-calendar-day' };
  };

  const getThemeClasses = (theme: string, isGrayscale: boolean) => {
      const themes: Record<string, any> = {
          cyan: { bg: 'bg-cyan-600', light: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
          teal: { bg: 'bg-teal-600', light: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
          blue: { bg: 'bg-blue-600', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
          slate: { bg: 'bg-slate-500', light: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
          amber: { bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
          sky: { bg: 'bg-sky-600', light: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
      };
      const t = themes[theme] || themes.blue;
      if (isGrayscale) { return { bg: 'bg-slate-400', light: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' }; }
      return t;
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20 font-sans" dir={dir}>

      {toast && <Toast message={toast.msg} type={toast.type} duration={toast.duration} onClose={() => setToast(null)} />}

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="bg-slate-900 text-white overflow-hidden py-2 relative z-50 shadow-sm">
          <div className="flex animate-marquee whitespace-nowrap gap-16 px-4">
            {announcements.map((ann, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ann.priority === 'critical' ? 'bg-red-500 animate-pulse' : ann.priority === 'urgent' ? 'bg-amber-500' : 'bg-blue-500'}`}>
                  {ann.priority}
                </span>
                <span className="font-bold text-sm">{ann.title}:</span>
                <span className="text-sm opacity-90">{ann.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="bg-gradient-to-br from-cyan-900 to-teal-800 text-white rounded-b-[3rem] shadow-2xl relative overflow-hidden mb-8">
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-12 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className={`text-center ${dir === 'rtl' ? 'md:text-right' : 'md:text-left'}`}>
              <p className="text-white/70 font-medium text-sm mb-1">{t('user.hero.welcome')}</p>
              
              <div className="flex flex-col">
                  <h1 className="text-3xl md:text-4xl font-black tracking-tight">Dr. {currentUserName}</h1>
                  {heroInfo && (
                      <span className={`text-sm font-bold mt-1 px-3 py-1 rounded-full w-fit ${dir === 'rtl' ? 'mr-0' : 'ml-0'} ${heroInfo.mode === 'active' ? 'bg-emerald-500 text-white animate-pulse' : 'bg-white/20 text-cyan-100'}`}>
                          {heroInfo.mode === 'active' ? t('dash.activeNow') : heroInfo.subtitle}
                      </span>
                  )}
              </div>

              <div className={`flex items-center gap-3 mt-4 justify-center ${dir === 'rtl' ? 'md:justify-start' : 'md:justify-start'}`}>
                <span className="bg-white/10 backdrop-blur-md border border-white/10 px-4 py-1.5 rounded-full text-xs font-bold text-white/90">
                  <i className="fas fa-user-md mx-2"></i> {t('role.doctor')}
                </span>
                
                <a 
                    href="http://192.168.0.8" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-emerald-500/90 text-white px-4 py-1.5 rounded-full text-xs font-bold hover:bg-emerald-500 transition-all flex items-center gap-2 shadow-lg hover:shadow-emerald-500/30"
                >
                    <i className="fas fa-desktop"></i> Open IHMS
                </a>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-lg border border-white/20 p-5 rounded-2xl w-full md:w-auto min-w-[280px] shadow-lg transition-all hover:bg-white/15">
              {heroInfo ? (
                <div className="flex items-center gap-4">
                  <div className={`rounded-xl w-14 h-14 flex flex-col items-center justify-center font-bold shadow-lg ${heroInfo.mode === 'active' ? 'bg-emerald-500 text-white' : 'bg-yellow-400 text-yellow-900'}`}>
                      {heroInfo.mode === 'leave' ? <i className="fas fa-umbrella-beach text-2xl"></i> : <i className="fas fa-calendar-check text-2xl"></i>}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{heroInfo.title}</h3>
                    <p className={`text-sm font-bold ${heroInfo.mode === 'active' ? 'text-emerald-300' : 'text-yellow-200'}`}>
                      {heroInfo.subtitle}
                    </p>
                    <p className="text-xs text-white/60 mt-0.5">{heroInfo.location}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-cyan-100">
                  <i className="fas fa-hospital-user text-2xl opacity-50"></i>
                  <span>Ready for Duty</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-8 relative z-20">

        <div className="bg-white rounded-2xl shadow-xl p-1.5 flex flex-wrap md:justify-start gap-2 overflow-x-auto no-scrollbar mb-8 border border-slate-100">
          {[
            { id: 'schedule', icon: 'fa-ticket-alt', label: t('user.tab.schedule') },
            { id: 'requests', icon: 'fa-paper-plane', label: t('user.tab.requests') },
            { id: 'incoming', icon: 'fa-inbox', label: t('user.tab.incoming'), badge: incomingSwaps.length },
            { id: 'history', icon: 'fa-history', label: t('user.tab.history') }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 md:flex-none min-w-fit flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 relative
              ${activeTab === tab.id
                ? 'bg-cyan-700 text-white shadow-lg'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
            >
              <i className={`fas ${tab.icon} ${activeTab === tab.id ? 'animate-pulse' : ''}`}></i>
              <span>{tab.label}</span>
              {tab.badge ? (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="animate-fade-in-up">

          {activeTab === 'schedule' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                    <i className="fas fa-ticket-alt text-cyan-600"></i>
                    {t('user.tab.schedule')}
                    </h2>
                    
                    <button 
                        onClick={() => setIsNoteOpen(!isNoteOpen)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2 ${isNoteOpen ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-yellow-50 hover:text-yellow-600'}`}
                        title="Toggle Personal Notes"
                    >
                        <i className="fas fa-sticky-note"></i> {isNoteOpen ? 'Hide Notes' : 'Notes'}
                    </button>
                </div>

                <div className="flex items-center gap-3 mt-3 md:mt-0 bg-slate-50 p-1 rounded-xl">
                  <button onClick={() => {
                      const d = new Date(selectedMonth);
                      d.setMonth(d.getMonth() - 1);
                      setSelectedMonth(d.toISOString().slice(0, 7));
                  }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-500 transition-all">
                      <i className="fas fa-chevron-right rtl:rotate-180"></i>
                  </button>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent border-none font-bold text-slate-700 text-sm focus:ring-0 cursor-pointer"
                  />
                  <button onClick={() => {
                      const d = new Date(selectedMonth);
                      d.setMonth(d.getMonth() + 1);
                      setSelectedMonth(d.toISOString().slice(0, 7));
                  }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-500 transition-all">
                      <i className="fas fa-chevron-left rtl:rotate-180"></i>
                  </button>
                </div>
              </div>

              {isNoteOpen && (
                  <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 mb-6 animate-fade-in-down">
                      <PersonalNotepad />
                  </div>
              )}

              {loading ? <Loading /> : schedules.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-dashed border-slate-200">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <i className="fas fa-calendar-times text-3xl"></i>
                  </div>
                  <p className="text-slate-500 font-bold">{t('user.hero.noShift')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {schedules.map((sch) => {
                    const status = getTicketStatus(sch);
                    const theme = getThemeClasses(status.theme || 'blue', status.grayscale || false);
                    let detailedDesc = sch.note && SHIFT_DESCRIPTIONS[sch.note] ? SHIFT_DESCRIPTIONS[sch.note] : '';
                    let customNote = '';
                    if (sch.note && !SHIFT_DESCRIPTIONS[sch.note]) {
                        const parts = sch.note.split(' - ');
                        if (parts.length > 1) { customNote = parts.slice(1).join(' - '); } else if (sch.note !== sch.locationId) { customNote = sch.note; }
                    }
                    let displayShifts = sch.shifts;
                    if (!displayShifts || displayShifts.length === 0 || (displayShifts.length === 1 && displayShifts[0].start === '08:00' && displayShifts[0].end === '16:00' && sch.note && sch.note.match(/\d/))) {
                         const extracted = parseMultiShifts(sch.note || "");
                         if (extracted.length > 0) displayShifts = extracted;
                    }

                    // Check for PP
                    const isPP = (sch.staffName && ppRegex.test(sch.staffName)) || (sch.note && ppRegex.test(sch.note));

                    return (
                        <div key={sch.id} className={`relative flex w-full rounded-3xl shadow-lg border-2 overflow-hidden hover:shadow-2xl hover:scale-[1.01] transition-all duration-300 group 
                            ${status.grayscale ? 'bg-slate-100 border-slate-300 opacity-60 grayscale' : 'bg-white ' + theme.border}`}>
                            <div className={`absolute top-4 right-4 rtl:left-4 rtl:right-auto px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider z-20 shadow-md ${status.grayscale ? 'bg-slate-400 text-white' : `${theme.bg} text-white`}`}>
                                {status.label}
                            </div>
                            <div className="flex-1 p-6 flex flex-col justify-between border-r-2 border-dashed border-slate-200 relative">
                                <div className="flex items-start gap-4">
                                    <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center text-white shadow-lg ${theme.bg}`}>
                                        {sch.date ? (
                                            <>
                                                <span className="text-[10px] font-bold opacity-80 uppercase">{new Date(sch.date).toLocaleDateString('en-US', {weekday: 'short'})}</span>
                                                <span className="text-2xl font-black leading-none">{new Date(sch.date).getDate()}</span>
                                            </>
                                        ) : (
                                            <i className={`fas ${status.icon} text-2xl`}></i>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">LOCATION</span>
                                        <h3 className="font-black text-slate-800 text-xl leading-none uppercase tracking-tight">{getLocationName(sch)}</h3>
                                        
                                        {isPP && (
                                            <div className="mt-2 w-fit text-[10px] font-black bg-yellow-400 text-black border-2 border-yellow-600 rounded px-2 py-1 shadow-sm uppercase tracking-wider flex items-center gap-1">
                                                <i className="fas fa-procedures"></i> PORTABLE & PROCEDURE
                                            </div>
                                        )}

                                        {customNote && ( <div className="mt-2 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs font-bold px-2 py-1.5 rounded-lg inline-block shadow-sm"> <i className="fas fa-info-circle mr-1"></i> {customNote} </div> )}
                                        {!sch.date && sch.validFrom && ( <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 w-fit"> <i className="far fa-calendar-check text-indigo-400"></i> <span className="font-mono"> {sch.validFrom} <span className="mx-1 text-slate-300">➜</span> {sch.validTo || 'End of Month'} </span> </div> )}
                                        {sch.note && !customNote && <p className="text-xs text-slate-500 mt-1 font-bold bg-slate-100 px-2 py-0.5 rounded-md inline-block">{sch.note}</p>}
                                        {detailedDesc && ( <div className="mt-2 text-[10px] text-slate-600 font-medium whitespace-pre-wrap leading-tight border-l-2 border-slate-300 pl-2"> {detailedDesc} </div> )}
                                    </div>
                                </div>
                                <div className="mt-6 space-y-2">
                                    {displayShifts.map((s, i) => (
                                        <div key={i} className={`flex justify-between items-center p-3 rounded-xl border transition-colors ${theme.light} ${theme.border}`}>
                                            <div className="flex items-center gap-3">
                                                <i className={`far fa-clock ${theme.text}`}></i>
                                                <span className="text-sm font-black text-slate-700 dir-ltr">{formatTime12(s.start)}</span>
                                            </div>
                                            <div className="flex-1 h-0.5 bg-slate-300 mx-4"></div>
                                            <span className="text-sm font-black text-slate-700 dir-ltr">{formatTime12(s.end)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="w-24 bg-slate-50 p-2 flex flex-col justify-center items-center text-center relative border-l-2 border-dashed border-slate-200">
                                    <div className="my-auto transform -rotate-90 whitespace-nowrap"><span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">BOARDING</span></div>
                                    <i className={`fas ${status.icon} text-3xl text-slate-300 opacity-50 mt-auto mb-4`}></i>
                            </div>
                        </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'requests' && (
                <div className="space-y-8 animate-fade-in">
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Swap Request Form */}
                        <div className="bg-white p-6 rounded-3xl shadow-lg border border-indigo-50 relative overflow-hidden">
                             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                            <h3 className="font-bold text-slate-800 text-lg mb-6 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><i className="fas fa-exchange-alt"></i></span>
                                {t('user.req.swap')}
                            </h3>
                            <form onSubmit={handleSwapSubmit} className="space-y-4 relative z-10">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">{t('user.req.type')}</label>
                                        <div className="flex bg-slate-50 p-1 rounded-xl">
                                            <button type="button" onClick={() => setSwapType('day')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${swapType === 'day' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>{t('user.req.day')}</button>
                                            <button type="button" onClick={() => setSwapType('month')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${swapType === 'month' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>{t('user.req.month')}</button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">{swapType === 'day' ? 'Date' : 'Month'}</label>
                                        <input 
                                            type={swapType === 'day' ? 'date' : 'month'} 
                                            className="w-full bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-600 py-2.5 focus:ring-2 focus:ring-indigo-100"
                                            value={swapDate}
                                            onChange={e => setSwapDate(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 mb-1 block">{t('user.req.colleague')}</label>
                                    <select 
                                        className="w-full bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-600 py-3 focus:ring-2 focus:ring-indigo-100"
                                        value={targetUser}
                                        onChange={e => setTargetUser(e.target.value)}
                                        required
                                    >
                                        <option value="">{t('user.req.colleague')}...</option>
                                        {users.filter(u => u.id !== currentUserId).map(u => (
                                            <option key={u.id} value={u.id}>{u.name || u.email}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">{t('notes')}</label>
                                    <textarea 
                                        className="w-full bg-slate-50 border-none rounded-xl text-sm p-3 focus:ring-2 focus:ring-indigo-100 min-h-[80px]"
                                        placeholder="..."
                                        value={swapDetails}
                                        onChange={e => setSwapDetails(e.target.value)}
                                    ></textarea>
                                </div>
                                <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg shadow-slate-300 hover:bg-slate-800 transition-all active:scale-95">
                                    {t('user.req.send')}
                                </button>
                            </form>
                        </div>

                        {/* Leave Request Form */}
                        <div className="bg-white p-6 rounded-3xl shadow-lg border border-red-50 relative overflow-hidden">
                             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-orange-500"></div>
                            <h3 className="font-bold text-slate-800 text-lg mb-6 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center"><i className="fas fa-umbrella-beach"></i></span>
                                {t('user.req.leave')}
                            </h3>
                            <form onSubmit={handleLeaveSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">{t('user.req.from')}</label>
                                        <input type="date" className="w-full bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-600 py-2.5 focus:ring-2 focus:ring-rose-100" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} required />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">{t('user.req.to')}</label>
                                        <input type="date" className="w-full bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-600 py-2.5 focus:ring-2 focus:ring-rose-100" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} required />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-1">{t('user.req.reason')}</label>
                                    <textarea className="w-full bg-slate-50 border-none rounded-xl text-sm p-3 focus:ring-2 focus:ring-rose-100 min-h-[80px]" placeholder="..." value={leaveReason} onChange={e => setLeaveReason(e.target.value)} required></textarea>
                                </div>
                                <button type="submit" className="w-full bg-white border-2 border-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-50 hover:text-rose-600 hover:border-rose-100 transition-all active:scale-95">
                                    {t('user.req.apply')}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'incoming' && (
                <div className="space-y-4 animate-fade-in">
                  {incomingSwaps.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                            <i className="fas fa-inbox text-3xl"></i>
                        </div>
                        <p className="text-slate-400 font-bold">{t('user.incoming.empty')}</p>
                    </div>
                  ) : (
                    incomingSwaps.map(req => (
                      <div key={req.id} className="bg-white p-6 rounded-3xl shadow-sm border border-indigo-50 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden group">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 group-hover:w-2 transition-all"></div>
                        <div className="flex items-center gap-4 pl-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold shadow-sm">
                                {req.fromUser.name.charAt(0)}
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-lg">{req.fromUser.name}</h4>
                                <p className="text-sm text-slate-500">{t('user.req.swap')} • <span className="font-mono bg-slate-100 px-2 rounded text-slate-600">{req.startDate}</span></p>
                                {req.details && <p className="text-xs text-slate-400 mt-1 italic">"{req.details}"</p>}
                            </div>
                        </div>
                        <div className="flex gap-3 w-full md:w-auto">
                            <button onClick={() => handleSwapAction(req.id, 'approved')} className="flex-1 md:flex-none bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all">
                                {t('user.incoming.accept')} <i className="fas fa-check ml-2"></i>
                            </button>
                            <button onClick={() => handleSwapAction(req.id, 'rejected')} className="flex-1 md:flex-none bg-white border border-red-200 text-red-500 px-6 py-2.5 rounded-xl font-bold hover:bg-red-50 transition-all">
                                {t('sup.reject')} <i className="fas fa-times ml-2"></i>
                            </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
                    {/* ... History Filter & Table ... */}
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400 uppercase">Filter By:</span>
                            <select className="bg-white border-none rounded-lg text-xs font-bold text-slate-600 py-1.5 focus:ring-0" value={histFilterType} onChange={e => setHistFilterType(e.target.value as any)}>
                                <option value="all">All Types</option>
                                <option value="swap">Swaps</option>
                                <option value="leave">Leaves</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <select className="bg-white border-none rounded-lg text-xs font-bold text-slate-600 py-1.5 focus:ring-0" value={histFilterStatus} onChange={e => setHistFilterStatus(e.target.value as any)}>
                                <option value="all">All Status</option>
                                <option value="approved">Approved</option>
                                <option value="pending">Pending</option>
                                <option value="rejected">Rejected</option>
                            </select>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white text-slate-500 font-bold border-b border-slate-100">
                                <tr>
                                    <th className="p-4 w-10"></th>
                                    <th className="p-4">{t('user.req.type')}</th>
                                    <th className="p-4">{t('details')}</th>
                                    <th className="p-4">{t('date')}</th>
                                    <th className="p-4 text-center">{t('status')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredHistory.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4 text-center">
                                            <div className={`w-2 h-2 rounded-full ${item.status.includes('approved') ? 'bg-emerald-500' : item.status.includes('rejected') ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${item.rawType === 'swap' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                                                {item.rawType === 'swap' ? (item.isOutgoing ? 'Sent Swap' : 'Received Swap') : 'Leave'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-600 font-medium">
                                            {item.details}
                                        </td>
                                        <td className="p-4 font-mono text-xs text-slate-500">
                                            {item.date}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                                                item.status.includes('approved') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                item.status.includes('rejected') ? 'bg-red-50 text-red-600 border-red-100' : 
                                                'bg-amber-50 text-amber-600 border-amber-100'
                                            }`}>
                                                {item.status === 'approvedByUser' ? 'Waiting Supervisor' : item.status}
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

      <Modal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({...confirmModal, isOpen: false})} title={confirmModal.title}>
          <div className="space-y-4">
              <p className="text-slate-600 font-medium">{confirmModal.message}</p>
              <div className="flex gap-3 pt-2">
                  <button onClick={confirmModal.onConfirm} className="flex-1 bg-slate-900 text-white py-2.5 rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-all">{t('confirm')}</button>
                  <button onClick={() => setConfirmModal({...confirmModal, isOpen: false})} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition-all">{t('cancel')}</button>
              </div>
          </div>
      </Modal>

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
                                                    <div className={`w-2 h-2 rounded-full mr-1 ${p.isPresent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
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
                                                {p.isPresent ? (
                                                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                                        <i className="fas fa-check-circle text-[8px]"></i> {t('status.in')}
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                                        {t('status.notyet')}
                                                    </span>
                                                )}
                                                {p.phone && (
                                                    <a 
                                                        href={`tel:${p.phone}`} 
                                                        className="hidden" // Hiding phone to save space, relies on click if needed in future
                                                    >
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
</div>
  );
};

export default DoctorDashboard;
