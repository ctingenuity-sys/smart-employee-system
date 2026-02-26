
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, getDocs } from 'firebase/firestore';
import { User, Schedule, Location } from '../../types';
import Loading from '../../components/Loading';
import { useLanguage } from '../../contexts/LanguageContext';
import { PrintHeader, PrintFooter } from '../../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const getPreviousMonths = (count: number) => {
    const months = [];
    const d = new Date();
    d.setDate(1); 
    for (let i = 0; i < count; i++) {
        const m = new Date(d);
        m.setMonth(d.getMonth() - i);
        months.push(m.toISOString().slice(0, 7)); 
    }
    return months.reverse(); 
};

// --- CONFIGURATION: Job Category Visuals & Order ---
const CATEGORY_CONFIG: Record<string, { label: string, order: number, color: string, headerBg: string, icon: string }> = {
    'doctor': { 
        label: 'Doctors / Consultants', 
        order: 1, 
        color: 'bg-rose-50 text-rose-700 border-rose-200',
        headerBg: 'bg-rose-100 text-rose-800',
        icon: 'fa-user-md'
    },
    'technologist': { 
        label: 'Specialists / Technologists', 
        order: 2, 
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        headerBg: 'bg-blue-100 text-blue-800',
        icon: 'fa-user-graduate'
    },
    'usg': {
        label: 'Ultrasound Team',
        order: 2.5,
        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        headerBg: 'bg-indigo-100 text-indigo-800',
        icon: 'fa-wave-square'
    },
    'technician': { 
        label: 'Technicians', 
        order: 3, 
        color: 'bg-amber-50 text-amber-700 border-amber-200',
        headerBg: 'bg-amber-100 text-amber-800',
        icon: 'fa-cogs'
    },
    'nurse': { 
        label: 'Nursing Staff', 
        order: 4, 
        color: 'bg-purple-50 text-purple-700 border-purple-200',
        headerBg: 'bg-purple-100 text-purple-800',
        icon: 'fa-user-nurse'
    },
    'rso': { 
        label: 'R.S.O', 
        order: 5, 
        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        headerBg: 'bg-indigo-100 text-indigo-800',
        icon: 'fa-radiation'
    },
    'other': { 
        label: 'Support Staff', 
        order: 99, 
        color: 'bg-slate-50 text-slate-600 border-slate-200',
        headerBg: 'bg-slate-200 text-slate-700',
        icon: 'fa-id-badge'
    }
};

// Department Colors Map - Enhanced for contrast
const DEPT_COLORS: Record<string, { bg: string, text: string }> = {
    'mri': { bg: 'bg-blue-600', text: 'text-white' },
    'ct': { bg: 'bg-emerald-600', text: 'text-white' },
    'us': { bg: 'bg-indigo-600', text: 'text-white' },
    'ultra': { bg: 'bg-indigo-600', text: 'text-white' },
    'x-ray': { bg: 'bg-slate-500', text: 'text-white' },
    'night': { bg: 'bg-slate-900', text: 'text-white' },
    'leave': { bg: 'bg-rose-100', text: 'text-rose-700' },
    'vacation': { bg: 'bg-rose-100', text: 'text-rose-700' },
    'emergency': { bg: 'bg-orange-600', text: 'text-white' },
    'fluo': { bg: 'bg-amber-600', text: 'text-white' },
    'off': { bg: 'bg-slate-100', text: 'text-slate-400' },
    'friday': { bg: 'bg-teal-600', text: 'text-white' }, 
};

// Interface to fix TS unknown errors
interface DetailedMonthData {
    departments: Set<string>;
    fridayCount: number;
}

