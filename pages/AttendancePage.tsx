
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, addDoc, Timestamp, deleteDoc, doc, updateDoc, writeBatch, getDocs, orderBy, getCountFromServer, setDoc, limit, serverTimestamp } from 'firebase/firestore';
import { Appointment } from '../types';
import Loading from '../components/Loading';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

// Enhanced Keywords based on specific IHMS formats
const MODALITIES = [
    { 
        id: 'MRI', 
        label: 'MRI', 
        icon: 'fa-magnet', 
        color: 'text-blue-600 bg-blue-50', 
        border: 'border-blue-200', 
        keywords: ['MRI', 'MR ', 'MAGNETIC', 'M.R.I'],
        defaultPrep: 'إزالة المعادن، المجوهرات، والهاتف. الحضور قبل الموعد بـ 15 دقيقة.'
    },
    { 
        id: 'CT', 
        label: 'CT Scan', 
        icon: 'fa-ring', 
        color: 'text-emerald-600 bg-emerald-50', 
        border: 'border-emerald-200', 
        keywords: ['C.T.', 'CT ', 'COMPUTED', 'CAT ', 'MDCT'],
        defaultPrep: 'صيام 4 ساعات قبل الفحص (في حال الصبغة). إحضار وظائف الكلى.'
    },
    { 
        id: 'US', 
        label: 'Ultrasound', 
        icon: 'fa-wave-square', 
        color: 'text-indigo-600 bg-indigo-50', 
        border: 'border-indigo-200', 
        keywords: ['US ', 'U.S', 'ULTRASOUND', 'SONO', 'DOPPLER', 'ECHO', 'DUPLEX'],
        defaultPrep: 'شرب لتر ماء قبل ساعة وحبس البول (للحوض/البطن). صيام 6 ساعات (للمرارة).'
    },
    { 
        id: 'X-RAY', 
        label: 'X-Ray & General', 
        icon: 'fa-x-ray', 
        color: 'text-slate-600 bg-slate-50', 
        border: 'border-slate-200', 
        keywords: ['X-RAY', 'XRAY', 'XR ', 'MAMMO', 'CR ', 'DR ', 'CHEST', 'PLAIN', 'SPINE', 'KNEE', 'FOOT', 'HAND'],
        defaultPrep: 'إزالة المجوهرات والمعادن من منطقة الفحص.'
    },
    { 
        id: 'FLUO', 
        label: 'Fluoroscopy', 
        icon: 'fa-video', 
        color: 'text-amber-600 bg-amber-50', 
        border: 'border-amber-200', 
        keywords: ['FLUO', 'BARIUM', 'CONTRAST', 'HSG', 'MCUG'],
        defaultPrep: 'صيام كامل لمدة 8 ساعات.'
    },
    { 
        id: 'OTHER', 
        label: 'General', 
        icon: 'fa-notes-medical', 
        color: 'text-gray-600 bg-gray-50', 
        border: 'border-gray-200', 
        keywords: [],
        defaultPrep: 'اتباع تعليمات الطبيب.'
    }
];

// Type definition for Settings
interface ModalitySettings {
    limit: number;
    slots: string[]; // Array of time strings "09:00", "10:00"
    currentCounter: number; // NEW: Sequential Counter
}

