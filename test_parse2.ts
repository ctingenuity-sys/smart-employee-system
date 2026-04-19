const convertTo24Hour = (timeStr: string): string | undefined => {
    if (!timeStr) return undefined;
    let s = String(timeStr).toLowerCase().trim();
    s = s.replace(/12mn0/g, '24:00'); 
    s = s.replace(/12mn/g, '24:00');
    s = s.replace(/(\d+)\.(\d+)/, '$1:$2');
    if (s.match(/\b12\s*:?\s*0{0,2}\s*mn\b/) || s.includes('midnight')) return '24:00';
    if (s.match(/\b12\s*:?\s*0{0,2}\s*n\b/) || s.includes('noon')) return '12:00';
    let modifier = null;
    if (s.includes('pm') || s.includes('p.m') || s.includes('م') || s.includes('مساء')) modifier = 'pm';
    else if (s.includes('am') || s.includes('a.m') || s.includes('ص') || s.includes('صباح')) modifier = 'am';
    const cleanTime = s.replace(/[^\d:]/g, ''); 
    const parts = cleanTime.split(':');
    if (parts.length === 0 || parts[0] === '') return undefined;
    let h = parseInt(parts[0], 10);
    let m = parts[1] ? parseInt(parts[1], 10) : 0;
    if (modifier) {
        if (modifier === 'pm' && h < 12) h += 12;
        if (modifier === 'am' && h === 12) h = 0;
    }
    if (h === 24) return '24:00';
    if (h > 24) return undefined;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const parseMultiShifts = (text: string) => {
    if (!text) return [];
    let cleanText = text.replace(/[()（）]/g, ' ').trim();
    const segments = cleanText.split(/[\/,]|\s+and\s+|&|\s+(?=\d{1,2}(?::\d{2})?\s*(?:am|pm|mn|noon))/i);
    const shifts: { start: string, end: string }[] = [];
    const hasAmPm = (str: string) => /am|pm|ص|م|مساء|صباح/i.test(str);
    segments.forEach(seg => {
        const trimmed = seg.trim();
        if(!trimmed) return;
        const rangeParts = trimmed.split(/\s*(?:[-–—]|\bto\b|الى|إلى)\s*/i);
        if (rangeParts.length >= 2) {
            const startStr = rangeParts[0].trim();
            const endStr = rangeParts[rangeParts.length - 1].trim(); 
            let s = convertTo24Hour(startStr);
            let e = convertTo24Hour(endStr);
            if (s && e) {
                const startHour = parseInt(s.split(':')[0]);
                const endHour = parseInt(e.split(':')[0]);
                if (!hasAmPm(startStr) && !hasAmPm(endStr)) {
                    if (endHour < startHour) {
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

console.log("7 الى 3:", parseMultiShifts("7 الى 3"));
console.log("7 إلى 3:", parseMultiShifts("7 إلى 3"));
console.log("7-3:", parseMultiShifts("7-3"));
