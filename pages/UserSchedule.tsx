
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { Schedule, Location, User, ActionLog, AttendanceLog, SavedTemplate } from '../types';
import Loading from '../components/Loading';
import { useLanguage } from '../contexts/LanguageContext';
import { useDepartment } from '../contexts/DepartmentContext';
import { PrintHeader, PrintFooter } from '../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

// Import View Components for Read-Only Display
import GeneralScheduleView from '../components/schedule/GeneralScheduleView';
import FridayScheduleView from '../components/schedule/FridayScheduleView';
import HolidayScheduleView from '../components/schedule/HolidayScheduleView';
import DoctorScheduleView from '../components/schedule/DoctorScheduleView';
import DoctorFridayScheduleView from '../components/schedule/DoctorFridayScheduleView';
import ExceptionScheduleView from '../components/schedule/ExceptionScheduleView';
import RamadanScheduleView from '../components/schedule/RamadanScheduleView';

// --- CONSTANTS & HELPERS ---
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

// --- HOLIDAY OVERLAY COMPONENTS ---
const BalloonsOverlay = () => {
    const balloons = Array.from({ length: 50 }).map((_, i) => {
        const colors = [
            { bg: 'rgba(239, 68, 68, 0.9)', shine: 'rgba(255, 200, 200, 0.8)' }, 
            { bg: 'rgba(59, 130, 246, 0.9)', shine: 'rgba(200, 200, 255, 0.8)' }, 
            { bg: 'rgba(34, 197, 94, 0.9)', shine: 'rgba(200, 255, 200, 0.8)' }, 
            { bg: 'rgba(234, 179, 8, 0.9)', shine: 'rgba(255, 255, 200, 0.8)' }, 
            { bg: 'rgba(168, 85, 247, 0.9)', shine: 'rgba(240, 200, 255, 0.8)' }, 
            { bg: 'rgba(236, 72, 153, 0.9)', shine: 'rgba(255, 200, 240, 0.8)' }, 
            { bg: 'rgba(249, 115, 22, 0.9)', shine: 'rgba(255, 220, 200, 0.8)' }, 
            { bg: 'rgba(255, 255, 255, 0.9)', shine: 'rgba(255, 255, 255, 0.8)' }, 
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return {
            left: `${Math.random() * 95}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${5 + Math.random() * 7}s`,
            scale: 0.6 + Math.random() * 0.6,
            color: color.bg,
            shine: color.shine,
            swayDuration: `${3 + Math.random() * 2}s`
        };
    });

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {balloons.map((b, i) => (
                <div key={i} className="absolute bottom-[-150px] z-10" style={{ left: b.left, animation: `floatUp ${b.animationDuration} linear infinite`, animationDelay: b.animationDelay, transform: `scale(${b.scale})` }}>
                    <div className="w-12 h-14 relative" style={{ background: `radial-gradient(circle at 30% 30%, ${b.shine} 0%, ${b.color} 30%, ${b.color} 80%, rgba(0,0,0,0.1) 100%)`, borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%', boxShadow: 'inset -5px -5px 10px rgba(0,0,0,0.1), 2px 5px 10px rgba(0,0,0,0.15)', animation: `sway ${b.swayDuration} ease-in-out infinite alternate` }}>
                        <div className="absolute top-[20%] left-[20%] w-2 h-4 bg-white/40 rounded-full rotate-[-45deg] blur-[1px]"></div>
                        <div className="absolute bottom-[-3px] left-1/2 -translate-x-1/2 w-1.5 h-1.5" style={{ backgroundColor: b.color, borderRadius: '50%' }}></div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-[1px] h-24 bg-white/40 origin-top animate-string-wave"></div>
                    </div>
                </div>
            ))}
            <style>{`@keyframes floatUp { 0% { transform: translateY(0) scale(1); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(-800px) scale(1); opacity: 0; } } @keyframes sway { 0% { transform: rotate(-5deg); } 100% { transform: rotate(5deg); } } @keyframes string-wave { 0% { transform: translateX(-50%) rotate(0deg) scaleY(1); } 50% { transform: translateX(-50%) rotate(2deg) scaleY(0.95); } 100% { transform: translateX(-50%) rotate(-2deg) scaleY(1); } }`}</style>
        </div>
    );
};

const SheepOverlay = () => {
    const sheep = Array.from({ length: 8 }).map((_, i) => ({
        top: `${10 + Math.random() * 60}%`,
        animationDelay: `${Math.random() * 5}s`,
        animationDuration: `${10 + Math.random() * 10}s`,
        size: 20 + Math.random() * 20
    }));
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-green-100/20 to-transparent"></div>
            {sheep.map((s, i) => (
                <div key={i} className="absolute opacity-80 animate-bounce-slow" style={{ top: s.top, left: '-50px', fontSize: `${s.size}px`, animation: `walkAcross ${s.animationDuration} linear infinite`, animationDelay: s.animationDelay, textShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>🐑</div>
            ))}
            <style>{`@keyframes walkAcross { 0% { transform: translateX(-50px) rotate(0deg); opacity: 0; } 10% { opacity: 0.8; } 25% { transform: translateX(100px) rotate(-5deg); } 50% { transform: translateX(250px) rotate(5deg); } 75% { transform: translateX(400px) rotate(-5deg); opacity: 0.8; } 100% { transform: translateX(600px) rotate(0deg); opacity: 0; } }`}</style>
        </div>
    );
};

// ... (Keep existing helper functions: convertTo24Hour, parseMultiShifts, formatTime12, formatDateSimple, isDateInMonth, parseDateString, isOverlap, getNationalHoliday, getIslamicOccasion, checkRamadanOverlap, checkEidOverlap, getEidName, getEidNameForRange, SHIFT_DESCRIPTIONS, PersonalNotepad, Barcode)
// Copied existing helper functions to ensure they are available
const normalizeDigits = (str: string) => {
    return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
};

const convertTo24Hour = (timeStr: string): string | null => {
    if (!timeStr) return null;
    let s = normalizeDigits(String(timeStr).toLowerCase().trim());
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
    let cleanText = normalizeDigits(text.trim());
    const segments = cleanText.split(/[\/,]|\s+and\s+|&|\s+(?=\d{1,2}(?::\d{2})?\s*(?:am|pm|mn|noon))/i);
    const shifts: { start: string, end: string }[] = [];
    
    // Helper to check if string contains AM/PM
    const hasAmPm = (str: string) => /am|pm|ص|م|مساء|صباح/i.test(str);

    segments.forEach(seg => {
        const trimmed = seg.trim();
        if(!trimmed) return;
        const rangeParts = trimmed.replace(/[()]/g, '').split(/\s*(?:[-–—]|\bto\b|الى|إلى)\s*/i);
        if (rangeParts.length >= 2) {
            const startStr = rangeParts[0].trim();
            const endStr = rangeParts[rangeParts.length - 1].trim(); 
            let s = convertTo24Hour(startStr);
            let e = convertTo24Hour(endStr);
            
            if (s && e) {
                // Logic to fix 8-4 to 08:00-16:00
                const startHour = parseInt(s.split(':')[0]);
                const endHour = parseInt(e.split(':')[0]);

                if (!hasAmPm(startStr) && !hasAmPm(endStr)) {
                    if (endHour < startHour) {
                        // Add 12 hours to end
                        let newEndHour = endHour + 12;
                        if (newEndHour > 24) newEndHour -= 24;
                        e = `${newEndHour.toString().padStart(2, '0')}:${e.split(':')[1]}`;
                    }
                }
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
    const d = parseDateString(dateStr) || new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

const formatDateLocalized = (dateStr?: string, isRtl?: boolean) => {
    if (!dateStr) return isRtl ? 'غير محدد' : 'Not specified';
    const d = parseDateString(dateStr) || new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const month = d.toLocaleString(isRtl ? 'ar-EG' : 'en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
};

const calculateShiftDuration = (start: string, end: string, isRtl?: boolean) => {
    try {
        if (!start || !end) return '';
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        if (isNaN(sh) || isNaN(eh)) return '';
        let diffMinutes = (eh * 60 + (sm || 0)) - (sh * 60 + (sm || 0));
        if (diffMinutes <= 0) diffMinutes += 24 * 60;
        const hrs = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;
        if (isRtl) {
            if (mins === 0) {
                if (hrs === 1) return 'ساعة واحدة';
                if (hrs === 2) return 'ساعتان';
                if (hrs >= 3 && hrs <= 10) return `${hrs} ساعات`;
                return `${hrs} ساعة`;
            }
            const minsStr = mins === 30 ? 'ونصف' : `${mins} دقيقة`;
            return `${hrs} ساعة ${minsStr}`;
        }
        if (mins === 0) return `${hrs}h`;
        return `${hrs}h ${mins}m`;
    } catch {
        return '';
    }
};

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

const getScheduleBilingualInfo = (sch: Schedule, status: any, isRtl: boolean) => {
    const isRamadan = Boolean(
        status.isRamadan ||
        sch.isRamadan ||
        (sch.periodName && /ramadan|رمضان/i.test(sch.periodName)) ||
        (status.label && /ramadan/i.test(status.label))
    );
    const isEid = Boolean(
        status.isEid ||
        (sch.periodName && /eid|عيد/i.test(sch.periodName)) ||
        (status.label && /eid/i.test(status.label))
    );
    const isHoliday = Boolean(
        status.isHoliday ||
        sch.locationId === 'Holiday Shift' ||
        (sch.periodName && /holiday|عطلة|اجازة|إجازة/i.test(sch.periodName))
    );
    const isSwap = Boolean(
        status.isSwap ||
        (sch.locationId || '').toLowerCase().includes('swap') ||
        (sch.note || '').toLowerCase().includes('swap')
    );

    if (isRamadan) {
        return {
            primary: isRtl ? 'جدول شهر رمضان المبارك' : 'RAMADAN SCHEDULE',
            secondary: isRtl ? 'جدول الدوام الشهري المعتمد' : 'OFFICIAL MONTHLY ROSTER',
            badge: isRtl ? 'جدول شهر رمضان' : 'RAMADAN ROSTER',
            classBadge: isRtl ? 'تكليف رمضان' : 'RAMADAN DUTY',
            shiftTitle: isRtl ? 'جدول شهر رمضان المبارك' : 'Ramadan Schedule',
            isRamadan: true
        };
    }
    if (isEid) {
        return {
            primary: isRtl ? 'جدول عطلة العيد المبارك' : 'EID MUBARAK SCHEDULE',
            secondary: isRtl ? 'جدول الإجازات والمناسبات الرسمية' : 'OFFICIAL HOLIDAY ROSTER',
            badge: isRtl ? 'عطلة العيد' : 'EID ROSTER',
            classBadge: isRtl ? 'تكليف العيد' : 'EID DUTY',
            shiftTitle: isRtl ? 'جدول عطلة العيد المبارك' : 'Eid Mubarak Schedule',
            isEid: true
        };
    }
    if (isHoliday) {
        return {
            primary: isRtl ? 'جدول العطلات والإجازات الرسمية' : 'OFFICIAL HOLIDAY SCHEDULE',
            secondary: isRtl ? 'جدول التكليف في العطلات الرسمية' : 'PUBLIC HOLIDAY ROSTER',
            badge: isRtl ? 'عطلة رسمية' : 'HOLIDAY ROSTER',
            classBadge: isRtl ? 'تكليف عطلة' : 'HOLIDAY DUTY',
            shiftTitle: isRtl ? 'جدول العطلات الرسمية' : 'Official Holiday Schedule',
            isHoliday: true
        };
    }
    if (isSwap) {
        return {
            primary: isRtl ? 'جدول التبديل المعتمد' : 'CONFIRMED SWAP ROSTER',
            secondary: isRtl ? 'تصريح تبديل نوبتجية رسمي' : 'OFFICIAL DUTY SWAP PASS',
            badge: isRtl ? 'تبديل معتمد' : 'SWAP PASS',
            classBadge: isRtl ? 'تبديل معتمد' : 'SWAP DUTY',
            shiftTitle: isRtl ? 'جدول التبديل المعتمد' : 'Confirmed Swap Roster',
            isSwap: true
        };
    }
    if (sch.locationId === 'common_duty') {
        return {
            primary: isRtl ? 'جدول التكليف الشهري العام' : 'GENERAL MONTHLY ROSTER',
            secondary: isRtl ? 'جدول دوام رسمي معتمد' : 'OFFICIAL DUTY SCHEDULE',
            badge: isRtl ? 'جدول شهري' : 'MONTHLY ROSTER',
            classBadge: isRtl ? 'تكليف شهري' : 'MONTHLY DUTY',
            shiftTitle: isRtl ? 'جدول التكليف الشهري العام' : 'General Monthly Roster',
            isRamadan: false
        };
    }

    if (sch.periodName) {
        const isPeriodRamadan = /ramadan|رمضان/i.test(sch.periodName);
        return {
            primary: isPeriodRamadan 
                ? (isRtl ? 'جدول شهر رمضان المبارك' : 'RAMADAN SCHEDULE')
                : sch.periodName,
            secondary: isRtl ? 'جدول دوام رسمي معتمد' : 'OFFICIAL CERTIFIED ROSTER',
            badge: isRtl ? 'جدول معتمد' : 'DUTY ROSTER',
            classBadge: isRtl ? 'تكليف معتمد' : 'CONFIRMED ROSTER',
            shiftTitle: isPeriodRamadan 
                ? (isRtl ? 'جدول شهر رمضان المبارك' : 'Ramadan Schedule')
                : sch.periodName,
            isRamadan: isPeriodRamadan
        };
    }

    return {
        primary: isRtl ? (status.subLabel || 'جدول الدوام المعتمد') : (status.label || 'CONFIRMED SCHEDULE'),
        secondary: isRtl ? 'جدول دوام رسمي معتمد' : 'OFFICIAL CERTIFIED ROSTER',
        badge: isRtl ? 'جدول معتمد' : 'DUTY ROSTER',
        classBadge: isRtl ? 'تكليف معتمد' : 'CONFIRMED ROSTER',
        shiftTitle: isRtl ? (status.subLabel || 'جدول الدوام المعتمد') : (status.label || 'Official Schedule'),
        isRamadan: false
    };
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
        <div className="bg-yellow-50 rounded-2xl p-4 shadow-inner border border-yellow-200 relative group h-full transition-all animate-fade-in-down mb-6 print:hidden">
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
    const { selectedDepartmentId } = useDepartment();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    const [schedules, setSchedules] = useState<Schedule[]>(() => {
        const cached = localStorage.getItem('usr_cached_schedules');
        return cached ? JSON.parse(cached) : [];
    });
    const [locations, setLocations] = useState<Location[]>(() => {
        const cached = localStorage.getItem('usr_cached_locations');
        return cached ? JSON.parse(cached) : [];
    });
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [isNoteOpen, setIsNoteOpen] = useState(false);
    const [punchedDates, setPunchedDates] = useState<Set<string>>(new Set());
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    
    // --- View Mode State (Cards vs Full Table) ---
    const [viewMode, setViewMode] = useState<'cards' | 'full'>('cards');
    
    // --- Saved Template for Full View ---
    const [publishedData, setPublishedData] = useState<SavedTemplate | null>(() => {
        const cached = localStorage.getItem('usr_cached_published_data');
        return cached ? JSON.parse(cached) : null;
    });

    useEffect(() => {
        localStorage.setItem('usr_cached_schedules', JSON.stringify(schedules));
    }, [schedules]);

    useEffect(() => {
        localStorage.setItem('usr_cached_locations', JSON.stringify(locations));
    }, [locations]);

    useEffect(() => {
        localStorage.setItem('usr_cached_published_data', JSON.stringify(publishedData));
    }, [publishedData]);

    useEffect(() => {
        setLoading(true);
        getDocs(collection(db, 'locations')).then((snap) => {
            setLocations(snap.docs.map(d => ({ ...d.data(), id: d.id } as Location)));
        });

        if (currentUserId) {
            // My Schedule (Cards) Data Fetch
            const [y, m] = selectedMonth.split('-');
            const qLogs = query(
                collection(db, 'attendance_logs'), 
                where('userId', '==', currentUserId),
                where('date', '>=', `${selectedMonth}-01`),
                where('date', '<=', `${selectedMonth}-31`)
            );
            getDocs(qLogs).then((snap) => {
                const dates = new Set<string>();
                snap.docs.forEach(d => {
                    const log = d.data() as AttendanceLog;
                    if (log.date) dates.add(log.date);
                });
                setPunchedDates(dates);
            });

            // Start date of selected month
            const d = new Date(parseInt(y), parseInt(m) - 1, 1);
            
            // REDUCED FETCH RANGE: Only Previous, Current, Next Month to Save Quota
            const monthsToFetch = [];
            for (let i = -1; i <= 1; i++) {
                const temp = new Date(d);
                temp.setMonth(d.getMonth() + i);
                monthsToFetch.push(temp.toISOString().slice(0, 7));
            }

            const qSch = query(collection(db, 'schedules'), 
                where('userId', '==', currentUserId), 
                where('month', 'in', monthsToFetch)
            );

            getDocs(qSch).then(snap => {
                const fetchedData = snap.docs.map(d => ({ ...d.data(), id: d.id } as Schedule));
                
                const [selY, selM] = selectedMonth.split('-').map(Number);
                const lastDay = new Date(selY, selM, 0).getDate(); 
                const monthStart = `${selectedMonth}-01`;
                const monthEnd = `${selectedMonth}-${lastDay}`;
                
                const data = fetchedData.filter(sch => {
                    if (sch.month === selectedMonth) return true;
                    if (sch.date) return isDateInMonth(sch.date, selectedMonth);
                    if (sch.validFrom) {
                        const vFrom = sch.validFrom;
                        const vTo = sch.validTo || '9999-99-99';
                        return vFrom <= monthEnd && vTo >= monthStart;
                    }
                    return false;
                });

                // Actions (Leaves)
                const qActions = query(collection(db, 'actions'), where('employeeId', '==', currentUserId));
                getDocs(qActions).then(actionSnap => {
                    const fetchedActions = actionSnap.docs
                        .map(d => ({ ...d.data(), id: d.id } as ActionLog))
                        .filter(a => {
                            const start = a.fromDate;
                            const end = a.toDate;
                            return (start <= monthEnd && end >= monthStart);
                        });
                    
                    const actionSchedules: Schedule[] = [];
                    fetchedActions.forEach(act => {
                        if (act.type === 'positive') return;
                        
                        // Parse dates reliably without timezone day-shifting
                        const sParts = (act.fromDate || '').split('-').map(Number);
                        const eParts = (act.toDate || '').split('-').map(Number);
                        if (sParts.length < 3 || eParts.length < 3) return;
                        
                        const startDate = new Date(sParts[0], sParts[1] - 1, sParts[2]);
                        const endDate = new Date(eParts[0], eParts[1] - 1, eParts[2]);
                        
                        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            const dateStr = `${y}-${m}-${day}`;
                            
                            if (dateStr.startsWith(selectedMonth)) {
                                actionSchedules.push({
                                    id: `action_${act.id}_${dateStr}`,
                                    userId: currentUserId,
                                    locationId: 'LEAVE_ACTION',
                                    date: dateStr,
                                    shifts: [],
                                    note: act.type,
                                    userType: 'user',
                                    month: selectedMonth,
                                    description: act.description,
                                    actionDetails: {
                                        actionId: act.id,
                                        type: act.type,
                                        description: act.description,
                                        deductionDays: (act as any).deductionDays,
                                        suspensionDays: (act as any).suspensionDays,
                                        permissionHours: (act as any).permissionHours || act.hours,
                                        timeFrom: act.timeFrom,
                                        timeTo: act.timeTo,
                                        penaltyId: act.penaltyId,
                                        fromDate: act.fromDate,
                                        toDate: act.toDate
                                    }
                                });
                            }
                        }
                    });

                    // Only full-day absences and leaves replace regular work shifts;
                    // disciplinary notices/violations will be displayed alongside duty shifts!
                    const fullDayLeaveTypes = ['annual_leave', 'sick_leave', 'unjustified_absence', 'justified_absence', 'suspension'];
                    const fullDayLeaveDates = new Set(
                        actionSchedules.filter(s => fullDayLeaveTypes.includes(s.note || '')).map(s => s.date)
                    );
                    const filteredRegularSchedules = data.filter(s => !s.date || !fullDayLeaveDates.has(s.date));
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
        }
        setLoading(false);
    }, [selectedMonth, currentUserId, refreshTrigger]);

    // --- FULL SCHEDULE VIEW FETCH (REAL-TIME SNAPSHOT) ---
    // Updated to use getDoc for immediate deletion reflection
    useEffect(() => {
        if (viewMode === 'full' && selectedDepartmentId) {
            setLoading(true);
            const docRef = doc(db, 'monthly_publishes', `${selectedDepartmentId}_${selectedMonth}`);
            getDoc(docRef).then((docSnap) => {
                if (docSnap.exists()) {
                    setPublishedData(docSnap.data() as SavedTemplate);
                } else {
                    setPublishedData(null);
                }
                setLoading(false);
            }).catch((error) => {
                console.error("Error watching published schedule", error);
                setLoading(false);
            });
        } else if (viewMode === 'full') {
            setPublishedData(null);
            setLoading(false);
        }
    }, [viewMode, selectedDepartmentId, selectedMonth, refreshTrigger]);

    const getLocationName = useCallback((sch: Schedule) => {
        if (sch.locationId === 'LEAVE_ACTION') {
            const map: Record<string, { ar: string; en: string }> = {
                'conduct_violation': { ar: 'مخالفة سلوك / تعليمات', en: 'CONDUCT VIOLATION' },
                'violation': { ar: 'مخالفة إدارية رسمية', en: 'ADMINISTRATIVE VIOLATION' },
                'late': { ar: 'تأخير عن مواعيد العمل', en: 'LATE ATTENDANCE' },
                'early_leave': { ar: 'انصراف مبكر بدون إذن', en: 'EARLY DEPARTURE' },
                'permission_hours': { ar: 'إذن خروج مؤقت (ساعات)', en: 'TIME PERMIT' },
                'neglect': { ar: 'إهمال وتقصير في العمل', en: 'WORK NEGLECT' },
                'verbal_warning': { ar: 'لفت نظر / تنبيه شفوي', en: 'VERBAL WARNING' },
                'deduction': { ar: 'خصم مالي من الراتب', en: 'SALARY DEDUCTION' },
                'suspension': { ar: 'إيقاف مؤقت عن العمل', en: 'WORK SUSPENSION' },
                'unjustified_absence': { ar: 'غياب بدون عذر مقبول', en: 'UNAUTHORIZED ABSENCE' },
                'justified_absence': { ar: 'غياب بعذر معتمد', en: 'EXCUSED ABSENCE' },
                'annual_leave': { ar: 'إجازة اعتيادية سنوية', en: 'ANNUAL LEAVE' },
                'sick_leave': { ar: 'إجازة مرضية معتمدة', en: 'SICK LEAVE' },
                'mission': { ar: 'مأمورية عمل رسمية', en: 'OFFICIAL MISSION' }
            };
            const actInfo = map[sch.note || ''];
            if (actInfo) {
                return dir === 'rtl' ? actInfo.ar : actInfo.en;
            }
            return (sch.note || 'LEAVE').toUpperCase().replace(/_/g, ' ');
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
        return display;
    }, [locations, dir]);

    // Enhanced Status Logic with Absence Detection AND Manual Flag
    const getTicketStatus = (sch: Schedule) => {
        if (sch.locationId === 'LEAVE_ACTION') {
            const actType = sch.note || '';
            const actionStatusMap: Record<string, any> = {
                conduct_violation: {
                    label: 'CONDUCT VIOLATION',
                    subLabel: 'مخالفة سلوكية',
                    classBadge: 'DISCIPLINARY',
                    theme: 'crimson',
                    icon: 'fa-user-shield',
                    watermarkIcon: 'fa-scale-unbalanced-flip',
                    isAction: true,
                    isViolation: true,
                    severity: 'critical'
                },
                violation: {
                    label: 'OFFICIAL VIOLATION',
                    subLabel: 'مخالفة رسمية',
                    classBadge: 'INFRACTION',
                    theme: 'rose_dark',
                    icon: 'fa-triangle-exclamation',
                    watermarkIcon: 'fa-gavel',
                    isAction: true,
                    isViolation: true,
                    severity: 'critical'
                },
                late: {
                    label: 'LATE ARRIVAL',
                    subLabel: 'تأخير دوام',
                    classBadge: 'TIME BREACH',
                    theme: 'amber_glow',
                    icon: 'fa-user-clock',
                    watermarkIcon: 'fa-clock',
                    isAction: true,
                    isViolation: true,
                    severity: 'medium'
                },
                early_leave: {
                    label: 'EARLY DEPARTURE',
                    subLabel: 'انصراف مبكر',
                    classBadge: 'EARLY EXIT',
                    theme: 'orange_burn',
                    icon: 'fa-person-walking-arrow-right',
                    watermarkIcon: 'fa-door-open',
                    isAction: true,
                    isViolation: true,
                    severity: 'medium'
                },
                permission_hours: {
                    label: 'TIME PERMIT',
                    subLabel: 'إذن ساعات',
                    classBadge: 'EXIT PASS',
                    theme: 'cyan_ocean',
                    icon: 'fa-business-time',
                    watermarkIcon: 'fa-clock-rotate-left',
                    isAction: true,
                    isViolation: false,
                    severity: 'info'
                },
                neglect: {
                    label: 'WORK NEGLECT',
                    subLabel: 'إهمال وتقصير',
                    classBadge: 'PERFORMANCE',
                    theme: 'burnt_rust',
                    icon: 'fa-clipboard-xmark',
                    watermarkIcon: 'fa-triangle-exclamation',
                    isAction: true,
                    isViolation: true,
                    severity: 'high'
                },
                verbal_warning: {
                    label: 'VERBAL NOTICE',
                    subLabel: 'لفت نظر',
                    classBadge: 'ADVISORY',
                    theme: 'yellow_gold',
                    icon: 'fa-bullhorn',
                    watermarkIcon: 'fa-comment-dots',
                    isAction: true,
                    isViolation: true,
                    severity: 'low'
                },
                deduction: {
                    label: 'DEDUCTION ORDER',
                    subLabel: 'خصم من الراتب',
                    classBadge: 'PAYROLL ACTION',
                    theme: 'wine_red',
                    icon: 'fa-file-invoice-dollar',
                    watermarkIcon: 'fa-hand-holding-dollar',
                    isAction: true,
                    isViolation: true,
                    severity: 'critical'
                },
                suspension: {
                    label: 'WORK SUSPENSION',
                    subLabel: 'إيقاف عن العمل',
                    classBadge: 'WORK HALT',
                    theme: 'obsidian_dark',
                    icon: 'fa-ban',
                    watermarkIcon: 'fa-hand',
                    isAction: true,
                    isViolation: true,
                    severity: 'critical'
                },
                unjustified_absence: {
                    label: 'UNEXCUSED ABSENT',
                    subLabel: 'غياب غير مبرر',
                    classBadge: 'ATTENDANCE FAULT',
                    theme: 'scarlet_blood',
                    icon: 'fa-user-xmark',
                    watermarkIcon: 'fa-calendar-xmark',
                    isAction: true,
                    isViolation: true,
                    severity: 'critical'
                },
                justified_absence: {
                    label: 'EXCUSED ABSENCE',
                    subLabel: 'غياب بعذر',
                    classBadge: 'EXCUSED NOTE',
                    theme: 'slate_indigo',
                    icon: 'fa-envelope-open-text',
                    watermarkIcon: 'fa-file-lines',
                    isAction: true,
                    isViolation: false,
                    severity: 'info'
                },
                annual_leave: {
                    label: 'ANNUAL LEAVE',
                    subLabel: 'إجازة سنوية',
                    classBadge: 'VACATION PASS',
                    theme: 'emerald_paradise',
                    icon: 'fa-umbrella-beach',
                    watermarkIcon: 'fa-plane',
                    isAction: true,
                    isViolation: false,
                    severity: 'leave'
                },
                sick_leave: {
                    label: 'SICK LEAVE',
                    subLabel: 'إجازة مرضية',
                    classBadge: 'MEDICAL PASS',
                    theme: 'teal_clinic',
                    icon: 'fa-heart-pulse',
                    watermarkIcon: 'fa-notes-medical',
                    isAction: true,
                    isViolation: false,
                    severity: 'leave'
                },
                mission: {
                    label: 'OFFICIAL MISSION',
                    subLabel: 'مأمورية رسمية',
                    classBadge: 'MISSION DUTY',
                    theme: 'royal_blue',
                    icon: 'fa-briefcase',
                    watermarkIcon: 'fa-building',
                    isAction: true,
                    isViolation: false,
                    severity: 'duty'
                }
            };

            const matched = actionStatusMap[actType];
            if (matched) return matched;
            
            if (actType.includes('absence')) {
                return {
                    label: 'ABSENT',
                    subLabel: 'غياب',
                    classBadge: 'ABSENCE',
                    theme: 'scarlet_blood',
                    icon: 'fa-user-slash',
                    watermarkIcon: 'fa-calendar-xmark',
                    isAction: true,
                    isViolation: true,
                    severity: 'critical'
                };
            }
            return {
                label: (actType || 'ACTION').toUpperCase().replace(/_/g, ' '),
                subLabel: 'إجراء إداري',
                classBadge: 'ADMIN ACTION',
                theme: 'crimson',
                icon: 'fa-file-shield',
                watermarkIcon: 'fa-shield-halved',
                isAction: true,
                isViolation: true,
                severity: 'medium'
            };
        }

        const isSwap = (sch.locationId || '').toLowerCase().includes('swap') || (sch.note || '').toLowerCase().includes('swap');
        
        const isManualRamadan = sch.isRamadan === true;
        const isExplicitNotRamadan = sch.isRamadan === false;

        if (!sch.date) {
          let isRamadanRange = false;
          if (isManualRamadan) isRamadanRange = true;
          else if (isExplicitNotRamadan) isRamadanRange = false;
          else isRamadanRange = checkRamadanOverlap(sch.validFrom, sch.validTo, sch.month);
          
          const isEidRange = checkEidOverlap(sch.validFrom, sch.validTo, sch.month);

          if(sch.locationId === 'common_duty') return { 
              label: isRamadanRange ? 'RAMADAN ROSTER' : 'GENERAL ROSTER', 
              subLabel: isRamadanRange ? 'جدول تكليف رمضان' : 'جدول تكليف شهري',
              classBadge: 'MONTHLY ROSTER',
              theme: isRamadanRange ? 'indigo' : 'purple', 
              icon: isRamadanRange ? 'fa-moon' : 'fa-layer-group', 
              watermarkIcon: isRamadanRange ? 'fa-mosque' : 'fa-clipboard-list',
              isHoliday: false, 
              isRamadan: isRamadanRange 
          };
          
          if(sch.locationId === 'Holiday Shift') {
              if (isEidRange) return { 
                  label: 'EID MUBARAK', 
                  subLabel: 'جدول عطلة العيد',
                  classBadge: 'EID ROSTER',
                  theme: 'teal', 
                  icon: 'fa-star', 
                  watermarkIcon: 'fa-kaaba',
                  isHoliday: true, 
                  isEid: true 
              };
              return { 
                  label: 'HOLIDAY ROSTER', 
                  subLabel: 'جدول العطلات الرسمية',
                  classBadge: 'HOLIDAY ROSTER',
                  theme: 'rose', 
                  icon: 'fa-gift', 
                  watermarkIcon: 'fa-gift',
                  isHoliday: true 
              };
          }
          
          if (isSwap) return { 
              label: 'SWAP ROSTER', 
              subLabel: 'جدول تبديل معتمد',
              classBadge: 'SWAP PASS',
              theme: 'violet', 
              icon: 'fa-right-left', 
              watermarkIcon: 'fa-arrow-right-arrow-left',
              pulse: true 
          };
          
          return { 
              label: isRamadanRange ? 'RAMADAN ROSTER' : 'GENERAL SCHEDULE', 
              subLabel: isRamadanRange ? 'جدول شهر رمضان' : 'جدول الدوام المعتمد',
              classBadge: 'CONFIRMED ROSTER',
              theme: isRamadanRange ? 'indigo' : 'sky', 
              icon: isRamadanRange ? 'fa-moon' : 'fa-calendar-days', 
              watermarkIcon: isRamadanRange ? 'fa-mosque' : 'fa-hospital',
              isRamadan: isRamadanRange 
          };
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

        // FIX: Exceptions should NOT take Eid theme
        const isEid = occasion === 'eid' && !sch.isException;
        const national = getNationalHoliday(sch.date);

        if (shiftDate < today) {
            if (!punchedDates.has(sch.date)) {
                return { 
                    label: 'ABSENT', 
                    subLabel: 'غياب غير مسجل',
                    classBadge: 'UNRECORDED',
                    theme: 'red', 
                    icon: 'fa-times-circle', 
                    watermarkIcon: 'fa-user-slash',
                    isAbsent: true 
                };
            }
            if (national) return { 
                label: 'COMPLETED', 
                subLabel: 'دوام عطلة رسمية منجز',
                classBadge: 'HOLIDAY RECORD',
                theme: 'emerald', 
                icon: 'fa-check-circle', 
                watermarkIcon: 'fa-award',
                grayscale: true, 
                isNational: true 
            };
            if (isRamadan) return { 
                label: 'COMPLETED', 
                subLabel: 'دوام رمضاني منجز',
                classBadge: 'RAMADAN RECORD',
                theme: 'indigo', 
                icon: 'fa-check-circle', 
                watermarkIcon: 'fa-moon',
                grayscale: true, 
                isRamadan: true 
            };
            return { 
                label: 'COMPLETED', 
                subLabel: 'دوام منجز ومؤكد',
                classBadge: 'SERVED DUTY',
                theme: 'slate', 
                icon: 'fa-check-circle', 
                watermarkIcon: 'fa-circle-check',
                grayscale: true 
            };
        }

        if (isSwap) return { 
            label: 'SWAP DUTY', 
            subLabel: 'تبديل معتمد',
            classBadge: 'SWAP PASS',
            theme: 'violet', 
            icon: 'fa-right-left', 
            watermarkIcon: 'fa-arrow-right-arrow-left',
            pulse: true, 
            isRamadan, 
            isEid 
        };
        
        if (shiftDate.getTime() === today.getTime()) {
            return { 
                label: 'TODAY ON DUTY', 
                subLabel: 'دوام اليوم النشط',
                classBadge: 'ACTIVE DUTY',
                theme: 'amber', 
                icon: 'fa-briefcase', 
                watermarkIcon: 'fa-business-time',
                pulse: true, 
                isToday: true,
                isRamadan, 
                isEid, 
                isNational: !!national 
            };
        }
        
        if (national) return { 
            label: national.name.toUpperCase(), 
            subLabel: 'عطلة رسمية معتمدة',
            classBadge: 'NATIONAL HOLIDAY',
            theme: 'emerald', 
            icon: national.icon, 
            watermarkIcon: 'fa-landmark',
            isNational: true 
        };
        if (isEid) return { 
            label: 'EID MUBARAK', 
            subLabel: 'عيد مبارك',
            classBadge: 'EID SPECIAL',
            theme: 'teal', 
            icon: 'fa-star', 
            watermarkIcon: 'fa-kaaba',
            isEid: true 
        };
        
        // NEW: Exception Theme
        if (sch.isException) return { 
            label: 'EXCEPTION DUTY', 
            subLabel: 'تكليف استثنائي',
            classBadge: 'SPECIAL SHIFT',
            theme: 'purple', 
            icon: 'fa-star-of-life',
            watermarkIcon: 'fa-bolt'
        };

        if (isRamadan) return { 
            label: 'RAMADAN DUTY', 
            subLabel: 'دوام شهر رمضان',
            classBadge: 'RAMADAN SHIFT',
            theme: 'indigo', 
            icon: 'fa-moon', 
            watermarkIcon: 'fa-mosque',
            isRamadan: true 
        };

        if (sch.locationId.includes('Friday')) return { 
            label: 'FRIDAY SHIFT', 
            subLabel: 'نوبتجية الجمعة',
            classBadge: 'FRIDAY DUTY',
            theme: 'emerald', 
            icon: 'fa-mosque', 
            watermarkIcon: 'fa-hands-praying'
        };
        if (sch.locationId.includes('Holiday')) return { 
            label: 'HOLIDAY SHIFT', 
            subLabel: 'نوبتجية عطلة',
            classBadge: 'HOLIDAY PASS',
            theme: 'rose', 
            icon: 'fa-gift', 
            watermarkIcon: 'fa-gift'
        };
        
        return { 
            label: 'UPCOMING SHIFT', 
            subLabel: 'دوام قادم معتمد',
            classBadge: 'CONFIRMED SHIFT',
            theme: 'sky', 
            icon: 'fa-calendar-check',
            watermarkIcon: 'fa-hospital-user'
        };
    };

    const getGradient = (theme: string, isGrayscale: boolean, isRamadan?: boolean, isEid?: boolean, isNational?: boolean, isAbsent?: boolean) => {
        if (isAbsent) return 'bg-gradient-to-br from-red-950 via-rose-950 to-neutral-950 text-white border-red-600/80 shadow-red-950/50';
        if (isGrayscale) return 'bg-gradient-to-br from-slate-900 via-slate-800 to-zinc-900 text-slate-200 border-slate-700/60 shadow-slate-950/40';
        if (isNational) return 'bg-gradient-to-br from-emerald-950 via-green-900 to-teal-950 text-white border-amber-400/80 shadow-emerald-950/40';
        if (isRamadan) return 'bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 text-amber-100 border-amber-500/60 shadow-indigo-950/50';
        if (isEid) return 'bg-gradient-to-br from-rose-950 via-pink-900 to-red-950 text-white border-pink-400/70 shadow-rose-950/40';
        const themes: Record<string, string> = {
            purple: 'bg-gradient-to-br from-purple-950 via-indigo-900 to-slate-950 text-white border-purple-400/60 shadow-purple-950/40',
            rose: 'bg-gradient-to-br from-rose-950 via-rose-800 to-red-950 text-white border-rose-400/60 shadow-rose-950/40',
            blue: 'bg-gradient-to-br from-blue-950 via-indigo-900 to-sky-950 text-white border-blue-400/60 shadow-blue-950/40',
            amber: 'bg-gradient-to-br from-amber-950 via-amber-750 to-orange-950 text-white border-amber-400/70 shadow-amber-950/50',
            violet: 'bg-gradient-to-br from-violet-950 via-purple-900 to-slate-950 text-white border-purple-400/60 shadow-purple-950/40',
            teal: 'bg-gradient-to-br from-teal-950 via-teal-800 to-emerald-950 text-white border-teal-400/60 shadow-teal-950/40',
            emerald: 'bg-gradient-to-br from-emerald-950 via-teal-900 to-green-950 text-white border-emerald-400/60 shadow-emerald-950/40',
            sky: 'bg-gradient-to-br from-slate-950 via-blue-900 to-sky-900 text-white border-sky-400/60 shadow-sky-950/50',
            indigo: 'bg-gradient-to-br from-indigo-950 via-slate-900 to-blue-950 text-amber-100 border-indigo-400/60 shadow-indigo-950/40',
            slate: 'bg-gradient-to-br from-slate-900 via-slate-800 to-zinc-900 text-slate-200 border-slate-700/60 shadow-slate-950/40',
            red: 'bg-gradient-to-br from-red-950 via-red-900 to-rose-950 text-white border-red-500/70 shadow-red-950/40',
            // --- High Impact Specialized Themes for Disciplinary Actions & Permissions ---
            crimson: 'bg-gradient-to-br from-rose-950 via-rose-800 to-red-900 text-white border-rose-500/80 shadow-rose-900/30',
            rose_dark: 'bg-gradient-to-br from-red-950 via-red-800 to-rose-950 text-white border-red-500/80 shadow-red-900/30',
            amber_glow: 'bg-gradient-to-br from-amber-900 via-amber-700 to-yellow-800 text-white border-amber-400/80 shadow-amber-900/30',
            orange_burn: 'bg-gradient-to-br from-orange-950 via-orange-700 to-rose-900 text-white border-orange-500/80 shadow-orange-900/30',
            cyan_ocean: 'bg-gradient-to-br from-cyan-950 via-cyan-800 to-blue-900 text-white border-cyan-400/80 shadow-cyan-900/30',
            burnt_rust: 'bg-gradient-to-br from-stone-950 via-stone-800 to-red-950 text-white border-stone-500/80 shadow-stone-900/30',
            yellow_gold: 'bg-gradient-to-br from-amber-900 via-yellow-700 to-amber-900 text-white border-yellow-400/80 shadow-yellow-900/30',
            wine_red: 'bg-gradient-to-br from-red-950 via-rose-900 to-neutral-950 text-white border-rose-500/80 shadow-red-900/30',
            obsidian_dark: 'bg-gradient-to-br from-slate-950 via-stone-900 to-red-950 text-white border-red-700/80 shadow-black/50',
            scarlet_blood: 'bg-gradient-to-br from-red-950 via-rose-950 to-neutral-950 text-white border-red-600/80 shadow-red-950/40',
            slate_indigo: 'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-800 text-white border-indigo-400/80 shadow-indigo-950/30',
            emerald_paradise: 'bg-gradient-to-br from-emerald-950 via-teal-800 to-green-950 text-white border-emerald-400/80 shadow-emerald-900/30',
            teal_clinic: 'bg-gradient-to-br from-teal-950 via-teal-800 to-cyan-950 text-white border-teal-400/80 shadow-teal-900/30',
            royal_blue: 'bg-gradient-to-br from-blue-950 via-blue-800 to-indigo-950 text-white border-blue-400/80 shadow-blue-900/30'
        };
        return themes[theme] || themes.blue;
    };

    // --- RENDER FULL VISUAL VIEW (READ ONLY) ---
    const RenderFullVisualSchedule = () => {
        if (!publishedData) {
            return (
                <div className="text-center py-20 text-slate-400">
                    <i className="fas fa-file-excel text-4xl mb-4 opacity-50"></i>
                    <p className="font-bold">No Published Schedule found for {selectedMonth}</p>
                    <p className="text-xs mt-2">The supervisor hasn't published the official schedule yet.</p>
                </div>
            );
        }

        // Check if Ramadan data exists
        const hasRamadan = publishedData.ramadanData && publishedData.ramadanData.some((c: any) => c.staff.length > 0);

        return (
            <div className="space-y-12">
                
                {/* 1. GENERAL DUTY */}
                <div className="break-after-page">
                    <GeneralScheduleView 
                        data={publishedData.generalData} 
                        commonDuties={publishedData.commonDuties} 
                        isEditing={false} // Read Only
                        publishMonth={publishedData.targetMonth || selectedMonth} 
                        globalStartDate={publishedData.globalStartDate || ''} 
                        globalEndDate={publishedData.globalEndDate || ''}
                        setGlobalStartDate={()=>{}} setGlobalEndDate={()=>{}}
                        scheduleNote={publishedData.scheduleNote || ''} setScheduleNote={()=>{}}
                        onUpdateColumn={()=>{}} onUpdateDuty={()=>{}} onAddColumn={()=>{}} onRemoveColumn={()=>{}} onReorderColumns={()=>{}} onAddDuty={()=>{}} onRemoveDuty={()=>{}}
                        locations={[]} allUsers={[]} searchTerm=""
                    />
                </div>

                {/* 2. RAMADAN (If exists) */}
                {hasRamadan && (
                     <div className="break-after-page">
                         <RamadanScheduleView
                            ramadanData={publishedData.ramadanData || []}
                            setRamadanData={()=>{}}
                            ramadanCommonDuties={publishedData.ramadanCommonDuties || []}
                            setRamadanCommonDuties={()=>{}}
                            ramadanFridayData={publishedData.ramadanFridayData || []}
                            setRamadanFridayData={()=>{}}
                            ramadanFridayColumns={publishedData.ramadanFridayColumns || []}
                            setRamadanFridayColumns={()=>{}}
                            ramadanStartDate="" setRamadanStartDate={()=>{}}
                            ramadanEndDate="" setRamadanEndDate={()=>{}}
                            scheduleNote={publishedData.ramadanScheduleNote || ''} setScheduleNote={()=>{}}
                            isEditing={false}
                            allUsers={[]} locations={[]} savedTemplates={[]}
                         />
                     </div>
                )}

                {/* 3. FRIDAY SHIFTS */}
                <div className="break-after-page">
                     <FridayScheduleView 
                        data={publishedData.fridayData} 
                        isEditing={false} 
                        allUsers={[]} 
                        publishMonth={publishedData.targetMonth || selectedMonth}
                        onUpdateRow={()=>{}} onAddRow={()=>{}} onRemoveRow={()=>{}}
                        columns={publishedData.fridayColumns || []}
                        onUpdateColumn={()=>{}} onRemoveColumn={()=>{}}
                        searchTerm=""
                    />
                </div>

                {/* 4. HOLIDAYS */}
                <div className="break-after-page">
                     <HolidayScheduleView 
                        data={publishedData.holidayData} 
                        isEditing={false} 
                        allUsers={[]} 
                        publishMonth={publishedData.targetMonth || selectedMonth}
                        onUpdateRow={()=>{}} onAddRow={()=>{}} onRemoveRow={()=>{}}
                        columns={publishedData.holidayColumns || []}
                        onUpdateColumn={()=>{}} onRemoveColumn={()=>{}}
                        searchTerm=""
                        scheduleNote={publishedData.holidayScheduleNote || ''} 
                        setScheduleNote={()=>{}} 
                    />
                </div>

                {/* 5. EXCEPTIONS */}
                {(publishedData.exceptions || []).length > 0 && (
                     <div className="break-after-page">
                        <ExceptionScheduleView 
                            exceptions={publishedData.exceptions || []}
                            setExceptions={()=>{}}
                            isEditing={false}
                            allUsers={[]} locations={[]} savedTemplates={[]}
                        />
                     </div>
                )}
                
                {/* 6. DOCTORS */}
                <div className="break-after-page">
                    <DoctorScheduleView 
                        data={publishedData.doctorData || []} 
                        isEditing={false} 
                        allUsers={[]} publishMonth={publishedData.targetMonth || selectedMonth}
                        onUpdateRow={()=>{}} onAddRow={()=>{}} onRemoveRow={()=>{}}
                        columns={publishedData.doctorColumns || []}
                        onUpdateColumn={()=>{}} onRemoveColumn={()=>{}}
                        searchTerm=""
                    />
                </div>
                
                {/* 7. DOCTOR FRIDAY */}
                <div className="break-after-page">
                    <DoctorFridayScheduleView 
                        data={publishedData.doctorFridayData || []} 
                        isEditing={false} 
                        allUsers={[]} 
                        publishMonth={publishedData.targetMonth || selectedMonth}
                        onUpdateRow={()=>{}} onAddRow={()=>{}} onRemoveRow={()=>{}}
                        columns={publishedData.doctorFridayColumns || []}
                        onUpdateColumn={()=>{}} onRemoveColumn={()=>{}}
                        searchTerm=""
                    />
                </div>
            </div>
        );
    }

    if (loading) return <Loading />;

    return (
        <div className="max-w-5xl mx-auto px-4 pb-20 pt-6 animate-fade-in print:max-w-none print:p-0 print:m-0" dir={dir}>
            
            {/* Header - Hidden on Print */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 print:hidden">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                        <i className="fas fa-arrow-left rtl:rotate-180"></i>
                    </button>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('user.tab.schedule')}</h1>
                </div>
                
                <div className="flex items-center gap-3 mt-4 md:mt-0 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                    {/* View Switcher */}
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setViewMode('cards')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                        >
                            <i className="fas fa-th-large mr-1"></i> My Tickets
                        </button>
                        <button 
                            onClick={() => setViewMode('full')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'full' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}
                        >
                            <i className="fas fa-table mr-1"></i> Full Schedule
                        </button>
                    </div>

                    <div className="h-6 w-px bg-slate-200 mx-1"></div>

                    {/* Month Controls */}
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
                    
                    <div className="h-6 w-px bg-slate-200 mx-1"></div>

                    <button 
                        onClick={() => setRefreshTrigger(prev => prev + 1)} 
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-indigo-100 text-indigo-600 transition-colors"
                        title="تحديث البيانات"
                    >
                        <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`}></i>
                    </button>

                    {/* Print Button (Only in Full View) */}
                    {viewMode === 'full' && (
                        <button onClick={() => window.print()} className="ml-2 bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-700">
                            <i className="fas fa-print"></i> Print
                        </button>
                    )}
                </div>
            </div>
            
            {viewMode === 'cards' && isNoteOpen && <PersonalNotepad />}
            {viewMode === 'cards' && (
                <div className="flex justify-end mb-4 print:hidden">
                     <button onClick={() => setIsNoteOpen(!isNoteOpen)} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2 ${isNoteOpen ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-yellow-50'}`}>
                        <i className="fas fa-sticky-note"></i> {isNoteOpen ? 'Hide Notes' : 'Personal Notes'}
                    </button>
                </div>
            )}

            {/* --- VIEW MODE: FULL SCHEDULE (PRINTABLE) --- */}
            {viewMode === 'full' ? (
                <RenderFullVisualSchedule />
            ) : (
                /* --- VIEW MODE: CARDS (MY TICKETS) --- */
                schedules.length === 0 ? (
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

                        const titleInfo = getScheduleBilingualInfo(sch, status, dir === 'rtl');
                        
                        let effectiveValidFrom = sch.validFrom;
                        let effectiveValidTo = sch.validTo;

                        if (!effectiveValidFrom && sch.month) {
                            effectiveValidFrom = `${sch.month}-01`;
                        }
                        if (!effectiveValidTo && sch.month) {
                            const [yStr, mStr] = sch.month.split('-');
                            const y = parseInt(yStr, 10);
                            const m = parseInt(mStr, 10);
                            if (!isNaN(y) && !isNaN(m)) {
                                const lastDay = new Date(y, m, 0).getDate();
                                effectiveValidTo = `${sch.month}-${String(lastDay).padStart(2, '0')}`;
                            }
                        } else if (effectiveValidFrom && !effectiveValidTo) {
                            const parts = effectiveValidFrom.split('-');
                            if (parts.length >= 2) {
                                const y = parseInt(parts[0], 10);
                                const m = parseInt(parts[1], 10);
                                const lastDay = new Date(y, m, 0).getDate();
                                effectiveValidTo = `${parts[0]}-${parts[1]}-${String(lastDay).padStart(2, '0')}`;
                            }
                        }

                        const isValidityTicket = Boolean(!sch.date || sch.validFrom);

                        const now = new Date();
                        let isExpired = false;
                        let isUpcoming = false;

                        const expiryDateTarget = effectiveValidTo || sch.date || effectiveValidFrom;
                        if (expiryDateTarget) {
                            const pEnd = parseDateString(expiryDateTarget);
                            if (pEnd) {
                                pEnd.setHours(23, 59, 59, 999);
                                isExpired = pEnd.getTime() < now.getTime();
                            }
                        }

                        const startDateTarget = effectiveValidFrom || sch.date;
                        if (startDateTarget && !isExpired) {
                            const pStart = parseDateString(startDateTarget);
                            if (pStart) {
                                pStart.setHours(0, 0, 0, 0);
                                isUpcoming = pStart.getTime() > now.getTime();
                            }
                        }

                        const validFromStr = formatDateLocalized(effectiveValidFrom, dir === 'rtl');
                        const validToStr = formatDateLocalized(effectiveValidTo, dir === 'rtl');

                        let durationDays: number | null = null;
                        if (effectiveValidFrom && effectiveValidTo) {
                            const dStart = parseDateString(effectiveValidFrom);
                            const dEnd = parseDateString(effectiveValidTo);
                            if (dStart && dEnd) {
                                const diffMs = dEnd.getTime() - dStart.getTime();
                                const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
                                if (days > 0) durationDays = days;
                            }
                        }

                        let displayDateObj = sch.date ? parseDateString(sch.date) : null;
                        const eidName = getEidName(sch.date) || getEidNameForRange(sch.validFrom, sch.validTo) || "";
                        const isEidAdha = eidName.toUpperCase().includes("ADHA");

                        return (
                            <div key={sch.id} className="relative group w-full flex flex-col md:flex-row shadow-2xl transition-all duration-500 transform hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-3xl overflow-hidden">
                                
                                <div className={`flex-1 relative overflow-hidden ${gradientClass} p-0 flex flex-col`}>
                                    
                                    {/* Action & Violation Specialized Atmospheric Watermark & Patterns */}
                                    {status.isAction && (
                                        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                                            <div className="absolute top-[-25%] right-[-10%] w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
                                            <div className="absolute bottom-[-20%] left-[-10%] w-80 h-80 bg-black/30 rounded-full blur-2xl"></div>
                                            <div className="absolute top-1/2 right-6 md:right-16 -translate-y-1/2 opacity-10 pointer-events-none">
                                                <i className={`fas ${status.watermarkIcon || status.icon || 'fa-shield-halved'} text-[14rem] md:text-[18rem] transform rotate-6`}></i>
                                            </div>
                                            {status.isViolation && (
                                                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.03)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.03)_50%,rgba(255,255,255,0.03)_75%,transparent_75%,transparent)] bg-[length:24px_24px] pointer-events-none opacity-50"></div>
                                            )}
                                        </div>
                                    )}

                                    {status.isNational && (
                                        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                                            <div className="absolute top-[-50%] right-[-10%] w-[80%] h-[150%] bg-white/5 skew-x-12"></div>
                                            <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-black/20 to-transparent"></div>
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
                                            <div className="absolute top-0 left-[85%] flex flex-col items-center animate-swing origin-top delay-300">
                                                <div className="h-6 w-px bg-amber-200/50"></div>
                                                <i className="fas fa-star text-amber-300 text-lg drop-shadow-md"></i>
                                            </div>
                                            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                                                <i className="fas fa-mosque text-[12rem] md:text-[18rem] text-white transform scale-125 translate-y-10"></i>
                                            </div>
                                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] opacity-10 mix-blend-overlay"></div>
                                        </div>
                                    )}

                                    {status.isEid && (
                                    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                                        <BalloonsOverlay />
                                        {isEidAdha && <SheepOverlay />}
                                        <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-yellow-300/20 rounded-full blur-3xl"></div>
                                        <div className="absolute bottom-[-50px] left-[-50px] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                                        <div className="absolute top-4 right-10 text-white/30 text-4xl animate-bounce duration-[3000ms]">
                                            <i className="fas fa-gift"></i>
                                        </div>
                                        <div className="absolute top-10 left-10 text-white/20 text-3xl animate-pulse delay-500">
                                            <i className="fas fa-star"></i>
                                        </div>
                                        <div className="absolute bottom-10 right-20 text-white/10 text-5xl animate-spin-slow">
                                            <i className="fas fa-bahai"></i>
                                        </div>
                                        <div className="absolute inset-0 bg-white/5 mix-blend-overlay" style={{backgroundImage: 'radial-gradient(circle, #fff 10%, transparent 10%)', backgroundSize: '15px 15px'}}></div>
                                    </div>
                                    )}

                                    {/* Standard / Regular Duty Atmospheric Watermark & Patterns */}
                                    {!status.isAction && !status.isNational && !status.isRamadan && !status.isEid && (
                                        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                                            <div className="absolute top-[-25%] right-[-10%] w-[32rem] h-[32rem] bg-white/10 rounded-full blur-3xl"></div>
                                            <div className="absolute bottom-[-20%] left-[-10%] w-96 h-96 bg-black/40 rounded-full blur-2xl"></div>
                                            <div className="absolute top-1/2 right-6 md:right-16 -translate-y-1/2 opacity-10 pointer-events-none">
                                                <i className={`fas ${status.watermarkIcon || status.icon || 'fa-building-shield'} text-[14rem] md:text-[20rem] transform rotate-6 text-white`}></i>
                                            </div>
                                            {status.isToday && (
                                                <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-amber-400/20 rounded-full blur-3xl animate-pulse"></div>
                                            )}
                                            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.02)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.02)_50%,rgba(255,255,255,0.02)_75%,transparent_75%,transparent)] bg-[length:32px_32px] pointer-events-none opacity-40"></div>
                                        </div>
                                    )}
                                    
                                    {isValidityTicket && (
                                        <div className={`backdrop-blur-md border-b px-3.5 py-3 sm:px-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 z-20 transition-all ${
                                            isExpired 
                                                ? 'bg-rose-950/85 border-rose-500/40 text-rose-100 shadow-[0_4px_25px_rgba(225,29,72,0.25)]' 
                                                : isUpcoming
                                                    ? 'bg-sky-950/85 border-sky-500/40 text-sky-100 shadow-[0_4px_25px_rgba(14,165,233,0.25)]'
                                                    : 'bg-black/60 border-white/15 text-white shadow-lg'
                                        }`}>
                                            {/* Status Indicator Badge (VALID / EXPIRED / UPCOMING) */}
                                            <div className="flex items-center justify-between sm:justify-start gap-2.5">
                                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase border shadow-md ${
                                                    isExpired
                                                        ? 'bg-rose-500/30 border-rose-400/60 text-rose-200 ring-1 ring-rose-400/40'
                                                        : isUpcoming
                                                            ? 'bg-sky-500/30 border-sky-400/60 text-sky-200 ring-1 ring-sky-400/40'
                                                            : 'bg-emerald-500/30 border-emerald-400/60 text-emerald-200 ring-1 ring-emerald-400/40'
                                                }`}>
                                                    <span className="flex h-2.5 w-2.5 relative">
                                                        {!isExpired && (
                                                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                                                isUpcoming ? 'bg-sky-400' : 'bg-emerald-400'
                                                            }`}></span>
                                                        )}
                                                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                                                            isExpired ? 'bg-rose-400' : isUpcoming ? 'bg-sky-400' : 'bg-emerald-400'
                                                        }`}></span>
                                                    </span>
                                                    <i className={`fas ${
                                                        isExpired ? 'fa-clock-rotate-left' : isUpcoming ? 'fa-hourglass-start' : 'fa-circle-check'
                                                    } text-xs`}></i>
                                                    <span className="tracking-wide font-black">
                                                        {isExpired 
                                                            ? (dir === 'rtl' ? 'منتهي الصلاحية' : 'EXPIRED') 
                                                            : isUpcoming
                                                                ? (dir === 'rtl' ? 'يبدأ قريباً' : 'UPCOMING')
                                                                : (dir === 'rtl' ? 'ساري المفعول' : 'VALID')}
                                                    </span>
                                                </div>
                                                
                                                <span className="text-[11px] font-bold text-white/80 hidden sm:inline">
                                                    {dir === 'rtl' ? 'مدة فاعلية وسريان الجدول' : 'Schedule Validity Period'}
                                                </span>
                                            </div>

                                            {/* Validity Range: FROM -> TO with prominent clear badges */}
                                            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 font-mono text-[11px] sm:text-xs font-bold text-white bg-black/50 px-3 sm:px-3.5 py-1.5 rounded-xl border border-white/20 shadow-inner">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] uppercase tracking-wider text-white/70 font-sans font-black">
                                                        {dir === 'rtl' ? 'من' : 'FROM'}
                                                    </span>
                                                    <span className={`px-2 sm:px-2.5 py-0.5 rounded-lg font-bold border text-[10px] sm:text-xs ${
                                                        isExpired 
                                                            ? 'bg-rose-500/25 text-rose-200 border-rose-500/40' 
                                                            : 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                                                    }`}>
                                                        {validFromStr}
                                                    </span>
                                                </div>

                                                <i className={`fas fa-arrow-${dir === 'rtl' ? 'left' : 'right'} text-[10px] sm:text-xs ${isExpired ? 'text-rose-400' : 'text-emerald-400'}`}></i>

                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] uppercase tracking-wider text-white/70 font-sans font-black">
                                                        {dir === 'rtl' ? 'إلى' : 'TO'}
                                                    </span>
                                                    <span className={`px-2 sm:px-2.5 py-0.5 rounded-lg font-bold border text-[10px] sm:text-xs ${
                                                        isExpired 
                                                            ? 'bg-rose-500/25 text-rose-200 border-rose-500/40' 
                                                            : 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                                                    }`}>
                                                        {validToStr}
                                                    </span>
                                                </div>

                                                {durationDays && (
                                                    <div className="flex items-center gap-1 border-l rtl:border-l-0 rtl:border-r border-white/20 pl-2 rtl:pl-0 rtl:pr-2 ml-1 rtl:ml-0 rtl:mr-1 text-white/90 font-sans font-bold text-[10px] sm:text-[11px]">
                                                        <i className="fas fa-calendar-days text-white/60 text-[10px]"></i>
                                                        <span>{dir === 'rtl' ? `${durationDays} يوم` : `${durationDays} Days`}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="p-4 sm:p-6 md:p-8 flex flex-col h-full relative z-10">
                                        <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4 mb-5 sm:mb-6">
                                            {sch.date && displayDateObj ? (
                                                <div className="flex flex-col">
                                                    <span className={`text-sm font-bold uppercase tracking-widest opacity-70 mb-[-5px] ${status.isAbsent ? 'text-red-800' : ''}`}>
                                                        {displayDateObj.toLocaleString(dir === 'rtl' ? 'ar-EG' : 'en-US', { month: 'long' })}
                                                    </span>
                                                    <span className={`text-5xl sm:text-6xl font-black leading-none tracking-tighter drop-shadow-lg font-oswald ${status.isAbsent ? 'text-red-900' : ''}`}>
                                                        {displayDateObj.getDate()}
                                                    </span>
                                                    <span className={`text-xs font-medium opacity-80 uppercase tracking-wide mt-1 ${status.isAbsent ? 'text-red-800' : ''}`}>
                                                        {displayDateObj.toLocaleString(dir === 'rtl' ? 'ar-EG' : 'en-US', { weekday: 'long' })}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <div className="flex items-center gap-2.5 sm:gap-3 mb-1 min-w-0">
                                                        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl sm:text-2xl shadow-inner ${
                                                            status.isRamadan 
                                                                ? 'bg-amber-400/25 text-amber-300 border border-amber-400/40 shadow-amber-900/30' 
                                                                : isExpired
                                                                    ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40 shadow-rose-900/30'
                                                                    : 'bg-white/20 text-white border border-white/30 shadow-black/20'
                                                        }`}>
                                                            <i className={`fas ${status.icon}`}></i>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-white/70 font-bold block truncate">
                                                                {titleInfo.secondary}
                                                            </span>
                                                            <h3 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight font-oswald leading-snug text-white drop-shadow-md mt-0.5 break-words">
                                                                {titleInfo.primary}
                                                            </h3>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                        <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] px-2.5 py-0.5 rounded-md bg-white/10 text-white/80 font-bold border border-white/15">
                                                            {dir === 'rtl' ? 'جدول دوام رسمي معتمد' : 'OFFICIAL CERTIFIED ROSTER'}
                                                        </span>
                                                        {isExpired && (
                                                            <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] px-2 py-0.5 rounded-md bg-rose-500/30 text-rose-200 font-bold border border-rose-400/40">
                                                                {dir === 'rtl' ? 'منتهي الصلاحية' : 'EXPIRED'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {/* Top Right Status Badge */}
                                            <div className={`backdrop-blur-md px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-xl border text-[10px] sm:text-[11px] font-black uppercase tracking-wider shadow-md self-start flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${
                                                status.isAction 
                                                    ? 'bg-black/35 border-white/20 text-white shadow-black/30' 
                                                    : status.isAbsent 
                                                        ? 'text-red-900 bg-red-100 border-red-200' 
                                                        : isExpired
                                                            ? 'bg-rose-500/25 border-rose-400/40 text-rose-200'
                                                            : status.isRamadan 
                                                                ? 'bg-amber-500/25 border-amber-400/40 text-amber-200' 
                                                                : 'bg-white/20 border-white/20 text-white'
                                            }`}>
                                                {status.isAction ? (
                                                    <>
                                                        <span className="flex h-2 w-2 relative">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                                                        </span>
                                                        <i className={`fas ${status.icon} text-xs`}></i>
                                                        <span>{status.subLabel || status.label}</span>
                                                    </>
                                                ) : status.isRamadan ? (
                                                    <>
                                                        <i className="fas fa-moon text-amber-300 text-xs"></i>
                                                        <span>{dir === 'rtl' ? 'جدول شهر رمضان' : 'RAMADAN ROSTER'}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className={`fas ${status.icon} text-xs`}></i>
                                                        <span>{titleInfo.badge}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mb-6">
                                            <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-70 mb-1 flex items-center gap-1.5">
                                                <i className={`fas ${status.isAction ? (status.isViolation ? 'fa-triangle-exclamation text-amber-300' : 'fa-clipboard-check text-emerald-300') : 'fa-building-shield'}`}></i>
                                                <span>
                                                    {sch.locationId === 'LEAVE_ACTION' 
                                                        ? (status.isViolation 
                                                            ? (dir === 'rtl' ? 'مخالفة إدارية مقيدة' : 'Disciplinary Record') 
                                                            : (dir === 'rtl' ? 'إجراء وتصريح إداري' : 'Administrative Record')) 
                                                        : (dir === 'rtl' ? 'مكان الدوام والتكليف' : 'Assigned Unit')}
                                                </span>
                                            </p>
                                            
                                            <h3 className={`text-2xl md:text-4xl font-black uppercase tracking-tight leading-tight drop-shadow-md font-oswald max-w-2xl ${status.isAbsent ? 'text-red-900' : 'text-white'}`}>
                                                {getLocationName(sch)}
                                            </h3>
                                            
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                {status.isAction && (
                                                    <>
                                                        <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black tracking-wider text-white border border-white/20 shadow-sm">
                                                            <i className={`fas ${status.icon}`}></i>
                                                            <span>{status.label}</span>
                                                        </div>
                                                        {status.subLabel && (
                                                            <div className="inline-flex items-center gap-1.5 bg-black/25 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-bold text-white/90 border border-white/10">
                                                                <span>{status.subLabel}</span>
                                                            </div>
                                                        )}
                                                    </>
                                                )}

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

                                        {/* SPECIALIZED VIOLATION / ACTION DETAILS PANEL */}
                                        {sch.locationId === 'LEAVE_ACTION' ? (
                                            <div className="mt-auto pt-2 space-y-3">
                                                <div className="bg-black/35 backdrop-blur-md rounded-2xl p-4 md:p-5 border border-white/15 shadow-xl relative overflow-hidden group/violation hover:bg-black/45 transition-all">
                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
                                                    
                                                    {/* Notice Header Row */}
                                                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-white/10">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white text-sm shadow-inner">
                                                                <i className={`fas ${status.icon}`}></i>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] uppercase tracking-widest text-white/60 font-bold">
                                                                    {dir === 'rtl' ? 'بيان المخالفة وتفاصيل الإجراء' : 'Action Details & Notice'}
                                                                </p>
                                                                <p className="text-xs font-black text-white font-mono">
                                                                    REF #{sch.actionDetails?.actionId ? sch.actionDetails.actionId.slice(-6).toUpperCase() : (sch.id ? sch.id.slice(-6).toUpperCase() : 'REC-01')}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Action Metrics Badges */}
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {sch.actionDetails?.deductionDays && Number(sch.actionDetails.deductionDays) > 0 ? (
                                                                <span className="bg-red-500/80 text-white border border-red-400/50 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                                                                    <i className="fas fa-coins text-[9px]"></i>
                                                                    <span>{sch.actionDetails.deductionDays} {dir === 'rtl' ? 'أيام خصم' : 'Days Deduction'}</span>
                                                                </span>
                                                            ) : null}

                                                            {sch.actionDetails?.suspensionDays && Number(sch.actionDetails.suspensionDays) > 0 ? (
                                                                <span className="bg-orange-500/80 text-white border border-orange-400/50 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                                                                    <i className="fas fa-user-slash text-[9px]"></i>
                                                                    <span>{sch.actionDetails.suspensionDays} {dir === 'rtl' ? 'أيام إيقاف' : 'Days Suspension'}</span>
                                                                </span>
                                                            ) : null}

                                                            {sch.actionDetails?.permissionHours && Number(sch.actionDetails.permissionHours) > 0 ? (
                                                                <span className="bg-cyan-500/80 text-white border border-cyan-400/50 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                                                                    <i className="fas fa-hourglass-half text-[9px]"></i>
                                                                    <span>{sch.actionDetails.permissionHours} {dir === 'rtl' ? 'ساعات إذن' : 'Permit Hours'}</span>
                                                                </span>
                                                            ) : null}

                                                            {sch.actionDetails?.timeFrom && sch.actionDetails?.timeTo ? (
                                                                <span className="bg-white/15 text-white border border-white/20 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1">
                                                                    <i className="fas fa-clock text-[9px]"></i>
                                                                    <span>{sch.actionDetails.timeFrom} - {sch.actionDetails.timeTo}</span>
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>

                                                    {/* Description Content */}
                                                    <div className="space-y-1.5">
                                                        <p className="text-[10px] uppercase font-bold text-white/70 tracking-wider flex items-center gap-1.5">
                                                            <i className="fas fa-align-left text-xs text-white/80"></i>
                                                            <span>{dir === 'rtl' ? 'نص المخالفة والسبب المدون في السجل:' : 'Violation Description & Reason:'}</span>
                                                        </p>
                                                        
                                                        <div className="bg-white/10 rounded-xl p-3 border border-white/10 text-white text-xs md:text-sm font-medium leading-relaxed shadow-inner">
                                                            {sch.description || sch.actionDetails?.description ? (
                                                                <span className="font-semibold text-white tracking-wide">
                                                                    {sch.description || sch.actionDetails?.description}
                                                                </span>
                                                            ) : (
                                                                <span className="text-white/60 italic">
                                                                    {dir === 'rtl' ? 'تم قيد هذه المخالفة من قبل الإدارة والمشرف دون إرفاق ملاحظات إضافية.' : 'Logged by supervisor/management without additional note.'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Verification Footer */}
                                                    <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] text-white/70">
                                                        <span className="flex items-center gap-1.5">
                                                            <i className="fas fa-stamp text-amber-300"></i>
                                                            <span className="font-bold text-white/90">
                                                                {dir === 'rtl' ? 'سجل رسمي معتمد ومقيد لدى المشرف' : 'Verified Official Disciplinary Log'}
                                                            </span>
                                                        </span>
                                                        {sch.actionDetails?.fromDate && (
                                                            <span className="font-mono opacity-80">
                                                                {sch.actionDetails.fromDate === sch.actionDetails.toDate ? sch.actionDetails.fromDate : `${sch.actionDetails.fromDate} ➜ ${sch.actionDetails.toDate}`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : !status.isAbsent && (
                                            <div className="mt-auto pt-2 space-y-3">
                                                {displayShifts.map((s, i) => {
                                                    const durationText = calculateShiftDuration(s.start, s.end, dir === 'rtl');
                                                    return (
                                                        <div 
                                                            key={i} 
                                                            className="bg-black/35 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 md:p-5 border border-white/15 shadow-xl relative overflow-hidden group/shift hover:bg-black/45 hover:border-white/25 transition-all"
                                                        >
                                                            <div className="absolute top-0 right-0 w-36 h-36 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>

                                                            {/* Shift Card Header Bar */}
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 mb-3 sm:mb-4 pb-2.5 sm:pb-3 border-b border-white/10">
                                                                <div className="flex items-center gap-2.5 min-w-0">
                                                                    <div className="w-8 h-8 rounded-xl bg-white/15 flex-shrink-0 flex items-center justify-center text-white text-sm shadow-inner">
                                                                        <i className={`fas ${status.isRamadan ? 'fa-moon text-amber-300' : status.isNational ? 'fa-landmark text-emerald-300' : status.isToday ? 'fa-briefcase text-amber-300' : 'fa-clock text-sky-300'}`}></i>
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-[9px] uppercase tracking-widest text-white/60 font-bold truncate">
                                                                            {displayShifts.length > 1 
                                                                                ? (dir === 'rtl' ? `الفترة ${i + 1} من ${displayShifts.length}` : `Shift Segment ${i + 1} of ${displayShifts.length}`)
                                                                                : (dir === 'rtl' ? 'بيانات الوردية وساعات العمل' : 'Shift Schedule & Duty Hours')}
                                                                        </p>
                                                                        <p className="text-xs sm:text-sm font-black text-white font-mono truncate">
                                                                            {titleInfo.shiftTitle || (dir === 'rtl' ? 'جدول دوام رسمي معتمد' : 'Official Shift Schedule')}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                                                                    {durationText && (
                                                                        <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/15 text-[10px] sm:text-[11px] font-bold text-white font-mono">
                                                                            <i className="fas fa-hourglass-half text-amber-300 text-[10px]"></i>
                                                                            <span>{durationText}</span>
                                                                            <span className="text-[9px] opacity-70 text-white/80">{dir === 'rtl' ? 'عمل' : 'Duration'}</span>
                                                                        </div>
                                                                    )}
                                                                    {status.isToday && (
                                                                        <div className="inline-flex items-center gap-1.5 bg-amber-500/30 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-amber-400/40 text-[10px] sm:text-[11px] font-black text-amber-200">
                                                                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                                                                            <span>{dir === 'rtl' ? 'دوام اليوم' : 'Active Today'}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Check-in / Transit / Check-out Timeline */}
                                                            <div className="flex items-center justify-between gap-2 sm:gap-4 md:gap-6 bg-black/25 rounded-xl p-3 sm:p-3.5 border border-white/10">
                                                                {/* Check-In */}
                                                                <div className="flex flex-col items-start min-w-[72px] sm:min-w-[90px] md:min-w-[120px]">
                                                                    <div className="flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[9px] uppercase font-bold text-emerald-300 tracking-wider mb-0.5">
                                                                        <i className="fas fa-right-to-bracket text-[9px] sm:text-[10px]"></i>
                                                                        <span>{dir === 'rtl' ? 'حضور' : 'Check-In'}</span>
                                                                    </div>
                                                                    <span className={`text-lg sm:text-xl md:text-2xl font-mono font-black tracking-tight group-hover/shift:text-emerald-300 transition-colors drop-shadow-sm ${
                                                                        status.isRamadan ? 'text-amber-200' : status.isNational ? 'text-amber-100' : 'text-white'
                                                                    }`}>
                                                                        {formatTime12(s.start)}
                                                                    </span>
                                                                    <span className="text-[9px] sm:text-[10px] text-white/60 font-medium hidden sm:inline">
                                                                        {dir === 'rtl' ? 'بدء الوردية' : 'Shift Start'}
                                                                    </span>
                                                                </div>

                                                                {/* Midline flight track */}
                                                                <div className="flex-1 flex flex-col items-center justify-center relative px-1 sm:px-2">
                                                                    <div className="h-[2px] w-full bg-gradient-to-r from-emerald-400/50 via-white/70 to-rose-400/50 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>
                                                                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/15 backdrop-blur-md border border-white/30 flex items-center justify-center absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-lg group-hover/shift:scale-110 transition-transform">
                                                                        <i className={`fas ${status.isToday ? 'fa-briefcase text-amber-300' : 'fa-plane text-white'} text-[10px] sm:text-xs`}></i>
                                                                    </div>
                                                                    <span className="text-[7px] sm:text-[8px] uppercase tracking-[0.25em] text-white/50 font-bold mt-3.5 hidden md:block">
                                                                        {dir === 'rtl' ? 'مسار الوردية' : 'Duty Track'}
                                                                    </span>
                                                                </div>

                                                                {/* Check-Out */}
                                                                <div className="flex flex-col items-end min-w-[72px] sm:min-w-[90px] md:min-w-[120px] text-right">
                                                                    <div className="flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[9px] uppercase font-bold text-rose-300 tracking-wider mb-0.5">
                                                                        <span>{dir === 'rtl' ? 'انصراف' : 'Check-Out'}</span>
                                                                        <i className="fas fa-right-from-bracket text-[9px] sm:text-[10px]"></i>
                                                                    </div>
                                                                    <span className={`text-lg sm:text-xl md:text-2xl font-mono font-black tracking-tight group-hover/shift:text-emerald-300 transition-colors drop-shadow-sm ${
                                                                        status.isRamadan ? 'text-amber-200' : status.isNational ? 'text-amber-100' : 'text-white'
                                                                    }`}>
                                                                        {formatTime12(s.end)}
                                                                    </span>
                                                                    <span className="text-[9px] sm:text-[10px] text-white/60 font-medium hidden sm:inline">
                                                                        {dir === 'rtl' ? 'نهاية الوردية' : 'Shift End'}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Schedule Verification Sub-bar */}
                                                            <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] text-white/70">
                                                                <span className="flex items-center gap-1.5">
                                                                    <i className="fas fa-shield-check text-emerald-400"></i>
                                                                    <span className="font-bold text-white/90">
                                                                        {sch.date && punchedDates.has(sch.date)
                                                                            ? (dir === 'rtl' ? 'تم تسجيل الحضور بالبصمة البيومترية' : 'Punched via biometric attendance')
                                                                            : (dir === 'rtl' ? 'جدول دوام رسمي معتمد ومقيد بالنظام' : 'Official Verified Roster Schedule')}
                                                                    </span>
                                                                </span>
                                                                <span className="font-mono text-[9px] opacity-75 hidden sm:inline">
                                                                    ID: #{sch.id ? sch.id.slice(-6).toUpperCase() : 'DUTY'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        
                                        {status.isAbsent && (
                                            <div className="mt-auto p-4 border-2 border-dashed border-red-300 bg-white/50 rounded-xl text-center">
                                                <p className="text-red-700 font-bold text-sm">
                                                    {dir === 'rtl' ? 'لا يوجد تسجيل حضور' : 'NO ATTENDANCE RECORD'}
                                                </p>
                                                <p className="text-red-500 text-[10px] mt-1">
                                                    {dir === 'rtl' ? 'يرجى مراجعة المشرف الإداري في حال وجود أي خطأ.' : 'Please contact supervisor if this is an error.'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* PERFORATION DIVIDER & NOTCHES */}
                                <div className="relative flex-shrink-0 w-full h-6 md:w-6 md:h-auto bg-[#f8fafc] flex md:flex-col items-center justify-between overflow-hidden z-20">
                                    {/* Cutout Notches on Mobile (Left & Right) */}
                                    <div className="absolute -left-3.5 top-1/2 -translate-y-1/2 md:hidden w-7 h-7 bg-slate-100 rounded-full z-30 shadow-inner"></div>
                                    <div className="absolute -right-3.5 top-1/2 -translate-y-1/2 md:hidden w-7 h-7 bg-slate-100 rounded-full z-30 shadow-inner"></div>
                                    {/* Cutout Notches on Desktop (Top & Bottom) */}
                                    <div className="hidden md:block absolute -top-3.5 left-1/2 -translate-x-1/2 w-7 h-7 bg-slate-100 rounded-full z-30 shadow-inner"></div>
                                    <div className="hidden md:block absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-7 h-7 bg-slate-100 rounded-full z-30 shadow-inner"></div>
                                    {/* Perforation Line */}
                                    <div className="w-full h-0 md:w-0 md:h-full border-b-2 md:border-b-0 md:border-r-2 border-dashed border-slate-300 my-auto md:mx-auto"></div>
                                </div>

                                {/* TICKET STUB */}
                                <div className={`w-full md:w-64 bg-white p-4 sm:p-5 md:p-7 flex flex-col items-center justify-between gap-4 md:gap-5 border-t-2 md:border-t-0 md:border-l-2 border-slate-100 relative overflow-hidden ${status.grayscale ? 'opacity-70' : ''}`}>
                                    {/* Decorative watermark in stub background */}
                                    <div className="absolute -bottom-6 -right-6 text-slate-100 pointer-events-none select-none opacity-40 md:opacity-100">
                                        <i className={`fas ${status.watermarkIcon || status.icon || 'fa-ticket'} text-8xl md:text-9xl`}></i>
                                    </div>

                                    {/* Top Section / Class Badge (Always visible on mobile & desktop) */}
                                    <div className="text-center w-full relative z-10">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1.5">
                                            {dir === 'rtl' ? 'التصنيف' : 'Class'}
                                        </p>
                                        <div className={`inline-block px-3.5 py-1 rounded-full border-2 font-black text-xs uppercase tracking-wider shadow-sm ${
                                            status.isViolation 
                                                ? 'border-red-500 text-red-700 bg-red-50'
                                                : isExpired
                                                    ? 'border-rose-500 text-rose-700 bg-rose-50 ring-2 ring-rose-200/60'
                                                    : status.isToday
                                                        ? 'border-amber-500 text-amber-700 bg-amber-50 ring-2 ring-amber-200/60'
                                                        : status.theme === 'cyan_ocean'
                                                            ? 'border-cyan-500 text-cyan-700 bg-cyan-50'
                                                            : status.theme === 'emerald_paradise' || status.theme === 'emerald'
                                                                ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                                                                : status.theme === 'violet' || status.theme === 'purple'
                                                                    ? 'border-purple-500 text-purple-700 bg-purple-50'
                                                                    : status.isRamadan 
                                                                        ? 'border-indigo-400 text-indigo-800 bg-indigo-50'
                                                                        : status.theme === 'amber' 
                                                                            ? 'border-amber-500 text-amber-700 bg-amber-50' 
                                                                            : status.theme === 'sky'
                                                                                ? 'border-sky-500 text-sky-700 bg-sky-50'
                                                                                : 'border-slate-800 text-slate-800 bg-slate-50'
                                        }`}>
                                            {isExpired 
                                                ? (dir === 'rtl' ? 'منتهي الصلاحية' : 'EXPIRED') 
                                                : titleInfo.classBadge}
                                        </div>
                                    </div>

                                    {/* Middle Section: Duty Status & Title */}
                                    <div className="text-center relative z-10 w-full">
                                        <div className="relative inline-block">
                                            <i className={`fas ${status.icon} text-3xl md:text-5xl mb-1.5 md:mb-2 block ${
                                                status.isViolation 
                                                    ? 'text-red-500/80' 
                                                    : isExpired
                                                        ? 'text-rose-600/80'
                                                        : status.isToday
                                                            ? 'text-amber-500'
                                                            : status.theme === 'cyan_ocean'
                                                                ? 'text-cyan-600/80'
                                                                : status.theme === 'emerald_paradise' || status.theme === 'emerald'
                                                                    ? 'text-emerald-600/80'
                                                                    : status.theme === 'violet' || status.theme === 'purple'
                                                                        ? 'text-purple-600/80'
                                                                        : status.isRamadan 
                                                                            ? 'text-amber-500' 
                                                                            : status.theme === 'sky'
                                                                                ? 'text-sky-600/80'
                                                                                : 'text-slate-400'
                                            }`}></i>
                                            {status.isToday && !isExpired && (
                                                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 animate-ping"></span>
                                            )}
                                        </div>

                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em]">
                                            {status.isViolation 
                                                ? (dir === 'rtl' ? 'كود المخالفة' : 'INFRACTION CODE') 
                                                : status.isAction 
                                                    ? (dir === 'rtl' ? 'رمز الإجراء' : 'ACTION CODE') 
                                                    : (dir === 'rtl' ? 'نوع التكليف' : 'DUTY STATUS')}
                                        </p>

                                        <p className={`text-base md:text-lg font-black leading-tight mt-0.5 ${
                                            status.isViolation 
                                                ? 'text-red-800' 
                                                : isExpired
                                                    ? 'text-rose-800'
                                                    : status.isToday
                                                        ? 'text-amber-700'
                                                        : status.grayscale 
                                                            ? 'text-slate-500' 
                                                            : 'text-slate-800'
                                        }`}>
                                            {titleInfo.primary}
                                        </p>

                                        {titleInfo.secondary && (
                                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                                                {titleInfo.secondary}
                                            </p>
                                        )}
                                    </div>

                                    {/* Bottom Section: Barcode & Pass ID (Clean, full-width on mobile) */}
                                    <div className="flex flex-col items-center justify-center relative z-10 w-full pt-1 border-t border-slate-100">
                                        <div className="w-full max-w-[200px] md:max-w-none h-11 md:h-14 opacity-70 mix-blend-multiply">
                                            <Barcode />
                                        </div>
                                        <p className="font-mono text-[9px] font-bold text-slate-400 tracking-[0.2em] mt-1">
                                            *{sch.date ? sch.date.replace(/-/g, '') : 'PASS'}-{(sch.userId || 'DUTY').slice(-4).toUpperCase()}*
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    </div>
                )
            )}
        </div>
    );
};

export default UserSchedule;
