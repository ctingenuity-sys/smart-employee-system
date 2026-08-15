import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useLanguage } from '../contexts/LanguageContext';

export interface IncomingPatient {
    id: string;
    patientName: string;
    fileNumber: string;         // رقم الملف الطبي (MRN / ID)
    examName: string;           // اسم الفحص أو الفحوصات المجمعة
    examList?: string[];        // قائمة الفحوصات الخاصة بالموداليتي في هذه الفاتورة
    refNo?: string;             // رقم الفاتورة أو المرجع (Bill / Invoice / QueRefNo)
    doctorName: string;         // الطبيب المعالج / المحول
    date: string;               // YYYY-MM-DD
    time: string;               // HH:MM:SS أو HH:MM
    modality: 'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO' | 'OTHER';
    technicianName?: string;    // القائم بالفحص (اختياري / يدوي)
    age?: string;
    gender?: string;
    nationality?: string;
    isCash?: boolean;
    timestamp: number;
    source: 'IHMS_AUTO' | 'CLICK' | 'MANUAL';
    rawInfo?: any;
}

export interface StandaloneCase {
    id: string;
    serialNo: number;            // الرقم التسلسلي اليومي/العام داخل القسم (مثال: 1, 2, 3...)
    modalitySerial: string;      // كود الترقيم الكامل (مثال: XR-001 أو CT-015)
    modality: 'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO' | 'OTHER';
    patientName: string;
    fileNumber: string;         // رقم الملف الطبي (MRN / ID)
    examName: string;           // اسم الفحص أو الفحوصات
    examList?: string[];        // قائمة الفحوصات
    refNo?: string;             // رقم الفاتورة أو المرجع
    doctorName: string;         // الطبيب المعالج / المحول
    date: string;               // YYYY-MM-DD
    time: string;               // HH:MM
    age?: string;
    gender?: string;
    nationality?: string;
    isCash?: boolean;
    notes?: string;
    technicianName: string;     // اسم الفني القائم بالفحص (يدوي)
    status: 'completed' | 'waiting' | 'in-progress';
    source: 'IHMS_AUTO' | 'CLICK' | 'MANUAL';
    timestamp: number;
}

export const MODALITY_CONFIG: Record<string, { nameAr: string; nameEn: string; prefix: string; color: string; bg: string; border: string; text: string; lightBg: string }> = {
    'ALL': { nameAr: 'كافة الأقسام', nameEn: 'All Modalities', prefix: 'ALL', color: 'indigo', bg: 'bg-indigo-600', border: 'border-indigo-600', text: 'text-indigo-600', lightBg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    'X-RAY': { nameAr: 'الأشعة العادية (X-Ray)', nameEn: 'Plain X-Ray', prefix: 'XR', color: 'slate', bg: 'bg-slate-700', border: 'border-slate-700', text: 'text-slate-700', lightBg: 'bg-slate-100 text-slate-800 border-slate-300' },
    'CT': { nameAr: 'الأشعة المقطعية (CT)', nameEn: 'CT Scan', prefix: 'CT', color: 'emerald', bg: 'bg-emerald-600', border: 'border-emerald-600', text: 'text-emerald-600', lightBg: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
    'MRI': { nameAr: 'الرنين المغناطيسي (MRI)', nameEn: 'MRI Scan', prefix: 'MRI', color: 'blue', bg: 'bg-blue-600', border: 'border-blue-600', text: 'text-blue-600', lightBg: 'bg-blue-50 text-blue-800 border-blue-300' },
    'US': { nameAr: 'الموجات الصوتية / سونار (US)', nameEn: 'Ultrasound', prefix: 'US', color: 'teal', bg: 'bg-teal-600', border: 'border-teal-600', text: 'text-teal-600', lightBg: 'bg-teal-50 text-teal-800 border-teal-300' },
    'FLUO': { nameAr: 'الفلوروسكوبي والصبغة (FLUO)', nameEn: 'Fluoroscopy', prefix: 'FL', color: 'amber', bg: 'bg-amber-600', border: 'border-amber-600', text: 'text-amber-600', lightBg: 'bg-amber-50 text-amber-900 border-amber-300' },
    'MAMMO': { nameAr: 'الماموجرام (Mammography)', nameEn: 'Mammography', prefix: 'MG', color: 'rose', bg: 'bg-rose-600', border: 'border-rose-600', text: 'text-rose-600', lightBg: 'bg-rose-50 text-rose-800 border-rose-300' },
};

export const DEFAULT_TECH_PRESETS: string[] = ['فني الأشعة', 'د. طارق', 'أحمد', 'محمد', 'محمود', 'سارة'];

const getLocalToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getCurrentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

export const findValue = (obj: any, keys: string[]): any => {
    if (!obj || typeof obj !== 'object') return null;
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
            return obj[key];
        }
    }
    return null;
};

export const cleanTime = (val?: string): string => {
    if (!val) return getCurrentTime();
    const str = String(val).trim();
    if (!str) return getCurrentTime();
    if (str.includes('T') || str.includes(' ')) {
        const parts = str.split(/[T ]/);
        return parts[parts.length - 1] || str;
    }
    return str;
};

export const cleanDate = (val?: string): string => {
    if (!val) return getLocalToday();
    const str = String(val).trim();
    if (!str) return getLocalToday();
    if (str.includes('T')) return str.split('T')[0];
    if (str.includes(' ')) return str.split(' ')[0];
    return str;
};

