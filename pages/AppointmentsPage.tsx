
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db } from '../firebase';
// @ts-ignore
import { 
    doc, getDoc, setDoc, updateDoc, deleteDoc, 
    collection, query, where, getDocs, writeBatch, 
    onSnapshot, Timestamp, orderBy, limit, runTransaction, addDoc, getCountFromServer 
} from 'firebase/firestore';
import { Appointment } from '../types';
import Loading from '../components/Loading';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

// Helper for Safe Vibration
const safeVibrate = (pattern: number | number[]) => {
    try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            // Only try if user has interacted with the document (browser restriction)
            if (navigator.userActivation && navigator.userActivation.hasBeenActive) {
                navigator.vibrate(pattern);
            }
        }
    } catch (e) {
        // Ignore vibration errors
    }
};

// Enhanced Keywords based on specific IHMS formats
const MODALITIES = [
    { 
        id: 'MRI', 
        label: 'MRI', 
        icon: 'fa-magnet', 
        color: 'text-blue-600 bg-blue-50', 
        border: 'border-blue-200', 
        keywords: ['MRI', 'MR ', 'MAGNETIC', 'M.R.I', 'رنين', 'مغناطيسي'],
        instructionImage: 'https://forms.gle/reVThvP19PygkGwbA',
    },
    { 
        id: 'CT', 
        label: 'CT Scan', 
        icon: 'fa-ring', 
        color: 'text-emerald-600 bg-emerald-50', 
        border: 'border-emerald-200', 
        keywords: ['C.T.', 'CT ', 'COMPUTED', 'CAT ', 'MDCT', 'مقطعية', 'أشعة مقطعية'],
        instructionImage: "https://forms.gle/QmxviSZU6me8iHmR6",

    },
    { 
        id: 'US', 
        label: 'Ultrasound', 
        icon: 'fa-wave-square', 
        color: 'text-indigo-600 bg-indigo-50', 
        border: 'border-indigo-200', 
        keywords: ['US', 'U.S', 'ULTRASOUND', 'SONO', 'DOPPLER', 'ECHO', 'DUPLEX', 'تلفزيونية', 'سونار'],

    },
    { 
        id: 'X-RAY', 
        label: 'X-Ray & General', 
        icon: 'fa-x-ray', 
        color: 'text-slate-600 bg-slate-50', 
        border: 'border-slate-200', 
        keywords: [
            'X-RAY', 'XRAY', 'XR ', 'MAMMO', 'CR ', 'DR ', 'CHEST', 'PLAIN', 'SPINE', 
            'KNEE', 'FOOT', 'HAND', 'HUMERUS', 'FEMUR', 'TIBIA', 'FIBULA', 'RADIUS', 'ULNA', 
            'SHOULDER', 'ELBOW', 'WRIST', 'ANKLE', 'PELVIS', 'HIP', 'SKULL', 'MANDIBLE', 'SINUS',
            'سينية', 'عادية'
        ],
        defaultPrep: `• Remove jewelry and metal objects from the area.
• Inform technician if pregnant.
• إزالة المجوهرات والمعادن.
• إبلاغ الفني في حال الحمل.`
    },
    { 
        id: 'FLUO', 
        label: 'Fluoroscopy', 
        icon: 'fa-video', 
        color: 'text-amber-600 bg-amber-50', 
        border: 'border-amber-200', 
        keywords: ['FLUO', 'BARIUM', 'CONTRAST', 'HSG', 'MCUG', 'صبغة', 'ملونة'],
        defaultPrep: `• Fasting for 8 hours (Midnight).
• Bring previous X-rays.
• صيام كامل لمدة 8 ساعات.`
    },
    { 
        id: 'OTHER', 
        label: 'General', 
        icon: 'fa-notes-medical', 
        color: 'text-gray-600 bg-gray-50', 
        border: 'border-gray-200', 
        keywords: [],
        defaultPrep: 'Follow doctor instructions.\nاتباع تعليمات الطبيب.'
    }
];

interface ModalitySettings {
    limit: number;
    slots: string[];
    prep: string;
    currentCounter?: number;
}

