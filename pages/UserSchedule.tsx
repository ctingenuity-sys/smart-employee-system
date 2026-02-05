
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Schedule, Location, User, ActionLog, AttendanceLog } from '../types';
import Loading from '../components/Loading';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

// --- CONSTANTS FOR DATES ---
const RAMADAN_RANGES = [
    { start: '2024-03-10', end: '2024-04-09' },
    { start: '2025-02-15', end: '2025-03-30' },
    { start: '2026-02-10', end: '2026-03-18' }
];

const EID_RANGES = [
    // 2024
    { start: '2024-04-08', end: '2024-04-15', name: 'EID AL FITR' }, 
    { start: '2024-06-14', end: '2024-06-21', name: 'EID AL ADHA' }, 
    // 2025
    { start: '2025-03-28', end: '2025-04-06', name: 'EID AL FITR' }, 
    { start: '2025-06-03', end: '2025-06-12', name: 'EID AL ADHA' },
    // 2026
    { start: '2026-03-17', end: '2026-03-25', name: 'EID AL FITR' }, 
    { start: '2026-05-23', end: '2026-06-02', name: 'EID AL ADHA' }, 
];

// Specific Single Day Holidays
const NATIONAL_HOLIDAYS = [
    { month: '02', day: '22', name: 'FOUNDING DAY', icon: 'fa-chess-rook' },
    { month: '09', day: '23', name: 'NATIONAL DAY', icon: 'fa-flag' }
];

// --- VISUAL COMPONENTS (OPTIMIZED) ---

const BalloonsOverlay = () => {
    // Generate random balloons
    const balloons = Array.from({ length: 20 }).map((_, i) => {
        const colors = [
            { bg: 'rgba(239, 68, 68, 0.9)', shine: 'rgba(255, 200, 200, 0.8)' }, // Red
            { bg: 'rgba(59, 130, 246, 0.9)', shine: 'rgba(200, 200, 255, 0.8)' }, // Blue
            { bg: 'rgba(34, 197, 94, 0.9)', shine: 'rgba(200, 255, 200, 0.8)' }, // Green
            { bg: 'rgba(234, 179, 8, 0.9)', shine: 'rgba(255, 255, 200, 0.8)' }, // Yellow
            { bg: 'rgba(168, 85, 247, 0.9)', shine: 'rgba(240, 200, 255, 0.8)' }, // Purple
            { bg: 'rgba(236, 72, 153, 0.9)', shine: 'rgba(255, 200, 240, 0.8)' }, // Pink
            { bg: 'rgba(249, 115, 22, 0.9)', shine: 'rgba(255, 220, 200, 0.8)' }, // Orange
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        return {
            left: `${Math.random() * 90 + 5}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${6 + Math.random() * 6}s`,
            scale: 0.8 + Math.random() * 0.4,
            color: color.bg,
            shine: color.shine,
            swayDuration: `${3 + Math.random() * 2}s`
        };
    });

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {balloons.map((b, i) => (
                <div 
                    key={i}
                    className="absolute bottom-[-150px] z-10"
                    style={{
                        left: b.left,
                        animation: `floatUp ${b.animationDuration} linear infinite`,
                        animationDelay: b.animationDelay,
                        transform: `scale(${b.scale})`
                    }}
                >
                    {/* Balloon Body */}
                    <div 
                        className="w-12 h-14 relative"
                        style={{
                            background: `radial-gradient(circle at 30% 30%, ${b.shine} 0%, ${b.color} 30%, ${b.color} 80%, rgba(0,0,0,0.1) 100%)`,
                            borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%',
                            boxShadow: 'inset -5px -5px 10px rgba(0,0,0,0.1), 2px 5px 10px rgba(0,0,0,0.15)',
                            animation: `sway ${b.swayDuration} ease-in-out infinite alternate`
                        }}
                    >
                        {/* Reflection spot */}
                        <div className="absolute top-[20%] left-[20%] w-2 h-4 bg-white/40 rounded-full rotate-[-45deg] blur-[1px]"></div>
                        
                        {/* Knot */}
                        <div 
                            className="absolute bottom-[-3px] left-1/2 -translate-x-1/2 w-1.5 h-1.5"
                            style={{ backgroundColor: b.color, borderRadius: '50%' }}
                        ></div>
                        
                        {/* String */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-[1px] h-24 bg-white/40 origin-top animate-string-wave"></div>
                    </div>
                </div>
            ))}
            <style>{`
                @keyframes floatUp {
                    0% { transform: translateY(0) scale(1); opacity: 0; }
                    10% { opacity: 1; }
                    100% { transform: translateY(-800px) scale(1); opacity: 0.8; }
                }
                @keyframes sway {
                    0% { transform: rotate(-5deg); }
                    100% { transform: rotate(5deg); }
                }
                @keyframes string-wave {
                    0% { transform: translateX(-50%) rotate(0deg) scaleY(1); }
                    50% { transform: translateX(-50%) rotate(2deg) scaleY(0.95); }
                    100% { transform: translateX(-50%) rotate(-2deg) scaleY(1); }
                }
            `}</style>
        </div>
    );
};

const SheepOverlay = () => {
    // Generate floating sheep/clouds
    const sheep = Array.from({ length: 8 }).map((_, i) => ({
        top: `${Math.random() * 80}%`,
        animationDelay: `${Math.random() * 5}s`,
        animationDuration: `${10 + Math.random() * 10}s`,
        size: 20 + Math.random() * 20
    }));

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute inset-0 bg-green-100/10"></div>
            {sheep.map((s, i) => (
                <div 
                    key={i}
                    className="absolute opacity-60 text-4xl animate-bounce-slow"
                    style={{
                        top: s.top,
                        left: '-50px',
                        fontSize: `${s.size}px`,
                        animation: `walkAcross ${s.animationDuration} linear infinite`,
                        animationDelay: s.animationDelay,
                    }}
                >
                    🐑
                </div>
            ))}
            <style>{`
                @keyframes walkAcross {
                    0% { transform: translateX(-50px) rotate(0deg); }
                    25% { transform: translateX(100px) rotate(-5deg); }
                    50% { transform: translateX(250px) rotate(5deg); }
                    75% { transform: translateX(400px) rotate(-5deg); }
                    100% { transform: translateX(600px) rotate(0deg); }
                }
            `}</style>
        </div>
    );
};