// Helper: Convert time string (e.g. "12:14:59", "14:30", "02:15:30 PM", "10:00:15 ص") to total seconds for exact chronological sorting
export const parseTimeToSeconds = (timeStr?: string): number => {
    if (!timeStr) return 0;
    const clean = String(timeStr).trim();
    if (!clean) return 0;

    let target = clean;
    if (clean.includes('T') || clean.includes(' ')) {
        const parts = clean.split(/[T ]/);
        target = parts[parts.length - 1] || clean;
    }

    const isPM = /pm|م/i.test(clean);
    const isAM = /am|ص/i.test(clean);
    const match = target.match(/(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?/);
    if (!match) return 0;

    let hours = parseInt(match[1], 10) || 0;
    const minutes = parseInt(match[2], 10) || 0;
    const seconds = match[3] ? parseInt(match[3], 10) || 0 : 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    return (hours * 3600) + (minutes * 60) + seconds;
};

export const parseTimeToMinutes = (timeStr?: string): number => {
    return Math.floor(parseTimeToSeconds(timeStr) / 60);
};

// --- Comprehensive Modality Recognition Engine ---
export const detectModality = (
    examStr?: string,
    modalityHint?: string,
    deptHint?: string,
    rawObj?: any
): 'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO' | 'OTHER' => {
    // 1. Check explicit modality fields first
    const hints = [
        modalityHint,
        deptHint,
        rawObj?.modality,
        rawObj?.modalityName,
        rawObj?.modalityCode,
        rawObj?.modalityType,
        rawObj?.examType,
        rawObj?.serviceType,
        rawObj?.deptName,
        rawObj?.departmentName,
        rawObj?.sectionName,
        rawObj?.subDept,
        rawObj?.room,
        rawObj?.machine,
        rawObj?.deviceCode
    ].filter(Boolean).join(' ').toUpperCase();

    if (hints) {
        if (hints.includes('MRI') || hints.includes('MAGNETIC') || hints.includes('M.R.I') || hints.includes('رنين')) return 'MRI';
        if (hints.includes('CT') || hints.includes('TOMOGRAPHY') || hints.includes('C.T') || hints.includes('مقطعية') || hints.includes('مقطعي')) return 'CT';
        if (hints.includes('US') || hints.includes('ULTRASOUND') || hints.includes('SONO') || hints.includes('ECHO') || hints.includes('DOPPLER') || hints.includes('سونار') || hints.includes('تلفزيونية')) return 'US';
        if (hints.includes('FLUO') || hints.includes('BARIUM') || hints.includes('HSG') || hints.includes('IVP') || hints.includes('IVU') || hints.includes('فلورو') || hints.includes('صبغة')) return 'FLUO';
        if (hints.includes('MAMMO') || hints.includes('BREAST') || hints.includes('مامو') || hints.includes('ثدي')) return 'MAMMO';
    }

    if (!examStr) return 'X-RAY';
    const str = examStr.toUpperCase();

    // 2. MRI Scan Detection
    if (
        str.includes('MRI') ||
        str.includes('M.R.I') ||
        str.includes('MAGNETIC') ||
        str.includes('RESONANCE') ||
        str.includes('MRCP') ||
        str.includes('MRA ') ||
        str.includes('MRV ') ||
        str.includes('DWI') ||
        str.includes('FLAIR') ||
        str.includes('رنين') ||
        str.includes('مغناطيسي') ||
        str.includes('ام ار اي')
    ) {
        return 'MRI';
    }

    // 3. CT Scan Detection
    if (
        str.includes('CT ') ||
        str.includes(' CT') ||
        str.includes('C.T') ||
        str.includes('TOMOGRAPHY') ||
        str.includes('HRCT') ||
        str.includes('CTA ') ||
        str.includes('CTV ') ||
        str.includes('ANGIO CT') ||
        str.includes('CT ANGIO') ||
        str.includes('TRIPHASIC') ||
        str.includes('AXIAL') ||
        str.includes('CORONAL') ||
        str.includes('SCAN ') ||
        str.includes('SCANNING') ||
        str.includes('مقطعية') ||
        str.includes('مقطعي') ||
        str.includes('حلزوني') ||
        str.includes('أشعة مقطعية') ||
        str.includes('اشعة مقطعية') ||
        str.includes('سي تي')
    ) {
        return 'CT';
    }

    // 4. Ultrasound / Sonar Detection
    if (
        str.includes('US ') ||
        str.includes(' US') ||
        str.includes('U.S') ||
        str.includes('U/S') ||
        str.includes('ULTRASOUND') ||
        str.includes('ULTRASONIC') ||
        str.includes('ULTRASONOGRAPHY') ||
        str.includes('SONO') ||
        str.includes('SONOGRAM') ||
        str.includes('SONOGRAPHY') ||
        str.includes('ECHO') ||
        str.includes('ECHOGRAPHY') ||
        str.includes('DOPPLER') ||
        str.includes('DUPLEX') ||
        str.includes('TVS') ||
        str.includes('PELVI-ABDOMINAL') ||
        str.includes('PELVI ABDOMINAL') ||
        str.includes('ABDOMINAL US') ||
        str.includes('PELVIC US') ||
        str.includes('OBSTETRIC') ||
        str.includes('FOETAL') ||
        str.includes('ANOMALY SCAN') ||
        str.includes('THYROID US') ||
        str.includes('SCROTAL') ||
        str.includes('سونار') ||
        str.includes('تلفزيونية') ||
        str.includes('موجات صوتية') ||
        str.includes('فوق صوتية') ||
        str.includes('دوبلر') ||
        str.includes('دوبلكس') ||
        str.includes('ايكو') ||
        str.includes('إيكو')
    ) {
        return 'US';
    }

    // 5. Fluoroscopy / Contrast Detection
    if (
        str.includes('FLUO') ||
        str.includes('BARIUM') ||
        str.includes('HSG') ||
        str.includes('HYSTERO') ||
        str.includes('IVP') ||
        str.includes('IVU') ||
        str.includes('UROGRAPHY') ||
        str.includes('CYSTOGRAPHY') ||
        str.includes('MCUG') ||
        str.includes('MCU') ||
        str.includes('FISTULOGRAM') ||
        str.includes('SINOGRAM') ||
        str.includes('T-TUBE') ||
        str.includes('SWALLOW') ||
        str.includes('ENEMA') ||
        str.includes('CONTRAST') ||
        str.includes('فلورو') ||
        str.includes('فلوروسكوبي') ||
        str.includes('باريوم') ||
        str.includes('صبغة') ||
        str.includes('أشعة بالصبغة') ||
        str.includes('اشعة بالصبغة') ||
        str.includes('مسالك بالصبغة') ||
        str.includes('حقن صبغة') ||
        str.includes('أشعة ملونة') ||
        str.includes('اشعة ملونة')
    ) {
        return 'FLUO';
    }

    // 6. Mammography Detection
    if (
        str.includes('MAMMO') ||
        str.includes('MAMMOGRAPHY') ||
        str.includes('MAMMOGRAM') ||
        str.includes('BREAST') ||
        str.includes('TOMOSYNTHESIS') ||
        str.includes('مامو') ||
        str.includes('ماموجرام') ||
        str.includes('ماموجرافي') ||
        str.includes('ثدي') ||
        str.includes('مسح ثدي')
    ) {
        return 'MAMMO';
    }

    return 'X-RAY';
};

export const StandaloneRadiologyLogbook: React.FC = () => {
    // --- Language & Bilingual Setup ---
    let langCtx: any = null;
    try {
        langCtx = useLanguage();
    } catch (e) {
        // Fallback if rendered outside LanguageContext
    }
    const [localLang, setLocalLang] = useState<'ar' | 'en'>(() => (localStorage.getItem('stand_lang') as 'ar' | 'en') || 'ar');
    const lang = langCtx?.language || localLang;
    const isEn = lang === 'en';

    const toggleLang = () => {
        if (langCtx?.toggleLanguage) {
            langCtx.toggleLanguage();
        }
        const next = lang === 'ar' ? 'en' : 'ar';
        setLocalLang(next);
        localStorage.setItem('stand_lang', next);
    };

    const txt = (ar: string, en: string) => (isEn ? en : ar);

    // --- State ---
    const [selectedDate, setSelectedDate] = useState<string>(getLocalToday());
    const [activeTab, setActiveTab] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [incomingSearch, setIncomingSearch] = useState<string>('');
    const [selectedTechnician, setSelectedTechnician] = useState<string>(() => localStorage.getItem('stand_tech_name') || 'فني الأشعة');
    const [autoRegisterOnClick, setAutoRegisterOnClick] = useState<boolean>(() => localStorage.getItem('stand_auto_reg_click') === 'true');

    // List of Technician Presets (قائمة الفنيين المحفوظين لسهولة الاختيار السريع)
    const [techPresets, setTechPresets] = useState<string[]>(() => {
        const saved = localStorage.getItem('stand_tech_presets');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return ['فني الأشعة', 'د. طارق', 'أحمد', 'محمد', 'محمود', 'سارة'];
    });

    // Load Counter Configuration from LocalStorage
    const [counters, setCounters] = useState<Record<string, number>>(() => {
        const saved = localStorage.getItem('stand_modality_counters');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return { 'X-RAY': 1, 'CT': 1, 'MRI': 1, 'US': 1, 'FLUO': 1, 'MAMMO': 1, 'OTHER': 1 };
    });

    // Load Incoming Staging Queue from LocalStorage
    const [incomingQueue, setIncomingQueue] = useState<IncomingPatient[]>(() => {
        const saved = localStorage.getItem('stand_incoming_queue');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return [];
    });

    // Load Registered Cases from LocalStorage (Pure Local Storage)
    const [cases, setCases] = useState<StandaloneCase[]>(() => {
        const saved = localStorage.getItem('stand_radiology_cases');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return [];
    });

    // Save to LocalStorage
    useEffect(() => {
        localStorage.setItem('stand_radiology_cases', JSON.stringify(cases));
    }, [cases]);

    useEffect(() => {
        localStorage.setItem('stand_incoming_queue', JSON.stringify(incomingQueue));
    }, [incomingQueue]);

    useEffect(() => {
        localStorage.setItem('stand_modality_counters', JSON.stringify(counters));
    }, [counters]);

    useEffect(() => {
        localStorage.setItem('stand_tech_name', selectedTechnician);
    }, [selectedTechnician]);

    useEffect(() => {
        localStorage.setItem('stand_tech_presets', JSON.stringify(techPresets));
    }, [techPresets]);

    useEffect(() => {
        localStorage.setItem('stand_auto_reg_click', String(autoRegisterOnClick));
    }, [autoRegisterOnClick]);

    // Toast notification
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' | 'error' } | null>(null);
    const showToast = (msg: string, type: 'success' | 'info' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // Live listening state
    const [isListening, setIsListening] = useState<boolean>(true);

    // Modals
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isBridgeInfoOpen, setIsBridgeInfoOpen] = useState(false);
    const [isCounterModalOpen, setIsCounterModalOpen] = useState(false);
    const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
    const [activeModalityForCounter, setActiveModalityForCounter] = useState<'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO'>('X-RAY');

    // NEW: Technician Management & Workload Statistics & Offline Modals
    const [isTechManagerOpen, setIsTechManagerOpen] = useState(false);
    const [isTechStatsModalOpen, setIsTechStatsModalOpen] = useState(false);
    const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);
    const [isTechDropdownOpen, setIsTechDropdownOpen] = useState(false);
    const [selectedTechFilter, setSelectedTechFilter] = useState<string>('ALL');
    const [newTechName, setNewTechName] = useState<string>('');
    const [editingTechPresetIndex, setEditingTechPresetIndex] = useState<number | null>(null);
    const [editingTechPresetName, setEditingTechPresetName] = useState<string>('');

    // Case Edit Modal State (نافذة تعديل بيانات الحالة واختيار القائم بالفحص)
    const [isEditCaseModalOpen, setIsEditCaseModalOpen] = useState(false);
    const [editingCase, setEditingCase] = useState<StandaloneCase | null>(null);
    const [isCustomEditTech, setIsCustomEditTech] = useState(false);

    // Fill Vacant Slot Modal State (نافذة تعبئة الخانة الشاغرة)
    const [isFillSlotModalOpen, setIsFillSlotModalOpen] = useState(false);
    const [slotToFill, setSlotToFill] = useState<StandaloneCase | null>(null);
    const [fillSlotManualName, setFillSlotManualName] = useState('');
    const [fillSlotManualMRN, setFillSlotManualMRN] = useState('');
    const [fillSlotManualExam, setFillSlotManualExam] = useState('');
    const [fillSlotManualDoctor, setFillSlotManualDoctor] = useState('');
    const [fillSlotManualTech, setFillSlotManualTech] = useState(selectedTechnician);

    // Sorting State (ترتيب الحالات بحسب الوقت أو الرقم أو الاسم)
    const [sortField, setSortField] = useState<'time' | 'serialNo' | 'patientName' | 'fileNumber'>('time');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [incomingSortOrder, setIncomingSortOrder] = useState<'asc' | 'desc'>('asc');
    const [incomingModalityFilter, setIncomingModalityFilter] = useState<string>('ALL');

    // Inline edit state for table row
    const [editingTechId, setEditingTechId] = useState<string | null>(null);
    const [editingTechVal, setEditingTechVal] = useState<string>('');

    // Fast Single-line Register Bar State
    const [fastMRN, setFastMRN] = useState('');
    const [fastName, setFastName] = useState('');
    const [fastExam, setFastExam] = useState('');
    const [fastMod, setFastMod] = useState<'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO'>('X-RAY');
    const [fastTech, setFastTech] = useState(selectedTechnician);

    useEffect(() => {
        setFastTech(selectedTechnician);
    }, [selectedTechnician]);

    // Technician Management Handlers
    const handleAddTechnician = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmed = newTechName.trim();
        if (!trimmed) {
            showToast('يرجى كتابة اسم الفني أولاً', 'error');
            return;
        }
        if (techPresets.includes(trimmed)) {
            showToast('هذا الاسم موجود بالفعل في القائمة', 'info');
            setNewTechName('');
            return;
        }
        const updated = [...techPresets, trimmed];
        setTechPresets(updated);
        setSelectedTechnician(trimmed);
        setNewTechName('');
        showToast(`تمت إضافة الفني (${trimmed}) وتعيينه كفني نشط`, 'success');
    };

    const handleUpdateTechnician = (index: number) => {
        const trimmed = editingTechPresetName.trim();
        if (!trimmed) {
            showToast('اسم الفني لا يمكن أن يكون فارغاً', 'error');
            return;
        }
        const oldName = techPresets[index];
        const updated = [...techPresets];
        updated[index] = trimmed;
        setTechPresets(updated);

        // Update selected if active
        if (selectedTechnician === oldName) {
            setSelectedTechnician(trimmed);
        }

        // Also update any cases assigned to oldName if user wishes
        setCases(prev => prev.map(c => c.technicianName === oldName ? { ...c, technicianName: trimmed } : c));

        setEditingTechPresetIndex(null);
        setEditingTechPresetName('');
        showToast(`تم تعديل اسم الفني من (${oldName}) إلى (${trimmed})`, 'success');
    };

    const handleDeleteTechnician = (index: number) => {
        const targetName = techPresets[index];
        if (techPresets.length <= 1) {
            showToast('يجب أن تحتوي القائمة على فني واحد على الأقل', 'error');
            return;
        }
        if (confirm(`هل أنت متأكد من حذف الفني (${targetName}) من القائمة السريعة؟`)) {
            const updated = techPresets.filter((_, i) => i !== index);
            setTechPresets(updated);
            if (selectedTechnician === targetName) {
                setSelectedTechnician(updated[0] || 'فني الأشعة');
            }
            showToast(`تم حذف (${targetName}) من القائمة`, 'info');
        }
    };

    const handleSetDefaultTechnician = (name: string) => {
        setSelectedTechnician(name);
        showToast(`تم تعيين (${name}) كفني حالي للفحوصات`, 'success');
    };

    // Manual form state
    const [manualForm, setManualForm] = useState({
        patientName: '',
        fileNumber: '',
        examName: '',
        modality: 'X-RAY' as 'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO' | 'OTHER',
        doctorName: '',
        technicianName: selectedTechnician,
        notes: '',
        time: getCurrentTime()
    });

    // Helper to update a specific modality's starting/next counter
    const setModalityStartingNumber = (mod: string, startNum: number) => {
        const validNum = Math.max(1, startNum || 1);
        setCounters(prev => ({
            ...prev,
            [mod]: validNum
        }));
        showToast(`تم تعيين رقم بداية التسجيل لقسم ${MODALITY_CONFIG[mod]?.nameAr || mod} إلى: ${validNum}`, 'success');
    };

    // --- Core Registration Function: Gives Sequential Serial Number & Saves in LocalStorage ---
    const registerPatient = (patient: {
        patientName: string;
        fileNumber: string;
        examName: string;
        examList?: string[];
        refNo?: string;
        modality?: 'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO' | 'OTHER';
        doctorName?: string;
        date?: string;
        time?: string;
        age?: string;
        gender?: string;
        nationality?: string;
        isCash?: boolean;
        notes?: string;
        technicianName?: string;
        source?: 'IHMS_AUTO' | 'CLICK' | 'MANUAL';
    }) => {
        const caseDate = cleanDate(patient.date);
        const detectedMod = patient.modality || detectModality(patient.examName);
        const prefix = MODALITY_CONFIG[detectedMod]?.prefix || detectedMod;
        const assignedTech = (patient.technicianName && patient.technicianName.trim()) ? patient.technicianName.trim() : selectedTechnician;

        // Remember new technician in presets if novel
        if (assignedTech && !techPresets.includes(assignedTech)) {
            setTechPresets(prev => [assignedTech, ...prev].slice(0, 10));
        }

        // Check if already registered in final logbook for same MRN & Modality & RefNo today
        const existingIndex = cases.findIndex(c => 
            c.date === caseDate && 
            c.fileNumber === String(patient.fileNumber).trim() && 
            c.modality === detectedMod &&
            (patient.refNo && c.refNo ? c.refNo === patient.refNo : true)
        );

        if (existingIndex !== -1) {
            const existing = cases[existingIndex];
            if (!existing.examName.includes(patient.examName)) {
                const updated = [...cases];
                const combinedList = Array.from(new Set([...(existing.examList || [existing.examName]), ...(patient.examList || [patient.examName])]));
                updated[existingIndex] = {
                    ...existing,
                    examName: combinedList.join(' + '),
                    examList: combinedList,
                    technicianName: assignedTech || existing.technicianName
                };
                setCases(updated);
                showToast(`تم تحديث فحص إضافي للمريض: ${existing.patientName} (رقم الأشعة: ${existing.modalitySerial})`, 'info');
            } else {
                showToast(`المريض مسجل مسبقاً برقم أشعة: ${existing.modalitySerial}`, 'info');
            }
            setIncomingQueue(prev => prev.filter(p => !(p.fileNumber === String(patient.fileNumber).trim() && p.modality === detectedMod && (patient.refNo && p.refNo ? p.refNo === patient.refNo : true))));
            return existing;
        }

        // Sequential numbering starting strictly from configured counter
        const nextSerial = counters[detectedMod] !== undefined ? counters[detectedMod] : 1;
        const formattedSerial = `${prefix}-${String(nextSerial).padStart(3, '0')}`;

        // Increment Counter for next patient
        setCounters(prev => ({
            ...prev,
            [detectedMod]: nextSerial + 1
        }));

        const newCase: StandaloneCase = {
            id: `case_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            serialNo: nextSerial,
            modalitySerial: formattedSerial,
            modality: detectedMod,
            patientName: patient.patientName || 'مريض غير مسجل',
            fileNumber: String(patient.fileNumber || '').trim(),
            examName: patient.examName || 'فحص أشعة',
            examList: patient.examList && patient.examList.length > 0 ? patient.examList : [patient.examName || 'فحص أشعة'],
            refNo: patient.refNo,
            doctorName: patient.doctorName || 'العيادة / الاستقبال',
            date: caseDate,
            time: cleanTime(patient.time),
            age: patient.age,
            gender: patient.gender,
            nationality: patient.nationality,
            isCash: patient.isCash,
            notes: patient.notes || '',
            technicianName: assignedTech,
            status: 'completed',
            source: patient.source || 'CLICK',
            timestamp: Date.now()
        };

        setCases(prev => [newCase, ...prev]);

        // Remove from Incoming Queue if present
        setIncomingQueue(prev => prev.filter(p => !(
            p.fileNumber === String(patient.fileNumber).trim() && 
            p.modality === detectedMod && 
            (patient.refNo && p.refNo ? p.refNo === patient.refNo : true)
        )));

        // Vibrate / Audio cue
        try {
            if (navigator.vibrate) navigator.vibrate(120);
        } catch (e) {}

        showToast(`✅ تم التسجيل ورقم الأشعة: ${formattedSerial} (${MODALITY_CONFIG[detectedMod]?.nameAr}) - القائم بالفحص: ${assignedTech}`, 'success');
        return newCase;
    };

    // --- Fast Register from Bar ---
    const handleFastRegister = (e: React.FormEvent) => {
        e.preventDefault();
        if (!fastName && !fastMRN) {
            showToast('يرجى إدخال اسم المريض أو رقم الملف', 'error');
            return;
        }
        registerPatient({
            patientName: fastName || `مريض ملف (${fastMRN})`,
            fileNumber: fastMRN,
            examName: fastExam || 'فحص أشعة',
            modality: fastMod,
            technicianName: fastTech || selectedTechnician,
            source: 'MANUAL'
        });
        setFastMRN('');
        setFastName('');
        setFastExam('');
    };

    // --- Update Case Modality In-Place ---
    const updateCaseModality = (caseId: string, newModality: 'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO') => {
        const targetCase = cases.find(c => c.id === caseId);
        if (!targetCase || targetCase.modality === newModality) return;

        const prefix = MODALITY_CONFIG[newModality]?.prefix || newModality;
        const casesInNewMod = cases.filter(c => c.date === targetCase.date && c.modality === newModality);
        const nextSerial = Math.max(casesInNewMod.length + 1, counters[newModality] || 1);
        const newFormattedSerial = `${prefix}-${String(nextSerial).padStart(3, '0')}`;

        setCounters(prev => ({ ...prev, [newModality]: nextSerial + 1 }));

        setCases(prev => prev.map(c => {
            if (c.id === caseId) {
                return {
                    ...c,
                    modality: newModality,
                    serialNo: nextSerial,
                    modalitySerial: newFormattedSerial
                };
            }
            return c;
        }));

        showToast(`تم نقل الحالة إلى ${MODALITY_CONFIG[newModality]?.nameAr} برقم: ${newFormattedSerial}`, 'info');
    };

    // --- Update Case Technician In-Place ---
    const updateCaseTechnician = (caseId: string, newTechName: string) => {
        setCases(prev => prev.map(c => c.id === caseId ? { ...c, technicianName: newTechName } : c));
        if (newTechName && !techPresets.includes(newTechName)) {
            setTechPresets(prev => [newTechName, ...prev].slice(0, 10));
        }
        setEditingTechId(null);
        showToast('تم تحديث القائم بالفحص', 'success');
    };

    // --- Save Full Case Edits from Edit Modal ---
    const handleSaveEditCase = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!editingCase) return;

        const finalTech = editingCase.technicianName?.trim() || selectedTechnician;
        const updatedCase: StandaloneCase = {
            ...editingCase,
            technicianName: finalTech
        };

        setCases(prev => prev.map(c => c.id === updatedCase.id ? updatedCase : c));
        if (finalTech && !techPresets.includes(finalTech)) {
            setTechPresets(prev => [finalTech, ...prev].slice(0, 10));
        }

        setIsEditCaseModalOpen(false);
        setEditingCase(null);
        showToast(
            isEn
                ? `Saved case changes (${updatedCase.modalitySerial || 'No serial'})`
                : `تم حفظ تعديلات الحالة (${updatedCase.modalitySerial || 'بدون رقم'}) والقائم بالفحص (${finalTech})`,
            'success'
        );
    };

    // --- Vacate Slot (Clear Patient Data, Keep Serial Number Intact in Logbook) ---
    const vacateCaseSlot = (item: StandaloneCase, returnToQueue: boolean = true) => {
        if (returnToQueue && !item.isEmptySlot && item.patientName && item.patientName.trim()) {
            const restored: IncomingPatient = {
                id: `in_ret_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                patientName: item.patientName,
                fileNumber: item.fileNumber,
                examName: item.examName,
                examList: item.examList || [item.examName],
                refNo: item.refNo,
                doctorName: item.doctorName,
                date: item.date,
                time: item.time,
                modality: item.modality,
                technicianName: item.technicianName,
                age: item.age,
                gender: item.gender,
                nationality: item.nationality,
                isCash: item.isCash,
                timestamp: Date.now(),
                source: 'CLICK'
            };
            setIncomingQueue(prev => [restored, ...prev]);
        }

        // Convert the case row to a Vacant / Empty Slot preserving modalitySerial & serialNo
        setCases(prev => prev.map(c => {
            if (c.id === item.id) {
                return {
                    ...c,
                    patientName: isEn ? '[ Vacant Slot - Ready to Fill ]' : '[ خانة شاغرة - جاهزة للتسجيل ]',
                    fileNumber: '',
                    examName: '',
                    examList: [],
                    doctorName: '',
                    refNo: '',
                    notes: '',
                    isEmptySlot: true
                };
            }
            return c;
        }));

        showToast(
            isEn
                ? `Serial (${item.modalitySerial || 'No Code'}) is now a VACANT SLOT ready for another patient.${returnToQueue ? ' (Patient returned to queue)' : ''}`
                : `تم تفريغ الرقم (${item.modalitySerial || 'بدون كود'}) وإبقاؤه كخانة شاغرة جاهزة لمريض آخر${returnToQueue ? ' (وإعادة المريض للانتظار)' : ''}`,
            'info'
        );
    };

    // --- Return Case Back to Waiting Queue ---
    const handleReturnToQueue = (item: StandaloneCase) => {
        vacateCaseSlot(item, true);
    };

    // --- Delete Case with Option to Vacate Slot or Delete Permanently ---
    const handleDeleteCase = (item: StandaloneCase) => {
        if (item.isEmptySlot) {
            const confirmDeleteSlot = confirm(
                isEn
                    ? `Are you sure you want to PERMANENTLY remove vacant slot (${item.modalitySerial || 'No Code'}) from the logbook?`
                    : `هل أنت متأكد من حذف الخانة الشاغرة رقم (${item.modalitySerial || 'بدون كود'}) نهائياً من السجل؟`
            );
            if (confirmDeleteSlot) {
                setCases(prev => prev.filter(c => c.id !== item.id));
                showToast(isEn ? 'Vacant slot removed' : 'تم حذف الخانة الشاغرة نهائياً', 'info');
            }
            return;
        }

        const confirmVacateAndQueue = confirm(
            isEn
                ? `Do you want to vacate this serial slot (${item.modalitySerial || 'No Code'}) and return patient (${item.patientName}) to waiting queue?\n\n- Click [OK] to vacate slot & return patient to queue (Serial stays available!)\n- Click [Cancel] for permanent delete options.`
                : `هل تريد إرجاع الحالة (${item.patientName}) إلى طابور الانتظار وتفريغ رقم الأشعة (${item.modalitySerial || 'بدون كود'}) ليكون خانة شاغرة لحالة أخرى؟\n\n- اضغط [موافق] لإرجاع المريض للانتظار وإبقاء الرقم شاغراً لمريض آخر\n- اضغط [إلغاء] لخيارات الحذف الأُخرى.`
        );

        if (confirmVacateAndQueue) {
            vacateCaseSlot(item, true);
        } else {
            const confirmVacateOnly = confirm(
                isEn
                    ? `Do you want to KEEP the serial number (${item.modalitySerial || 'No Code'}) as a vacant slot in the logbook (without returning patient to queue)?\n\n- Click [OK] to keep slot vacant\n- Click [Cancel] to DELETE serial slot permanently.`
                    : `هل تريد إبقاء رقم الأشعة (${item.modalitySerial || 'بدون كود'}) كخانة شاغرة في السجل لاستغلاله يدوياً لاحقاً؟\n\n- اضغط [موافق] لإبقاء الخانة فارغة وجاهزة\n- اضغط [إلغاء] لحذف الخانة نهائياً من السجل.`
            );
            if (confirmVacateOnly) {
                vacateCaseSlot(item, false);
            } else {
                setCases(prev => prev.filter(c => c.id !== item.id));
                showToast(isEn ? 'Case and serial slot permanently deleted' : 'تم حذف الحالة ورقم الأشعة نهائياً', 'info');
            }
        }
    };

    // --- Fill Vacant Serial Slot with Patient Data ---
    const handleFillSlotWithPatient = (slotId: string, patientData: {
        patientName: string;
        fileNumber?: string;
        examName?: string;
        doctorName?: string;
        technicianName?: string;
        notes?: string;
        time?: string;
        refNo?: string;
    }, fromQueueItem?: IncomingPatient) => {
        const assignedTech = patientData.technicianName?.trim() || selectedTechnician;

        setCases(prev => prev.map(c => {
            if (c.id === slotId) {
                return {
                    ...c,
                    patientName: patientData.patientName || (isEn ? 'Unregistered Patient' : 'مريض غير مسجل'),
                    fileNumber: String(patientData.fileNumber || '').trim(),
                    examName: patientData.examName || (isEn ? 'X-Ray Exam' : 'فحص أشعة'),
                    doctorName: patientData.doctorName || (isEn ? 'Clinic / Reception' : 'العيادة / الاستقبال'),
                    technicianName: assignedTech,
                    time: patientData.time ? cleanTime(patientData.time) : (c.time || getCurrentTime()),
                    refNo: patientData.refNo || c.refNo,
                    notes: patientData.notes || '',
                    isEmptySlot: false,
                    status: 'completed'
                };
            }
            return c;
        }));

        if (fromQueueItem) {
            setIncomingQueue(prev => prev.filter(p => p.id !== fromQueueItem.id));
        }

        setIsFillSlotModalOpen(false);
        setSlotToFill(null);
        showToast(
            isEn
                ? `Vacant serial slot filled successfully for (${patientData.patientName})`
                : `تمت تعبئة الخانة الشاغرة بنجاح للمريض (${patientData.patientName})`,
            'success'
        );
    };

    // --- In-Place Update of Modality Serial / X-Ray Number ---
    const updateCaseSerial = (caseId: string, newSerial: string) => {
        setCases(prev => prev.map(c => c.id === caseId ? { ...c, modalitySerial: newSerial } : c));
    };

    // --- Update Incoming Patient Item In-Place ---
    const updateIncomingModality = (itemId: string, newMod: 'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO') => {
        setIncomingQueue(prev => prev.map(p => p.id === itemId ? { ...p, modality: newMod } : p));
    };

    const updateIncomingTech = (itemId: string, newTech: string) => {
        setIncomingQueue(prev => prev.map(p => p.id === itemId ? { ...p, technicianName: newTech } : p));
    };

    // --- IHMS Listener: Puts into Incoming Queue or Directly Registers if Clicked ---
    useEffect(() => {
        const handleIncomingPayload = (payload: any, isDirectClick: boolean = false) => {
            if (!payload) return;
            let items: any[] = [];
            if (Array.isArray(payload)) items = payload;
            else if (typeof payload === 'object') items = [payload];

            const todayStr = getLocalToday();

            items.forEach((p: any) => {
                // 1. FILTER: Ignore records with results/reports but no active orders/invoices (such as xraylatestData / xrayResultDetails)
                if ((!p.xrayPatientDetails || p.xrayPatientDetails.length === 0) && (p.xrayResultDetails && p.xrayResultDetails.length > 0)) {
                    return;
                }

                // If marked as purely a report result without active invoice details, ignore it
                if (p.isReport || p.isResult || (p.reportStatus === 'Completed' && (!p.xrayPatientDetails || p.xrayPatientDetails.length === 0))) {
                    return;
                }

                const pName = findValue(p, ['patientName', 'engName', 'name', 'patName', 'arabicName', 'fullName']) || '';
                const cleanName = pName.includes(' - ') ? pName.split(' - ')[1] : pName;
                const fNum = String(findValue(p, ['fileNumber', 'fileNo', 'mrn', 'patientId', 'pid', 'patientCode']) || '').trim();
                const doc = findValue(p, ['doctorName', 'docName', 'doctor']) || 'العيادة / الاستقبال';
                const rawParentTime = findValue(p, ['queTime', 'time', 'queueTime', 'visitTime', 'orderTime', 'regTime', 'order_time']) || getCurrentTime();
                const cleanPatientTime = cleanTime(rawParentTime);
                const parentDate = cleanDate(findValue(p, ['queDate', 'orderDate', 'billDate', 'invoiceDate', 'date']));
                const rawTech = findValue(p, ['technicianName', 'techName', 'performedBy']) || selectedTechnician;

                const age = findValue(p, ['ageYear', 'age', 'patientAge', 'dob']);
                const rawGender = findValue(p, ['gender', 'sex', 'patientGender']);
                let gender = '';
                if (rawGender !== undefined && rawGender !== null) {
                    if (typeof rawGender === 'boolean') {
                        gender = rawGender ? 'male' : 'female';
                    } else {
                        const g = String(rawGender).toLowerCase().trim();
                        if (g.startsWith('f') || g === 'أنثى' || g === 'انثى' || g === 'false') gender = 'female';
                        else if (g.startsWith('m') || g === 'ذكر' || g === 'true') gender = 'male';
                    }
                }
                const nationality = findValue(p, ['nationality', 'natName', 'patientNationality', 'nat']) || '';
                let isCash: boolean | undefined = undefined;
                if (p.cashCredit !== undefined && p.cashCredit !== null) {
                    isCash = p.cashCredit === 1 || String(p.cashCredit) === '1';
                } else if (p.queCashComp !== undefined || p.cashComp !== undefined || p.paymentType) {
                    isCash = p.queCashComp === 1 || p.cashComp === 1 || p.paymentType === 'Cash' || p.paymentType === 'cash' || String(p.queCashComp) === '1';
                }

                // Pull ONLY from active order details / services / xrayPatientDetails (Strictly NO xrayResultDetails)
                const details = p.xrayPatientDetails || p.orderDetails || p.services || [];
                
                // Group exams by Modality + RefNo (Invoice Number) exactly like AppointmentsPage
                const modalityGroups: Record<string, {
                    modality: 'X-RAY' | 'CT' | 'MRI' | 'US' | 'FLUO' | 'MAMMO' | 'OTHER';
                    exams: string[];
                    time: string;
                    date: string;
                    doc: string;
                    refNo: string;
                    tech?: string;
                }> = {};

                if (Array.isArray(details) && details.length > 0) {
                    details.forEach((det: any) => {
                        const exam = findValue(det, ['serviceName', 'examName', 'procedure', 'xrayName']);
                        if (!exam) return;

                        // Check if det has an order date; if not use parent date
                        const itemDate = cleanDate(findValue(det, ['queDate', 'date', 'orderDate', 'billDate', 'invoiceDate']) || parentDate);

                        // 2. FILTER: Only process cases with invoices created TODAY (unless user explicitly clicks an item)
                        if (!isDirectClick && itemDate !== todayStr) {
                            return;
                        }

                        const itemTime = cleanTime(findValue(det, ['queTime', 'time', 'visitTime', 'orderTime']) || cleanPatientTime);
                        const detectedMod = detectModality(
                            exam,
                            det.modality || det.modalityName || det.examType || p.modality || p.modalityName,
                            det.deptName || det.departmentName || det.sectionName || p.deptName,
                            det
                        );
                        const refNo = String(det.queRefNo || det.refNo || p.refNo || det.billNo || p.billNo || det.invoiceNo || p.invoiceNo || '');
                        const groupKey = `${detectedMod}_${refNo || 'NO_REF'}_${fNum || 'NO_FILE'}`;

                        if (!modalityGroups[groupKey]) {
                            modalityGroups[groupKey] = {
                                modality: detectedMod,
                                exams: [],
                                time: itemTime,
                                date: itemDate,
                                doc: det.doctorName || det.docName || doc,
                                refNo: refNo,
                                tech: det.technicianName || rawTech
                            };
                        }
                        if (!modalityGroups[groupKey].exams.includes(exam)) {
                            modalityGroups[groupKey].exams.push(exam);
                        }
                    });
                } else {
                    const exam = findValue(p, ['serviceName', 'examName', 'procedure']) || 'فحص أشعة';
                    const itemDate = cleanDate(parentDate);

                    // 2. FILTER: Only process cases with invoices created TODAY (unless user explicitly clicks an item)
                    if (!isDirectClick && itemDate !== todayStr) {
                        return;
                    }

                    const detectedMod = detectModality(
                        exam,
                        p.modality || p.modalityName || p.modalityCode || p.examType,
                        p.deptName || p.departmentName || p.sectionName,
                        p
                    );
                    const refNo = String(p.refNo || p.billNo || p.invoiceNo || p.queRefNo || '');
                    const groupKey = `${detectedMod}_${refNo || 'NO_REF'}_${fNum || 'NO_FILE'}`;
                    modalityGroups[groupKey] = {
                        modality: detectedMod,
                        exams: [exam],
                        time: cleanPatientTime,
                        date: itemDate,
                        doc: doc,
                        refNo: refNo,
                        tech: rawTech
                    };
                }

                // Process each modality group as a single unified card/case
                Object.values(modalityGroups).forEach((group) => {
                    const combinedExamName = group.exams.join(' + ');

                    if (isDirectClick || autoRegisterOnClick) {
                        registerPatient({
                            patientName: cleanName || pName,
                            fileNumber: fNum,
                            examName: combinedExamName,
                            examList: group.exams,
                            refNo: group.refNo,
                            doctorName: group.doc,
                            date: group.date,
                            time: group.time,
                            modality: group.modality,
                            technicianName: group.tech || rawTech,
                            age: age ? String(age) : undefined,
                            gender: gender || undefined,
                            nationality: nationality || undefined,
                            isCash: isCash,
                            source: 'CLICK'
                        });
                    } else {
                        // Place into Incoming Staging Queue
                        setIncomingQueue(prev => {
                            // Check if already in queue or registered for this modality & refNo
                            const inQueue = prev.some(q => 
                                q.fileNumber === fNum && 
                                q.modality === group.modality && 
                                (group.refNo && q.refNo ? q.refNo === group.refNo : q.examName === combinedExamName) && 
                                q.date === group.date
                            );
                            const alreadyRegistered = cases.some(c => 
                                c.fileNumber === fNum && 
                                c.modality === group.modality && 
                                (group.refNo && c.refNo ? c.refNo === group.refNo : c.examName === combinedExamName) && 
                                c.date === group.date
                            );
                            if (inQueue || alreadyRegistered) return prev;

                            const item: IncomingPatient = {
                                id: `in_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                                patientName: cleanName || pName || 'مريض غير مسجل',
                                fileNumber: fNum,
                                examName: combinedExamName,
                                examList: group.exams,
                                refNo: group.refNo,
                                doctorName: group.doc,
                                date: group.date,
                                time: group.time,
                                modality: group.modality,
                                technicianName: selectedTechnician,
                                age: age ? String(age) : undefined,
                                gender: gender || undefined,
                                nationality: nationality || undefined,
                                isCash: isCash,
                                timestamp: Date.now(),
                                source: isDirectClick ? 'CLICK' : 'IHMS_AUTO',
                                rawInfo: p
                            };
                            return [item, ...prev];
                        });
                    }
                });
            });
        };

        const onWindowMessage = (event: MessageEvent) => {
            if (!isListening) return;
            if (event.data && (event.data.type === 'SMART_SYNC_DATA' || event.data.type === 'AJ_BRIDGE_DATA' || event.data.type === 'IHMS_ROW_CLICKED')) {
                const isClick = event.data.action === 'PATIENT_CLICKED' || event.data.isClick === true || event.data.type === 'IHMS_ROW_CLICKED';
                handleIncomingPayload(event.data.payload, isClick);
            }
        };

        const onStorageEvent = (event: StorageEvent) => {
            if (!isListening) return;
            if (event.key === 'aj_smart_bridge_live_event' && event.newValue) {
                try {
                    const parsed = JSON.parse(event.newValue);
                    if (parsed.payload) {
                        const isClick = parsed.action === 'PATIENT_CLICKED' || parsed.isClick === true;
                        handleIncomingPayload(parsed.payload, isClick);
                    }
                } catch (e) {}
            }
        };

        window.addEventListener('message', onWindowMessage);
        window.addEventListener('storage', onStorageEvent);

        let bc: BroadcastChannel | null = null;
        try {
            bc = new BroadcastChannel('smart_bridge_channel');
            bc.onmessage = (event) => {
                if (!isListening) return;
                if (event.data && (event.data.type === 'SMART_SYNC_DATA' || event.data.type === 'AJ_BRIDGE_DATA' || event.data.type === 'IHMS_ROW_CLICKED')) {
                    const isClick = event.data.action === 'PATIENT_CLICKED' || event.data.isClick === true || event.data.type === 'IHMS_ROW_CLICKED';
                    handleIncomingPayload(event.data.payload, isClick);
                }
            };
        } catch (e) {}

        return () => {
            window.removeEventListener('message', onWindowMessage);
            window.removeEventListener('storage', onStorageEvent);
            if (bc) bc.close();
        };
    }, [isListening, cases, counters, selectedTechnician, autoRegisterOnClick]);

    // Modality breakdown counts for Incoming Queue
    const incomingModalityCounts = useMemo(() => {
        return {
            'ALL': incomingQueue.length,
            'X-RAY': incomingQueue.filter(q => q.modality === 'X-RAY').length,
            'CT': incomingQueue.filter(q => q.modality === 'CT').length,
            'MRI': incomingQueue.filter(q => q.modality === 'MRI').length,
            'US': incomingQueue.filter(q => q.modality === 'US').length,
            'FLUO': incomingQueue.filter(q => q.modality === 'FLUO').length,
            'MAMMO': incomingQueue.filter(q => q.modality === 'MAMMO').length,
        };
    }, [incomingQueue]);

    // --- Filtered & Time-Sorted Incoming Queue ---
    const filteredIncoming = useMemo(() => {
        const list = incomingQueue.filter(p => {
            const matchesMod = incomingModalityFilter === 'ALL' || p.modality === incomingModalityFilter;
            const matchesSearch = !incomingSearch ||
                p.patientName.toLowerCase().includes(incomingSearch.toLowerCase()) ||
                p.fileNumber.includes(incomingSearch) ||
                p.examName.toLowerCase().includes(incomingSearch.toLowerCase()) ||
                (p.refNo && p.refNo.includes(incomingSearch)) ||
                (p.doctorName && p.doctorName.toLowerCase().includes(incomingSearch.toLowerCase()));
            return matchesMod && matchesSearch;
        });

        // Sort chronologically by time (down to the second)
        return list.sort((a, b) => {
            const timeA = parseTimeToSeconds(a.time);
            const timeB = parseTimeToSeconds(b.time);
            const diff = timeA - timeB;
            if (diff !== 0) return incomingSortOrder === 'asc' ? diff : -diff;
            return incomingSortOrder === 'asc' ? (a.timestamp - b.timestamp) : (b.timestamp - a.timestamp);
        });
    }, [incomingQueue, incomingModalityFilter, incomingSearch, incomingSortOrder]);

    // --- Filtered & User-Sorted Registered Cases (ترتيب الحالات بالوقت كافتراضي أو الرقم أو الاسم) ---
    const filteredCases = useMemo(() => {
        const list = cases.filter(c => {
            const matchesDate = !selectedDate || c.date === selectedDate;
            const matchesModality = activeTab === 'ALL' || c.modality === activeTab;
            const matchesTechFilter = selectedTechFilter === 'ALL' || (c.technicianName && c.technicianName.trim() === selectedTechFilter.trim());
            const matchesSearch = !searchQuery || 
                c.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.fileNumber.includes(searchQuery) ||
                c.modalitySerial.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.examName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.doctorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (c.technicianName && c.technicianName.toLowerCase().includes(searchQuery.toLowerCase()));

            return matchesDate && matchesModality && matchesTechFilter && matchesSearch;
        });

        return list.sort((a, b) => {
            let diff = 0;
            if (sortField === 'time') {
                const timeA = parseTimeToSeconds(a.time);
                const timeB = parseTimeToSeconds(b.time);
                diff = timeA - timeB;
                if (diff === 0) diff = a.serialNo - b.serialNo;
            } else if (sortField === 'serialNo') {
                diff = a.serialNo - b.serialNo;
            } else if (sortField === 'patientName') {
                diff = a.patientName.localeCompare(b.patientName, 'ar');
            } else if (sortField === 'fileNumber') {
                diff = (a.fileNumber || '').localeCompare(b.fileNumber || '');
            }
            return sortDirection === 'asc' ? diff : -diff;
        });
    }, [cases, selectedDate, activeTab, selectedTechFilter, searchQuery, sortField, sortDirection]);

    // Modality Statistics for Selected Date
    const modalityStats = useMemo(() => {
        const dateCases = cases.filter(c => !selectedDate || c.date === selectedDate);
        return {
            'ALL': dateCases.length,
            'X-RAY': dateCases.filter(c => c.modality === 'X-RAY').length,
            'CT': dateCases.filter(c => c.modality === 'CT').length,
            'MRI': dateCases.filter(c => c.modality === 'MRI').length,
            'US': dateCases.filter(c => c.modality === 'US').length,
            'FLUO': dateCases.filter(c => c.modality === 'FLUO').length,
            'MAMMO': dateCases.filter(c => c.modality === 'MAMMO').length,
        };
    }, [cases, selectedDate]);

    // Daily Technician Cases & Workload Breakdown Statistics
    interface TechStatItem {
        name: string;
        total: number;
        modalities: Record<string, number>;
        percentage: number;
    }

    const technicianDailyStats = useMemo<TechStatItem[]>(() => {
        const dateCases = cases.filter(c => !selectedDate || c.date === selectedDate);
        const totalDateCases = dateCases.length;
        const map: Record<string, { total: number; modalities: Record<string, number> }> = {};

        // Aggregate cases done by technicians
        dateCases.forEach(c => {
            const rawTech = (c.technicianName && c.technicianName.trim()) ? c.technicianName.trim() : 'غير محدد';
            if (!map[rawTech]) {
                map[rawTech] = {
                    total: 0,
                    modalities: { 'X-RAY': 0, 'CT': 0, 'MRI': 0, 'US': 0, 'FLUO': 0, 'MAMMO': 0 }
                };
            }
            map[rawTech].total += 1;
            if (map[rawTech].modalities[c.modality] !== undefined) {
                map[rawTech].modalities[c.modality] += 1;
            }
        });

        // Ensure all configured presets exist in map even if 0 cases today
        techPresets.forEach(preset => {
            const p = preset.trim();
            if (p && !map[p]) {
                map[p] = {
                    total: 0,
                    modalities: { 'X-RAY': 0, 'CT': 0, 'MRI': 0, 'US': 0, 'FLUO': 0, 'MAMMO': 0 }
                };
            }
        });

        const list: TechStatItem[] = Object.entries(map).map(([name, data]) => ({
            name,
            total: data.total,
            modalities: data.modalities,
            percentage: totalDateCases > 0 ? Math.round((data.total / totalDateCases) * 100) : 0
        }));

        // Sort by total descending
        return list.sort((a, b) => b.total - a.total);
    }, [cases, selectedDate, techPresets]);

    // Export Staff Daily Workload Report to Excel (.xlsx)
    const exportTechStatsToExcel = () => {
        const dateCases = cases.filter(c => !selectedDate || c.date === selectedDate);
        if (dateCases.length === 0) {
            showToast('لا توجد حالات مسجلة لتصدير إحصائيات الموظفين لهذا اليوم', 'error');
            return;
        }

        const wb = XLSX.utils.book_new();
        const sheetData: (string | number)[][] = [
            ['تقرير إنجاز وحالات الموظفين والفنيين اليومي - قسم الأشعة والتصوير الطبي'],
            [`التاريخ: ${selectedDate || 'كافة الأيام'}`, `إجمالي الحالات المنجزة: ${dateCases.length}`, `عدد الكادر العامل: ${technicianDailyStats.filter(t => t.total > 0).length}`],
            [],
            ['م', 'اسم الفني / الموظف', 'إجمالي الحالات', 'أشعة عادية (XR)', 'أشعة مقطعية (CT)', 'رنين مغناطيسي (MRI)', 'موجات صوتية (US)', 'فلوروسكوبي (FL)', 'ماموجرام (MG)', 'نسبة الإنجاز اليومي %']
        ];

        technicianDailyStats.forEach((t, idx) => {
            sheetData.push([
                idx + 1,
                t.name,
                t.total,
                t.modalities['X-RAY'] || 0,
                t.modalities['CT'] || 0,
                t.modalities['MRI'] || 0,
                t.modalities['US'] || 0,
                t.modalities['FLUO'] || 0,
                t.modalities['MAMMO'] || 0,
                `${t.percentage}%`
            ]);
        });

        // Add summary row
        sheetData.push([]);
        sheetData.push([
            '',
            'الإجمالي العام لليوم',
            dateCases.length,
            modalityStats['X-RAY'],
            modalityStats['CT'],
            modalityStats['MRI'],
            modalityStats['US'],
            modalityStats['FLUO'],
            modalityStats['MAMMO'],
            '100%'
        ]);

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [
            { wch: 6 },   // م
            { wch: 28 },  // اسم الفني
            { wch: 16 },  // إجمالي الحالات
            { wch: 16 },  // XR
            { wch: 16 },  // CT
            { wch: 16 },  // MRI
            { wch: 16 },  // US
            { wch: 16 },  // FL
            { wch: 16 },  // MG
            { wch: 20 }   // نسبة الإنجاز
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'إحصائيات الموظفين');
        const fileName = `تقرير_إنجاز_الموظفين_${selectedDate || 'all'}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showToast(`📊 تم تحميل تقرير إنجاز الموظفين بصيغة Excel (${fileName}) بنجاح!`, 'success');
    };

    // --- REAL EXCEL (.xlsx) EXPORT ENGINE VIA SHEETJS ---
    const exportToExcel = (targetModality: string = activeTab) => {
        const targetCases = cases.filter(c => {
            const matchesDate = !selectedDate || c.date === selectedDate;
            const matchesModality = targetModality === 'ALL' || c.modality === targetModality;
            return matchesDate && matchesModality;
        }).sort((a, b) => {
            // Default chronological order by time then serial
            const timeA = parseTimeToSeconds(a.time);
            const timeB = parseTimeToSeconds(b.time);
            if (timeA !== timeB) return timeA - timeB;
            return a.serialNo - b.serialNo;
        });

        if (targetCases.length === 0) {
            showToast('لا توجد حالات لتصديرها في هذا القسم/التاريخ', 'error');
            return;
        }

        const modalityTitle = targetModality === 'ALL' ? 'كافة_الأقسام' : (MODALITY_CONFIG[targetModality]?.nameAr || targetModality);
        const modPrefix = targetModality === 'ALL' ? 'ALL' : (MODALITY_CONFIG[targetModality]?.prefix || targetModality);
        const fileName = `سجل_أشعة_${modPrefix}_${selectedDate || 'all'}.xlsx`;

        // Format data sheet
        const sheetData: (string | number)[][] = [
            ['سجل فحص الأشعة الرقمي - مستشفى / مركز الأشعة والتصوير الطبي'],
            [`القسم: ${modalityTitle}`, `التاريخ: ${selectedDate || 'كافة الأيام'}`, `إجمالي الحالات: ${targetCases.length}`],
            [],
            ['م', 'رقم الأشعة التسلسلي', 'القسم', 'رقم الملف (MRN)', 'اسم المريض', 'الفحص المطلوب', 'الطبيب المعالج / المحول', 'التاريخ', 'الوقت', 'القائم بالفحص (الفني)', 'ملاحظات']
        ];

        targetCases.forEach((c, idx) => {
            sheetData.push([
                idx + 1,
                c.modalitySerial,
                MODALITY_CONFIG[c.modality]?.nameAr || c.modality,
                c.fileNumber || '-',
                c.patientName,
                c.examName,
                c.doctorName || '-',
                c.date,
                c.time,
                c.technicianName || '',
                c.notes || ''
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        // Configure column widths for pristine Excel presentation
        ws['!cols'] = [
            { wch: 6 },   // م
            { wch: 20 },  // رقم الأشعة
            { wch: 18 },  // القسم
            { wch: 18 },  // رقم الملف
            { wch: 32 },  // اسم المريض
            { wch: 36 },  // الفحص المطلوب
            { wch: 24 },  // الطبيب
            { wch: 14 },  // التاريخ
            { wch: 12 },  // الوقت
            { wch: 24 },  // الفني
            { wch: 26 }   // ملاحظات
        ];

        const wb = XLSX.utils.book_new();
        const sheetTitle = (modPrefix + ' - سجل الحالات').substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetTitle);

        XLSX.writeFile(wb, fileName);
        showToast(`📊 تم تصدير ملف إكسل رسمي (.xlsx) (${fileName}) بنجاح!`, 'success');
    };

    // Export Master Multi-Sheet Excel Workbook (.xlsx containing all departments as tabs)
    const exportMultiSheetExcelWorkbook = () => {
        const activeDateCases = cases.filter(c => !selectedDate || c.date === selectedDate);
        if (activeDateCases.length === 0) {
            showToast('لا توجد حالات لتصديرها في هذا التاريخ', 'error');
            return;
        }

        const wb = XLSX.utils.book_new();
        const modalities = ['ALL', 'X-RAY', 'CT', 'MRI', 'US', 'FLUO', 'MAMMO'] as const;

        modalities.forEach(mod => {
            const modCases = activeDateCases.filter(c => mod === 'ALL' || c.modality === mod)
                .sort((a, b) => {
                    const timeA = parseTimeToSeconds(a.time);
                    const timeB = parseTimeToSeconds(b.time);
                    if (timeA !== timeB) return timeA - timeB;
                    return a.serialNo - b.serialNo;
                });

            if (modCases.length === 0 && mod !== 'ALL') return;

            const modTitle = MODALITY_CONFIG[mod]?.nameAr || mod;
            const sheetData: (string | number)[][] = [
                [`سجل فحص الأشعة - ${modTitle}`],
                [`التاريخ: ${selectedDate || 'كافة الأيام'}`, `عدد الحالات: ${modCases.length}`],
                [],
                ['م', 'رقم الأشعة', 'القسم', 'رقم الملف (MRN)', 'اسم المريض', 'الفحص المطلوب', 'الطبيب المحول', 'التاريخ', 'الوقت', 'القائم بالفحص (الفني)', 'ملاحظات']
            ];

            modCases.forEach((c, idx) => {
                sheetData.push([
                    idx + 1,
                    c.modalitySerial,
                    MODALITY_CONFIG[c.modality]?.nameAr || c.modality,
                    c.fileNumber || '-',
                    c.patientName,
                    c.examName,
                    c.doctorName || '-',
                    c.date,
                    c.time,
                    c.technicianName || '',
                    c.notes || ''
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet(sheetData);
            ws['!cols'] = [
                { wch: 6 },
                { wch: 18 },
                { wch: 18 },
                { wch: 18 },
                { wch: 30 },
                { wch: 34 },
                { wch: 22 },
                { wch: 14 },
                { wch: 12 },
                { wch: 22 },
                { wch: 24 }
            ];

            const sheetName = (MODALITY_CONFIG[mod]?.prefix || mod).substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        const fileName = `سجل_الأشعة_الشامل_المصنف_${selectedDate || 'all'}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showToast(`📊 تم تحميل المصنف الشامل لكافة الأقسام بصيغة Excel (.xlsx) بنجاح!`, 'success');
    };

    // Copy to Clipboard (Table paste directly into Excel Ctrl+V)
    const copyTableToExcelClipboard = () => {
        if (filteredCases.length === 0) {
            showToast('لا توجد بيانات للنسخ', 'error');
            return;
        }

        const headers = ['م', 'رقم الأشعة', 'القسم', 'رقم الملف', 'اسم المريض', 'الفحص', 'الطبيب', 'التاريخ', 'الوقت', 'القائم بالفحص'];
        const rows = filteredCases.map((c, i) => [
            i + 1,
            c.modalitySerial,
            MODALITY_CONFIG[c.modality]?.nameAr || c.modality,
            c.fileNumber,
            c.patientName,
            c.examName,
            c.doctorName,
            c.date,
            c.time,
            c.technicianName || ''
        ]);

        const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
        navigator.clipboard.writeText(tsv).then(() => {
            showToast('📋 تم نسخ الجدول! يمكنك لصقه (Ctrl+V) مباشرة داخل أي ملف إكسل.', 'success');
        });
    };

    // Export All Department Files at Once
    const exportAllDepartmentsZip = () => {
        ['X-RAY', 'CT', 'MRI', 'US'].forEach((mod, i) => {
            setTimeout(() => {
                exportToExcel(mod);
            }, i * 300);
        });
    };

    // Backup & Restore Local JSON
    const handleBackupJSON = () => {
        const data = {
            version: '2.5',
            exportedAt: new Date().toISOString(),
            cases,
            counters,
            incomingQueue,
            techPresets
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Radiology_Logbook_Backup_${getLocalToday()}.json`;
        a.click();
        showToast('تم تحميل النسخة الاحتياطية المحلية (JSON)', 'success');
    };

    const handleRestoreJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target?.result as string);
                if (parsed.cases && Array.isArray(parsed.cases)) {
                    setCases(parsed.cases);
                    if (parsed.counters) setCounters(parsed.counters);
                    if (parsed.techPresets) setTechPresets(parsed.techPresets);
                    showToast('تم استعادة البيانات بنجاح!', 'success');
                } else {
                    showToast('ملف غير صالح', 'error');
                }
            } catch (err) {
                showToast('خطأ في قراءة الملف', 'error');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-24" dir={isEn ? 'ltr' : 'rtl'}>
            {/* TOAST */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl text-white font-bold shadow-2xl flex items-center gap-3 transition-all animate-bounce ${
                    toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-rose-600' : 'bg-indigo-600'
                }`}>
                    <i className={toast.type === 'success' ? 'fas fa-check-circle' : toast.type === 'error' ? 'fas fa-exclamation-triangle' : 'fas fa-info-circle'}></i>
                    <span>{toast.msg}</span>
                </div>
            )}

            {/* HEADER BAR */}
            <header className="bg-slate-900 text-white px-4 py-3.5 md:px-8 sticky top-0 z-40 shadow-xl border-b border-slate-800">
                <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
                    {/* Title */}
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white text-lg shadow-lg">
                            <i className="fas fa-book-medical"></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-black tracking-tight">
                                    {txt('سجل الأشعة الرقمي المستقل', 'Standalone Radiology Logbook')}
                                </h1>
                                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    {isListening ? txt('الربط نشط', 'Bridge Active') : txt('متوقف', 'Stopped')}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                                {txt('تخزين محلي + تمييز الموداليتي + إرجاع للحافلة وحرية تعديل أرقام الأشعة', 'Local Storage + Modality Auto-Group + Waiting Queue Restore & Editable Serials')}
                            </p>
                        </div>
                    </div>

                    {/* Action Tools */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Language Switcher [ AR | EN ] */}
                        <button
                            type="button"
                            onClick={toggleLang}
                            className="bg-indigo-600/90 hover:bg-indigo-600 text-white border border-indigo-400/40 px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow transition-all cursor-pointer"
                            title={isEn ? "Switch language to Arabic" : "تغيير اللغة إلى الإنجليزية"}
                        >
                            <i className="fas fa-globe text-indigo-200"></i>
                            <span>{isEn ? 'العربية 🇸🇦' : 'English 🇬🇧'}</span>
                        </button>

                        {/* Starting Serial Number Quick Selector / Button */}
                        <button
                            onClick={() => {
                                const targetMod = activeTab !== 'ALL' ? (activeTab as any) : 'X-RAY';
                                setActiveModalityForCounter(targetMod);
                                setIsCounterModalOpen(true);
                            }}
                            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow transition-all"
                            title="انقر لتحديد الرقم الذي سيبدأ من عنده تسجيل الحالات"
                        >
                            <i className="fas fa-list-ol text-amber-400"></i>
                            <span>تحديد رقم البداية</span>
                            <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-mono font-bold text-[10px]">
                                {activeTab !== 'ALL' ? `${MODALITY_CONFIG[activeTab]?.prefix}-${String(counters[activeTab] || 1).padStart(3, '0')}` : 'العدادات'}
                            </span>
                        </button>

                        {/* Interactive Technician Selector & Dropdown */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsTechDropdownOpen(prev => !prev)}
                                className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-400/50 px-3 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow transition-all"
                                title="انقر لاختيار الفني الحالي أو إدارة وتعديل الأسماء"
                            >
                                <i className="fas fa-user-md text-amber-400"></i>
                                <span className="text-slate-300 text-[11px] hidden sm:inline">الفني:</span>
                                <span className="font-bold text-white bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-700 max-w-[120px] truncate">
                                    {selectedTechnician}
                                </span>
                                <i className="fas fa-chevron-down text-[10px] text-slate-400"></i>
                            </button>

                            {isTechDropdownOpen && (
                                <div className="absolute left-0 mt-2 w-64 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95">
                                    <div className="px-3.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
                                        <span className="text-[11px] font-black text-slate-500">اختر الفني القائم بالفحص:</span>
                                        <span className="text-[10px] text-indigo-600 font-bold">{techPresets.length} فنيين</span>
                                    </div>
                                    <div className="max-h-52 overflow-y-auto py-1">
                                        {techPresets.map(preset => (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedTechnician(preset);
                                                    setFastTech(preset);
                                                    setIsTechDropdownOpen(false);
                                                    showToast(`تم تعيين الفني النشط: ${preset}`, 'success');
                                                }}
                                                className={`w-full text-right px-3.5 py-2 text-xs font-bold flex items-center justify-between hover:bg-indigo-50 transition ${
                                                    selectedTechnician === preset ? 'bg-indigo-50 text-indigo-700 font-black' : 'text-slate-700'
                                                }`}
                                            >
                                                <span className="truncate">{preset}</span>
                                                {selectedTechnician === preset && <i className="fas fa-check text-indigo-600 text-xs"></i>}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="border-t border-slate-100 pt-1.5 px-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsTechDropdownOpen(false);
                                                setIsTechManagerOpen(true);
                                            }}
                                            className="w-full text-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
                                        >
                                            <i className="fas fa-user-edit text-xs"></i>
                                            <span>إدارة وتعديل أسماء الفنيين</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Daily Staff Workload Statistics Button */}
                        <button
                            onClick={() => setIsTechStatsModalOpen(true)}
                            className="bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition-all"
                            title="إحصائيات إنجاز وحالات كل موظف اليوم"
                        >
                            <i className="fas fa-chart-pie text-amber-300"></i>
                            <span>إحصائيات الموظفين</span>
                            <span className="bg-amber-400 text-slate-950 font-mono font-black px-1.5 py-0.2 rounded text-[10px]">
                                {technicianDailyStats.filter(s => s.total > 0).length} اليوم
                            </span>
                        </button>

                        {/* Standalone Offline Hub Button */}
                        <button
                            onClick={() => setIsOfflineModalOpen(true)}
                            className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow transition-all"
                            title="نظام مستقل يعمل أوفلاين 100% بدون إنترنت وبدون تسجيل دخول"
                        >
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>أوفلاين 100% (مستقل)</span>
                            <i className="fas fa-laptop-medical text-[10px] text-emerald-400"></i>
                        </button>

                        {/* Bridge Help & Script */}
                        <button
                            onClick={() => setIsBridgeInfoOpen(true)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 shadow transition-all"
                            title="طريقة الربط بالنقر المباشر في الـ IHMS"
                        >
                            <i className="fas fa-satellite-dish text-indigo-400"></i>
                            <span>ربط الـ IHMS</span>
                        </button>

                        {/* Export to Excel */}
                        <button
                            onClick={() => exportToExcel(activeTab)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all"
                            title="تنزيل شيت إكسل للقسم المختار"
                        >
                            <i className="fas fa-file-excel text-emerald-200"></i>
                            <span>تصدير إكسل ({activeTab === 'ALL' ? 'الكل' : MODALITY_CONFIG[activeTab]?.prefix})</span>
                        </button>

                        {/* Copy Table to Clipboard */}
                        <button
                            onClick={copyTableToExcelClipboard}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all"
                            title="نسخ الجدول ولصقه مباشرة في إكسل (Ctrl+V)"
                        >
                            <i className="fas fa-copy text-amber-400"></i>
                            <span className="hidden sm:inline">نسخ لإكسل</span>
                        </button>

                        {/* Export Modality Sheets Modal */}
                        <button
                            onClick={() => setIsExportModalOpen(true)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all"
                            title="تصدير شيتات الأقسام منفصلة"
                        >
                            <i className="fas fa-layer-group text-indigo-400"></i>
                            <span>شيتات الأقسام</span>
                        </button>

                        {/* Settings & Counters */}
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 w-9 h-9 rounded-xl flex items-center justify-center border border-slate-700 transition-all"
                            title="إعدادات العدادات والفنيين"
                        >
                            <i className="fas fa-sliders-h"></i>
                        </button>

                        {/* Manual Entry Modal */}
                        <button
                            onClick={() => {
                                setManualForm({
                                    patientName: '',
                                    fileNumber: '',
                                    examName: '',
                                    modality: 'X-RAY',
                                    doctorName: '',
                                    technicianName: selectedTechnician,
                                    notes: '',
                                    time: getCurrentTime()
                                });
                                setIsManualModalOpen(true);
                            }}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1 shadow-lg transition-all"
                        >
                            <i className="fas fa-plus"></i>
                            <span>تسجيل يدوي</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <div className="max-w-7xl mx-auto px-4 md:px-8 mt-5">
                
                {/* 1-SECOND QUICK REGISTER BAR (مع حقل القائم بالفحص اليدوي) */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 mb-4">
                    <form onSubmit={handleFastRegister} className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-black">
                            <i className="fas fa-bolt text-amber-500"></i>
                            <span>تسجيل سريع:</span>
                        </div>

                        <input
                            type="text"
                            placeholder="رقم الملف (MRN)"
                            value={fastMRN}
                            onChange={e => setFastMRN(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <input
                            type="text"
                            placeholder="اسم المريض (اختياري)"
                            value={fastName}
                            onChange={e => setFastName(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <input
                            type="text"
                            placeholder="اسم الفحص (مثال: CT Brain / US Pelvis)"
                            value={fastExam}
                            onChange={e => {
                                const val = e.target.value;
                                setFastExam(val);
                                setFastMod(detectModality(val) as any);
                            }}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />

                        <select
                            value={fastMod}
                            onChange={e => setFastMod(e.target.value as any)}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="X-RAY">أشعة عادية (XR)</option>
                            <option value="CT">مقطعية (CT)</option>
                            <option value="MRI">رنين (MRI)</option>
                            <option value="US">سونار (US)</option>
                            <option value="FLUO">فلورو وصبغة (FL)</option>
                            <option value="MAMMO">مامو (MG)</option>
                        </select>

                        {/* Starting / Next Serial Number Widget in Quick Bar */}
                        <div className="flex items-center gap-1.5 bg-indigo-50/80 border border-indigo-200 rounded-xl px-2.5 py-1 text-xs">
                            <span className="text-indigo-900 font-bold text-[11px]">الرقم القادم:</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveModalityForCounter(fastMod);
                                    setIsCounterModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 font-mono font-black text-indigo-700 bg-white px-2 py-0.5 rounded-lg border border-indigo-300 hover:border-amber-400 hover:bg-amber-50 transition"
                                title="انقر لتعديل رقم البداية"
                            >
                                <span>{MODALITY_CONFIG[fastMod]?.prefix}-{String(counters[fastMod] || 1).padStart(3, '0')}</span>
                                <i className="fas fa-pencil-alt text-[10px] text-indigo-500"></i>
                            </button>
                        </div>

                        {/* Fast Technician Selector & Custom Input */}
                        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1">
                            <i className="fas fa-user-md text-amber-500 text-xs"></i>
                            <select
                                value={fastTech}
                                onChange={e => {
                                    setFastTech(e.target.value);
                                    setSelectedTechnician(e.target.value);
                                }}
                                className="bg-transparent border-none text-xs font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[120px]"
                                title="اختر الفني القائم بالفحص"
                            >
                                {techPresets.map(preset => (
                                    <option key={preset} value={preset}>{preset}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => setIsTechManagerOpen(true)}
                                className="text-indigo-600 hover:text-indigo-800 p-0.5 text-xs font-bold"
                                title="إضافة فني جديد"
                            >
                                <i className="fas fa-plus-circle"></i>
                            </button>
                        </div>

                        <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition"
                        >
                            <i className="fas fa-check"></i>
                            <span>تسجيل واستخراج رقم</span>
                        </button>
                    </form>

                    {/* Quick Technician Chips */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-slate-400 font-bold">الفني القائم بالفحص:</span>
                            {techPresets.map(preset => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => {
                                        setSelectedTechnician(preset);
                                        setFastTech(preset);
                                        showToast(`تم تعيين القائم بالفحص: ${preset}`, 'info');
                                    }}
                                    className={`px-2 py-0.5 rounded-lg border font-bold transition-all ${
                                        selectedTechnician === preset
                                            ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                    }`}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsTechManagerOpen(true)}
                            className="text-indigo-600 hover:text-indigo-800 font-black text-xs flex items-center gap-1 transition"
                        >
                            <i className="fas fa-user-plus text-[10px]"></i>
                            <span>إضافة / تعديل أسماء الفنيين</span>
                        </button>
                    </div>
                </div>

                {/* STAFF DAILY WORKLOAD QUICK BAR (شريط متابعة إنجاز وحالات كل موظف اليوم) */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-3.5 mb-5 shadow-md border border-indigo-800/40 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-black text-amber-400 pl-3 border-l border-slate-700/80">
                            <i className="fas fa-users-cog"></i>
                            <span>إنجاز الموظفين ({selectedDate || 'اليوم'}):</span>
                        </div>

                        {/* Filter All Employees */}
                        <button
                            onClick={() => setSelectedTechFilter('ALL')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                selectedTechFilter === 'ALL'
                                    ? 'bg-amber-400 text-slate-950 shadow-md scale-105'
                                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            <span>كافة الموظفين</span>
                            <span className="bg-black/20 font-mono px-1.5 py-0.2 rounded text-[10px] font-bold">{modalityStats['ALL']}</span>
                        </button>

                        {/* Tech Daily Performance Chips (Click to filter table) */}
                        {technicianDailyStats.map(tech => (
                            <button
                                key={tech.name}
                                onClick={() => setSelectedTechFilter(tech.name === selectedTechFilter ? 'ALL' : tech.name)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    selectedTechFilter === tech.name
                                        ? 'bg-indigo-600 text-white shadow-md ring-2 ring-amber-400 scale-105'
                                        : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                                }`}
                                title={`انقر لعرض حالات ${tech.name} فقط في الجدول`}
                            >
                                <span>{tech.name}</span>
                                <span className={`font-mono font-black px-1.5 py-0.2 rounded text-[10px] ${
                                    tech.total > 0 ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
                                }`}>
                                    {tech.total} حالة
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Staff Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsTechManagerOpen(true)}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition"
                            title="إضافة وتعديل أسماء الموظفين"
                        >
                            <i className="fas fa-user-edit text-xs"></i>
                            <span>إدارة الأسماء</span>
                        </button>

                        <button
                            onClick={() => setIsTechStatsModalOpen(true)}
                            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl font-black flex items-center gap-1.5 shadow transition"
                            title="عرض التقرير المفصل مع الأقسام والنسب"
                        >
                            <i className="fas fa-chart-pie text-xs"></i>
                            <span>التقرير المفصل</span>
                        </button>
                    </div>
                </div>

                {/* INCOMING QUEUE SECTION (صندوق الوارد من IHMS) */}
                <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 text-white rounded-3xl p-5 mb-6 shadow-xl border border-indigo-800/40">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-indigo-800/50">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm">
                                <i className="fas fa-inbox"></i>
                            </div>
                            <div>
                                <h2 className="font-black text-base flex items-center gap-2">
                                    <span>قائمة المرضى الواردين من IHMS</span>
                                    <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
                                        {incomingQueue.length} حالة في الانتظار
                                    </span>
                                </h2>
                                <p className="text-xs text-indigo-200">
                                    💡 <strong>تنظيم الحالات بحسب الموداليتي ورقم الفاتورة:</strong> يتم تجميع فحوصات نفس القسم في مربع واحد، وعند حضور المريض اضغط [تسجيل] لأخذ الرقم التسلسلي فوراً.
                                </p>
                            </div>
                        </div>

                        {/* Search, Time Sort & Clear Incoming */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setIncomingSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                    showToast(`ترتيب الانتظار حسب الوقت: ${incomingSortOrder === 'asc' ? 'من الأحدث إلى الأقدم' : 'من الأقدم إلى الأحدث'}`, 'info');
                                }}
                                className="bg-indigo-900/80 hover:bg-indigo-800 text-amber-300 border border-indigo-700/60 rounded-xl px-2.5 py-1.5 text-xs font-bold flex items-center gap-1.5 transition"
                                title="تبديل ترتيب الوقت في قائمة الانتظار"
                            >
                                <i className="fas fa-clock"></i>
                                <span>ترتيب بالوقت: {incomingSortOrder === 'asc' ? 'الأقدم أولاً ↑' : 'الأحدث أولاً ↓'}</span>
                            </button>

                            <div className="relative w-52">
                                <i className="fas fa-search absolute right-3 top-2 text-indigo-300 text-xs"></i>
                                <input
                                    type="text"
                                    placeholder="بحث بملف، اسم، فحص، فاتورة..."
                                    value={incomingSearch}
                                    onChange={e => setIncomingSearch(e.target.value)}
                                    className="w-full bg-indigo-900/60 border border-indigo-700/60 rounded-xl pr-8 pl-3 py-1.5 text-xs text-white placeholder-indigo-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                            </div>

                            {incomingQueue.length > 0 && (
                                <button
                                    onClick={() => {
                                        if (confirm('هل تريد مسح قائمة الانتظار الحالية؟')) {
                                            setIncomingQueue([]);
                                            showToast('تم إفراغ قائمة الانتظار', 'info');
                                        }
                                    }}
                                    className="text-xs text-indigo-300 hover:text-rose-400 underline px-2 py-1"
                                >
                                    إفراغ القائمة
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Modality Filter Pills for Incoming Queue (نفس نظام صفحة المواعيد) */}
                    <div className="flex flex-wrap items-center gap-2 mb-4 bg-indigo-950/60 p-2 rounded-2xl border border-indigo-900/50">
                        <span className="text-xs font-bold text-indigo-300 ml-1">تصفية الوارد:</span>
                        {[
                            { key: 'ALL', label: 'كافة الأقسام', icon: 'fa-layer-group', bg: 'bg-indigo-600' },
                            { key: 'X-RAY', label: 'XR أشعة عادية', icon: 'fa-x-ray', bg: 'bg-slate-700' },
                            { key: 'CT', label: 'CT مقطعية', icon: 'fa-circle-notch', bg: 'bg-emerald-600' },
                            { key: 'MRI', label: 'MRI رنين', icon: 'fa-magnet', bg: 'bg-blue-600' },
                            { key: 'US', label: 'US سونار', icon: 'fa-wave-square', bg: 'bg-teal-600' },
                            { key: 'FLUO', label: 'FL فلورو', icon: 'fa-flask', bg: 'bg-amber-600' },
                            { key: 'MAMMO', label: 'MG مامو', icon: 'fa-ribbon', bg: 'bg-rose-600' }
                        ].map(tab => {
                            const isSelected = incomingModalityFilter === tab.key;
                            const count = incomingModalityCounts[tab.key as keyof typeof incomingModalityCounts] || 0;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setIncomingModalityFilter(tab.key)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                                        isSelected
                                            ? `${tab.bg} text-white shadow-md ring-2 ring-amber-400`
                                            : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
                                    }`}
                                >
                                    <i className={`fas ${tab.icon} text-[11px]`}></i>
                                    <span>{tab.label}</span>
                                    <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded font-black ${
                                        count > 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Incoming Items Grid / List */}
                    {filteredIncoming.length === 0 ? (
                        <div className="py-8 text-center text-indigo-300/70 border border-dashed border-indigo-800/40 rounded-2xl bg-indigo-950/20">
                            <i className="fas fa-satellite-dish text-2xl mb-2 text-indigo-400 animate-pulse"></i>
                            <p className="font-bold text-xs">لا توجد حالات واردة في هذا القسم حالياً...</p>
                            <p className="text-[11px] text-indigo-400 mt-0.5">عند فتح شاشة الأشعة في IHMS أو النقر على الحالة ستظهر هنا فوراً مرتبة بالوقت</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-96 overflow-y-auto pr-1">
                            {filteredIncoming.map(item => {
                                const modConf = MODALITY_CONFIG[item.modality] || MODALITY_CONFIG['X-RAY'];
                                const examCount = (item.examList && item.examList.length > 0) ? item.examList.length : 1;
                                
                                return (
                                    <div
                                        key={item.id}
                                        className="bg-slate-800/95 hover:bg-slate-800 border border-indigo-700/40 hover:border-amber-400/60 rounded-2xl p-3.5 flex flex-col justify-between gap-3 transition-all shadow-lg"
                                    >
                                        <div>
                                            {/* Top Row: Modality Badge & Exact Time */}
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-lg ${modConf.bg} text-white shadow-xs`}>
                                                        <span>{modConf.prefix}</span>
                                                        <span>•</span>
                                                        <span>{modConf.nameAr.split(' ')[0]}</span>
                                                    </span>

                                                    {item.refNo && (
                                                        <span className="text-[10px] font-mono font-bold text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700">
                                                            فاتورة: {item.refNo}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1 text-xs font-mono font-bold text-amber-300 bg-amber-400/10 px-2.5 py-0.5 rounded-lg border border-amber-400/20">
                                                    <i className="fas fa-clock text-[10px]"></i>
                                                    <span>{item.time}</span>
                                                </div>
                                            </div>

                                            {/* Patient Name */}
                                            <div className="font-black text-sm text-white truncate mb-1" title={item.patientName}>
                                                {item.patientName}
                                            </div>

                                            {/* Metadata Chips (MRN, Age, Gender, Doctor, Cash/Insurance) */}
                                            <div className="flex flex-wrap items-center gap-1.5 mb-2.5 text-[11px]">
                                                <span className="font-mono font-bold text-slate-200 bg-slate-900/90 px-2 py-0.5 rounded border border-slate-700">
                                                    ملف: {item.fileNumber || '-'}
                                                </span>

                                                {item.age && (
                                                    <span className="text-slate-300 bg-slate-900/70 px-1.5 py-0.5 rounded border border-slate-700/60 font-medium">
                                                        {item.age} سنة
                                                    </span>
                                                )}

                                                {item.gender && (
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                                        item.gender === 'female' ? 'bg-pink-950/60 text-pink-300 border-pink-800/60' : 'bg-sky-950/60 text-sky-300 border-sky-800/60'
                                                    }`}>
                                                        {item.gender === 'female' ? 'أنثى' : 'ذكر'}
                                                    </span>
                                                )}

                                                {item.isCash !== undefined && (
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                                        item.isCash ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60' : 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60'
                                                    }`}>
                                                        {item.isCash ? 'كاش' : 'تأمين'}
                                                    </span>
                                                )}

                                                <span className="text-slate-400 text-[10px] truncate max-w-[130px]" title={item.doctorName}>
                                                    د. {item.doctorName || 'العيادة'}
                                                </span>
                                            </div>

                                            {/* GROUPED EXAMS BOX (مربع الفحوصات المجمعة للموداليتي) */}
                                            <div className="bg-slate-900/90 rounded-xl p-2.5 border border-slate-700/80 mb-2.5">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                                                        <i className="fas fa-layer-group text-[10px]"></i>
                                                        <span>الفحوصات المطلوبة</span>
                                                    </span>
                                                    {examCount > 1 && (
                                                        <span className="bg-amber-400/20 text-amber-300 text-[10px] font-black px-1.5 py-0.2 rounded font-mono">
                                                            {examCount} فحوصات
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    {(item.examList && item.examList.length > 0 ? item.examList : [item.examName]).map((exam, exIdx) => (
                                                        <div
                                                            key={exIdx}
                                                            className="text-xs text-slate-200 font-semibold bg-slate-800/90 px-2 py-1 rounded-lg border border-slate-700 flex items-center gap-1.5"
                                                        >
                                                            <i className="fas fa-check text-amber-400 text-[9px]"></i>
                                                            <span className="truncate" title={exam}>{exam}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Department Override & Technician Selector */}
                                            <div className="pt-2 border-t border-slate-700/60 grid grid-cols-2 gap-1.5">
                                                <div>
                                                    <span className="text-[10px] text-slate-400 font-bold block mb-0.5">القسم:</span>
                                                    <select
                                                        value={item.modality}
                                                        onChange={e => updateIncomingModality(item.id, e.target.value as any)}
                                                        className={`w-full text-[10px] font-black px-2 py-1 rounded-lg border-none cursor-pointer focus:ring-1 focus:ring-amber-400 ${modConf.bg} text-white`}
                                                        title="تغيير قسم الأشعة للحالة قبل التسجيل"
                                                    >
                                                        <option value="X-RAY">XR عادية</option>
                                                        <option value="CT">CT مقطعية</option>
                                                        <option value="MRI">MRI رنين</option>
                                                        <option value="US">US سونار</option>
                                                        <option value="FLUO">FL فلورو</option>
                                                        <option value="MAMMO">MG مامو</option>
                                                    </select>
                                                </div>

                                                <div>
                                                    <span className="text-[10px] text-slate-400 font-bold block mb-0.5">القائم بالفحص:</span>
                                                    <select
                                                        value={item.technicianName || selectedTechnician}
                                                        onChange={e => updateIncomingTech(item.id, e.target.value)}
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-amber-300 font-bold focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
                                                        title="اختر الفني القائم بالفحص"
                                                    >
                                                        {techPresets.map(preset => (
                                                            <option key={preset} value={preset}>{preset}</option>
                                                        ))}
                                                        {item.technicianName && !techPresets.includes(item.technicianName) && (
                                                            <option value={item.technicianName}>{item.technicianName}</option>
                                                        )}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Register Action Button */}
                                        <button
                                            onClick={() => registerPatient({
                                                patientName: item.patientName,
                                                fileNumber: item.fileNumber,
                                                examName: item.examName,
                                                examList: item.examList,
                                                refNo: item.refNo,
                                                doctorName: item.doctorName,
                                                date: item.date,
                                                time: item.time,
                                                modality: item.modality,
                                                technicianName: item.technicianName || selectedTechnician,
                                                age: item.age,
                                                gender: item.gender,
                                                nationality: item.nationality,
                                                isCash: item.isCash,
                                                source: 'CLICK'
                                            })}
                                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg transition-all active:scale-95 cursor-pointer"
                                        >
                                            <i className="fas fa-check-circle text-sm"></i>
                                            <span>تسجيل في سجل الأشعة واستخراج رقم السجل</span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* MODALITY TABS (DEPARTMENT SHEETS) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-5">
                    {Object.keys(MODALITY_CONFIG).map(modKey => {
                        const conf = MODALITY_CONFIG[modKey];
                        const isActive = activeTab === modKey;
                        const count = modalityStats[modKey as keyof typeof modalityStats] || 0;
                        const nextNum = counters[modKey] || 1;

                        return (
                            <div
                                key={modKey}
                                onClick={() => setActiveTab(modKey)}
                                className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between relative overflow-hidden cursor-pointer ${
                                    isActive
                                        ? `${conf.bg} text-white shadow-lg border-transparent scale-[1.02]`
                                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                        {conf.prefix}
                                    </span>
                                    <span className={`text-base font-black ${isActive ? 'text-white' : 'text-slate-800'}`}>
                                        {count}
                                    </span>
                                </div>
                                <div className="font-bold text-xs truncate">
                                    {conf.nameAr}
                                </div>
                                
                                {modKey !== 'ALL' && (
                                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100/20 text-[10px]">
                                        <span className={isActive ? 'text-white/80' : 'text-slate-400 font-medium'}>
                                            القادم: <strong className="font-mono">{conf.prefix}-{String(nextNum).padStart(3, '0')}</strong>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveModalityForCounter(modKey as any);
                                                setIsCounterModalOpen(true);
                                            }}
                                            className={`p-1 rounded transition ${isActive ? 'hover:bg-white/20 text-white' : 'hover:bg-amber-100 text-amber-600'}`}
                                            title={`تغيير رقم بداية التسجيل لـ ${conf.nameAr}`}
                                        >
                                            <i className="fas fa-sliders-h text-[10px]"></i>
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* REGISTERED LOGBOOK TABLE (السجل المعتمد للأقسام) */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Table Header Controls */}
                    <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
                        <div className="flex items-center gap-3">
                            <div className={`w-3.5 h-3.5 rounded-full ${MODALITY_CONFIG[activeTab]?.bg || 'bg-indigo-600'}`}></div>
                            <div>
                                <h2 className="font-black text-slate-800 text-sm">
                                    دفتر سجل: {MODALITY_CONFIG[activeTab]?.nameAr || activeTab} 
                                    <span className="text-xs text-slate-500 font-bold mr-2">({filteredCases.length} حالة مسجلة)</span>
                                </h2>
                            </div>
                        </div>

                        {/* Search, Date & Export/Print Controls */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Department Starting Number Adjust Button */}
                            {activeTab !== 'ALL' && (
                                <button
                                    onClick={() => {
                                        setActiveModalityForCounter(activeTab as any);
                                        setIsCounterModalOpen(true);
                                    }}
                                    className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-xs"
                                    title="تحديد الرقم الذي سيبدأ منه تسجيل الحالات القادمة في هذا القسم"
                                >
                                    <i className="fas fa-list-ol text-amber-600"></i>
                                    <span>رقم البداية القادم:</span>
                                    <span className="font-mono bg-amber-200/80 px-1.5 py-0.2 rounded font-bold">
                                        {MODALITY_CONFIG[activeTab]?.prefix}-{String(counters[activeTab] || 1).padStart(3, '0')}
                                    </span>
                                    <i className="fas fa-edit text-[10px] text-amber-700"></i>
                                </button>
                            )}

                            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                                <i className="fas fa-calendar-alt text-indigo-600 text-xs"></i>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={e => setSelectedDate(e.target.value)}
                                    className="bg-transparent border-none text-xs font-bold text-slate-800 focus:ring-0 cursor-pointer p-0"
                                />
                            </div>

                            <div className="relative w-44">
                                <i className="fas fa-search absolute right-2.5 top-2 text-slate-400 text-xs"></i>
                                <input
                                    type="text"
                                    placeholder="بحث في السجل..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl pr-7 pl-3 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Export to Excel (.xlsx) */}
                            <button
                                onClick={() => exportToExcel(activeTab)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition"
                                title="تصدير ملف إكسل رسمي (.xlsx)"
                            >
                                <i className="fas fa-file-excel text-emerald-100"></i>
                                <span>تصدير إكسل (.xlsx)</span>
                            </button>

                            {/* Print Preview & Print Table */}
                            <button
                                onClick={() => setIsPrintPreviewOpen(true)}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition"
                                title="معاينة وطباعة جدول السجل الرسمي"
                            >
                                <i className="fas fa-print"></i>
                                <span>طباعة السجل</span>
                            </button>
                        </div>
                    </div>

                    {/* Sorting Filter Bar (ترتيب الحالات) */}
                    <div className="px-4 py-2 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-600 flex items-center gap-1">
                                <i className="fas fa-sort-amount-down text-indigo-600"></i>
                                <span>ترتيب السجل حسب:</span>
                            </span>

                            {/* Sort by Time (Default) */}
                            <button
                                onClick={() => {
                                    if (sortField === 'time') {
                                        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                    } else {
                                        setSortField('time');
                                        setSortDirection('asc');
                                    }
                                }}
                                className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 transition ${
                                    sortField === 'time'
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <i className="fas fa-clock"></i>
                                <span>الوقت ({sortField === 'time' ? (sortDirection === 'asc' ? 'الأقدم أولاً ↑' : 'الأحدث أولاً ↓') : 'الوقت'})</span>
                            </button>

                            {/* Sort by Serial */}
                            <button
                                onClick={() => {
                                    if (sortField === 'serialNo') {
                                        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                    } else {
                                        setSortField('serialNo');
                                        setSortDirection('asc');
                                    }
                                }}
                                className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 transition ${
                                    sortField === 'serialNo'
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <i className="fas fa-hashtag"></i>
                                <span>رقم الأشعة ({sortField === 'serialNo' ? (sortDirection === 'asc' ? 'تصاعدي ↑' : 'تنازلي ↓') : 'الرقم'})</span>
                            </button>

                            {/* Sort by Patient Name */}
                            <button
                                onClick={() => {
                                    if (sortField === 'patientName') {
                                        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                    } else {
                                        setSortField('patientName');
                                        setSortDirection('asc');
                                    }
                                }}
                                className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1 transition ${
                                    sortField === 'patientName'
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <i className="fas fa-user"></i>
                                <span>اسم المريض (أ-ي)</span>
                            </button>
                        </div>

                        <div className="text-[11px] text-slate-500 font-bold">
                            💡 انقر على عناوين الأعمدة في الجدول أدناه لعكس الترتيب
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-800 text-white font-bold select-none">
                                    <th className="p-3.5 text-center w-12">#</th>
                                    <th 
                                        onClick={() => {
                                            if (sortField === 'serialNo') setSortDirection(p => p === 'asc' ? 'desc' : 'asc');
                                            else { setSortField('serialNo'); setSortDirection('asc'); }
                                        }}
                                        className="p-3.5 text-center cursor-pointer hover:bg-slate-700 transition"
                                        title="انقر للترتيب برقم الأشعة"
                                    >
                                        <div className="flex items-center justify-center gap-1">
                                            <span>رقم الأشعة التسلسلي</span>
                                            {sortField === 'serialNo' ? (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-amber-400`}></i>
                                            ) : (
                                                <i className="fas fa-sort text-slate-400 text-[10px]"></i>
                                            )}
                                        </div>
                                    </th>
                                    <th className="p-3.5 text-center">القسم</th>
                                    <th 
                                        onClick={() => {
                                            if (sortField === 'fileNumber') setSortDirection(p => p === 'asc' ? 'desc' : 'asc');
                                            else { setSortField('fileNumber'); setSortDirection('asc'); }
                                        }}
                                        className="p-3.5 cursor-pointer hover:bg-slate-700 transition"
                                        title="انقر للترتيب برقم الملف"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>رقم الملف (MRN)</span>
                                            {sortField === 'fileNumber' && (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-amber-400`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th 
                                        onClick={() => {
                                            if (sortField === 'patientName') setSortDirection(p => p === 'asc' ? 'desc' : 'asc');
                                            else { setSortField('patientName'); setSortDirection('asc'); }
                                        }}
                                        className="p-3.5 cursor-pointer hover:bg-slate-700 transition"
                                        title="انقر للترتيب باسم المريض"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>اسم المريض</span>
                                            {sortField === 'patientName' && (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-amber-400`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th className="p-3.5">الفحص المطلوب</th>
                                    <th className="p-3.5">الطبيب المحول</th>
                                    <th 
                                        onClick={() => {
                                            if (sortField === 'time') setSortDirection(p => p === 'asc' ? 'desc' : 'asc');
                                            else { setSortField('time'); setSortDirection('asc'); }
                                        }}
                                        className="p-3.5 text-center cursor-pointer hover:bg-slate-700 transition bg-slate-700/60 select-none"
                                        title={sortField === 'time' ? `الوقت: ${sortDirection === 'asc' ? 'مرتب تصاعدياً من الأقدم للأحدث (انقر للقلب)' : 'مرتب تنازلياً من الأحدث للأقدم (انقر للقلب)'}` : 'انقر للترتيب بوقت الفحص'}
                                    >
                                        <div className="flex items-center justify-center gap-1.5 text-amber-300">
                                            <i className="fas fa-clock text-xs"></i>
                                            <span>الوقت</span>
                                            {sortField === 'time' ? (
                                                <span className="inline-flex items-center text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">
                                                    {sortDirection === 'asc' ? '↑ أقدم' : '↓ أحدث'}
                                                </span>
                                            ) : (
                                                <i className="fas fa-sort text-slate-400 text-[10px]"></i>
                                            )}
                                        </div>
                                    </th>
                                    <th className="p-3.5 text-center">القائم بالفحص (الفني)</th>
                                    <th className="p-3.5 text-center w-14">إجراء</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                                {filteredCases.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="text-center py-16 text-slate-400">
                                            <div className="w-14 h-14 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-2 text-xl">
                                                <i className="fas fa-book-open"></i>
                                            </div>
                                            <p className="font-bold text-slate-600">لا توجد حالات مسجلة في هذا القسم لتاريخ {selectedDate || 'المحدد'}</p>
                                            <p className="text-xs text-slate-400 mt-1">عند وصول ورقة المريض، اضغط على زر التسجيل في قائمة الوارد أعلاه ليأخذ رقمه فوراً</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredCases.map((item, index) => {
                                        const modConf = MODALITY_CONFIG[item.modality] || MODALITY_CONFIG['X-RAY'];
                                        const isVacant = item.isEmptySlot;

                                        return (
                                            <tr key={item.id} className={`transition-colors ${isVacant ? 'bg-amber-50/40 hover:bg-amber-50/80 border-l-4 border-l-amber-500' : 'hover:bg-slate-50/80'}`}>
                                                <td className="p-3 text-center text-slate-400 font-bold font-mono">
                                                    {index + 1}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <input
                                                        type="text"
                                                        value={item.modalitySerial || ''}
                                                        placeholder={txt('فارغ', 'Empty')}
                                                        onChange={e => updateCaseSerial(item.id, e.target.value)}
                                                        className={`w-24 text-center px-2 py-1 rounded-lg font-black font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none transition shadow-xs ${
                                                            isVacant
                                                                ? 'bg-amber-100 text-amber-900 border-2 border-amber-400 hover:bg-white'
                                                                : 'bg-indigo-50/90 hover:bg-white text-indigo-700 border border-indigo-200'
                                                        }`}
                                                        title={txt('انقر لتعديل رقم الأشعة فوراً أو تركه فارغاً', 'Click to edit X-Ray serial or leave blank')}
                                                    />
                                                </td>
                                                {/* Modality Selector per Row */}
                                                <td className="p-3 text-center">
                                                    <select
                                                        value={item.modality}
                                                        onChange={e => updateCaseModality(item.id, e.target.value as any)}
                                                        className={`text-[10px] font-bold px-2 py-0.5 rounded border-none cursor-pointer ${modConf.bg} text-white focus:ring-1 focus:ring-indigo-500`}
                                                        title={txt('انقر لتغيير قسم الحالة ونقلها تلقائياً', 'Click to change modality')}
                                                    >
                                                        <option value="X-RAY">XR أشعة عادية</option>
                                                        <option value="CT">CT مقطعية</option>
                                                        <option value="MRI">MRI رنين</option>
                                                        <option value="US">US سونار</option>
                                                        <option value="FLUO">FL فلورو</option>
                                                        <option value="MAMMO">MG مامو</option>
                                                    </select>
                                                </td>
                                                <td className="p-3">
                                                    {isVacant ? (
                                                        <span className="text-slate-400 italic text-[11px]">---</span>
                                                    ) : (
                                                        <>
                                                            <div className="font-mono font-bold text-slate-800">{item.fileNumber || '-'}</div>
                                                            {item.refNo && (
                                                                <div className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 inline-block mt-0.5">
                                                                    {txt('فاتورة:', 'Invoice:')} {item.refNo}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                                <td className="p-3 font-bold text-slate-900">
                                                    {isVacant ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="bg-amber-100 text-amber-900 border border-amber-300/80 px-2.5 py-1 rounded-xl text-xs font-black inline-flex items-center gap-1.5 shadow-2xs">
                                                                <i className="fas fa-inbox text-amber-600"></i>
                                                                <span>{item.patientName || txt('[ خانة شاغرة - جاهزة للتسجيل ]', '[ Vacant Slot - Ready to Fill ]')}</span>
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div>{item.patientName}</div>
                                                            {(item.age || item.gender) && (
                                                                <div className="text-[10px] text-slate-500 font-normal flex items-center gap-1 mt-0.5">
                                                                    {item.age && <span>{item.age} {txt('سنة', 'yrs')}</span>}
                                                                    {item.gender && <span>• {item.gender === 'female' ? txt('أنثى', 'Female') : txt('ذكر', 'Male')}</span>}
                                                                    {item.isCash !== undefined && <span>• {item.isCash ? txt('كاش', 'Cash') : txt('تأمين', 'Insurance')}</span>}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                                <td className="p-3 max-w-sm">
                                                    {isVacant ? (
                                                        <span className="text-slate-400 italic text-[11px]">{txt('جاهزة لمريض جديد', 'Ready for new patient')}</span>
                                                    ) : item.examList && item.examList.length > 1 ? (
                                                        <div className="flex flex-col gap-1">
                                                            <div className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                                                                <i className="fas fa-layer-group text-[9px]"></i>
                                                                <span>{txt('فحوصات مجمعة', 'Grouped Exams')} ({item.examList.length}):</span>
                                                            </div>
                                                            {item.examList.map((exam, exIdx) => (
                                                                <div key={exIdx} className="text-xs font-semibold text-slate-800 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1.5">
                                                                    <i className="fas fa-check text-emerald-600 text-[9px]"></i>
                                                                    <span title={exam}>{exam}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="font-semibold text-slate-800 text-xs" title={item.examName}>
                                                            {item.examName}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 text-slate-600 text-[11px]">
                                                    {isVacant ? '---' : (item.doctorName || '-')}
                                                </td>
                                                <td className="p-3 text-center font-mono text-slate-500 font-bold">
                                                    {isVacant ? '---' : (item.time || '---')}
                                                </td>
                                                
                                                {/* TECHNICIAN DROPDOWN IN TABLE CELL */}
                                                <td className="p-3 text-center">
                                                    {isVacant ? (
                                                        <span className="text-slate-400 italic text-[11px]">---</span>
                                                    ) : (
                                                        <div className="flex items-center justify-center gap-1">
                                                            <select
                                                                value={item.technicianName || selectedTechnician}
                                                                onChange={e => updateCaseTechnician(item.id, e.target.value)}
                                                                className="bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-400 text-slate-800 rounded-lg px-2 py-1 text-xs font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500 transition max-w-[130px]"
                                                                title={txt('اختر القائم بالفحص من قائمة الموظفين', 'Select technician')}
                                                            >
                                                                {techPresets.map(preset => (
                                                                    <option key={preset} value={preset}>{preset}</option>
                                                                ))}
                                                                {item.technicianName && !techPresets.includes(item.technicianName) && (
                                                                    <option value={item.technicianName}>{item.technicianName}</option>
                                                                )}
                                                            </select>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Actions: Fill Vacant Slot or Return to Queue, Edit, Delete */}
                                                <td className="p-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {isVacant ? (
                                                            <button
                                                                onClick={() => {
                                                                    setSlotToFill(item);
                                                                    setFillSlotManualName('');
                                                                    setFillSlotManualMRN('');
                                                                    setFillSlotManualExam('');
                                                                    setFillSlotManualDoctor('');
                                                                    setFillSlotManualTech(selectedTechnician);
                                                                    setIsFillSlotModalOpen(true);
                                                                }}
                                                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                                                                title={txt('تعبئة بيانات مريض في هذه الخانة الشاغرة', 'Fill vacant slot with patient')}
                                                            >
                                                                <i className="fas fa-user-plus text-xs"></i>
                                                                <span className="text-[11px] font-bold">{txt('تعبئة الخانة', 'Fill Slot')}</span>
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleReturnToQueue(item)}
                                                                className="text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition text-xs font-bold flex items-center gap-1 border border-amber-200/80 shadow-2xs cursor-pointer"
                                                                title={txt('إعادة هذه الحالة إلى طابور الانتظار وتفريغ الرقم', 'Return to waiting queue & vacate slot')}
                                                            >
                                                                <i className="fas fa-undo text-[11px]"></i>
                                                                <span className="hidden xl:inline text-[11px]">{txt('إعادة للانتظار', 'Return')}</span>
                                                            </button>
                                                        )}

                                                        {!isVacant && (
                                                            <button
                                                                onClick={() => {
                                                                    setEditingCase({ ...item });
                                                                    setIsCustomEditTech(false);
                                                                    setIsEditCaseModalOpen(true);
                                                                }}
                                                                className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 p-1.5 rounded-lg transition border border-indigo-200/80 cursor-pointer"
                                                                title={txt('تعديل بيانات الحالة واختيار القائم بالفحص', 'Edit case details')}
                                                            >
                                                                <i className="fas fa-edit text-xs"></i>
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => handleDeleteCase(item)}
                                                            className="text-slate-400 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 p-1.5 rounded-lg transition border border-slate-200 cursor-pointer"
                                                            title={isVacant ? txt('حذف الخانة الشاغرة نهائياً', 'Remove vacant slot') : txt('حذف من السجل', 'Delete from logbook')}
                                                        >
                                                            <i className="fas fa-trash-alt text-xs"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* BACKUP & RESTORE LOCAL DATA FOOTER */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 text-xs">
                    <div className="flex items-center gap-2 text-slate-600">
                        <i className="fas fa-shield-alt text-emerald-600 text-base"></i>
                        <span>البيانات محفوظة في متصفحك محلياً بشكل دائم بدون إنترنت أو فايربيز.</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleBackupJSON}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5"
                        >
                            <i className="fas fa-download text-indigo-600"></i>
                            <span>تنزيل نسخة احتياطية (JSON)</span>
                        </button>
                        <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer">
                            <i className="fas fa-upload text-emerald-600"></i>
                            <span>استعادة نسخة</span>
                            <input type="file" accept=".json" onChange={handleRestoreJSON} className="hidden" />
                        </label>
                    </div>
                </div>
            </div>

            {/* MODAL: BRIDGE SETUP & DIRECT CLICK INSTRUCTIONS */}
            {isBridgeInfoOpen && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full p-6 border border-slate-200">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                                <i className="fas fa-satellite-dish text-indigo-600"></i> ربط الـ IHMS والتقاط النقر المباشر
                            </h3>
                            <button onClick={() => setIsBridgeInfoOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
                            <div className="bg-emerald-50 text-emerald-900 border border-emerald-200 p-3 rounded-2xl">
                                <p className="font-bold mb-1">🎯 تم تحديث سكريبت الإضافة ليدعم:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li><strong>التمييز الذكي لكافة الأقسام (CT, MRI, US, FLUO, MAMMO, X-RAY)</strong> دون دمجها في الأشعة العادية.</li>
                                    <li><strong>التقاط النقر على صف المريض في الـ IHMS فوراً</strong> مع إضاءة خضراء تفاعلية على الصف في شاشة المستشفى.</li>
                                    <li><strong>استقبال الحالات عبر كافة القنوات المباشرة</strong> بدون الحاجة لإنترنت.</li>
                                </ul>
                            </div>

                            <div>
                                <label className="block font-black text-slate-800 mb-1.5">طريقة التحديث بخطوة واحدة:</label>
                                <p>قم بتحميل سكريبت الإضافة الجديد بالأسفل واستبدل ملف <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold">smart-bridge.js</code> في مجلد الإضافة بمتصفحك ثم أعد تحميل صفحة الـ IHMS.</p>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => {
                                        const currentOrigin = window.location.href.split('#')[0];
                                        const targetUrl = `${currentOrigin}#/radiology-logbook`;
                                        const scriptContent = `/* 🚀 IHMS DIRECT CLICK RADIOLOGY BRIDGE V3.5 (MULTI-MODALITY & INSTANT ROW CLICK) */
(function() {
    if (window.IHMS_RAD_BRIDGE_V35_ACTIVE) return;
    window.IHMS_RAD_BRIDGE_V35_ACTIVE = true;

    const APP_URL = "${targetUrl}";
    let syncWin = null;

    function getSyncWindow() {
        if (!syncWin || syncWin.closed) {
            try {
                syncWin = window.open(APP_URL, "RadiologyLogbookWin");
            } catch (e) {}
        }
        return syncWin;
    }

    function sendToLogbook(data, isClick = false) {
        const win = getSyncWindow();
        if (win && !win.closed) {
            try {
                win.postMessage({ type: 'SMART_SYNC_DATA', payload: data, action: isClick ? 'PATIENT_CLICKED' : 'LIST_UPDATE', isClick }, '*');
            } catch (e) {}
        }
        try {
            const bc = new BroadcastChannel('smart_bridge_channel');
            bc.postMessage({ type: 'SMART_SYNC_DATA', payload: data, action: isClick ? 'PATIENT_CLICKED' : 'LIST_UPDATE', isClick });
        } catch (e) {}

        try {
            localStorage.setItem('aj_smart_bridge_live_event', JSON.stringify({
                type: 'SMART_SYNC_DATA',
                payload: data,
                action: isClick ? 'PATIENT_CLICKED' : 'LIST_UPDATE',
                isClick: isClick,
                time: Date.now()
            }));
        } catch (e) {}
    }

    // Capture XHR / AJAX
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            try {
                if (this.getResponseHeader("content-type")?.includes("application/json")) {
                    const json = JSON.parse(this.responseText);
                    let payload = json.d || json.result || json.data || json;
                    if (!Array.isArray(payload)) payload = [payload];
                    if (payload[0]?.patientName || payload[0]?.fileNumber || payload[0]?.mrn) {
                        sendToLogbook(payload, false);
                    }
                }
            } catch (e) {}
        });
        return originalSend.apply(this, arguments);
    };

    // Capture Direct Clicks on Any Table Rows, TD, or Clickable Items in IHMS
    document.addEventListener('click', function(e) {
        const row = e.target.closest('tr') || e.target.closest('[role="row"]') || e.target.closest('.k-grid-row') || e.target.closest('.dx-data-row');
        if (row) {
            const text = row.innerText;
            const mrnMatch = text.match(/\\b\\d{3,9}\\b/);
            if (mrnMatch) {
                const fNum = mrnMatch[0];
                const cells = Array.from(row.querySelectorAll('td, th, .k-grid-cell, [role="gridcell"]')).map(td => (td.innerText || '').trim());
                
                // Visual feedback in IHMS: Green flash on clicked row
                try {
                    const prevBorder = row.style.border;
                    row.style.outline = '2px solid #10b981';
                    row.style.transition = 'all 0.3s ease';
                    setTimeout(() => { row.style.outline = ''; }, 1200);
                } catch (e) {}

                const patientData = {
                    fileNumber: fNum,
                    patientName: cells[1] || cells[2] || 'مريض IHMS',
                    examName: cells[3] || cells[4] || cells[2] || 'فحص أشعة',
                    doctorName: cells[5] || cells[4] || 'العيادة',
                    time: new Date().toTimeString().substring(0, 5),
                    date: new Date().toISOString().split('T')[0]
                };
                sendToLogbook(patientData, true);
            }
        }
    }, true);
})();`;
                                        const blob = new Blob([scriptContent], { type: 'text/javascript' });
                                        const a = document.createElement('a');
                                        a.href = URL.createObjectURL(blob);
                                        a.download = 'smart-bridge.js';
                                        a.click();
                                        showToast('تم تحميل سكريبت الإضافة المحدث (smart-bridge.js)', 'success');
                                    }}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs shadow transition flex items-center justify-center gap-1.5"
                                >
                                    <i className="fas fa-download"></i>
                                    <span>تحميل سكريبت الإضافة المحدث (smart-bridge.js)</span>
                                </button>
                                <button
                                    onClick={() => setIsBridgeInfoOpen(false)}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs transition"
                                >
                                    إغلاق
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: EDIT CASE & TECHNICIAN ASSIGNMENT (تعديل بيانات الحالة واختيار القائم بالفحص) */}
            {isEditCaseModalOpen && editingCase && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-base shadow-sm">
                                    <i className="fas fa-edit"></i>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-black text-slate-900">تعديل بيانات الحالة</h3>
                                        <span className="font-mono text-xs font-black bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-lg border border-indigo-200">
                                            {editingCase.modalitySerial}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-medium">تعديل تفاصيل الفحص وتعيين الموظف / الفني القائم بالفحص</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setIsEditCaseModalOpen(false);
                                    setEditingCase(null);
                                }}
                                className="text-slate-400 hover:text-slate-600 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSaveEditCase} className="space-y-3.5">
                            {/* Patient Name & X-Ray Code */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        {txt('اسم المريض', 'Patient Name')}
                                    </label>
                                    <input
                                        type="text"
                                        value={editingCase.patientName}
                                        onChange={e => setEditingCase({ ...editingCase, patientName: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-indigo-700 mb-1">
                                        {txt('رقم الأشعة (الكود)', 'X-Ray Serial / Code')}
                                    </label>
                                    <input
                                        type="text"
                                        placeholder={txt('فارغ', 'Empty')}
                                        value={editingCase.modalitySerial || ''}
                                        onChange={e => setEditingCase({ ...editingCase, modalitySerial: e.target.value })}
                                        className="w-full bg-indigo-50/80 border-2 border-indigo-400 rounded-xl px-3 py-2 text-xs font-mono font-black text-indigo-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs"
                                    />
                                </div>
                            </div>

                            {/* MRN & Modality */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">رقم الملف (MRN)</label>
                                    <input
                                        type="text"
                                        value={editingCase.fileNumber}
                                        onChange={e => setEditingCase({ ...editingCase, fileNumber: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">القسم (Modality)</label>
                                    <select
                                        value={editingCase.modality}
                                        onChange={e => {
                                            const newMod = e.target.value as any;
                                            const prefix = MODALITY_CONFIG[newMod]?.prefix || newMod;
                                            const serialDigits = String(editingCase.serialNo || 1).padStart(3, '0');
                                            setEditingCase({
                                                ...editingCase,
                                                modality: newMod,
                                                modalitySerial: `${prefix}-${serialDigits}`
                                            });
                                        }}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                                    >
                                        <option value="X-RAY">أشعة عادية (X-Ray)</option>
                                        <option value="CT">أشعة مقطعية (CT)</option>
                                        <option value="MRI">رنين مغناطيسي (MRI)</option>
                                        <option value="US">موجات صوتية / سونار (US)</option>
                                        <option value="FLUO">فلوروسكوبي وصبغة (Fluoroscopy)</option>
                                        <option value="MAMMO">ماموجرام (Mammography)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Exam Name */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الفحص المطلوب</label>
                                <input
                                    type="text"
                                    value={editingCase.examName}
                                    onChange={e => setEditingCase({ ...editingCase, examName: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                            </div>

                            {/* TECHNICIAN DROPDOWN & SELECTION (قائمة منسدلة بالموظفين) */}
                            <div className="bg-gradient-to-br from-amber-50/70 to-indigo-50/50 p-3.5 rounded-2xl border border-amber-200/80">
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                        <i className="fas fa-user-check text-amber-600 text-sm"></i>
                                        <span>القائم بالفحص (اختر الموظف / الفني):</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setIsCustomEditTech(!isCustomEditTech)}
                                        className="text-[11px] text-indigo-700 hover:text-indigo-900 font-bold underline"
                                    >
                                        {isCustomEditTech ? 'الرجوع للقائمة المنسدلة' : 'كتابة اسم يدوي'}
                                    </button>
                                </div>

                                {isCustomEditTech ? (
                                    <input
                                        type="text"
                                        placeholder="اكتب اسم الموظف..."
                                        value={editingCase.technicianName || ''}
                                        onChange={e => setEditingCase({ ...editingCase, technicianName: e.target.value })}
                                        className="w-full bg-white border-2 border-indigo-400 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none shadow-xs"
                                        autoFocus
                                    />
                                ) : (
                                    <select
                                        value={editingCase.technicianName || selectedTechnician}
                                        onChange={e => setEditingCase({ ...editingCase, technicianName: e.target.value })}
                                        className="w-full bg-white border-2 border-amber-400 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
                                    >
                                        {techPresets.map(preset => (
                                            <option key={preset} value={preset}>{preset}</option>
                                        ))}
                                        {editingCase.technicianName && !techPresets.includes(editingCase.technicianName) && (
                                            <option value={editingCase.technicianName}>{editingCase.technicianName}</option>
                                        )}
                                    </select>
                                )}

                                {/* Quick Selection Chips */}
                                <div className="mt-2.5 pt-2 border-t border-amber-200/50">
                                    <span className="text-[10px] font-bold text-slate-500 block mb-1">اختيار سريع بنقرة واحدة:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {techPresets.map(preset => {
                                            const isSelected = (editingCase.technicianName || selectedTechnician) === preset;
                                            return (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingCase({ ...editingCase, technicianName: preset });
                                                        setIsCustomEditTech(false);
                                                    }}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                                                        isSelected
                                                            ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs scale-105 font-black'
                                                            : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-100 hover:border-amber-300'
                                                    }`}
                                                >
                                                    {preset}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Doctor & Time */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">الطبيب المحول</label>
                                    <input
                                        type="text"
                                        value={editingCase.doctorName || ''}
                                        onChange={e => setEditingCase({ ...editingCase, doctorName: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">الوقت</label>
                                    <input
                                        type="time"
                                        value={editingCase.time || ''}
                                        onChange={e => setEditingCase({ ...editingCase, time: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-3 border-t border-slate-100">
                                <button
                                    type="submit"
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-2.5 rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-1.5"
                                >
                                    <i className="fas fa-check"></i>
                                    <span>حفظ تعديلات الحالة</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsEditCaseModalOpen(false);
                                        setEditingCase(null);
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs transition"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: MANUAL ENTRY */}
            {isManualModalOpen && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                                <i className="fas fa-user-plus text-indigo-600"></i> تسجيل حالة يدوياً بالدفتر
                            </h3>
                            <button onClick={() => setIsManualModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={e => {
                            e.preventDefault();
                            if (!manualForm.patientName && !manualForm.fileNumber) return showToast('يرجى إدخال اسم المريض أو رقم الملف', 'error');
                            registerPatient({
                                patientName: manualForm.patientName || `مريض ملف (${manualForm.fileNumber})`,
                                fileNumber: manualForm.fileNumber,
                                examName: manualForm.examName || 'فحص أشعة',
                                modality: manualForm.modality,
                                doctorName: manualForm.doctorName,
                                technicianName: manualForm.technicianName || selectedTechnician,
                                notes: manualForm.notes,
                                time: manualForm.time || getCurrentTime(),
                                source: 'MANUAL'
                            });
                            setIsManualModalOpen(false);
                        }} className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">اسم المريض</label>
                                <input
                                    type="text"
                                    placeholder="مثال: محمد أحمد علي"
                                    value={manualForm.patientName}
                                    onChange={e => setManualForm({ ...manualForm, patientName: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">رقم الملف (MRN)</label>
                                    <input
                                        type="text"
                                        placeholder="مثال: 45892"
                                        value={manualForm.fileNumber}
                                        onChange={e => setManualForm({ ...manualForm, fileNumber: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">القسم (Modality)</label>
                                    <select
                                        value={manualForm.modality}
                                        onChange={e => setManualForm({ ...manualForm, modality: e.target.value as any })}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    >
                                        <option value="X-RAY">أشعة عادية (X-Ray)</option>
                                        <option value="CT">أشعة مقطعية (CT)</option>
                                        <option value="MRI">رنين مغناطيسي (MRI)</option>
                                        <option value="US">موجات صوتية / سونار (US)</option>
                                        <option value="FLUO">فلوروسكوبي وصبغة (Fluoroscopy)</option>
                                        <option value="MAMMO">ماموجرام (Mammography)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">اسم الفحص</label>
                                <input
                                    type="text"
                                    placeholder="مثال: Chest PA / CT Brain with Contrast"
                                    value={manualForm.examName}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setManualForm({ ...manualForm, examName: val, modality: detectModality(val) as any });
                                    }}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                            </div>

                            {/* Technician Input Field (قائمة منسدلة وسريعة) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">
                                    <i className="fas fa-user-tag text-indigo-600 ml-1"></i>
                                    القائم بالفحص (اختر الموظف / الفني)
                                </label>
                                <select
                                    value={manualForm.technicianName || selectedTechnician}
                                    onChange={e => setManualForm({ ...manualForm, technicianName: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer mb-1.5"
                                >
                                    {techPresets.map(preset => (
                                        <option key={preset} value={preset}>{preset}</option>
                                    ))}
                                    {manualForm.technicianName && !techPresets.includes(manualForm.technicianName) && (
                                        <option value={manualForm.technicianName}>{manualForm.technicianName}</option>
                                    )}
                                </select>
                                <div className="flex flex-wrap gap-1">
                                    {techPresets.map(preset => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setManualForm({ ...manualForm, technicianName: preset })}
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                                                (manualForm.technicianName || selectedTechnician) === preset
                                                    ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">الطبيب المحول</label>
                                    <input
                                        type="text"
                                        placeholder="د. العيادة الخارجية"
                                        value={manualForm.doctorName}
                                        onChange={e => setManualForm({ ...manualForm, doctorName: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">الوقت</label>
                                    <input
                                        type="time"
                                        value={manualForm.time}
                                        onChange={e => setManualForm({ ...manualForm, time: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2 pt-3">
                                <button
                                    type="submit"
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg transition"
                                >
                                    حفظ وتوليد رقم الأشعة
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsManualModalOpen(false)}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs transition"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: SETTINGS & COUNTERS & TECHNICIANS */}
            {isSettingsOpen && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                                <i className="fas fa-sliders-h text-indigo-600"></i> إعدادات العدادات والفنيين
                            </h3>
                            <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">اسم الفني الافتراضي (القائم بالتسجيل)</label>
                                <input
                                    type="text"
                                    value={selectedTechnician}
                                    onChange={e => setSelectedTechnician(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">قائمة أسماء الفنيين السريعة (افصل بفاصلة)</label>
                                <input
                                    type="text"
                                    value={techPresets.join(', ')}
                                    onChange={e => setTechPresets(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                            </div>

                            <div className="border-t border-slate-100 pt-3">
                                <h4 className="text-xs font-black text-slate-700 mb-2">بداية ترقيم العداد الحالي لكل قسم:</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['X-RAY', 'CT', 'MRI', 'US', 'FLUO', 'MAMMO'] as const).map(mod => (
                                        <div key={mod} className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between">
                                            <span className="text-xs font-bold text-slate-700">{MODALITY_CONFIG[mod]?.prefix}:</span>
                                            <input
                                                type="number"
                                                min="1"
                                                value={counters[mod] || 1}
                                                onChange={e => {
                                                    const val = parseInt(e.target.value) || 1;
                                                    setCounters({ ...counters, [mod]: val });
                                                }}
                                                className="w-20 bg-white border border-slate-300 rounded-lg text-center font-mono font-bold text-xs py-1 focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-3">
                                <button
                                    onClick={() => {
                                        setIsSettingsOpen(false);
                                        showToast('تم حفظ إعدادات العدادات والفنيين بنجاح', 'success');
                                    }}
                                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg transition"
                                >
                                    إغلاق وحفظ الإعدادات
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: STARTING SERIAL NUMBER CONTROLLER (تحديد رقم البداية والتسلسل) */}
            {isCounterModalOpen && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-base shadow-sm">
                                    <i className="fas fa-list-ol"></i>
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900">
                                        تحديد رقم بداية التسجيل
                                    </h3>
                                    <p className="text-[11px] text-slate-500 font-medium">حدد الرقم التسلسلي الذي سيبدأ من عنده تسجيل المرضى القادمين</p>
                                </div>
                            </div>
                            <button onClick={() => setIsCounterModalOpen(false)} className="text-slate-400 hover:text-slate-600 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Modality Tabs Selector Inside Modal */}
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">اختر القسم المراد تعديل بداية رقمه:</label>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 bg-slate-100 p-1 rounded-2xl">
                                {(['X-RAY', 'CT', 'MRI', 'US', 'FLUO', 'MAMMO'] as const).map(mod => {
                                    const isCurrent = activeModalityForCounter === mod;
                                    const conf = MODALITY_CONFIG[mod];
                                    return (
                                        <button
                                            key={mod}
                                            type="button"
                                            onClick={() => setActiveModalityForCounter(mod)}
                                            className={`py-1.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                                                isCurrent
                                                    ? `${conf.bg} text-white shadow-sm font-black`
                                                    : 'text-slate-700 hover:bg-white/60'
                                            }`}
                                        >
                                            <span>{conf.prefix}</span>
                                            <span className="text-[10px] opacity-80">{conf.nameAr.split(' ')[0]}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Selected Modality Active Counter Editor */}
                        <div className="bg-gradient-to-br from-slate-50 to-indigo-50/40 p-4 rounded-2xl border border-indigo-100 mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                    <span className={`w-2.5 h-2.5 rounded-full ${MODALITY_CONFIG[activeModalityForCounter]?.bg || 'bg-indigo-600'}`}></span>
                                    قسم {MODALITY_CONFIG[activeModalityForCounter]?.nameAr}:
                                </span>
                                <span className="text-xs text-indigo-700 font-bold bg-indigo-100/70 px-2 py-0.5 rounded-md">
                                    معاينة الرقم: <strong className="font-mono">{MODALITY_CONFIG[activeModalityForCounter]?.prefix}-{String(counters[activeModalityForCounter] || 1).padStart(3, '0')}</strong>
                                </span>
                            </div>

                            <div className="flex items-center gap-2 mb-3">
                                <button
                                    type="button"
                                    onClick={() => setModalityStartingNumber(activeModalityForCounter, Math.max(1, (counters[activeModalityForCounter] || 1) - 1))}
                                    className="w-10 h-10 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl font-black text-base text-slate-700 flex items-center justify-center shadow-xs"
                                    title="إنقاص 1"
                                >
                                    -
                                </button>
                                <input
                                    type="number"
                                    min="1"
                                    value={counters[activeModalityForCounter] || 1}
                                    onChange={e => {
                                        const val = parseInt(e.target.value) || 1;
                                        setCounters(prev => ({ ...prev, [activeModalityForCounter]: val }));
                                    }}
                                    className="flex-1 bg-white border-2 border-indigo-400 rounded-xl py-2 text-center font-mono font-black text-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-inner"
                                />
                                <button
                                    type="button"
                                    onClick={() => setModalityStartingNumber(activeModalityForCounter, (counters[activeModalityForCounter] || 1) + 1)}
                                    className="w-10 h-10 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl font-black text-base text-slate-700 flex items-center justify-center shadow-xs"
                                    title="زيادة 1"
                                >
                                    +
                                </button>
                            </div>

                            {/* Quick Presets for Current Modality */}
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="text-[11px] font-bold text-slate-500">أرقام سريعة:</span>
                                {[1, 50, 100, 200, 500].map(presetNum => (
                                    <button
                                        key={presetNum}
                                        type="button"
                                        onClick={() => setModalityStartingNumber(activeModalityForCounter, presetNum)}
                                        className={`px-2.5 py-1 rounded-lg border font-mono font-bold text-xs transition ${
                                            counters[activeModalityForCounter] === presetNum
                                                ? 'bg-amber-500 text-slate-950 border-amber-600'
                                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        ابدأ من {presetNum}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Summary of all modalities starting numbers */}
                        <div className="border-t border-slate-100 pt-3 mb-4">
                            <label className="block text-xs font-black text-slate-700 mb-2">أرقام البداية الحالية لكافة الأقسام:</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {(['X-RAY', 'CT', 'MRI', 'US', 'FLUO', 'MAMMO'] as const).map(mod => {
                                    const conf = MODALITY_CONFIG[mod];
                                    return (
                                        <div key={mod} className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-slate-700">{conf.prefix}:</span>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={counters[mod] || 1}
                                                    onChange={e => {
                                                        const val = parseInt(e.target.value) || 1;
                                                        setCounters(prev => ({ ...prev, [mod]: val }));
                                                    }}
                                                    className="w-14 bg-white border border-slate-300 rounded-lg text-center font-mono font-bold text-xs py-0.5 focus:ring-1 focus:ring-indigo-500"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setModalityStartingNumber(mod, 1)}
                                                    className="text-[10px] text-slate-400 hover:text-rose-600 p-0.5"
                                                    title="إعادة لـ 1"
                                                >
                                                    <i className="fas fa-undo"></i>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Reset All & Confirm Buttons */}
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => {
                                    if (confirm('هل تريد تصفير بداية التسجيل لكافة الأقسام لتبدأ من رقم 1؟')) {
                                        setCounters({
                                            'X-RAY': 1,
                                            'CT': 1,
                                            'MRI': 1,
                                            'US': 1,
                                            'FLUO': 1,
                                            'MAMMO': 1,
                                            'OTHER': 1
                                        });
                                        showToast('تم تصفير كافة العدادات لتبدأ من رقم 1', 'info');
                                    }
                                }}
                                className="bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 font-bold px-3 py-2 rounded-xl text-xs transition flex items-center gap-1.5"
                            >
                                <i className="fas fa-redo-alt"></i>
                                <span>تصفير الكل لـ 1</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setIsCounterModalOpen(false);
                                    showToast('تم اعتماد رقم بداية التسجيل بنجاح', 'success');
                                }}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-2.5 rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-1.5"
                            >
                                <i className="fas fa-check"></i>
                                <span>حفظ واعتماد رقم البداية</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: EXPORT CHOICES */}
            {isExportModalOpen && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                                <i className="fas fa-file-excel text-emerald-600"></i> تصدير ملفات إكسل للأقسام
                            </h3>
                            <button onClick={() => setIsExportModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="space-y-2.5">
                            <p className="text-xs text-slate-500 mb-3">اختر القسم الذي ترغب في استخراج شيت إكسل منفصل له لتاريخ ({selectedDate || 'كافة الأيام'}):</p>
                            
                            <button
                                onClick={() => { exportToExcel('X-RAY'); setIsExportModalOpen(false); }}
                                className="w-full text-right p-3 rounded-xl border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition flex items-center justify-between font-bold text-xs"
                            >
                                <span className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700"></span>
                                    ملف إكسل: قسم الأشعة العادية (X-Ray)
                                </span>
                                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">{modalityStats['X-RAY']} حالة</span>
                            </button>

                            <button
                                onClick={() => { exportToExcel('CT'); setIsExportModalOpen(false); }}
                                className="w-full text-right p-3 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition flex items-center justify-between font-bold text-xs"
                            >
                                <span className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                                    ملف إكسل: قسم الأشعة المقطعية (CT Scan)
                                </span>
                                <span className="font-mono bg-emerald-100 px-2 py-0.5 rounded text-emerald-800">{modalityStats['CT']} حالة</span>
                            </button>

                            <button
                                onClick={() => { exportToExcel('MRI'); setIsExportModalOpen(false); }}
                                className="w-full text-right p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition flex items-center justify-between font-bold text-xs"
                            >
                                <span className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                                    ملف إكسل: قسم الرنين المغناطيسي (MRI)
                                </span>
                                <span className="font-mono bg-blue-100 px-2 py-0.5 rounded text-blue-800">{modalityStats['MRI']} حالة</span>
                            </button>

                            <button
                                onClick={() => { exportToExcel('US'); setIsExportModalOpen(false); }}
                                className="w-full text-right p-3 rounded-xl border border-slate-200 hover:border-teal-400 hover:bg-teal-50 transition flex items-center justify-between font-bold text-xs"
                            >
                                <span className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-teal-600"></span>
                                    ملف إكسل: قسم السونار والموجات الصوتية (US)
                                </span>
                                <span className="font-mono bg-teal-100 px-2 py-0.5 rounded text-teal-800">{modalityStats['US']} حالة</span>
                            </button>

                            <button
                                onClick={() => { exportToExcel('FLUO'); setIsExportModalOpen(false); }}
                                className="w-full text-right p-3 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50 transition flex items-center justify-between font-bold text-xs"
                            >
                                <span className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                                    ملف إكسل: قسم الفلوروسكوبي والصبغة (FLUO)
                                </span>
                                <span className="font-mono bg-amber-100 px-2 py-0.5 rounded text-amber-900">{modalityStats['FLUO']} حالة</span>
                            </button>

                            {/* Master Multi-Sheet Workbook (.xlsx) */}
                            <button
                                onClick={() => { exportMultiSheetExcelWorkbook(); setIsExportModalOpen(false); }}
                                className="w-full text-right p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-950 font-black text-xs hover:bg-emerald-100 transition flex items-center justify-between shadow-xs"
                            >
                                <span className="flex items-center gap-2">
                                    <i className="fas fa-file-excel text-emerald-600 text-sm"></i>
                                    <span>تحميل مصنف إكسل كامل (.xlsx) يحتوي كافة الأقسام في شيتات منفصلة</span>
                                </span>
                                <span className="font-mono bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">.XLSX</span>
                            </button>

                            <button
                                onClick={() => { exportToExcel('ALL'); setIsExportModalOpen(false); }}
                                className="w-full text-right p-3 rounded-xl border-2 border-indigo-500 bg-indigo-50 text-indigo-900 font-black text-xs hover:bg-indigo-100 transition flex items-center justify-between"
                            >
                                <span className="flex items-center gap-2">
                                    <i className="fas fa-layer-group text-indigo-600"></i>
                                    تصدير شيت شامل لكافة الأقسام معاً (.xlsx)
                                </span>
                                <span className="font-mono bg-indigo-200 px-2 py-0.5 rounded">{modalityStats['ALL']} حالة</span>
                            </button>

                            <div className="pt-2">
                                <button
                                    onClick={() => { exportAllDepartmentsZip(); setIsExportModalOpen(false); }}
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2"
                                >
                                    <i className="fas fa-file-archive text-amber-400"></i>
                                    <span>تحميل ملفات منفصلة (.xlsx) لكل قسم دفعة واحدة</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: TECHNICIAN & EMPLOYEE MANAGER (إدارة وتعديل أسماء الموظفين) */}
            {isTechManagerOpen && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center text-base font-black shadow-md">
                                    <i className="fas fa-user-edit"></i>
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900">إدارة وتعديل أسماء فنيي وموظفي الأشعة</h3>
                                    <p className="text-xs text-slate-500">إضافة، تعديل، وحذف الأسماء المعروضة في القوائم وسجل الحالات</p>
                                </div>
                            </div>
                            <button onClick={() => setIsTechManagerOpen(false)} className="text-slate-400 hover:text-slate-600 p-2">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Add New Technician Input Bar */}
                        <div className="mb-5">
                            <label className="block text-xs font-black text-slate-700 mb-1.5">إضافة موظف / فني جديد:</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="اكتب اسم الموظف (مثال: أ. محمد عبد الله)..."
                                    value={newTechName}
                                    onChange={e => setNewTechName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleAddTechnician();
                                    }}
                                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
                                />
                                <button
                                    onClick={() => handleAddTechnician()}
                                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition active:scale-95"
                                >
                                    <i className="fas fa-plus"></i>
                                    <span>إضافة</span>
                                </button>
                            </div>
                        </div>

                        {/* Existing Technicians List */}
                        <div className="border border-slate-200 rounded-2xl p-3 bg-slate-50/50 mb-4 max-h-64 overflow-y-auto">
                            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200/80 text-[11px] font-black text-slate-500">
                                <span>قائمة الأسماء الحالية ({techPresets.length})</span>
                                <span>الإجراءات</span>
                            </div>

                            {techPresets.length === 0 ? (
                                <p className="text-center py-6 text-xs text-slate-400 font-bold">لا يوجد أسماء مضافة حالياً. أضف أسماء موظفي القسم بالأعلى.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {techPresets.map((techName, index) => {
                                        const isEditingThis = editingTechPresetIndex === index;
                                        const isActiveSelected = selectedTechnician === techName;

                                        return (
                                            <div
                                                key={index}
                                                className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                                                    isActiveSelected
                                                        ? 'bg-amber-50 border-amber-300 shadow-xs'
                                                        : 'bg-white border-slate-200 hover:border-slate-300'
                                                }`}
                                            >
                                                {isEditingThis ? (
                                                    <div className="flex items-center gap-1.5 flex-1 ml-2">
                                                        <input
                                                            type="text"
                                                            value={editingTechPresetName}
                                                            onChange={e => setEditingTechPresetName(e.target.value)}
                                                            autoFocus
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') handleUpdateTechnician(index);
                                                                if (e.key === 'Escape') setEditingTechPresetIndex(null);
                                                            }}
                                                            className="flex-1 bg-white border border-indigo-400 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 focus:outline-none"
                                                        />
                                                        <button
                                                            onClick={() => handleUpdateTechnician(index)}
                                                            className="bg-emerald-600 text-white px-2 py-1 rounded-lg text-xs font-bold shadow-xs hover:bg-emerald-500"
                                                            title="حفظ التعديل"
                                                        >
                                                            حفظ
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingTechPresetIndex(null)}
                                                            className="bg-slate-200 text-slate-700 px-2 py-1 rounded-lg text-xs font-bold hover:bg-slate-300"
                                                            title="إلغاء"
                                                        >
                                                            إلغاء
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 font-mono font-bold text-[11px] flex items-center justify-center">
                                                            {index + 1}
                                                        </span>
                                                        <span className="font-bold text-xs text-slate-800 truncate" title={techName}>
                                                            {techName}
                                                        </span>
                                                        {isActiveSelected && (
                                                            <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                                                                النشط حالياً
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {!isEditingThis && (
                                                    <div className="flex items-center gap-1">
                                                        {!isActiveSelected && (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedTechnician(techName);
                                                                    setFastTech(techName);
                                                                    showToast(`تم تعيين الفني النشط: ${techName}`, 'info');
                                                                }}
                                                                className="text-[11px] bg-slate-100 hover:bg-amber-100 hover:text-amber-800 text-slate-600 px-2 py-1 rounded-lg font-bold transition"
                                                                title="تعيين كفني افتراضي نشط"
                                                            >
                                                                تحديد
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setEditingTechPresetIndex(index);
                                                                setEditingTechPresetName(techName);
                                                            }}
                                                            className="text-slate-400 hover:text-indigo-600 p-1.5 transition"
                                                            title="تعديل الاسم"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteTechnician(index)}
                                                            className="text-slate-400 hover:text-rose-600 p-1.5 transition"
                                                            title="حذف من القائمة"
                                                        >
                                                            <i className="fas fa-trash-alt text-xs"></i>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Reset Defaults & Close Actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                            <button
                                onClick={() => {
                                    if (confirm('هل تريد استعادة قائمة الأسماء الافتراضية؟')) {
                                        setTechPresets(DEFAULT_TECH_PRESETS);
                                        showToast('تم استعادة الأسماء الافتراضية', 'info');
                                    }
                                }}
                                className="text-slate-500 hover:text-rose-600 font-bold transition flex items-center gap-1"
                            >
                                <i className="fas fa-undo"></i>
                                <span>استعادة الأسماء الافتراضية</span>
                            </button>

                            <button
                                onClick={() => setIsTechManagerOpen(false)}
                                className="bg-slate-900 hover:bg-slate-800 text-white font-black px-5 py-2 rounded-xl text-xs shadow transition"
                            >
                                إتمام وحفظ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: STAFF WORKLOAD & PERFORMANCE STATISTICS (إحصائيات إنجاز الموظفين اليومية) */}
            {isTechStatsModalOpen && (
                <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full p-6 border border-slate-200 my-auto text-right" dir="rtl">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-lg font-black shadow-lg">
                                    <i className="fas fa-chart-pie"></i>
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900">تقرير إنجاز وحالات الموظفين اليومي</h3>
                                    <p className="text-xs text-slate-500">
                                        تتبع دقيق لعدد الحالات المفحوصة بواسطة كل فني مع توزيع الأقسام لتاريخ: <strong className="text-indigo-600">{selectedDate || 'كافة التواريخ'}</strong>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={exportTechStatsToExcel}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition active:scale-95"
                                    title="تصدير تقرير إحصائيات الموظفين كشيت إكسل"
                                >
                                    <i className="fas fa-file-excel"></i>
                                    <span>تصدير إكسل (.xlsx)</span>
                                </button>
                                <button onClick={() => setIsTechStatsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        {/* Top KPI Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                                <span className="text-[11px] font-bold text-slate-500 block mb-1">إجمالي الحالات اليوم:</span>
                                <span className="text-2xl font-black text-slate-900 font-mono">{modalityStats['ALL']}</span>
                            </div>
                            <div className="bg-indigo-50 p-3.5 rounded-2xl border border-indigo-200">
                                <span className="text-[11px] font-bold text-indigo-700 block mb-1">الموظفين النشطين اليوم:</span>
                                <span className="text-2xl font-black text-indigo-900 font-mono">
                                    {technicianDailyStats.filter(t => t.total > 0).length} <span className="text-xs font-normal">من {techPresets.length}</span>
                                </span>
                            </div>
                            <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200">
                                <span className="text-[11px] font-bold text-amber-800 block mb-1">أعلى إنجاز موظف:</span>
                                <span className="text-base font-black text-amber-950 truncate block">
                                    {technicianDailyStats[0]?.total > 0 ? `${technicianDailyStats[0].name} (${technicianDailyStats[0].total})` : 'لا توجد بيانات'}
                                </span>
                            </div>
                            <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200">
                                <span className="text-[11px] font-bold text-emerald-800 block mb-1">متوسط الحالات / موظف:</span>
                                <span className="text-2xl font-black text-emerald-950 font-mono">
                                    {technicianDailyStats.filter(t => t.total > 0).length > 0
                                        ? (modalityStats['ALL'] / technicianDailyStats.filter(t => t.total > 0).length).toFixed(1)
                                        : '0'}
                                </span>
                            </div>
                        </div>

                        {/* Detailed Staff Performance Table */}
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs mb-4">
                            <table className="w-full text-right text-xs">
                                <thead>
                                    <tr className="bg-slate-900 text-white font-black">
                                        <th className="p-3 text-center w-10">#</th>
                                        <th className="p-3">اسم الموظف / القائم بالفحص</th>
                                        <th className="p-3 text-center w-16 bg-slate-800 text-slate-200">XR عادية</th>
                                        <th className="p-3 text-center w-16 bg-emerald-950 text-emerald-300">CT مقطعية</th>
                                        <th className="p-3 text-center w-16 bg-blue-950 text-blue-300">MRI رنين</th>
                                        <th className="p-3 text-center w-16 bg-teal-950 text-teal-300">US سونار</th>
                                        <th className="p-3 text-center w-16 bg-amber-950 text-amber-300">FL صبغة</th>
                                        <th className="p-3 text-center w-16 bg-pink-950 text-pink-300">MG مامو</th>
                                        <th className="p-3 text-center w-24 bg-amber-500 text-slate-950 font-black">إجمالي الحالات</th>
                                        <th className="p-3 text-center w-28">نسبة الإنجاز</th>
                                        <th className="p-3 text-center w-20">تصفية</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {technicianDailyStats.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="text-center py-6 text-slate-400 font-bold">لا يوجد موظفين مسجلين</td>
                                        </tr>
                                    ) : (
                                        technicianDailyStats.map((item, idx) => {
                                            const percent = modalityStats['ALL'] > 0 ? ((item.total / modalityStats['ALL']) * 100).toFixed(1) : '0.0';
                                            const isFiltered = selectedTechFilter === item.name;

                                            return (
                                                <tr key={item.name} className={`hover:bg-slate-50 transition ${isFiltered ? 'bg-indigo-50/70 font-black' : ''}`}>
                                                    <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                                    <td className="p-3 font-black text-slate-800">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-2 h-2 rounded-full ${item.total > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                                            <span>{item.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-center font-mono font-bold text-slate-700 bg-slate-50/50">{item.modalities['X-RAY']}</td>
                                                    <td className="p-3 text-center font-mono font-bold text-emerald-800 bg-emerald-50/30">{item.modalities['CT']}</td>
                                                    <td className="p-3 text-center font-mono font-bold text-blue-800 bg-blue-50/30">{item.modalities['MRI']}</td>
                                                    <td className="p-3 text-center font-mono font-bold text-teal-800 bg-teal-50/30">{item.modalities['US']}</td>
                                                    <td className="p-3 text-center font-mono font-bold text-amber-900 bg-amber-50/30">{item.modalities['FLUO']}</td>
                                                    <td className="p-3 text-center font-mono font-bold text-pink-800 bg-pink-50/30">{item.modalities['MAMMO']}</td>
                                                    <td className="p-3 text-center font-mono font-black text-sm bg-amber-50 text-amber-950">{item.total}</td>
                                                    <td className="p-3 text-center">
                                                        <div className="flex items-center gap-2 justify-center">
                                                            <div className="w-12 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                                                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${percent}%` }}></div>
                                                            </div>
                                                            <span className="font-mono font-bold text-[11px] text-slate-600">{percent}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedTechFilter(isFiltered ? 'ALL' : item.name);
                                                                setIsTechStatsModalOpen(false);
                                                                showToast(`تمت تصفية السجل لعرض حالات: ${item.name}`, 'info');
                                                            }}
                                                            className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition shadow-xs ${
                                                                isFiltered
                                                                    ? 'bg-amber-500 text-slate-950'
                                                                    : 'bg-slate-100 hover:bg-indigo-100 text-indigo-700'
                                                            }`}
                                                            title="عرض حالات هذا الموظف فقط في الجدول الرئيسي"
                                                        >
                                                            {isFiltered ? 'إلغاء' : 'عرض'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                            <span className="text-slate-500">
                                💡 يمكنك النقر على زر <strong>[عرض]</strong> بجانب أي موظف لمشاهدة حالاته فقط في شيت السجل اليومي.
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setSelectedTechFilter('ALL');
                                        showToast('تم إلغاء التصفية وعرض كافة الحالات', 'info');
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl text-xs"
                                >
                                    إلغاء تصفية الموظفين
                                </button>
                                <button
                                    onClick={() => setIsTechStatsModalOpen(false)}
                                    className="bg-slate-900 hover:bg-slate-800 text-white font-black px-4 py-1.5 rounded-xl text-xs shadow"
                                >
                                    إغلاق
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: STANDALONE & OFFLINE HUB (نظام مستقل أوفلاين 100%) */}
            {isOfflineModalOpen && (
                <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 my-auto text-right" dir="rtl">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-base font-black shadow-lg">
                                    <i className="fas fa-shield-alt"></i>
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900">نظام مستقل وأوفلاين 100%</h3>
                                    <p className="text-xs text-slate-500">منفصل تماماً عن الإنترنت، بدون فايربيز، وبدون تسجيل دخول</p>
                                </div>
                            </div>
                            <button onClick={() => setIsOfflineModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Status Alert */}
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 mb-4 text-emerald-950 text-xs">
                            <div className="flex items-center gap-2 font-black text-sm text-emerald-800 mb-1">
                                <i className="fas fa-check-circle text-emerald-600 text-base"></i>
                                <span>جاهز للعمل الميداني في أي وقت وبدون نت</span>
                            </div>
                            <p className="leading-relaxed">
                                هذا السجل الرقمي مستقل كلياً. يتم حفظ الحالات، العدادات، وأسماء الفنيين داخل <strong>ذاكرة المتصفح المحلية (Local Storage)</strong> لجهازك فوراً وتظل محفوظة حتى لو أغلقت المتصفح أو انقطع الاتصال بالإنترنت.
                            </p>
                        </div>

                        {/* Standalone Capabilities List */}
                        <div className="space-y-2.5 mb-5 text-xs">
                            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                                <i className="fas fa-wifi-slash text-slate-700 mt-0.5 text-sm"></i>
                                <div>
                                    <strong className="text-slate-800 block">بدون إنترنت أو شبكة:</strong>
                                    <span className="text-slate-500">يعمل بدون الحاجة لأي اتصال بالإنترنت في غرف الأشعة والاستقبال.</span>
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                                <i className="fas fa-user-lock text-indigo-600 mt-0.5 text-sm"></i>
                                <div>
                                    <strong className="text-slate-800 block">بدون نظام موظفين أو تسجيل دخول:</strong>
                                    <span className="text-slate-500">مباشر وفوري لأي فني أو مشرف بدون كتابة كلمات مرور.</span>
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                                <i className="fas fa-file-excel text-emerald-600 mt-0.5 text-sm"></i>
                                <div>
                                    <strong className="text-slate-800 block">تصدير إكسل حقيقي (.xlsx):</strong>
                                    <span className="text-slate-500">حفظ وتنزيل شيتات منفصلة لكل قسم أو مصنف كامل بنقرة واحدة.</span>
                                </div>
                            </div>
                        </div>

                        {/* Backup & Restore Tools */}
                        <div className="bg-slate-900 text-white rounded-2xl p-4 mb-4">
                            <h4 className="text-xs font-black text-amber-300 mb-2 flex items-center gap-1.5">
                                <i className="fas fa-download"></i>
                                <span>النسخ الاحتياطي والنقل بين الأجهزة (JSON):</span>
                            </h4>
                            <p className="text-[11px] text-slate-300 mb-3">
                                يمكنك تحميل نسخة من كافة بيانات السجل أو نقلها لجهاز كمبيوتر آخر في القسم بسهولة:
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={handleBackupJSON}
                                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition"
                                >
                                    <i className="fas fa-file-download"></i>
                                    <span>تحميل نسخة احتياطية</span>
                                </button>

                                <label className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition">
                                    <i className="fas fa-file-upload text-indigo-400"></i>
                                    <span>استعادة نسخة</span>
                                    <input type="file" accept=".json" onChange={handleRestoreJSON} className="hidden" />
                                </label>
                            </div>
                        </div>

                        {/* Clear All Data */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                            <button
                                onClick={() => {
                                    if (confirm('تحذير: هل أنت متأكد من رغبتك في مسح كافة الحالات المسجلة محلياً في هذا الجهاز؟ تأكد من تصدير إكسل أولاً.')) {
                                        setCases([]);
                                        showToast('تم تفريغ سجل الحالات المحلي', 'info');
                                    }
                                }}
                                className="text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 transition"
                            >
                                <i className="fas fa-trash-alt"></i>
                                <span>تفريغ السجل المحلي</span>
                            </button>

                            <button
                                onClick={() => setIsOfflineModalOpen(false)}
                                className="bg-slate-900 hover:bg-slate-800 text-white font-black px-5 py-2 rounded-xl text-xs shadow transition"
                            >
                                حسناً، إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: OFFICIAL MEDICAL LOGBOOK PRINT PREVIEW */}
            {isPrintPreviewOpen && (
                <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto no-print">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full p-6 border border-slate-200 my-auto text-right" dir="rtl">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-black">
                                    <i className="fas fa-print"></i>
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900">معاينة طباعة سجل الأشعة الرسمي</h3>
                                    <p className="text-xs text-slate-500">تصميم جدول A4 طبي منظم خالي من عناصر التحكم والأزرار</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        window.print();
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition"
                                >
                                    <i className="fas fa-print"></i>
                                    <span>طباعة فورية (Print / PDF)</span>
                                </button>
                                <button onClick={() => setIsPrintPreviewOpen(false)} className="text-slate-400 hover:text-slate-600 p-2">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        {/* Document Preview Box (Looks exactly like A4 sheet) */}
                        <div className="bg-white p-6 border border-slate-300 rounded-2xl shadow-inner max-h-[68vh] overflow-y-auto font-sans">
                            {/* Official Header */}
                            <div className="border-b-2 border-slate-900 pb-3 mb-4 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-black text-slate-900">
                                        مستشفى / مركز الأشعة والتصوير الطبي
                                    </h2>
                                    <h4 className="text-xs font-bold text-slate-700 mt-0.5">
                                        سجل فحص الحالات اليومي - {activeTab === 'ALL' ? 'كافة أقسام الأشعة' : MODALITY_CONFIG[activeTab]?.nameAr}
                                    </h4>
                                </div>
                                <div className="text-left text-[11px] space-y-0.5 font-mono text-slate-700">
                                    <div><strong>التاريخ:</strong> {selectedDate || 'كافة الأيام'}</div>
                                    <div><strong>إجمالي الحالات:</strong> {filteredCases.length} حالة</div>
                                    <div><strong>الترتيب:</strong> {sortField === 'time' ? 'حسب الوقت' : sortField === 'serialNo' ? 'حسب الرقم' : 'حسب الاسم'}</div>
                                </div>
                            </div>

                            {/* Formatted Medical Table */}
                            <table className="w-full text-right text-xs border-collapse border border-slate-900">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-900">
                                        <th className="p-2 border border-slate-900 text-center w-8">م</th>
                                        <th className="p-2 border border-slate-900 text-center w-24">رقم الأشعة</th>
                                        <th className="p-2 border border-slate-900 text-center w-20">القسم</th>
                                        <th className="p-2 border border-slate-900 w-24">رقم الملف</th>
                                        <th className="p-2 border border-slate-900">اسم المريض</th>
                                        <th className="p-2 border border-slate-900">الفحص المطلوب</th>
                                        <th className="p-2 border border-slate-900">الطبيب المعالج</th>
                                        <th className="p-2 border border-slate-900 text-center w-16">الوقت</th>
                                        <th className="p-2 border border-slate-900 text-center w-28">القائم بالفحص (الفني)</th>
                                        <th className="p-2 border border-slate-900 text-center w-20">توقيع الفني</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCases.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="text-center py-6 text-slate-400">لا توجد حالات مسجلة في هذا القسم</td>
                                        </tr>
                                    ) : (
                                        filteredCases.map((item, idx) => (
                                            <tr key={item.id} className="border-b border-slate-900">
                                                <td className="p-1.5 border border-slate-900 text-center font-bold font-mono">{idx + 1}</td>
                                                <td className="p-1.5 border border-slate-900 text-center font-mono font-bold">{item.modalitySerial}</td>
                                                <td className="p-1.5 border border-slate-900 text-center font-bold">{MODALITY_CONFIG[item.modality]?.nameAr?.split(' ')[0] || item.modality}</td>
                                                <td className="p-1.5 border border-slate-900 font-mono">{item.fileNumber || '-'}</td>
                                                <td className="p-1.5 border border-slate-900 font-bold">{item.patientName}</td>
                                                <td className="p-1.5 border border-slate-900">{item.examName}</td>
                                                <td className="p-1.5 border border-slate-900 text-slate-700">{item.doctorName || '-'}</td>
                                                <td className="p-1.5 border border-slate-900 text-center font-mono font-bold">{item.time}</td>
                                                <td className="p-1.5 border border-slate-900 text-center font-bold">{item.technicianName || '-'}</td>
                                                <td className="p-1.5 border border-slate-900"></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>

                            {/* Official Signatures */}
                            <div className="mt-8 pt-4 flex items-center justify-between text-xs font-bold border-t border-slate-300">
                                <div>
                                    <p>الفني القائم بالفحص / المسئول:</p>
                                    <p className="mt-4 text-slate-400">....................................................</p>
                                </div>
                                <div>
                                    <p>مشرف قسم الأشعة والتصوير الطبي:</p>
                                    <p className="mt-4 text-slate-400">....................................................</p>
                                </div>
                                <div>
                                    <p>مدير قسم الأشعة والخدمات الطبية:</p>
                                    <p className="mt-4 text-slate-400">....................................................</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
                            <span className="text-xs text-slate-500">
                                📄 عند الضغط على زر الطباعة، سيتم إرسال هذا الجدول المنسق مباشرة إلى الطابعة أو تصديره كـ PDF بدون تصوير الواجهة أو الأزرار.
                            </span>
                            <button
                                onClick={() => setIsPrintPreviewOpen(false)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-1.5 rounded-xl text-xs"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: FILL VACANT SERIAL SLOT */}
            {isFillSlotModalOpen && slotToFill && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-base shadow-md">
                                    <i className="fas fa-user-plus"></i>
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                        <span>{txt('تعبئة الخانة الشاغرة', 'Fill Vacant Serial Slot')}</span>
                                        <span className="font-mono bg-indigo-100 text-indigo-900 border border-indigo-300 px-2.5 py-0.5 rounded-lg text-xs font-black">
                                            {slotToFill.modalitySerial || txt('بدون كود', 'No Code')}
                                        </span>
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        {txt('اختر مريضاً من طابور الانتظار أو أدخل بيانات مريض جديد لتشغل هذا الرقم المحدد', 'Pick a patient from waiting queue or manually enter details to fill this exact serial slot')}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => { setIsFillSlotModalOpen(false); setSlotToFill(null); }} className="text-slate-400 hover:text-slate-600 p-2 cursor-pointer">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Section 1: Select from Waiting Queue */}
                        <div className="mb-5">
                            <h4 className="text-xs font-black text-indigo-900 mb-2 flex items-center justify-between">
                                <span>{txt('1. اختيار مريض من طابور الانتظار (نقرة واحدة):', '1. Select Patient from Waiting Queue (1-Click):')}</span>
                                <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                                    {incomingQueue.length} {txt('مرضى ينتظرون', 'waiting')}
                                </span>
                            </h4>

                            {incomingQueue.length === 0 ? (
                                <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                                    {txt('لا يوجد مرضى في طابور الانتظار حالياً. يمكنك استخدام الإدخال اليدوي أدناه.', 'No patients in waiting queue right now. Use manual entry below.')}
                                </div>
                            ) : (
                                <div className="max-h-48 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-2xl border border-slate-200">
                                    {incomingQueue.map(p => (
                                        <div key={p.id} className="bg-white p-2.5 rounded-xl border border-slate-200 hover:border-emerald-400 flex items-center justify-between gap-2 shadow-2xs transition">
                                            <div>
                                                <div className="font-bold text-xs text-slate-900">{p.patientName}</div>
                                                <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                                    <span>MRN: {p.fileNumber || '-'}</span>
                                                    <span>• {p.examName}</span>
                                                    <span className="font-mono text-indigo-600">({p.modality})</span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleFillSlotWithPatient(slotToFill.id, {
                                                    patientName: p.patientName,
                                                    fileNumber: p.fileNumber,
                                                    examName: p.examName,
                                                    doctorName: p.doctorName,
                                                    technicianName: p.technicianName || selectedTechnician,
                                                    time: p.time,
                                                    refNo: p.refNo
                                                }, p)}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                                            >
                                                <i className="fas fa-check"></i>
                                                <span>{txt('تعبئة الرقم', 'Assign to Serial')}</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Section 2: Manual Fill Form */}
                        <form onSubmit={e => {
                            e.preventDefault();
                            if (!fillSlotManualName && !fillSlotManualMRN) {
                                return showToast(txt('يرجى كتابة اسم المريض أو رقم الملف', 'Please enter patient name or MRN'), 'error');
                            }
                            handleFillSlotWithPatient(slotToFill.id, {
                                patientName: fillSlotManualName || `ملف (${fillSlotManualMRN})`,
                                fileNumber: fillSlotManualMRN,
                                examName: fillSlotManualExam || 'فحص أشعة',
                                doctorName: fillSlotManualDoctor,
                                technicianName: fillSlotManualTech || selectedTechnician
                            });
                        }} className="pt-3 border-t border-slate-200 space-y-3">
                            <h4 className="text-xs font-black text-slate-800">
                                {txt('2. أو إدخال بيانات مريض جديد يدويًا في هذا الرقم:', '2. Or Manually Enter Patient Details for this Serial:')}
                            </h4>

                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2">
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">{txt('اسم المريض', 'Patient Name')}</label>
                                    <input
                                        type="text"
                                        placeholder={txt('اسم المريض...', 'Patient name...')}
                                        value={fillSlotManualName}
                                        onChange={e => setFillSlotManualName(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">{txt('رقم الملف (MRN)', 'MRN')}</label>
                                    <input
                                        type="text"
                                        placeholder="MRN"
                                        value={fillSlotManualMRN}
                                        onChange={e => setFillSlotManualMRN(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">{txt('اسم الفحص', 'Exam Name')}</label>
                                    <input
                                        type="text"
                                        placeholder="X-Ray Chest / CT Brain..."
                                        value={fillSlotManualExam}
                                        onChange={e => setFillSlotManualExam(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">{txt('القائم بالفحص', 'Technician')}</label>
                                    <select
                                        value={fillSlotManualTech || selectedTechnician}
                                        onChange={e => setFillSlotManualTech(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                    >
                                        {techPresets.map(preset => (
                                            <option key={preset} value={preset}>{preset}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="submit"
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-2.5 rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <i className="fas fa-save"></i>
                                    <span>{txt('حفظ وتعبئة الخانة الشاغرة', 'Save & Fill Vacant Slot')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsFillSlotModalOpen(false); setSlotToFill(null); }}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer"
                                >
                                    {txt('إلغاء', 'Cancel')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* HIDDEN PRINT-ONLY MEDICAL LOGBOOK (RENDERED EXCLUSIVELY FOR PRINT / PDF)   */}
            {/* ========================================================================= */}
            <div id="printable-radiology-logbook" className="hidden print:block bg-white text-black p-4 printable-logbook-table" dir="rtl">
                <div className="border-b-2 border-slate-900 pb-3 mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black tracking-tight text-slate-900">
                            مستشفى / مركز الأشعة والتصوير الطبي
                        </h2>
                        <h3 className="text-sm font-bold text-slate-700 mt-0.5">
                            سجل فحص الحالات اليومي - {activeTab === 'ALL' ? 'كافة أقسام الأشعة' : MODALITY_CONFIG[activeTab]?.nameAr}
                        </h3>
                    </div>
                    <div className="text-left text-xs space-y-0.5 font-mono">
                        <div><strong>التاريخ:</strong> {selectedDate || 'كافة الأيام'}</div>
                        <div><strong>إجمالي الحالات:</strong> {filteredCases.length} حالة</div>
                        <div><strong>الترتيب:</strong> {sortField === 'time' ? 'حسب الوقت' : sortField === 'serialNo' ? 'حسب الرقم' : 'حسب الاسم'}</div>
                        <div><strong>وقت الطباعة:</strong> {new Date().toLocaleTimeString('ar-EG')}</div>
                    </div>
                </div>

                <table className="w-full text-right text-xs border-collapse border border-slate-900">
                    <thead>
                        <tr className="bg-slate-100 text-slate-900 font-black border border-slate-900">
                            <th className="p-2 border border-slate-900 text-center w-8">م</th>
                            <th className="p-2 border border-slate-900 text-center w-24">رقم الأشعة</th>
                            <th className="p-2 border border-slate-900 text-center w-20">القسم</th>
                            <th className="p-2 border border-slate-900 w-24">رقم الملف (MRN)</th>
                            <th className="p-2 border border-slate-900">اسم المريض</th>
                            <th className="p-2 border border-slate-900">الفحص المطلوب</th>
                            <th className="p-2 border border-slate-900">الطبيب المحول</th>
                            <th className="p-2 border border-slate-900 text-center w-16">الوقت</th>
                            <th className="p-2 border border-slate-900 text-center w-28">القائم بالفحص (الفني)</th>
                            <th className="p-2 border border-slate-900 text-center w-20">توقيع الفني</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCases.map((item, idx) => (
                            <tr key={item.id} className="border border-slate-900">
                                <td className="p-1.5 border border-slate-900 text-center font-bold font-mono">{idx + 1}</td>
                                <td className="p-1.5 border border-slate-900 text-center font-mono font-bold">{item.modalitySerial}</td>
                                <td className="p-1.5 border border-slate-900 text-center font-bold">{MODALITY_CONFIG[item.modality]?.nameAr?.split(' ')[0] || item.modality}</td>
                                <td className="p-1.5 border border-slate-900 font-mono">{item.fileNumber || '-'}</td>
                                <td className="p-1.5 border border-slate-900 font-bold">{item.patientName}</td>
                                <td className="p-1.5 border border-slate-900">{item.examName}</td>
                                <td className="p-1.5 border border-slate-900 text-slate-700">{item.doctorName || '-'}</td>
                                <td className="p-1.5 border border-slate-900 text-center font-mono font-bold">{item.time}</td>
                                <td className="p-1.5 border border-slate-900 text-center font-bold">{item.technicianName || '-'}</td>
                                <td className="p-1.5 border border-slate-900"></td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Signatures Section */}
                <div className="print-footer-signatures mt-8 pt-4 flex items-center justify-between text-xs font-bold border-t border-slate-400">
                    <div>
                        <p>الفني القائم بالفحص / المسئول:</p>
                        <p className="mt-6 text-slate-500">....................................................</p>
                    </div>
                    <div>
                        <p>مشرف قسم الأشعة والتصوير الطبي:</p>
                        <p className="mt-6 text-slate-500">....................................................</p>
                    </div>
                    <div>
                        <p>مدير قسم الأشعة والخدمات الطبية:</p>
                        <p className="mt-6 text-slate-500">....................................................</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StandaloneRadiologyLogbook;
