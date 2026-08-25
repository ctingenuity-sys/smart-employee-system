
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, getDocs } from 'firebase/firestore';
import { User, Schedule, Location } from '../../types';
import { isOperationalStaff } from '../../utils/staffUtils';
import Loading from '../../components/Loading';
import Modal from '../../components/Modal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDepartment } from '../../contexts/DepartmentContext';
import { PrintHeader, PrintFooter } from '../../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const addMonthsToMonthStr = (monthStr: string, delta: number): string => {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, (m - 1) + delta, 1, 12, 0, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const generateMonthRange = (start: string, end: string): string[] => {
    if (!start || !end) return [];
    let s = start;
    let e = end;
    if (s > e) {
        const tmp = s;
        s = e;
        e = tmp;
    }
    const months: string[] = [];
    let curr = s;
    while (curr <= e && months.length < 36) {
        months.push(curr);
        curr = addMonthsToMonthStr(curr, 1);
    }
    return months;
};

const getCurrentMonthStr = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const getPresetRange = (presetKey: string): { start: string, end: string } => {
    const current = getCurrentMonthStr();
    switch (presetKey) {
        case 'past3':
            return { start: addMonthsToMonthStr(current, -2), end: current };
        case 'past6':
            return { start: addMonthsToMonthStr(current, -5), end: current };
        case 'past12':
            return { start: addMonthsToMonthStr(current, -11), end: current };
        case 'next4':
            return { start: current, end: addMonthsToMonthStr(current, 3) };
        case 'next6':
            return { start: current, end: addMonthsToMonthStr(current, 5) };
        case 'past3_next4':
            return { start: addMonthsToMonthStr(current, -2), end: addMonthsToMonthStr(current, 4) };
        default:
            return { start: addMonthsToMonthStr(current, -2), end: addMonthsToMonthStr(current, 4) };
    }
};

// Helper: categorize staff into operational rotation groups (Specialists & Technicians share the same technical pool)
export const getStaffGroup = (cat?: string): string => {
    if (!cat) return 'tech_pool';
    const c = cat.toLowerCase().trim();
    if (c === 'technician' || c === 'technologist' || c === 'specialist' || c === 'tech') return 'tech_pool';
    if (c === 'doctor' || c === 'consultant' || c === 'specialist_doctor') return 'doctor';
    if (c === 'usg' || c === 'ultrasound' || c === 'sonar') return 'usg';
    if (c === 'nurse' || c === 'nursing') return 'nurse';
    if (c === 'reception' || c === 'admin' || c === 'receptionist') return 'reception';
    if (c === 'worker' || c === 'cleaner' || c === 'service' || c === 'housekeeping') return 'worker';
    if (c === 'maintenance' || c === 'engineer') return 'maintenance';
    if (c === 'rso') return 'rso';
    return 'other';
};

// --- CONFIGURATION: Staff Rotation Groups (Unified Technical Pool + Separate Depts) ---
const GROUP_CONFIG: Record<string, { labelKey: string, fallbackLabel: string, order: number, color: string, headerBg: string, icon: string }> = {
    'tech_pool': { 
        labelKey: 'rot.cat.techPool',
        fallbackLabel: 'Technicians & Specialists (الفنيين والأخصائيين)', 
        order: 1, 
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        headerBg: 'bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-100 text-blue-900 border-b border-blue-200',
        icon: 'fa-cogs'
    },
    'doctor': { 
        labelKey: 'rot.cat.doctors',
        fallbackLabel: 'Doctors & Consultants (الأطباء والاستشاريين)', 
        order: 2, 
        color: 'bg-rose-50 text-rose-700 border-rose-200',
        headerBg: 'bg-gradient-to-r from-rose-100 via-pink-50 to-rose-100 text-rose-900 border-b border-rose-200',
        icon: 'fa-user-md'
    },
    'usg': {
        labelKey: 'rot.cat.usg',
        fallbackLabel: 'Ultrasound Team (فريق السونار)',
        order: 3,
        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        headerBg: 'bg-gradient-to-r from-indigo-100 via-purple-50 to-indigo-100 text-indigo-900 border-b border-indigo-200',
        icon: 'fa-wave-square'
    },
    'nurse': { 
        labelKey: 'rot.cat.nursing',
        fallbackLabel: 'Nursing Staff (طاقم التمريض)', 
        order: 4, 
        color: 'bg-purple-50 text-purple-700 border-purple-200',
        headerBg: 'bg-gradient-to-r from-purple-100 via-violet-50 to-purple-100 text-purple-900 border-b border-purple-200',
        icon: 'fa-user-nurse'
    },
    'reception': {
        labelKey: 'rot.cat.reception',
        fallbackLabel: 'Reception & Admin (الاستقبال والإداريين)',
        order: 5,
        color: 'bg-teal-50 text-teal-700 border-teal-200',
        headerBg: 'bg-gradient-to-r from-teal-100 via-emerald-50 to-teal-100 text-teal-900 border-b border-teal-200',
        icon: 'fa-concierge-bell'
    },
    'worker': {
        labelKey: 'rot.cat.workers',
        fallbackLabel: 'Workers & Service (العمال والخدمات المساندة)',
        order: 6,
        color: 'bg-slate-100 text-slate-700 border-slate-300',
        headerBg: 'bg-gradient-to-r from-slate-200 via-gray-100 to-slate-200 text-slate-800 border-b border-slate-300',
        icon: 'fa-hands-helping'
    },
    'maintenance': {
        labelKey: 'rot.cat.maintenance',
        fallbackLabel: 'Maintenance & Service (الصيانة والخدمات)',
        order: 7,
        color: 'bg-zinc-100 text-zinc-700 border-zinc-300',
        headerBg: 'bg-gradient-to-r from-zinc-200 via-stone-100 to-zinc-200 text-zinc-800 border-b border-zinc-300',
        icon: 'fa-tools'
    },
    'rso': { 
        labelKey: 'rot.cat.rso',
        fallbackLabel: 'Radiation Safety - R.S.O (حماية الإشعاع)', 
        order: 8, 
        color: 'bg-amber-50 text-amber-700 border-amber-200',
        headerBg: 'bg-gradient-to-r from-amber-100 via-orange-50 to-amber-100 text-amber-900 border-b border-amber-200',
        icon: 'fa-radiation'
    },
    'other': { 
        labelKey: 'rot.cat.other',
        fallbackLabel: 'Support Staff (طاقم مساند)', 
        order: 99, 
        color: 'bg-slate-50 text-slate-600 border-slate-200',
        headerBg: 'bg-slate-200 text-slate-700 border-b border-slate-300',
        icon: 'fa-id-badge'
    }
};

// Individual Staff Sub-Role Badges
const ROLE_BADGES: Record<string, { ar: string, en: string, color: string, icon: string }> = {
    'technologist': { ar: 'أخصائي أشعة', en: 'Specialist', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: 'fa-user-graduate' },
    'technician': { ar: 'فني أشعة', en: 'Technician', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'fa-cogs' },
    'specialist': { ar: 'أخصائي أشعة', en: 'Specialist', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: 'fa-user-graduate' },
    'doctor': { ar: 'طبيب أشعة', en: 'Doctor', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: 'fa-user-md' },
    'usg': { ar: 'طاقم السونار', en: 'USG Staff', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: 'fa-wave-square' },
    'nurse': { ar: 'طاقم تمريض', en: 'Nurse', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: 'fa-user-nurse' },
    'reception': { ar: 'استقبال', en: 'Reception', color: 'bg-teal-50 text-teal-700 border-teal-200', icon: 'fa-concierge-bell' },
    'worker': { ar: 'خدمات وعمال', en: 'Worker', color: 'bg-slate-100 text-slate-700 border-slate-300', icon: 'fa-hands-helping' },
    'maintenance': { ar: 'صيانة', en: 'Maintenance', color: 'bg-zinc-100 text-zinc-700 border-zinc-300', icon: 'fa-tools' },
    'rso': { ar: 'مسؤول وقاية', en: 'RSO Officer', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'fa-radiation' },
    'other': { ar: 'كادر مساند', en: 'Support', color: 'bg-slate-50 text-slate-600 border-slate-200', icon: 'fa-id-badge' }
};

