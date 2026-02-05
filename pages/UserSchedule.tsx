
// ... existing imports
import React, { useState, useEffect, useCallback } from 'react';
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

const NATIONAL_HOLIDAYS = [
    { month: '02', day: '22', name: 'FOUNDING DAY', icon: 'fa-chess-rook' }, 
    { month: '09', day: '23', name: 'NATIONAL DAY', icon: 'fa-flag' }      
];

// Helper functions 
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
    // Fallback for different formats
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
        if (parts[2].length === 4) { // DD-MM-YYYY
            const y = parts[2];
            const m = parts[1].padStart(2, '0');
            return `${y}-${m}` === targetMonth;
        }
        if (parts[0].length === 4) { // YYYY-MM-DD
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

const getIslamicOccasion = (dateStr: string | undefined): 'ramadan' | 'eid' | null => {
    if (!dateStr) return null;
    const date = parseDateString(dateStr);
    if (!date) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const isoDate = `${y}-${m}-${d}`;
    for (const range of RAMADAN_RANGES) {
        if (isoDate >= range.start && isoDate <= range.end) return 'ramadan';
    }
    for (const range of EID_RANGES) {
        if (isoDate >= range.start && isoDate <= range.end) return 'eid';
    }
    return null;
};

const checkRamadanOverlap = (validFrom: string | undefined, validTo: string | undefined, monthStr?: string): boolean => {
    let start = validFrom;
    let end = validTo;
    if (!start && monthStr) {
        start = `${monthStr}-01`;
        end = `${monthStr}-28`;
    }
    const safeStart = start || '0000-00-00';
    const safeEnd = end || '9999-99-99';
    for (const range of RAMADAN_RANGES) {
        if (isOverlap(safeStart, safeEnd, range.start, range.end)) return true;
    }
    return false;
};

const checkEidOverlap = (validFrom: string | undefined, validTo: string | undefined, monthStr?: string): boolean => {
    let start = validFrom;
    let end = validTo;
    if (!start && monthStr) { start = `${monthStr}-01`; end = `${monthStr}-28`; }
    const safeStart = start || '0000-00-00';
    const safeEnd = end || '9999-99-99';
    for (const range of EID_RANGES) {
        if (isOverlap(safeStart, safeEnd, range.start, range.end)) return true;
    }
    return false;
};

const getEidName = (dateStr: string | undefined): string | null => {
    if (!dateStr) return null;
    const date = parseDateString(dateStr);
    if (!date) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const isoDate = `${y}-${m}-${d}`;
    for (const range of EID_RANGES) {
        if (isoDate >= range.start && isoDate <= range.end) return range.name;
    }
    return null;
}

const getEidNameForRange = (validFrom: string | undefined, validTo: string | undefined): string | null => {
    if (!validFrom) return null;
    const end = validTo || '2030-12-31';
    for (const range of EID_RANGES) {
        if (isOverlap(validFrom, end, range.start, range.end)) return range.name;
    }
    return null;
}

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

            // Start date of selected month
            const d = new Date(parseInt(y), parseInt(m) - 1, 1);
            
            // --- UPDATED FETCH LOGIC: Broader lookback (-3 to +2 months) ---
            const monthsToFetch = [];
            for (let i = -3; i <= 2; i++) {
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
                
                // Calculate precise start/end for the selected month to handle overlaps correctly
                const [selY, selM] = selectedMonth.split('-').map(Number);
                const lastDay = new Date(selY, selM, 0).getDate(); // Gets last day of specific month
                const monthStart = `${selectedMonth}-01`;
                const monthEnd = `${selectedMonth}-${lastDay}`;
                
                // Enhanced Filtering
                const data = fetchedData.filter(sch => {
                    // 1. Direct Month Match (Legacy)
                    if (sch.month === selectedMonth) return true;
                    
                    // 2. Specific Date Match
                    if (sch.date) return isDateInMonth(sch.date, selectedMonth);
                    
                    // 3. Range Overlap Match (The Core Fix)
                    if (sch.validFrom) {
                        const vFrom = sch.validFrom;
                        const vTo = sch.validTo || '9999-99-99';
                        
                        // Overlap Logic: (StartA <= EndB) and (EndA >= StartB)
                        // Schedule Range: [vFrom, vTo]
                        // Month Range: [monthStart, monthEnd]
                        return vFrom <= monthEnd && vTo >= monthStart;
                    }
                    return false;
                });

                // Fetch Actions (Leaves/Absence)
                const qActions = query(collection(db, 'actions'), where('employeeId', '==', currentUserId));
                const unsubActions = onSnapshot(qActions, actionSnap => {
                    const fetchedActions = actionSnap.docs
                        .map(d => ({ id: d.id, ...d.data() } as ActionLog))
                        .filter(a => {
                            const start = a.fromDate;
                            const end = a.toDate;
                            // Overlap check for actions
                            return (start <= monthEnd && end >= monthStart);
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
                        const dateDiff = dateA.localeCompare(dateB);
                        if (dateDiff !== 0) return dateDiff;
                        const tA = a.createdAt?.seconds || 0;
                        const tB = b.createdAt?.seconds || 0;
                        return tA - tB;
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
                 if (parts.length > 2 && parts[2]) {
                     display += ` - ${parts[2]}`;
                 }
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

        const upperDisplay = display.toUpperCase();
        let occasionSuffix = null;

        // ** Priority: Manual Flag **
        if (sch.isRamadan === true) {
            occasionSuffix = 'RAMADAN';
        } else {
            if (sch.date) {
                const national = getNationalHoliday(sch.date);
                if (national) {
                    occasionSuffix = national.name;
                } else {
                    const eid = getEidName(sch.date);
                    if (eid) {
                         occasionSuffix = eid;
                    } else if (sch.isRamadan === undefined) {
                         if (getIslamicOccasion(sch.date) === 'ramadan') {
                             occasionSuffix = 'RAMADAN';
                         }
                    }
                }
            } 
            else if (sch.locationId === 'Holiday Shift') {
                occasionSuffix = getEidNameForRange(sch.validFrom, sch.validTo);
            }
            else {
                if (sch.isRamadan === undefined) {
                    const isRamadan = checkRamadanOverlap(sch.validFrom, sch.validTo, sch.month);
                    if (isRamadan) occasionSuffix = 'RAMADAN';
                }
            }
        }

        if (occasionSuffix) {
             if (!upperDisplay.includes(occasionSuffix) && !(sch.note || '').toUpperCase().includes(occasionSuffix)) {
                 display += ` - ${occasionSuffix}`;
             }
        }

        return display;
    }, [locations]);

    // Enhanced Status Logic with Absence Detection AND Manual Flag
    const getTicketStatus = (sch: Schedule) => {
        if (sch.locationId === 'LEAVE_ACTION') {
            if ((sch.note || '').includes('absence')) return { label: 'ABSENT', theme: 'red', icon: 'fa-user-slash', isAction: true };
            return { label: 'ON LEAVE', theme: 'purple', icon: 'fa-umbrella-beach', isAction: true };
        }

        const isSwap = (sch.locationId || '').toLowerCase().includes('swap') || (sch.note || '').toLowerCase().includes('swap');
        
        // ** Check Manual Ramadan Flag **
        const isManualRamadan = sch.isRamadan === true;
        const isExplicitNotRamadan = sch.isRamadan === false;

        if (!sch.date) {
          let isRamadanRange = false;
          if (isManualRamadan) isRamadanRange = true;
          else if (isExplicitNotRamadan) isRamadanRange = false;
          else isRamadanRange = checkRamadanOverlap(sch.validFrom, sch.validTo, sch.month);
          
          const isEidRange = checkEidOverlap(sch.validFrom, sch.validTo, sch.month);

          if(sch.locationId === 'common_duty') return { label: isRamadanRange ? 'RAMADAN' : 'GENERAL', theme: isRamadanRange ? 'indigo' : 'purple', icon: isRamadanRange ? 'fa-moon' : 'fa-layer-group', isHoliday: false, isRamadan: isRamadanRange };
          
          if(sch.locationId === 'Holiday Shift') {
              if (isEidRange) return { label: 'EID MUBARAK', theme: 'teal', icon: 'fa-star', isHoliday: true, isEid: true };
              return { label: 'HOLIDAY', theme: 'rose', icon: 'fa-gift', isHoliday: true };
          }
          
          if (isSwap) return { label: 'SWAP', theme: 'violet', icon: 'fa-exchange-alt', pulse: true };
          
          return { label: isRamadanRange ? 'RAMADAN' : 'GENERAL', theme: isRamadanRange ? 'indigo' : 'indigo', icon: isRamadanRange ? 'fa-moon' : 'fa-calendar-alt', isRamadan: isRamadanRange };
        }
        
        const shiftDate = parseDateString(sch.date) || new Date();
        const today = new Date(); 
        today.setHours(0,0,0,0); 
        shiftDate.setHours(0,0,0,0);
        
        const occasion = getIslamicOccasion(sch.date);
        let isRamadan = false;
        if (isManualRamadan) isRamadan = true;
        else if (isExplicitNotRamadan) isRamadan = false;
        else isRamadan = occasion === 'ramadan';

        const isEid = occasion === 'eid';
        const national = getNationalHoliday(sch.date);

        if (shiftDate < today) {
            if (!punchedDates.has(sch.date)) {
                return { label: 'ABSENT', theme: 'red', icon: 'fa-times-circle', isAbsent: true };
            }
            if (national) return { label: 'COMPLETED', theme: 'emerald', icon: 'fa-check-circle', grayscale: true, isNational: true };
            if (isRamadan) return { label: 'COMPLETED', theme: 'indigo', icon: 'fa-check-circle', grayscale: true, isRamadan: true };
            return { label: 'COMPLETED', theme: 'slate', icon: 'fa-check-circle', grayscale: true };
        }

        if (isSwap) return { label: 'SWAP', theme: 'violet', icon: 'fa-exchange-alt', pulse: true, isRamadan, isEid };
        
        if (shiftDate.getTime() === today.getTime()) {
            return { label: 'TODAY', theme: 'amber', icon: 'fa-briefcase', pulse: true, isRamadan, isEid, isNational: !!national };
        }
        
        if (national) return { label: national.name, theme: 'emerald', icon: national.icon, isNational: true };
        if (isEid) return { label: 'EID MUBARAK', theme: 'teal', icon: 'fa-star', isEid: true };
        if (isRamadan) return { label: 'RAMADAN', theme: 'indigo', icon: 'fa-moon', isRamadan: true };

        if (sch.locationId.includes('Friday')) return { label: 'FRIDAY', theme: 'emerald', icon: 'fa-mosque' };
        if (sch.locationId.includes('Holiday')) return { label: 'HOLIDAY', theme: 'rose', icon: 'fa-gift' };
        
        return { label: 'UPCOMING', theme: 'sky', icon: 'fa-calendar-day' };
    };

    const getGradient = (theme: string, isGrayscale: boolean, isRamadan?: boolean, isEid?: boolean, isNational?: boolean, isAbsent?: boolean) => {
        if (isAbsent) return 'bg-gradient-to-br from-red-50 to-red-100 border-red-300 text-red-800';
        if (isGrayscale) return 'bg-gradient-to-r from-slate-200 to-slate-300 text-slate-500 border-slate-300';
        
        // NATIONAL THEME: Green/Gold
        if (isNational) return 'bg-gradient-to-br from-emerald-700 via-green-800 to-teal-900 text-white border-amber-400';

        // RAMADAN THEME: Deep Blue/Gold
        if (isRamadan) return 'bg-gradient-to-br from-indigo-900 via-slate-800 to-indigo-900 text-amber-100 border-amber-500/50';
        
        // EID THEME: Vibrant
        if (isEid) return 'bg-gradient-to-br from-rose-600 via-pink-500 to-red-500 text-white border-pink-300';

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

    if (loading) return <Loading />;

    return (
        <div className="max-w-5xl mx-auto px-4 pb-20 pt-6 animate-fade-in" dir={dir}>
            
            {/* Header */}
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
                        // If it's a holiday, we've extracted the title for the main header, 
                        // so don't show the redundant part in custom note unless there's a third part
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

                    // Validity Logic
                    const isValidityTicket = !sch.date && sch.validFrom;
                    const validFromStr = sch.validFrom ? formatDateSimple(sch.validFrom) : '???';
                    const validToStr = sch.validTo ? formatDateSimple(sch.validTo) : 'End of Month';

                    // Parse date for display if available
                    let displayDateObj = sch.date ? parseDateString(sch.date) : null;

                    return (
                        <div key={sch.id} className="relative group w-full flex flex-col md:flex-row shadow-2xl transition-all duration-500 transform hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-3xl overflow-hidden">
                            
                            {/* --- MAIN TICKET SECTION (LEFT) --- */}
                            <div className={`flex-1 relative overflow-hidden ${gradientClass} p-0 flex flex-col`}>
                                
                                {/* Decorations */}
                                {status.isNational && (
                                    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                                        <div className="absolute top-[-50%] right-[-10%] w-[80%] h-[150%] bg-white/5 skew-x-12"></div>
                                        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-black/20 to-transparent"></div>
                                        <div className="absolute inset-0 flex items-center justify-center opacity-10">
                                            {/* Palm Tree Icon or Similar for Saudi Identity */}
                                            <i className="fas fa-chess-rook text-[15rem] text-white transform rotate-12"></i>
                                        </div>
                                    </div>
                                )}

                                {status.isRamadan && (
                                    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                                         {/* The Hanging Rope (Zina) */}
                                         <svg className="absolute top-0 left-0 w-full h-16 text-amber-200/50" preserveAspectRatio="none" viewBox="0 0 100 15">
                                           <path d="M0 0 Q 50 15 100 0" stroke="currentColor" fill="none" strokeWidth="0.5" />
                                         </svg>
                                         
                                         {/* Hanging Ornaments */}
                                         <div className="absolute top-0 left-[15%] flex flex-col items-center animate-swing origin-top">
                                             <div className="h-8 w-px bg-amber-200/50"></div>
                                             <i className="fas fa-star text-amber-300 text-lg drop-shadow-md"></i>
                                         </div>
                                         <div className="absolute top-0 left-[50%] flex flex-col items-center animate-swing origin-top delay-700">
                                             <div className="h-12 w-px bg-amber-200/50"></div>
                                             <i className="fas fa-moon text-amber-200 text-2xl drop-shadow-md"></i>
                                         </div>
                                         <div className="absolute top-0 left-[85%] flex flex-col items-center animate-swing origin-top delay-300">
                                             <div className="h-6 w-px bg-amber-200/50"></div>
                                             <i className="fas fa-star text-amber-300 text-lg drop-shadow-md"></i>
                                         </div>

                                         {/* The Big Central Mosque */}
                                         <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                                            <i className="fas fa-mosque text-[12rem] md:text-[18rem] text-white transform scale-125 translate-y-10"></i>
                                         </div>
                                         
                                          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] opacity-10 mix-blend-overlay"></div>
                                    </div>
                                )}

                                {status.isEid && (
                                  <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                                     {/* Confetti / Lights */}
                                     <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-yellow-300/20 rounded-full blur-3xl"></div>
                                     <div className="absolute bottom-[-50px] left-[-50px] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                                     
                                     {/* Floating Balloons/Gifts */}
                                     <div className="absolute top-4 right-10 text-white/30 text-4xl animate-bounce duration-[3000ms]">
                                        <i className="fas fa-gift"></i>
                                     </div>
                                     <div className="absolute top-10 left-10 text-white/20 text-3xl animate-pulse delay-500">
                                        <i className="fas fa-star"></i>
                                     </div>
                                     <div className="absolute bottom-10 right-20 text-white/10 text-5xl animate-spin-slow">
                                         <i className="fas fa-bahai"></i>
                                     </div>

                                     {/* Radial Pattern */}
                                     <div className="absolute inset-0 bg-white/5 mix-blend-overlay" style={{backgroundImage: 'radial-gradient(circle, #fff 10%, transparent 10%)', backgroundSize: '15px 15px'}}></div>
                                  </div>
                                )}
                                
                                {/* Standard Noise Texture */}
                                <div className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none" style={{backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")'}}></div>
                                
                                {/* Validity Banner */}
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
                                    {/* Top Row: Date & Status */}
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
                                                <span className="text-2xl font-black uppercase tracking-tight font-oswald leading-none">{sch.periodName || status.label}</span>
                                                <span className="text-[10px] uppercase tracking-[0.3em] opacity-60">Schedule</span>
                                            </div>
                                        )}
                                        
                                        {!isValidityTicket && (
                                            <div className={`bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg border border-white/20 text-[10px] font-black uppercase tracking-widest shadow-sm ${status.isAbsent ? 'text-red-900 bg-red-100 border-red-200' : 'text-white'}`}>
                                                {status.isRamadan ? <><i className="fas fa-moon text-amber-300 mr-1"></i> RAMADAN</> : (sch.periodName || status.label)}
                                            </div>
                                        )}
                                    </div>

                                    {/* Middle Row: Location or Action */}
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

                                    {/* Bottom Row: Shifts (Hide if Absent) */}
                                    {sch.locationId !== 'LEAVE_ACTION' && !status.isAbsent && (
                                        <div className="mt-auto space-y-3">
                                            {displayShifts.map((s, i) => (
                                                <div key={i} className={`flex items-center gap-4 bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-white/10 hover:bg-black/30 transition-colors group/shift ${status.isRamadan ? 'border-amber-500/30' : ''}`}>
                                                    <div className="flex flex-col min-w-[60px]">
                                                        <span className="text-[9px] uppercase font-bold opacity-50 tracking-wider">Start</span>
                                                        <span className={`text-xl font-mono font-bold tracking-tight group-hover/shift:text-emerald-300 transition-colors ${status.isRamadan ? 'text-amber-200' : status.isNational ? 'text-amber-100' : 'text-white'}`}>{formatTime12(s.start)}</span>
                                                    </div>
                                                    
                                                    {/* Visual Flight Path */}
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
                                    
                                    {/* ABSENT STAMP */}
                                    {status.isAbsent && (
                                        <div className="mt-auto p-4 border-2 border-dashed border-red-300 bg-white/50 rounded-xl text-center">
                                            <p className="text-red-700 font-bold text-sm">NO ATTENDANCE RECORD</p>
                                            <p className="text-red-500 text-[10px] mt-1">Please contact supervisor if this is an error.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* --- PERFORATION (MOBILE: HORIZONTAL, DESKTOP: VERTICAL) --- */}
                            <div className="relative flex-shrink-0 w-full h-6 md:w-6 md:h-auto bg-[#f1f5f9] flex md:flex-col items-center justify-between overflow-hidden z-20">
                                {/* The Holes */}
                                <div className="absolute -left-3 md:left-auto md:-top-3 w-6 h-6 bg-[#f1f5f9] rounded-full z-30 shadow-inner"></div>
                                <div className="absolute -right-3 md:right-auto md:-bottom-3 w-6 h-6 bg-[#f1f5f9] rounded-full z-30 shadow-inner"></div>
                                
                                {/* Dashed Line */}
                                <div className="w-full h-[2px] md:w-[2px] md:h-full border-b-2 md:border-b-0 md:border-r-2 border-dashed border-slate-300 my-auto md:mx-auto"></div>
                            </div>

                            {/* --- STUB SECTION (RIGHT/BOTTOM) --- */}
                            <div className={`w-full md:w-56 bg-white p-6 flex flex-row md:flex-col items-center justify-between gap-4 border-2 border-dashed border-slate-100 ${status.grayscale ? 'opacity-60' : ''}`}>
                                
                                <div className="text-center w-full hidden md:block">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Class</p>
                                    <div className={`inline-block px-4 py-1 rounded-full border-2 font-black text-xs uppercase ${status.theme === 'amber' ? 'border-amber-500 text-amber-600 bg-amber-50' : 'border-slate-800 text-slate-800 bg-slate-50'}`}>
                                        STANDARD
                                    </div>
                                </div>

                                {/* Barcode Vertical on Desktop, Horizontal on Mobile */}
                                <div className="w-24 md:w-full md:h-24 opacity-60 mix-blend-multiply rotate-90 md:rotate-0">
                                    <Barcode />
                                </div>

                                <div className="text-right md:text-center">
                                    <i className={`fas ${status.icon} text-3xl md:text-5xl mb-2 text-slate-200 block ${status.isRamadan ? 'text-amber-400' : ''}`}></i>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Boarding</p>
                                    <p className={`text-lg font-black ${status.grayscale ? 'text-slate-500' : 'text-slate-800'}`}>
                                        {sch.periodName || status.label}
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