// Default Settings
const DEFAULT_SETTINGS: Record<string, ModalitySettings> = {
    'MRI': { limit: 15, slots: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'], currentCounter: 1 },
    'CT': { limit: 20, slots: ['09:00', '09:20', '09:40', '10:00', '10:20', '10:40', '11:00', '11:20', '11:40', '12:00'], currentCounter: 1 },
    'US': { limit: 30, slots: [], currentCounter: 1 },
    'X-RAY': { limit: 50, slots: [], currentCounter: 1 },
    'FLUO': { limit: 10, slots: ['08:00', '09:00', '10:00'], currentCounter: 1 },
    'OTHER': { limit: 100, slots: [], currentCounter: 1 }
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

interface ExtendedAppointment extends Appointment {
    roomNumber?: string;
    preparation?: string;
}

const AppointmentsPage: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    
    // Data State
    const [appointments, setAppointments] = useState<ExtendedAppointment[]>([]);
    const appointmentsRef = useRef<ExtendedAppointment[]>([]); 
    
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [activeView, setActiveView] = useState<'pending' | 'processing' | 'done' | 'scheduled'>('pending');
    const [activeModality, setActiveModality] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState(''); 
    
    // UI State
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null); // New: Track processing item
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isLogBookOpen, setIsLogBookOpen] = useState(false); // NEW: Local Logbook
    
    // Quota & Slots State
    const [modalitySettings, setModalitySettings] = useState<Record<string, ModalitySettings>>(DEFAULT_SETTINGS);

    // Booking Modal
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [bookingAppt, setBookingAppt] = useState<ExtendedAppointment | null>(null);
    const [bookingDate, setBookingDate] = useState('');
    const [bookingTime, setBookingTime] = useState('');
    const [bookingRoom, setBookingRoom] = useState(''); 
    const [bookingPrep, setBookingPrep] = useState(''); 
    const [bookingWarning, setBookingWarning] = useState(''); 
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);

    // Panic & Completion Modal
    const [isPanicModalOpen, setIsPanicModalOpen] = useState(false);
    const [finishingAppt, setFinishingAppt] = useState<ExtendedAppointment | null>(null);
    const [panicDescription, setPanicDescription] = useState('');

    // Reg Number Modal (Success Start)
    const [isRegModalOpen, setIsRegModalOpen] = useState(false);
    const [currentRegNo, setCurrentRegNo] = useState('');

    // Success/QR Modal
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const [bookedTicketId, setBookedTicketId] = useState('');

    // Logbook Range State
    const [logStartDate, setLogStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [logEndDate, setLogEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [logbookData, setLogbookData] = useState<ExtendedAppointment[]>([]);
    const [isLogLoading, setIsLogLoading] = useState(false);

    const [toast, setToast] = useState<{msg: string, type: 'success'|'info'|'error'} | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [isListening, setIsListening] = useState(false);

    // Manual Add State
    const [patientName, setPatientName] = useState('');
    const [fileNumber, setFileNumber] = useState(''); 
    const [examType, setExamType] = useState('MRI');
    const [doctorName, setDoctorName] = useState('');
    const [patientAge, setPatientAge] = useState('');
    const [notes, setNotes] = useState('');

    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || 'User';
    const isSupervisor = localStorage.getItem('role') === 'admin' || localStorage.getItem('role') === 'supervisor';

    // Cleanup Logic
    const [isCleanupProcessing, setIsCleanupProcessing] = useState(false);

    useEffect(() => {
        appointmentsRef.current = appointments;
    }, [appointments]);

    // Load Settings
    useEffect(() => {
        const savedSettings = localStorage.getItem('appt_settings_v3'); // Changed version to v3
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                // Merge with default to ensure new fields like currentCounter exist
                const merged = { ...DEFAULT_SETTINGS };
                Object.keys(parsed).forEach(k => {
                    if (merged[k]) {
                        merged[k] = { ...merged[k], ...parsed[k] };
                    }
                });
                setModalitySettings(merged);
            } catch(e) { console.error(e); }
        }
    }, []);

    const saveSettings = (newSettings: any) => {
        setModalitySettings(newSettings);
        localStorage.setItem('appt_settings_v3', JSON.stringify(newSettings));
    };

    // --- 1. INTELLIGENT EXAM SPLITTER (Bridge Logic) ---
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (!event.data || event.data.type !== 'SMART_SYNC_DATA') return;

            setIsListening(true);
            const rawPayload = event.data.payload; 
            
            let payload: any[] = [];
            if (Array.isArray(rawPayload)) {
                payload = rawPayload;
            } else if (rawPayload && typeof rawPayload === 'object') {
                payload = [rawPayload];
            }

            if (payload.length === 0) return;

            const batch = writeBatch(db);
            let processedCount = 0;

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

            const cleanTime = (t: any) => {
                if(!t) return '';
                const s = String(t).trim();
                return s.substring(0, 5); 
            };

            const cleanDate = (d: any) => {
                if(!d) return new Date().toISOString().split('T')[0];
                return String(d).split('T')[0];
            };

            payload.forEach((p: any) => {
                const pName = findValue(p, ['patientName', 'engName', 'name', 'patName', 'fullName']) || 'Unknown';
                const cleanName = pName.includes(' - ') ? pName.split(' - ')[1] : pName;
                const fNum = findValue(p, ['fileNumber', 'fileNo', 'mrn', 'patientId', 'pid']) || '';
                const age = findValue(p, ['ageYear', 'age', 'patientAge', 'dob']);
                
                const rawQueTime = findValue(p, ['queTime', 'time', 'visitTime']) || '';
                const qTime = cleanTime(rawQueTime) || '00:00';
                
                const commonInfo = {
                    patientName: cleanName,
                    fileNumber: String(fNum),
                    patientAge: age ? String(age) : '',
                    status: 'pending',
                    createdBy: 'Bridge',
                    createdByName: 'System',
                    notes: ''
                };

                const detailsArr = p.xrayPatientDetails || p.orderDetails || p.services || [];

                if (Array.isArray(detailsArr) && detailsArr.length > 0) {
                    const modalityGroups: Record<string, { exams: string[], time: string, date: string, doc: string, ref: string }> = {};

                    detailsArr.forEach((det: any) => {
                        const sName = findValue(det, ['serviceName', 'examName', 'procedure', 'xrayName']);
                        if (!sName) return;

                        const modId = detectModality(sName);
                        const detTimeRaw = findValue(det, ['queTime', 'time']) || rawQueTime;
                        const detTime = cleanTime(detTimeRaw);
                        const detDate = cleanDate(det.queDate || p.queDate);
                        
                        const docName = det.doctorName || p.doctorName || 'Unknown Dr';
                        const refNo = String(det.queRefNo || det.refNo || p.refNo || '');

                        if (!modalityGroups[modId]) {
                            modalityGroups[modId] = {
                                exams: [],
                                time: detTime || '00:00',
                                date: detDate,
                                doc: docName,
                                ref: refNo
                            };
                        }
                        modalityGroups[modId].exams.push(sName);
                    });

                    Object.keys(modalityGroups).forEach(modId => {
                        const group = modalityGroups[modId];
                        const uniqueId = `${group.date}_${commonInfo.fileNumber}_${modId}`.replace(/[^a-zA-Z0-9_]/g, '');
                        
                        const docRef = doc(db, 'appointments', uniqueId);
                        batch.set(docRef, {
                            ...commonInfo,
                            examType: modId, 
                            examList: group.exams, 
                            doctorName: group.doc,
                            refNo: group.ref,
                            date: group.date, 
                            time: group.time,
                            createdAt: Timestamp.now() 
                        }, { merge: true });
                        processedCount++;
                    });

                } else {
                    const sName = findValue(p, ['serviceName', 'examName']) || 'General Exam';
                    const modId = detectModality(sName);
                    const uniqueId = `${cleanDate(p.queDate)}_${commonInfo.fileNumber}_${modId}`.replace(/[^a-zA-Z0-9_]/g, '');
                    
                    const docRef = doc(db, 'appointments', uniqueId);
                    batch.set(docRef, {
                        ...commonInfo,
                        examType: modId,
                        examList: [sName],
                        doctorName: p.doctorName || 'Unknown Dr',
                        refNo: String(p.refNo || ''),
                        date: cleanDate(p.queDate),
                        time: qTime,
                        createdAt: Timestamp.now()
                    }, { merge: true });
                    processedCount++;
                }
            });

            try {
                if (processedCount > 0) {
                    await batch.commit();
                    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                    audio.play().catch(e => {});
                    setToast({ msg: `تم استقبال ${processedCount} فحوصات! 📥`, type: 'success' });
                    setLastSyncTime(new Date());
                    
                    if(activeView !== 'pending') setActiveView('pending');
                }
            } catch (e) {
                console.error("Sync Write Error:", e);
            }
            setTimeout(() => setIsListening(false), 2000);
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [selectedDate]); 

    // Firestore Listener with LIMIT
    useEffect(() => {
        setLoading(true);
        let q;
        if (activeView === 'scheduled') {
             q = query(collection(db, 'appointments'), where('status', '==', 'scheduled'), limit(300));
        } else {
             q = query(collection(db, 'appointments'), where('date', '==', selectedDate), limit(300));
        }

        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExtendedAppointment));
            let filtered = list;
            
            if (activeView !== 'scheduled') {
                filtered = list.filter(a => a.status === activeView);
            }
            
            // Sort logic
            filtered.sort((a: any, b: any) => {
                // If done, sort by completedAt (newest finished top)
                if (activeView === 'done' && a.completedAt && b.completedAt) {
                    return b.completedAt.seconds - a.completedAt.seconds;
                }
                // Default: Queue Time Descending
                return b.time.localeCompare(a.time); 
            });
            
            setAppointments(filtered);
            setLoading(false);
        });
        return () => unsub();
    }, [selectedDate, activeView]);

    const filteredAppointments = useMemo(() => {
        let list = appointments;
        if (activeModality !== 'ALL') {
            if (activeModality === 'X-RAY') {
                list = list.filter(a => a.examType === 'X-RAY' || a.examType === 'OTHER');
            } else {
                list = list.filter(a => a.examType === activeModality);
            }
        }
        if (searchQuery) {
            const lowerQ = searchQuery.toLowerCase();
            list = list.filter(a => 
                a.patientName.toLowerCase().includes(lowerQ) || 
                (a.fileNumber && a.fileNumber.includes(lowerQ)) ||
                (a.refNo && a.refNo.includes(lowerQ))
            );
        }
        return list;
    }, [appointments, activeModality, searchQuery]);

    // --- WORKFLOW: START EXAM (Sequential Numbering) ---
    // UPDATED: Using updateDoc instead of runTransaction to avoid 429 Resource Exhausted
    const handleStartExam = async (appt: ExtendedAppointment) => {
        if (processingId) return; // Prevent double clicks
        setProcessingId(appt.id);

        try {
            // 1. Optimistic Check: Validate status locally first
            if (appt.status !== 'pending' && appt.status !== 'scheduled') {
                throw new Error("عذراً، هذه الحالة تم سحبها بالفعل!");
            }

            // 2. Generate Registration Number (Client-side Logic)
            const settings = { ...modalitySettings };
            const modKey = appt.examType;
            const currentCount = settings[modKey]?.currentCounter || 1;
            const regNo = `${modKey}-${currentCount}`;

            // Increment and Save locally
            settings[modKey] = {
                ...settings[modKey],
                currentCounter: currentCount + 1
            };
            saveSettings(settings);

            // 3. Direct Update (Single Write Operation - Lightweight)
            const apptRef = doc(db, 'appointments', appt.id);
            await updateDoc(apptRef, {
                status: 'processing',
                performedBy: currentUserId,
                performedByName: currentUserName,
                startedAt: Timestamp.now(),
                registrationNumber: regNo
            });
            
            setCurrentRegNo(regNo);
            setIsRegModalOpen(true);
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'); 
            audio.play().catch(()=>{});

        } catch(e: any) {
            setToast({msg: e.message || 'خطأ في العملية', type: 'error'});
        } finally {
            setProcessingId(null);
        }
    };

    // --- WORKFLOW: FINISH EXAM (Panic Check) ---
    const handleFinishClick = (appt: ExtendedAppointment) => {
        if (appt.performedBy && appt.performedBy !== currentUserId && !isSupervisor) {
            setToast({msg: 'عذراً، هذا المريض في عهدة موظف آخر', type: 'error'});
            return;
        }
        setFinishingAppt(appt);
        setIsPanicModalOpen(true);
    };

    const handleConfirmFinish = async (isPanic: boolean) => {
        if (!finishingAppt) return;
        
        try {
            const batch = writeBatch(db);
            const apptRef = doc(db, 'appointments', finishingAppt.id);

            // Update Appointment
            const updates: any = {
                status: 'done',
                completedAt: Timestamp.now(),
                isPanic: isPanic
            };
            if (isPanic) updates.panicDetails = panicDescription;
            batch.update(apptRef, updates);

            // If Panic, create Report
            if (isPanic) {
                const reportRef = doc(collection(db, 'panic_reports'));
                batch.set(reportRef, {
                    date: new Date().toISOString().split('T')[0],
                    time: new Date().toLocaleTimeString(),
                    patientName: finishingAppt.patientName,
                    fileNumber: finishingAppt.fileNumber,
                    registrationNumber: finishingAppt.registrationNumber || 'N/A',
                    doctorName: finishingAppt.doctorName,
                    examType: finishingAppt.examType,
                    findings: panicDescription,
                    reportedBy: currentUserName,
                    reportedById: currentUserId,
                    createdAt: serverTimestamp()
                });
            }

            await batch.commit();
            setToast({ msg: isPanic ? 'تم تسجيل حالة Panic 🚨' : 'تم إنهاء الفحص بنجاح ✅', type: 'success' });
            
            setIsPanicModalOpen(false);
            setFinishingAppt(null);
            setPanicDescription('');

        } catch (e) {
            console.error(e);
            setToast({ msg: 'حدث خطأ أثناء الحفظ', type: 'error' });
        }
    };

    // --- GENERIC ACTIONS ---
    const handleOpenBooking = (appt: ExtendedAppointment) => {
        setBookingAppt(appt);
        const tom = new Date(); tom.setDate(tom.getDate()+1);
        setBookingDate(tom.toISOString().split('T')[0]);
        setBookingTime(""); // Reset time
        setBookingRoom(appt.roomNumber || 'الغرفة العامة');
        const mod = MODALITIES.find(m => m.id === appt.examType);
        setBookingPrep(mod?.defaultPrep || 'لا توجد تحضيرات خاصة');
        setBookingWarning('');
        setIsBookingModalOpen(true);
    };

    useEffect(() => {
        const checkQuotaAndSlots = async () => {
            if (!bookingAppt || !bookingDate) return;
            setBookingWarning('');
            setAvailableSlots([]);

            try {
                const qScheduled = query(
                    collection(db, 'appointments'),
                    where('status', '==', 'scheduled'),
                    where('scheduledDate', '==', bookingDate),
                    where('examType', '==', bookingAppt.examType)
                );
                const snapshot = await getDocs(qScheduled);
                const bookedTimes = snapshot.docs.map(d => d.data().time);
                const currentCount = snapshot.size;
                
                const settings = modalitySettings[bookingAppt.examType] || DEFAULT_SETTINGS['OTHER'];
                const limit = settings.limit;
                const definedSlots = settings.slots || [];

                if (currentCount >= limit) {
                    setBookingWarning(`⚠️ تم اكتمال العدد لهذا القسم (${currentCount}/${limit}).`);
                } else {
                    setBookingWarning(`✅ متاح: ${limit - currentCount} أماكن.`);
                    if (definedSlots.length > 0) {
                        const free = definedSlots.filter(s => !bookedTimes.includes(s));
                        setAvailableSlots(free);
                    } else {
                        setAvailableSlots([]);
                    }
                }
            } catch(e) { console.error(e); }
        };
        checkQuotaAndSlots();
    }, [bookingDate, bookingAppt, modalitySettings]);

    const confirmBooking = async () => {
        if (!bookingAppt || !bookingDate || !bookingTime) {
            setToast({msg: 'يرجى اختيار التاريخ والوقت', type: 'error'});
            return;
        }
        try {
            await updateDoc(doc(db, 'appointments', bookingAppt.id), {
                status: 'scheduled',
                scheduledDate: bookingDate,
                time: bookingTime, 
                roomNumber: bookingRoom, 
                preparation: bookingPrep, 
                notes: `${bookingAppt.notes || ''}\n📅 Booked: ${bookingDate} ${bookingTime}`
            });
            setBookedTicketId(bookingAppt.id);
            setIsBookingModalOpen(false);
            setIsTicketModalOpen(true);
            setBookingAppt(null);
        } catch(e) { setToast({ msg: 'خطأ في الحجز', type: 'error' }); }
    };

    const handleUndo = async (appt: ExtendedAppointment) => {
        if (!isSupervisor && appt.performedBy !== currentUserId) {
            setToast({msg: 'لا يمكنك التراجع عن حالة زميل', type: 'error'});
            return;
        }
        try {
            await updateDoc(doc(db, 'appointments', appt.id), {
                status: 'pending',
                performedBy: null,
                performedByName: null,
                completedAt: null,
                isPanic: false
            });
            setToast({ msg: 'تم إعادة الحالة لقائمة الانتظار', type: 'info' });
        } catch(e) { console.error(e); }
    };

    const handleDelete = async (id: string) => {
        if(!confirm(t('confirm') + '?')) return;
        try {
            await deleteDoc(doc(db, 'appointments', id));
            setToast({ msg: t('delete'), type: 'success' });
        } catch(e) { console.error(e); }
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!patientName || !examType) return;
        try {
            const now = new Date();
            const uniqueId = `MANUAL_${Date.now()}`;
            await setDoc(doc(db, 'appointments', uniqueId), {
                patientName,
                fileNumber,
                doctorName,
                patientAge,
                examType,
                examList: [examType], 
                date: selectedDate,
                time: `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`,
                notes,
                status: 'pending',
                createdBy: currentUserId,
                createdByName: currentUserName,
                createdAt: Timestamp.now()
            });
            setToast({ msg: 'تم إضافة الحالة', type: 'success' });
            setIsAddModalOpen(false);
            setPatientName(''); setFileNumber(''); setNotes(''); setDoctorName(''); setPatientAge('');
        } catch (e) { setToast({ msg: 'خطأ', type: 'error' }); }
    };

    const handleSaveLimits = () => {
        saveSettings(modalitySettings);
        setToast({ msg: 'تم حفظ الإعدادات', type: 'success' });
        setIsSettingsModalOpen(false);
    };

    const handleBulkAction = async (action: 'clean_old' | 'delete_all' | 'delete_done' | 'delete_pending') => {
        if (!isSupervisor) return;
        let confirmMsg = '';
        let queryConstraint: any[] = [];
        const todayStr = new Date().toISOString().split('T')[0];

        switch(action) {
            case 'clean_old':
                confirmMsg = `حذف جميع الحالات القديمة (ما قبل ${todayStr})؟`;
                queryConstraint = [where('date', '<', todayStr)];
                break;
            case 'delete_all':
                confirmMsg = `⚠️ تحذير: حذف جميع الحالات (${appointments.length}) في القائمة الحالية؟`;
                queryConstraint = [where('date', '==', selectedDate)];
                break;
            case 'delete_done':
                confirmMsg = 'حذف جميع الحالات المنجزة (Done)؟';
                queryConstraint = [where('status', '==', 'done'), where('date', '==', selectedDate)];
                break;
            case 'delete_pending':
                confirmMsg = 'حذف جميع الحالات في الانتظار (Pending)؟';
                queryConstraint = [where('status', '==', 'pending'), where('date', '==', selectedDate)];
                break;
        }

        if (!confirm(confirmMsg)) return;
        setIsCleanupProcessing(true);
        try {
            const q = query(collection(db, 'appointments'), ...queryConstraint);
            const snap = await getDocs(q);
            if (snap.empty) { setToast({msg: 'لا توجد بيانات للحذف', type: 'info'}); setIsCleanupProcessing(false); return; }
            const chunks = [];
            const docs = snap.docs;
            for (let i = 0; i < docs.length; i += 500) chunks.push(docs.slice(i, i + 500));
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
            setToast({msg: `تم حذف ${snap.size} سجل بنجاح`, type: 'success'});
        } catch(e: any) { setToast({msg: 'حدث خطأ: ' + e.message, type: 'error'}); } finally { setIsCleanupProcessing(false); }
    };

    const handleCopyScript = () => {
        const script = `
/* 🚀 AJ-SMART-BRIDGE V11 (XHR Interceptor) */
(function() {
    console.clear();
    console.log("%c 🟢 Bridge Active: Monitoring Network... ", "background: #0f0; color: #000; font-size:14px; font-weight:bold;");

    const APP_URL = "${window.location.origin}/#/appointments";
    let syncWin = null;

    // Open/Focus the React App Window
    function openSyncWindow() {
        if (!syncWin || syncWin.closed) {
            syncWin = window.open(APP_URL, "SmartAppSyncWindow");
        }
        return syncWin;
    }

    // Send Data to React App
    function sendData(data) {
        if (!data) return;
        let payload = data;
        
        // Handle different JSON structures from ASP.NET / IHMS
        if (data.d) payload = data.d;
        if (data.result) payload = data.result;
        
        if (!Array.isArray(payload)) payload = [payload];

        // Validate payload looks like patient data
        const isValid = payload.length > 0 && (
            payload[0].engName || 
            payload[0].patientName || 
            payload[0].xrayPatientDetails || 
            payload[0].fileNumber
        );

        if (isValid) {
            console.log("🔥 Intercepted Data:", payload.length, "records");
            syncWin = openSyncWindow();
            // Wait slightly for window to focus/load
            setTimeout(() => {
                syncWin.postMessage({ type: 'SMART_SYNC_DATA', payload: payload }, '*');
            }, 500);
        }
    }

    // --- THE INTERCEPTOR ---
    // This monkey-patches the browser's XMLHttpRequest to snoop on data
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            // Only process JSON responses
            const contentType = this.getResponseHeader("content-type");
            if (contentType && contentType.includes("application/json")) {
                try {
                    const text = this.responseText;
                    if (text) {
                        const json = JSON.parse(text);
                        sendData(json);
                    }
                } catch (e) {
                    // Ignore parsing errors for non-JSON
                }
            }
        });
        return originalSend.apply(this, arguments);
    };

    alert("✅ تم تفعيل المزامنة التلقائية (V11)! \n\nالآن عند البحث في IHMS، ستنتقل الأسماء تلقائياً.");
})();
`;
        navigator.clipboard.writeText(script);
        setToast({ msg: 'تم نسخ كود المراقبة الذكي (V11)!', type: 'success' });
    };

    // --- CLIENT-SIDE LOGBOOK GENERATOR WITH DATE RANGE ---
    const fetchLogbookData = async () => {
        setIsLogLoading(true);
        try {
            const q = query(
                collection(db, 'appointments'), 
                where('date', '>=', logStartDate),
                where('date', '<=', logEndDate)
            );
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({id: d.id, ...d.data()} as ExtendedAppointment));
            
            // Filter only DONE or PROCESSING items usually, but keeping ALL for log is safer
            // Sort by Date then Time
            list.sort((a,b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.time.localeCompare(b.time);
            });
            
            setLogbookData(list);
        } catch(e) {
            console.error(e);
            setToast({msg: 'Failed to fetch log data', type: 'error'});
        } finally {
            setIsLogLoading(false);
        }
    };

    const getLogbookData = (type: 'MRI' | 'CT' | 'XRAY') => {
        // Use logbookData if loaded, otherwise fallback to current view's appointments (if single day)
        // If separate date range fetch was used, `logbookData` is populated.
        const sourceData = logbookData.length > 0 ? logbookData : appointments;
        
        return sourceData.filter(a => {
            if (type === 'MRI') return a.examType === 'MRI';
            if (type === 'CT') return a.examType === 'CT';
            return a.examType !== 'MRI' && a.examType !== 'CT'; // XRAY & Others
        });
    };

    const LogTable = ({ title, type }: { title: string, type: 'MRI' | 'CT' | 'XRAY' }) => {
        const data = getLogbookData(type);
        if (data.length === 0 && logbookData.length === 0 && appointments.length === 0) return null;

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
                        {data.length === 0 ? (
                            <tr><td colSpan={8} className="text-center p-4">No cases recorded for this modality.</td></tr>
                        ) : (
                            data.map((row, i) => (
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
                        )}
                    </tbody>
                </table>
                <div className="mt-2 text-right text-xs font-bold">Total {title}: {data.length} Cases</div>
            </div>
        );
    };

    const appUrl = window.location.origin;
    const isLocalhost = appUrl.includes('localhost') || appUrl.includes('127.0.0.1');

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* Header */}
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
                                {activeView === 'scheduled' ? <span>Scheduled Bookings</span> : <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} className="bg-transparent border-none text-white p-0 text-xs font-bold focus:ring-0" />}
                                {lastSyncTime && <span className="text-emerald-400 font-bold">• Sync: {lastSyncTime.toLocaleTimeString()}</span>}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex-1 w-full md:max-w-md mx-4">
                        <div className="relative">
                            <i className="fas fa-search absolute left-3 top-2.5 text-slate-400 text-sm"></i>
                            <input 
                                className="w-full bg-slate-800 border border-slate-700 rounded-full py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                placeholder="بحث باسم المريض أو رقم الملف..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-white"><i className="fas fa-times text-xs"></i></button>}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                            <button onClick={() => setActiveView('pending')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'pending' ? 'bg-amber-500 text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}>انتظار</button>
                            <button onClick={() => setActiveView('processing')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'processing' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>العمل</button>
                            <button onClick={() => setActiveView('scheduled')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'scheduled' ? 'bg-purple-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>مواعيد</button>
                            <button onClick={() => setActiveView('done')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'done' ? 'bg-emerald-500 text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}>منجز</button>
                        </div>
                        <button onClick={() => { setIsLogBookOpen(true); setLogStartDate(selectedDate); setLogEndDate(selectedDate); }} className="bg-slate-700 hover:bg-slate-600 text-white w-9 h-9 rounded-lg flex items-center justify-center shadow-lg transition-all" title="Daily Log Book">
                            <i className="fas fa-book"></i>
                        </button>
                        <button onClick={() => setIsBridgeModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white w-9 h-9 rounded-lg flex items-center justify-center shadow-lg transition-all" title="Auto Sync">
                            <i className={`fas fa-satellite-dish ${isListening ? 'animate-pulse' : ''}`}></i>
                        </button>
                        <button onClick={() => setIsSettingsModalOpen(true)} className="bg-slate-700 hover:bg-slate-600 text-white w-9 h-9 rounded-lg flex items-center justify-center shadow-lg transition-all" title="Quota Settings">
                            <i className="fas fa-sliders-h"></i>
                        </button>
                        <button onClick={() => setIsAddModalOpen(true)} className="bg-white text-slate-900 w-9 h-9 rounded-lg flex items-center justify-center font-bold shadow-lg hover:bg-slate-200 transition-all">
                            <i className="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* Sub-Header: Modality Tabs */}
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
                        const count = appointments.filter(a => mod.id === 'X-RAY' ? (a.examType === 'X-RAY' || a.examType === 'OTHER') : a.examType === mod.id).length;
                        return (
                            <button 
                                key={mod.id}
                                onClick={() => setActiveModality(mod.id)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border ${activeModality === mod.id ? `${mod.color} ${mod.border}` : 'bg-white border-transparent text-slate-500 hover:bg-slate-50'}`}
                            >
                                <i className={`fas ${mod.icon}`}></i> {mod.label}
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${activeModality === mod.id ? 'bg-white/30 text-current' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 py-6 print:hidden">
                {loading ? <Loading /> : filteredAppointments.length === 0 ? (
                    <div className="text-center py-24 opacity-50">
                        <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl text-slate-400">
                            {activeView === 'pending' ? <i className="fas fa-coffee"></i> : <i className="fas fa-check-double"></i>}
                        </div>
                        <p className="font-bold text-slate-500 text-lg">
                            {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد حالات في هذه القائمة'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredAppointments.map(appt => {
                            const mod = MODALITIES.find(m => m.id === appt.examType) || MODALITIES[MODALITIES.length - 1];
                            const isScheduled = appt.status === 'scheduled';
                            const addedTime = appt.createdAt ? appt.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
                            const isProcessing = processingId === appt.id;
                            
                            return (
                                <div key={appt.id} className={`relative bg-white rounded-2xl p-4 shadow-sm border-l-4 transition-all hover:-translate-y-1 animate-fade-in ${appt.status === 'done' ? 'border-l-emerald-500 opacity-80' : appt.status === 'processing' ? 'border-l-blue-500 border-2 border-blue-500/20' : isScheduled ? 'border-l-purple-500' : 'border-l-amber-500 shadow-md'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider border ${mod.color} ${mod.border}`}>
                                            <i className={`fas ${mod.icon} mr-1`}></i> {mod.label}
                                        </span>
                                        <div className="flex flex-col items-end">
                                            {isScheduled ? (
                                                <button onClick={() => window.open(`#/ticket/${appt.id}`, '_blank')} className="font-mono text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100 hover:bg-purple-100 flex items-center gap-1">
                                                    📅 {appt.scheduledDate} <i className="fas fa-qrcode"></i>
                                                </button>
                                            ) : (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] text-slate-400 font-bold mb-0.5">Added: {addedTime}</span>
                                                    <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">Appt: {appt.time}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <h3 className="font-bold text-slate-800 text-base leading-tight mb-1 truncate" title={appt.patientName}>{appt.patientName}</h3>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">ID: {appt.fileNumber}</span>
                                        {appt.registrationNumber && <span className="text-[10px] font-black text-white bg-blue-600 px-2 py-0.5 rounded shadow-sm">#{appt.registrationNumber}</span>}
                                    </div>

                                    {/* Exams List */}
                                    <div className="mb-3 bg-slate-50 rounded-lg p-2 border border-slate-100 min-h-[40px]">
                                        {appt.examList && appt.examList.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {appt.examList.map((exam, i) => <span key={i} className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded shadow-sm break-words max-w-full">{exam}</span>)}
                                            </div>
                                        ) : <p className="text-[10px] text-slate-400 italic">No exams listed</p>}
                                    </div>
                                    
                                    {/* Actions */}
                                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-50">
                                        {appt.status === 'pending' || appt.status === 'scheduled' ? (
                                            <>
                                                {appt.status === 'pending' && <button onClick={() => handleOpenBooking(appt)} disabled={isProcessing} className="flex-1 bg-white border border-blue-200 text-blue-600 py-2 rounded-lg font-bold text-xs hover:bg-blue-50 transition-colors disabled:opacity-50"><i className="fas fa-calendar-alt"></i> حجز</button>}
                                                <button onClick={() => handleStartExam(appt)} disabled={isProcessing} className="flex-[2] bg-slate-800 text-white py-2 rounded-lg font-bold text-xs hover:bg-blue-600 transition-colors shadow-sm flex items-center justify-center gap-1 disabled:opacity-70 disabled:cursor-not-allowed">
                                                    {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <span>بدء الفحص <i className="fas fa-play"></i></span>}
                                                </button>
                                            </>
                                        ) : appt.status === 'processing' ? (
                                            <div className="w-full flex gap-2">
                                                <div className="flex-1 bg-blue-50 text-blue-700 px-2 py-2 rounded-lg text-xs font-bold text-center border border-blue-100">
                                                    <i className="fas fa-user-clock"></i> {appt.performedByName || 'Unknown'}
                                                </div>
                                                <button onClick={() => handleFinishClick(appt)} className="flex-[2] bg-emerald-500 text-white py-2 rounded-lg font-bold text-xs hover:bg-emerald-600 transition-colors shadow-md flex items-center justify-center gap-1">
                                                    <span>إنهاء (تم)</span> <i className="fas fa-check-double"></i>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-full flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                                                    <i className="fas fa-check-circle text-lg"></i>
                                                    <div className="flex flex-col">
                                                        <span>تم الفحص</span>
                                                        <span className="text-[9px] text-slate-400 font-normal">{appt.performedByName}</span>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleUndo(appt)} className="text-slate-300 hover:text-red-500 px-2" title="Undo"><i className="fas fa-undo"></i></button>
                                            </div>
                                        )}
                                    </div>
                                    {isSupervisor && <button onClick={() => handleDelete(appt.id)} className="absolute top-2 left-2 text-slate-200 hover:text-red-400 transition-colors"><i className="fas fa-times text-xs"></i></button>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* --- Modals --- */}

            {/* Panic / Finish Modal */}
            <Modal isOpen={isPanicModalOpen} onClose={() => setIsPanicModalOpen(false)} title="تقرير الحالة">
                <div className="space-y-6 text-center">
                    <div className="bg-red-50 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center border-4 border-red-100 animate-pulse">
                        <i className="fas fa-exclamation-triangle text-4xl text-red-500"></i>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">هل كانت الحالة طارئة (Panic)؟</h3>
                    <p className="text-sm text-slate-500">في حال وجود نتائج حرجة، يرجى تسجيلها فوراً.</p>
                    
                    <div className="flex gap-4">
                        <button onClick={() => setPanicDescription('Findings...')} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-bold shadow-lg hover:bg-red-700 transition-all text-lg">
                            نعم (Panic)
                        </button>
                        <button onClick={() => handleConfirmFinish(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all text-lg">
                            لا (Normal)
                        </button>
                    </div>

                    {/* Panic Input Field (Conditional) */}
                    {panicDescription !== '' && (
                        <div className="mt-4 text-right space-y-3 animate-fade-in-up">
                            <label className="text-xs font-bold text-red-600 block">وصف الحالة الحرجة:</label>
                            <textarea 
                                className="w-full bg-red-50 border border-red-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-red-500 outline-none min-h-[100px]"
                                placeholder="اكتب النتائج الحرجة هنا..."
                                value={panicDescription === 'Findings...' ? '' : panicDescription}
                                onChange={e => setPanicDescription(e.target.value)}
                                autoFocus
                            ></textarea>
                            <button onClick={() => handleConfirmFinish(true)} className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 shadow-md">
                                حفظ التقرير وإنهاء
                            </button>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Registration Number Modal */}
            <Modal isOpen={isRegModalOpen} onClose={() => setIsRegModalOpen(false)} title="تم بدء الفحص ✅">
                <div className="text-center space-y-6 py-4">
                    <p className="text-slate-500 font-bold">يرجى كتابة رقم التسجيل التالي على الفيلم/الجهاز:</p>
                    <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl border-4 border-slate-200 transform scale-110">
                        <span className="text-3xl font-mono font-black tracking-widest">{currentRegNo}</span>
                    </div>
                    <button onClick={() => setIsRegModalOpen(false)} className="w-full bg-emerald-500 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-600 mt-4">
                        حسناً، تم
                    </button>
                </div>
            </Modal>

            {/* Daily Log Book Modal */}
            <Modal isOpen={isLogBookOpen} onClose={() => setIsLogBookOpen(false)} title="سجل الأشعة (Log Book)">
                <div className="h-[80vh] flex flex-col">
                    
                    {/* Date Range Controls */}
                    <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-wrap gap-4 items-end print:hidden">
                        <div className="flex-1 min-w-[150px]">
                            <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
                            <input type="date" className="w-full border-slate-300 rounded-lg text-sm p-2" value={logStartDate} onChange={e => setLogStartDate(e.target.value)} />
                        </div>
                        <div className="flex-1 min-w-[150px]">
                            <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
                            <input type="date" className="w-full border-slate-300 rounded-lg text-sm p-2" value={logEndDate} onChange={e => setLogEndDate(e.target.value)} />
                        </div>
                        <button onClick={fetchLogbookData} disabled={isLogLoading} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50">
                            {isLogLoading ? 'جاري التحميل...' : 'عرض التقرير'}
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
                            <div className="text-center py-10 text-slate-400">لا توجد بيانات للعرض. اختر التاريخ واضغط "عرض التقرير".</div>
                        )}
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100 flex gap-4 print:hidden">
                        <button onClick={() => window.print()} className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 shadow-lg">
                            <i className="fas fa-print mr-2"></i> Print Log Book
                        </button>
                        <button onClick={() => setIsLogBookOpen(false)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200">
                            Close
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Other Modals (Booking, Ticket, Add, Settings, Bridge) */}
            <Modal isOpen={isBookingModalOpen} onClose={() => setIsBookingModalOpen(false)} title="جدولة موعد">
                <div className="space-y-4">
                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                        <p className="text-xs text-blue-800 font-bold mb-1">المريض / الفحص:</p>
                        <p className="font-bold text-lg text-slate-800">{bookingAppt?.patientName} ({bookingAppt?.examType})</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">تاريخ الموعد</label>
                            <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold" value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">وقت الموعد</label>
                            {availableSlots.length > 0 ? (
                                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-700" value={bookingTime} onChange={e => setBookingTime(e.target.value)}>
                                    <option value="">اختر الوقت...</option>
                                    {availableSlots.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                                </select>
                            ) : (
                                <input type="time" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold" value={bookingTime} onChange={e => setBookingTime(e.target.value)} placeholder={availableSlots.length === 0 && modalitySettings[bookingAppt?.examType || '']?.slots?.length > 0 ? "اكتملت المواعيد" : ""} />
                            )}
                        </div>
                    </div>
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">رقم الغرفة</label><input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold" placeholder="مثال: غرفة 3" value={bookingRoom} onChange={e => setBookingRoom(e.target.value)} /></div>
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">التحضيرات</label><textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold min-h-[80px]" value={bookingPrep} onChange={e => setBookingPrep(e.target.value)} /></div>
                    {bookingWarning && <div className={`text-xs font-bold p-3 rounded-lg border ${bookingWarning.includes('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{bookingWarning}</div>}
                    <button onClick={confirmBooking} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all">تأكيد الحجز</button>
                </div>
            </Modal>

            <Modal isOpen={isTicketModalOpen} onClose={() => setIsTicketModalOpen(false)} title="تم حجز الموعد بنجاح ✅">
                <div className="space-y-6 text-center">
                    <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl border border-emerald-100"><i className="fas fa-check-circle text-4xl mb-2 text-emerald-500"></i><p className="font-bold text-lg">تم تأكيد الحجز!</p></div>
                    <div className="bg-white p-4 rounded-xl border-2 border-slate-100 flex flex-col items-center"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + '/#/ticket/' + bookedTicketId)}`} alt="QR" className="w-48 h-48 rounded-lg shadow-sm mb-4" /><p className="text-sm text-slate-500 font-bold">امسح الكود للعرض</p></div>
                    <button onClick={() => window.open(`#/ticket/${bookedTicketId}`, '_blank')} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-slate-800"><i className="fas fa-print"></i> فتح التذكرة</button>
                </div>
            </Modal>

            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="إضافة يدوية">
                <form onSubmit={handleManualSubmit} className="space-y-4">
                    <input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder="اسم المريض" value={patientName} onChange={e=>setPatientName(e.target.value)} />
                    <input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder="رقم الملف" value={fileNumber} onChange={e=>setFileNumber(e.target.value)} />
                    <div className="grid grid-cols-2 gap-4"><input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder="الطبيب" value={doctorName} onChange={e=>setDoctorName(e.target.value)} /><input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder="العمر" value={patientAge} onChange={e=>setPatientAge(e.target.value)} /></div>
                    <select className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" value={examType} onChange={e=>setExamType(e.target.value)}>{MODALITIES.filter(m => m.id !== 'ALL').map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
                    <textarea className="w-full bg-slate-50 border-none rounded-xl p-3" placeholder="ملاحظات" value={notes} onChange={e=>setNotes(e.target.value)} />
                    <button className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">حفظ</button>
                </form>
            </Modal>

            <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="الإعدادات والإدارة">
                <div className="space-y-6 max-h-[70vh] overflow-y-auto p-1 custom-scrollbar">
                    {isSupervisor && <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-3"><h4 className="font-bold text-red-800 text-sm flex items-center gap-2"><i className="fas fa-user-shield"></i> أدوات المشرف</h4><div className="grid grid-cols-2 gap-2"><button onClick={() => handleBulkAction('clean_old')} disabled={isCleanupProcessing} className="bg-white border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-100 disabled:opacity-50">حذف القديم</button><button onClick={() => handleBulkAction('delete_done')} disabled={isCleanupProcessing} className="bg-white border border-emerald-200 text-emerald-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-50 disabled:opacity-50">حذف المنجز</button><button onClick={() => handleBulkAction('delete_pending')} disabled={isCleanupProcessing} className="bg-white border border-amber-200 text-amber-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-amber-50 disabled:opacity-50">حذف الانتظار</button><button onClick={() => handleBulkAction('delete_all')} disabled={isCleanupProcessing} className="bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50">حذف الكل</button></div>{isCleanupProcessing && <p className="text-xs text-red-500 font-bold text-center animate-pulse">جاري التنفيذ...</p>}</div>}
                    <div className="border-t border-slate-100 my-2"></div>
                    <p className="text-xs text-slate-500 font-bold">إعدادات التسلسل (Sequence) والحصص</p>
                    <div className="space-y-4">
                        {MODALITIES.filter(m => m.id !== 'ALL' && m.id !== 'OTHER').map(mod => (
                            <div key={mod.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><i className={`fas ${mod.icon} text-slate-400`}></i> {mod.label}</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase">Next No.</span>
                                        {/* Counter Input */}
                                        <input 
                                            type="number" 
                                            className="w-20 bg-white border border-slate-200 rounded-lg p-1 font-bold text-center text-sm" 
                                            value={modalitySettings[mod.id]?.currentCounter || 1} 
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value) || 1; 
                                                setModalitySettings(prev => ({...prev, [mod.id]: { ...prev[mod.id], currentCounter: val }})); 
                                            }} 
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase">Max Daily Limit</span>
                                    <input type="number" className="w-16 bg-white border border-slate-200 rounded-lg p-1 font-bold text-center text-sm" value={modalitySettings[mod.id]?.limit || 0} onChange={(e) => {const val = parseInt(e.target.value) || 0; setModalitySettings(prev => ({...prev, [mod.id]: { ...prev[mod.id], limit: val }})); }} />
                                </div>
                                <div><label className="text-[10px] font-bold text-slate-400 block mb-1">Time Slots</label><textarea className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-medium h-12" placeholder="e.g. 09:00, 09:30" value={(modalitySettings[mod.id]?.slots || []).join(', ')} onChange={(e) => {const slots = e.target.value.split(',').map(s => s.trim()).filter(s => s); setModalitySettings(prev => ({...prev, [mod.id]: { ...prev[mod.id], slots: slots }})); }} /></div>
                            </div>
                        ))}
                    </div>
                    <button onClick={handleSaveLimits} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 sticky bottom-0">حفظ الإعدادات</button>
                </div>
            </Modal>

            <Modal isOpen={isBridgeModalOpen} onClose={() => setIsBridgeModalOpen(false)} title="الربط الذكي (Live Sync)">
                <div className="space-y-4 text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-full flex items-center justify-center mx-auto text-2xl text-white mb-2 shadow-lg shadow-emerald-200"><i className="fas fa-satellite-dish animate-pulse"></i></div>
                    <h3 className="font-bold text-slate-800">مراقب الشبكة الذكي V11</h3>
                    <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        الكود المحدث يحتوي على تقنية <b>"Keep-Alive"</b> للحفاظ على الجلسة ومراقبة البيانات بشكل دائم.
                    </p>
                    <button onClick={handleCopyScript} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                        <i className="fas fa-copy"></i> نسخ كود المراقبة V11
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default AppointmentsPage;
