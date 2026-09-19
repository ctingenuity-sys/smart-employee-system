import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, getDocs } from 'firebase/firestore';
import { User, Location, Schedule } from '../../types';
import { GenderBadge } from './GenderIndicator';
import { getSoftStaffColor, detectShiftPeriod, detectVacationForMonth, MonthVacationInfo, VACATION_STYLE } from './scheduleColorUtils';

interface QuickStaffRotationPopoverProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    staffName?: string;
    allUsers?: User[];
    locations?: Location[];
    schedules?: Schedule[];
    leaveRequests?: any[];
    monthlyPublishes?: Record<string, any>;
    referenceMonth?: string;
    anchorRect?: DOMRect | null;
    onOpenFullHistory?: (user: User) => void;
    isDark?: boolean;
    dir?: 'rtl' | 'ltr';
}

const addMonths = (monthStr: string, delta: number): string => {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, (m - 1) + delta, 1, 12, 0, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const getCurrentMonth = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const QuickStaffRotationPopover: React.FC<QuickStaffRotationPopoverProps> = ({
    isOpen,
    onClose,
    user,
    staffName,
    allUsers = [],
    locations = [],
    schedules = [],
    leaveRequests = [],
    monthlyPublishes = {},
    referenceMonth: propReferenceMonth,
    onOpenFullHistory,
    isDark = false,
    dir = 'rtl'
}) => {
    const isAr = dir === 'rtl';
    const effectiveRefMonth = propReferenceMonth || getCurrentMonth();
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

    // Resolve user if only staffName was provided
    const resolvedUser = useMemo<User | null>(() => {
        if (user) return user;
        if (!staffName) return null;
        const normalized = staffName.trim().toLowerCase();
        const found = allUsers.find(u => (u.name || '').trim().toLowerCase() === normalized);
        if (found) return found;
        return {
            id: `temp_${normalized}`,
            name: staffName.trim(),
            email: '',
            role: 'staff',
            departmentId: ''
        } as User;
    }, [user, staffName, allUsers]);

    // Close on escape
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Last 6 months list (chronological: oldest to latest)
    const sixMonths = useMemo(() => {
        const list: string[] = [];
        for (let i = 5; i >= 0; i--) {
            list.push(addMonths(effectiveRefMonth, -i));
        }
        return list;
    }, [effectiveRefMonth]);

    // Map location ID to display name
    const locationMap = useMemo(() => {
        const map: Record<string, string> = {};
        locations.forEach(loc => {
            map[loc.id] = loc.name;
        });
        return map;
    }, [locations]);

    // Calculate month data for this staff
    const monthDetails = useMemo(() => {
        if (!resolvedUser) return [];

        const targetName = (resolvedUser.name || '').trim().toLowerCase();
        const targetId = resolvedUser.id;

        return sixMonths.map(month => {
            let primaryDuty = '';
            let isPublished = false;
            let fridayCount = 0;
            let timeStr = '';
            let noteStr = '';

            // 1. Check monthlyPublishes snapshot
            const matchingPubKeys = Object.keys(monthlyPublishes).filter(k => k.endsWith(`_${month}`) || k === month);
            let publishDoc: any = null;
            if (matchingPubKeys.length > 0) {
                publishDoc = monthlyPublishes[matchingPubKeys[0]];
            }

            if (publishDoc) {
                isPublished = true;
                // Search generalData columns
                if (Array.isArray(publishDoc.generalData)) {
                    for (const col of publishDoc.generalData) {
                        if (Array.isArray(col.staff)) {
                            const found = col.staff.find((s: any) => (s.name || '').trim().toLowerCase() === targetName);
                            if (found) {
                                primaryDuty = col.title || 'عام';
                                timeStr = found.time || col.defaultTime || '';
                                if (found.note) noteStr = found.note;
                                break;
                            }
                        }
                    }
                }

                // Search commonDuties
                if (!primaryDuty && Array.isArray(publishDoc.commonDuties)) {
                    for (const duty of publishDoc.commonDuties) {
                        if (Array.isArray(duty.staff)) {
                            const found = duty.staff.find((s: any) => (s.name || '').trim().toLowerCase() === targetName);
                            if (found) {
                                primaryDuty = duty.section || 'مهمة خاصة';
                                timeStr = found.time || duty.time || '';
                                if (found.note) noteStr = found.note;
                                break;
                            }
                        }
                    }
                }

                // Search fridayData
                if (Array.isArray(publishDoc.fridayData)) {
                    publishDoc.fridayData.forEach((row: any) => {
                        const cols = publishDoc.fridayColumns || [];
                        cols.forEach((col: any) => {
                            const staffList = row[col.id];
                            if (Array.isArray(staffList)) {
                                if (staffList.some((s: any) => (s.name || '').trim().toLowerCase() === targetName)) {
                                    fridayCount++;
                                }
                            }
                        });
                    });
                }
            }

            // 2. Fallback to schedules collection
            if (!primaryDuty && schedules && schedules.length > 0) {
                const userSchedules = schedules.filter(s => {
                    const matchUser = s.userId === targetId || (s.staffName && s.staffName.trim().toLowerCase() === targetName);
                    const matchMonth = s.month === month || (s.date && s.date.startsWith(month));
                    return matchUser && matchMonth;
                });

                if (userSchedules.length > 0) {
                    const generalShift = userSchedules.find(s => s.locationId !== 'Friday Shift' && s.locationId !== 'Holiday Shift');
                    if (generalShift) {
                        primaryDuty = locationMap[generalShift.locationId] || generalShift.periodName || generalShift.locationId || 'مكلف';
                        if (generalShift.shiftTime) timeStr = generalShift.shiftTime;
                        if (generalShift.note) noteStr = generalShift.note;
                    }
                    const fridays = userSchedules.filter(s => s.locationId === 'Friday Shift');
                    if (fridays.length > 0) {
                        fridayCount = Math.max(fridayCount, fridays.length);
                    }
                }
            }

            // 3. Vacation & Leave Detection for this specific month
            const vacation = detectVacationForMonth(
                month,
                resolvedUser,
                activeLeaves,
                primaryDuty,
                timeStr,
                noteStr
            );

            return {
                month,
                primaryDuty: primaryDuty || (isAr ? 'بدون تكليف' : 'Unassigned'),
                hasAssignment: Boolean(primaryDuty),
                isPublished,
                fridayCount,
                timeStr,
                vacation
            };
        });
    }, [resolvedUser, sixMonths, monthlyPublishes, schedules, locationMap, activeLeaves, isAr]);

    // Duty occurrences count
    const dutySummary = useMemo(() => {
        const counts: Record<string, number> = {};
        monthDetails.forEach(m => {
            if (m.vacation.hasVacation && m.vacation.isFullMonth) {
                const vKey = isAr ? `🌴 ${m.vacation.leaveType || 'إجازة سنوية'}` : `🌴 Vacation`;
                counts[vKey] = (counts[vKey] || 0) + 1;
            } else if (m.hasAssignment) {
                counts[m.primaryDuty] = (counts[m.primaryDuty] || 0) + 1;
            }
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [monthDetails, isAr]);

    const totalAssignedMonths = monthDetails.filter(m => m.hasAssignment || (m.vacation.hasVacation && m.vacation.isFullMonth)).length;
    const totalFridays = monthDetails.reduce((acc, m) => acc + m.fridayCount, 0);
    const totalVacationMonths = monthDetails.filter(m => m.vacation.hasVacation).length;
    const lastAssigned = [...monthDetails].reverse().find(m => m.hasAssignment || m.vacation.hasVacation);

    if (!isOpen || !resolvedUser) return null;

    const staffColor = getSoftStaffColor(resolvedUser.name || '').className;

    return (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
            onClick={onClose}
        >
            <div 
                className={`w-full max-w-lg rounded-3xl shadow-2xl border overflow-hidden transition-all transform scale-100 flex flex-col max-h-[92vh] ${
                    isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
                }`}
                onClick={(e) => e.stopPropagation()}
                dir={dir}
            >
                {/* Header: compact & refined */}
                <div className={`p-4 border-b flex items-center justify-between ${
                    isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-gradient-to-r from-slate-50 to-indigo-50/40 border-slate-100'
                }`}>
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 ${staffColor}`}>
                            <span>{resolvedUser.name ? resolvedUser.name.charAt(0) : '?'}</span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-black text-base truncate">
                                    {resolvedUser.name}
                                </h3>
                                <GenderBadge gender={resolvedUser.gender} variant="mini" isAr={isAr} />
                            </div>
                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <i className="fas fa-history text-indigo-500 text-[10px]"></i>
                                <span>{isAr ? 'سجل روتيشن آخر 6 شهور والإجازات' : '6-Month Rotation & Leaves Track'}</span>
                                <span className="opacity-40">•</span>
                                <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">
                                    {sixMonths[0]} ➔ {sixMonths[sixMonths.length - 1]}
                                </span>
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ${
                            isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-200/60'
                        }`}
                        title={isAr ? 'إغلاق' : 'Close'}
                    >
                        <i className="fas fa-times text-xs"></i>
                    </button>
                </div>

                {/* Quick KPI Strip */}
                <div className={`grid ${totalVacationMonths > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-2 p-3 border-b text-center ${
                    isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-50/80 border-slate-100'
                }`}>
                    <div className={`p-2 rounded-2xl border ${
                        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80 shadow-2xs'
                    }`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                            {isAr ? 'الأشهر المكلف بها' : 'Active Months'}
                        </div>
                        <div className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                            {totalAssignedMonths} <span className="text-[10px] text-slate-400 font-normal">/ 6</span>
                        </div>
                    </div>

                    <div className={`p-2 rounded-2xl border ${
                        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80 shadow-2xs'
                    }`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                            {isAr ? 'مناوبات الجمعة' : 'Fridays'}
                        </div>
                        <div className="text-base font-black text-teal-600 dark:text-teal-400 mt-0.5">
                            {totalFridays}
                        </div>
                    </div>

                    {totalVacationMonths > 0 && (
                        <div className={`p-2 rounded-2xl border ${
                            isDark ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-emerald-50/80 border-emerald-200 shadow-2xs'
                        }`}>
                            <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-tight flex items-center justify-center gap-1">
                                <i className="fas fa-umbrella-beach text-[9px]"></i>
                                <span>{isAr ? 'إجازات' : 'Leaves'}</span>
                            </div>
                            <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                                {totalVacationMonths} <span className="text-[10px] text-emerald-600/70 font-normal">{isAr ? 'شهر' : 'mo'}</span>
                            </div>
                        </div>
                    )}

                    <div className={`p-2 rounded-2xl border ${
                        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80 shadow-2xs'
                    }`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                            {isAr ? 'آخر حالة/تكليف' : 'Latest Duty'}
                        </div>
                        <div className="text-xs font-black text-slate-800 dark:text-slate-200 truncate mt-1" title={lastAssigned?.vacation.hasVacation ? lastAssigned.vacation.labelAr : (lastAssigned?.primaryDuty || '-')}>
                            {lastAssigned?.vacation.hasVacation && lastAssigned.vacation.isFullMonth
                                ? `🌴 ${lastAssigned.vacation.leaveType || 'إجازة'}`
                                : (lastAssigned?.primaryDuty || '-')}
                        </div>
                    </div>
                </div>

                {/* Scrollable Month Grid / Cards */}
                <div className="p-3.5 space-y-2 overflow-y-auto max-h-[50vh]">
                    <div className="text-[11px] font-black text-slate-400 px-1 uppercase tracking-wider flex items-center justify-between">
                        <span>{isAr ? 'تفاصيل الأشهر الستة' : 'Monthly Breakdown'}</span>
                        <span className="text-[10px] font-normal lowercase">{isAr ? 'من الأقدم للأحدث' : 'Oldest to Newest'}</span>
                    </div>

                    <div className="space-y-2">
                        {monthDetails.map((m, idx) => {
                            const isLatest = idx === monthDetails.length - 1;
                            const isPrevMonth = idx === monthDetails.length - 2;
                            const shiftStyle = detectShiftPeriod(m.timeStr, m.primaryDuty);
                            const hasVacation = m.vacation.hasVacation;
                            const isFullVacation = hasVacation && m.vacation.isFullMonth;

                            // Full month vacation card layout
                            if (isFullVacation) {
                                return (
                                    <div
                                        key={m.month}
                                        className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 relative overflow-hidden ${
                                            isDark ? VACATION_STYLE.fullBgDark : VACATION_STYLE.fullBgLight
                                        } ${isLatest ? 'ring-2 ring-emerald-500/60 shadow-md' : 'shadow-2xs'}`}
                                    >
                                        {/* Left: Month Badge */}
                                        <div className="flex items-center justify-between sm:justify-start gap-2.5 shrink-0">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                                                    isLatest
                                                        ? 'bg-emerald-600 text-white shadow-xs'
                                                        : isDark ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-700' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                                }`}>
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <div className="font-mono text-xs font-black leading-tight flex items-center gap-1.5">
                                                        <span>{m.month}</span>
                                                        {isLatest && (
                                                            <span className="text-[9px] font-black px-1.5 py-0.2 rounded-md bg-emerald-600 text-white">
                                                                {isAr ? 'الحالي' : 'Current'}
                                                            </span>
                                                        )}
                                                        {isPrevMonth && (
                                                            <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-200/60 dark:bg-emerald-800/60 text-emerald-900 dark:text-emerald-200">
                                                                {isAr ? 'السابق' : 'Prev'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Mobile Vacation Badge */}
                                            <span className={`sm:hidden text-[10px] font-black px-2 py-0.5 rounded-lg border flex items-center gap-1 ${VACATION_STYLE.badgeBg}`}>
                                                <i className="fas fa-umbrella-beach text-[10px]"></i>
                                                <span>{isAr ? m.vacation.badgeTextAr : m.vacation.badgeTextEn}</span>
                                            </span>
                                        </div>

                                        {/* Middle: Full Vacation Banner */}
                                        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-center gap-2 px-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className={`px-3 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 shadow-xs ${
                                                    isDark ? VACATION_STYLE.locationBgDark : VACATION_STYLE.locationBgLight
                                                }`}>
                                                    <i className="fas fa-plane-departure text-[11px]"></i>
                                                    <span>{isAr ? m.vacation.labelAr : m.vacation.labelEn}</span>
                                                </div>

                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                                                    isDark ? VACATION_STYLE.stripDark : VACATION_STYLE.stripLight
                                                }`}>
                                                    <i className="fas fa-calendar-check text-[10px] opacity-80"></i>
                                                    <span>{isAr ? m.vacation.detailsAr : m.vacation.detailsEn}</span>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Right: Vacation Status indicator */}
                                        <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-emerald-200/50 dark:border-emerald-800/50">
                                            <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border border-emerald-400/50 flex items-center gap-1 shadow-2xs">
                                                <i className="fas fa-umbrella-beach text-[10px] text-emerald-600 dark:text-emerald-400"></i>
                                                <span>{isAr ? 'إجازة معتمدة' : 'Approved Leave'}</span>
                                            </span>
                                        </div>
                                    </div>
                                );
                            }

                            // Standard Card (with optional Partial Vacation Highlight)
                            return (
                                <div
                                    key={m.month}
                                    className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 relative overflow-hidden ${
                                        isDark
                                            ? shiftStyle.cardBgDark + ' ' + shiftStyle.cardBorderDark
                                            : shiftStyle.cardBgLight + ' ' + shiftStyle.cardBorderLight
                                    } ${isLatest ? 'ring-2 ring-indigo-500/50 shadow-md' : 'shadow-2xs'}`}
                                >
                                    {/* Left: Month Badge + Sequence */}
                                    <div className="flex items-center justify-between sm:justify-start gap-2.5 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                                                isLatest
                                                    ? 'bg-indigo-600 text-white shadow-xs'
                                                    : isDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-white text-slate-700 border border-slate-200'
                                            }`}>
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <div className="font-mono text-xs font-black leading-tight flex items-center gap-1.5">
                                                    <span>{m.month}</span>
                                                    {isLatest && (
                                                        <span className="text-[9px] font-black px-1.5 py-0.2 rounded-md bg-indigo-600 text-white">
                                                            {isAr ? 'الحالي' : 'Current'}
                                                        </span>
                                                    )}
                                                    {isPrevMonth && (
                                                        <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                            {isAr ? 'السابق' : 'Prev'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Shift Period Pill on mobile */}
                                        {m.hasAssignment && (
                                            <span className={`sm:hidden text-[10px] font-black px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                                                shiftStyle.badgeBg
                                            } ${shiftStyle.badgeText} ${shiftStyle.badgeBorder}`}>
                                                <i className={`fas ${shiftStyle.icon} text-[10px]`}></i>
                                                <span>{isAr ? shiftStyle.periodBadgeAr : shiftStyle.periodBadgeEn}</span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Middle: Location & Timing (Ultra Prominent) + Partial Vacation */}
                                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-center gap-2 px-1">
                                        {m.hasAssignment ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                {/* Work Location (مكان العمل) */}
                                                <div className={`px-2.5 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 shadow-xs shrink-0 ${
                                                    isDark
                                                        ? `${shiftStyle.locationBgDark} ${shiftStyle.locationBorderDark}`
                                                        : `${shiftStyle.locationBgLight} ${shiftStyle.locationBorderLight}`
                                                }`} title={m.primaryDuty}>
                                                    <i className="fas fa-hospital-user text-[10px] opacity-80"></i>
                                                    <span className="truncate max-w-[140px] sm:max-w-[180px]">{m.primaryDuty}</span>
                                                </div>

                                                {/* Shift Timing (التوقيت وساعات الدوام) */}
                                                {m.timeStr ? (
                                                    <div className={`px-2.5 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 shrink-0 shadow-2xs ${
                                                        isDark
                                                            ? `${shiftStyle.timeBgDark} ${shiftStyle.timeTextDark} ${shiftStyle.timeBorderDark}`
                                                            : `${shiftStyle.timeBgLight} ${shiftStyle.timeTextLight} ${shiftStyle.timeBorderLight}`
                                                    }`} title={shiftStyle.timeParsed.formattedAr || m.timeStr}>
                                                        <i className="fas fa-clock text-[10px] opacity-75"></i>
                                                        <span>{isAr ? shiftStyle.timeParsed.formattedAr : shiftStyle.timeParsed.formattedEn}</span>
                                                        <span className="text-[10px] font-mono opacity-70 font-bold px-1 rounded bg-black/5 dark:bg-white/10" dir="ltr">
                                                            {m.timeStr}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className={`hidden sm:flex px-2 py-0.5 rounded-lg text-[10px] font-bold border items-center gap-1 ${
                                                        shiftStyle.badgeBg
                                                    } ${shiftStyle.badgeText} ${shiftStyle.badgeBorder}`}>
                                                        <i className={`fas ${shiftStyle.icon} text-[10px]`}></i>
                                                        <span>{isAr ? shiftStyle.periodBadgeAr : shiftStyle.periodBadgeEn}</span>
                                                    </div>
                                                )}

                                                {/* Shift Period Pill (Desktop) */}
                                                {m.timeStr && (
                                                    <span className={`hidden sm:inline-flex text-[10px] font-black px-2 py-0.5 rounded-lg border items-center gap-1 ${
                                                        shiftStyle.badgeBg
                                                    } ${shiftStyle.badgeText} ${shiftStyle.badgeBorder}`}>
                                                        <i className={`fas ${shiftStyle.icon} text-[10px]`}></i>
                                                        <span>{isAr ? shiftStyle.periodBadgeAr : shiftStyle.periodBadgeEn}</span>
                                                    </span>
                                                )}

                                                {/* Partial Month Vacation Highlight */}
                                                {hasVacation && (
                                                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl border flex items-center gap-1.5 shadow-xs animate-pulse ${
                                                        isDark ? VACATION_STYLE.stripDark : VACATION_STYLE.stripLight
                                                    }`} title={isAr ? m.vacation.detailsAr : m.vacation.detailsEn}>
                                                        <i className="fas fa-umbrella-beach text-[10px] text-emerald-600 dark:text-emerald-400"></i>
                                                        <span>{isAr ? m.vacation.detailsAr : m.vacation.detailsEn}</span>
                                                    </span>
                                                )}
                                            </div>
                                        ) : hasVacation ? (
                                            /* No shift assigned but partial vacation exists */
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`text-xs font-black px-3 py-1 rounded-xl border flex items-center gap-1.5 shadow-xs ${
                                                    isDark ? VACATION_STYLE.stripDark : VACATION_STYLE.stripLight
                                                }`}>
                                                    <i className="fas fa-umbrella-beach text-[11px] text-emerald-600 dark:text-emerald-400"></i>
                                                    <span>{isAr ? m.vacation.detailsAr : m.vacation.detailsEn}</span>
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 italic">
                                                <i className="fas fa-circle-minus text-[10px]"></i>
                                                <span>{isAr ? '— لا يوجد تكليف مسجل لهذا الشهر —' : '— No assignment recorded —'}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: Friday Duty Badge & Published Status */}
                                    <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200/50 dark:border-slate-700/50">
                                        {m.fridayCount > 0 ? (
                                            <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-teal-500/20 text-teal-800 dark:text-teal-200 border border-teal-400/40 flex items-center gap-1 shadow-2xs" title={isAr ? `${m.fridayCount} مناوبة جمعة` : `${m.fridayCount} Fridays`}>
                                                <i className="fas fa-calendar-day text-[10px] text-teal-600 dark:text-teal-400"></i>
                                                <span>{m.fridayCount} {isAr ? 'جمعة' : 'Fri'}</span>
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono px-1">
                                                0 {isAr ? 'جمعة' : 'Fri'}
                                            </span>
                                        )}

                                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs ${
                                            m.isPublished ? 'bg-emerald-500 ring-2 ring-emerald-400/30' : 'bg-slate-300 dark:bg-slate-600'
                                        }`} title={m.isPublished ? (isAr ? 'معتمد/منشور' : 'Published') : (isAr ? 'مسودة' : 'Draft')}></span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Summary Pills of duties */}
                    {dutySummary.length > 0 && (
                        <div className={`mt-3 p-3 rounded-2xl border ${
                            isDark ? 'bg-slate-800/30 border-slate-800' : 'bg-slate-50 border-slate-100'
                        }`}>
                            <div className="text-[10px] font-black text-slate-400 mb-1.5 uppercase tracking-wide">
                                {isAr ? 'تكرار التكليفات والإجازات في الـ 6 شهور:' : 'Duty & Leave Breakdown:'}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {dutySummary.map(([duty, count]) => (
                                    <span 
                                        key={duty} 
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                                            isDark ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-slate-200'
                                        }`}
                                    >
                                        <span className="truncate max-w-[120px]">{duty}</span>
                                        <span className="font-mono text-indigo-600 dark:text-indigo-400 font-black">×{count}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className={`p-3 border-t flex items-center justify-between gap-2 ${
                    isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-100'
                }`}>
                    <div className="text-[11px] text-slate-400 font-medium">
                        {isAr ? 'اضغط خارج النافذة للإغلاق' : 'Click outside or Esc to close'}
                    </div>

                    <div className="flex items-center gap-2">
                        {onOpenFullHistory && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenFullHistory(resolvedUser);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                            >
                                <i className="fas fa-chart-pie text-[10px]"></i>
                                <span>{isAr ? 'تقرير تفصيلي شامل' : 'Full Report'}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                                isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                        >
                            {isAr ? 'تم' : 'Done'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
