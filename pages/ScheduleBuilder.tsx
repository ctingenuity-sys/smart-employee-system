
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
// @ts-ignore
import { collection, addDoc, getDocs, Timestamp, query, where, writeBatch, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ModalityColumn, CommonDuty, FridayScheduleRow, HolidayScheduleRow, HeaderMap, SavedTemplate, User, Location, VisualStaff, DoctorScheduleRow, DoctorFridayRow, DoctorFridayHeaderMap, DoctorWeeklyHeaderMap } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import GeneralScheduleView from '../components/schedule/GeneralScheduleView';
import FridayScheduleView from '../components/schedule/FridayScheduleView';
import HolidayScheduleView from '../components/schedule/HolidayScheduleView';
import DoctorScheduleView from '../components/schedule/DoctorScheduleView';
import DoctorFridayScheduleView from '../components/schedule/DoctorFridayScheduleView';
import StaffSidebar from '../components/schedule/StaffSidebar';
import Loading from '../components/Loading';
import Toast from '../components/Toast';
import Modal from '../components/Modal';

// --- Helper Functions ---

const convertTo24Hour = (timeStr: string): string | null => {
    if (!timeStr) return null;
    let s = timeStr.toLowerCase().trim();
    
    // Handle specific OCR artifacts from PDF
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
    // Clean text more aggressively for PDF formats like "9AM 1PM" (missing separator)
    let cleanText = text.replace(/[()（）]/g, ' ').trim();
    
    // Handle "9AM-1PM/5PM-10PM" format
    const segments = cleanText.split(/[\/,]|\s+and\s+|&|\s+(?=\d{1,2}(?::\d{2})?\s*(?:am|pm|mn|noon))/i);
    const shifts: { start: string, end: string }[] = [];
    
    segments.forEach(seg => {
        const trimmed = seg.trim();
        if(!trimmed) return;
        const rangeParts = trimmed.split(/\s*(?:[-–—]|\bto\b)\s*/i);
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

const normalizeDate = (inputDate: string): string => {
    if (!inputDate) return '';
    const trimmed = inputDate.trim();
    if (trimmed.match(/^\d{1,2}[-./]\d{1,2}[-./]\d{4}$/)) {
        const parts = trimmed.split(/[-./]/);
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return trimmed;
};

// --- Smart Date Range Parser ---
const parseDateRangeRow = (input: string, currentMonth: string) => {
    const [yStr, mStr] = currentMonth.split('-');
    const targetYear = parseInt(yStr);
    const targetMonthIndex = parseInt(mStr) - 1; // 0-11

    const lastDay = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
    let from = `${currentMonth}-01`;
    let to = `${currentMonth}-${lastDay}`;

    if (!input) return { from, to };

    const cleanInput = input.toUpperCase().replace(/(?:TH|ST|ND|RD|,)/g, ' ').trim();
    
    const monthsMap: Record<string, number> = {
        JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11,
        JANUARY:0, FEBRUARY:1, MARCH:2, APRIL:3, JUNE:5, JULY:6, AUGUST:7, SEPTEMBER:8, OCTOBER:9, NOVEMBER:10, DECEMBER:11
    };

    const regex = /(\d{1,2})\s*([A-Z]{3,9})?/g;
    const matches = [...cleanInput.matchAll(regex)];

    if (matches.length >= 2) {
        const d1 = parseInt(matches[0][1]);
        const m1Str = matches[0][2];
        const d2 = parseInt(matches[1][1]);
        const m2Str = matches[1][2];

        const getYearForMonth = (mIndex: number) => {
            if (targetMonthIndex === 0 && mIndex === 11) return targetYear - 1;
            if (targetMonthIndex === 11 && mIndex === 0) return targetYear + 1;
            return targetYear;
        };

        let date1: Date;
        if (m1Str && monthsMap[m1Str] !== undefined) {
            const m1 = monthsMap[m1Str];
            date1 = new Date(getYearForMonth(m1), m1, d1);
        } else {
            date1 = new Date(targetYear, targetMonthIndex, d1);
        }

        let date2: Date;
        if (m2Str && monthsMap[m2Str] !== undefined) {
            const m2 = monthsMap[m2Str];
            date2 = new Date(getYearForMonth(m2), m2, d2);
        } else {
            date2 = new Date(date1.getFullYear(), date1.getMonth(), d2);
            if (d2 < d1) {
                date2.setMonth(date2.getMonth() + 1);
            }
        }

        const toStr = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        from = toStr(date1);
        to = toStr(date2);
    }

    return { from, to };
};

const defaultHeaders: HeaderMap = {
    morning: 'MORNING (8AM-5PM)',
    evening: 'EVENING (3PM-12MN)',
    broken: 'BROKEN (9AM-1PM/5PM-10PM)',
    cathLab: 'CATH LAB',
    mri: 'MRI (9AM-1PM/5PM-10PM)',
    night: 'NIGHT (11PM-8AM)'
};

const defaultDoctorFridayHeaders: DoctorFridayHeaderMap = {
    col1Time: '9am-1pm & 5pm-9pm',
    col1Title: 'CT & MRI',
    col2Time: '9am-1pm & 5pm-9pm',
    col2Title: 'ROUTINE + USG',
    col3Time: '1pm-9pm',
    col3Title: 'ROUTINE + USG',
    col4Time: '9pm-9am',
    col4Title: 'NIGHT SHIFT'
};

const defaultDoctorWeeklyHeaders: DoctorWeeklyHeaderMap = {
    col1Title: 'BROKEN SHIFT',
    col1Sub: '9am-1pm & 5pm-9pm\nCT AND MRI\nstarting from 12 Mn Thursday',
    col2Title: 'BROKEN SHIFT',
    col2Sub: '9am-1pm & 5pm-9pm\nXRAYS + USG + PORT.USG & PROCEDURES (PP)',
    col3Title: 'STRAIGHT MORNING',
    col3Sub: '9am-5pm\nXRAYS + USG + PORT.USG & PROCEDURES (PP)',
    col4Title: 'STRAIGHT EVENING',
    col4Sub: '5pm-1am\nXRAYS + USG + PORT.USG & PROCEDURES (PP)',
    col5Title: 'NIGHT SHIFT',
    col5Sub: '(SAT-THUR) (1am-9am)\n(FRIDAY 9pm-9am)\n1am-9am Sat-Thursday\n9pm-9am Friday'
};

const ScheduleBuilder: React.FC = () => {
    const { t, dir } = useLanguage();
    const [visualSubTab, setVisualSubTab] = useState<'general' | 'friday' | 'holiday' | 'doctor' | 'doctor_friday'>('general');
    const [isEditingVisual, setIsEditingVisual] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    
    // Active Template Tracking
    const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
    const [activeTemplateName, setActiveTemplateName] = useState<string>('');

    // Data States - Initialized Empty/Default
    const [generalData, setGeneralData] = useState<ModalityColumn[]>([
        { id: '1', title: 'MRI', defaultTime: '8 AM - 8 PM', colorClass: 'bg-blue-100 text-blue-900', staff: [] },
        { id: '2', title: 'CT Scan', defaultTime: '24 Hours', colorClass: 'bg-green-100 text-green-900', staff: [] }
    ]);
    const [commonDuties, setCommonDuties] = useState<CommonDuty[]>([
        { section: 'Night Shift', time: '11 PM - 8 AM', staff: [] }
    ]);
    const [fridayData, setFridayData] = useState<FridayScheduleRow[]>([]);
    const [holidayData, setHolidayData] = useState<HolidayScheduleRow[]>([]);
    const [doctorData, setDoctorData] = useState<DoctorScheduleRow[]>([]);
    const [doctorFridayData, setDoctorFridayData] = useState<DoctorFridayRow[]>([]);
    
    const [fridayHeaders, setFridayHeaders] = useState<HeaderMap>({...defaultHeaders});
    const [holidayHeaders, setHolidayHeaders] = useState<HeaderMap>({...defaultHeaders});
    const [doctorFridayHeaders, setDoctorFridayHeaders] = useState<DoctorFridayHeaderMap>({...defaultDoctorFridayHeaders});
    const [doctorWeeklyHeaders, setDoctorWeeklyHeaders] = useState<DoctorWeeklyHeaderMap>({...defaultDoctorWeeklyHeaders});

    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [allLocations, setAllLocations] = useState<Location[]>([]);
    const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [publishMonth, setPublishMonth] = useState(new Date().toISOString().slice(0, 7));
    const [globalStartDate, setGlobalStartDate] = useState('');
    const [globalEndDate, setGlobalEndDate] = useState('');
    const [scheduleNote, setScheduleNote] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'|'info'} | null>(null);
    const [confirmation, setConfirmation] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
        isOpen: false, title: '', message: '', onConfirm: () => {}
    });
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [saveTargetMonth, setSaveTargetMonth] = useState('');
    
    const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
    const [templateSearch, setTemplateSearch] = useState('');

    useEffect(() => {
        const initData = async () => {
            setLoading(true);
            try {
                const uSnap = await getDocs(collection(db, "users"));
                setAllUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
                const lSnap = await getDocs(collection(db, "locations"));
                setAllLocations(lSnap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
                const tSnap = await getDocs(collection(db, "schedule_templates"));
                setSavedTemplates(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as SavedTemplate)));
            } catch (error: any) {
                setToast({ msg: 'Error loading data: ' + error.message, type: 'error' });
            } finally {
                setLoading(false);
            }
        };
        initData();
    }, []);

    const handleSaveTemplate = () => {
        if (activeTemplateId) {
            setNewTemplateName(activeTemplateName);
        } else {
            setNewTemplateName(`Schedule ${new Date().toLocaleDateString()}`);
        }
        setSaveTargetMonth(publishMonth);
        setIsSaveModalOpen(true);
    };

    const confirmSaveTemplate = async (isNew: boolean = false) => {
        if (!newTemplateName) return;
        setIsSaveModalOpen(false);
        setLoading(true);
        try {
            // Construct the Full Payload from current State
            const templateData = {
                name: newTemplateName,
                targetMonth: saveTargetMonth,
                generalData: JSON.parse(JSON.stringify(generalData)), // Deep copy to detach references
                commonDuties: JSON.parse(JSON.stringify(commonDuties)),
                fridayData: JSON.parse(JSON.stringify(fridayData)),
                holidayData: JSON.parse(JSON.stringify(holidayData)),
                doctorData: JSON.parse(JSON.stringify(doctorData)),
                doctorFridayData: JSON.parse(JSON.stringify(doctorFridayData)),
                fridayHeaders: {...fridayHeaders},
                holidayHeaders: {...holidayHeaders},
                doctorFridayHeaders: {...doctorFridayHeaders},
                doctorWeeklyHeaders: {...doctorWeeklyHeaders},
                globalStartDate,
                globalEndDate,
                scheduleNote
            };

            if (activeTemplateId && !isNew) {
                // Update Existing
                await updateDoc(doc(db, 'schedule_templates', activeTemplateId), {
                    ...templateData,
                    updatedAt: Timestamp.now()
                });
                setSavedTemplates(prev => prev.map(t => t.id === activeTemplateId ? { ...t, ...templateData } : t));
                setToast({ msg: 'Template Updated Successfully (All Sections)', type: 'success' });
            } else {
                // Save as New
                const docRef = await addDoc(collection(db, 'schedule_templates'), {
                    ...templateData,
                    createdAt: Timestamp.now()
                });
                const newTpl = { id: docRef.id, ...templateData, createdAt: Timestamp.now() };
                setSavedTemplates([...savedTemplates, newTpl]);
                setActiveTemplateId(docRef.id);
                setActiveTemplateName(newTemplateName);
                setToast({ msg: 'New Template Saved Successfully (All Sections)', type: 'success' });
            }
        } catch (e) {
            setToast({ msg: 'Error saving template', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTemplate = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if(!confirm(t('confirm') + '?')) return;
        try {
            await deleteDoc(doc(db, 'schedule_templates', id));
            setSavedTemplates(prev => prev.filter(t => t.id !== id));
            if (activeTemplateId === id) {
                setActiveTemplateId(null);
                setActiveTemplateName('');
            }
            setToast({ msg: t('delete'), type: 'success' });
        } catch (error) {
            setToast({ msg: 'Error deleting template', type: 'error' });
        }
    };

    const handleLoadTemplate = (tpl: SavedTemplate) => {
        setConfirmation({
            isOpen: true,
            title: t('confirm'),
            message: `Load "${tpl.name}"? This will REPLACE all current data in all tabs.`,
            onConfirm: () => {
                setLoading(true);
                // 1. Set ID and Name
                setActiveTemplateId(tpl.id);
                setActiveTemplateName(tpl.name);

                // 2. Set Month (Important so Publish works for the right month)
                if(tpl.targetMonth) setPublishMonth(tpl.targetMonth);

                // 3. Deep Clone and Set ALL Data States (Handling potential missing fields from old templates)
                setGeneralData(JSON.parse(JSON.stringify(tpl.generalData || [])));
                setCommonDuties(JSON.parse(JSON.stringify(tpl.commonDuties || [])));
                setFridayData(JSON.parse(JSON.stringify(tpl.fridayData || [])));
                setHolidayData(JSON.parse(JSON.stringify(tpl.holidayData || [])));
                setDoctorData(JSON.parse(JSON.stringify(tpl.doctorData || [])));
                setDoctorFridayData(JSON.parse(JSON.stringify(tpl.doctorFridayData || [])));
                
                // 4. Set Headers
                setFridayHeaders(JSON.parse(JSON.stringify(tpl.fridayHeaders || {...defaultHeaders})));
                setHolidayHeaders(JSON.parse(JSON.stringify(tpl.holidayHeaders || {...defaultHeaders})));
                setDoctorFridayHeaders(JSON.parse(JSON.stringify(tpl.doctorFridayHeaders || {...defaultDoctorFridayHeaders})));
                setDoctorWeeklyHeaders(JSON.parse(JSON.stringify(tpl.doctorWeeklyHeaders || {...defaultDoctorWeeklyHeaders})));

                // 5. Set Globals
                setGlobalStartDate(tpl.globalStartDate || '');
                setGlobalEndDate(tpl.globalEndDate || '');
                setScheduleNote(tpl.scheduleNote || '');

                setConfirmation(prev => ({ ...prev, isOpen: false }));
                setIsTemplatesOpen(false); 
                setLoading(false);
                setToast({ msg: 'Template Loaded Successfully', type: 'success' });
            }
        });
    };

    const handleUnpublish = () => {
        if (!publishMonth) return setToast({ msg: 'Select Month', type: 'error' });
        setConfirmation({
            isOpen: true,
            title: t('sb.unpublish'),
            message: `Are you sure you want to clear ALL schedules for ${publishMonth}? This cannot be undone.`,
            onConfirm: async () => {
                setConfirmation(prev => ({ ...prev, isOpen: false }));
                setLoading(true);
                try {
                    const q = query(collection(db, 'schedules'), where('month', '==', publishMonth));
                    const snapshot = await getDocs(q);
                    const batchSize = 500;
                    const docs = snapshot.docs;
                    
                    if (docs.length === 0) {
                        setToast({ msg: 'No schedules found to clear.', type: 'info' });
                    } else {
                        for (let i = 0; i < docs.length; i += batchSize) {
                            const chunk = docs.slice(i, i + batchSize);
                            const batch = writeBatch(db);
                            chunk.forEach(d => batch.delete(d.ref));
                            await batch.commit();
                        }
                        setToast({ msg: 'Schedule cleared successfully', type: 'success' });
                    }
                } catch (e: any) {
                    setToast({ msg: 'Error: ' + e.message, type: 'error' });
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const handleClearSwaps = () => {
        if (!publishMonth) return setToast({ msg: 'Select Month', type: 'error' });
        setConfirmation({
            isOpen: true,
            title: 'Clear All Swaps',
            message: `Delete ALL Swaps for ${publishMonth}? This deletes all "Swap Duty" schedules.`,
            onConfirm: async () => {
                setConfirmation(prev => ({ ...prev, isOpen: false }));
                setLoading(true);
                try {
                    const q = query(collection(db, 'schedules'), where('month', '==', publishMonth));
                    const snapshot = await getDocs(q);
                    const swapDocs = snapshot.docs.filter(doc => {
                        const loc = doc.data().locationId;
                        return loc && typeof loc === 'string' && loc.startsWith('Swap');
                    });
                    const batchSize = 500;
                    if (swapDocs.length === 0) {
                        setToast({ msg: 'No swaps found.', type: 'info' });
                    } else {
                        for (let i = 0; i < swapDocs.length; i += batchSize) {
                            const chunk = swapDocs.slice(i, i + batchSize);
                            const batch = writeBatch(db);
                            chunk.forEach(d => batch.delete(d.ref));
                            await batch.commit();
                        }
                        setToast({ msg: 'All swaps cleared!', type: 'success' });
                    }
                } catch (e: any) {
                    setToast({ msg: 'Error: ' + e.message, type: 'error' });
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const handlePublishSchedule = () => {
        if (!publishMonth) return setToast({ msg: 'Select Month', type: 'error' });
        setConfirmation({
            isOpen: true,
            title: t('sb.publish'),
            message: `Publish for ${publishMonth}? This will OVERWRITE existing shifts for this month.`,
            onConfirm: async () => {
                setConfirmation(prev => ({ ...prev, isOpen: false }));
                executePublish();
            }
        });
    };

    const executePublish = async () => {
        setLoading(true);
        try {
            // 1. DELETE EXISTING FOR MONTH
            const q = query(collection(db, 'schedules'), where('month', '==', publishMonth));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                const batchSize = 500;
                const docs = snapshot.docs;
                for (let i = 0; i < docs.length; i += batchSize) {
                    const chunk = docs.slice(i, i + batchSize);
                    const deleteBatch = writeBatch(db);
                    chunk.forEach(doc => deleteBatch.delete(doc.ref));
                    await deleteBatch.commit();
                }
            }

            // 2. PREPARE NEW BATCH
            const batch = writeBatch(db);
            const scheduleRef = collection(db, 'schedules');
            const [y, m] = publishMonth.split('-');
            const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
            const monthEnd = `${publishMonth}-${lastDay}`;
            const monthStart = `${publishMonth}-01`;

            const resolveStaff = (staff: VisualStaff): { id: string, name: string } | null => {
                if (!staff.name || staff.name.trim() === '') return null;
                let id = staff.userId;
                if (!id) {
                    const cleanName = staff.name.replace(/[（(].*?[）)]/g, '').trim().toLowerCase();
                    const found = allUsers.find(u => (u.name && u.name.toLowerCase().trim() === cleanName) || (u.email && u.email.toLowerCase().trim() === cleanName));
                    if (found) id = found.id;
                }
                if (!id) id = `unlinked_${staff.name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
                return { id, name: staff.name };
            };

            let opCount = 0;
            const checkBatch = async () => {
                opCount++;
                if (opCount >= 450) {
                    await batch.commit();
                    opCount = 0;
                }
            };

            // --- GENERAL DATA ---
            for (const col of generalData) {
                const parsed = parseMultiShifts(col.defaultTime);
                const shifts = (parsed && parsed.length > 0) ? parsed : [{ start: '08:00', end: '16:00' }];
                for (const staff of col.staff) {
                    const resolved = resolveStaff(staff);
                    if (resolved) {
                        const shiftData: any = {
                            userId: resolved.id,
                            staffName: resolved.name, 
                            locationId: col.title,
                            month: publishMonth,
                            validFrom: staff.startDate || globalStartDate || monthStart,
                            validTo: staff.endDate || globalEndDate || monthEnd,
                            userType: 'user',
                            shifts: shifts,
                            note: staff.note ? `${col.title} - ${staff.note}` : col.title,
                            week: 'all',
                            createdAt: Timestamp.now()
                        };
                        if(staff.time) {
                             const customShifts = parseMultiShifts(staff.time);
                             if(customShifts.length > 0) shiftData.shifts = customShifts;
                        }
                        batch.set(doc(scheduleRef), shiftData);
                        await checkBatch();
                    }
                }
            }

            // --- COMMON DUTIES ---
            for (const duty of commonDuties) {
                const parsed = parseMultiShifts(duty.time);
                const shifts = (parsed && parsed.length > 0) ? parsed : [{ start: '08:00', end: '16:00' }];
                for (const staff of duty.staff) {
                    const resolved = resolveStaff(staff);
                    if (resolved) {
                        const shiftData: any = {
                            userId: resolved.id,
                            staffName: resolved.name, 
                            locationId: 'common_duty',
                            month: publishMonth,
                            validFrom: staff.startDate || globalStartDate || monthStart,
                            validTo: staff.endDate || globalEndDate || monthEnd,
                            userType: 'user',
                            shifts: shifts,
                            note: staff.note ? `${duty.section} - ${staff.note}` : duty.section,
                            week: 'all',
                            createdAt: Timestamp.now()
                        };
                        if(staff.time) {
                             const customShifts = parseMultiShifts(staff.time);
                             if(customShifts.length > 0) shiftData.shifts = customShifts;
                        }
                        batch.set(doc(scheduleRef), shiftData);
                        await checkBatch();
                    }
                }
            }

            // --- FRIDAY DATA ---
            for (const row of fridayData) {
                if(!row.date) continue;
                const date = normalizeDate(row.date);
                const processFridayCol = async (staffList: VisualStaff[], colKey: string, timeSource: string, fallbackTime: string) => {
                    let shifts = parseMultiShifts(timeSource);
                    if (shifts.length === 0) shifts = parseMultiShifts(fallbackTime) || [{start:'08:00', end:'16:00'}];
                    for (const staff of staffList) {
                        const resolved = resolveStaff(staff);
                        if (resolved) {
                            let finalShifts = shifts;
                            if (staff.time && staff.time.trim()) {
                                const specific = parseMultiShifts(staff.time);
                                if (specific.length > 0) finalShifts = specific;
                            }
                            batch.set(doc(scheduleRef), {
                                userId: resolved.id,
                                staffName: resolved.name, 
                                locationId: 'Friday Shift',
                                month: publishMonth,
                                date: date,
                                userType: 'user',
                                shifts: finalShifts,
                                note: staff.note ? `Friday - ${colKey} - ${staff.note}` : `Friday - ${colKey}`,
                                createdAt: Timestamp.now()
                            });
                            await checkBatch();
                        }
                    }
                };
                await processFridayCol(row.morning, 'Morning', fridayHeaders.morning || '8AM-5PM', '08:00 - 17:00'); 
                await processFridayCol(row.evening, 'Evening', fridayHeaders.evening || '3PM-12MN', '15:00 - 24:00');
                await processFridayCol(row.broken, 'Broken', fridayHeaders.broken || '9AM-1PM/5PM-10PM', '09:00 - 13:00, 17:00 - 22:00');
                await processFridayCol(row.cathLab, 'Cath Lab', fridayHeaders.cathLab || '8AM-8PM', '08:00 - 20:00');
                await processFridayCol(row.mri, 'MRI', fridayHeaders.mri || '9AM-1PM/5PM-10PM', '09:00 - 13:00, 17:00 - 22:00');
                await processFridayCol(row.night, 'Night', fridayHeaders.night || '11PM-8AM', '23:00 - 08:00');
            }

            // --- DOCTOR WEEKLY DATA ---
            for (const row of doctorData) {
                if(!row.dateRange && !row.startDate) continue;
                const { from, to } = parseDateRangeRow(row.dateRange || (row.startDate ? `${row.startDate}-${row.endDate}` : ''), publishMonth);
                const nightFrom = row.nightStartDate || from;
                const nightTo = row.nightEndDate || to;
                const processDocCol = async (staffList: VisualStaff[], shiftType: string, timeSourceStr: string, fallbackTime: string, isNight: boolean = false) => {
                    let shifts = parseMultiShifts(timeSourceStr);
                    if (shifts.length === 0) shifts = parseMultiShifts(fallbackTime);
                    if (shifts.length === 0) shifts = [{start:'08:00', end:'16:00'}]; 
                    for (const staff of staffList) {
                        const resolved = resolveStaff(staff);
                        if (resolved) {
                            let finalShifts = shifts;
                            if (staff.time && staff.time.trim()) {
                                const specific = parseMultiShifts(staff.time);
                                if (specific.length > 0) finalShifts = specific;
                            }
                            batch.set(doc(scheduleRef), {
                                userId: resolved.id,
                                staffName: resolved.name, 
                                locationId: 'Doctor Schedule',
                                month: publishMonth,
                                validFrom: isNight ? nightFrom : from,
                                validTo: isNight ? nightTo : to,
                                userType: 'doctor',
                                shifts: finalShifts,
                                note: shiftType,
                                createdAt: Timestamp.now()
                            });
                            await checkBatch();
                        }
                    }
                }
                await processDocCol(row.broken1, doctorWeeklyHeaders.col1Title || 'Broken 1', doctorWeeklyHeaders.col1Sub, '09:00 - 13:00, 17:00 - 21:00');
                await processDocCol(row.broken2, doctorWeeklyHeaders.col2Title || 'Broken 2', doctorWeeklyHeaders.col2Sub, '09:00 - 13:00, 17:00 - 21:00');
                await processDocCol(row.morning, doctorWeeklyHeaders.col3Title || 'Straight Morning', doctorWeeklyHeaders.col3Sub, '09:00 - 17:00');
                await processDocCol(row.evening, doctorWeeklyHeaders.col4Title || 'Straight Evening', doctorWeeklyHeaders.col4Sub, '17:00 - 01:00');
                await processDocCol(row.night, doctorWeeklyHeaders.col5Title || 'Night Shift', doctorWeeklyHeaders.col5Sub, '01:00 - 09:00', true);
            }

            // --- DOCTOR FRIDAY DATA ---
            for (const row of doctorFridayData) {
                if (!row.date) continue;
                const date = normalizeDate(row.date);
                const processDrFridayCol = async (staffList: VisualStaff[], colKey: string, timeKey: keyof DoctorFridayHeaderMap, titleKey: keyof DoctorFridayHeaderMap) => {
                    const timeStr = doctorFridayHeaders[timeKey] || '';
                    const titleStr = doctorFridayHeaders[titleKey] || colKey;
                    const shifts = parseMultiShifts(timeStr).length > 0 ? parseMultiShifts(timeStr) : [{ start: '08:00', end: '16:00' }];
                    for (const staff of staffList) {
                        const resolved = resolveStaff(staff);
                        if (resolved) {
                            let finalShifts = shifts;
                            if (staff.time && staff.time.trim()) {
                                const specific = parseMultiShifts(staff.time);
                                if (specific.length > 0) finalShifts = specific;
                            }
                            batch.set(doc(scheduleRef), {
                                userId: resolved.id,
                                staffName: resolved.name,
                                locationId: 'Doctor Friday Shift',
                                month: publishMonth,
                                date: date,
                                userType: 'doctor',
                                shifts: finalShifts,
                                note: titleStr,
                                createdAt: Timestamp.now()
                            });
                            await checkBatch();
                        }
                    }
                }
                await processDrFridayCol(row.col1, 'col1', 'col1Time', 'col1Title');
                await processDrFridayCol(row.col2, 'col2', 'col2Time', 'col2Title');
                await processDrFridayCol(row.col3, 'col3', 'col3Time', 'col3Title');
                await processDrFridayCol(row.col4, 'col4', 'col4Time', 'col4Title');
            }

            // --- HOLIDAY DATA ---
            for (const row of holidayData) {
                if(!row.occasion) continue;
                if(row.occasion.match(/^\d{4}-\d{2}-\d{2}$/) || row.occasion.match(/^\d{1,2}[-./]\d{1,2}[-./]\d{4}$/)) {
                    const date = normalizeDate(row.occasion);
                    const processHolCol = async (staffList: VisualStaff[], colKey: string) => {
                        for (const staff of staffList) {
                            const resolved = resolveStaff(staff);
                            if(resolved) {
                                batch.set(doc(scheduleRef), {
                                    userId: resolved.id,
                                    staffName: resolved.name,
                                    locationId: 'Holiday Shift',
                                    month: publishMonth,
                                    date: date,
                                    userType: 'user',
                                    shifts: [{start:'08:00', end:'20:00'}], 
                                    note: staff.note ? `Holiday - ${colKey} - ${staff.note}` : `Holiday - ${colKey}`,
                                    createdAt: Timestamp.now()
                                });
                                await checkBatch();
                            }
                        }
                    }
                    await processHolCol(row.morning, 'Morning');
                    await processHolCol(row.evening, 'Evening');
                    await processHolCol(row.broken, 'Broken');
                    await processHolCol(row.cathLab, 'Cath Lab');
                    await processHolCol(row.mri, 'MRI');
                    await processHolCol(row.night, 'Night');
                }
            }

            await batch.commit();
            setToast({ msg: 'Published Successfully (All Sections)', type: 'success' });
        } catch (e: any) {
            setToast({ msg: 'Error: ' + e.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50 print:bg-white print:h-auto print:overflow-visible" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {isSidebarOpen && <StaffSidebar users={allUsers} />}

            <div className="flex-1 flex flex-col h-full overflow-hidden print:h-auto print:overflow-visible relative">
                {/* Top Bar */}
                <div className="bg-white border-b border-gray-200 p-4 flex flex-col sm:flex-row justify-between items-center gap-4 print:hidden">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <button 
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className={`p-2 rounded-lg transition-colors ${isSidebarOpen ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <i className="fas fa-users"></i>
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">{t('nav.scheduleBuilder')}</h1>
                            {activeTemplateId && (
                                <p className="text-[10px] font-bold text-blue-600 uppercase flex items-center gap-1">
                                    <i className="fas fa-file-alt"></i> {t('sb.activeTemplate')} {activeTemplateName}
                                </p>
                            )}
                        </div>
                        <input 
                            type="month" 
                            value={publishMonth} 
                            onChange={e => setPublishMonth(e.target.value)} 
                            className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm font-bold"
                        />
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setIsEditingVisual(!isEditingVisual)} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${isEditingVisual ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            <i className={`fas ${isEditingVisual ? 'fa-eye' : 'fa-pen'}`}></i> {isEditingVisual ? 'Preview Mode' : 'Edit Mode'}
                        </button>
                        <button onClick={handleSaveTemplate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center gap-2 shadow-sm">
                            <i className="fas fa-save"></i> {t('save')}
                        </button>
                        <button onClick={() => window.print()} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 flex items-center gap-2">
                            <i className="fas fa-print"></i> Print
                        </button>
                        <button onClick={handlePublishSchedule} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 shadow-lg flex items-center gap-2">
                            <i className="fas fa-upload"></i> {t('sb.publish')}
                        </button>
                        <button onClick={handleClearSwaps} className="bg-purple-50 text-purple-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-purple-100"><i className="fas fa-eraser"></i></button>
                        <button onClick={handleUnpublish} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-100"><i className="fas fa-trash"></i></button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50 print:p-0 print:bg-white print:overflow-visible">
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2 print:hidden">
                        {[
                            { id: 'general', label: 'General Duty' },
                            { id: 'friday', label: 'Friday Shifts' },
                            { id: 'holiday', label: 'Holidays' },
                            { id: 'doctor', label: 'Doctors Weekly' },
                            { id: 'doctor_friday', label: 'Doctors Friday' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setVisualSubTab(tab.id as any)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${visualSubTab === tab.id ? 'bg-slate-800 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[500px] print:shadow-none print:border-none print:p-0">
                        {visualSubTab === 'general' && (
                            <GeneralScheduleView 
                                data={generalData} commonDuties={commonDuties} isEditing={isEditingVisual}
                                publishMonth={publishMonth} globalStartDate={globalStartDate} globalEndDate={globalEndDate}
                                setGlobalStartDate={setGlobalStartDate} setGlobalEndDate={setGlobalEndDate}
                                scheduleNote={scheduleNote} setScheduleNote={setScheduleNote}
                                onUpdateColumn={(i, d) => { const n = [...generalData]; n[i] = d; setGeneralData(n); }}
                                onUpdateDuty={(i, d) => { const n = [...commonDuties]; n[i] = d; setCommonDuties(n); }}
                                onAddColumn={() => setGeneralData([...generalData, { id: Date.now().toString(), title: 'New', defaultTime: '', colorClass: 'bg-blue-100 text-blue-900', staff: [] }])}
                                onRemoveColumn={(i) => setGeneralData(generalData.filter((_, idx) => idx !== i))}
                                onReorderColumns={(from, to) => { const n = [...generalData]; const [rem] = n.splice(from, 1); n.splice(to, 0, rem); setGeneralData(n); }}
                                onAddDuty={() => setCommonDuties([...commonDuties, { section: 'New Duty', time: '', staff: [] }])}
                                onRemoveDuty={(i) => setCommonDuties(commonDuties.filter((_, idx) => idx !== i))}
                                locations={allLocations} allUsers={allUsers} searchTerm={searchTerm}
                            />
                        )}
                        {visualSubTab === 'friday' && (
                            <FridayScheduleView 
                                data={fridayData} isEditing={isEditingVisual} allUsers={allUsers} publishMonth={publishMonth}
                                onUpdateRow={(i, d) => { const n = [...fridayData]; n[i] = d; setFridayData(n); }}
                                onAddRow={() => setFridayData([...fridayData, { id: Date.now().toString(), date: '', morning: [], evening: [], broken: [], cathLab: [], mri: [], night: [] }])}
                                onRemoveRow={(i) => setFridayData(fridayData.filter((_, idx) => idx !== i))}
                                headers={fridayHeaders} onHeaderChange={setFridayHeaders} searchTerm={searchTerm}
                            />
                        )}
                      
                    {visualSubTab === 'holiday' && (
                        <HolidayScheduleView 
                            data={holidayData} isEditing={isEditingVisual} allUsers={allUsers} publishMonth={publishMonth}
                            onUpdateRow={(i, d) => { const n = [...holidayData]; n[i] = d; setHolidayData(n); }}
                            onAddRow={() => setHolidayData([...holidayData, { id: Date.now().toString(), occasion: '', morning: [], evening: [], broken: [], cathLab: [], mri: [], night: [] }])}
                            onRemoveRow={(i) => setHolidayData(holidayData.filter((_, idx) => idx !== i))}
                            headers={holidayHeaders} onHeaderChange={setHolidayHeaders} searchTerm={searchTerm}
                        />
                    )}

                        {visualSubTab === 'doctor' && (
                            <DoctorScheduleView 
                                data={doctorData} isEditing={isEditingVisual} allUsers={allUsers} publishMonth={publishMonth}
                                onUpdateRow={(i, d) => { const n = [...doctorData]; n[i] = d; setDoctorData(n); }}
                                onAddRow={() => setDoctorData([...doctorData, { id: Date.now().toString(), dateRange: '', broken1: [], broken2: [], morning: [], evening: [], night: [] }])}
                                onRemoveRow={(i) => setDoctorData(doctorData.filter((_, idx) => idx !== i))}
                                headers={doctorWeeklyHeaders} onHeaderChange={setDoctorWeeklyHeaders} searchTerm={searchTerm}
                            />
                        )}
                        {visualSubTab === 'doctor_friday' && (
                            <DoctorFridayScheduleView 
                                data={doctorFridayData} isEditing={isEditingVisual} allUsers={allUsers} publishMonth={publishMonth}
                                onUpdateRow={(i, d) => { const n = [...doctorFridayData]; n[i] = d; setDoctorFridayData(n); }}
                                onAddRow={() => setDoctorFridayData([...doctorFridayData, { id: Date.now().toString(), date: '', col1: [], col2: [], col3: [], col4: [] }])}
                                onRemoveRow={(i) => setDoctorFridayData(doctorFridayData.filter((_, idx) => idx !== i))}
                                headers={doctorFridayHeaders} onHeaderChange={setDoctorFridayHeaders} searchTerm={searchTerm}
                            />
                        )}
                    </div>
                </div>

                {/* Templates FAB */}
                <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 print:hidden">
                    {isTemplatesOpen && (
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 w-80 mb-2 animate-fade-in-up max-h-[70vh] overflow-y-auto">
                            <div className="flex flex-col gap-2 mb-3 border-b border-slate-100 pb-2">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-bold text-slate-800">{t('sb.btn.saved')}</h3>
                                    <button onClick={() => setIsTemplatesOpen(false)} className="text-slate-400 hover:text-slate-600"><i className="fas fa-times"></i></button>
                                </div>
                                <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold outline-none" placeholder="Search Templates..." value={templateSearch} onChange={e => setTemplateSearch(e.target.value)} />
                            </div>
                            {savedTemplates.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">{t('sb.empty')}</p> : (
                                <div className="space-y-2">
                                    {savedTemplates.filter(tpl => tpl.name.toLowerCase().includes(templateSearch.toLowerCase()) || (tpl.targetMonth && tpl.targetMonth.includes(templateSearch))).map(tpl => (
                                        <div key={tpl.id} className={`p-3 rounded-xl border transition-all group ${activeTemplateId === tpl.id ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-100 hover:bg-blue-50 hover:border-blue-200'}`}>
                                            <div className="flex justify-between items-start">
                                                <div onClick={() => handleLoadTemplate(tpl)} className="cursor-pointer flex-1">
                                                    <h4 className={`font-bold text-sm ${activeTemplateId === tpl.id ? 'text-blue-700' : 'text-slate-700'}`}>{tpl.name}</h4>
                                                    <p className="text-[10px] text-slate-400 mt-1"><i className="far fa-calendar-alt mr-1"></i> {tpl.targetMonth || 'No Date'}</p>
                                                </div>
                                                <button onClick={(e) => handleDeleteTemplate(e, tpl.id)} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash"></i></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <button onClick={() => setIsTemplatesOpen(!isTemplatesOpen)} className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-xl transition-all hover:scale-110 ${isTemplatesOpen ? 'bg-slate-600 rotate-45' : 'bg-indigo-600'}`}>
                        {isTemplatesOpen ? <i className="fas fa-plus"></i> : <i className="fas fa-folder-open"></i>}
                    </button>
                </div>
            </div>

            <Modal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} title={activeTemplateId ? t('sb.updateExisting') : t('sb.newTemplateName')}>
                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-2 block">{t('sb.newTemplateName')}</label>
                        <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold outline-none focus:ring-2 focus:ring-blue-100" value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} />
                    </div>

                    {activeTemplateId && (
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-4">
                            <button onClick={() => confirmSaveTemplate(false)} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 flex items-center justify-center gap-2">
                                <i className="fas fa-sync-alt"></i> {t('sb.updateExisting')}
                            </button>
                            <div className="relative text-center">
                                <span className="bg-blue-50 px-2 text-[10px] font-bold text-blue-400 relative z-10">أو</span>
                                <div className="absolute top-1/2 left-0 w-full h-px bg-blue-200"></div>
                            </div>
                            <button onClick={() => confirmSaveTemplate(true)} className="w-full bg-white border-2 border-blue-200 text-blue-600 py-3 rounded-xl font-bold hover:bg-white/50 flex items-center justify-center gap-2">
                                <i className="fas fa-copy"></i> {t('sb.saveAsNew')}
                            </button>
                        </div>
                    )}

                    {!activeTemplateId && (
                        <button onClick={() => confirmSaveTemplate(false)} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black shadow-lg hover:bg-black">
                            {t('save')}
                        </button>
                    )}
                </div>
            </Modal>

            <Modal isOpen={confirmation.isOpen} onClose={() => setConfirmation({...confirmation, isOpen: false})} title={confirmation.title}>
                <div className="space-y-4">
                    <p className="text-slate-600 font-medium">{confirmation.message}</p>
                    <div className="flex gap-3">
                        <button onClick={confirmation.onConfirm} className="flex-1 bg-red-500 text-white py-2 rounded-lg font-bold hover:bg-red-600">{t('confirm')}</button>
                        <button onClick={() => setConfirmation({...confirmation, isOpen: false})} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-bold hover:bg-slate-200">{t('cancel')}</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ScheduleBuilder;
