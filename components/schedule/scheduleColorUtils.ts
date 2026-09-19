// Utilitiy for generating soft, elegant, non-glaring pastel colors for staff and doctors

export interface SoftColorInfo {
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  className: string;
}

// 48+ Handcrafted soft pastel tones with gentle backgrounds, crisp dark text, and subtle borders
export const SOFT_PASTEL_PALETTE: SoftColorInfo[] = [
  // Soft Sky & Ice Blues
  { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd', badgeBg: '#0284c7', badgeText: '#ffffff', className: 'bg-sky-50 text-sky-900 border-sky-200' },
  { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', badgeBg: '#2563eb', badgeText: '#ffffff', className: 'bg-blue-50 text-blue-900 border-blue-200' },
  { bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4', badgeBg: '#0d9488', badgeText: '#ffffff', className: 'bg-teal-50 text-teal-900 border-teal-200' },
  { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc', badgeBg: '#0891b2', badgeText: '#ffffff', className: 'bg-cyan-50 text-cyan-900 border-cyan-200' },
  { bg: '#e0f2fe', text: '#0284c7', border: '#7dd3fc', badgeBg: '#0369a1', badgeText: '#ffffff', className: 'bg-sky-100 text-sky-900 border-sky-300' },

  // Soft Sage, Mint & Emerald
  { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', badgeBg: '#16a34a', badgeText: '#ffffff', className: 'bg-green-50 text-green-900 border-green-200' },
  { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0', badgeBg: '#059669', badgeText: '#ffffff', className: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
  { bg: '#f7fee7', text: '#4d7c0f', border: '#d9f99d', badgeBg: '#65a30d', badgeText: '#ffffff', className: 'bg-lime-50 text-lime-900 border-lime-200' },
  { bg: '#dcfce7', text: '#166534', border: '#86efac', badgeBg: '#15803d', badgeText: '#ffffff', className: 'bg-green-100 text-green-900 border-green-300' },
  { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', badgeBg: '#047857', badgeText: '#ffffff', className: 'bg-emerald-100 text-emerald-900 border-emerald-300' },

  // Soft Lavender, Purple & Violet
  { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff', badgeBg: '#9333ea', badgeText: '#ffffff', className: 'bg-purple-50 text-purple-900 border-purple-200' },
  { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', badgeBg: '#7c3aed', badgeText: '#ffffff', className: 'bg-violet-50 text-violet-900 border-violet-200' },
  { bg: '#eef2ff', text: '#4338ca', border: '#c7d2fe', badgeBg: '#4f46e5', badgeText: '#ffffff', className: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
  { bg: '#fdf4ff', text: '#a21caf', border: '#f5d0fe', badgeBg: '#c026d3', badgeText: '#ffffff', className: 'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-200' },
  { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe', badgeBg: '#7e22ce', badgeText: '#ffffff', className: 'bg-purple-100 text-purple-900 border-purple-300' },
  { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd', badgeBg: '#6d28d9', badgeText: '#ffffff', className: 'bg-violet-100 text-violet-900 border-violet-300' },

  // Soft Rose, Pink & Blush
  { bg: '#fff1f2', text: '#be123c', border: '#fecdd3', badgeBg: '#e11d48', badgeText: '#ffffff', className: 'bg-rose-50 text-rose-900 border-rose-200' },
  { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8', badgeBg: '#db2777', badgeText: '#ffffff', className: 'bg-pink-50 text-pink-900 border-pink-200' },
  { bg: '#ffe4e6', text: '#9f1239', border: '#fda4af', badgeBg: '#be123c', badgeText: '#ffffff', className: 'bg-rose-100 text-rose-900 border-rose-300' },
  { bg: '#fce7f3', text: '#9d174d', border: '#f472b6', badgeBg: '#be185d', badgeText: '#ffffff', className: 'bg-pink-100 text-pink-900 border-pink-300' },

  // Soft Amber, Peach, Apricot & Warm Cream
  { bg: '#fffbeb', text: '#b45309', border: '#fde68a', badgeBg: '#d97706', badgeText: '#ffffff', className: 'bg-amber-50 text-amber-900 border-amber-200' },
  { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', badgeBg: '#ea580c', badgeText: '#ffffff', className: 'bg-orange-50 text-orange-900 border-orange-200' },
  { bg: '#fefce8', text: '#a16207', border: '#fef08a', badgeBg: '#ca8a04', badgeText: '#ffffff', className: 'bg-yellow-50 text-yellow-900 border-yellow-200' },
  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d', badgeBg: '#b45309', badgeText: '#ffffff', className: 'bg-amber-100 text-amber-900 border-amber-300' },
  { bg: '#ffedd5', text: '#9a3412', border: '#fdba74', badgeBg: '#c2410c', badgeText: '#ffffff', className: 'bg-orange-100 text-orange-900 border-orange-300' },

  // Soft Slate, Stone & Cool Neutrals
  { bg: '#f8fafc', text: '#334155', border: '#cbd5e1', badgeBg: '#475569', badgeText: '#ffffff', className: 'bg-slate-50 text-slate-800 border-slate-200' },
  { bg: '#f4f4f5', text: '#3f3f46', border: '#d4d4d8', badgeBg: '#52525b', badgeText: '#ffffff', className: 'bg-zinc-50 text-zinc-800 border-zinc-200' },
  { bg: '#f5f5f4', text: '#44403c', border: '#d6d3d1', badgeBg: '#57534e', badgeText: '#ffffff', className: 'bg-stone-50 text-stone-800 border-stone-200' },
  { bg: '#f1f5f9', text: '#1e293b', border: '#94a3b8', badgeBg: '#334155', badgeText: '#ffffff', className: 'bg-slate-100 text-slate-900 border-slate-300' },

  // Additional Subtle Multi-tone Pastel Harmonies
  { bg: '#f0f4f8', text: '#2d3748', border: '#cbd5e0', badgeBg: '#4a5568', badgeText: '#ffffff', className: 'bg-slate-50 text-slate-900 border-slate-200' },
  { bg: '#fcf4ec', text: '#8c4819', border: '#f6d3b7', badgeBg: '#af5b20', badgeText: '#ffffff', className: 'bg-amber-50 text-amber-950 border-amber-200' },
  { bg: '#f2f8f5', text: '#1b4d3e', border: '#bde0d0', badgeBg: '#236350', badgeText: '#ffffff', className: 'bg-teal-50 text-teal-950 border-teal-200' },
  { bg: '#f8f2f8', text: '#5c2d5c', border: '#e2c6e2', badgeBg: '#773a77', badgeText: '#ffffff', className: 'bg-fuchsia-50 text-fuchsia-950 border-fuchsia-200' },
  { bg: '#f4f6fb', text: '#23395d', border: '#c9d4e8', badgeBg: '#304c7a', badgeText: '#ffffff', className: 'bg-blue-50 text-blue-950 border-blue-200' },
  { bg: '#f9f6f0', text: '#594a2b', border: '#e2d7be', badgeBg: '#736038', badgeText: '#ffffff', className: 'bg-stone-50 text-stone-900 border-stone-200' },
  { bg: '#f1fbf8', text: '#125446', border: '#b5ebd9', badgeBg: '#186d5b', badgeText: '#ffffff', className: 'bg-emerald-50 text-emerald-950 border-emerald-200' },
  { bg: '#fcf1f4', text: '#701e33', border: '#f7cad5', badgeBg: '#912742', badgeText: '#ffffff', className: 'bg-rose-50 text-rose-950 border-rose-200' },
  { bg: '#f5f0fa', text: '#451f69', border: '#d9c7ea', badgeBg: '#5c298c', badgeText: '#ffffff', className: 'bg-purple-50 text-purple-950 border-purple-200' },
  { bg: '#f3fbf3', text: '#1e521e', border: '#bee7be', badgeBg: '#286e28', badgeText: '#ffffff', className: 'bg-green-50 text-green-950 border-green-200' },
  { bg: '#fef7ee', text: '#7a3e0b', border: '#fcdab5', badgeBg: '#9e500e', badgeText: '#ffffff', className: 'bg-orange-50 text-orange-950 border-orange-200' },
  { bg: '#f2f8fc', text: '#164863', border: '#bfe1f5', badgeBg: '#1e5f82', badgeText: '#ffffff', className: 'bg-sky-50 text-sky-950 border-sky-200' },
  { bg: '#faf0f5', text: '#6b204e', border: '#eec4dd', badgeBg: '#8c2a66', badgeText: '#ffffff', className: 'bg-pink-50 text-pink-950 border-pink-200' },
  { bg: '#f5f8ed', text: '#3c5214', border: '#cee2a8', badgeBg: '#4f6c1a', badgeText: '#ffffff', className: 'bg-lime-50 text-lime-950 border-lime-200' },
  { bg: '#fcf6f0', text: '#663914', border: '#f4d5b9', badgeBg: '#854a1a', badgeText: '#ffffff', className: 'bg-amber-50 text-amber-950 border-amber-200' },
  { bg: '#f3f4fa', text: '#2e386b', border: '#c7cde7', badgeBg: '#3d4a8d', badgeText: '#ffffff', className: 'bg-indigo-50 text-indigo-950 border-indigo-200' },
  { bg: '#f1faf9', text: '#13524b', border: '#b8e9e3', badgeBg: '#196b62', badgeText: '#ffffff', className: 'bg-teal-50 text-teal-950 border-teal-200' },
  { bg: '#faf5f2', text: '#543729', border: '#e3cfc4', badgeBg: '#6e4835', badgeText: '#ffffff', className: 'bg-stone-50 text-stone-900 border-stone-200' }
];

const DEFAULT_BLANK_COLOR: SoftColorInfo = {
  bg: '#ffffff',
  text: '#475569',
  border: '#cbd5e1',
  badgeBg: '#64748b',
  badgeText: '#ffffff',
  className: 'bg-white text-slate-700 border-dashed border-slate-300'
};

const ppRegex = /(?:\(|\[|\{)\s*pp\s*(?:\)|\]|\})/i;

/**
 * Generates an algorithmic golden-ratio soft pastel color for extreme edge cases (e.g. >50 staff).
 */
export const generateGoldenRatioPastel = (index: number): SoftColorInfo => {
  const goldenRatio = 0.618033988749895;
  const hue = Math.round(((index * goldenRatio) % 1) * 360);
  
  const bg = `hsl(${hue}, 45%, 95%)`;
  const border = `hsl(${hue}, 40%, 82%)`;
  const text = `hsl(${hue}, 65%, 25%)`;
  const badgeBg = `hsl(${hue}, 60%, 40%)`;
  const badgeText = '#ffffff';

  return {
    bg,
    text,
    border,
    badgeBg,
    badgeText,
    className: 'border'
  };
};

/**
 * Returns a soft, distinct pastel color for a given staff or doctor name.
 * If uniqueList is passed, colors are guaranteed to be distinct without collisions.
 */
export const getSoftStaffColor = (name: string, uniqueList?: string[]): SoftColorInfo => {
  const cleanName = (name || '').replace(ppRegex, '').trim();
  const normalized = cleanName.toLowerCase();

  if (!normalized || normalized === 'new dr' || normalized === 'doctor name' || normalized === 'dr. name' || normalized === 'new staff' || normalized === 'staff name') {
    return DEFAULT_BLANK_COLOR;
  }

  // 1. If unique list of names in the schedule is provided, use position for zero-collision distinct assignment
  if (uniqueList && uniqueList.length > 0) {
    const listIndex = uniqueList.findIndex(n => (n || '').replace(ppRegex, '').trim().toLowerCase() === normalized);
    if (listIndex >= 0) {
      if (listIndex < SOFT_PASTEL_PALETTE.length) {
        return SOFT_PASTEL_PALETTE[listIndex];
      }
      return generateGoldenRatioPastel(listIndex);
    }
  }

  // 2. High-dispersion deterministic string hash fallback
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % SOFT_PASTEL_PALETTE.length;
  return SOFT_PASTEL_PALETTE[index];
};

export interface ParsedShiftTime {
  raw: string;
  startHour24: number | null;
  endHour24: number | null;
  formattedAr: string;
  formattedEn: string;
  isSplit: boolean;
}

/**
 * Parses various shift time string formats (e.g., '9.30am-8.30pm', '9:30AM-5:30PM', '5pm-1am', '9PM-8AM', '08:00-16:00', '8 AM - 8 PM')
 * and generates precise 24-hour boundaries and readable "من ... إلى ..." Arabic/English formatted strings.
 */
export const parseShiftTime = (timeStr?: string): ParsedShiftTime => {
  if (!timeStr || !timeStr.trim()) {
    return {
      raw: '',
      startHour24: null,
      endHour24: null,
      formattedAr: '',
      formattedEn: '',
      isSplit: false
    };
  }

  const raw = timeStr.trim();

  // 24 Hours / All Day
  if (raw.toLowerCase().includes('24') && (raw.toLowerCase().includes('hour') || raw.includes('ساعة') || raw.toLowerCase().includes('hrs'))) {
    return {
      raw,
      startHour24: 0,
      endHour24: 24,
      formattedAr: 'على مدار 24 ساعة',
      formattedEn: '24 Hours Duty',
      isSplit: false
    };
  }

  // Handle multi-interval / split shifts (e.g. "9AM-1PM / 5PM-9PM" or "09:00-13:00 / 17:00-21:00" or "9am-1pm & 5pm-9pm")
  if (raw.includes('/') || raw.includes(';') || raw.includes('&') || raw.includes(' + ')) {
    const delimiter = raw.includes('/') ? '/' : (raw.includes(';') ? ';' : (raw.includes('&') ? '&' : ' + '));
    const parts = raw.split(delimiter);
    const p1 = parseShiftTime(parts[0]);
    const p2 = parseShiftTime(parts[1]);
    return {
      raw,
      startHour24: p1.startHour24,
      endHour24: p2.endHour24,
      formattedAr: `${p1.formattedAr || parts[0].trim()} | ${p2.formattedAr || parts[1].trim()}`,
      formattedEn: `${p1.formattedEn || parts[0].trim()} | ${p2.formattedEn || parts[1].trim()}`,
      isSplit: true
    };
  }

  // Regex matching all variants: "9.30am-8.30pm", "9:30AM - 5:30PM", "08:00 - 16:00", "5pm - 1am", "9am to 5pm", "9.30 ص - 8.30 م"
  // Note: [:.,hH] allows ':' and '.' (e.g. 9.30 or 9:30 or 9,30 or 9h30)
  const regex = /(\d{1,2})(?:[:.,hH](\d{1,2}))?\s*(am|pm|a\.m\.|p\.m\.|ص|م|صباحا|صباحاً|مساء|مساءً)?\s*(?:-|–|—|to|➔|->|إلى|الي|حتى)\s*(\d{1,2})(?:[:.,hH](\d{1,2}))?\s*(am|pm|a\.m\.|p\.m\.|ص|م|صباحا|صباحاً|مساء|مساءً)?/i;
  const match = raw.match(regex);

  if (match) {
    let [_, sHStr, sMStr, sAmpm, eHStr, eMStr, eAmpm] = match;
    let sH = parseInt(sHStr, 10);
    let sM = sMStr ? parseInt(sMStr, 10) : 0;
    let eH = parseInt(eHStr, 10);
    let eM = eMStr ? parseInt(eMStr, 10) : 0;

    // Validate boundaries
    if (sH >= 0 && sH <= 24 && eH >= 0 && eH <= 24 && sM >= 0 && sM <= 59 && eM >= 0 && eM <= 59) {
      let sPeriod = sAmpm ? sAmpm.toLowerCase().replace(/\./g, '') : '';
      let ePeriod = eAmpm ? eAmpm.toLowerCase().replace(/\./g, '') : '';

      // Normalize Arabic markers
      if (sPeriod.startsWith('ص')) sPeriod = 'am';
      if (sPeriod.startsWith('م')) sPeriod = 'pm';
      if (ePeriod.startsWith('ص')) ePeriod = 'am';
      if (ePeriod.startsWith('م')) ePeriod = 'pm';

      let s24 = sH;
      let e24 = eH;

      if (!sPeriod && !ePeriod) {
        if (sH >= 13 || eH >= 13 || (sH >= 7 && eH >= 13)) {
          // 24-hour style (e.g. 08:00 - 16:00, 17:00 - 01:00, 21:00 - 08:00)
          s24 = sH;
          e24 = eH;
        } else {
          // 12-hour heuristic (e.g. 9-5 => 9 AM to 5 PM, 8-8 => 8 AM to 8 PM, 8-4 => 8 AM to 4 PM, 5-1 => 5 PM to 1 AM)
          if (sH >= 6 && sH <= 11) {
            s24 = sH;
            e24 = (eH <= sH && eH <= 11) ? eH + 12 : eH;
          } else if (sH === 12 || (sH >= 1 && sH <= 5)) {
            s24 = sH === 12 ? 12 : sH + 12;
            e24 = (eH <= 5) ? eH : (eH < 12 ? eH + 12 : eH);
          }
        }
      } else {
        if (sPeriod === 'pm' && sH < 12) s24 = sH + 12;
        if (sPeriod === 'am' && sH === 12) s24 = 0;
        if (ePeriod === 'pm' && eH < 12) e24 = eH + 12;
        if (ePeriod === 'am' && eH === 12) e24 = 0;

        // If only end has PM (e.g. "9-5PM" or "9.30-8.30pm" or "8-4PM"), start is AM if between 6-11
        if (!sPeriod && ePeriod === 'pm') {
          if (sH >= 6 && sH <= 11) s24 = sH;
          else if (sH < 12 && sH > eH) s24 = sH;
          else if (sH < 12) s24 = sH + 12;
        }
        // If only start has PM (e.g. "5PM-1"), end is AM if between 1-6
        if (sPeriod === 'pm' && !ePeriod) {
          if (eH >= 1 && eH <= 11 && eH <= sH) e24 = eH; // e.g. 5PM - 1AM
          else if (eH < 12) e24 = eH + 12;
        }
        // If only start has AM (e.g. "9AM-5" or "9.30AM-8.30"), end is PM if eH < sH or eH <= 11
        if (sPeriod === 'am' && !ePeriod) {
          if (eH < sH || eH <= 11) e24 = eH + 12;
        }
      }

      const format12 = (h24: number, m: number, isAr: boolean) => {
        let h12 = h24 % 12;
        if (h12 === 0) h12 = 12;
        const mStr = m > 0 ? `:${String(m).padStart(2, '0')}` : ':00';
        const ampm = (h24 >= 12 && h24 < 24) ? (isAr ? 'م' : 'PM') : (isAr ? 'ص' : 'AM');
        return `${h12}${mStr} ${ampm}`;
      };

      const formattedAr = `من ${format12(s24, sM, true)} إلى ${format12(e24, eM, true)}`;
      const formattedEn = `From ${format12(s24, sM, false)} to ${format12(e24, eM, false)}`;

      return {
        raw,
        startHour24: s24,
        endHour24: e24,
        formattedAr,
        formattedEn,
        isSplit: false
      };
    }
  }

  return {
    raw,
    startHour24: null,
    endHour24: null,
    formattedAr: raw,
    formattedEn: raw,
    isSplit: false
  };
};

export type ShiftPeriodType = 'morning' | 'evening' | 'night' | 'split' | 'unassigned';

export interface ShiftPeriodStyle {
  type: ShiftPeriodType;
  icon: string;
  labelAr: string;
  labelEn: string;
  periodBadgeAr: string;
  periodBadgeEn: string;
  timeParsed: ParsedShiftTime;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  cardBgLight: string;
  cardBgDark: string;
  cardBorderLight: string;
  cardBorderDark: string;
  glowColor: string;
  timeBgLight: string;
  timeBgDark: string;
  timeTextLight: string;
  timeTextDark: string;
  timeBorderLight: string;
  timeBorderDark: string;
  locationBgLight: string;
  locationBgDark: string;
  locationTextLight: string;
  locationTextDark: string;
  locationBorderLight: string;
  locationBorderDark: string;
}

/**
 * Detects whether a shift is Morning (صباح), Evening/Afternoon (مساء/بعد الظهر), Night (ليل), or Split (فترتين)
 * and returns high-contrast theme styling for UI rotation cards.
 */
export const detectShiftPeriod = (timeStr?: string, dutyName?: string, shiftType?: string): ShiftPeriodStyle => {
  const rawTime = (timeStr || '').trim().toUpperCase();
  const rawDuty = (dutyName || '').trim().toUpperCase();
  const rawType = (shiftType || '').trim().toLowerCase();

  const parsed = parseShiftTime(timeStr);

  // If no duty and no time, it's unassigned
  if (!rawTime && !rawDuty && !rawType) {
    return {
      type: 'unassigned',
      icon: 'fa-circle-minus',
      labelAr: 'بدون تكليف مسجل',
      labelEn: 'Unassigned',
      periodBadgeAr: 'غير مكلف',
      periodBadgeEn: 'Unassigned',
      timeParsed: parsed,
      badgeBg: 'bg-slate-100 dark:bg-slate-800',
      badgeText: 'text-slate-500 dark:text-slate-400',
      badgeBorder: 'border-slate-200 dark:border-slate-700',
      cardBgLight: 'bg-slate-50/60 text-slate-700',
      cardBgDark: 'bg-slate-800/30 text-slate-300',
      cardBorderLight: 'border-slate-200 border-dashed',
      cardBorderDark: 'border-slate-700/60 border-dashed',
      glowColor: 'text-slate-400',
      timeBgLight: 'bg-slate-100 text-slate-500',
      timeBgDark: 'bg-slate-800 text-slate-400',
      timeTextLight: 'text-slate-500',
      timeTextDark: 'text-slate-400',
      timeBorderLight: 'border-slate-200',
      timeBorderDark: 'border-slate-700',
      locationBgLight: 'bg-slate-100 text-slate-600',
      locationBgDark: 'bg-slate-800 text-slate-300',
      locationTextLight: 'text-slate-700',
      locationTextDark: 'text-slate-300',
      locationBorderLight: 'border-slate-200',
      locationBorderDark: 'border-slate-700'
    };
  }

  // 1. NIGHT SHIFT (وردية ليلية)
  // Detected if explicit night keyword OR start hour >= 20 (8PM) or start hour < 6 (6AM)
  const isExplicitNight =
    rawType === 'night' ||
    rawDuty.includes('NIGHT') ||
    rawDuty.includes('ليلي') ||
    rawDuty.includes('سهر') ||
    rawDuty.includes('نايت') ||
    rawTime.includes('9PM-8AM') ||
    rawTime.includes('9PM - 8AM') ||
    rawTime.includes('8PM-8AM') ||
    rawTime.includes('1AM-9AM') ||
    rawTime.includes('1AM - 9AM');

  const isHourNight =
    parsed.startHour24 !== null &&
    (parsed.startHour24 >= 20 || parsed.startHour24 < 6);

  if (isExplicitNight || isHourNight) {
    return {
      type: 'night',
      icon: 'fa-moon',
      labelAr: 'وردية ليلية (Night)',
      labelEn: 'Night Shift',
      periodBadgeAr: '🌙 دوام ليلي (Night)',
      periodBadgeEn: '🌙 Night Duty',
      timeParsed: parsed,
      badgeBg: 'bg-indigo-950/80',
      badgeText: 'text-indigo-200',
      badgeBorder: 'border-indigo-400/50',
      cardBgLight: 'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white shadow-md shadow-indigo-950/30',
      cardBgDark: 'bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white shadow-md shadow-black/50',
      cardBorderLight: 'border-indigo-700/80 ring-1 ring-indigo-500/40',
      cardBorderDark: 'border-indigo-600/70 ring-1 ring-indigo-500/40',
      glowColor: 'text-indigo-300',
      timeBgLight: 'bg-indigo-900/80 text-amber-200',
      timeBgDark: 'bg-indigo-900/90 text-amber-200',
      timeTextLight: 'text-amber-200 font-mono font-black',
      timeTextDark: 'text-amber-200 font-mono font-black',
      timeBorderLight: 'border-indigo-500/50',
      timeBorderDark: 'border-indigo-500/50',
      locationBgLight: 'bg-indigo-600 text-white',
      locationBgDark: 'bg-indigo-600 text-white',
      locationTextLight: 'text-white font-black',
      locationTextDark: 'text-white font-black',
      locationBorderLight: 'border-indigo-400',
      locationBorderDark: 'border-indigo-400'
    };
  }

  // 2. SPLIT / BROKEN SHIFT (دوام مقسم / فترتين)
  const isExplicitSplit =
    rawType === 'broken' ||
    rawType === 'high_broken' ||
    rawDuty.includes('BROKEN') ||
    rawDuty.includes('مجزء') ||
    rawDuty.includes('فترتين') ||
    parsed.isSplit;

  if (isExplicitSplit) {
    return {
      type: 'split',
      icon: 'fa-arrows-split-up-and-left',
      labelAr: 'دوام مقسم فترتين (Split)',
      labelEn: 'Split Shift',
      periodBadgeAr: '🔄 دوام فترتين (Split)',
      periodBadgeEn: '🔄 Split Shift',
      timeParsed: parsed,
      badgeBg: 'bg-teal-500/20 text-teal-900 dark:text-teal-200',
      badgeText: 'text-teal-900 dark:text-teal-200',
      badgeBorder: 'border-teal-400/60 dark:border-teal-600/60',
      cardBgLight: 'bg-gradient-to-br from-teal-50/95 via-cyan-50/40 to-emerald-50/60 text-slate-900 shadow-sm shadow-teal-900/10',
      cardBgDark: 'bg-gradient-to-br from-teal-950/40 via-slate-900 to-emerald-950/30 text-slate-100 shadow-sm shadow-black/40',
      cardBorderLight: 'border-teal-300 ring-1 ring-teal-400/40',
      cardBorderDark: 'border-teal-600/60 ring-1 ring-teal-500/30',
      glowColor: 'text-teal-500',
      timeBgLight: 'bg-teal-100/90 text-teal-950',
      timeBgDark: 'bg-teal-950/80 text-teal-200',
      timeTextLight: 'text-teal-950 font-mono font-black',
      timeTextDark: 'text-teal-200 font-mono font-black',
      timeBorderLight: 'border-teal-300',
      timeBorderDark: 'border-teal-700/60',
      locationBgLight: 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white',
      locationBgDark: 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white',
      locationTextLight: 'text-white font-black',
      locationTextDark: 'text-white font-black',
      locationBorderLight: 'border-teal-500',
      locationBorderDark: 'border-teal-500'
    };
  }

  // 3. AFTERNOON / EVENING SHIFT (وردية بعد الظهر / مسائية)
  // Detected if explicit evening keywords OR start hour >= 12 (noon) and < 20 (8PM)
  const isExplicitEvening =
    rawType === 'evening' ||
    rawDuty.includes('EVENING') ||
    rawDuty.includes('AFTERNOON') ||
    rawDuty.includes('مساء') ||
    rawDuty.includes('مسائي') ||
    rawDuty.includes('عصر') ||
    rawDuty.includes('ظهر');

  const isHourEvening =
    parsed.startHour24 !== null &&
    parsed.startHour24 >= 12 &&
    parsed.startHour24 < 20;

  if (isExplicitEvening || isHourEvening) {
    return {
      type: 'evening',
      icon: 'fa-cloud-sun',
      labelAr: 'وردية بعد الظهر / مسائية (Evening)',
      labelEn: 'Evening Shift',
      periodBadgeAr: '🌇 دوام مسائي (Evening)',
      periodBadgeEn: '🌇 Evening Duty',
      timeParsed: parsed,
      badgeBg: 'bg-amber-500/20 text-amber-900 dark:text-amber-200',
      badgeText: 'text-amber-900 dark:text-amber-200',
      badgeBorder: 'border-amber-400/60 dark:border-amber-600/60',
      cardBgLight: 'bg-gradient-to-br from-amber-50/95 via-orange-50/50 to-rose-50/60 text-slate-900 shadow-sm shadow-amber-900/10',
      cardBgDark: 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-orange-950/30 text-slate-100 shadow-sm shadow-black/40',
      cardBorderLight: 'border-amber-300 ring-1 ring-amber-400/40',
      cardBorderDark: 'border-amber-600/60 ring-1 ring-amber-500/30',
      glowColor: 'text-amber-500',
      timeBgLight: 'bg-amber-100/90 text-amber-950',
      timeBgDark: 'bg-amber-950/80 text-amber-200',
      timeTextLight: 'text-amber-950 font-mono font-black',
      timeTextDark: 'text-amber-200 font-mono font-black',
      timeBorderLight: 'border-amber-300',
      timeBorderDark: 'border-amber-700/60',
      locationBgLight: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
      locationBgDark: 'bg-gradient-to-r from-amber-600 to-orange-600 text-white',
      locationTextLight: 'text-white font-black',
      locationTextDark: 'text-white font-black',
      locationBorderLight: 'border-amber-600',
      locationBorderDark: 'border-amber-500'
    };
  }

  // 4. MORNING SHIFT (وردية صباحية) - Default for morning starts (6AM - 11:59AM) or default
  return {
    type: 'morning',
    icon: 'fa-sun',
    labelAr: 'وردية صباحية (Morning)',
    labelEn: 'Morning Shift',
    periodBadgeAr: '🌅 دوام صباحي (Morning)',
    periodBadgeEn: '🌅 Morning Duty',
    timeParsed: parsed,
    badgeBg: 'bg-sky-500/20 text-sky-900 dark:text-sky-200',
    badgeText: 'text-sky-900 dark:text-sky-200',
    badgeBorder: 'border-sky-300 dark:border-sky-600/60',
    cardBgLight: 'bg-gradient-to-br from-sky-50/95 via-blue-50/40 to-indigo-50/50 text-slate-900 shadow-sm shadow-sky-900/10',
    cardBgDark: 'bg-gradient-to-br from-sky-950/40 via-slate-900 to-blue-950/30 text-slate-100 shadow-sm shadow-black/40',
    cardBorderLight: 'border-sky-300 ring-1 ring-sky-400/40',
    cardBorderDark: 'border-sky-600/60 ring-1 ring-sky-500/30',
    glowColor: 'text-sky-500',
    timeBgLight: 'bg-sky-100/90 text-sky-950',
    timeBgDark: 'bg-sky-950/80 text-sky-200',
    timeTextLight: 'text-sky-950 font-mono font-black',
    timeTextDark: 'text-sky-200 font-mono font-black',
    timeBorderLight: 'border-sky-300',
    timeBorderDark: 'border-sky-700/60',
    locationBgLight: 'bg-gradient-to-r from-sky-600 to-blue-600 text-white',
    locationBgDark: 'bg-gradient-to-r from-sky-600 to-blue-600 text-white',
    locationTextLight: 'text-white font-black',
    locationTextDark: 'text-white font-black',
    locationBorderLight: 'border-sky-500',
    locationBorderDark: 'border-sky-500'
  };
};

export interface MonthVacationInfo {
  hasVacation: boolean;
  isFullMonth: boolean;
  totalDaysInMonth: number;
  startDate?: string;
  endDate?: string;
  leaveType?: string;
  labelAr: string;
  labelEn: string;
  badgeTextAr: string;
  badgeTextEn: string;
  detailsAr?: string;
  detailsEn?: string;
  daysCount?: number;
}

export const VACATION_STYLE = {
  fullBgLight: 'bg-gradient-to-br from-emerald-50/95 via-teal-50/50 to-amber-50/60 text-slate-900 border-emerald-300 ring-1 ring-emerald-400/40 shadow-sm shadow-emerald-900/10',
  fullBgDark: 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-teal-950/30 text-slate-100 border-emerald-600/60 ring-1 ring-emerald-500/30 shadow-sm shadow-black/40',
  badgeBg: 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border border-emerald-400/60 dark:border-emerald-600/60',
  locationBgLight: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-700',
  locationBgDark: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500',
  stripLight: 'bg-emerald-100/90 text-emerald-950 border-emerald-300',
  stripDark: 'bg-emerald-950/90 text-emerald-200 border-emerald-700/70',
};

/**
 * Detects whether a staff member has approved/registered vacation or leave
 * covering the entire month or part of the month.
 */
export const detectVacationForMonth = (
  monthStr: string, // "YYYY-MM"
  targetUserOrName: { id?: string; name?: string; email?: string } | string | null | undefined,
  leaveRequests: any[] = [],
  dutyName?: string,
  timeStr?: string,
  note?: string
): MonthVacationInfo => {
  if (!monthStr) {
    return {
      hasVacation: false,
      isFullMonth: false,
      totalDaysInMonth: 0,
      labelAr: '',
      labelEn: '',
      badgeTextAr: '',
      badgeTextEn: ''
    };
  }

  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthNumStr, 10);

  if (isNaN(year) || isNaN(monthNum)) {
    return {
      hasVacation: false,
      isFullMonth: false,
      totalDaysInMonth: 0,
      labelAr: '',
      labelEn: '',
      badgeTextAr: '',
      badgeTextEn: ''
    };
  }

  // Days in this month
  const totalDaysInMonth = new Date(year, monthNum, 0).getDate();
  const monthStart = `${yearStr}-${monthNumStr.padStart(2, '0')}-01`;
  const monthEnd = `${yearStr}-${monthNumStr.padStart(2, '0')}-${String(totalDaysInMonth).padStart(2, '0')}`;

  const targetId = typeof targetUserOrName === 'object' && targetUserOrName ? targetUserOrName.id : '';
  const targetName = typeof targetUserOrName === 'string'
    ? targetUserOrName.trim().toLowerCase()
    : ((targetUserOrName && targetUserOrName.name) || '').trim().toLowerCase();
  const targetEmail = typeof targetUserOrName === 'object' && targetUserOrName && targetUserOrName.email
    ? targetUserOrName.email.trim().toLowerCase()
    : '';

  // Check 1: Explicit keyword in dutyName, timeStr, or note
  const combinedText = `${dutyName || ''} ${timeStr || ''} ${note || ''}`.toLowerCase();
  const isVacationKeyword =
    combinedText.includes('إجازة') ||
    combinedText.includes('اجازة') ||
    combinedText.includes('vacation') ||
    combinedText.includes('annual leave') ||
    combinedText.includes('sick leave') ||
    combinedText.includes('holiday leave') ||
    (combinedText.includes('leave') && !combinedText.includes('cath lab'));

  // Check 2: Matching leave requests
  const matchedLeaves = (leaveRequests || []).filter(req => {
    if (!req) return false;
    // Don't count rejected leaves
    if (req.status === 'rejected' || req.status === 'rejectedBySupervisor' || req.status === 'rejectedByManager') {
      return false;
    }

    const reqUserId = req.userId || req.from || req.employeeId;
    const reqName = (req.userName || req.employeeName || '').trim().toLowerCase();
    const reqEmail = (req.userEmail || '').trim().toLowerCase();

    let userMatches = false;
    if (targetId && reqUserId && reqUserId === targetId) userMatches = true;
    if (targetName && reqName && (reqName === targetName || targetName.includes(reqName) || reqName.includes(targetName))) userMatches = true;
    if (targetEmail && reqEmail && reqEmail === targetEmail) userMatches = true;

    if (!userMatches) return false;

    // Check date overlap
    const sDate = (req.startDate || '').slice(0, 10);
    const eDate = (req.endDate || '').slice(0, 10);
    if (!sDate || !eDate) return false;

    return sDate <= monthEnd && eDate >= monthStart;
  });

  if (matchedLeaves.length > 0) {
    // Pick the most prominent / longest overlapping leave
    let maxDays = 0;
    let bestLeave: any = null;
    let overlapStartStr = '';
    let overlapEndStr = '';

    for (const req of matchedLeaves) {
      const sDate = (req.startDate || '').slice(0, 10);
      const eDate = (req.endDate || '').slice(0, 10);

      const oStart = sDate < monthStart ? monthStart : sDate;
      const oEnd = eDate > monthEnd ? monthEnd : eDate;

      const d1 = new Date(oStart).getTime();
      const d2 = new Date(oEnd).getTime();
      const days = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);

      if (days > maxDays) {
        maxDays = days;
        bestLeave = req;
        overlapStartStr = oStart;
        overlapEndStr = oEnd;
      }
    }

    const isFullMonth = maxDays >= (totalDaysInMonth - 2) || (overlapStartStr <= monthStart && overlapEndStr >= monthEnd);
    const rawType = (bestLeave?.typeOfLeave || 'Annual').toLowerCase();
    let leaveTypeAr = 'إجازة سنوية';
    if (rawType.includes('sick') || rawType.includes('مرض')) leaveTypeAr = 'إجازة مرضية';
    else if (rawType.includes('emergency') || rawType.includes('طارئ')) leaveTypeAr = 'إجازة طارئة';
    else if (rawType.includes('permission') || rawType.includes('استئذان')) leaveTypeAr = 'إذن غياب';
    else if (rawType.includes('unpaid') || rawType.includes('بدون راتب')) leaveTypeAr = 'إجازة بدون راتب';
    else if (rawType.includes('exam') || rawType.includes('امتحان')) leaveTypeAr = 'إجازة امتحانات';

    const sDay = overlapStartStr.slice(8, 10);
    const sMonth = overlapStartStr.slice(5, 7);
    const eDay = overlapEndStr.slice(8, 10);
    const eMonth = overlapEndStr.slice(5, 7);

    const detailsAr = isFullMonth
      ? `إجازة كامل الشهر (${maxDays} يوم)`
      : `إجازة ${maxDays} يوم (من ${sDay}/${sMonth} إلى ${eDay}/${eMonth})`;

    const detailsEn = isFullMonth
      ? `Full Month Leave (${maxDays} days)`
      : `Leave: ${maxDays} days (${sDay}/${sMonth} to ${eDay}/${eMonth})`;

    return {
      hasVacation: true,
      isFullMonth,
      totalDaysInMonth,
      startDate: overlapStartStr,
      endDate: overlapEndStr,
      leaveType: leaveTypeAr,
      daysCount: maxDays,
      labelAr: isFullMonth ? `🌴 ${leaveTypeAr} (كامل الشهر)` : `🏖️ ${leaveTypeAr} (${maxDays} يوم)`,
      labelEn: isFullMonth ? `🌴 Full Month Leave (${maxDays}d)` : `🏖️ Leave (${maxDays}d)`,
      badgeTextAr: isFullMonth ? `🌴 ${leaveTypeAr}` : `🏖️ إجازة ${maxDays} يوم`,
      badgeTextEn: isFullMonth ? `🌴 Full Leave` : `🏖️ ${maxDays}d Leave`,
      detailsAr,
      detailsEn
    };
  }

  if (isVacationKeyword) {
    return {
      hasVacation: true,
      isFullMonth: true,
      totalDaysInMonth,
      startDate: monthStart,
      endDate: monthEnd,
      leaveType: 'إجازة سنوية',
      daysCount: totalDaysInMonth,
      labelAr: '🌴 إجازة معتمدة (كامل الشهر)',
      labelEn: '🌴 Full Month Vacation',
      badgeTextAr: '🌴 إجازة (Vacation)',
      badgeTextEn: '🌴 Vacation',
      detailsAr: `إجازة كامل الشهر (${totalDaysInMonth} يوم)`,
      detailsEn: `Full month leave (${totalDaysInMonth} days)`
    };
  }

  return {
    hasVacation: false,
    isFullMonth: false,
    totalDaysInMonth,
    labelAr: '',
    labelEn: '',
    badgeTextAr: '',
    badgeTextEn: ''
  };
};
