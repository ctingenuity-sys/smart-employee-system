import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Schedule, Location, User } from '../types';
import Loading from '../components/Loading';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

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

const SHIFT_DESCRIPTIONS: Record<string, string> = {
    'Straight Morning': '9am-5pm\nXRAYS + USG',
    'Straight Evening': '5pm-1am\nXRAYS + USG',
};

// --- Personal Notepad Component ---
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

// --- Visual CSS Barcode Component ---
const Barcode: React.FC = () => (
    <div className="flex justify-center items-center h-8 w-full overflow-hidden opacity-60 mix-blend-multiply gap-[2px]">
        {[...Array(20)].map((_, i) => (
            <div key={i} className="bg-current h-full" style={{ width: Math.random() > 0.5 ? '2px' : '4px' }}></div>
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

    useEffect(() => {
        setLoading(true);
        // Locations
        const unsubLocs = onSnapshot(collection(db, 'locations'), (snap) => {
            setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
        });

        // Schedules
        if (currentUserId) {
            const q = query(collection(db, 'schedules'), where('userId', '==', currentUserId), where('month', '==', selectedMonth));
            const unsubSch = onSnapshot(q, snap => {
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Schedule));
                // Sort by date
                data.sort((a, b) => {
                    const dateA = a.date || a.validFrom || '9999-99-99';
                    const dateB = b.date || b.validFrom || '9999-99-99';
                    return dateA.localeCompare(dateB);
                });
                setSchedules(data);
                setLoading(false);
            });
            return () => { unsubLocs(); unsubSch(); }
        }
        setLoading(false);
        return () => { unsubLocs(); }
    }, [selectedMonth, currentUserId]);

    const getLocationName = useCallback((sch: Schedule) => {
        if (sch.locationId === 'common_duty' && sch.note) {
            return sch.note.split(' - ')[0]; 
        }
        const l = locations.find(loc => loc.id === sch.locationId);
        return l ? l.name : sch.locationId;
    }, [locations]);

    const getTicketStatus = (sch: Schedule) => {
        const isSwap = (sch.locationId || '').toLowerCase().includes('swap') || (sch.note || '').toLowerCase().includes('swap');
        if (!sch.date) {
          if(sch.locationId === 'common_duty') return { label: 'RECURRING', theme: 'purple', icon: 'fa-star' };
          if(sch.locationId === 'Holiday Shift') return { label: 'HOLIDAY', theme: 'rose', icon: 'fa-gift', isHoliday: true };
          if (isSwap) return { label: 'SWAP', theme: 'violet', icon: 'fa-exchange-alt', pulse: true };
          return { label: 'GENERAL', theme: 'blue', icon: 'fa-calendar' };
        }
        
        const shiftDate = new Date(sch.date);
        const today = new Date(); today.setHours(0,0,0,0); shiftDate.setHours(0,0,0,0);
        
        if (shiftDate < today) return { label: 'COMPLETED', theme: 'slate', icon: 'fa-check-circle', grayscale: true };
        if (isSwap) return { label: 'SWAP', theme: 'violet', icon: 'fa-exchange-alt', pulse: true };
        if (shiftDate.getTime() === today.getTime()) return { label: 'TODAY', theme: 'amber', icon: 'fa-briefcase', pulse: true };
        if (sch.locationId.includes('Friday')) return { label: 'FRIDAY', theme: 'teal', icon: 'fa-mosque' };
        if (sch.locationId.includes('Holiday')) return { label: 'HOLIDAY', theme: 'rose', icon: 'fa-gift' };
        return { label: 'UPCOMING', theme: 'sky', icon: 'fa-calendar-day' };
    };

    const getGradient = (theme: string, isGrayscale: boolean) => {
        if (isGrayscale) return 'bg-gradient-to-r from-slate-200 to-slate-300 text-slate-500 border-slate-300';
        
        const themes: Record<string, string> = {
            purple: 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white border-purple-500',
            rose: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white border-rose-500',
            blue: 'bg-gradient-to-br from-blue-500 to-cyan-600 text-white border-blue-500',
            amber: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white border-amber-500',
            violet: 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white border-violet-500',
            teal: 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white border-teal-500',
            sky: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white border-sky-500',
            slate: 'bg-gradient-to-br from-slate-500 to-slate-700 text-white border-slate-500'
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
                <div className="grid grid-cols-1 gap-6">
                  {schedules.map((sch) => {
                    const status = getTicketStatus(sch);
                    const gradientClass = getGradient(status.theme || 'blue', status.grayscale || false);
                    
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
                    if (!displayShifts || displayShifts.length === 0) displayShifts = [{ start: '08:00', end: '16:00' }];

                    return (
                        <div key={sch.id} className="relative group w-full flex flex-col md:flex-row shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                            
                            {/* --- MAIN TICKET SECTION (LEFT) --- */}
                            <div className={`flex-1 rounded-t-3xl md:rounded-l-3xl md:rounded-tr-none relative overflow-hidden ${gradientClass}`}>
                                {/* Background Pattern/Noise */}
                                <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '10px 10px'}}></div>
                                
                                {/* Status Badge (Absolute) */}
                                <div className="absolute top-4 right-4 bg-black/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-widest text-white shadow-sm">
                                    {status.label}
                                </div>

                                <div className="p-6 md:p-8 flex flex-col h-full relative z-10">
                                    {/* Date Header */}
                                    <div className="flex items-end gap-3 mb-6">
                                        {sch.date ? (
                                            <>
                                                <span className="text-6xl font-black leading-none tracking-tighter drop-shadow-md">{new Date(sch.date).getDate()}</span>
                                                <div className="flex flex-col pb-1">
                                                    <span className="text-sm font-bold uppercase tracking-widest opacity-80">{new Date(sch.date).toLocaleString('en-US', { month: 'short' })}</span>
                                                    <span className="text-xs font-medium opacity-70">{new Date(sch.date).toLocaleString('en-US', { weekday: 'long' })}</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <i className={`fas ${status.icon} text-4xl opacity-80`}></i>
                                                <span className="text-2xl font-black uppercase tracking-wide">Recurring</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Location Info */}
                                    <div className="mb-6">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mb-1">Assigned Location</p>
                                        <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tight leading-none drop-shadow-sm">{getLocationName(sch)}</h3>
                                        {customNote && ( <div className="mt-2 inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg text-xs font-bold shadow-sm border border-white/10"><i className="fas fa-info-circle"></i> {customNote}</div> )}
                                        {detailedDesc && ( <p className="mt-2 text-xs font-medium opacity-80 max-w-sm leading-relaxed">{detailedDesc}</p> )}
                                    </div>

                                    {/* Shifts List */}
                                    <div className="mt-auto space-y-2">
                                        {displayShifts.map((s, i) => (
                                            <div key={i} className="flex items-center gap-4 bg-black/10 rounded-xl p-3 border border-white/5">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold opacity-60">Start</span>
                                                    <span className="text-lg font-mono font-bold tracking-tight">{formatTime12(s.start)}</span>
                                                </div>
                                                <div className="flex-1 border-b-2 border-dashed border-white/30 h-2 relative">
                                                    <i className="fas fa-plane absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[10px] opacity-50"></i>
                                                </div>
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[10px] uppercase font-bold opacity-60">End</span>
                                                    <span className="text-lg font-mono font-bold tracking-tight">{formatTime12(s.end)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* --- PERFORATION / TEAR LINE --- */}
                            <div className="relative flex-shrink-0 w-full h-4 md:w-4 md:h-auto bg-[#f8fafc] flex md:flex-col items-center justify-between overflow-hidden z-20">
                                {/* The "Holes" - Using pseudo elements or masking is cleaner but this works reliably */}
                                <div className="absolute -left-3 md:left-auto md:-top-3 w-6 h-6 bg-[#f8fafc] rounded-full z-30"></div>
                                <div className="absolute -right-3 md:right-auto md:-bottom-3 w-6 h-6 bg-[#f8fafc] rounded-full z-30"></div>
                                
                                {/* Dashed Line */}
                                <div className="w-full h-full border-b-2 md:border-b-0 md:border-r-2 border-dashed border-slate-300/80 my-2 md:mx-2"></div>
                            </div>

                            {/* --- STUB SECTION (RIGHT) --- */}
                            <div className={`w-full md:w-48 bg-white rounded-b-3xl md:rounded-r-3xl md:rounded-bl-none p-6 flex flex-col items-center justify-between border-2 border-l-0 border-slate-100 ${status.grayscale ? 'opacity-60' : ''}`}>
                                
                                <div className="text-center w-full">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Ticket Class</p>
                                    <div className={`inline-block px-3 py-1 rounded border-2 font-black text-sm uppercase ${status.theme === 'amber' ? 'border-amber-500 text-amber-600' : 'border-slate-800 text-slate-800'}`}>
                                        Standard
                                    </div>
                                </div>

                                <div className="my-4 w-full opacity-30">
                                    <Barcode />
                                </div>

                                <div className="text-center">
                                    <i className={`fas ${status.icon} text-4xl mb-2 ${status.grayscale ? 'text-slate-300' : 'text-slate-800'}`}></i>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Boarding</p>
                                    <p className={`text-sm font-bold ${status.grayscale ? 'text-slate-500' : 'text-slate-800'}`}>
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