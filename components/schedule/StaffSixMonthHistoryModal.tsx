import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, getDocs } from 'firebase/firestore';
import Modal from '../Modal';
import { User, Schedule, Location } from '../../types';
import { GenderBadge } from './GenderIndicator';
import { getSoftStaffColor, detectShiftPeriod, detectVacationForMonth, MonthVacationInfo, VACATION_STYLE } from './scheduleColorUtils';

interface StaffSixMonthHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    allUsers?: User[];
    locations: Location[];
    monthlyPublishes: Record<string, any>;
    schedules: Schedule[];
    leaveRequests?: any[];
    selectedDepartmentId?: string | null;
    initialReferenceMonth?: string;
    isDark: boolean;
    dir: 'rtl' | 'ltr';
}

const addMonthsToMonthStr = (monthStr: string, delta: number): string => {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, (m - 1) + delta, 1, 12, 0, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const getCurrentMonthStr = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const StaffSixMonthHistoryModal: React.FC<StaffSixMonthHistoryModalProps> = ({
    isOpen,
    onClose,
    user,
    locations,
    monthlyPublishes,
    schedules,
    leaveRequests = [],
    selectedDepartmentId,
    initialReferenceMonth,
    isDark,
    dir
}) => {
    const [referenceMonth, setReferenceMonth] = useState<string>(() => initialReferenceMonth || getCurrentMonthStr());
    const [copied, setCopied] = useState(false);
    const [fetchedLeaves, setFetchedLeaves] = useState<any[]>([]);

    // Fallback: Fetch leaves if not passed from parent
    useEffect(() => {
        if (!isOpen) return;
        if (leaveRequests && leaveRequests.length > 0) return;

        let isMounted = true;
        getDocs(collection(db, 'leaveRequests'))
            .then(snap => {
                if (isMounted) {
                    setFetchedLeaves(snap.docs.map(d => ({ ...(d.data() as any), id: d.id })));
                }
            })
            .catch(() => {});
        return () => { isMounted = false; };
    }, [isOpen, leaveRequests]);

    const activeLeaves = useMemo(() => {
        return (leaveRequests && leaveRequests.length > 0) ? leaveRequests : fetchedLeaves;
    }, [leaveRequests, fetchedLeaves]);

    // Sync reference month when initialReferenceMonth changes
    React.useEffect(() => {
        if (initialReferenceMonth) {
            setReferenceMonth(initialReferenceMonth);
        }
    }, [initialReferenceMonth]);

    // Generate 6 months ending in referenceMonth (chronological order)
    const sixMonths = useMemo(() => {
        const list: string[] = [];
        for (let i = 5; i >= 0; i--) {
            list.push(addMonthsToMonthStr(referenceMonth, -i));
        }
        return list;
    }, [referenceMonth]);

    // Extract detailed rotation information for each of the 6 months
    const monthDetails = useMemo(() => {
        if (!user) return [];

        return sixMonths.map(month => {
            const [year, mNum] = month.split('-').map(Number);
            const dateObj = new Date(year, mNum - 1, 1);
            const monthNameAr = dateObj.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
            const monthNameEn = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

            const departmentsSet = new Set<string>();
            const timingSet = new Set<string>();
            let fridayCount = 0;
            let isPublishedSnapshot = false;
            let noteStr = '';

            // 1. Check monthly_publishes snapshot
            const pubKey1 = `${selectedDepartmentId}_${month}`;
            const pubKey2 = month;
            const pubDoc = monthlyPublishes[pubKey1] || monthlyPublishes[pubKey2];

            if (pubDoc) {
                const checkStaffList = (staffList: any[], locTitle: string, defaultTime: string) => {
                    if (!Array.isArray(staffList)) return;
                    staffList.forEach(s => {
                        const matchId = s.userId === user.id || s.id === user.id;
                        const matchName = s.name && user.name && String(s.name).trim().toLowerCase() === String(user.name).trim().toLowerCase();
                        if (matchId || matchName) {
                            departmentsSet.add(locTitle);
                            const t = s.time || defaultTime;
                            if (t && String(t).trim() !== '') timingSet.add(String(t).trim());
                            if (s.note) noteStr = s.note;
                        }
                    });
                };

                if (Array.isArray(pubDoc.generalData)) {
                    pubDoc.generalData.forEach((col: any) => checkStaffList(col.staff, col.title, col.defaultTime));
                }
                if (Array.isArray(pubDoc.commonDuties)) {
                    pubDoc.commonDuties.forEach((duty: any) => checkStaffList(duty.staff, duty.section, duty.time));
                }
                if (Array.isArray(pubDoc.doctorColumns)) {
                    pubDoc.doctorColumns.forEach((col: any) => checkStaffList(col.staff, col.title, col.defaultTime));
                }

                if (departmentsSet.size > 0) {
                    isPublishedSnapshot = true;
                }
            }

            // 2. Check schedules collection
            const userMonthSchedules = schedules.filter(s => s.userId === user.id && s.month === month);
            userMonthSchedules.forEach(sch => {
                const isFriday = sch.locationId === 'Friday Shift' || (sch.note && sch.note.toLowerCase().includes('friday'));
                if (isFriday) {
                    fridayCount++;
                } else if (!isPublishedSnapshot) {
                    let locName = sch.locationId;
                    if (locName.startsWith('Swap Duty - ')) locName = locName.replace('Swap Duty - ', '');
                    if (locName === 'common_duty' && sch.note) locName = sch.note.split('-')[0].trim();

                    const resolved = locations.find(l => l.id === locName);
                    const finalLocName = resolved ? resolved.name : locName;
                    departmentsSet.add(finalLocName);

                    if (sch.shiftTime) timingSet.add(sch.shiftTime);
                    if (sch.shifts && sch.shifts.length > 0) {
                        sch.shifts.forEach(sh => timingSet.add(`${sh.start} - ${sh.end}`));
                    }
                    if (sch.note) noteStr = sch.note;
                }
            });

            // Status determination
            const departments = Array.from(departmentsSet);
            const timings = Array.from(timingSet);
            const hasAssignment = departments.length > 0;
            const isCurrent = month === getCurrentMonthStr();

            // Vacation detection
            const vacation = detectVacationForMonth(
                month,
                user,
                activeLeaves,
                departments.join(' '),
                timings.join(' '),
                noteStr
            );

            return {
                month,
                monthNameAr,
                monthNameEn,
                departments,
                timings,
                fridayCount,
                hasAssignment,
                isCurrent,
                vacation
            };
        });
    }, [user, sixMonths, monthlyPublishes, schedules, locations, selectedDepartmentId, activeLeaves]);

    // Analytics computation
    const analytics = useMemo(() => {
        if (!monthDetails.length) return null;

        const activeMonthsCount = monthDetails.filter(m => m.hasAssignment || (m.vacation.hasVacation && m.vacation.isFullMonth)).length;
        const totalFridayDuties = monthDetails.reduce((sum, m) => sum + m.fridayCount, 0);
        const vacationMonthsCount = monthDetails.filter(m => m.vacation.hasVacation).length;

        // Modality/Department frequencies
        const deptFrequencies: Record<string, number> = {};
        monthDetails.forEach(m => {
            if (m.vacation.hasVacation && m.vacation.isFullMonth) {
                const vKey = dir === 'rtl' ? `🌴 ${m.vacation.leaveType || 'إجازة'}` : `🌴 Vacation`;
                deptFrequencies[vKey] = (deptFrequencies[vKey] || 0) + 1;
            } else {
                m.departments.forEach(dept => {
                    const cleanDept = dept.split('(')[0].trim();
                    deptFrequencies[cleanDept] = (deptFrequencies[cleanDept] || 0) + 1;
                });
            }
        });

        // Sorted by frequency
        const sortedDepts = Object.entries(deptFrequencies).sort((a, b) => b[1] - a[1]);
        const dominantDept = sortedDepts[0] ? { name: sortedDepts[0][0], count: sortedDepts[0][1] } : null;

        // Distinct visited departments
        const visitedDepts = new Set(Object.keys(deptFrequencies).filter(k => !k.includes('🌴')));

        // Available standard radiology/department sections
        const standardSections = locations.length > 0 
            ? locations.map(l => l.name)
            : ['CT', 'MRI', 'X-RAY', 'ULTRASOUND', 'FLUOROSCOPY', 'PORTABLE', 'EMERGENCY'];

        const unvisitedSections = standardSections.filter(sec => {
            const cleanSec = sec.toLowerCase();
            return !Array.from(visitedDepts).some(v => v.toLowerCase().includes(cleanSec) || cleanSec.includes(v.toLowerCase()));
        });

        return {
            activeMonthsCount,
            totalFridayDuties,
            vacationMonthsCount,
            deptFrequencies: sortedDepts,
            dominantDept,
            unvisitedSections: unvisitedSections.slice(0, 4),
            diversityScore: visitedDepts.size
        };
    }, [monthDetails, locations, dir]);

    // Copy formatted report to clipboard
    const handleCopyReport = () => {
        if (!user || !analytics) return;

        const lines: string[] = [
            `📋 تقرير روتيشن الموظف والإجازات (آخر 6 شهور)`,
            `━━━━━━━━━━━━━━━━━━━━━━`,
            `👤 الموظف: ${user.name} (${user.gender === 'female' ? 'أنثى ♀' : 'ذكر ♂'})`,
            `🏷️ التخصص: ${user.jobCategory || 'كادر فني'}`,
            `📅 الفترة: من ${monthDetails[0]?.monthNameAr} إلى ${monthDetails[monthDetails.length - 1]?.monthNameAr}`,
            `━━━━━━━━━━━━━━━━━━━━━━`,
            `📊 ملخص الروتيشن:`,
            `• الشهور النشطة/المغطاة: ${analytics.activeMonthsCount} من 6 شهور`,
            analytics.vacationMonthsCount > 0 ? `• شهور تخللتها إجازات: ${analytics.vacationMonthsCount} شهر` : '',
            `• إجمالي نوبات الجمعة: ${analytics.totalFridayDuties} نوبة`,
            analytics.dominantDept ? `• أكثر قسم تواجداً: ${analytics.dominantDept.name} (${analytics.dominantDept.count} أشهر)` : '',
            `━━━━━━━━━━━━━━━━━━━━━━`,
            `🗓️ التفاصيل الشهرية:`,
            ...monthDetails.map(m => {
                let statusLine = '';
                if (m.vacation.hasVacation && m.vacation.isFullMonth) {
                    statusLine = `🌴 ${m.vacation.labelAr} (${m.vacation.detailsAr})`;
                } else {
                    const depts = m.departments.length > 0 ? m.departments.join(' + ') : 'بدون تكليف';
                    const timeStr = m.timings.length > 0 ? ` [${m.timings.join(', ')}]` : '';
                    const vacStr = m.vacation.hasVacation ? ` | 🌴 ${m.vacation.detailsAr}` : '';
                    const friStr = m.fridayCount > 0 ? ` | ${m.fridayCount} نوبة جمعة` : '';
                    statusLine = `${depts}${timeStr}${vacStr}${friStr}`;
                }
                return `• ${m.monthNameAr}: ${statusLine}`;
            }),
            `━━━━━━━━━━━━━━━━━━━━━━`,
            analytics.unvisitedSections.length > 0
                ? `💡 أقسام لم يتم التكليف بها مؤخراً: ${analytics.unvisitedSections.join('، ')}`
                : `💡 توزيع شامل ومتنوع بين الأقسام`
        ].filter(Boolean);

        navigator.clipboard.writeText(lines.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    if (!user) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            maxWidth="max-w-4xl"
            title={
                <div className="flex items-center justify-between gap-3 w-full pr-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-base shadow-sm ${
                            user.gender === 'female' 
                                ? 'bg-pink-100 text-pink-700 ring-2 ring-pink-400' 
                                : 'bg-sky-100 text-sky-700 ring-2 ring-sky-400'
                        }`}>
                            <i className={`fas ${user.gender === 'female' ? 'fa-female' : 'fa-male'}`}></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className={`text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{user.name}</h3>
                                <GenderBadge gender={user.gender} variant="pill" isAr={dir === 'rtl'} />
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                                    isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}>
                                    {user.jobCategory || (dir === 'rtl' ? 'كادر فني' : 'Technical Staff')}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {dir === 'rtl' ? 'سجل الروتيشن ومسار التدوير لآخر 6 شهور' : '6-Month Rotation History & Department Trajectory'}
                            </p>
                        </div>
                    </div>
                </div>
            }
        >
            <div className="space-y-6" dir={dir}>
                {/* Reference Month Navigator Bar */}
                <div className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border ${
                    isDark ? 'bg-slate-800/80 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <i className="fas fa-calendar-alt text-indigo-500"></i>
                            {dir === 'rtl' ? 'الفترة الزمنية المعروضة:' : 'Displayed Window:'}
                        </span>
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                            {monthDetails[0]?.monthNameAr} ➔ {monthDetails[monthDetails.length - 1]?.monthNameAr}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setReferenceMonth(prev => addMonthsToMonthStr(prev, -1))}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-white hover:bg-slate-100 text-slate-700 shadow-xs'
                            }`}
                            title={dir === 'rtl' ? 'إزاحة شهر للخلف' : 'Shift 1 month back'}
                        >
                            <i className="fas fa-chevron-right rtl:rotate-180"></i>
                            <span>{dir === 'rtl' ? 'السابق' : 'Prev'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setReferenceMonth(getCurrentMonthStr())}
                            className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                referenceMonth === getCurrentMonthStr()
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : (isDark ? 'bg-slate-700 hover:bg-slate-600 text-indigo-300' : 'bg-white hover:bg-slate-100 text-indigo-600 shadow-xs')
                            }`}
                        >
                            {dir === 'rtl' ? 'الشهر الحالي' : 'Current'}
                        </button>

                        <button
                            type="button"
                            onClick={() => setReferenceMonth(prev => addMonthsToMonthStr(prev, 1))}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-white hover:bg-slate-100 text-slate-700 shadow-xs'
                            }`}
                            title={dir === 'rtl' ? 'إزاحة شهر للأمام' : 'Shift 1 month forward'}
                        >
                            <span>{dir === 'rtl' ? 'التالي' : 'Next'}</span>
                            <i className="fas fa-chevron-left rtl:rotate-180"></i>
                        </button>
                    </div>
                </div>

                {/* Stat Overview Cards */}
                {analytics && (
                    <div className={`grid grid-cols-2 ${analytics.vacationMonthsCount > 0 ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3`}>
                        <div className={`p-3.5 rounded-2xl border transition-all ${
                            isDark ? 'bg-slate-800/60 border-slate-700/80' : 'bg-white border-slate-200/80 shadow-xs'
                        }`}>
                            <div className="flex items-center gap-2 text-indigo-500 mb-1">
                                <i className="fas fa-check-circle text-sm"></i>
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    {dir === 'rtl' ? 'الشهور النشطة' : 'Active Months'}
                                </span>
                            </div>
                            <div className="text-xl font-black text-slate-900 dark:text-white">
                                {analytics.activeMonthsCount} <span className="text-xs font-bold text-slate-400">/ 6</span>
                            </div>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                {Math.round((analytics.activeMonthsCount / 6) * 100)}% {dir === 'rtl' ? 'نسبة التغطية' : 'Coverage'}
                            </span>
                        </div>

                        {analytics.vacationMonthsCount > 0 && (
                            <div className={`p-3.5 rounded-2xl border transition-all ${
                                isDark ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-emerald-50/70 border-emerald-200 shadow-xs'
                            }`}>
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
                                    <i className="fas fa-umbrella-beach text-sm"></i>
                                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                                        {dir === 'rtl' ? 'شهور الإجازات' : 'Leave Months'}
                                    </span>
                                </div>
                                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                                    {analytics.vacationMonthsCount} <span className="text-xs font-bold opacity-75">{dir === 'rtl' ? 'شهر' : 'mo'}</span>
                                </div>
                                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">
                                    {dir === 'rtl' ? 'إجازات معتمدة' : 'Approved Leaves'}
                                </span>
                            </div>
                        )}

                        <div className={`p-3.5 rounded-2xl border transition-all ${
                            isDark ? 'bg-slate-800/60 border-slate-700/80' : 'bg-white border-slate-200/80 shadow-xs'
                        }`}>
                            <div className="flex items-center gap-2 text-amber-500 mb-1">
                                <i className="fas fa-award text-sm"></i>
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    {dir === 'rtl' ? 'القسم الأكثر تكراراً' : 'Top Modality'}
                                </span>
                            </div>
                            <div className="text-sm font-black text-slate-900 dark:text-white truncate" title={analytics.dominantDept?.name || '-'}>
                                {analytics.dominantDept?.name || (dir === 'rtl' ? 'متنوع' : 'Varied')}
                            </div>
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                {analytics.dominantDept ? `${analytics.dominantDept.count} ${dir === 'rtl' ? 'أشهر في الفترة' : 'months'}` : '-'}
                            </span>
                        </div>

                        <div className={`p-3.5 rounded-2xl border transition-all ${
                            isDark ? 'bg-slate-800/60 border-slate-700/80' : 'bg-white border-slate-200/80 shadow-xs'
                        }`}>
                            <div className="flex items-center gap-2 text-teal-500 mb-1">
                                <i className="fas fa-calendar-day text-sm"></i>
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    {dir === 'rtl' ? 'نوبات الجمعة' : 'Friday Shifts'}
                                </span>
                            </div>
                            <div className="text-xl font-black text-slate-900 dark:text-white">
                                {analytics.totalFridayDuties}
                            </div>
                            <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold">
                                {dir === 'rtl' ? `معدل ${(analytics.totalFridayDuties / 6).toFixed(1)} / شهر` : `${(analytics.totalFridayDuties / 6).toFixed(1)} / month`}
                            </span>
                        </div>

                        <div className={`p-3.5 rounded-2xl border transition-all ${
                            isDark ? 'bg-slate-800/60 border-slate-700/80' : 'bg-white border-slate-200/80 shadow-xs'
                        }`}>
                            <div className="flex items-center gap-2 text-purple-500 mb-1">
                                <i className="fas fa-random text-sm"></i>
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    {dir === 'rtl' ? 'تنوع الأقسام' : 'Diversity'}
                                </span>
                            </div>
                            <div className="text-xl font-black text-slate-900 dark:text-white">
                                {analytics.diversityScore}
                            </div>
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold">
                                {dir === 'rtl' ? 'أقسام مختلفة خلال 6 شهور' : 'distinct sections'}
                            </span>
                        </div>
                    </div>
                )}

                {/* 6 Months Chronological Cards Timeline */}
                <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                        <i className="fas fa-stream text-indigo-500"></i>
                        {dir === 'rtl' ? 'الجدول الزمني للروتيشن والإجازات (شهراً بشهر):' : 'Month-by-Month Rotation & Leaves Timeline:'}
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {monthDetails.map((m, index) => {
                            const isFirst = index === 0;
                            const isLast = index === monthDetails.length - 1;
                            const shiftStyle = detectShiftPeriod(m.timings.join(' '), m.departments.join(' '));
                            const hasVacation = m.vacation.hasVacation;
                            const isFullVacation = hasVacation && m.vacation.isFullMonth;

                            // Full Month Vacation Card
                            if (isFullVacation) {
                                return (
                                    <div
                                        key={m.month}
                                        className={`p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                                            isDark ? VACATION_STYLE.fullBgDark : VACATION_STYLE.fullBgLight
                                        } ${m.isCurrent ? 'ring-2 ring-emerald-500/70 shadow-lg' : 'shadow-xs'}`}
                                    >
                                        <div>
                                            <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-emerald-200/40 dark:border-emerald-800/40">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                                                        m.isCurrent 
                                                            ? 'bg-emerald-600 text-white shadow-xs' 
                                                            : (isDark ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-700' : 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs')
                                                    }`}>
                                                        {index + 1}
                                                    </span>
                                                    <div>
                                                        <h5 className="font-black text-sm leading-tight">
                                                            {m.monthNameAr}
                                                        </h5>
                                                        <span className="text-[10px] font-bold opacity-60 font-mono">
                                                            {m.month}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border flex items-center gap-1 ${VACATION_STYLE.badgeBg}`}>
                                                        <i className="fas fa-umbrella-beach text-[10px]"></i>
                                                        <span>{dir === 'rtl' ? m.vacation.badgeTextAr : m.vacation.badgeTextEn}</span>
                                                    </span>
                                                    {m.isCurrent && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-600 text-white shadow-xs animate-pulse">
                                                            {dir === 'rtl' ? 'الحالي' : 'Current'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Full Vacation Banner */}
                                            <div className="space-y-2.5">
                                                <div className={`p-3 rounded-xl border flex flex-col gap-1.5 shadow-xs ${
                                                    isDark ? VACATION_STYLE.locationBgDark : VACATION_STYLE.locationBgLight
                                                }`}>
                                                    <div className="flex items-center gap-2 font-black text-sm text-emerald-900 dark:text-emerald-100">
                                                        <i className="fas fa-plane-departure text-base text-emerald-600"></i>
                                                        <span>{dir === 'rtl' ? m.vacation.labelAr : m.vacation.labelEn}</span>
                                                    </div>
                                                    <div className={`text-xs font-bold px-2 py-1 rounded-lg border ${
                                                        isDark ? VACATION_STYLE.stripDark : VACATION_STYLE.stripLight
                                                    }`}>
                                                        <i className="fas fa-calendar-check text-[10px] mr-1.5 opacity-80"></i>
                                                        <span>{dir === 'rtl' ? m.vacation.detailsAr : m.vacation.detailsEn}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Status Bottom */}
                                        <div className="pt-2.5 mt-3.5 border-t border-emerald-200/40 dark:border-emerald-800/40 flex items-center justify-between text-[11px]">
                                            <span className="opacity-75 flex items-center gap-1 font-bold">
                                                <i className="fas fa-umbrella-beach text-emerald-600 text-[10px]"></i>
                                                {dir === 'rtl' ? 'حالة الشهر:' : 'Month Status:'}
                                            </span>
                                            <span className="font-black px-2.5 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border border-emerald-400/40">
                                                {dir === 'rtl' ? 'إجازة معتمدة كاملة' : 'Full Leave'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={m.month}
                                    className={`p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                                        isDark ? shiftStyle.cardBgDark + ' ' + shiftStyle.cardBorderDark : shiftStyle.cardBgLight + ' ' + shiftStyle.cardBorderLight
                                    } ${m.isCurrent ? 'ring-2 ring-indigo-500/70 shadow-lg' : 'shadow-xs'}`}
                                >
                                    {/* Month Header Banner with Shift Period Pill */}
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-black/5 dark:border-white/10">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                                                    m.isCurrent 
                                                        ? 'bg-indigo-600 text-white shadow-xs' 
                                                        : (isDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-white text-slate-700 border border-slate-200 shadow-2xs')
                                                }`}>
                                                    {index + 1}
                                                </span>
                                                <div>
                                                    <h5 className="font-black text-sm leading-tight">
                                                        {m.monthNameAr}
                                                    </h5>
                                                    <span className="text-[10px] font-bold opacity-60 font-mono">
                                                        {m.month}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                                {m.hasAssignment && (
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                                                        shiftStyle.badgeBg
                                                    } ${shiftStyle.badgeText} ${shiftStyle.badgeBorder}`}>
                                                        <i className={`fas ${shiftStyle.icon} text-[10px]`}></i>
                                                        <span>{dir === 'rtl' ? shiftStyle.periodBadgeAr : shiftStyle.periodBadgeEn}</span>
                                                    </span>
                                                )}
                                                {m.isCurrent && (
                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-600 text-white shadow-xs animate-pulse">
                                                        {dir === 'rtl' ? 'الحالي' : 'Current'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Department / Location (Ultra Prominent) */}
                                        <div className="space-y-2.5">
                                            <div>
                                                <div className="text-[10px] font-black uppercase tracking-wider opacity-60 mb-1 flex items-center gap-1">
                                                    <i className="fas fa-map-marker-alt text-[9px]"></i>
                                                    <span>{dir === 'rtl' ? 'مكان العمل / القسم:' : 'Assigned Location:'}</span>
                                                </div>

                                                {m.departments.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {m.departments.map((dept, di) => {
                                                            return (
                                                                <div
                                                                    key={di}
                                                                    className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 border shadow-xs ${
                                                                        isDark
                                                                            ? `${shiftStyle.locationBgDark} ${shiftStyle.locationBorderDark}`
                                                                            : `${shiftStyle.locationBgLight} ${shiftStyle.locationBorderLight}`
                                                                    }`}
                                                                >
                                                                    <i className="fas fa-layer-group text-[10px] opacity-80"></i>
                                                                    <span>{dept}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : hasVacation ? (
                                                    <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                                                        isDark ? VACATION_STYLE.stripDark : VACATION_STYLE.stripLight
                                                    }`}>
                                                        <i className="fas fa-umbrella-beach text-emerald-600"></i>
                                                        <span>{dir === 'rtl' ? m.vacation.detailsAr : m.vacation.detailsEn}</span>
                                                    </div>
                                                ) : (
                                                    <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-dashed ${
                                                        isDark ? 'bg-slate-800/30 border-slate-700 text-slate-400' : 'bg-slate-100/60 border-slate-300 text-slate-500'
                                                    }`}>
                                                        <i className="fas fa-info-circle text-slate-400"></i>
                                                        <span>{dir === 'rtl' ? 'غير مسجل / بدون تكليف معتمد' : 'No recorded rotation'}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Shift Timing & Working Hours (Ultra Prominent with 'من ... إلى ...') */}
                                            {m.timings.length > 0 && (
                                                <div>
                                                    <div className="text-[10px] font-black uppercase tracking-wider opacity-60 mb-1 flex items-center gap-1">
                                                        <i className="fas fa-clock text-[9px]"></i>
                                                        <span>{dir === 'rtl' ? 'توقيت وساعات الدوام:' : 'Duty Hours:'}</span>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        {/* From ... To ... Readable Chip */}
                                                        {shiftStyle.timeParsed.formattedAr && (
                                                            <div className={`px-3 py-1.5 rounded-xl text-xs font-black border flex items-center justify-between gap-2 shadow-2xs ${
                                                                isDark
                                                                    ? `${shiftStyle.timeBgDark} ${shiftStyle.timeTextDark} ${shiftStyle.timeBorderDark}`
                                                                    : `${shiftStyle.timeBgLight} ${shiftStyle.timeTextLight} ${shiftStyle.timeBorderLight}`
                                                            }`}>
                                                                <div className="flex items-center gap-1.5">
                                                                    <i className="fas fa-business-time text-[11px] opacity-85"></i>
                                                                    <span>
                                                                        {dir === 'rtl' ? shiftStyle.timeParsed.formattedAr : shiftStyle.timeParsed.formattedEn}
                                                                    </span>
                                                                </div>
                                                                {m.timings[0] && (
                                                                    <span className="text-[10px] font-mono opacity-75 font-bold px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10" dir="ltr">
                                                                        {m.timings[0]}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* If there are multiple different timings */}
                                                        {m.timings.length > 1 && (
                                                            <div className="flex flex-wrap gap-1 pt-0.5">
                                                                {m.timings.slice(1).map((tm, ti) => (
                                                                    <span 
                                                                        key={ti} 
                                                                        className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10"
                                                                        dir="ltr"
                                                                    >
                                                                        {tm}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Partial Month Vacation Notification */}
                                            {hasVacation && (
                                                <div className={`mt-2 p-2 rounded-xl border flex items-center gap-2 text-xs font-black ${
                                                    isDark ? VACATION_STYLE.stripDark : VACATION_STYLE.stripLight
                                                }`}>
                                                    <i className="fas fa-umbrella-beach text-emerald-600 dark:text-emerald-400"></i>
                                                    <span>{dir === 'rtl' ? m.vacation.detailsAr : m.vacation.detailsEn}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Friday Shifts In Month */}
                                    <div className="pt-2.5 mt-3.5 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-[11px]">
                                        <span className="opacity-75 flex items-center gap-1 font-bold">
                                            <i className="fas fa-calendar-check text-teal-500 text-[10px]"></i>
                                            {dir === 'rtl' ? 'نوبات الجمعة:' : 'Fridays:'}
                                        </span>
                                        {m.fridayCount > 0 ? (
                                            <span className="font-black px-2.5 py-0.5 rounded-full text-xs bg-teal-500/20 text-teal-800 dark:text-teal-200 border border-teal-400/40">
                                                {m.fridayCount} {dir === 'rtl' ? 'جمعة' : 'shifts'}
                                            </span>
                                        ) : (
                                            <span className="opacity-50 text-[10px] font-bold">
                                                {dir === 'rtl' ? 'لا يوجد' : 'None'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* AI & Rotation Balance Recommendation Box */}
                {analytics && (
                    <div className={`p-4 rounded-2xl border ${
                        isDark ? 'bg-slate-800/90 border-slate-700 text-slate-200' : 'bg-gradient-to-r from-amber-50/70 via-indigo-50/40 to-emerald-50/70 border-slate-200 text-slate-800'
                    }`}>
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm mt-0.5">
                                <i className="fas fa-lightbulb text-amber-100"></i>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h5 className="font-black text-xs uppercase tracking-wider text-amber-800 dark:text-amber-400 mb-1">
                                    {dir === 'rtl' ? 'ملاحظات التوازن ومقترح الدور القادم:' : 'Balance Observations & Next Turn Guidance:'}
                                </h5>
                                <p className="text-xs font-bold leading-relaxed text-slate-700 dark:text-slate-300">
                                    {analytics.unvisitedSections.length > 0 ? (
                                        dir === 'rtl' ? (
                                            <>
                                                لم يتم تكليف الموظف بالأقسام التالية خلال الـ 6 شهور الماضية:{' '}
                                                <span className="font-black text-indigo-600 dark:text-indigo-400">
                                                    {analytics.unvisitedSections.join(' ، ')}
                                                </span>
                                                . يُقترح وضعه في أولويات التدوير القادم إليها لضمان تغطية شاملة وتدوير عادل.
                                            </>
                                        ) : (
                                            <>
                                                The staff member has not rotated to:{' '}
                                                <span className="font-black text-indigo-600 dark:text-indigo-400">
                                                    {analytics.unvisitedSections.join(', ')}
                                                </span>{' '}
                                                in the last 6 months. Consider prioritizing them for these sections in upcoming schedules.
                                            </>
                                        )
                                    ) : (
                                        dir === 'rtl'
                                            ? 'الموظف يحظى بتوزيع متميز ومتنوع يغطي كافة أقسام الأشعة الأساسية خلال فترة الـ 6 شهور.'
                                            : 'Excellent rotation coverage across all core department modalities during the 6-month window.'
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={handleCopyReport}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
                            copied
                                ? 'bg-emerald-600 text-white'
                                : (isDark ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white')
                        }`}
                    >
                        <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`}></i>
                        <span>{copied ? (dir === 'rtl' ? 'تم نسخ التقرير بنجاح!' : 'Copied!') : (dir === 'rtl' ? 'نسخ تقرير الـ 6 شهور' : 'Copy 6-Month Summary')}</span>
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                        >
                            <i className="fas fa-print text-xs"></i>
                            <span>{dir === 'rtl' ? 'طباعة' : 'Print'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                isDark ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                            }`}
                        >
                            {dir === 'rtl' ? 'إغلاق' : 'Close'}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
