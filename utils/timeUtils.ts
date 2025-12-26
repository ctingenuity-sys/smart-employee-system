// src/utils/timeUtils.ts

export const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const convertTo24Hour = (timeStr: string): string | null => {
    if (!timeStr) return null;
    let s = timeStr.toLowerCase().trim();

    if (/^\d{1,2}$/.test(s)) {
        const h = parseInt(s, 10);
        if (h >= 0 && h <= 24) return `${h.toString().padStart(2, '0')}:00`;
    }

    s = s.replace(/(\d+)\.(\d+)/, '$1:$2');

    if (s.includes('midnight') || s.includes('12mn')) return '24:00';
    if (s.includes('noon')) return '12:00';

    let modifier: 'am' | 'pm' | null = null;
    if (s.includes('pm') || s.includes('p.m') || s.includes('م') || s.includes('مساء')) modifier = 'pm';
    else if (s.includes('am') || s.includes('a.m') || s.includes('ص') || s.includes('صباح')) modifier = 'am';

    const cleanTime = s.replace(/[^\d:]/g, '');
    const parts = cleanTime.split(':');

    if (!parts[0]) return null;

    let h = parseInt(parts[0], 10);
    let m = parts[1] ? parseInt(parts[1], 10) : 0;

    if (modifier === 'pm' && h < 12) h += 12;
    if (modifier === 'am' && h === 12) h = 0;

    if (h === 24) return '24:00';
    if (h > 24) return null;

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const parseMultiShifts = (text: string) => {
    if (!text) return [];

    const segments = text
        .trim()
        .split(/[\/,]|\s+and\s+|&|\s+(?=\d{1,2}(?::\d{2})?\s*(?:am|pm|mn|noon))/i);

    const shifts: { start: string; end: string }[] = [];

    segments.forEach(seg => {
        const range = seg.replace(/[()]/g, '').split(/\s*(?:-|–|—|\bto\b)\s*/i);
        if (range.length >= 2) {
            const start = convertTo24Hour(range[0].trim());
            const end = convertTo24Hour(range[range.length - 1].trim());
            if (start && end) shifts.push({ start, end });
        }
    });

    return shifts;
};

export const formatTime12 = (time24: string) => {
    if (!time24) return '--:--';
    const [h, m] = time24.split(':');
    let hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${m} ${ampm}`;
};

export const constructDateTime = (
    dateStr: string,
    timeStr: string,
    defaultTime = '00:00'
): Date => {
    let t = timeStr || defaultTime;

    if (t === '24:00') {
        const d = new Date(`${dateStr}T00:00:00`);
        d.setDate(d.getDate() + 1);
        return d;
    }

    return new Date(`${dateStr}T${t}`);
};