const SupervisorRotation: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    
    // Filters
    const [monthsToView, setMonthsToView] = useState(6);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewType, setViewType] = useState<'general' | 'friday'>('general'); 
    
    // Data
    const [users, setUsers] = useState<User[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);

    const months = useMemo(() => getPreviousMonths(monthsToView), [monthsToView]);

    useEffect(() => {
        setLoading(true);
        getDocs(collection(db, 'users')).then((snap) => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });
        getDocs(collection(db, 'locations')).then((snap) => {
            setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
        });
        const oldestMonth = months[0];
        const qSch = query(collection(db, 'schedules'), where('month', '>=', oldestMonth));
        getDocs(qSch).then((snap) => {
            setSchedules(snap.docs.map(d => d.data() as Schedule));
            setLoading(false);
        });
        return () => {};
    }, [months]);

    // --- Processing Logic ---
    const rotationMatrix = useMemo(() => {
        const matrix: Record<string, Record<string, DetailedMonthData>> = {};
        
        schedules.forEach(sch => {
            if (!sch.month || !months.includes(sch.month)) return;

            if (!matrix[sch.userId]) matrix[sch.userId] = {};
            if (!matrix[sch.userId][sch.month]) {
                matrix[sch.userId][sch.month] = {
                    departments: new Set<string>(),
                    fridayCount: 0
                };
            }

            const isFridayShift = sch.locationId === 'Friday Shift' || (sch.note && sch.note.toLowerCase().includes('friday'));
            
            if (isFridayShift) {
                matrix[sch.userId][sch.month].fridayCount++;
            } else {
                let locName = sch.locationId;
                if (locName.startsWith('Swap Duty - ')) locName = locName.replace('Swap Duty - ', '');
                if (locName === 'common_duty' && sch.note) locName = sch.note.split('-')[0].trim();
                
                const resolvedLoc = locations.find(l => l.id === locName);
                const finalName = resolvedLoc ? resolvedLoc.name : locName;
                matrix[sch.userId][sch.month].departments.add(finalName);
            }
        });
        return matrix;
    }, [schedules, locations, months]);

    const filteredAndSortedUsers = useMemo(() => {
        return users
            .filter(u => {
                // Filter out Admins and Reception from Rotation view
                if (u.role === 'admin') return false; 
                if (u.jobCategory === 'admin' || u.jobCategory === 'reception') return false;

                return u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                       u.email.toLowerCase().includes(searchQuery.toLowerCase());
            })
            .sort((a, b) => {
                // Primary Sort: Job Category Order
                const catA = CATEGORY_CONFIG[a.jobCategory || 'technician']?.order || 99;
                const catB = CATEGORY_CONFIG[b.jobCategory || 'technician']?.order || 99;
                
                if (catA !== catB) return catA - catB;
                
                // Secondary Sort: Name
                return a.name.localeCompare(b.name);
            });
    }, [users, searchQuery]);

    const formatGeneralCell = (userId: string, month: string) => {
        const data = rotationMatrix[userId]?.[month];
        if (!data || data.departments.size === 0) return '-';
        return Array.from(data.departments).join(' + ');
    };

    const formatFridayCell = (userId: string, month: string) => {
        const data = rotationMatrix[userId]?.[month];
        if (!data || data.fridayCount === 0) return '0';
        return data.fridayCount.toString();
    };

    const getCellColor = (text: string) => {
        if (text === '-' || text === '0') return 'bg-slate-50 text-slate-300';
        const lower = text.toLowerCase();
        
        if (viewType === 'friday') {
            const count = parseInt(text);
            if (count >= 4) return 'bg-teal-700 text-white shadow-md';
            if (count >= 2) return 'bg-teal-500 text-white shadow-sm';
            return 'bg-teal-50 text-teal-700 border-teal-200';
        }

        const matchedKey = Object.keys(DEPT_COLORS).find(k => lower.includes(k));
        if (matchedKey) {
            const config = DEPT_COLORS[matchedKey];
            return `${config.bg} ${config.text}`;
        }

        return 'bg-white text-slate-700 border-slate-200 shadow-sm';
    };

    const getNextMonthSuggestion = (userId: string) => {
        if (viewType === 'friday') return null;
        const userHistory = rotationMatrix[userId];
        if (!userHistory) return null;

        const historyList = months.map(m => Array.from(userHistory[m]?.departments || []).join(' ')).filter(h => h !== '');
        if (historyList.length === 0) return null;

        const lastLocation = historyList[historyList.length - 1].toLowerCase();
        const secondLastLocation = historyList.length > 1 ? historyList[historyList.length - 2].toLowerCase() : null;

        if (lastLocation.includes('mri') && secondLastLocation?.includes('mri')) return 'CT Scan';
        if (lastLocation.includes('ct') && secondLastLocation?.includes('ct')) return 'MRI';
        if (lastLocation.includes('night')) return 'Morning Shift';
        
        return t('rot.suggest.stay');
    };

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            
            <PrintHeader title={`Staff Rotation: ${viewType === 'general' ? 'General' : 'Friday Shifts'}`} subtitle={`Historical Matrix (${monthsToView} Months)`} themeColor={viewType === 'friday' ? 'teal' : 'slate'} />

            <div className="max-w-7xl mx-auto px-4 py-6 print:p-0 print:max-w-none">
                
                {/* Header Area */}
                <div className="flex flex-col lg:flex-row justify-between items-center mb-10 gap-6 print:hidden">
                    <div className="flex items-center gap-5">
                        <button onClick={() => navigate('/supervisor')} className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-800 transition-all border border-slate-200 hover:border-slate-400">
                            <i className="fas fa-arrow-left rtl:rotate-180"></i>
                        </button>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">{t('nav.rotation')}</h1>
                            <p className="text-sm text-slate-500 font-bold opacity-80">{t('rot.subtitle')}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-[2rem] shadow-sm border border-slate-200 w-full lg:w-auto">
                        <div className="flex bg-slate-100 p-1.5 rounded-2xl mr-2">
                             <button 
                                onClick={() => setViewType('general')}
                                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${viewType === 'general' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                             >
                                <i className="fas fa-th-large"></i> {t('rot.filter.general')}
                             </button>
                             <button 
                                onClick={() => setViewType('friday')}
                                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${viewType === 'friday' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                             >
                                <i className="fas fa-calendar-day"></i> {t('rot.filter.friday')}
                             </button>
                        </div>

                        <div className="relative flex-1 lg:flex-none">
                            <i className="fas fa-search absolute top-3.5 left-4 text-slate-400 text-sm"></i>
                            <input 
                                className="pl-11 pr-4 py-2.5 bg-slate-50 rounded-2xl text-sm font-bold border-none outline-none focus:ring-2 focus:ring-slate-200 w-full lg:w-48 transition-all"
                                placeholder={t('search')}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="h-8 w-px bg-slate-200 mx-1 hidden lg:block"></div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('rot.filter.months')}</span>
                            <select 
                                className="bg-slate-50 border-none rounded-xl py-2.5 px-4 text-sm font-bold text-slate-700 cursor-pointer focus:ring-2 focus:ring-slate-100"
                                value={monthsToView}
                                onChange={e => setMonthsToView(parseInt(e.target.value))}
                            >
                                <option value={3}>3 {t('month')}</option>
                                <option value={6}>6 {t('month')}</option>
                                <option value={12}>12 {t('month')}</option>
                            </select>
                        </div>
                        <button onClick={() => window.print()} className="bg-slate-900 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-black transition-all shadow-md">
                            <i className="fas fa-print"></i>
                        </button>
                    </div>
                </div>

                {/* Legend Area */}
                <div className="flex flex-wrap items-center gap-6 mb-8 print:hidden">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('rot.legend')}</span>
                        <div className="flex flex-wrap gap-2">
                            {viewType === 'general' ? (
                                <>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 bg-blue-600 text-white rounded-lg shadow-sm">MRI</span>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg shadow-sm">CT</span>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg shadow-sm">U.S</span>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 bg-slate-900 text-white rounded-lg shadow-sm">NIGHT</span>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 bg-rose-100 text-rose-700 rounded-lg shadow-sm border border-rose-200">LEAVE</span>
                                </>
                            ) : (
                                <>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 bg-teal-50 text-teal-700 border border-teal-100 rounded-lg">1-2 Shifts</span>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 bg-teal-500 text-white rounded-lg shadow-sm">2-3 Shifts</span>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 bg-teal-700 text-white rounded-lg shadow-md animate-pulse">4+ Shifts</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* MAIN TABLE */}
                <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-200 overflow-hidden print:shadow-none print:border-2 print:border-black print:rounded-none">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-100 print:bg-slate-200 print:text-black">
                                    <th className="p-6 min-w-[260px] sticky left-0 bg-slate-50 z-20 print:bg-slate-200 print:border-black shadow-[4px_0_10px_rgba(0,0,0,0.02)] print:shadow-none">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-id-card text-slate-400"></i>
                                            <span className="tracking-widest text-[11px]">{t('rot.staff')}</span>
                                        </div>
                                    </th>
                                    {months.map(m => (
                                        <th key={m} className="p-6 text-center border-b border-slate-100 min-w-[130px]">
                                            <div className="flex flex-col items-center">
                                                <span className="text-[10px] opacity-60 font-bold">{m.split('-')[0]}</span>
                                                <span className="text-sm font-black text-slate-800">{new Date(m).toLocaleString('default', { month: 'short' })}</span>
                                            </div>
                                        </th>
                                    ))}
                                    {viewType === 'general' && (
                                        <th className="p-6 text-center min-w-[150px] bg-slate-100/50 print:hidden">
                                            <div className="flex flex-col items-center">
                                                <i className="fas fa-magic text-purple-500 mb-1"></i>
                                                <span className="text-[11px] font-black text-purple-700 tracking-tight">{t('rot.suggest')}</span>
                                            </div>
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredAndSortedUsers.map((user, index) => {
                                    // Check if this user starts a new category group
                                    const prevUser = filteredAndSortedUsers[index - 1];
                                    const currCatId = user.jobCategory || 'technician';
                                    const prevCatId = prevUser ? (prevUser.jobCategory || 'technician') : null;
                                    
                                    const showHeader = currCatId !== prevCatId;
                                    const config = CATEGORY_CONFIG[currCatId] || CATEGORY_CONFIG['other'];

                                    return (
                                    <React.Fragment key={user.id}>
                                        {/* SECTION HEADER ROW */}
                                        {showHeader && (
                                            <tr className={`${config.headerBg} print:bg-slate-100 print:text-black`}>
                                                <td colSpan={months.length + 2} className="px-6 py-2 border-y border-white/20 print:border-slate-300">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-6 h-6 rounded-full bg-white/30 flex items-center justify-center text-xs shadow-sm`}>
                                                            <i className={`fas ${config.icon}`}></i>
                                                        </div>
                                                        <span className="text-xs font-black uppercase tracking-widest">{config.label} GROUP</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        <tr className="hover:bg-slate-50/50 transition-all group print:break-inside-avoid">
                                            {/* Employee Column */}
                                            <td className="p-4 border-r border-slate-50 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[4px_0_10px_rgba(0,0,0,0.02)] print:border-black print:text-black print:shadow-none">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm transition-transform group-hover:scale-105 ${config.color.split(' ')[0]}`}>
                                                        <i className={`fas ${config.icon} ${config.color.split(' ')[1]}`}></i>
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-slate-900 text-sm leading-tight mb-1">{user.name}</h4>
                                                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${config.color}`}>
                                                            {config.label.split('/')[0]}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            
                                            {/* History Month Cells */}
                                            {months.map(m => {
                                                const content = viewType === 'general' ? formatGeneralCell(user.id, m) : formatFridayCell(user.id, m);
                                                const colorClass = getCellColor(content);
                                                
                                                return (
                                                    <td key={m} className="p-3 text-center align-middle">
                                                        {viewType === 'friday' ? (
                                                            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-black text-xs border transition-all duration-300 transform group-hover:scale-110 ${colorClass} print:text-black print:border-black print:bg-transparent`}>
                                                                {content}
                                                            </div>
                                                        ) : (
                                                            <div className={`px-2 py-3 rounded-2xl font-black text-[10px] leading-tight tracking-tight transition-all duration-300 transform group-hover:scale-[1.03] border border-transparent ${content !== '-' ? 'shadow-lg shadow-slate-200' : ''} ${colorClass} print:border-black print:bg-transparent print:text-black print:shadow-none`}>
                                                                {content}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}

                                            {/* Smart Suggestion Column (General Only) */}
                                            {viewType === 'general' && (
                                                <td className="p-3 text-center align-middle bg-slate-50/30 print:hidden">
                                                    {(() => {
                                                        const suggestion = getNextMonthSuggestion(user.id);
                                                        if (!suggestion) return <span className="text-slate-300">...</span>;
                                                        const isStay = suggestion === t('rot.suggest.stay');
                                                        return (
                                                            <div className={`inline-flex flex-col px-3 py-1.5 rounded-xl font-black text-[10px] border shadow-sm ${isStay ? 'bg-white text-slate-400 border-slate-100' : 'bg-purple-50 text-purple-700 border-purple-100 animate-pulse-slow'}`}>
                                                                <span className="uppercase opacity-60 text-[8px] mb-0.5">{isStay ? 'Insight' : t('rot.suggest.move')}</span>
                                                                {suggestion}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                            )}
                                        </tr>
                                    </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {/* Info Card */}
                <div className="mt-10 bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden print:hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 opacity-10 rounded-full blur-[80px] -mr-32 -mt-32"></div>
                    <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
                        <div className="max-w-xl">
                            <h3 className="text-xl font-black mb-3 flex items-center gap-2">
                                <i className={`fas ${viewType === 'general' ? 'fa-lightbulb' : 'fa- mosq-mosque'} ${viewType === 'general' ? 'text-amber-400' : 'text-teal-400'}`}></i>
                                {viewType === 'general' ? t('rot.suggest') : t('rot.filter.friday')}
                            </h3>
                            <p className="text-slate-400 text-sm font-medium leading-relaxed">
                                {viewType === 'general' 
                                    ? 'يحلل النظام حركة الموظفين عبر الأقسام. يتم اقتراح التدوير للموظفين الذين أمضوا أكثر من شهرين متتاليين في نفس القسم التخصصي لضمان توزيع الخبرات.'
                                    : 'يعرض هذا العرض "تكرار" مناوبات الجمعة لكل موظف. الرقم يمثل عدد الجمع التي غطاها الموظف في ذلك الشهر، مما يساعدك على تجنب إجهاد نفس الموظف بجمعات متتالية.'
                                }
                            </p>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-white/10 p-4 rounded-3xl border border-white/10 text-center min-w-[120px]">
                                <span className="block text-2xl font-black">{filteredAndSortedUsers.length}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Staff</span>
                            </div>
                            <div className="bg-white/10 p-4 rounded-3xl border border-white/10 text-center min-w-[120px]">
                                <span className="block text-2xl font-black text-purple-400">{filteredAndSortedUsers.filter(u => getNextMonthSuggestion(u.id) !== t('rot.suggest.stay')).length}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Analytics Ready</span>
                            </div>
                        </div>
                    </div>
                </div>

                <PrintFooter themeColor={viewType === 'friday' ? 'teal' : 'slate'} />
            </div>
        </div>
    );
};

export default SupervisorRotation;