// --- Helper Functions ---
const convertTo24Hour = (timeStr: string): string | null => {
    if (!timeStr) return null;
    let s = timeStr.toLowerCase().trim();
    if (/^\d{1,2}$/.test(s)) return `${s.padStart(2, '0')}:00`;
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

const formatDateSimple = (dateStr: string) => {
    if (!dateStr) return '???';
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

const isDateInMonth = (dateStr: string, targetMonth: string) => {
    if (!dateStr) return false;
    if (dateStr.startsWith(targetMonth)) return true;
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
        if (parts[2].length === 4) {
            const y = parts[2];
            const m = parts[1].padStart(2, '0');
            return `${y}-${m}` === targetMonth;
        }
        if (parts[0].length === 4) {
            const y = parts[0];
            const m = parts[1].padStart(2, '0');
            return `${y}-${m}` === targetMonth;
        }
    }
    return false;
}

const parseDateString = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d; 
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
        if (parts[0].length === 4) {
             d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
             if (!isNaN(d.getTime())) return d;
        }
        if (parts[2].length === 4) {
             d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
             if (!isNaN(d.getTime())) return d;
        }
    }
    return null;
}

const isOverlap = (startA: string, endA: string, startB: string, endB: string) => {
    return (startA <= endB) && (endA >= startB);
};

const getNationalHoliday = (dateStr: string | undefined): { name: string, icon: string } | null => {
    if (!dateStr) return null;
    const date = parseDateString(dateStr);
    if (!date) return null;
    
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    
    for (const h of NATIONAL_HOLIDAYS) {
        if (h.month === m && h.day === d) return { name: h.name, icon: h.icon };
    }
    return null;
};

const getIslamicOccasion = (dateStr: string | undefined): { type: 'ramadan' | 'eid', name?: string } | null => {
    if (!dateStr) return null;
    const date = parseDateString(dateStr);
    if (!date) return null;
    
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const isoDate = `${y}-${m}-${d}`;

    for (const range of RAMADAN_RANGES) {
        if (isoDate >= range.start && isoDate <= range.end) return { type: 'ramadan' };
    }
    for (const range of EID_RANGES) {
        if (isoDate >= range.start && isoDate <= range.end) return { type: 'eid', name: range.name };
    }
    return null;
};

const checkRamadanOverlap = (validFrom: string | undefined, validTo: string | undefined, monthStr?: string): boolean => {
    let start = validFrom;
    let end = validTo;
    if (!start && monthStr) { start = `${monthStr}-01`; end = `${monthStr}-28`; }
    const safeStart = start || '0000-00-00';
    const safeEnd = end || '9999-99-99';
    for (const range of RAMADAN_RANGES) {
        if (isOverlap(safeStart, safeEnd, range.start, range.end)) return true;
    }
    return false;
};