// Department Colors Map - Enhanced for contrast
const DEPT_COLORS: Record<string, { bg: string, text: string }> = {
    'mri': { bg: 'bg-blue-600', text: 'text-white' },
    'ct': { bg: 'bg-emerald-600', text: 'text-white' },
    'portable': { bg: 'bg-amber-600', text: 'text-white' },
    'port': { bg: 'bg-amber-600', text: 'text-white' },
    'us': { bg: 'bg-indigo-600', text: 'text-white' },
    'ultra': { bg: 'bg-indigo-600', text: 'text-white' },
    'x-ray': { bg: 'bg-slate-500', text: 'text-white' },
    'night': { bg: 'bg-slate-900', text: 'text-white' },
    'leave': { bg: 'bg-rose-100', text: 'text-rose-700' },
    'vacation': { bg: 'bg-rose-100', text: 'text-rose-700' },
    'emergency': { bg: 'bg-orange-600', text: 'text-white' },
    'icu': { bg: 'bg-purple-600', text: 'text-white' },
    'fluo': { bg: 'bg-teal-600', text: 'text-white' },
    'cath': { bg: 'bg-rose-600', text: 'text-white' },
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
    const { selectedDepartmentId, departments } = useDepartment();
    const [loading, setLoading] = useState(true);
    
    // Range & Staff Category Filters
    const [preset, setPreset] = useState<string>('past3_next4');
    const [startMonth, setStartMonth] = useState<string>(() => getPresetRange('past3_next4').start);
    const [endMonth, setEndMonth] = useState<string>(() => getPresetRange('past3_next4').end);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewType, setViewType] = useState<'general' | 'friday'>('general'); 
    const [staffCategoryFilter, setStaffCategoryFilter] = useState<string>('all');

    // Duty Turn Inspector & Highlight State
    const [selectedDuty, setSelectedDuty] = useState<string | null>(null);
    const [isDutyModalOpen, setIsDutyModalOpen] = useState(false);
    const [highlightDuty, setHighlightDuty] = useState<string | null>(null);
    const [dutyCategoryFilter, setDutyCategoryFilter] = useState<string>('tech_pool');
    const [inspectorTab, setInspectorTab] = useState<'turn' | 'timeline' | 'stats'>('turn');
    const [dutySearch, setDutySearch] = useState('');
    const [copiedNotification, setCopiedNotification] = useState(false);

    // Staff Reordering State
    const [customOrder, setCustomOrder] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(`radiology_rotation_staff_order_${selectedDepartmentId || 'all'}`);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
    const [inlineReorderMode, setInlineReorderMode] = useState(false);
    const [draggedUserId, setDraggedUserId] = useState<string | null>(null);
    const [dragOverUserId, setDragOverUserId] = useState<string | null>(null);
    const [reorderSearch, setReorderSearch] = useState('');
    const [orderSavedToast, setOrderSavedToast] = useState(false);
    const [targetPosInput, setTargetPosInput] = useState<{ [userId: string]: string }>({});
    
    // Data
    const [users, setUsers] = useState<User[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [monthlyPublishes, setMonthlyPublishes] = useState<Record<string, any>>({});

    const months = useMemo(() => generateMonthRange(startMonth, endMonth), [startMonth, endMonth]);

    // Keep custom order in sync when department changes
    useEffect(() => {
        try {
            const key = `radiology_rotation_staff_order_${selectedDepartmentId || 'all'}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                setCustomOrder(JSON.parse(saved));
            } else {
                setCustomOrder([]);
            }
        } catch {
            setCustomOrder([]);
        }
    }, [selectedDepartmentId]);

    const saveCustomOrder = (newOrder: string[]) => {
        setCustomOrder(newOrder);
        try {
            const key = `radiology_rotation_staff_order_${selectedDepartmentId || 'all'}`;
            localStorage.setItem(key, JSON.stringify(newOrder));
            setOrderSavedToast(true);
            setTimeout(() => setOrderSavedToast(false), 2000);
        } catch (e) {
            console.error("Failed to save order in storage", e);
        }
    };

    const moveUserInOrder = (userId: string, action: 'up' | 'down' | 'top' | 'bottom' | 'middle', currentList: User[]) => {
        let currentIds = customOrder.length > 0 ? [...customOrder] : currentList.map(u => u.id);
        currentList.forEach(u => {
            if (!currentIds.includes(u.id)) currentIds.push(u.id);
        });

        const index = currentIds.indexOf(userId);
        if (index === -1) return;

        const newIds = [...currentIds];
        const [targetUser] = newIds.splice(index, 1);

        if (action === 'top') {
            newIds.unshift(targetUser);
        } else if (action === 'bottom') {
            newIds.push(targetUser);
        } else if (action === 'middle') {
            const mid = Math.floor(newIds.length / 2);
            newIds.splice(mid, 0, targetUser);
        } else if (action === 'up') {
            const target = Math.max(0, index - 1);
            newIds.splice(target, 0, targetUser);
        } else if (action === 'down') {
            const target = Math.min(newIds.length, index + 1);
            newIds.splice(target, 0, targetUser);
        }

        saveCustomOrder(newIds);
    };

    const moveUserToExactIndex = (userId: string, target1BasedIndex: number, currentList: User[]) => {
        if (isNaN(target1BasedIndex) || target1BasedIndex < 1) return;
        let currentIds = customOrder.length > 0 ? [...customOrder] : currentList.map(u => u.id);
        currentList.forEach(u => {
            if (!currentIds.includes(u.id)) currentIds.push(u.id);
        });

        const index = currentIds.indexOf(userId);
        if (index === -1) return;

        const newIds = [...currentIds];
        const [targetUser] = newIds.splice(index, 1);
        const target0Based = Math.min(Math.max(0, target1BasedIndex - 1), newIds.length);
        newIds.splice(target0Based, 0, targetUser);

        saveCustomOrder(newIds);
    };

    const resetStaffOrder = () => {
        setCustomOrder([]);
        try {
            const key = `radiology_rotation_staff_order_${selectedDepartmentId || 'all'}`;
            localStorage.removeItem(key);
            setOrderSavedToast(true);
            setTimeout(() => setOrderSavedToast(false), 2000);
        } catch {}
    };

    const sortStaffAlphabetically = (currentList: User[]) => {
        const sorted = [...currentList].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        saveCustomOrder(sorted.map(u => u.id));
    };

    const sortStaffByRoles = (currentList: User[]) => {
        const sorted = [...currentList].sort((a, b) => {
            const groupA = getStaffGroup(a.jobCategory);
            const groupB = getStaffGroup(b.jobCategory);
            const orderA = GROUP_CONFIG[groupA]?.order || 99;
            const orderB = GROUP_CONFIG[groupB]?.order || 99;
            if (orderA !== orderB) return orderA - orderB;
            return (a.name || '').localeCompare(b.name || '');
        });
        saveCustomOrder(sorted.map(u => u.id));
    };

    const handleRowDragStart = (e: React.DragEvent, userId: string) => {
        e.dataTransfer.setData('text/plain', userId);
        e.dataTransfer.effectAllowed = 'move';
        setDraggedUserId(userId);
    };

    const handleRowDragOver = (e: React.DragEvent, targetUserId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedUserId && draggedUserId !== targetUserId) {
            setDragOverUserId(targetUserId);
        }
    };

    const handleRowDrop = (e: React.DragEvent, targetUserId: string, currentList: User[]) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('text/plain') || draggedUserId;
        if (sourceId && sourceId !== targetUserId) {
            let currentIds = customOrder.length > 0 ? [...customOrder] : currentList.map(u => u.id);
            currentList.forEach(u => {
                if (!currentIds.includes(u.id)) currentIds.push(u.id);
            });

            const fromIdx = currentIds.indexOf(sourceId);
            const toIdx = currentIds.indexOf(targetUserId);
            if (fromIdx !== -1 && toIdx !== -1) {
                const newIds = [...currentIds];
                const [moved] = newIds.splice(fromIdx, 1);
                newIds.splice(toIdx, 0, moved);
                saveCustomOrder(newIds);
            }
        }
        setDraggedUserId(null);
        setDragOverUserId(null);
    };

    const handlePresetChange = (newPreset: string) => {
        setPreset(newPreset);
        if (newPreset !== 'custom') {
            const range = getPresetRange(newPreset);
            setStartMonth(range.start);
            setEndMonth(range.end);
        }
    };

    const handleShiftRange = (delta: number) => {
        setStartMonth(prev => addMonthsToMonthStr(prev, delta));
        setEndMonth(prev => addMonthsToMonthStr(prev, delta));
        setPreset('custom');
    };

    const handleResetToCurrent = () => {
        const range = getPresetRange('past3_next4');
        setPreset('past3_next4');
        setStartMonth(range.start);
        setEndMonth(range.end);
    };

    useEffect(() => {
        setLoading(true);
        const withDept = (baseQuery: any) => selectedDepartmentId ? query(baseQuery, where('departmentId', '==', selectedDepartmentId)) : baseQuery;

        getDocs(collection(db, 'users')).then((snap) => {
            const fetchedUsers = snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as User));
            const deptUsers = fetchedUsers.filter(u => {
                if (!isOperationalStaff(u, departments)) return false;

                if (selectedDepartmentId) {
                    return (
                        u.departmentId === selectedDepartmentId ||
                        (Array.isArray(u.departments) && u.departments.includes(selectedDepartmentId)) ||
                        (selectedDepartmentId === 'legacy_radiology' && !u.departmentId)
                    );
                }
                return true;
            });
            setUsers(deptUsers);
        });
        getDocs(withDept(collection(db, 'locations'))).then((snap) => {
            setLocations(snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as Location)));
        });
        getDocs(collection(db, 'monthly_publishes')).then((snap) => {
            const pubMap: Record<string, any> = {};
            snap.docs.forEach(d => {
                pubMap[d.id] = d.data();
            });
            setMonthlyPublishes(pubMap);
        });
        const oldestMonth = months[0];
        const qSch = withDept(query(collection(db, 'schedules'), where('month', '>=', oldestMonth)));
        getDocs(qSch).then((snap) => {
            setSchedules(snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as Schedule)));
            setLoading(false);
        });
        return () => {};
    }, [months, selectedDepartmentId, departments]);

    // Helper: extract timestamp in ms from various Firestore date representations
    const getTimestamp = (val: any): number => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        if (val.seconds !== undefined) return val.seconds * 1000 + (val.nanoseconds || 0) / 1000000;
        if (val.toMillis && typeof val.toMillis === 'function') return val.toMillis();
        if (val instanceof Date) return val.getTime();
        const parsed = Date.parse(val);
        return isNaN(parsed) ? 0 : parsed;
    };

    // Helper: Filter to keep only the latest published batch of schedules for a user in a month
    const filterLatestSchedules = (schList: Schedule[]): Schedule[] => {
        if (schList.length <= 1) return schList;

        const timestamps = schList.map(s => getTimestamp(s.createdAt));
        const maxTs = Math.max(...timestamps);

        if (maxTs > 0) {
            // Keep schedules created within 60 seconds of the latest timestamp (same publish batch)
            return schList.filter(s => getTimestamp(s.createdAt) >= maxTs - 60000);
        }

        // Fallback: take the last item in array
        return [schList[schList.length - 1]];
    };

    // --- Processing Logic ---
    const rotationMatrix = useMemo(() => {
        const matrix: Record<string, Record<string, DetailedMonthData>> = {};

        // Helper to initialize matrix cell
        const initCell = (userId: string, month: string) => {
            if (!matrix[userId]) matrix[userId] = {};
            if (!matrix[userId][month]) {
                matrix[userId][month] = {
                    departments: new Set<string>(),
                    fridayCount: 0
                };
            }
        };

        // Group schedules by userId and month
        const userMonthSchedulesMap: Record<string, Record<string, Schedule[]>> = {};
        schedules.forEach(sch => {
            if (!sch.month || !months.includes(sch.month)) return;
            if (!userMonthSchedulesMap[sch.userId]) userMonthSchedulesMap[sch.userId] = {};
            if (!userMonthSchedulesMap[sch.userId][sch.month]) userMonthSchedulesMap[sch.userId][sch.month] = [];
            userMonthSchedulesMap[sch.userId][sch.month].push(sch);
        });

        // For each user and month, extract the single published schedule
        users.forEach(user => {
            months.forEach(month => {
                initCell(user.id, month);

                // 1. First check if monthly_publishes snapshot exists for this month
                const pubKey1 = `${selectedDepartmentId}_${month}`;
                const pubKey2 = month;
                const pubDoc = monthlyPublishes[pubKey1] || monthlyPublishes[pubKey2];

                let extractedFromPublish = false;

                if (pubDoc && viewType === 'general') {
                    const foundLocations = new Set<string>();

                    const checkStaffList = (staffList: any[], locTitle: string, defaultTime: string) => {
                        if (!Array.isArray(staffList)) return;
                        staffList.forEach(s => {
                            const matchId = s.userId === user.id || s.id === user.id;
                            const matchName = s.name && user.name && String(s.name).trim().toLowerCase() === String(user.name).trim().toLowerCase();
                            if (matchId || matchName) {
                                let timeStr = '';
                                const timeVal = (s.time && String(s.time).trim() !== '') ? s.time : defaultTime;
                                if (timeVal) timeStr = ` (${timeVal})`;
                                foundLocations.add(`${locTitle}${timeStr}`);
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

                    if (foundLocations.size > 0) {
                        extractedFromPublish = true;
                        foundLocations.forEach(loc => matrix[user.id][month].departments.add(loc));
                    }
                }

                // 2. Fallback to schedules collection if not in monthly_publishes
                if (!extractedFromPublish) {
                    const allUserSchs = userMonthSchedulesMap[user.id]?.[month] || [];
                    if (allUserSchs.length === 0) return;

                    // Filter out Friday/Holiday/Exceptions/CT Scan special for general view
                    const filteredSchs = allUserSchs.filter(sch => {
                        const isFriday = (sch.locationId && sch.locationId.toLowerCase().includes('friday')) || 
                                         (sch.note && sch.note.toLowerCase().includes('friday')) || 
                                         (sch.periodName && sch.periodName.toLowerCase().includes('friday'));
                        const isHoliday = (sch.locationId && sch.locationId.toLowerCase().includes('holiday')) || 
                                          (sch.note && sch.note.toLowerCase().includes('holiday')) ||
                                          (sch.periodName && sch.periodName.toLowerCase().includes('holiday'));
                        const isException = sch.isException === true;
                        const isCTScanSpecial = (sch.locationId && sch.locationId.toLowerCase().includes('ct scan') && sch.shifts?.some(s => s.start === '09:00' && s.end === '20:00')) ||
                                                (sch.note && sch.note.toLowerCase().includes('ct scan') && sch.note.includes('09:00 - 20:00'));

                        if (viewType === 'general') {
                            if (isFriday || isHoliday || isException || isCTScanSpecial) return false;
                        }
                        return true;
                    });

                    // Keep ONLY the latest published batch of schedules for this user and month
                    const latestSchs = filterLatestSchedules(filteredSchs);

                    latestSchs.forEach(sch => {
                        const isFridayShift = sch.locationId === 'Friday Shift' || (sch.note && sch.note.toLowerCase().includes('friday'));
                        
                        if (isFridayShift) {
                            matrix[user.id][month].fridayCount++;
                        } else {
                            let locName = sch.locationId;
                            if (locName.startsWith('Swap Duty - ')) locName = locName.replace('Swap Duty - ', '');
                            if (locName === 'common_duty' && sch.note) locName = sch.note.split('-')[0].trim();
                            
                            const resolvedLoc = locations.find(l => l.id === locName);
                            const finalName = resolvedLoc ? resolvedLoc.name : locName;
                            
                            let timeStr = '';
                            if (sch.shifts && sch.shifts.length > 0) {
                                timeStr = ` (${sch.shifts.map(s => `${s.start}-${s.end}`).join(', ')})`;
                            }
                            matrix[user.id][month].departments.add(`${finalName}${timeStr}`);
                        }
                    });
                }
            });
        });

        return matrix;
    }, [schedules, monthlyPublishes, locations, months, users, viewType, selectedDepartmentId]);

    const filteredAndSortedUsers = useMemo(() => {
        const filtered = users
            .filter(u => {
                // Category/Group filter
                if (staffCategoryFilter !== 'all') {
                    const group = getStaffGroup(u.jobCategory);
                    if (staffCategoryFilter === 'tech_pool') {
                        if (group !== 'tech_pool') return false;
                    } else if (staffCategoryFilter !== group && staffCategoryFilter !== u.jobCategory) {
                        return false;
                    }
                }

                // Name/email search
                const name = (u.name || '').toLowerCase();
                const email = (u.email || '').toLowerCase();
                const query = searchQuery.toLowerCase();
                return name.includes(query) || email.includes(query);
            });

        if (customOrder.length > 0) {
            return [...filtered].sort((a, b) => {
                const idxA = customOrder.indexOf(a.id);
                const idxB = customOrder.indexOf(b.id);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;

                // Fallback default sort
                const groupA = getStaffGroup(a.jobCategory);
                const groupB = getStaffGroup(b.jobCategory);
                const orderA = GROUP_CONFIG[groupA]?.order || 99;
                const orderB = GROUP_CONFIG[groupB]?.order || 99;
                if (orderA !== orderB) return orderA - orderB;
                return (a.name || '').localeCompare(b.name || '');
            });
        }

        return filtered.sort((a, b) => {
            // Primary Sort: Staff Group Order
            const groupA = getStaffGroup(a.jobCategory);
            const groupB = getStaffGroup(b.jobCategory);
            const orderA = GROUP_CONFIG[groupA]?.order || 99;
            const orderB = GROUP_CONFIG[groupB]?.order || 99;
            
            if (orderA !== orderB) return orderA - orderB;
            
            // Secondary Sort: Sub-role within group (Specialists then Technicians)
            if (a.jobCategory !== b.jobCategory) {
                if (a.jobCategory === 'technologist' || a.jobCategory === 'specialist') return -1;
                if (b.jobCategory === 'technologist' || b.jobCategory === 'specialist') return 1;
            }

            // Tertiary Sort: Name
            return (a.name || '').localeCompare(b.name || '');
        });
    }, [users, searchQuery, staffCategoryFilter, customOrder]);

    const formatGeneralCell = (userId: string, month: string) => {
        const data = rotationMatrix[userId]?.[month];
        if (!data || data.departments.size === 0) return '-';
        
        // Return an array of strings, each representing a location + time
        return Array.from(data.departments);
    };

    const formatFridayCell = (userId: string, month: string) => {
        const data = rotationMatrix[userId]?.[month];
        if (!data || data.fridayCount === 0) return '0';
        return data.fridayCount.toString();
    };

    const getCellColor = (text: string | string[]) => {
        if (viewType !== 'friday' && (text === '-' || text === '0' || (Array.isArray(text) && text.length === 0))) return 'bg-slate-50 text-slate-300';
        
        // If it's an array, base the color on the first item
        const textToEvaluate = Array.isArray(text) ? text[0] : text;
        const lower = textToEvaluate.toLowerCase();
        
        if (viewType === 'friday') {
            const count = parseInt(textToEvaluate);
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

    // Extract list of all unique duties found in the matrix and department
    const availableDuties = useMemo(() => {
        const dutiesSet = new Set<string>();
        
        // Add locations from DB
        locations.forEach(loc => {
            if (loc.name) dutiesSet.add(loc.name.trim());
        });
        
        // Add from rotation matrix
        Object.values(rotationMatrix).forEach(userMonths => {
            Object.values(userMonths).forEach(monthData => {
                monthData.departments.forEach(deptStr => {
                    const cleanName = deptStr.replace(/\s*\([^)]*\)/g, '').trim();
                    if (cleanName && cleanName !== '-') {
                        dutiesSet.add(cleanName);
                    }
                });
                if (monthData.fridayCount > 0) {
                    dutiesSet.add('Friday Shift');
                }
            });
        });
        
        // Common defaults
        const commonDefaults = ['PORTABLE', 'CT Scan', 'MRI', 'Ultrasound', 'Night Shift', 'Emergency', 'X-Ray', 'ICU', 'Fluoro', 'Cath-Lab', 'Friday Shift'];
        commonDefaults.forEach(d => dutiesSet.add(d));
        
        return Array.from(dutiesSet).filter(Boolean).sort();
    }, [locations, rotationMatrix]);

    // Duty Turn Inspector Engine
    const dutyAnalysis = useMemo(() => {
        if (!selectedDuty) return null;
        const searchNorm = selectedDuty.toLowerCase().trim();
        const isFriday = searchNorm.includes('friday') || searchNorm.includes('جمعة') || searchNorm === 'friday shift';

        // Filter eligible staff by job category / operational group if requested
        const eligibleStaff = users.filter(u => {
            if (dutyCategoryFilter === 'all') return true;
            const group = getStaffGroup(u.jobCategory);
            if (dutyCategoryFilter === 'tech_pool') {
                return group === 'tech_pool';
            }
            return dutyCategoryFilter === group || dutyCategoryFilter === u.jobCategory;
        });

        // 1. Monthly timeline: who worked this duty each month
        const monthlyTimeline: Record<string, { user: User, note: string }[]> = {};
        months.forEach(m => {
            monthlyTimeline[m] = [];
            eligibleStaff.forEach(u => {
                const uData = rotationMatrix[u.id]?.[m];
                if (!uData) return;

                if (isFriday && uData.fridayCount > 0) {
                    monthlyTimeline[m].push({ user: u, note: `${uData.fridayCount} ${dir === 'rtl' ? 'مناوبة جمعة' : 'Fridays'}` });
                } else if (!isFriday) {
                    const matchedDuty = Array.from(uData.departments).find(d => {
                        const cleanD = d.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
                        return cleanD.includes(searchNorm) || searchNorm.includes(cleanD);
                    });
                    if (matchedDuty) {
                        monthlyTimeline[m].push({ user: u, note: matchedDuty });
                    }
                }
            });
        });

        // 2. Staff turn priority analysis
        const staffTurnList = eligibleStaff.map(u => {
            const assignedMonths: string[] = [];
            months.forEach(m => {
                const uData = rotationMatrix[u.id]?.[m];
                if (!uData) return;
                if (isFriday && uData.fridayCount > 0) {
                    assignedMonths.push(m);
                } else if (!isFriday) {
                    const matched = Array.from(uData.departments).some(d => {
                        const cleanD = d.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
                        return cleanD.includes(searchNorm) || searchNorm.includes(cleanD);
                    });
                    if (matched) assignedMonths.push(m);
                }
            });

            const totalAssigned = assignedMonths.length;
            const lastMonth = assignedMonths.length > 0 ? assignedMonths[assignedMonths.length - 1] : null;
            
            // How many months ago was the last assignment?
            let monthsSinceLast = 999;
            if (lastMonth) {
                const lastIdx = months.indexOf(lastMonth);
                if (lastIdx !== -1) {
                    monthsSinceLast = (months.length - 1) - lastIdx;
                }
            }

            return {
                user: u,
                totalAssigned,
                lastMonth,
                monthsSinceLast,
                assignedMonths
            };
        });

        // Sort: Longest time since last assigned, fewest assignments, alphabetical
        staffTurnList.sort((a, b) => {
            if (b.monthsSinceLast !== a.monthsSinceLast) {
                return b.monthsSinceLast - a.monthsSinceLast;
            }
            if (a.totalAssigned !== b.totalAssigned) {
                return a.totalAssigned - b.totalAssigned;
            }
            return (a.user.name || '').localeCompare(b.user.name || '');
        });

        const topCandidate = staffTurnList.length > 0 ? staffTurnList[0] : null;
        
        // Find who was the first and last assigned in chronological order
        const assignedOnly = staffTurnList.filter(s => s.lastMonth !== null);
        // Sort descending by lastMonth (most recent first)
        const sortedByLastDesc = [...assignedOnly].sort((a, b) => (months.indexOf(b.lastMonth!) - months.indexOf(a.lastMonth!)));
        const lastAssignedCandidate = sortedByLastDesc.length > 0 ? sortedByLastDesc[0] : null;

        // Sort ascending by first month assigned (earliest history first)
        const sortedByFirstAsc = [...assignedOnly].sort((a, b) => {
            const aFirst = a.assignedMonths[0];
            const bFirst = b.assignedMonths[0];
            return months.indexOf(aFirst) - months.indexOf(bFirst);
        });
        const firstAssignedCandidate = sortedByFirstAsc.length > 0 ? sortedByFirstAsc[0] : null;

        // Map candidate roles for quick table illumination
        const topCandidateUserId = topCandidate?.user.id || null;
        const lastCandidateUserId = lastAssignedCandidate?.user.id || null;

        return {
            dutyName: selectedDuty,
            isFriday,
            monthlyTimeline,
            staffTurnList,
            topCandidate,
            lastAssignedCandidate,
            firstAssignedCandidate,
            topCandidateUserId,
            lastCandidateUserId,
            totalAssignmentsInPeriod: staffTurnList.reduce((acc, s) => acc + s.totalAssigned, 0)
        };
    }, [selectedDuty, dutyCategoryFilter, users, months, rotationMatrix, dir]);

    // Fast click on duty badge in legend/matrix: highlights duty + illuminates who is next in turn immediately
    const handleSelectAndHighlightDuty = (dutyName: string) => {
        const cleanName = dutyName.replace(/\s*\([^)]*\)/g, '').trim();
        if (highlightDuty === cleanName && selectedDuty === cleanName) {
            // Already active - clicking again toggles inspector modal
            setIsDutyModalOpen(true);
        } else {
            setSelectedDuty(cleanName);
            setHighlightDuty(cleanName);
        }
    };

    const handleOpenDutyInspector = (dutyName: string) => {
        const cleanName = dutyName.replace(/\s*\([^)]*\)/g, '').trim();
        setSelectedDuty(cleanName || 'PORTABLE');
        setHighlightDuty(cleanName || 'PORTABLE');
        setIsDutyModalOpen(true);
    };

    const handleToggleHighlight = (dutyName: string) => {
        const cleanName = dutyName.replace(/\s*\([^)]*\)/g, '').trim();
        if (highlightDuty === cleanName) {
            setHighlightDuty(null);
        } else {
            setHighlightDuty(cleanName);
            setSelectedDuty(cleanName);
        }
    };

    const isCellHighlighted = (content: string | string[]) => {
        if (!highlightDuty) return false;
        const target = highlightDuty.toLowerCase().trim();
        if (Array.isArray(content)) {
            return content.some(c => c.toLowerCase().includes(target));
        }
        return content.toLowerCase().includes(target);
    };

    const filteredAvailableDuties = useMemo(() => {
        if (!dutySearch.trim()) return availableDuties;
        const q = dutySearch.toLowerCase().trim();
        return availableDuties.filter(d => d.toLowerCase().includes(q));
    }, [availableDuties, dutySearch]);

    const copyTurnRecommendation = () => {
        if (!dutyAnalysis) return;
        const top = dutyAnalysis.topCandidate;
        const last = dutyAnalysis.lastAssignedCandidate;
        const text = `🎯 تقرير دور مهمة: [${dutyAnalysis.dutyName}]\n` +
            `• المرشح الأول للدور: ${top ? `${top.user.name} (${top.monthsSinceLast === 999 ? 'لم يستلم في السجل' : `منذ ${top.monthsSinceLast} شهر`})` : 'لا يوجد'}\n` +
            `• آخر من استلم المهمة: ${last ? `${last.user.name} (في شهر ${last.lastMonth})` : 'لا يوجد'}\n` +
            `• إجمالي التكليفات في الفترة: ${dutyAnalysis.totalAssignmentsInPeriod}`;
        
        navigator.clipboard.writeText(text);
        setCopiedNotification(true);
        setTimeout(() => setCopiedNotification(false), 2500);
    };

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            
            <PrintHeader title={`Staff Rotation: ${viewType === 'general' ? 'General' : 'Friday Shifts'}`} subtitle={`Rotation Matrix (${startMonth} -> ${endMonth})`} themeColor={viewType === 'friday' ? 'teal' : 'slate'} />

            <div className="max-w-7xl mx-auto px-4 py-6 print:p-0 print:max-w-none">
                
                {/* Header Area */}
                <div className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4 print:hidden">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/supervisor')} className="w-11 h-11 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-800 transition-all border border-slate-200 hover:border-slate-400 cursor-pointer">
                            <i className="fas fa-arrow-left rtl:rotate-180"></i>
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t('nav.rotation')}</h1>
                                <button
                                    onClick={() => {
                                        const defaultDuty = availableDuties.find(d => d.toLowerCase().includes('port')) || availableDuties[0] || 'PORTABLE';
                                        handleOpenDutyInspector(defaultDuty);
                                    }}
                                    className="px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-full text-xs font-black shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-all transform hover:scale-105 cursor-pointer"
                                    title={dir === 'rtl' ? 'معرفة من عليه الدور في أي مهمة أو قسم' : 'Inspect duty turn history'}
                                >
                                    <i className="fas fa-dice text-amber-100"></i>
                                    <span>{dir === 'rtl' ? '🎯 التدوير' : '🎯 Turn Assistant'}</span>
                                </button>
                            </div>
                            <p className="text-xs text-slate-500 font-bold opacity-80">{t('rot.subtitle')}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 bg-white p-2.5 rounded-[2rem] shadow-sm border border-slate-200 w-full lg:w-auto">
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                             <button 
                                onClick={() => setViewType('general')}
                                className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${viewType === 'general' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                             >
                                <i className="fas fa-th-large"></i> {t('rot.filter.general')}
                             </button>
                             <button 
                                onClick={() => setViewType('friday')}
                                className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${viewType === 'friday' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                             >
                                <i className="fas fa-calendar-day"></i> {t('rot.filter.friday')}
                             </button>
                        </div>

                        <div className="relative flex-1 lg:flex-none">
                            <i className="fas fa-search absolute top-2.5 left-3 text-slate-400 text-xs"></i>
                            <input 
                                className="pl-9 pr-3 py-1.5 bg-slate-50 rounded-xl text-xs font-bold border-none outline-none focus:ring-2 focus:ring-indigo-100 w-full lg:w-36 transition-all"
                                placeholder={t('search')}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="h-6 w-px bg-slate-200 hidden lg:block"></div>

                        {/* Flexible Month Range Controls */}
                        <div className="flex flex-wrap items-center gap-2">
                            <select 
                                className="bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-bold text-slate-700 cursor-pointer focus:ring-2 focus:ring-indigo-100 outline-none"
                                value={preset}
                                onChange={e => handlePresetChange(e.target.value)}
                            >
                                <option value="past3_next4">{dir === 'rtl' ? '3 سابقة + 4 قادمة (شامل)' : 'Past 3 + Next 4'}</option>
                                <option value="next4">{dir === 'rtl' ? '4 أشهر قادمة (المستقبل)' : 'Next 4 Months'}</option>
                                <option value="next6">{dir === 'rtl' ? '6 أشهر قادمة (المستقبل)' : 'Next 6 Months'}</option>
                                <option value="past3">{dir === 'rtl' ? '3 أشهر سابقة' : 'Past 3 Months'}</option>
                                <option value="past6">{dir === 'rtl' ? '6 أشهر سابقة' : 'Past 6 Months'}</option>
                                <option value="past12">{dir === 'rtl' ? '12 شهراً سابقة' : 'Past 12 Months'}</option>
                                <option value="custom">{dir === 'rtl' ? 'نطاق مخصص...' : 'Custom Range...'}</option>
                            </select>

                            <div className="flex items-center gap-1.5 bg-slate-50 p-1 border border-slate-200 rounded-xl">
                                <span className="text-[10px] text-slate-400 font-bold px-1">{dir === 'rtl' ? 'من' : 'From'}</span>
                                <input 
                                    type="month" 
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                    value={startMonth}
                                    onChange={e => {
                                        setStartMonth(e.target.value);
                                        setPreset('custom');
                                    }}
                                />
                                <span className="text-[10px] text-slate-400 font-bold px-1">{dir === 'rtl' ? 'إلى' : 'To'}</span>
                                <input 
                                    type="month" 
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                    value={endMonth}
                                    onChange={e => {
                                        setEndMonth(e.target.value);
                                        setPreset('custom');
                                    }}
                                />
                            </div>

                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                                <button 
                                    onClick={() => handleShiftRange(-1)} 
                                    className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-slate-600 hover:text-indigo-600 shadow-sm text-xs font-bold cursor-pointer transition-colors"
                                    title={dir === 'rtl' ? 'إلى الشهر السابق' : 'Shift month back'}
                                >
                                    <i className="fas fa-chevron-right rtl:rotate-180"></i>
                                </button>
                                <button 
                                    onClick={handleResetToCurrent} 
                                    className="px-2 h-7 bg-white rounded-lg flex items-center justify-center text-[10px] font-black text-indigo-700 shadow-sm hover:bg-indigo-50 cursor-pointer transition-colors"
                                    title={dir === 'rtl' ? 'الرجوع للفترة الحالية' : 'Reset to current'}
                                >
                                    {dir === 'rtl' ? 'الآن' : 'Now'}
                                </button>
                                <button 
                                    onClick={() => handleShiftRange(1)} 
                                    className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-slate-600 hover:text-indigo-600 shadow-sm text-xs font-bold cursor-pointer transition-colors"
                                    title={dir === 'rtl' ? 'إلى الشهر التالي' : 'Shift month forward'}
                                >
                                    <i className="fas fa-chevron-left rtl:rotate-180"></i>
                                </button>
                            </div>

                            <button 
                                onClick={() => setIsReorderModalOpen(true)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 h-8 rounded-xl flex items-center gap-1.5 text-xs font-black shadow-md cursor-pointer transition-all hover:scale-105"
                                title={dir === 'rtl' ? 'فتح نافذة ترتيب وتنظيم الموظفين في الجدول' : 'Open Staff Reordering Center'}
                            >
                                <i className="fas fa-sort-amount-down-alt text-xs"></i>
                                <span>{dir === 'rtl' ? 'ترتيب الموظفين' : 'Reorder Staff'}</span>
                                {customOrder.length > 0 && (
                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                                )}
                            </button>

                            <button 
                                onClick={() => setInlineReorderMode(prev => !prev)}
                                className={`px-2.5 h-8 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs ${inlineReorderMode ? 'bg-amber-500 text-slate-950 font-black ring-2 ring-amber-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                                title={dir === 'rtl' ? 'تفعيل أزرار الترتيب السريع مباشرة في كل صف' : 'Toggle inline reorder buttons in table'}
                            >
                                <i className="fas fa-arrows-alt-v text-xs"></i>
                                <span className="hidden sm:inline">{dir === 'rtl' ? 'أزرار الترتيب' : 'Quick Order'}</span>
                            </button>

                            <button onClick={() => window.print()} className="bg-slate-900 text-white w-8 h-8 rounded-xl flex items-center justify-center hover:bg-black transition-all shadow-md cursor-pointer" title={dir === 'rtl' ? 'طباعة الجدول' : 'Print Table'}>
                                <i className="fas fa-print text-xs"></i>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Legend & Interactive Duty Click Area */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-5 print:hidden bg-white/70 backdrop-blur-sm p-4 rounded-2xl border border-slate-200">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <i className="fas fa-hand-pointer text-indigo-500"></i>
                            {dir === 'rtl' ? 'اضغط على أي مهمة لمعرفة من عليه الدور:' : 'Click any duty for turn history:'}
                        </span>
                                <div className="flex flex-wrap gap-2">
                            {viewType === 'general' ? (
                                <>
                                    <button 
                                        onClick={() => handleSelectAndHighlightDuty('PORTABLE')} 
                                        className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all hover:scale-105 ${highlightDuty?.toLowerCase().includes('portable') ? 'bg-amber-500 text-white ring-2 ring-amber-300 ring-offset-1 scale-105 shadow-md' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
                                        title={dir === 'rtl' ? 'اضغط لتمييز المهمة ومعرفة من عليه الدور فوراً في الجدول' : 'Click to highlight and see next in turn'}
                                    >
                                        <span>PORTABLE</span>
                                        <i className="fas fa-mobile-alt text-[9px] opacity-80"></i>
                                    </button>
                                    <button 
                                        onClick={() => handleSelectAndHighlightDuty('CT Scan')} 
                                        className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all hover:scale-105 ${highlightDuty?.toLowerCase().includes('ct') ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 ring-offset-1 scale-105 shadow-md' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                                        title={dir === 'rtl' ? 'اضغط لتمييز CT ومعرفة من عليه الدور فوراً في الجدول' : 'Click to highlight CT and see next in turn'}
                                    >
                                        <span>CT</span>
                                    </button>
                                    <button 
                                        onClick={() => handleSelectAndHighlightDuty('MRI')} 
                                        className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all hover:scale-105 ${highlightDuty?.toLowerCase().includes('mri') ? 'bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-1 scale-105 shadow-md' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                                        title={dir === 'rtl' ? 'اضغط لتمييز MRI ومعرفة من عليه الدور فوراً' : 'Click to highlight MRI'}
                                    >
                                        <span>MRI</span>
                                    </button>
                                    <button 
                                        onClick={() => handleSelectAndHighlightDuty('Ultrasound')} 
                                        className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all hover:scale-105 ${highlightDuty?.toLowerCase().includes('ultra') || highlightDuty?.toLowerCase().includes('u.s') ? 'bg-indigo-600 text-white ring-2 ring-indigo-300 ring-offset-1 scale-105 shadow-md' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                                        title={dir === 'rtl' ? 'اضغط لتمييز السونار ومعرفة من عليه الدور' : 'Click to highlight Ultrasound'}
                                    >
                                        <span>U.S</span>
                                    </button>
                                    <button 
                                        onClick={() => handleSelectAndHighlightDuty('Night Shift')} 
                                        className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all hover:scale-105 ${highlightDuty?.toLowerCase().includes('night') ? 'bg-slate-900 text-amber-300 ring-2 ring-amber-400 ring-offset-1 scale-105 shadow-md' : 'bg-slate-900 hover:bg-black text-white'}`}
                                        title={dir === 'rtl' ? 'اضغط لتمييز النوبات الليلية ومعرفة من عليه الدور' : 'Click to highlight Night Shift'}
                                    >
                                        <span>NIGHT</span>
                                        <i className="fas fa-moon text-[9px] text-amber-300"></i>
                                    </button>
                                    <button 
                                        onClick={() => handleSelectAndHighlightDuty('ICU')} 
                                        className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all hover:scale-105 ${highlightDuty?.toLowerCase().includes('icu') ? 'bg-rose-600 text-white ring-2 ring-rose-300 ring-offset-1 scale-105 shadow-md' : 'bg-rose-600 hover:bg-rose-700 text-white'}`}
                                    >
                                        <span>ICU</span>
                                    </button>
                                    <button 
                                        onClick={() => handleSelectAndHighlightDuty('Cath')} 
                                        className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all hover:scale-105 ${highlightDuty?.toLowerCase().includes('cath') ? 'bg-orange-600 text-white ring-2 ring-orange-300 ring-offset-1 scale-105 shadow-md' : 'bg-orange-600 hover:bg-orange-700 text-white'}`}
                                    >
                                        <span>CATH</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button 
                                        onClick={() => handleSelectAndHighlightDuty('Friday Shift')} 
                                        className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all hover:scale-105 ${highlightDuty?.toLowerCase().includes('friday') ? 'bg-teal-600 text-white ring-2 ring-teal-300 ring-offset-1 scale-105 shadow-md' : 'bg-teal-600 hover:bg-teal-700 text-white'}`}
                                    >
                                        <i className="fas fa-mosque"></i>
                                        <span>{dir === 'rtl' ? 'مناوبات الجمعة' : 'Friday Shifts'}</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {highlightDuty && (
                        <div className="flex flex-wrap items-center gap-2.5 bg-gradient-to-r from-amber-50 via-amber-100/60 to-amber-50 border border-amber-300 px-3.5 py-1.5 rounded-xl shadow-xs">
                            <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                                {dir === 'rtl' ? 'المهمة النشطة:' : 'Active Duty:'} <strong className="text-indigo-900 underline">{highlightDuty}</strong>
                            </span>

                            {dutyAnalysis?.topCandidate && (
                                <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                                    <i className="fas fa-crown text-amber-900"></i>
                                    {dir === 'rtl' ? `عليه الدور:` : `Next:`} <strong>{dutyAnalysis.topCandidate.user.name}</strong>
                                </span>
                            )}

                            <div className="flex items-center gap-1 rtl:mr-auto ltr:ml-auto">
                                <button
                                    onClick={() => setIsDutyModalOpen(true)}
                                    className="text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2 py-0.5 rounded-md cursor-pointer flex items-center gap-1 transition-all"
                                >
                                    <i className="fas fa-chart-line text-[9px]"></i>
                                    {dir === 'rtl' ? 'تفاصيل الدور' : 'Details'}
                                </button>
                                <button
                                    onClick={() => {
                                        setHighlightDuty(null);
                                        setSelectedDuty(null);
                                    }}
                                    className="text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2 py-0.5 rounded-md cursor-pointer transition-all"
                                    title={dir === 'rtl' ? 'إلغاء التمييز' : 'Clear highlight'}
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* STAFF CATEGORY TABS (Unified Technical Pool + Other Groups) */}
                <div className="flex flex-wrap items-center gap-1.5 mb-4 p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200 print:hidden overflow-x-auto">
                    <span className="text-[10px] font-bold text-slate-400 px-2 flex items-center gap-1">
                        <i className="fas fa-filter"></i>
                        {dir === 'rtl' ? 'عرض الكادر:' : 'Show Staff:'}
                    </span>
                    <button
                        onClick={() => setStaffCategoryFilter('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${staffCategoryFilter === 'all' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        <i className="fas fa-users text-[10px]"></i>
                        <span>{t('rot.cat.all')}</span>
                        <span className="text-[10px] bg-slate-200/80 text-slate-700 px-1.5 py-0.2 rounded-full font-bold">{users.length}</span>
                    </button>
                    <button
                        onClick={() => setStaffCategoryFilter('tech_pool')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${staffCategoryFilter === 'tech_pool' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-300' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        <i className="fas fa-cogs text-[10px] text-blue-600"></i>
                        <span>{t('rot.cat.techPool')}</span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full font-bold">
                            {users.filter(u => getStaffGroup(u.jobCategory) === 'tech_pool').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setStaffCategoryFilter('doctor')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${staffCategoryFilter === 'doctor' ? 'bg-white text-rose-700 shadow-sm ring-1 ring-rose-300' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        <i className="fas fa-user-md text-[10px] text-rose-600"></i>
                        <span>{t('rot.cat.doctors')}</span>
                        <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded-full font-bold">
                            {users.filter(u => getStaffGroup(u.jobCategory) === 'doctor').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setStaffCategoryFilter('usg')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${staffCategoryFilter === 'usg' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-300' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        <i className="fas fa-wave-square text-[10px] text-indigo-600"></i>
                        <span>{t('rot.cat.usg')}</span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full font-bold">
                            {users.filter(u => getStaffGroup(u.jobCategory) === 'usg').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setStaffCategoryFilter('nurse')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${staffCategoryFilter === 'nurse' ? 'bg-white text-purple-700 shadow-sm ring-1 ring-purple-300' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        <i className="fas fa-user-nurse text-[10px] text-purple-600"></i>
                        <span>{t('rot.cat.nursing')}</span>
                        <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded-full font-bold">
                            {users.filter(u => getStaffGroup(u.jobCategory) === 'nurse').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setStaffCategoryFilter('reception')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${staffCategoryFilter === 'reception' ? 'bg-white text-teal-700 shadow-sm ring-1 ring-teal-300' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        <i className="fas fa-concierge-bell text-[10px] text-teal-600"></i>
                        <span>{t('rot.cat.reception')}</span>
                        <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded-full font-bold">
                            {users.filter(u => getStaffGroup(u.jobCategory) === 'reception').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setStaffCategoryFilter('worker')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${staffCategoryFilter === 'worker' ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-400' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        <i className="fas fa-hands-helping text-[10px] text-slate-600"></i>
                        <span>{t('rot.cat.workers')}</span>
                        <span className="text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded-full font-bold">
                            {users.filter(u => getStaffGroup(u.jobCategory) === 'worker').length}
                        </span>
                    </button>
                </div>

                {/* MAIN TABLE */}
                <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-200 overflow-hidden print:shadow-none print:border-2 print:border-black print:rounded-none">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-100 print:bg-slate-200 print:text-black">
                                    {/* Sticky Employee Header */}
                                    <th className={`p-5 min-w-[260px] ${dir === 'rtl' ? 'sticky right-0 shadow-[-6px_0_12px_rgba(0,0,0,0.06)]' : 'sticky left-0 shadow-[6px_0_12px_rgba(0,0,0,0.06)]'} bg-slate-50 z-30 print:bg-slate-200 print:border-black print:shadow-none border-b border-slate-100`}>
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-id-card text-slate-400"></i>
                                            <span className="tracking-widest text-[11px]">{t('rot.staff')}</span>
                                        </div>
                                    </th>
                                    {months.map(m => {
                                        const [y, mNum] = m.split('-').map(Number);
                                        const dateObj = new Date(y, mNum - 1, 1, 12, 0, 0);
                                        const monthName = dateObj.toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US', { month: 'short' });
                                        const currMonth = getCurrentMonthStr();
                                        const isCurrent = m === currMonth;
                                        const isFuture = m > currMonth;

                                        return (
                                            <th key={m} className={`p-4 text-center border-b border-slate-100 min-w-[135px] ${isCurrent ? 'bg-indigo-50/70 border-b-2 border-b-indigo-500' : ''}`}>
                                                <div className="flex flex-col items-center">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] opacity-60 font-bold">{y}</span>
                                                        {isCurrent && (
                                                            <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                                                                {dir === 'rtl' ? 'الحالي' : 'Current'}
                                                            </span>
                                                        )}
                                                        {isFuture && (
                                                            <span className="text-[9px] bg-teal-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                                                                {dir === 'rtl' ? 'قادم' : 'Future'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`text-sm font-black ${isCurrent ? 'text-indigo-700' : isFuture ? 'text-teal-700' : 'text-slate-800'}`}>
                                                        {monthName}
                                                    </span>
                                                </div>
                                            </th>
                                        );
                                    })}
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
                                    // Group by operational rotation pool (e.g. Technicians & Specialists together)
                                    const prevUser = filteredAndSortedUsers[index - 1];
                                    const currGroupId = getStaffGroup(user.jobCategory);
                                    const prevGroupId = prevUser ? getStaffGroup(prevUser.jobCategory) : null;
                                    
                                    const showHeader = currGroupId !== prevGroupId;
                                    const groupConfig = GROUP_CONFIG[currGroupId] || GROUP_CONFIG['other'];
                                    const roleBadge = ROLE_BADGES[user.jobCategory || 'technician'] || ROLE_BADGES['other'];

                                    return (
                                    <React.Fragment key={user.id}>
                                        {/* SECTION HEADER ROW */}
                                        {showHeader && (
                                            <tr className={`${groupConfig.headerBg} print:bg-slate-100 print:text-black`}>
                                                <td colSpan={months.length + 2} className={`px-6 py-2.5 border-y border-white/20 print:border-slate-300 ${dir === 'rtl' ? 'sticky right-0' : 'sticky left-0'} z-10`}>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-6 h-6 rounded-full bg-white/40 flex items-center justify-center text-xs shadow-sm`}>
                                                            <i className={`fas ${groupConfig.icon}`}></i>
                                                        </div>
                                                        <span className="text-xs font-black uppercase tracking-wide">
                                                            {t(groupConfig.labelKey) || groupConfig.fallbackLabel}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        {(() => {
                                            const isTopCandidate = highlightDuty && dutyAnalysis?.topCandidateUserId === user.id;
                                            const isLastCandidate = highlightDuty && dutyAnalysis?.lastCandidateUserId === user.id;

                                            return (
                                            <tr 
                                                draggable={true}
                                                onDragStart={(e) => handleRowDragStart(e, user.id)}
                                                onDragOver={(e) => handleRowDragOver(e, user.id)}
                                                onDrop={(e) => handleRowDrop(e, user.id, filteredAndSortedUsers)}
                                                className={`transition-all group print:break-inside-avoid ${dragOverUserId === user.id ? 'border-t-4 border-indigo-600 bg-indigo-50/80' : ''} ${draggedUserId === user.id ? 'opacity-40' : ''} ${isTopCandidate ? 'bg-amber-50/80 ring-2 ring-amber-400 z-10' : isLastCandidate ? 'bg-indigo-50/50' : 'hover:bg-indigo-50/40'}`}
                                            >
                                            {/* Employee Sticky Column - Illuminates when candidate */}
                                            <td className={`p-3 border-r border-slate-100 ${dir === 'rtl' ? 'sticky right-0 shadow-[-6px_0_12px_rgba(0,0,0,0.06)]' : 'sticky left-0 shadow-[6px_0_12px_rgba(0,0,0,0.06)]'} ${isTopCandidate ? 'bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100/80 border-amber-300 ring-2 ring-amber-400' : isLastCandidate ? 'bg-indigo-50/90' : 'bg-white group-hover:bg-indigo-50/70'} z-20 print:border-black print:text-black print:shadow-none transition-all duration-300`}>
                                                <div className="flex items-center gap-2.5">
                                                    {/* Drag Handle & Order Index */}
                                                    <div 
                                                        className="flex flex-col items-center justify-center text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-100 print:hidden select-none"
                                                        title={dir === 'rtl' ? 'اسحب لإعادة ترتيب الموظف' : 'Drag to reorder'}
                                                    >
                                                        <i className="fas fa-grip-vertical text-xs"></i>
                                                        <span className="text-[9px] font-mono font-bold text-slate-400 mt-0.5">#{filteredAndSortedUsers.findIndex(u => u.id === user.id) + 1}</span>
                                                    </div>

                                                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm transition-transform group-hover:scale-105 relative ${isTopCandidate ? 'bg-amber-500 text-white ring-4 ring-amber-300 animate-pulse' : roleBadge.color.split(' ')[0]}`}>
                                                        {isTopCandidate ? (
                                                            <i className="fas fa-crown text-amber-100 text-sm"></i>
                                                        ) : (
                                                            <i className={`fas ${roleBadge.icon} ${roleBadge.color.split(' ')[1]}`}></i>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <h4 className={`font-black text-sm leading-tight truncate ${isTopCandidate ? 'text-amber-950 font-black text-base' : 'text-slate-900'}`}>{user.name}</h4>
                                                            {isTopCandidate && (
                                                                <span className="bg-amber-500 text-slate-950 text-[9px] font-black px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 animate-bounce">
                                                                    <i className="fas fa-star text-slate-950"></i>
                                                                    {dir === 'rtl' ? 'عليه الدور القادم' : 'Next in Turn'}
                                                                </span>
                                                            )}
                                                            {isLastCandidate && !isTopCandidate && (
                                                                <span className="bg-slate-200 text-slate-800 text-[8px] font-bold px-1.5 py-0.2 rounded">
                                                                    {dir === 'rtl' ? 'آخر من استلم' : 'Last Assigned'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${roleBadge.color}`}>
                                                                {dir === 'rtl' ? roleBadge.ar : roleBadge.en}
                                                            </span>
                                                            {isTopCandidate && highlightDuty && (
                                                                <span className="text-[10px] font-bold text-amber-800">
                                                                    {dutyAnalysis?.topCandidate?.monthsSinceLast === 999 
                                                                        ? (dir === 'rtl' ? 'لم يستلم في السجل' : 'Never in range')
                                                                        : (dir === 'rtl' ? `منذ ${dutyAnalysis?.topCandidate?.monthsSinceLast} شهر` : `${dutyAnalysis?.topCandidate?.monthsSinceLast}m ago`)}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Quick Reorder Controls on Row */}
                                                        <div className={`mt-1.5 pt-1 border-t border-slate-100 flex items-center gap-1 print:hidden ${inlineReorderMode ? 'flex' : 'hidden group-hover:flex'}`}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); moveUserInOrder(user.id, 'top', filteredAndSortedUsers); }}
                                                                className="px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-black cursor-pointer transition-colors"
                                                                title={dir === 'rtl' ? 'نقل للأعلى تماماً (البداية)' : 'Move to Top'}
                                                            >
                                                                <i className="fas fa-angle-double-up text-[9px]"></i>
                                                                <span className="text-[8px] ml-0.5">Top</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); moveUserInOrder(user.id, 'up', filteredAndSortedUsers); }}
                                                                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-bold cursor-pointer transition-colors"
                                                                title={dir === 'rtl' ? 'تحريك صف لأعلى' : 'Move Up'}
                                                            >
                                                                <i className="fas fa-arrow-up text-[9px]"></i>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); moveUserInOrder(user.id, 'middle', filteredAndSortedUsers); }}
                                                                className="px-1.5 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 text-[9px] font-black cursor-pointer transition-colors"
                                                                title={dir === 'rtl' ? 'نقل مباشرة إلى منتصف الجدول' : 'Move to Middle'}
                                                            >
                                                                <i className="fas fa-arrows-alt-v text-[9px]"></i>
                                                                <span className="text-[8px] ml-0.5">{dir === 'rtl' ? 'النصف' : 'Mid'}</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); moveUserInOrder(user.id, 'down', filteredAndSortedUsers); }}
                                                                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-bold cursor-pointer transition-colors"
                                                                title={dir === 'rtl' ? 'تحريك صف لأسفل' : 'Move Down'}
                                                            >
                                                                <i className="fas fa-arrow-down text-[9px]"></i>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); moveUserInOrder(user.id, 'bottom', filteredAndSortedUsers); }}
                                                                className="px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-black cursor-pointer transition-colors"
                                                                title={dir === 'rtl' ? 'نقل للأسفل تماماً (النهاية)' : 'Move to Bottom'}
                                                            >
                                                                <i className="fas fa-angle-double-down text-[9px]"></i>
                                                                <span className="text-[8px] ml-0.5">End</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            
                                            {/* History Month Cells */}
                                            {months.map(m => {
                                                const content = viewType === 'general' ? formatGeneralCell(user.id, m) : formatFridayCell(user.id, m);
                                                const colorClass = getCellColor(content);
                                                const highlighted = isCellHighlighted(content);
                                                const [y, mNum] = m.split('-').map(Number);
                                                const monthTitle = new Date(y, mNum - 1, 1).toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' });

                                                return (
                                                    <td 
                                                        key={m} 
                                                        className={`p-2.5 text-center align-middle transition-all ${highlightDuty && !highlighted && content !== '-' && content !== '0' ? 'opacity-35' : ''}`}
                                                        title={`${user.name} | ${monthTitle} | ${Array.isArray(content) ? content.join(' + ') : content}`}
                                                    >
                                                        {viewType === 'friday' ? (
                                                            <div 
                                                                onClick={() => {
                                                                    if (content !== '0') handleSelectAndHighlightDuty('Friday Shift');
                                                                }}
                                                                className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-black text-xs border transition-all duration-300 transform group-hover:scale-110 cursor-pointer ${colorClass} ${highlighted ? 'ring-4 ring-amber-400 ring-offset-2 scale-125 shadow-xl bg-amber-400 text-slate-900 border-amber-500' : ''} print:text-black print:border-black print:bg-transparent`}
                                                            >
                                                                {content}
                                                            </div>
                                                        ) : (
                                                            <div className={`px-2 py-2.5 rounded-2xl font-black text-[10px] leading-tight tracking-tight transition-all duration-300 transform group-hover:scale-[1.02] border border-transparent ${content !== '-' ? 'shadow-sm' : ''} ${colorClass} ${highlighted ? 'ring-3 ring-amber-400 ring-offset-1 scale-105 shadow-xl z-10 bg-amber-400 text-slate-950 font-black' : ''} print:border-black print:bg-transparent print:text-black print:shadow-none`}>
                                                                {Array.isArray(content) ? (
                                                                    <div className="flex flex-col gap-1">
                                                                        {content.map((item, i) => {
                                                                            const isItemHighlighted = highlightDuty && item.toLowerCase().includes(highlightDuty.toLowerCase().trim());
                                                                            return (
                                                                                <button
                                                                                    key={i}
                                                                                    onClick={() => handleSelectAndHighlightDuty(item)}
                                                                                    className={`text-left rtl:text-right hover:underline focus:outline-none cursor-pointer rounded px-1 transition-all ${isItemHighlighted ? 'bg-amber-300 text-black font-black' : ''} ${i > 0 ? "border-t border-white/20 pt-1 mt-1" : ""}`}
                                                                                    title={dir === 'rtl' ? `اضغط لتمييز ${item} وإضاءة الموظف الذي عليه الدور` : `Click to highlight ${item} and illuminate next candidate`}
                                                                                >
                                                                                    {item}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => {
                                                                            if (content !== '-') handleSelectAndHighlightDuty(content);
                                                                        }}
                                                                        className={`w-full text-center hover:underline focus:outline-none cursor-pointer`}
                                                                    >
                                                                        {content}
                                                                    </button>
                                                                )}
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
                                            );
                                        })()}
                                    </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {/* DUTY TURN INSPECTOR MODAL */}
                <Modal
                    isOpen={isDutyModalOpen}
                    onClose={() => setIsDutyModalOpen(false)}
                    title=""
                    maxWidth="max-w-4xl"
                >
                    <div className="p-2 space-y-6" dir={dir}>
                        {/* Modal Header & Duty Picker */}
                        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 -mx-6 -mt-6 p-6 rounded-t-2xl text-white relative overflow-hidden">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-amber-500/30">
                                            {dir === 'rtl' ? 'نظام عدالة التدوير والأدوار' : 'Duty Rotation & Turn Assistant'}
                                        </span>
                                    </div>
                                    <h2 className="text-2xl font-black flex items-center gap-2">
                                        <span>🎯 {dir === 'rtl' ? `مين عليه الدور في: ${selectedDuty || 'المهمة'}` : `Who's Next for: ${selectedDuty || 'Duty'}`}</span>
                                    </h2>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={copyTurnRecommendation}
                                        className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                        title={dir === 'rtl' ? 'نسخ التوصية للمشاركة' : 'Copy recommendation'}
                                    >
                                        <i className={`fas ${copiedNotification ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
                                        <span>{copiedNotification ? (dir === 'rtl' ? 'تم النسخ!' : 'Copied!') : (dir === 'rtl' ? 'نسخ التقرير' : 'Copy')}</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (selectedDuty) handleToggleHighlight(selectedDuty);
                                        }}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${highlightDuty === selectedDuty ? 'bg-amber-500 text-white shadow-lg' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                                    >
                                        <i className="fas fa-highlighter"></i>
                                        <span>{highlightDuty === selectedDuty ? (dir === 'rtl' ? 'مميز في الجدول' : 'Highlighted') : (dir === 'rtl' ? 'تمييز في الجدول' : 'Highlight in Matrix')}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Quick Duty Selector Chips */}
                            <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2">
                                <span className="text-[10px] text-slate-300 font-bold uppercase">{dir === 'rtl' ? 'اختر مهمة:' : 'Choose Duty:'}</span>
                                {availableDuties.slice(0, 8).map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setSelectedDuty(d)}
                                        className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${selectedDuty === d ? 'bg-amber-400 text-slate-950 shadow-md scale-105' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Top Recommendation Highlight Card */}
                        {dutyAnalysis?.topCandidate ? (
                            <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-amber-500/10 border-2 border-amber-400/40 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-amber-500/30">
                                            <i className="fas fa-crown text-amber-100"></i>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="bg-amber-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                                                    {dir === 'rtl' ? '👑 المرشح الأول للدور' : '👑 Top Next-in-Turn Candidate'}
                                                </span>
                                                <span className="text-xs text-slate-500 font-bold">
                                                    {dir === 'rtl' 
                                                        ? (ROLE_BADGES[dutyAnalysis.topCandidate.user.jobCategory || 'technician']?.ar || 'فني أشعة') 
                                                        : (ROLE_BADGES[dutyAnalysis.topCandidate.user.jobCategory || 'technician']?.en || 'Technician')}
                                                </span>
                                            </div>
                                            <h3 className="text-xl font-black text-slate-900">{dutyAnalysis.topCandidate.user.name}</h3>
                                            <p className="text-xs font-bold text-slate-600 mt-1 flex items-center gap-2">
                                                <span>
                                                    {dutyAnalysis.topCandidate.monthsSinceLast === 999 
                                                        ? (dir === 'rtl' ? '⚠️ لم يستلم هذه المهمة طوال الفترة المسجلة' : '⚠️ Never assigned during this period')
                                                        : (dir === 'rtl' ? `⏳ لم يستلم منذ ${dutyAnalysis.topCandidate.monthsSinceLast} شهر (آخر مرة: شهر ${dutyAnalysis.topCandidate.lastMonth})` : `⏳ Not assigned for ${dutyAnalysis.topCandidate.monthsSinceLast} months (last: ${dutyAnalysis.topCandidate.lastMonth})`)
                                                    }
                                                </span>
                                            </p>
                                        </div>
                                    </div>

                                    {dutyAnalysis.lastAssignedCandidate && (
                                        <div className="bg-white/80 p-3 rounded-2xl border border-slate-200 text-xs">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase">{dir === 'rtl' ? 'آخر موظف استلمها:' : 'Last Person Assigned:'}</span>
                                            <span className="font-black text-slate-800">{dutyAnalysis.lastAssignedCandidate.user.name}</span>
                                            <span className="block text-[10px] text-slate-500 font-bold">
                                                {dir === 'rtl' ? `في شهر: ${dutyAnalysis.lastAssignedCandidate.lastMonth}` : `In month: ${dutyAnalysis.lastAssignedCandidate.lastMonth}`}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-slate-50 rounded-2xl text-center text-slate-400 text-sm font-bold">
                                {dir === 'rtl' ? 'لم يتم العثور على بيانات لهذه المهمة' : 'No rotation data found for this duty'}
                            </div>
                        )}

                        {/* Tabs & Job Category Filter */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button
                                    onClick={() => setInspectorTab('turn')}
                                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${inspectorTab === 'turn' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <i className="fas fa-list-ol"></i>
                                    <span>{dir === 'rtl' ? 'قائمة ترتيب الدور' : 'Turn Order Ranking'}</span>
                                </button>
                                <button
                                    onClick={() => setInspectorTab('timeline')}
                                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${inspectorTab === 'timeline' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <i className="fas fa-history"></i>
                                    <span>{dir === 'rtl' ? 'السجل الزمني الشهري' : 'Monthly History'}</span>
                                </button>
                                <button
                                    onClick={() => setInspectorTab('stats')}
                                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${inspectorTab === 'stats' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <i className="fas fa-chart-pie"></i>
                                    <span>{dir === 'rtl' ? 'إحصائيات التوزيع' : 'Fairness Stats'}</span>
                                </button>
                            </div>

                            {/* Job Category Selector */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">{dir === 'rtl' ? 'تصفية الفئة:' : 'Filter Role:'}</span>
                                <select
                                    value={dutyCategoryFilter}
                                    onChange={e => setDutyCategoryFilter(e.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-100"
                                >
                                    <option value="all">{t('rot.cat.all')}</option>
                                    <option value="tech_pool">{t('rot.cat.techPool')}</option>
                                    <option value="doctor">{t('rot.cat.doctors')}</option>
                                    <option value="usg">{t('rot.cat.usg')}</option>
                                    <option value="nurse">{t('rot.cat.nursing')}</option>
                                    <option value="reception">{t('rot.cat.reception')}</option>
                                    <option value="worker">{t('rot.cat.workers')}</option>
                                    <option value="maintenance">{t('rot.cat.maintenance')}</option>
                                    <option value="rso">{t('rot.cat.rso')}</option>
                                </select>
                            </div>
                        </div>

                        {/* Tab Content */}
                        {inspectorTab === 'turn' && dutyAnalysis && (
                            <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-2xl">
                                <table className="w-full text-left rtl:text-right border-collapse">
                                    <thead className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                                        <tr>
                                            <th className="p-3 text-center w-12">#</th>
                                            <th className="p-3">{dir === 'rtl' ? 'الموظف والفئة' : 'Employee & Role'}</th>
                                            <th className="p-3 text-center">{dir === 'rtl' ? 'حالة الدور والأولوية' : 'Turn Priority'}</th>
                                            <th className="p-3 text-center">{dir === 'rtl' ? 'آخر شهر استلم فيه' : 'Last Assigned'}</th>
                                            <th className="p-3 text-center">{dir === 'rtl' ? 'إجمالي المرات' : 'Total Shifts'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs">
                                        {dutyAnalysis.staffTurnList.map((item, idx) => {
                                            const isTop = idx === 0;
                                            const never = item.monthsSinceLast === 999;
                                            const recent = item.monthsSinceLast <= 1;
                                            const itemBadge = ROLE_BADGES[item.user.jobCategory || 'technician'] || ROLE_BADGES['other'];

                                            return (
                                                <tr key={item.user.id} className={`hover:bg-slate-50 transition-colors ${isTop ? 'bg-amber-50/60 font-bold' : ''}`}>
                                                    <td className="p-3 text-center font-black text-slate-400">
                                                        {isTop ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="font-bold text-slate-900">{item.user.name}</div>
                                                        <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-md border ${itemBadge.color}`}>
                                                            {dir === 'rtl' ? itemBadge.ar : itemBadge.en}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {never ? (
                                                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                                                                <i className="fas fa-star text-emerald-600"></i>
                                                                {dir === 'rtl' ? 'أولوية قصوى (لم يستلم)' : 'Top Priority (Never)'}
                                                            </span>
                                                        ) : item.monthsSinceLast >= 3 ? (
                                                            <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                                                                <i className="fas fa-check-circle"></i>
                                                                {dir === 'rtl' ? `عليه الدور (منذ ${item.monthsSinceLast} شهر)` : `In Turn (${item.monthsSinceLast}m ago)`}
                                                            </span>
                                                        ) : recent ? (
                                                            <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                                                                <i className="fas fa-times-circle"></i>
                                                                {dir === 'rtl' ? 'استلم حديثاً' : 'Recently Assigned'}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                                {dir === 'rtl' ? `منذ ${item.monthsSinceLast} شهر` : `${item.monthsSinceLast}m ago`}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-center font-bold text-slate-700">
                                                        {item.lastMonth ? (
                                                            <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">{item.lastMonth}</span>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-center font-black text-slate-800">
                                                        {item.totalAssigned}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {inspectorTab === 'timeline' && dutyAnalysis && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                                {months.map(m => {
                                    const assignees = dutyAnalysis.monthlyTimeline[m] || [];
                                    const [y, mNum] = m.split('-').map(Number);
                                    const monthLabel = new Date(y, mNum - 1, 1).toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' });
                                    const isCurr = m === getCurrentMonthStr();

                                    return (
                                        <div key={m} className={`p-3.5 rounded-2xl border transition-all ${isCurr ? 'bg-indigo-50/60 border-indigo-200 shadow-sm' : 'bg-slate-50/70 border-slate-200'}`}>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className={`text-xs font-black ${isCurr ? 'text-indigo-700' : 'text-slate-800'}`}>{monthLabel}</span>
                                                <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                                    {assignees.length} {dir === 'rtl' ? 'موظف' : 'Staff'}
                                                </span>
                                            </div>

                                            {assignees.length === 0 ? (
                                                <p className="text-xs text-slate-400 italic text-center py-2">{dir === 'rtl' ? 'لا يوجد تكليف مسجل' : 'No recorded assignment'}</p>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {assignees.map((a, i) => (
                                                        <div key={i} className="flex items-center justify-between bg-white px-2.5 py-1 rounded-xl border border-slate-100 text-xs shadow-2xs">
                                                            <span className="font-bold text-slate-800">{a.user.name}</span>
                                                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                                                {a.note}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {inspectorTab === 'stats' && dutyAnalysis && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                                        <span className="block text-2xl font-black text-slate-900">{dutyAnalysis.totalAssignmentsInPeriod}</span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">{dir === 'rtl' ? 'إجمالي التكليفات' : 'Total Assignments'}</span>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                                        <span className="block text-2xl font-black text-indigo-600">{dutyAnalysis.staffTurnList.filter(s => s.totalAssigned > 0).length}</span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">{dir === 'rtl' ? 'موظفين شاركوا' : 'Staff Participated'}</span>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                                        <span className="block text-2xl font-black text-emerald-600">{dutyAnalysis.staffTurnList.filter(s => s.totalAssigned === 0).length}</span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">{dir === 'rtl' ? 'لم يشاركوا بعد' : 'Not Yet Assigned'}</span>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                                        <span className="block text-2xl font-black text-amber-600">
                                            {dutyAnalysis.staffTurnList.length > 0 ? (dutyAnalysis.totalAssignmentsInPeriod / dutyAnalysis.staffTurnList.length).toFixed(1) : 0}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">{dir === 'rtl' ? 'المعدل لكل موظف' : 'Avg / Staff'}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </Modal>

                {/* Reorder Staff Modal */}
                <Modal
                    isOpen={isReorderModalOpen}
                    onClose={() => setIsReorderModalOpen(false)}
                    title={
                        <div className="flex items-center gap-2">
                            <i className="fas fa-sort-amount-down text-indigo-600"></i>
                            <span>{dir === 'rtl' ? 'إعادة ترتيب الموظفين في الجدول' : 'Reorder Staff in Table'}</span>
                        </div>
                    }
                    maxWidth="max-w-3xl"
                >
                    <div className="space-y-5">
                        {/* Action Presets */}
                        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                            <span className="text-xs font-bold text-slate-600">
                                <i className="fas fa-magic text-indigo-500 mr-1.5"></i>
                                {dir === 'rtl' ? 'ترتيب سريع تلقائي:' : 'Quick Presets:'}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => sortStaffAlphabetically(filteredAndSortedUsers)}
                                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-xs cursor-pointer flex items-center gap-1.5"
                                >
                                    <i className="fas fa-sort-alpha-down text-indigo-600"></i>
                                    <span>{dir === 'rtl' ? 'أبجدياً (أ-ي)' : 'Alphabetical (A-Z)'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => sortStaffByRoles(filteredAndSortedUsers)}
                                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-xs cursor-pointer flex items-center gap-1.5"
                                >
                                    <i className="fas fa-users-cog text-purple-600"></i>
                                    <span>{dir === 'rtl' ? 'حسب الفئات والوظائف' : 'By Job Categories'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={resetStaffOrder}
                                    className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 text-xs font-bold rounded-xl border border-rose-200 shadow-xs cursor-pointer flex items-center gap-1.5"
                                >
                                    <i className="fas fa-undo text-rose-500"></i>
                                    <span>{dir === 'rtl' ? 'إعادة ضبط الترتيب الأصلي' : 'Reset Default'}</span>
                                </button>
                            </div>
                        </div>

                        {/* Reorder List with Drag and Direct Position Control */}
                        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                            {filteredAndSortedUsers.map((u, index) => {
                                const roleBadge = ROLE_BADGES[u.jobCategory || 'technician'] || ROLE_BADGES['other'];
                                const isFirst = index === 0;
                                const isLast = index === filteredAndSortedUsers.length - 1;

                                return (
                                    <div
                                        key={u.id}
                                        draggable={true}
                                        onDragStart={(e) => handleRowDragStart(e, u.id)}
                                        onDragOver={(e) => handleRowDragOver(e, u.id)}
                                        onDrop={(e) => handleRowDrop(e, u.id, filteredAndSortedUsers)}
                                        className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all ${dragOverUserId === u.id ? 'border-t-4 border-indigo-600 bg-indigo-50/80 shadow-md' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs'} ${draggedUserId === u.id ? 'opacity-40' : ''}`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            {/* Drag handle */}
                                            <div 
                                                className="cursor-grab active:cursor-grabbing p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 flex items-center justify-center"
                                                title={dir === 'rtl' ? 'اسحب للترتيب' : 'Drag to reorder'}
                                            >
                                                <i className="fas fa-grip-vertical text-slate-400"></i>
                                            </div>

                                            {/* Position Number */}
                                            <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 font-mono font-black text-xs flex items-center justify-center border border-slate-200">
                                                #{index + 1}
                                            </span>

                                            {/* Staff details */}
                                            <div className="min-w-0">
                                                <h5 className="font-black text-sm text-slate-900 truncate">{u.name}</h5>
                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border inline-block mt-0.5 ${roleBadge.color}`}>
                                                    {dir === 'rtl' ? roleBadge.ar : roleBadge.en}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions: Top, Up, Mid, Down, Bottom */}
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                disabled={isFirst}
                                                onClick={() => moveUserInOrder(u.id, 'top', filteredAndSortedUsers)}
                                                className={`p-2 rounded-xl text-xs font-bold transition-colors ${isFirst ? 'text-slate-300 cursor-not-allowed' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 cursor-pointer'}`}
                                                title={dir === 'rtl' ? 'نقل إلى الأول تماماً (الأعلى)' : 'Move to Top'}
                                            >
                                                <i className="fas fa-angle-double-up"></i>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isFirst}
                                                onClick={() => moveUserInOrder(u.id, 'up', filteredAndSortedUsers)}
                                                className={`p-2 rounded-xl text-xs font-bold transition-colors ${isFirst ? 'text-slate-300 cursor-not-allowed' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer'}`}
                                                title={dir === 'rtl' ? 'تحريك لأعلى' : 'Move Up'}
                                            >
                                                <i className="fas fa-arrow-up"></i>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveUserInOrder(u.id, 'middle', filteredAndSortedUsers)}
                                                className="px-2.5 py-2 rounded-xl text-xs font-black bg-purple-50 hover:bg-purple-100 text-purple-700 transition-colors cursor-pointer flex items-center gap-1"
                                                title={dir === 'rtl' ? 'نقل إلى منتصف القائمة' : 'Move to Middle'}
                                            >
                                                <i className="fas fa-arrows-alt-v text-xs"></i>
                                                <span className="text-[10px]">{dir === 'rtl' ? 'المنتصف' : 'Mid'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isLast}
                                                onClick={() => moveUserInOrder(u.id, 'down', filteredAndSortedUsers)}
                                                className={`p-2 rounded-xl text-xs font-bold transition-colors ${isLast ? 'text-slate-300 cursor-not-allowed' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer'}`}
                                                title={dir === 'rtl' ? 'تحريك لأسفل' : 'Move Down'}
                                            >
                                                <i className="fas fa-arrow-down"></i>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isLast}
                                                onClick={() => moveUserInOrder(u.id, 'bottom', filteredAndSortedUsers)}
                                                className={`p-2 rounded-xl text-xs font-bold transition-colors ${isLast ? 'text-slate-300 cursor-not-allowed' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 cursor-pointer'}`}
                                                title={dir === 'rtl' ? 'نقل إلى الأخير تماماً (الأسفل)' : 'Move to Bottom'}
                                            >
                                                <i className="fas fa-angle-double-down"></i>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                            <span className="text-xs text-slate-500 font-medium">
                                <i className="fas fa-check-circle text-emerald-500 mr-1"></i>
                                {dir === 'rtl' ? 'يتم حفظ الترتيب تلقائياً وتطبيقه على الجدول مباشرة' : 'Order saves automatically and updates the table instantly'}
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsReorderModalOpen(false)}
                                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 cursor-pointer"
                            >
                                {dir === 'rtl' ? 'تم وحفظ' : 'Done'}
                            </button>
                        </div>
                    </div>
                </Modal>
                
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