// Default Fallback
const DEFAULT_SETTINGS: Record<string, ModalitySettings> = {
    'MRI': { limit: 15, slots: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'], prep: MODALITIES[0].defaultPrep, currentCounter: 1 },
    'CT': { limit: 20, slots: ['09:00', '09:20', '09:40', '10:00', '10:20', '10:40', '11:00', '11:20', '11:40', '12:00'], prep: MODALITIES[1].defaultPrep, currentCounter: 1 },
    'US': { limit: 30, slots: [], prep: MODALITIES[2].defaultPrep, currentCounter: 1 },
    'X-RAY': { limit: 50, slots: [], prep: MODALITIES[3].defaultPrep, currentCounter: 1 },
    'FLUO': { limit: 10, slots: ['08:00', '09:00', '10:00'], prep: MODALITIES[4].defaultPrep, currentCounter: 1 },
    'OTHER': { limit: 100, slots: [], prep: MODALITIES[5].defaultPrep, currentCounter: 1 }
};

// Helper to find value in object case-insensitively and recursively
const findValue = (obj: any, keys: string[]): any => {
    if (!obj) return null;
    const lowerKeys = keys.map(k => k.toLowerCase());
    for (const key of Object.keys(obj)) {
        if (lowerKeys.includes(key.toLowerCase()) && obj[key]) {
            return obj[key];
        }
    }
    return null;
};

// --- Helper: Local Date String ---
const getLocalToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- Helper: Get Yesterday String ---
const getYesterdayDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- Helper: Normalize Time ---
const normalizeTime = (time: any): string => {
    if (!time || typeof time !== 'string') return '';
    const trimmed = time.trim();
    if (trimmed.match(/^\d{1,2}:\d{2}$/)) {
        const [h, m] = trimmed.split(':');
        return `${h.padStart(2, '0')}:${m}`;
    }
    return trimmed;
};

interface ExtendedAppointment extends Appointment {
    roomNumber?: string;
    preparation?: string;
}

const AppointmentsPage: React.FC = () => {
    const { t, dir, language } = useLanguage();
    const navigate = useNavigate();
    
    // Data State (Load from LocalStorage initially)
    const [appointments, setAppointments] = useState<ExtendedAppointment[]>(() => {
        const cached = localStorage.getItem('cached_appointments');
        return cached ? JSON.parse(cached) : [];
    });
    const appointmentsRef = useRef<ExtendedAppointment[]>([]); 
    
    // Initialize with Local Date
    const [selectedDate, setSelectedDate] = useState(getLocalToday());
    const [activeView, setActiveView] = useState<'pending' | 'processing' | 'done' | 'scheduled'>('pending');
    const [activeModality, setActiveModality] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Date Filtering Toggle
    const [enableDateFilter, setEnableDateFilter] = useState(true);
    
    // UI State
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false);
    const [bridgeTab, setBridgeTab] = useState<'extension' | 'manual'>('extension'); 
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isLogBookOpen, setIsLogBookOpen] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    
    const [manualSlotsCount, setManualSlotsCount] = useState<number>(0);
    const [manualSlots, setManualSlots] = useState<string[]>([]);

    // Quota & Slots State
    const [modalitySettings, setModalitySettings] = useState<Record<string, ModalitySettings>>(DEFAULT_SETTINGS);
    const [currentBookedCount, setCurrentBookedCount] = useState(0);

    // Settings Editor State
    const [editingModalityId, setEditingModalityId] = useState('MRI');
    const [editStartTime, setEditStartTime] = useState('08:00');
    const [editEndTime, setEditEndTime] = useState('16:00');
    const [editInterval, setEditInterval] = useState(30);

    // Booking Modal
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [bookingAppt, setBookingAppt] = useState<ExtendedAppointment | null>(null);
    const [bookingDate, setBookingDate] = useState('');
    const [bookingTime, setBookingTime] = useState('');
    const [bookingRoom, setBookingRoom] = useState(''); 
    const [bookingPrep, setBookingPrep] = useState(''); 
    const [bookingWarning, setBookingWarning] = useState(''); 
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [isDayLimitReached, setIsDayLimitReached] = useState(false);

    // Panic & Completion Modal
    const [isPanicModalOpen, setIsPanicModalOpen] = useState(false);
    const [finishingAppt, setFinishingAppt] = useState<ExtendedAppointment | null>(null);
    const [panicDescription, setPanicDescription] = useState('');

    // Reg Number Modal
    const [isRegModalOpen, setIsRegModalOpen] = useState(false);
    const [currentRegNo, setCurrentRegNo] = useState('');

    // Success/QR Modal
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const [bookedTicketId, setBookedTicketId] = useState('');
    const [bookedTicketData, setBookedTicketData] = useState<ExtendedAppointment | null>(null);

    // Logbook Range State
    const [logStartDate, setLogStartDate] = useState(getLocalToday());
    const [logEndDate, setLogEndDate] = useState(getLocalToday());
    const [logbookData, setLogbookData] = useState<ExtendedAppointment[]>([]);
    const [isLogLoading, setIsLogLoading] = useState(false);

    // --- NEW: Archive Import State ---
    const [isArchiveView, setIsArchiveView] = useState(false);
    const [archiveFileName, setArchiveFileName] = useState('');

    const [toast, setToast] = useState<{msg: string, type: 'success'|'info'|'error'} | null>(null);
    const [isListening, setIsListening] = useState(false);
    const isSyncProcessing = useRef(false);

    // Manual Add State
    const [manualDate, setManualDate] = useState(getLocalToday());
    const [manualTime, setManualTimeState] = useState('08:00');
    const [manualRoom, setManualRoom] = useState('');
    const [patientName, setPatientName] = useState('');
    const [fileNumber, setFileNumber] = useState(''); 
    const [examType, setExamType] = useState('MRI');
    const [specificExamName, setSpecificExamName] = useState('');
    const [doctorName, setDoctorName] = useState('');
    const [patientAge, setPatientAge] = useState('');
    const [notes, setNotes] = useState('');
    const [preparationText, setPreparationText] = useState('');

    // Bridge Manual Input
    const [manualJsonInput, setManualJsonInput] = useState('');

    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || 'User';
    const isSupervisor = localStorage.getItem('role') === 'admin' || localStorage.getItem('role') === 'supervisor';

    useEffect(() => {
        appointmentsRef.current = appointments;
        // Don't cache if viewing archive
        if (!isArchiveView) {
            localStorage.setItem('cached_appointments', JSON.stringify(appointments));
        }
    }, [appointments, isArchiveView]);
    
    useEffect(() => {
        if (activeView === 'scheduled') {
            setEnableDateFilter(false); 
        } else {
            setEnableDateFilter(true);
        }
    }, [activeView]);

    useEffect(() => {
        const docRef = doc(db, 'system_settings', 'appointment_slots');
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setModalitySettings(docSnap.data() as Record<string, ModalitySettings>);
            } else {
                if (isSupervisor) {
                    setDoc(docRef, DEFAULT_SETTINGS);
                }
            }
        }, (error) => {
            console.error("Failed to sync settings", error);
        });
        return () => unsubscribe();
    }, [isSupervisor]);

    // --- DAILY ARCHIVE LOGIC (Yesterday's Data) ---
    useEffect(() => {
        const checkAndPurgeOldData = async () => {
            const LAST_DAILY_ARCHIVE = 'last_daily_archive_run';
            const lastRun = localStorage.getItem(LAST_DAILY_ARCHIVE);
            const today = getLocalToday();

            // Run if last run date is NOT today (meaning it's a new day)
            if (lastRun !== today) {
                if (!isSupervisor) return; // Only supervisor triggers cleanup

                setToast({ msg: 'بدء الأرشفة اليومية (الشاملة) لبيانات الأمس...', type: 'info' });
                
                try {
                    const yesterday = getYesterdayDate();
                    // Query ALL appointments for yesterday, regardless of status
                    const q = query(
                        collection(db, 'appointments'), 
                        where('date', '==', yesterday)
                        // REMOVED: where('status', '==', 'done') -> Now archives EVERYTHING
                    );
                    
                    const snapshot = await getDocs(q);

                    if (!snapshot.empty) {
                        const dataToExport = snapshot.docs.map(doc => ({_id: doc.id, ...doc.data()}));
                        
                        // 1. Save to Cloud Archive (Firestore Collection: daily_archives)
                        // Create a specific document for that day to avoid massive collections
                        await setDoc(doc(db, 'daily_archives', yesterday), {
                            archivedAt: Timestamp.now(),
                            archiveDate: yesterday,
                            recordCount: snapshot.size,
                            records: dataToExport,
                            type: 'daily_midnight_run_full'
                        });

                        // 2. Delete from Active Collection (Batch)
                        const batch = writeBatch(db);
                        snapshot.docs.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();

                        setToast({ msg: `تمت أرشفة ${snapshot.size} حالة (كل الحالات) من يوم أمس (${yesterday}) بنجاح.`, type: 'success' });
                    } else {
                         // No data to archive, still mark as run
                    }
                    
                    localStorage.setItem(LAST_DAILY_ARCHIVE, today);
                } catch (e) {
                    console.error("Auto Archive Error", e);
                    setToast({ msg: 'فشل في عملية الأرشفة اليومية', type: 'error' });
                }
            }
        };
        checkAndPurgeOldData();
    }, [isSupervisor]);

    useEffect(() => {
        const slots = modalitySettings[editingModalityId]?.slots || [];
        const normalized = slots.map(normalizeTime).filter((s): s is string => !!s);
        setManualSlots(normalized);
        setManualSlotsCount(normalized.length);
    }, [editingModalityId]);

    // Update Prep Text when Exam Type Changes
    useEffect(() => {
        if (modalitySettings[examType]?.prep) {
            setPreparationText(modalitySettings[examType].prep);
        } else {
            const def = MODALITIES.find(m => m.id === examType)?.defaultPrep || '';
            setPreparationText(def);
        }
    }, [examType, modalitySettings]);

    // --- SHARED DATA PROCESSOR ---
    const processIncomingData = async (rawPayload: any) => {
        if (isSyncProcessing.current) return;
        isSyncProcessing.current = true;
        setIsListening(true);

        try {
            let payload: any[] = [];
            if (Array.isArray(rawPayload)) {
                payload = rawPayload;
            } else if (rawPayload && typeof rawPayload === 'object') {
                payload = [rawPayload];
            }

            if (payload.length === 0) {
                setIsListening(false);
                isSyncProcessing.current = false;
                return;
            }

            const uniqueRecordsMap = new Map<string, any>();

            const generateId = (dateStr: string, fileNo: string, modId: string) => {
                const safeFile = fileNo || `NOFILE_${Math.random().toString(36).substr(2,5)}`;
                return `${dateStr}_${safeFile}_${modId}`.replace(/[^a-zA-Z0-9_]/g, '');
            };

            const detectModality = (serviceName: string) => {
                const sNameUpper = serviceName.toUpperCase();
                for (const mod of MODALITIES) {
                    if (mod.id === 'OTHER') continue;
                    if (mod.keywords.some(k => sNameUpper.includes(k))) {
                        return mod.id;
                    }
                }
                return 'OTHER';
            };
            const cleanTime = (t: any) => (t ? String(t).trim().substring(0, 5) : '00:00');
            const cleanDate = (d: any) => (d ? String(d).split('T')[0] : getLocalToday());

            payload.forEach((p: any) => {
                if ((!p.xrayPatientDetails || p.xrayPatientDetails.length === 0) && (p.xrayResultDetails && p.xrayResultDetails.length > 0)) {
                    return;
                }

                const pName = findValue(p, ['patientName', 'engName', 'name', 'patName', 'fullName']) || 'Unknown';
                const cleanName = pName.includes(' - ') ? pName.split(' - ')[1] : pName;
                const fNum = findValue(p, ['fileNumber', 'fileNo', 'mrn', 'patientId', 'pid']) || '';
                const age = findValue(p, ['ageYear', 'age', 'patientAge', 'dob']);
                const rawQueTime = findValue(p, ['queTime', 'time', 'visitTime']) || '';
                
                const detailsArr = p.xrayPatientDetails || p.orderDetails || p.services || [];
                
                if (Array.isArray(detailsArr) && detailsArr.length > 0) {
                    const modalityGroups: Record<string, any> = {};
                    detailsArr.forEach((det: any) => {
                        const sName = findValue(det, ['serviceName', 'examName', 'procedure', 'xrayName']);
                        if (!sName) return;
                        const modId = detectModality(sName);
                        if (!modalityGroups[modId]) {
                            modalityGroups[modId] = {
                                exams: [],
                                time: cleanTime(findValue(det, ['queTime', 'time']) || rawQueTime),
                                date: cleanDate(det.queDate || p.queDate),
                                doc: det.doctorName || p.doctorName || 'Unknown Dr',
                                ref: String(det.queRefNo || det.refNo || p.refNo || '')
                            };
                        }
                        modalityGroups[modId].exams.push(sName);
                    });

                    Object.keys(modalityGroups).forEach(modId => {
                        const group = modalityGroups[modId];
                        const id = generateId(group.date, String(fNum), modId);
                        
                        uniqueRecordsMap.set(id, {
                            id,
                            patientName: cleanName,
                            fileNumber: String(fNum),
                            patientAge: age ? String(age) : '',
                            examType: modId,
                            examList: group.exams,
                            doctorName: group.doc,
                            refNo: group.ref,
                            date: group.date,
                            time: group.time,
                            createdBy: 'Bridge',
                            createdByName: 'System',
                            status: 'pending',
                            createdAt: new Date().toISOString(),
                        });
                    });
                } else {
                    const sName = findValue(p, ['serviceName', 'examName']) || 'General Exam';
                    const modId = detectModality(sName);
                    const date = cleanDate(p.queDate);
                    const id = generateId(date, String(fNum), modId);
                    
                    uniqueRecordsMap.set(id, {
                        id,
                        patientName: cleanName,
                        fileNumber: String(fNum),
                        patientAge: age ? String(age) : '',
                        examType: modId,
                        examList: [sName],
                        doctorName: p.doctorName || 'Unknown Dr',
                        refNo: String(p.refNo || ''),
                        date: date,
                        time: cleanTime(rawQueTime),
                        createdBy: 'Bridge',
                        createdByName: 'System',
                        status: 'pending',
                        createdAt: new Date().toISOString(),
                    });
                }
            });

            // OPTIMIZATION: Deduplicate against current state to prevent wasted writes
            // The bridge might send the same 50 patients every 30 seconds.
            // We filter out records that already exist in state with SAME status and SAME exam list.
            
            const currentDataMap = new Map(appointmentsRef.current.map(a => [a.id, a]));
            const batch = writeBatch(db);
            let writeCount = 0;
            
            Array.from(uniqueRecordsMap.values()).forEach(record => {
                const existing = currentDataMap.get(record.id);
                
                // If existing and status is same (pending), skip write
                // Note: If user moved it to 'processing'/'done', existing.status will be diff, so we MIGHT overwrite? 
                // NO, because we usually want to KEEP user changes.
                // Logic: Only update if it's NEW or if crucial info changed, but typically bridge data is static until processed.
                // Strongest Check: If it exists in ANY state locally, assume it's tracked. Only update if absolutely needed.
                // For safety: We assume bridge sends "pending". If we have it as "processing", DO NOT overwrite with "pending".
                
                if (existing) {
                    // It exists. Do nothing. This prevents 99% of redundant writes.
                    return; 
                }

                // New record
                const ref = doc(db, 'appointments', record.id);
                batch.set(ref, record, { merge: true });
                writeCount++;
            });

            if (writeCount > 0) {
                await batch.commit();
                setLastSyncTime(new Date());
                safeVibrate([100, 50, 100]);
                setToast({ msg: `تم تحديث ${writeCount} سجلات جديدة 📥`, type: 'success' });
            } 

        } catch (e) {
            console.error("Sync Error:", e);
        } finally {
            setTimeout(() => setIsListening(false), 1000);
            isSyncProcessing.current = false;
        }
    };

    // --- Bridge Listener ---
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (!event.data || event.data.type !== 'SMART_SYNC_DATA') return;
            await processIncomingData(event.data.payload);
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [selectedDate]); 

    // --- FIREBASE REALTIME LISTENER WITH OPTIMIZED QUERY ---
    useEffect(() => {
        // If in Archive Mode, DO NOT LISTEN TO LIVE DATA
        if (isArchiveView) return;

        setLoading(true);

        const fetchAndSubscribe = () => {
            const collectionRef = collection(db, 'appointments');
            const today = getLocalToday();
            
            // Basic Constraints
            const constraints: any[] = [];

            // 1. Status Filter
            constraints.push(where('status', '==', activeView));

            // 2. Date Filter
            if (activeView === 'scheduled') {
                const targetDate = selectedDate || today;
                if (enableDateFilter) {
                    constraints.push(where('scheduledDate', '==', targetDate));
                } else {
                    constraints.push(where('scheduledDate', '>=', today));
                }
            } else if (activeView === 'done') {
                 const targetDate = selectedDate || today;
                 constraints.push(where('date', '==', targetDate));
            } else {
                // Pending or Processing
                const targetDate = selectedDate || today;
                constraints.push(where('date', '==', targetDate));
            }

            // 3. Modality Filter (Server-Side Optimization)
            if (activeModality !== 'ALL') {
                if (activeModality === 'X-RAY') {
                    // Requires "in" query support or individual indexes
                    constraints.push(where('examType', 'in', ['X-RAY', 'XRAY', 'OTHER']));
                } else {
                    constraints.push(where('examType', '==', activeModality));
                }
            }

            // 4. Order By
            // Firestore requires the first orderBy to match the inequality filter. 
            // If using 'scheduledDate >=' (range), must order by 'scheduledDate'.
            if (activeView === 'scheduled') {
                constraints.push(orderBy('scheduledDate', 'asc'));
                constraints.push(orderBy('time', 'asc'));
            } else {
                constraints.push(orderBy('time', 'desc'));
            }
            
            // 5. Limit for Pagination (Performance Optimization)
            constraints.push(limit(50));

            // Create Query
            const q = query(collectionRef, ...constraints);

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedApps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExtendedAppointment));
                setAppointments(fetchedApps);
                setLoading(false);
            }, (error) => {
                console.error("Firebase Listen Error:", error);
                setToast({msg: "يرجى التحقق من اتصال الإنترنت أو الفلاتر", type: 'error'});
                setLoading(false);
            });
            
            return unsubscribe;
        };

        const unsub = fetchAndSubscribe();
        return () => unsub();

    }, [selectedDate, activeView, enableDateFilter, activeModality, isArchiveView]);

    // ... (rest of the component remains the same)
    
    // --- Client Side Filtering (Fallback/Refinement) ---
    const filteredAppointments = useMemo(() => {
        let list = appointments;
        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            list = list.filter(a => 
                (a.patientName && a.patientName.toLowerCase().includes(lowerQ)) || 
                (a.fileNumber && a.fileNumber.includes(lowerQ)) ||
                (a.refNo && a.refNo.includes(lowerQ))
            );
        }
        return list;
    }, [appointments, searchQuery]);

    // --- FETCH ACTUAL SCHEDULED COUNT FOR QUOTA (OPTIMIZED) ---
    useEffect(() => {
        // Skip in Archive Mode
        if (isArchiveView) return;

        const fetchBookedCount = async () => {
            if (!selectedDate) {
                setCurrentBookedCount(0);
                return;
            }

            let typeKey = activeModality;
            if ((typeKey === 'OTHER' || typeKey === 'XRAY') && modalitySettings['X-RAY']) {
                 const otherLimit = modalitySettings['OTHER']?.limit;
                 if (otherLimit >= 99 && modalitySettings['X-RAY'].limit < 99) {
                     typeKey = 'X-RAY';
                 }
            }

            let q;
            if (typeKey !== 'ALL') {
                if (typeKey === 'X-RAY') {
                     q = query(collection(db, 'appointments'), where('status', '==', 'scheduled'), where('scheduledDate', '==', selectedDate), where('examType', 'in', ['X-RAY', 'XRAY', 'OTHER']));
                } else {
                     q = query(collection(db, 'appointments'), where('status', '==', 'scheduled'), where('scheduledDate', '==', selectedDate), where('examType', '==', typeKey));
                }
            } else {
                q = query(collection(db, 'appointments'), where('status', '==', 'scheduled'), where('scheduledDate', '==', selectedDate));
            }
            
            // Use aggregation query to save reads
            try {
                const snapshot = await getCountFromServer(q);
                setCurrentBookedCount(snapshot.data().count);
            } catch (e) {
                console.error("Count Error:", e);
            }
        };

        fetchBookedCount();
    }, [selectedDate, activeModality, isArchiveView]);


    // --- ACTIONS ---
    const handleAcceptPatient = async (appt: ExtendedAppointment) => {
        if (isArchiveView) return setToast({ msg: 'Cannot edit archived data', type: 'error' });
        try {
            setAppointments(prev => prev.filter(a => a.id !== appt.id));
            await updateDoc(doc(db, 'appointments', appt.id), {
                status: 'done',
                performedBy: currentUserId,
                performedByName: currentUserName,
                completedAt: new Date().toISOString()
            });

            setToast({ msg: `تم إنجاز ${appt.patientName} ✅`, type: 'success' });
        } catch(e: any) {
            setToast({msg: 'خطأ في العملية', type: 'error'});
        }
    };

    const handleDelete = async (id: string) => {
        if (isArchiveView) {
             setAppointments(prev => prev.filter(a => a.id !== id));
             return;
        }
        if(!confirm(t('confirm') + '?')) return;
        try {
            setAppointments(prev => prev.filter(a => a.id !== id));
            await deleteDoc(doc(db, 'appointments', id));
            setToast({ msg: t('delete'), type: 'success' });
        } catch(e) { console.error(e); }
    };
    
    const handleCancelAppointment = async (appt: ExtendedAppointment) => {
    if (isArchiveView) return;
    if (!confirm(t('appt.confirmCancel'))) return;
        try {
            setAppointments(prev => prev.filter(a => a.id !== appt.id));
            await updateDoc(doc(db, 'appointments', appt.id), {
                status: 'pending',
                scheduledDate: null,
                time: null,
                notes: appt.notes ? appt.notes + '\n[System]: Appointment Cancelled' : '[System]: Appointment Cancelled'
            });
            setToast({ msg: t('appt.toast.cancelled'), type: 'success' });
        } catch (e) {
            console.error(e);
        setToast({ msg: t('error.general'), type: 'error' });
        }
    };

    // --- NEW: HANDLE IMPORT ARCHIVE ---
    const handleImportLocalArchive = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                
                // Try to handle both raw array or { records: [] } format from DataArchiver
                let records: ExtendedAppointment[] = [];
                
                if (Array.isArray(json)) {
                    records = json;
                } else if (json.records && Array.isArray(json.records)) {
                    records = json.records;
                } else {
                    throw new Error("Invalid format");
                }
                
                // Map _id to id if necessary
                const mapped = records.map((r: any) => ({
                    ...r,
                    id: r._id || r.id
                }));

                setAppointments(mapped);
                setIsArchiveView(true);
                setArchiveFileName(file.name);
                setToast({ msg: `تم تحميل ${mapped.length} سجل محلياً (وضع الأرشيف)`, type: 'success' });

            } catch (err) {
                console.error(err);
                setToast({ msg: 'فشل قراءة الملف', type: 'error' });
            }
        };
        reader.readAsText(file);
    };

    const handleExitArchiveMode = () => {
        setIsArchiveView(false);
        setArchiveFileName('');
        setAppointments([]); // Will trigger refresh from live DB
        setToast({ msg: 'العودة للوضع المباشر (Live)', type: 'info' });
    };

    const checkAvailability = async (date: string, time: string, type: string) => {
        if (type === 'X-RAY' || type === 'OTHER') return true;
        
        const q = query(
            collection(db, 'appointments'),
            where('scheduledDate', '==', date),
            where('time', '==', time),
            where('examType', '==', type),
            where('status', 'in', ['scheduled', 'processing']) 
        );
        const snap = await getDocs(q);
        return snap.empty;
    };

    const handleStartExam = async (appt: ExtendedAppointment) => {
        if (isArchiveView) return;
        if (processingId) return;
        setProcessingId(appt.id);

        try {
            if (appt.status !== 'pending' && appt.status !== 'scheduled') {
                throw new Error(t('appt.alreadyTaken'));            
            }

            const settings = { ...modalitySettings };
            const modKey = appt.examType;
            const currentCount = settings[modKey]?.currentCounter || 1;
            const regNo = `${modKey}-${currentCount}`;

            settings[modKey] = {
                ...settings[modKey],
                currentCounter: currentCount + 1
            };
            saveSettings(settings);

            setAppointments(prev => prev.filter(a => a.id !== appt.id));

            await updateDoc(doc(db, 'appointments', appt.id), {
                status: 'processing',
                performedBy: currentUserId,
                performedByName: currentUserName,
                registrationNumber: regNo
            });
            
            setCurrentRegNo(regNo);
            setIsRegModalOpen(true);
            safeVibrate(200);

        } catch(e: any) {
            setToast({ msg: t('error.general'), type: 'error' });
        } finally {
            setProcessingId(null);
        }
    };

    const handleFinishClick = (appt: ExtendedAppointment) => {
        if (isArchiveView) return;
        if (appt.performedBy && appt.performedBy !== currentUserId && !isSupervisor) {
            setToast({ msg: t('appt.toast.anotherUser'), type: 'error' });         
            return;
        }
        setFinishingAppt(appt);
        setIsPanicModalOpen(true);
    };

    const handleConfirmFinish = async (isPanic: boolean) => {
        if (!finishingAppt) return;
        
        try {
            setAppointments(prev => prev.filter(a => a.id !== finishingAppt.id));

            await updateDoc(doc(db, 'appointments', finishingAppt.id), {
                status: 'done',
                completedAt: new Date().toISOString(),
                isPanic: isPanic,
                panicDetails: isPanic ? panicDescription : null
            });

            setToast({ 
                msg: isPanic ? t('appt.toast.panic') : t('appt.toast.finish'), 
                type: 'success' 
            });
            safeVibrate([100, 50, 100]);

            setIsPanicModalOpen(false);
            setFinishingAppt(null);
            setPanicDescription('');

        } catch (e) {
            console.error(e);
            setToast({ 
                msg: t('appt.toast.error'), 
                type: 'error'
            });
        }
    };

    const handleOpenBooking = (appt: ExtendedAppointment) => {
        setBookingAppt(appt);
        const tom = new Date(); tom.setDate(tom.getDate()+1);
        setBookingDate(tom.toISOString().split('T')[0]);
        setBookingTime("");
        setBookingRoom(appt.roomNumber || '');
        const mod = MODALITIES.find(m => m.id === appt.examType);
       setBookingPrep(mod?.defaultPrep || t('appt.noPrep'));
        setBookingWarning('');
        setIsBookingModalOpen(true);
    };

    useEffect(() => {
        const checkQuotaAndSlots = async () => {
            if (!bookingAppt || !bookingDate || !isBookingModalOpen || isArchiveView) return;
            setBookingWarning('');
            setAvailableSlots([]);
            setIsDayLimitReached(false);

            try {
                let typeKey = bookingAppt.examType;
                if (typeKey === 'OTHER' || typeKey === 'XRAY') {
                    typeKey = 'X-RAY';
                }

                let q;
                if (typeKey === 'X-RAY') {
                    q = query(collection(db, 'appointments'), where('status', '==', 'scheduled'), where('scheduledDate', '==', bookingDate), where('examType', 'in', ['X-RAY', 'XRAY', 'OTHER']));
                } else {
                    q = query(collection(db, 'appointments'), where('status', '==', 'scheduled'), where('scheduledDate', '==', bookingDate), where('examType', '==', typeKey));
                }

                const snap = await getCountFromServer(q);
                const currentCount = snap.data().count;
                
                const settings = modalitySettings[typeKey] || DEFAULT_SETTINGS['OTHER'];
                const limit = settings.limit;
                const definedSlots = settings.slots || [];

                if (currentCount >= limit) {
                    const warningMsg = t('appt.limitWarning')
                        .replace('{count}', currentCount.toString())
                        .replace('{limit}', limit.toString())
                        .replace('{mod}', typeKey);

                    setBookingWarning(warningMsg);                    
                    setIsDayLimitReached(true);
                    setAvailableSlots([]);
                } else {
                    setBookingWarning(`✅ متاح: ${limit - currentCount} أماكن (${typeKey}).`);
                    setIsDayLimitReached(false);
                    if (definedSlots.length > 0) {
                        // We need the times to filter slots
                        const timeQuery = query(collection(db, 'appointments'), where('status', '==', 'scheduled'), where('scheduledDate', '==', bookingDate));
                        const timeSnap = await getDocs(timeQuery);
                        const bookedTimes = timeSnap.docs.map(d => (d.data() as any).time);
                        const free = definedSlots.filter(s => !bookedTimes.includes(s));
                        setAvailableSlots(free);
                    } else {
                        setAvailableSlots([]);
                    }
                }
            } catch(e) { console.error(e); }
        };
        checkQuotaAndSlots();
    }, [bookingDate, bookingAppt, modalitySettings, isBookingModalOpen]);

    const confirmBooking = async () => {
        if (!bookingAppt || !bookingDate || (!bookingTime && (!isDayLimitReached || isSupervisor))) {
            setToast({msg: t('appt.slotsAvailable'), type: 'error'});
            return;
        }
        
        if (isDayLimitReached && !isSupervisor) {
             setToast({msg: t('appt.dayFull'), type: 'error'});
             return;
        }

        try {
            setAppointments(prev => prev.filter(a => a.id !== bookingAppt.id));

            await updateDoc(doc(db, 'appointments', bookingAppt.id), {
                status: 'scheduled',
                scheduledDate: bookingDate,
                time: bookingTime || '08:00', 
                roomNumber: bookingRoom, 
                preparation: bookingPrep, 
                notes: `${bookingAppt.notes || ''}\n📅 Booked: ${bookingDate} ${bookingTime}`
            });

            setBookedTicketId(bookingAppt.id);
            setIsBookingModalOpen(false);
            setIsTicketModalOpen(true);
            setBookingAppt(null);
            
            if (bookingDate !== selectedDate) {
                 setToast({ msg: `Booked for ${bookingDate}. Switch date to view.`, type: 'info' });
            }
            
            safeVibrate(100);
        } catch(e) { setToast({ msg: t('appt.saveError'), type: 'error' }); }
    };

    const handleUndo = async (appt: ExtendedAppointment) => {
        if (isArchiveView) return;
        if (!isSupervisor && appt.performedBy !== currentUserId) {
            setToast({ msg: t('appt.error.notYourColleague'), type: 'error' });
            return;
        }
        try {
            setAppointments(prev => prev.filter(a => a.id !== appt.id));
            await updateDoc(doc(db, 'appointments', appt.id), {
                status: 'pending',
                performedBy: null,
                performedByName: null,
                completedAt: null,
                isPanic: false
            });

            setToast({ msg: t('appt.confirmCancel'), type: 'info' });
        } catch(e) { console.error(e); }
    };

    const handleManualJsonProcess = async () => {
        try {
            const raw = JSON.parse(manualJsonInput);
            await processIncomingData(raw);
            setManualJsonInput('');
            setIsBridgeModalOpen(false);
            setToast({ msg: 'تمت معالجة البيانات بنجاح ✅', type: 'success' });
        } catch(e) {
            setToast({msg: 'صيغة JSON غير صحيحة', type: 'error'});
        }
    }

    const currentModalityLimit = useMemo(() => {
        if (activeModality === 'ALL') return null;
        return modalitySettings[activeModality]?.limit || 0;
    }, [activeModality, modalitySettings]);

    const isDayFull = useMemo(() => {
        if (activeModality === 'ALL' || !currentModalityLimit) return false;
        return currentBookedCount >= currentModalityLimit;
    }, [currentBookedCount, activeModality, currentModalityLimit]);

    const handleEditBooking = (appt: ExtendedAppointment) => {
        setBookingAppt(appt);
        setBookingDate(appt.scheduledDate || appt.date);
        setBookingTime(appt.time || '');
        setBookingRoom(appt.roomNumber || '');
        setBookingPrep(appt.preparation || '');
        setIsBookingModalOpen(true);
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isArchiveView) return;
        if (!patientName || !examType) return;

        if (await checkAvailability(manualDate, manualTime, examType) === false) {
            setToast({ 
                msg: t('appt.error.alreadyBooked').replace('{time}', manualTime), 
                type: 'error' 
            });
            return;
        }

        try {
            // Unify Type Logic
            let typeKey = examType;
            if (typeKey === 'OTHER' || typeKey === 'XRAY') typeKey = 'X-RAY';

            const q = query(
                collection(db, 'appointments'),
                where('status', '==', 'scheduled'),
                where('scheduledDate', '==', manualDate),
                typeKey === 'X-RAY' ? where('examType', 'in', ['X-RAY', 'XRAY', 'OTHER']) : where('examType', '==', typeKey)
            );
            const snap = await getCountFromServer(q);
            const count = snap.data().count;
            
            const settings = modalitySettings[typeKey] || DEFAULT_SETTINGS['OTHER'];
            const limit = settings.limit;
            
            if (count >= limit && !isSupervisor) {
                setToast({ 
                    msg: t('appt.limitWarning').replace('{count}', count.toString()).replace('{limit}', limit.toString()).replace('{mod}', typeKey), 
                    type: 'error' 
                });
                return;
            }
        } catch(e) { console.error("Limit check error", e); }

        try {
            const uniqueId = `MANUAL_${Date.now()}`;
            const status = manualDate ? 'scheduled' : 'pending';
            const examList = specificExamName ? [specificExamName] : [examType];

            await setDoc(doc(db, 'appointments', uniqueId), {
                id: uniqueId,
                patientName,
                fileNumber,
                doctorName,
                patientAge,
                examType,
                examList: examList, 
                date: manualDate || selectedDate,
                time: manualTime,
                scheduledDate: manualDate, 
                roomNumber: manualRoom,
                notes,
                preparation: preparationText, 
                status: status,
                createdBy: currentUserId,
                createdByName: currentUserName,
                createdAt: new Date().toISOString()
            });

        setToast({ msg: t('appt.toast.addSuccess'), type: 'success' });
            setIsAddModalOpen(false);
            
            setBookedTicketId(uniqueId);
            setIsTicketModalOpen(true);

            setPatientName(''); setFileNumber(''); setNotes(''); setDoctorName(''); setPatientAge('');
            setManualRoom(''); setSpecificExamName(''); setPreparationText('');
        } catch (e: any) { 
            console.error(e);
            setToast({ msg: 'خطأ: ' + e.message, type: 'error' }); 
        }
    };

    const saveSettings = async (newSettings: Record<string, ModalitySettings>) => {
        setModalitySettings(newSettings); 
        try {
            const docRef = doc(db, 'system_settings', 'appointment_slots');
            await setDoc(docRef, newSettings); 
        } catch (e) {
            console.error("Error saving counter:", e);
        }
    };

    const handleSaveSettings = async () => {
        try {
            await setDoc(doc(db, 'system_settings', 'appointment_slots'), modalitySettings);
        setToast({ msg: t('appt.toast.settingsUpdated'), type: 'success' });
            setIsSettingsModalOpen(false);
        } catch (e) {
            setToast({ msg: t('appt.toast.settingsError'), type: 'error' });
        }
    };




    // --- NEW EXTENSION LOGIC ---
    const downloadFile = (filename: string, content: string) => {
        const element = document.createElement('a');
        const file = new Blob([content], {type: 'text/plain'});
        element.href = URL.createObjectURL(file);
        element.download = filename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const handleDownloadManifest = () => {
        const manifest = {
            "manifest_version": 3,
            "name": "Smart Employee Bridge",
            "version": "2.0",
            "description": "Auto-sync patient data from Hospital System (IHMS) to Smart Employee App.",
            "host_permissions": [
                "http://*/*",
                "https://*/*"
            ],
            "content_scripts": [
                {
                    "matches": [
                        "http://*/*",
                        "https://*/*"
                    ],
                    "js": ["smart-bridge.js"],
                    "world": "MAIN",
                    "run_at": "document_start"
                }
            ]

        };
        downloadFile('manifest.json', JSON.stringify(manifest, null, 2));
    };

    // Helper for generating the script content
    const generateBridgeScript = () => {
        const currentOrigin = window.location.href.split('#')[0];
        const targetUrl = `${currentOrigin}#/appointments`;

        return `
/* 🚀 AJ-SMART-BRIDGE AUTO-INJECTOR V2.7 Hidden UI + Silent Console */
(function () {
    if (window.AJ_BRIDGE_ACTIVE) return;
    window.AJ_BRIDGE_ACTIVE = true;

    // ... (rest of script as before) ...
`;

    };

    const handleDownloadExtensionScript = () => {
        const scriptContent = generateBridgeScript();
        downloadFile('smart-bridge.js', scriptContent);
    };

    const handleCopyScript = () => {
        const scriptContent = generateBridgeScript();
        navigator.clipboard.writeText(scriptContent).then(() => {
            setToast({ msg: 'Script copied to clipboard! 📋', type: 'success' });
        }).catch(() => {
            setToast({ msg: 'Failed to copy script.', type: 'error' });
        });
    };

   
    const fetchLogbookData = async () => {
        setIsLogLoading(true);
        try {
            // Using query directly instead of getDocs first is better for Firestore reads
            // Query only what we need to minimize reads
            const q = query(
                collection(db, 'appointments'),
                where('status', '==', 'done'),
                where('completedAt', '>=', `${logStartDate}T00:00:00`),
                where('completedAt', '<=', `${logEndDate}T23:59:59`),
                orderBy('completedAt', 'asc')
            );
            const snap = await getDocs(q);
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExtendedAppointment));
            setLogbookData(data);
        } catch (e) {
            console.error(e);
            setToast({ msg: 'Error fetching logbook', type: 'error' });
        } finally {
            setIsLogLoading(false);
        }
    };

    const getLogbookData = (type: 'MRI' | 'CT' | 'XRAY') => {
        // Use logbookData if available, otherwise fallback to empty to avoid large reads
        const sourceData = logbookData; 
        return sourceData.filter(a => {
            if (type === 'MRI') return a.examType === 'MRI';
            if (type === 'CT') return a.examType === 'CT';
            return a.examType !== 'MRI' && a.examType !== 'CT'; 
        });
    };

    const LogTable = ({ title, type }: { title: string, type: 'MRI' | 'CT' | 'XRAY' }) => {
        const data = getLogbookData(type);
        if (data.length === 0) return null;

        return (
            <div className="mb-8 break-after-page page-break-always print:block">
                <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-2 print:flex">
                    <h2 className="text-xl font-black">{title} - Logbook</h2>
                    <span className="font-mono font-bold">
                        {logStartDate === logEndDate ? logStartDate : `${logStartDate} to ${logEndDate}`}
                    </span>
                </div>
                <table className="w-full text-xs border border-black border-collapse">
                    <thead>
                        <tr className="bg-gray-200">
                            <th className="border border-black p-1 w-8">#</th>
                            <th className="border border-black p-1">Date</th>
                            <th className="border border-black p-1">Time</th>
                            <th className="border border-black p-1">Reg No</th>
                            <th className="border border-black p-1">Patient Name</th>
                            <th className="border border-black p-1">ID / File</th>
                            <th className="border border-black p-1">Exam</th>
                            <th className="border border-black p-1">Performed By</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => (
                                <tr key={row.id}>
                                    <td className="border border-black p-1 text-center">{i + 1}</td>
                                    <td className="border border-black p-1 text-center font-mono">{row.date}</td>
                                    <td className="border border-black p-1 text-center font-mono">{row.time}</td>
                                    <td className="border border-black p-1 text-center font-bold">{row.registrationNumber || '-'}</td>
                                    <td className="border border-black p-1 font-bold">{row.patientName}</td>
                                    <td className="border border-black p-1 text-center font-mono">{row.fileNumber}</td>
                                    <td className="border border-black p-1">{row.examList ? row.examList.join(', ') : row.examType}</td>
                                    <td className="border border-black p-1 text-center">{row.performedByName || '-'}</td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
                <div className="mt-2 text-right text-xs font-bold">Total {title}: {data.length} Cases</div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* ARCHIVE MODE BANNER */}
            {isArchiveView && (
                <div className="bg-amber-500 text-white text-center py-2 font-bold text-sm sticky top-0 z-50 shadow-md flex justify-center items-center gap-4">
                    <span>⚠️ وضع الأرشيف المحلي: يتم عرض بيانات من الملف "{archiveFileName}"</span>
                    <button onClick={handleExitArchiveMode} className="bg-white text-amber-600 px-3 py-1 rounded text-xs hover:bg-slate-100 font-bold shadow-sm">
                        عودة للمباشر (Back to Live)
                    </button>
                </div>
            )}

            <div className="bg-slate-900 text-white p-4 sticky top-0 z-30 shadow-2xl print:hidden">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                            <i className="fas fa-arrow-left rtl:rotate-180"></i>
                        </button>
                        <div>
                            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                                {t('appt.title')}
                                {isListening && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>}
                            </h1>
                            <div className="flex items-center gap-3 text-xs opacity-70 font-mono mt-1">
                                {activeView === 'scheduled' ? (
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="date" 
                                            value={selectedDate} 
                                            onChange={e => setSelectedDate(e.target.value)} 
                                            className="bg-transparent border-none text-white p-0 text-xs font-bold focus:ring-0" 
                                        />
                                        <button 
                                            onClick={() => setEnableDateFilter(!enableDateFilter)}
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${enableDateFilter ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-transparent text-slate-400 border-slate-600'}`}
                                        >
                                            {enableDateFilter ? 'Filter ON' : 'All Upcoming'}
                                        </button>
                                    </div>
                                ) : (
                                    <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} className="bg-transparent border-none text-white p-0 text-xs font-bold focus:ring-0" />
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex-1 w-full md:max-w-md mx-4">
                        <div className="relative">
                            <i className="fas fa-search absolute left-3 top-2.5 text-slate-400 text-sm"></i>
                            <input 
                                className="w-full bg-slate-800 border border-slate-700 rounded-full py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                placeholder={t('appt.searchPlaceholder')}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-white">
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* IMPORT LOCAL ARCHIVE BUTTON */}
                        {!isArchiveView && (
                            <label className="bg-slate-700 hover:bg-slate-600 text-white w-9 h-9 rounded-lg flex items-center justify-center shadow-lg transition-all cursor-pointer" title="استيراد أرشيف (محلي)">
                                <i className="fas fa-file-import"></i>
                                <input type="file" accept=".json" onChange={handleImportLocalArchive} className="hidden" />
                            </label>
                        )}

                        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                            <button 
                            onClick={() => setActiveView('pending')} 
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'pending' ? 'bg-amber-500 text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}
                            >{t('appt.status.waiting')}   </button>                     
                            <button onClick={() => setActiveView('processing')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'processing' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                                    >{t("appt.status.work")}</button>
                            <button onClick={() => setActiveView('scheduled')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'scheduled' ? 'bg-purple-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                                >{t("appt.status.schudle")}</button>
                            <button onClick={() => setActiveView('done')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'done' ? 'bg-emerald-500 text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}
                                >{t('appt.done')}</button>
                        </div>
                        {isSupervisor && (
                            <button onClick={() => setIsSettingsModalOpen(true)} className="bg-slate-700 hover:bg-slate-600 text-white w-9 h-9 rounded-lg flex items-center justify-center shadow-lg transition-all" 
                            title={t("appt.settings")}>
                                <i className="fas fa-cog"></i>
                            </button>
                        )}
                        <button onClick={() => setIsBridgeModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white w-9 h-9 rounded-lg flex items-center justify-center shadow-lg transition-all" title="Auto Sync">
                            <i className={`fas fa-satellite-dish ${isListening ? 'animate-pulse' : ''}`}></i>
                        </button>
                        <button onClick={() => setIsAddModalOpen(true)} className="bg-white text-slate-900 w-fit px-4 h-9 rounded-lg flex items-center justify-center font-bold shadow-lg hover:bg-slate-200 transition-all gap-2">
                            <i className="fas fa-plus"></i> <span className="hidden md:inline">{t('appt.new')}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white border-b border-slate-200 sticky top-[72px] z-20 shadow-sm overflow-x-auto no-scrollbar print:hidden">
                <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 py-2 min-w-max">
                    <button 
                        onClick={() => setActiveModality('ALL')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeModality === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    >
                        <i className="fas fa-layer-group"></i> All 
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeModality === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                            {appointments.length}
                        </span>
                    </button>
                    <div className="w-px h-6 bg-slate-200 mx-2"></div>
                    {MODALITIES.filter(m => m.id !== 'OTHER').map(mod => {
                        // Count based on current view/filter context
                        const count = appointments.filter(a => mod.id === 'X-RAY' ? (a.examType === 'X-RAY' || a.examType === 'OTHER') : a.examType === mod.id).length;
                        return (
                            <button 
                                key={mod.id}
                                onClick={() => setActiveModality(mod.id)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border ${activeModality === mod.id ? `${mod.color} ${mod.border}` : 'bg-white border-transparent text-slate-500 hover:bg-slate-50'}`}
                            >
                                <i className={`fas ${mod.icon}`}></i> {mod.label}
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${activeModality === mod.id ? 'bg-white/30 text-current' : 'bg-slate-100 text-slate-500'}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
            
{isDayFull && activeView !== 'done' && (
    <div className="mx-4 mb-6 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-rose-500 to-red-600 animate-gradient-x opacity-10 blur-xl group-hover:opacity-20 transition-opacity"></div>
        <div className="relative bg-white border-2 border-red-100 p-5 rounded-[2rem] shadow-xl shadow-red-100/50 flex flex-col md:flex-row items-center justify-between gap-4 overflow-hidden">
            <div className="absolute right-0 top-0 w-24 h-24 bg-red-50 rounded-full -mr-12 -mt-12 opacity-50"></div>
            
            <div className="flex items-center gap-5 z-10">
                <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-rose-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-red-200 animate-bounce-subtle">
                    <i className="fas fa-calendar-times text-2xl"></i>
                </div>
                <div>
                    <h3 className="text-red-900 font-black text-lg leading-tight">{t('appt.dayFull')}</h3>
                    <p className="text-red-500 text-[11px] font-bold uppercase tracking-widest mt-1 flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                        Full Capacity Reached for {activeModality}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-4 bg-red-50 px-6 py-3 rounded-2xl border border-red-100 z-10">
                <div className="text-center">
                    <p className="text-[10px] font-black text-red-400 uppercase">Limit</p>
                    <p className="text-xl font-black text-red-800">{currentModalityLimit}</p>
                </div>
                <div className="w-[2px] h-8 bg-red-200"></div>
                <div className="text-center">
                    <p className="text-[10px] font-black text-red-400 uppercase">Current</p>
                    <p className="text-xl font-black text-red-800">{currentBookedCount}</p>
                </div>
            </div>
            
            {isSupervisor && (
                <button 
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="z-10 bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-black transition-all shadow-md"
                >
                {t('appt.editCapacity')}<i className="fas fa-cog ml-1"></i>
                </button>
            )}
        </div>
    </div>
)}

            <div className="max-w-7xl mx-auto px-4 py-6 print:hidden">
                
                {loading ? <Loading /> : filteredAppointments.length === 0 ? (
                    <div className="text-center py-24 opacity-50">
                        <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl text-slate-400">
                            {activeView === 'pending' ? <i className="fas fa-coffee"></i> : <i className="fas fa-calendar-check"></i>}
                        </div>
                        <p className="font-bold text-slate-500 text-lg">
                        {searchQuery ? t( 'appt.noList') : t( 'appt.noResults')}
                        </p>
                        <button onClick={() => setIsAddModalOpen(true)} className="mt-4 text-blue-600 font-bold hover:underline">
                           {t('appt.addFirst')}
                        </button>
                        
                        {activeView === 'done' && (
                             <button onClick={() => setIsLogBookOpen(true)} className="mt-4 block mx-auto text-emerald-600 font-bold hover:underline">
                                 Open Full Logbook
                             </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredAppointments.map(appt => {
                            const mod = MODALITIES.find(m => m.id === appt.examType) || MODALITIES[MODALITIES.length - 1];
                            const isScheduled = appt.status === 'scheduled';
                            
                            const dateDisplay = appt.scheduledDate || appt.date;
                            const timeDisplay = appt.time;

                            return (
                                <div key={appt.id} className={`relative bg-white rounded-2xl p-4 shadow-sm border-l-4 transition-all hover:-translate-y-1 animate-fade-in ${appt.status === 'done' ? 'border-l-emerald-500 bg-emerald-50/30' : isScheduled ? 'border-l-blue-500' : 'border-l-amber-500 shadow-md'}`}>
                                    
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider border ${mod.color} ${mod.border}`}>
                                            <i className={`fas ${mod.icon} mr-1`}></i> {mod.label}
                                        </span>
                                        <div className="flex flex-col items-end">
                                            {isScheduled ? (
                                                <button 
                                                    onClick={() => window.open(`#/ticket/${appt.id}`, '_blank')}
                                                    className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 hover:bg-blue-100 flex items-center gap-1 cursor-pointer"
                                                >
                                                    {dateDisplay} <i className="fas fa-qrcode"></i>
                                                </button>
                                            ) : (
                                                <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                                    {timeDisplay}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <h3 className="font-bold text-slate-800 text-base leading-tight mb-1 truncate" title={appt.patientName}>{appt.patientName}</h3>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">ID: {appt.fileNumber}</span>
                                        {appt.patientAge && <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Age: {appt.patientAge}</span>}
                                    </div>

                                    <div className="mb-3 bg-slate-50 rounded-lg p-2 border border-slate-100 min-h-[40px]">
                                        {appt.examList && Array.isArray(appt.examList) && appt.examList.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {appt.examList.map((exam, i) => (
                                                    <span key={i} className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded shadow-sm break-words max-w-full">
                                                        {typeof exam === 'string' ? exam : 'Exam'}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-slate-400 italic">General Exam</p>
                                        )}
                                    </div>
                                    
                                    {isScheduled && appt.roomNumber && (
                                        <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-100">
                                            <i className="fas fa-door-open"></i> {t('appt.room')}: {appt.roomNumber}
                                        </div>
                                        
                                    )}
                                    {isScheduled && (
                                    <button
                                        onClick={() => handleCancelAppointment(appt)}
                                        className="px-3 py-1 text-xs font-bold rounded bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200"
                                    >
                                       {t('appt.cancelWait')}
                                    </button>
                                    )}
                                    {appt.status === 'scheduled' && (
                                    <button
                                        onClick={() => handleEditBooking(appt)}
                                        className="px-3 py-1 text-xs font-bold rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                                    >
                                        {t('edit')}
                                    </button>
                                    )}

                                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-50">
                                        {appt.status === 'pending' || appt.status === 'scheduled' ? (
                                            <>
                                                {appt.status === 'pending' && <button onClick={() => handleOpenBooking(appt)} disabled={processingId === appt.id} className="flex-1 bg-white border border-blue-200 text-blue-600 py-2 rounded-lg font-bold text-xs hover:bg-blue-50 transition-colors disabled:opacity-50 cursor-pointer"><i className="fas fa-calendar-alt"></i> {t('appt.book')}</button>}
                                                <button onClick={() => handleStartExam(appt)} disabled={processingId === appt.id} className="flex-[2] bg-slate-800 text-white py-2 rounded-lg font-bold text-xs hover:bg-blue-600 transition-colors shadow-sm flex items-center justify-center gap-1 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer">
                                                    {processingId === appt.id ? <i className="fas fa-spinner fa-spin"></i> : <span>{t('appt.startExam')} <i className="fas fa-play"></i></span>}
                                                </button>
                                            </>
                                        ) : appt.status === 'processing' ? (
                                            <div className="w-full flex gap-2">
                                                <div className="flex-1 bg-blue-50 text-blue-700 px-2 py-2 rounded-lg text-xs font-bold text-center border border-blue-100">
                                                    <i className="fas fa-user-clock"></i> {appt.performedByName || 'Unknown'}
                                                </div>
                                                <button onClick={() => handleFinishClick(appt)} className="flex-[2] bg-emerald-500 text-white py-2 rounded-lg font-bold text-xs hover:bg-emerald-600 transition-colors shadow-md flex items-center justify-center gap-1 cursor-pointer">
                                                    <span>{t('appt.finish')}</span> <i className="fas fa-check-double"></i>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-full flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                                                    <i className="fas fa-check-circle text-lg"></i>
                                                    <div className="flex flex-col">
                                                        <span>{t('appt.finish')}</span>
                                                        <span className="text-[9px] text-slate-400 font-normal">{appt.performedByName}</span>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleUndo(appt)} className="text-slate-300 hover:text-red-500 px-2 cursor-pointer" title="Undo"><i className="fas fa-undo"></i></button>
                                            </div>
                                            
                                        )}
                                    </div>
                                    
                                    {isSupervisor && (
                                        <button onClick={() => handleDelete(appt.id)} className="absolute top-2 left-2 text-slate-200 hover:text-red-400 transition-colors cursor-pointer">
                                            <i className="fas fa-times text-xs"></i>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
             <Modal isOpen={isBookingModalOpen} onClose={() => setIsBookingModalOpen(false)} title="جدولة موعد">
                <div className="space-y-4">
                    {/* UPDATED: Detailed Card Header for Booking */}
                    {bookingAppt && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 shadow-sm">
                           <div className="flex justify-between items-start">
                              <div>
                                 <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Patient Name</span>
                                 <h3 className="font-bold text-lg text-slate-800">{bookingAppt.patientName}</h3>
                                 <span className="text-xs text-slate-500 font-bold">#{bookingAppt.fileNumber}</span>
                              </div>
                              <div className="text-right">
                                 <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Exam</span>
                                 <h3 className="font-bold text-blue-600 text-sm max-w-[150px] truncate">{bookingAppt.examList?.[0] || bookingAppt.examType}</h3>
                                 <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-200">{bookingAppt.examType}</span>
                              </div>
                           </div>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">{t('appt.appdate')}</label>
                            <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold" value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">{t('appt.apptime')}</label>
                            
                            {/* NEW: Limit Check Logic */}
                            {isDayLimitReached && !isSupervisor ? (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                                    <p className="text-red-700 font-bold text-xs mb-1">{t('appt.dayFull')}</p>
                                    <p className="text-[10px] text-red-500">{bookingWarning}</p>
                                </div>
                            ) : (
                                availableSlots.length > 0 ? (
                                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-700" value={bookingTime} onChange={e => setBookingTime(e.target.value)}>
                                        <option value="">{t("app.select")}</option>
                                        {availableSlots.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                                    </select>
                                ) : (
                                    <input 
                                        type="time" 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold" 
                                        value={bookingTime} 
                                        onChange={e => setBookingTime(e.target.value)} 
                                        // If empty slots but not limited yet (unlikely here due to above check), fallback
                                    />
                                )
                            )}
                        </div>
                    </div>
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">{t('appt.room')}</label><input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold" placeholder="مثال: غرفة 3" value={bookingRoom} onChange={e => setBookingRoom(e.target.value)} /></div>
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">{t('appt.prep')}</label><textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold min-h-[80px]" value={bookingPrep} onChange={e => setBookingPrep(e.target.value)} /></div>
                    {bookingWarning && <div className={`text-xs font-bold p-3 rounded-lg border ${bookingWarning.includes('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{bookingWarning}</div>}
                    
                    <button 
                        onClick={confirmBooking} 
                        disabled={isDayLimitReached && !isSupervisor}
                        className={`w-full py-3 rounded-xl font-bold shadow-lg transition-all cursor-pointer ${isDayLimitReached && !isSupervisor ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                       {t( 'appt.confirm')}
                    </button>
                </div>
            </Modal>

            {/* Ticket Success Modal */}
            <Modal
  isOpen={isTicketModalOpen}
  onClose={() => setIsTicketModalOpen(false)}
  title={t('appt.successBook')}
>
  <div className="space-y-6 text-center">
    {bookedTicketData && (
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-left rtl:text-right">
        <h3 className="font-bold text-lg text-slate-800 mb-1">{bookedTicketData.patientName}</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
          <div><span className="font-bold">ID:</span> {bookedTicketData.fileNumber}</div>
          <div><span className="font-bold">Exam:</span> {bookedTicketData.examType}</div>
          <div><span className="font-bold">Date:</span> {bookedTicketData.scheduledDate}</div>
          <div><span className="font-bold">Time:</span> {bookedTicketData.time}</div>
          <div className="col-span-2 mt-6 text-center">
            <p className="font-bold mb-2">{t( 'appt.prep')}</p>

          </div>
        </div>
      </div>

                        
                    )}

                    <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl border border-emerald-100 flex flex-col items-center">
                        <i className="fas fa-check-circle text-4xl mb-2 text-emerald-500"></i>
                        <p className="font-bold text-lg">{t("appt.reg")}</p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl border-2 border-slate-100 flex flex-col items-center">
                        <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + '/#/ticket/' + bookedTicketId)}`}
                            alt="Appointment QR"
                            className="w-48 h-48 rounded-lg shadow-sm mb-4"
                        />
                        <p className="text-sm text-slate-500 font-bold">{t('appt.scanTicket')}</p>
                    </div>

                    <button 
                        onClick={() => window.open(`#/ticket/${bookedTicketId}`, '_blank')}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-slate-800 cursor-pointer"
                    >
                        <i className="fas fa-print"></i> {t('appt.openTicket')}
                    </button>
                </div>
            </Modal>

            {/* Add Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="إضافة موعد جديد">
                <div className="space-y-4">
                    {/* Manual Form Only - Scan Removed */}
                    <form onSubmit={handleManualSubmit} className="space-y-4 pt-2">
                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 mb-4">
                            <p className="text-xs text-blue-800 font-bold mb-2">{t('appt.manualData')}</p>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500">{t('date')}</label>
                                    <input type="date" className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold" value={manualDate} onChange={e=>setManualDate(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500">{t('time')}</label>
                                    {modalitySettings[examType]?.slots?.length > 0 ? (
                                        <select className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold" value={manualTime} onChange={e=>setManualTimeState(e.target.value)}>
                                            {modalitySettings[examType].slots.map(slot => (
                                                <option key={slot} value={slot}>{slot}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input type="time" className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold" value={manualTime} onChange={e=>setManualTimeState(e.target.value)} />
                                    )}
                                </div>
                            </div>
                            <div className="mt-2">
                                <label className="text-[10px] font-bold text-slate-500">{t('appt.room')}</label>
                                <input type="text" className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm" placeholder="example: MRI Room 1" value={manualRoom} onChange={e=>setManualRoom(e.target.value)} />
                            </div>
                        </div>

                        <input 
                            className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" 
                            placeholder={t('appt.patientName')} 
                            value={patientName} 
                            onChange={e => setPatientName(e.target.value)} 
                            required 
                            />
                        <input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder={t('appt.fileNo')} value={fileNumber} onChange={e=>setFileNumber(e.target.value)} />
                        
                        <div className="grid grid-cols-2 gap-4">
                            <input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder={t('appt.doctor')} value={doctorName} onChange={e=>setDoctorName(e.target.value)} />
                            <input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder={t('appt.age')} value={patientAge} onChange={e=>setPatientAge(e.target.value)} />
                        </div>
                        
                        <select className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" value={examType} onChange={e=>setExamType(e.target.value)}>
                            {MODALITIES.filter(m => m.id !== 'ALL').map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>

                        <div>
                            <label className="text-xs font-bold text-slate-500">{t('appt.specificExam')}</label>
                            <input 
                                className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold mt-1" 
                                placeholder="مثال: Brain MRI with Contrast" 
                                value={specificExamName} 
                                onChange={e=>setSpecificExamName(e.target.value)} 
                            />
                        </div>

                        <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                            <label className="text-xs font-bold text-amber-800 flex items-center gap-1 mb-1">
                                <i className="fas fa-exclamation-circle"></i>{t('appt.prepInst')}
                            </label>
                            <textarea 
                                className="w-full bg-white border border-amber-200 rounded-lg p-2 text-sm min-h-[80px]" 
                                placeholder={t('appt.prepInst')}
                                value={preparationText} 
                                onChange={e=>setPreparationText(e.target.value)} 
                            />
                        </div>
                        
                        <textarea className="w-full bg-slate-50 border-none rounded-xl p-3" placeholder="ملاحظات إضافية" value={notes} onChange={e=>setNotes(e.target.value)} />
                        
                        <button className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg cursor-pointer">
                            {t('appt.savePrint')}
                        </button>
                    </form>
                </div>
            </Modal>

            {/* Supervisor Settings Modal */}
            <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="إعدادات المواعيد (للمشرف)">
                <div className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800 font-bold mb-4">
                        {t('appt.settingsWarning')}
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {MODALITIES.filter(m => m.id !== 'ALL').map(mod => (
                            <button 
                                key={mod.id}
                                onClick={() => setEditingModalityId(mod.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border whitespace-nowrap cursor-pointer ${editingModalityId === mod.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
                            >
                                {mod.label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                        <h4 className="font-bold text-slate-700">{editingModalityId} Settings</h4>
                        <div className="border-t pt-4">
  <label className="text-xs font-bold text-slate-600 block mb-2">
   {t('appt.slotsCount')
  }
    </label>

  <input
    type="number"
    min={0}
    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold mb-3"
    placeholder="example: 15"
    value={manualSlotsCount || ''}
    onChange={e => {
      const count = parseInt(e.target.value) || 0;
      setManualSlotsCount(count);

      const newSlots = Array.from({ length: count }, (_, i) => manualSlots[i] || '');
      setManualSlots(newSlots);

      setModalitySettings(prev => ({
        ...prev,
        [editingModalityId]: {
          ...prev[editingModalityId],
          slots: newSlots.filter(Boolean),
          limit: count
        }
      }));
    }}
  />
</div>

  {manualSlotsCount > 0 && (
  <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      {manualSlots.map((slot, index) => (
        <input
          key={index}
          type="time"
          className="bg-white border border-slate-300 rounded p-1 text-xs font-mono"
            value={normalizeTime(slot)}
          onChange={e => {
            const updated = [...manualSlots];
            updated[index] = e.target.value;
            setManualSlots(updated);

            setModalitySettings(prev => ({
              ...prev,
              [editingModalityId]: {
                ...prev[editingModalityId],
                slots: updated.filter(Boolean),
                limit: updated.length
              }
            }));
          }}
        />
      ))}
    </div>

    {/* زر إضافة موعد */}
    <button
      onClick={() => {
        const updated = [...manualSlots, ''];
        setManualSlots(updated);
        setManualSlotsCount(updated.length);

        setModalitySettings(prev => ({
          ...prev,
          [editingModalityId]: {
            ...prev[editingModalityId],
            slots: updated.filter(Boolean),
            limit: updated.length
          }
        }));
      }}
      className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-2 rounded-lg hover:bg-emerald-200 w-fit"
    >
      {t('add')}
    </button>
  </div>
  
)}



                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">{t('appt.defaultPrep')}</label>
                            <textarea 
                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm min-h-[80px]"
                                placeholder={t("appt.construc")}
                                value={modalitySettings[editingModalityId]?.prep || ''}
                                onChange={e => setModalitySettings(prev => ({
                                    ...prev,
                                    [editingModalityId]: { ...prev[editingModalityId], prep: e.target.value }
                                }))}
                            />
                        </div>

                    </div>
                    

                    <button onClick={handleSaveSettings} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-slate-800 cursor-pointer">
                        {t('appt.saveSettings')}
                    </button>
                </div>
            </Modal>

            {/* Bridge Modal (UPDATED with Extension Tab) */}
            <Modal isOpen={isBridgeModalOpen} onClose={() => setIsBridgeModalOpen(false)} title={t('appt.bridge')}>
                <div className="space-y-4">
                    {/* Tabs */}
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                        <button 
                            onClick={() => setBridgeTab('extension')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${bridgeTab === 'extension' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}
                        >
                            <i className="fab fa-chrome mr-2"></i> Chrome Extension
                        </button>
                        <button 
                            onClick={() => setBridgeTab('manual')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${bridgeTab === 'manual' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                        >
                            <i className="fas fa-code mr-2"></i> Console Script
                        </button>
                    </div>

                    {bridgeTab === 'extension' && (
                        <div className="space-y-4 text-center animate-fade-in">
                             <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-xs text-emerald-800">
                                <p className="font-bold mb-2">✨ الطريقة الأسهل والأسرع!</p>
                                <p>قم بتحميل هذه الملفات مرة واحدة، وثبتها في المتصفح ليعمل الربط تلقائياً دائماً.</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={handleDownloadManifest} className="bg-slate-800 text-white py-3 rounded-xl font-bold text-xs hover:bg-slate-700 flex flex-col items-center gap-1 shadow-md">
                                    <i className="fas fa-file-code text-yellow-400 text-lg"></i>
                                    1. manifest.json
                                </button>
                                <button onClick={handleDownloadExtensionScript} className="bg-slate-800 text-white py-3 rounded-xl font-bold text-xs hover:bg-slate-700 flex flex-col items-center gap-1 shadow-md">
                                    <i className="fab fa-js text-blue-400 text-lg"></i>
                                    2. smart-bridge.js
                                </button>
                            </div>
                            
                            <div className="text-left bg-slate-50 p-3 rounded-lg border border-slate-200 text-[10px] text-slate-500">
                                <strong>طريقة التثبيت:</strong>
                                <ol className="list-decimal list-inside mt-1 space-y-1">
                                    <li>ضع الملفين في مجلد جديد.</li>
                                    <li>افتح <code>chrome://extensions</code> في المتصفح.</li>
                                    <li>فعل "Developer mode".</li>
                                    <li>اضغط "Load unpacked" واختار المجلد.</li>
                                </ol>
                            </div>
                        </div>
                    )}

                    {bridgeTab === 'manual' && (
                        <div className="space-y-4 text-center animate-fade-in">
                            <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                            {t('appt.bridgeInfo')}
                            </p>
                            <button onClick={handleCopyScript} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 cursor-pointer">
                                <i className="fas fa-copy"></i> {t('appt.copyScript')}
                            </button>
                            
                            <div className="border-t border-slate-200 pt-4 mt-4">
                                <p className="text-xs font-bold text-slate-500 mb-2">{t('appt.manualJson')}</p>
                                <textarea 
                                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono min-h-[80px]"
                                    placeholder={t('appt.geminiPaste')}
                                    value={manualJsonInput}
                                    onChange={e => setManualJsonInput(e.target.value)}
                                />
                                <button 
                                    onClick={handleManualJsonProcess}
                                    disabled={!manualJsonInput}
                                    className="w-full mt-2 bg-slate-800 text-white py-2 rounded-lg font-bold text-xs hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                                >
                                {t('appt.processManual')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Panic / Finish Modal */}
            <Modal isOpen={isPanicModalOpen} onClose={() => setIsPanicModalOpen(false)} title="تقرير الحالة">
                <div className="space-y-6 text-center">
                    <div className="bg-red-50 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center border-4 border-red-100 animate-pulse">
                        <i className="fas fa-exclamation-triangle text-4xl text-red-500"></i>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">{t('appt.panicQuestion')}</h3>
                    <p className="text-sm text-slate-500">{t('appt.panicDesc')}</p>
                    
                    <div className="flex gap-4">
                        <button onClick={() => setPanicDescription('Findings...')} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-bold shadow-lg hover:bg-red-700 transition-all text-lg cursor-pointer">
                            Yes (Panic)
                        </button>
                        <button onClick={() => handleConfirmFinish(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all text-lg cursor-pointer">
                            No (Normal)
                        </button>
                    </div>

                    {/* Panic Input Field (Conditional) */}
                    {panicDescription !== '' && (
                        <div className="mt-4 text-right space-y-3 animate-fade-in-up">
                            <label className="text-xs font-bold text-red-600 block">{t('appt.panicDetails')}</label>
                            <textarea 
                                className="w-full bg-red-50 border border-red-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-red-500 outline-none min-h-[100px]"
                                placeholder="Write the critical results here..."
                                value={panicDescription === 'Findings...' ? '' : panicDescription}
                                onChange={e => setPanicDescription(e.target.value)}
                                autoFocus
                            ></textarea>
                            <button onClick={() => handleConfirmFinish(true)} className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 shadow-md cursor-pointer">
                               {t('appt.saveFinishReport')}
                            </button>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Registration Number Modal */}
            <Modal isOpen={isRegModalOpen} onClose={() => setIsRegModalOpen(false)} title={t('appt.startSuccess')}>
                <div className="text-center space-y-6 py-4">
                    <p className="text-slate-500 font-bold">{t('appt.writeReg')}</p>
                    <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl border-4 border-slate-200 transform scale-110">
                        <span className="text-3xl font-mono font-black tracking-widest">{currentRegNo}</span>
                    </div>
                    <button onClick={() => setIsRegModalOpen(false)} className="w-full bg-emerald-500 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-600 mt-4 cursor-pointer">
                       {t('appt.ok')}
                    </button>
                </div>
            </Modal>

            {/* Daily Log Book Modal */}
            <Modal isOpen={isLogBookOpen} onClose={() => setIsLogBookOpen(false)} title="سجل الأشعة (Log Book)">
                <div className="h-[80vh] flex flex-col">
                    
                    {/* Date Range Controls */}
                    <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-wrap gap-4 items-end print:hidden">
                        <div className="flex-1 min-w-[150px]">
                            <label className="block text-xs font-bold text-slate-500 mb-1">{t('appt.fromDate')}</label>
                            <input type="date" className="w-full border-slate-300 rounded-lg text-sm p-2" value={logStartDate} onChange={e => setLogStartDate(e.target.value)} />
                        </div>
                        <div className="flex-1 min-w-[150px]">
                            <label className="block text-xs font-bold text-slate-500 mb-1">{t('appt.toDate')}</label>
                            <input type="date" className="w-full border-slate-300 rounded-lg text-sm p-2" value={logEndDate} onChange={e => setLogEndDate(e.target.value)} />
                        </div>
                        <button onClick={fetchLogbookData} disabled={isLogLoading} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
                        {isLogLoading ? t('loading') : t('appt.viewLog')}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 bg-white border border-slate-200 shadow-inner rounded-xl print:shadow-none print:border-none print:h-auto print:overflow-visible">
                        {/* Only show tables if data exists or range selected */}
                        <LogTable title="MRI Department" type="MRI" />
                        <div className="print:block hidden h-8"></div> {/* Spacer for print */}
                        <LogTable title="CT Department" type="CT" />
                        <div className="print:block hidden h-8"></div>
                        <LogTable title="X-Ray & General" type="XRAY" />
                        
                        {!isLogLoading && logbookData.length === 0 && appointments.length === 0 && (
                            <div className="text-center py-10 text-slate-400">{t('appt.rep')}.</div>
                        )}
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100 flex gap-4 print:hidden">
                        <button onClick={() => window.print()} className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 shadow-lg cursor-pointer">
                            <i className="fas fa-print mr-2"></i> Print Log Book
                        </button>
                        <button onClick={() => setIsLogBookOpen(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 cursor-pointer">
                            Close                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AppointmentsPage;