const checkEidOverlap = (validFrom: string | undefined, validTo: string | undefined, monthStr?: string): { isEid: boolean, name?: string } => {
    let start = validFrom;
    let end = validTo;
    if (!start && monthStr) { start = `${monthStr}-01`; end = `${monthStr}-28`; }
    const safeStart = start || '0000-00-00';
    const safeEnd = end || '9999-99-99';

    for (const range of EID_RANGES) {
        if (isOverlap(safeStart, safeEnd, range.start, range.end)) return { isEid: true, name: range.name };
    }
    return { isEid: false };
};

const SHIFT_DESCRIPTIONS: Record<string, string> = {
    'Straight Morning': '9am-5pm\nXRAYS + USG',
    'Straight Evening': '5pm-1am\nXRAYS + USG',
};

const PersonalNotepad: React.FC = () => {
    const [note, setNote] = useState('');
    useEffect(() => {
        const saved = localStorage.getItem('usr_personal_note');
        if (saved) setNote(saved);
    }, []);
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setNote(val);
        localStorage.setItem('usr_personal_note', val);
    };
    return (
        <div className="bg-yellow-50 rounded-2xl p-4 shadow-inner border border-yellow-200 relative group h-full transition-all animate-fade-in-down mb-6">
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-yellow-800 text-sm flex items-center gap-2">
                    <i className="fas fa-sticky-note"></i> Personal Notes
                </h4>
            </div>
            <textarea 
                className="w-full bg-transparent border-none resize-none text-sm text-slate-700 focus:ring-0 min-h-[100px] font-medium leading-relaxed placeholder-yellow-300/50"
                placeholder="Write reminders here... (Auto-saved locally)"
                value={note}
                onChange={handleChange}
            />
        </div>
    );
};

const Barcode: React.FC = () => (
    <div className="flex justify-center items-center h-12 w-full overflow-hidden opacity-40 mix-blend-multiply gap-[3px]">
        {[...Array(25)].map((_, i) => (
            <div key={i} className="bg-current h-full rounded-full" style={{ width: Math.random() > 0.5 ? '2px' : '5px', opacity: Math.random() > 0.3 ? 1 : 0.5 }}></div>
        ))}
    </div>
);

const UserSchedule: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [isNoteOpen, setIsNoteOpen] = useState(false);
    const [punchedDates, setPunchedDates] = useState<Set<string>>(new Set());

    useEffect(() => {
        setLoading(true);
        const unsubLocs = onSnapshot(collection(db, 'locations'), (snap) => {
            setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
        });

        if (currentUserId) {
            const [y, m] = selectedMonth.split('-');
            const qLogs = query(collection(db, 'attendance_logs'), where('userId', '==', currentUserId));
            const unsubLogs = onSnapshot(qLogs, (snap) => {
                const dates = new Set<string>();
                snap.docs.forEach(d => {
                    const log = d.data() as AttendanceLog;
                    if (log.date) dates.add(log.date);
                });
                setPunchedDates(dates);
            });

            const d = new Date(parseInt(y), parseInt(m) - 1, 1);
            const monthsToFetch = [];
            for (let i = -2; i <= 2; i++) {
                const temp = new Date(d);
                temp.setMonth(d.getMonth() + i);
                monthsToFetch.push(temp.toISOString().slice(0, 7));
            }

            const qSch = query(collection(db, 'schedules'), 
                where('userId', '==', currentUserId), 
                where('month', 'in', monthsToFetch)
            );

            const unsubSch = onSnapshot(qSch, snap => {
                const fetchedData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Schedule));
                
                const data = fetchedData.filter(sch => {
                    if (sch.month === selectedMonth) return true;
                    if (sch.date) return isDateInMonth(sch.date, selectedMonth);
                    if (sch.validFrom) {
                        const monthStart = `${selectedMonth}-01`;
                        const monthEnd = `${selectedMonth}-31`; 
                        const vFrom = sch.validFrom;
                        const vTo = sch.validTo || '9999-99-99';
                        return vFrom <= monthEnd && vTo >= monthStart;
                    }
                    return false;
                });

                const qActions = query(collection(db, 'actions'), where('employeeId', '==', currentUserId));
                const unsubActions = onSnapshot(qActions, actionSnap => {
                    const fetchedActions = actionSnap.docs
                        .map(d => ({ id: d.id, ...d.data() } as ActionLog))
                        .filter(a => {
                            const start = a.fromDate;
                            const end = a.toDate;
                            return (start && start <= `${selectedMonth}-31` && end >= `${selectedMonth}-01`);
                        });
                    
                    const actionSchedules: Schedule[] = [];
                    fetchedActions.forEach(act => {
                        if (act.type === 'positive') return;
                        const startDate = new Date(act.fromDate);
                        const endDate = new Date(act.toDate);
                        
                        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                            const dateStr = d.toISOString().split('T')[0];
                            if (dateStr.startsWith(selectedMonth)) {
                                actionSchedules.push({
                                    id: `action_${act.id}_${dateStr}`,
                                    userId: currentUserId,
                                    locationId: 'LEAVE_ACTION',
                                    date: dateStr,
                                    shifts: [],
                                    note: act.type,
                                    userType: 'user',
                                    month: selectedMonth
                                });
                            }
                        }
                    });

                    const actionDates = new Set(actionSchedules.map(s => s.date));
                    const filteredRegularSchedules = data.filter(s => !s.date || !actionDates.has(s.date));
                    
                    const combined = [...filteredRegularSchedules, ...actionSchedules];
                    combined.sort((a, b) => {
                        const dateA = a.date || a.validFrom || '9999-99-99';
                        const dateB = b.date || b.validFrom || '9999-99-99';
                        return dateA.localeCompare(dateB);
                    });

                    setSchedules(combined);
                    setLoading(false);
                });
            });
            return () => { unsubLocs(); unsubLogs(); unsubSch(); }
        }
        setLoading(false);
        return () => { unsubLocs(); }
    }, [selectedMonth, currentUserId]);

    const getLocationName = useCallback((sch: Schedule) => {
        if (sch.locationId === 'LEAVE_ACTION') {
            const map: Record<string, string> = {
                'annual_leave': 'ANNUAL LEAVE',
                'sick_leave': 'SICK LEAVE',
                'unjustified_absence': 'ABSENT (ADMIN)',
                'justified_absence': 'EXCUSED ABSENCE',
                'mission': 'ON MISSION'
            };
            return map[sch.note || ''] || (sch.note || 'LEAVE').toUpperCase().replace('_', ' ');
        }
        
        let display = '';
        if (sch.locationId === 'Holiday Shift') {
             const parts = (sch.note || '').split(' - ');
             if (parts.length >= 2 && parts[0] === 'Holiday') {
                 display = parts[1];
                 if (parts.length > 2 && parts[2]) display += ` - ${parts[2]}`;
             } else {
                 display = 'HOLIDAY SHIFT';
             }
        } 
        else if (sch.locationId && sch.locationId.startsWith('Swap Duty')) {
            const parts = sch.locationId.split(' - ');
            const realLoc = parts[1] || 'Swap';
            const loc = locations.find(l => l.id === realLoc);
            display = `Swap: ${loc ? loc.name : realLoc}`;
        }
        else if (sch.locationId === 'common_duty' && sch.note) {
            display = sch.note.split(' - ')[0]; 
        } 
        else {
            const l = locations.find(loc => loc.id === sch.locationId);
            display = l ? l.name : sch.locationId;
        }
        return display;
    }, [locations]);

    const getTicketStatus = (sch: Schedule) => {
        if (sch.locationId === 'LEAVE_ACTION') {
            if ((sch.note || '').includes('absence')) return { label: 'ABSENT', theme: 'red', icon: 'fa-user-slash', isAction: true };
            return { label: 'ON LEAVE', theme: 'purple', icon: 'fa-umbrella-beach', isAction: true };
        }

        const isSwap = (sch.locationId || '').toLowerCase().includes('swap') || (sch.note || '').toLowerCase().includes('swap');
        
        if (!sch.date) {
          const isRamadanRange = checkRamadanOverlap(sch.validFrom, sch.validTo, sch.month);
          const eidRange = checkEidOverlap(sch.validFrom, sch.validTo, sch.month);

          if(sch.locationId === 'common_duty') return { label: isRamadanRange ? 'RAMADAN' : 'GENERAL', theme: isRamadanRange ? 'indigo' : 'purple', icon: isRamadanRange ? 'fa-moon' : 'fa-layer-group', isHoliday: false, isRamadan: isRamadanRange };
          
          if(sch.locationId === 'Holiday Shift') {
              if (eidRange.isEid) return { label: eidRange.name || 'EID MUBARAK', theme: 'teal', icon: 'fa-star', isHoliday: true, isEid: true, eidName: eidRange.name };
              return { label: 'HOLIDAY', theme: 'rose', icon: 'fa-gift', isHoliday: true };
          }
          
          if (isSwap) return { label: 'SWAP', theme: 'violet', icon: 'fa-exchange-alt', pulse: true };
          
          return { label: isRamadanRange ? 'RAMADAN' : 'GENERAL', theme: isRamadanRange ? 'indigo' : 'indigo', icon: isRamadanRange ? 'fa-moon' : 'fa-calendar-alt', isRamadan: isRamadanRange };
        }
        
        const shiftDate = parseDateString(sch.date) || new Date();
        const today = new Date(); 
        today.setHours(0,0,0,0); 
        shiftDate.setHours(0,0,0,0);
        
        if (shiftDate < today) {
            if (!punchedDates.has(sch.date)) {
                return { label: 'ABSENT', theme: 'red', icon: 'fa-times-circle', isAbsent: true };
            }
            const national = getNationalHoliday(sch.date);
            const occasion = getIslamicOccasion(sch.date);
            if (national) return { label: 'COMPLETED', theme: 'emerald', icon: 'fa-check-circle', grayscale: true, isNational: true };
            if (occasion?.type === 'ramadan') return { label: 'COMPLETED', theme: 'indigo', icon: 'fa-check-circle', grayscale: true, isRamadan: true };
            return { label: 'COMPLETED', theme: 'slate', icon: 'fa-check-circle', grayscale: true };
        }

        const national = getNationalHoliday(sch.date);
        const occasion = getIslamicOccasion(sch.date);
        const isRamadan = occasion?.type === 'ramadan';
        const isEid = occasion?.type === 'eid';
        const eidName = occasion?.name;

        if (isSwap) return { label: 'SWAP', theme: 'violet', icon: 'fa-exchange-alt', pulse: true, isRamadan, isEid, eidName };
        
        if (shiftDate.getTime() === today.getTime()) {
            return { label: 'TODAY', theme: 'amber', icon: 'fa-briefcase', pulse: true, isRamadan, isEid, eidName, isNational: !!national };
        }
        
        if (national) return { label: national.name, theme: 'emerald', icon: national.icon, isNational: true };
        if (isEid) return { label: eidName || 'EID MUBARAK', theme: 'teal', icon: 'fa-star', isEid: true, eidName };
        if (isRamadan) return { label: 'RAMADAN', theme: 'indigo', icon: 'fa-moon', isRamadan: true };

        if (sch.locationId.includes('Friday')) return { label: 'FRIDAY', theme: 'emerald', icon: 'fa-mosque' };
        if (sch.locationId.includes('Holiday')) return { label: 'HOLIDAY', theme: 'rose', icon: 'fa-gift' };
        
        return { label: 'UPCOMING', theme: 'sky', icon: 'fa-calendar-day' };
    };

    const getGradient = (theme: string, isGrayscale: boolean, isRamadan?: boolean, isEid?: boolean, isNational?: boolean, isAbsent?: boolean) => {
        if (isAbsent) return 'bg-gradient-to-br from-red-50 to-red-100 border-red-300 text-red-800';
        if (isGrayscale) return 'bg-gradient-to-r from-slate-200 to-slate-300 text-slate-500 border-slate-300';
        if (isNational) return 'bg-gradient-to-br from-emerald-700 via-green-800 to-teal-900 text-white border-amber-400';
        if (isRamadan) return 'bg-gradient-to-br from-indigo-900 via-slate-800 to-indigo-900 text-amber-100 border-amber-500/50';
        if (isEid) return 'bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 text-white border-pink-300';

        const themes: Record<string, string> = {
            purple: 'bg-gradient-to-br from-purple-700 via-purple-600 to-indigo-700 text-white border-purple-500',
            rose: 'bg-gradient-to-br from-rose-600 via-pink-600 to-red-600 text-white border-rose-500',
            blue: 'bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-700 text-white border-blue-500',
            amber: 'bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-600 text-white border-amber-500',
            violet: 'bg-gradient-to-br from-violet-700 via-purple-700 to-fuchsia-800 text-white border-violet-500',
            teal: 'bg-gradient-to-br from-teal-600 via-emerald-600 to-green-700 text-white border-teal-500',
            emerald: 'bg-gradient-to-br from-emerald-600 via-teal-600 to-green-700 text-white border-emerald-500',
            sky: 'bg-gradient-to-br from-sky-600 via-blue-500 to-cyan-600 text-white border-sky-500',
            indigo: 'bg-gradient-to-br from-indigo-700 via-blue-800 to-slate-900 text-white border-indigo-500',
            slate: 'bg-gradient-to-br from-slate-500 to-slate-700 text-white border-slate-500',
            red: 'bg-gradient-to-br from-red-700 via-red-600 to-rose-700 text-white border-red-500'
        };
        return themes[theme] || themes.blue;
    };

    return (
        <div className="max-w-5xl mx-auto px-4 pb-20 pt-6 animate-fade-in" dir={dir}>
            <div className="flex flex-col md:flex-row justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                        <i className="fas fa-arrow-left rtl:rotate-180"></i>
                    </button>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('user.tab.schedule')}</h1>
                </div>
                
                <div className="flex items-center gap-3 mt-4 md:mt-0 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                    <button onClick={() => setIsNoteOpen(!isNoteOpen)} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2 ${isNoteOpen ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-yellow-50'}`}>
                        <i className="fas fa-sticky-note"></i> {isNoteOpen ? 'Hide' : 'Notes'}
                    </button>
                    <div className="h-6 w-px bg-slate-200 mx-1"></div>
                    <button onClick={() => {
                        const d = new Date(selectedMonth); d.setMonth(d.getMonth() - 1); setSelectedMonth(d.toISOString().slice(0, 7));
                    }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">
                        <i className="fas fa-chevron-right rtl:rotate-180"></i>
                    </button>
                    <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent border-none font-bold text-slate-700 text-sm focus:ring-0 cursor-pointer" />
                    <button onClick={() => {
                        const d = new Date(selectedMonth); d.setMonth(d.getMonth() + 1); setSelectedMonth(d.toISOString().slice(0, 7));
                    }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">
                        <i className="fas fa-chevron-left rtl:rotate-180"></i>
                    </button>
                </div>
            </div>

            {isNoteOpen && <PersonalNotepad />}

            {schedules.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-dashed border-slate-200">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <i className="fas fa-calendar-times text-3xl"></i>
                  </div>
                  <p className="text-slate-500 font-bold">{t('user.hero.noShift')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-8">
                  {schedules.map((sch) => {
                    const status = getTicketStatus(sch);
                    const gradientClass = getGradient(status.theme || 'blue', status.grayscale || false, status.isRamadan, status.isEid, status.isNational, status.isAbsent);
                    
                    let detailedDesc = sch.note && SHIFT_DESCRIPTIONS[sch.note] ? SHIFT_DESCRIPTIONS[sch.note] : '';
                    let customNote = '';
                    if (sch.note && !SHIFT_DESCRIPTIONS[sch.note] && sch.locationId !== 'LEAVE_ACTION') {
                        const parts = sch.note.split(' - ');
                        if (sch.locationId === 'Holiday Shift') {
                            if (parts.length > 2) customNote = parts.slice(2).join(' - ');
                        } else {
                            if (parts.length > 1) { customNote = parts.slice(1).join(' - '); } else if (sch.note !== sch.locationId) { customNote = sch.note; }
                        }
                    }
                    
                    let displayShifts = sch.shifts;
                    if (!displayShifts || displayShifts.length === 0 || (displayShifts.length === 1 && displayShifts[0].start === '08:00' && displayShifts[0].end === '16:00' && sch.note && sch.note.match(/\d/))) {
                         const extracted = parseMultiShifts(sch.note || "");
                         if (extracted.length > 0) displayShifts = extracted;
                    }
                    if (!displayShifts || displayShifts.length === 0) displayShifts = [{ start: '08:00', end: '16:00' }];

                    const isValidityTicket = !sch.date && sch.validFrom;
                    const validFromStr = sch.validFrom ? formatDateSimple(sch.validFrom) : '???';
                    const validToStr = sch.validTo ? formatDateSimple(sch.validTo) : 'End of Month';
                    let displayDateObj = sch.date ? parseDateString(sch.date) : null;

                    // --- EID TYPE DETECTION ---
                    const isFitr = status.isEid && (status.eidName || '').toUpperCase().includes('FITR');
                    const isAdha = status.isEid && (status.eidName || '').toUpperCase().includes('ADHA');

                    return (
                        <div key={sch.id} className="relative group w-full flex flex-col md:flex-row shadow-2xl transition-all duration-500 transform hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-3xl overflow-hidden">
                            
                            <div className={`flex-1 relative overflow-hidden ${gradientClass} p-0 flex flex-col`}>
                                
                                {status.isNational && (
                                    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                                        <div className="absolute top-[-50%] right-[-10%] w-[80%] h-[150%] bg-white/5 skew-x-12"></div>
                                        <div className="absolute inset-0 flex items-center justify-center opacity-10">
                                            <i className="fas fa-chess-rook text-[15rem] text-white transform rotate-12"></i>
                                        </div>
                                    </div>
                                )}

                                {status.isRamadan && (
                                    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                                         <svg className="absolute top-0 left-0 w-full h-16 text-amber-200/50" preserveAspectRatio="none" viewBox="0 0 100 15">
                                           <path d="M0 0 Q 50 15 100 0" stroke="currentColor" fill="none" strokeWidth="0.5" />
                                         </svg>
                                         <div className="absolute top-0 left-[15%] flex flex-col items-center animate-swing origin-top">
                                             <div className="h-8 w-px bg-amber-200/50"></div>
                                             <i className="fas fa-star text-amber-300 text-lg drop-shadow-md"></i>
                                         </div>
                                         <div className="absolute top-0 left-[50%] flex flex-col items-center animate-swing origin-top delay-700">
                                             <div className="h-12 w-px bg-amber-200/50"></div>
                                             <i className="fas fa-moon text-amber-200 text-2xl drop-shadow-md"></i>
                                         </div>
                                         <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                                            <i className="fas fa-mosque text-[12rem] md:text-[18rem] text-white transform scale-125 translate-y-10"></i>
                                         </div>
                                    </div>
                                )}

                                {/* EID AL FITR (BALLOONS) */}
                                {isFitr && <BalloonsOverlay />}

                                {/* EID AL ADHA (SHEEP) */}
                                {isAdha && <SheepOverlay />}
                                
                                <div className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none" style={{backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")'}}></div>
                                
                                {isValidityTicket && (
                                    <div className="bg-black/40 backdrop-blur-md border-b border-white/10 px-4 py-2 flex justify-between items-center z-20">
                                        <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.2em] text-white/90 uppercase animate-pulse">
                                            <i className="fas fa-circle text-[6px] text-emerald-400"></i> Valid
                                        </div>
                                        <div className="font-mono text-xs font-bold text-white flex items-center gap-2">
                                            <span className="opacity-70">FROM</span>
                                            <span className="bg-white/10 px-2 rounded text-emerald-300">{validFromStr}</span>
                                            <span className="opacity-50">➜</span>
                                            <span className="opacity-70">TO</span>
                                            <span className="bg-white/10 px-2 rounded text-emerald-300">{validToStr}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="p-6 md:p-8 flex flex-col h-full relative z-10">
                                    <div className="flex justify-between items-start mb-6">
                                        {sch.date && displayDateObj ? (
                                            <div className="flex flex-col">
                                                <span className={`text-sm font-bold uppercase tracking-widest opacity-70 mb-[-5px] ${status.isAbsent ? 'text-red-800' : ''}`}>{displayDateObj.toLocaleString('en-US', { month: 'long' })}</span>
                                                <span className={`text-6xl font-black leading-none tracking-tighter drop-shadow-lg font-oswald ${status.isAbsent ? 'text-red-900' : ''}`}>{displayDateObj.getDate()}</span>
                                                <span className={`text-xs font-medium opacity-80 uppercase tracking-wide mt-1 ${status.isAbsent ? 'text-red-800' : ''}`}>{displayDateObj.toLocaleString('en-US', { weekday: 'long' })}</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col">
                                                <i className={`fas ${status.icon} text-4xl opacity-90 mb-2`}></i>
                                                <span className="text-2xl font-black uppercase tracking-tight font-oswald leading-none">{status.label}</span>
                                                <span className="text-[10px] uppercase tracking-[0.3em] opacity-60">Schedule</span>
                                            </div>
                                        )}
                                        
                                        {!isValidityTicket && (
                                            <div className={`bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg border border-white/20 text-[10px] font-black uppercase tracking-widest shadow-sm ${status.isAbsent ? 'text-red-900 bg-red-100 border-red-200' : 'text-white'}`}>
                                                {status.isRamadan ? <><i className="fas fa-moon text-amber-300 mr-1"></i> RAMADAN</> : status.label}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mb-8">
                                        <p className="text-[9px] font-bold uppercase tracking-[0.3em] opacity-50 mb-1">{sch.locationId === 'LEAVE_ACTION' ? 'Status Update' : 'Assigned Unit'}</p>
                                        <h3 className={`text-2xl md:text-4xl font-black uppercase tracking-tight leading-none drop-shadow-md font-oswald max-w-lg ${status.isAbsent ? 'text-red-900' : ''}`}>
                                            {getLocationName(sch)}
                                        </h3>
                                        
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {customNote && ( 
                                                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-bold border border-white/10 hover:bg-white/20 transition-colors">
                                                    <i className="fas fa-info-circle text-sky-300"></i> {customNote}
                                                </div> 
                                            )}
                                            {detailedDesc && ( 
                                                <div className="inline-flex items-center gap-2 bg-black/20 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-bold border border-white/5">
                                                    {detailedDesc}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {sch.locationId !== 'LEAVE_ACTION' && !status.isAbsent && (
                                        <div className="mt-auto space-y-3">
                                            {displayShifts.map((s, i) => (
                                                <div key={i} className={`flex items-center gap-4 bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10 hover:bg-black/30 transition-colors group/shift ${status.isRamadan ? 'border-amber-500/30' : ''}`}>
                                                    <div className="flex flex-col min-w-[60px]">
                                                        <span className="text-[9px] uppercase font-bold opacity-50 tracking-wider">Start</span>
                                                        <span className={`text-xl font-mono font-bold tracking-tight group-hover/shift:text-emerald-300 transition-colors ${status.isRamadan ? 'text-amber-200' : status.isNational ? 'text-amber-100' : 'text-white'}`}>{formatTime12(s.start)}</span>
                                                    </div>
                                                    
                                                    <div className="flex-1 flex flex-col justify-center relative px-2">
                                                        <div className="h-[2px] w-full bg-gradient-to-r from-white/20 via-white/60 to-white/20 rounded-full"></div>
                                                        <i className={`fas fa-plane text-xs absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform rotate-90 md:rotate-0 ${status.isRamadan ? 'text-amber-300' : 'text-white/80'}`}></i>
                                                    </div>

                                                    <div className="flex flex-col text-right min-w-[60px]">
                                                        <span className="text-[9px] uppercase font-bold opacity-50 tracking-wider">End</span>
                                                        <span className={`text-xl font-mono font-bold tracking-tight group-hover/shift:text-emerald-300 transition-colors ${status.isRamadan ? 'text-amber-200' : status.isNational ? 'text-amber-100' : 'text-white'}`}>{formatTime12(s.end)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    
                                    {status.isAbsent && (
                                        <div className="mt-auto p-4 border-2 border-dashed border-red-300 bg-white/50 rounded-xl text-center">
                                            <p className="text-red-700 font-bold text-sm">NO ATTENDANCE RECORD</p>
                                            <p className="text-red-500 text-[10px] mt-1">Please contact supervisor if this is an error.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="relative flex-shrink-0 w-full h-6 md:w-6 md:h-auto bg-[#f1f5f9] flex md:flex-col items-center justify-between overflow-hidden z-20">
                                <div className="absolute -left-3 md:left-auto md:-top-3 w-6 h-6 bg-[#f1f5f9] rounded-full z-30 shadow-inner"></div>
                                <div className="absolute -right-3 md:right-auto md:-bottom-3 w-6 h-6 bg-[#f1f5f9] rounded-full z-30 shadow-inner"></div>
                                <div className="w-full h-[2px] md:w-[2px] md:h-full border-b-2 md:border-b-0 md:border-r-2 border-dashed border-slate-300 my-auto md:mx-auto"></div>
                            </div>

                            <div className={`w-full md:w-56 bg-white p-6 flex flex-row md:flex-col items-center justify-between gap-4 border-2 border-dashed border-slate-100 ${status.grayscale ? 'opacity-60' : ''}`}>
                                <div className="text-center w-full hidden md:block">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Class</p>
                                    <div className={`inline-block px-4 py-1 rounded-full border-2 font-black text-xs uppercase ${status.theme === 'amber' ? 'border-amber-500 text-amber-600 bg-amber-50' : 'border-slate-800 text-slate-800 bg-slate-50'}`}>
                                        STANDARD
                                    </div>
                                </div>
                                <div className="w-24 md:w-full md:h-24 opacity-60 mix-blend-multiply rotate-90 md:rotate-0">
                                    <Barcode />
                                </div>
                                <div className="text-right md:text-center">
                                    <i className={`fas ${status.icon} text-3xl md:text-5xl mb-2 text-slate-200 block ${status.isRamadan ? 'text-amber-400' : ''}`}></i>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Boarding</p>
                                    <p className={`text-lg font-black ${status.grayscale ? 'text-slate-500' : 'text-slate-800'}`}>
                                        {status.label}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                  })}
                </div>
            )}
        </div>
    );
};

export default UserSchedule;
