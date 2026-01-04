
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, addDoc, Timestamp, deleteDoc, doc, updateDoc, writeBatch, getDocs, orderBy, getCountFromServer, setDoc, runTransaction } from 'firebase/firestore';
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
}

// Default Settings
const DEFAULT_SETTINGS: Record<string, ModalitySettings> = {
    'MRI': { limit: 15, slots: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'] },
    'CT': { limit: 20, slots: ['09:00', '09:20', '09:40', '10:00', '10:20', '10:40', '11:00', '11:20', '11:40', '12:00'] },
    'US': { limit: 30, slots: [] }, // Empty slots means free text time
    'X-RAY': { limit: 50, slots: [] },
    'FLUO': { limit: 10, slots: ['08:00', '09:00', '10:00'] },
    'OTHER': { limit: 100, slots: [] }
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
    const [activeView, setActiveView] = useState<'pending' | 'done' | 'scheduled'>('pending');
    const [activeModality, setActiveModality] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState(''); 
    
    // UI State
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    
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
    const [availableSlots, setAvailableSlots] = useState<string[]>([]); // For Dropdown

    // Success/QR Modal
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const [bookedTicketId, setBookedTicketId] = useState('');

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
        const savedSettings = localStorage.getItem('appt_settings_v2');
        if (savedSettings) {
            try {
                setModalitySettings(JSON.parse(savedSettings));
            } catch(e) {
                // Migrate old simple limits if found
                const oldLimits = localStorage.getItem('appt_daily_limits');
                if (oldLimits) {
                    try {
                        const parsedOld = JSON.parse(oldLimits);
                        const merged = { ...DEFAULT_SETTINGS };
                        Object.keys(parsedOld).forEach(k => {
                            if(merged[k]) merged[k].limit = parsedOld[k];
                        });
                        setModalitySettings(merged);
                    } catch(ex) {}
                }
            }
        }
    }, []);

    // --- 1. INTELLIGENT EXAM SPLITTER (Enhanced Deduplication with Deterministic IDs) ---
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
                
                // Extract Queue Time specifically for sorting
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
                        // Prefer detailed time if available, else parent time
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
                        
                        // Deterministic ID: FileNumber_Modality_Date
                        // Adding time to ID to allow multiple same-modality visits in one day if times differ
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
                            createdAt: Timestamp.now() // Update timestamp to bring to top if re-synced (optional)
                        }, { merge: true }); // Merge prevents overwriting existing data fields not present in new payload, but we want to update time/status usually.
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
                    
                    // Always switch view to Pending to see new items
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

    // Firestore Listener
    useEffect(() => {
        setLoading(true);
        let q;
        if (activeView === 'scheduled') {
             q = query(collection(db, 'appointments'), where('status', '==', 'scheduled'));
        } else {
             q = query(collection(db, 'appointments'), where('date', '==', selectedDate));
        }

        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ExtendedAppointment));
            let filtered = list;
            
            if (activeView !== 'scheduled') {
                filtered = list.filter(a => a.status === activeView);
            }
            
            // STRICT SORT LOGIC: Newest Time First (LIFO based on Queue Time)
            // If Time is 19:00, it should be above 08:00
            filtered.sort((a: any, b: any) => {
                // Primary Sort: Time Descending (Latest time at top)
                // "19:00" > "08:00" -> return negative -> a comes first
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

    // --- ATOMIC ACTIONS (Prevent Double Count) ---
    const handleAcceptPatient = async (appt: ExtendedAppointment) => {
        try {
            const apptRef = doc(db, 'appointments', appt.id);
            
            // Run transaction to ensure atomicity (No two people can take same patient)
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(apptRef);
                if (!sfDoc.exists()) {
                    throw "Document does not exist!";
                }

                const currentData = sfDoc.data();
                if (currentData.status === 'done') {
                    throw "عذراً، تم سحب الحالة بواسطة زميل آخر!";
                }

                transaction.update(apptRef, {
                    status: 'done',
                    performedBy: currentUserId,
                    performedByName: currentUserName,
                    completedAt: Timestamp.now()
                });
            });

            setToast({ msg: `تم إنجاز ${appt.patientName} ✅`, type: 'success' });
        } catch(e: any) {
            console.error(e);
            // Show error if transaction failed (e.g., already taken)
            setToast({msg: typeof e === 'string' ? e : 'خطأ في العملية', type: 'error'});
        }
    };

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

    // Calculate Available Slots & Quota
    useEffect(() => {
        const checkQuotaAndSlots = async () => {
            if (!bookingAppt || !bookingDate) return;
            setBookingWarning('');
            setAvailableSlots([]);

            try {
                // Fetch scheduled appointments for that day & modality
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
                    
                    // Filter Slots (Conflict Prevention)
                    if (definedSlots.length > 0) {
                        const free = definedSlots.filter(s => !bookedTimes.includes(s));
                        setAvailableSlots(free);
                    } else {
                        // Empty array means manual text input is allowed (no specific slots)
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
            
            // Show Success Modal with QR
            setBookedTicketId(bookingAppt.id);
            setIsBookingModalOpen(false);
            setIsTicketModalOpen(true);
            setBookingAppt(null);

        } catch(e) {
            setToast({ msg: 'خطأ في الحجز', type: 'error' });
        }
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
                completedAt: null
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
            // Manual Add: Use unique ID to prevent issues, though manual is less likely to dupe
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
        localStorage.setItem('appt_settings_v2', JSON.stringify(modalitySettings));
        setToast({ msg: 'تم حفظ إعدادات الحصص والمواعيد', type: 'success' });
        setIsSettingsModalOpen(false);
    };

    // --- ADMIN BULK ACTIONS ---
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
                // To be safe, we will specifically target today's date if 'delete_all' to avoid wiping entire DB
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
            
            if (snap.empty) {
                setToast({msg: 'لا توجد بيانات للحذف', type: 'info'});
                setIsCleanupProcessing(false);
                return;
            }

            // Batch delete (chunked)
            const chunks = [];
            const docs = snap.docs;
            for (let i = 0; i < docs.length; i += 500) {
                chunks.push(docs.slice(i, i + 500));
            }

            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
            
            setToast({msg: `تم حذف ${snap.size} سجل بنجاح`, type: 'success'});
        } catch(e: any) {
            setToast({msg: 'حدث خطأ: ' + e.message, type: 'error'});
        } finally {
            setIsCleanupProcessing(false);
        }
    };

    const handleCopyScript = () => {
        const script = `
(function() {
    const APP_URL = "${window.location.href.split('#')[0]}#/appointments";
    console.clear();
    console.log("%c 📡 Bridge Active V11 (Auto-Refresh Mode)... ", "background: #222; color: #0f0; font-size:16px;");
    
    // Persistent Storage Key
    const BRIDGE_ACTIVE_KEY = 'ihms_bridge_active';
    sessionStorage.setItem(BRIDGE_ACTIVE_KEY, 'true');

    // --- KEEP ALIVE SYSTEM (Every 60 Seconds) ---
    setInterval(() => {
        // 1. Ping Server to keep session alive
        fetch(window.location.href, { method: 'HEAD' })
        .then(() => {
             document.title = "✅ Active " + new Date().toLocaleTimeString();
             console.log("💓 Pulse: Session Refreshed");
        })
        .catch(() => {
             document.title = "⚠️ Disconnected";
        });
        
        // 2. Simulate User Activity (Prevent Idle Logout)
        document.dispatchEvent(new MouseEvent('mousemove'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
        
    }, 60000); // 60 Seconds Interval

    let syncWin = null;

    const openSyncWindow = () => {
        if(!syncWin || syncWin.closed) {
            syncWin = window.open(APP_URL, "SmartAppSyncWindow");
        }
        return syncWin;
    };

    const sendData = (data) => {
        if (!data) return;
        let payload = data;
        if(data.d) payload = data.d;
        if(data.result) payload = data.result;
        
        if (typeof payload === 'object' && !Array.isArray(payload)) {
             payload = [payload];
        }

        if (Array.isArray(payload) && payload.length > 0) {
            // Check validity
            if (payload[0].engName || payload[0].patientName || (payload[0].xrayPatientDetails && payload[0].xrayPatientDetails.length > 0)) {
                syncWin = openSyncWindow();
                syncWin.postMessage({ type: 'SMART_SYNC_DATA', payload: payload }, '*');
            }
        }
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', function() {
            // Check for Logout / 401
            if (this.status === 401 || this.status === 403 || this.responseURL.includes('login')) {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3');
                audio.play().catch(()=>{});
                alert("⚠️ IHMS Logged Out! Please Login Again to Keep Sync Active.");
            }

            try {
                if (this.responseText && (this.responseText.startsWith('{') || this.responseText.startsWith('['))) {
                    const json = JSON.parse(this.responseText);
                    sendData(json);
                }
            } catch(e) {}
        });
        origOpen.apply(this, arguments);
    };
    alert("✅ تم تفعيل الجسر الذكي V11 (Keep-Alive Mode)!");
})();
        `;
        navigator.clipboard.writeText(script);
        setToast({ msg: 'تم نسخ الكود المحدث V11 (يحافظ على الاتصال)!', type: 'success' });
    };

    // Determine current host for QR code explanation
    const appUrl = window.location.origin;
    const isLocalhost = appUrl.includes('localhost') || appUrl.includes('127.0.0.1');

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 sticky top-0 z-30 shadow-2xl">
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
                    
                    {/* Search Bar */}
                    <div className="flex-1 w-full md:max-w-md mx-4">
                        <div className="relative">
                            <i className="fas fa-search absolute left-3 top-2.5 text-slate-400 text-sm"></i>
                            <input 
                                className="w-full bg-slate-800 border border-slate-700 rounded-full py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                placeholder="بحث باسم المريض أو رقم الملف..."
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
                        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                            <button onClick={() => setActiveView('pending')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'pending' ? 'bg-amber-500 text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}>انتظار</button>
                            <button onClick={() => setActiveView('scheduled')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'scheduled' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>مواعيد</button>
                            <button onClick={() => setActiveView('done')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'done' ? 'bg-emerald-500 text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}>منجز</button>
                        </div>
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
            <div className="bg-white border-b border-slate-200 sticky top-[72px] z-20 shadow-sm overflow-x-auto no-scrollbar">
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
                        const count = appointments.filter(a => 
                            mod.id === 'X-RAY' ? (a.examType === 'X-RAY' || a.examType === 'OTHER') : a.examType === mod.id
                        ).length;
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

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                
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
                            
                            return (
                                <div key={appt.id} className={`relative bg-white rounded-2xl p-4 shadow-sm border-l-4 transition-all hover:-translate-y-1 animate-fade-in ${appt.status === 'done' ? 'border-l-emerald-500 opacity-80' : isScheduled ? 'border-l-blue-500' : 'border-l-amber-500 shadow-md'}`}>
                                    
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider border ${mod.color} ${mod.border}`}>
                                            <i className={`fas ${mod.icon} mr-1`}></i> {mod.label}
                                        </span>
                                        <div className="flex flex-col items-end">
                                            {isScheduled ? (
                                                <button 
                                                    onClick={() => window.open(`#/ticket/${appt.id}`, '_blank')}
                                                    className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 hover:bg-blue-100 flex items-center gap-1"
                                                >
                                                    📅 {appt.scheduledDate} <i className="fas fa-qrcode"></i>
                                                </button>
                                            ) : (
                                                <div className="flex flex-col items-end">
                                                    {/* Added Time vs Appointment Time Display */}
                                                    <span className="text-[10px] text-slate-400 font-bold mb-0.5" title="Added to System">Added: {addedTime}</span>
                                                    <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                                        Appt: {appt.time}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <h3 className="font-bold text-slate-800 text-base leading-tight mb-1 truncate" title={appt.patientName}>{appt.patientName}</h3>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">ID: {appt.fileNumber}</span>
                                        {appt.patientAge && <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Age: {appt.patientAge}</span>}
                                    </div>

                                    {/* Doctor Info */}
                                    {appt.doctorName && (
                                        <div className="mb-2 text-[10px] text-slate-600 flex items-center gap-1 font-medium bg-slate-50 p-1.5 rounded">
                                            <i className="fas fa-user-md text-slate-400"></i> {appt.doctorName}
                                        </div>
                                    )}

                                    {/* Exams List */}
                                    <div className="mb-3 bg-slate-50 rounded-lg p-2 border border-slate-100 min-h-[40px]">
                                        {appt.examList && appt.examList.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {appt.examList.map((exam, i) => (
                                                    <span key={i} className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded shadow-sm break-words max-w-full">
                                                        {exam}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-slate-400 italic">No exams listed</p>
                                        )}
                                    </div>
                                    
                                    {/* Room & Status Info for Scheduled */}
                                    {isScheduled && appt.roomNumber && (
                                        <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-100">
                                            <i className="fas fa-door-open"></i> الغرفة: {appt.roomNumber}
                                        </div>
                                    )}

                                    {/* Footer / Actions */}
                                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-50">
                                        {appt.status === 'pending' ? (
                                            <>
                                                <button 
                                                    onClick={() => handleOpenBooking(appt)}
                                                    className="flex-1 bg-white border border-blue-200 text-blue-600 py-2 rounded-lg font-bold text-xs hover:bg-blue-50 transition-colors"
                                                >
                                                    <i className="fas fa-calendar-alt"></i> حجز
                                                </button>
                                                <button 
                                                    onClick={() => handleAcceptPatient(appt)}
                                                    className="flex-[2] bg-slate-800 text-white py-2 rounded-lg font-bold text-xs hover:bg-emerald-600 transition-colors shadow-sm flex items-center justify-center gap-1"
                                                >
                                                    <span>بدء الفحص</span>
                                                    <i className="fas fa-check"></i>
                                                </button>
                                            </>
                                        ) : appt.status === 'scheduled' ? (
                                            <button 
                                                onClick={() => handleAcceptPatient(appt)}
                                                className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-xs hover:bg-blue-700 transition-colors shadow-sm"
                                            >
                                                حضور المريض وبدء الفحص
                                            </button>
                                        ) : (
                                            <div className="w-full flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                                                    <i className="fas fa-check-circle text-lg"></i>
                                                    <div className="flex flex-col">
                                                        <span>تم الفحص</span>
                                                        <span className="text-[9px] text-slate-400 font-normal truncate max-w-[100px]">{appt.performedByName}</span>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleUndo(appt)} className="text-slate-300 hover:text-red-500 px-2" title="Undo">
                                                    <i className="fas fa-undo"></i>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {isSupervisor && (
                                        <button onClick={() => handleDelete(appt.id)} className="absolute top-2 left-2 text-slate-200 hover:text-red-400 transition-colors">
                                            <i className="fas fa-times text-xs"></i>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Booking Modal */}
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
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-700"
                                    value={bookingTime}
                                    onChange={e => setBookingTime(e.target.value)}
                                >
                                    <option value="">اختر الوقت...</option>
                                    {availableSlots.map(slot => (
                                        <option key={slot} value={slot}>{slot}</option>
                                    ))}
                                </select>
                            ) : (
                                <input 
                                    type="time" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold" 
                                    value={bookingTime} 
                                    onChange={e => setBookingTime(e.target.value)} 
                                    placeholder={availableSlots.length === 0 && modalitySettings[bookingAppt?.examType || '']?.slots?.length > 0 ? "اكتملت المواعيد" : ""}
                                />
                            )}
                        </div>
                    </div>

                    {/* Room and Prep Fields */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">رقم الغرفة</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold" 
                            placeholder="مثال: غرفة 3, MRI Room 1"
                            value={bookingRoom} 
                            onChange={e => setBookingRoom(e.target.value)} 
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">التحضيرات المطلوبة</label>
                        <textarea 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold min-h-[80px]" 
                            placeholder="تعليمات الصيام، شرب الماء، إلخ..."
                            value={bookingPrep} 
                            onChange={e => setBookingPrep(e.target.value)} 
                        />
                    </div>

                    {bookingWarning && (
                        <div className={`text-xs font-bold p-3 rounded-lg border ${bookingWarning.includes('✅') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                            {bookingWarning}
                        </div>
                    )}

                    <button onClick={confirmBooking} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all">
                        تأكيد الحجز وإنشاء التذكرة
                    </button>
                </div>
            </Modal>

            {/* Ticket Success Modal */}
            <Modal isOpen={isTicketModalOpen} onClose={() => setIsTicketModalOpen(false)} title="تم حجز الموعد بنجاح ✅">
                <div className="space-y-6 text-center">
                    <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl border border-emerald-100">
                        <i className="fas fa-check-circle text-4xl mb-2 text-emerald-500"></i>
                        <p className="font-bold text-lg">تم تأكيد الحجز!</p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl border-2 border-slate-100 flex flex-col items-center">
                        <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + '/#/ticket/' + bookedTicketId)}`}
                            alt="Appointment QR"
                            className="w-48 h-48 rounded-lg shadow-sm mb-4"
                        />
                        <p className="text-sm text-slate-500 font-bold">امسح الكود لعرض التذكرة وتحميلها</p>
                        {isLocalhost && <p className="text-[10px] text-red-400 mt-2 font-bold">تنبيه: أنت تعمل على Localhost. تأكد من أن المريض يستخدم نفس الشبكة أو أن النظام مرفوع online.</p>}
                    </div>

                    <button 
                        onClick={() => window.open(`#/ticket/${bookedTicketId}`, '_blank')}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-slate-800"
                    >
                        <i className="fas fa-print"></i> فتح التذكرة للطباعة
                    </button>
                </div>
            </Modal>

            {/* Add Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="إضافة يدوية">
                <form onSubmit={handleManualSubmit} className="space-y-4">
                    <input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder="اسم المريض" value={patientName} onChange={e=>setPatientName(e.target.value)} />
                    <input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder="رقم الملف" value={fileNumber} onChange={e=>setFileNumber(e.target.value)} />
                    <div className="grid grid-cols-2 gap-4">
                        <input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder="الطبيب" value={doctorName} onChange={e=>setDoctorName(e.target.value)} />
                        <input className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" placeholder="العمر" value={patientAge} onChange={e=>setPatientAge(e.target.value)} />
                    </div>
                    <select className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold" value={examType} onChange={e=>setExamType(e.target.value)}>
                        {MODALITIES.filter(m => m.id !== 'ALL').map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <textarea className="w-full bg-slate-50 border-none rounded-xl p-3" placeholder="ملاحظات" value={notes} onChange={e=>setNotes(e.target.value)} />
                    <button className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">حفظ</button>
                </form>
            </Modal>

            {/* Settings Modal (Updated for Slots & Admin Bulk Actions) */}
            <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="الإعدادات والإدارة">
                <div className="space-y-6 max-h-[70vh] overflow-y-auto p-1 custom-scrollbar">
                    
                    {/* Admin Actions (Supervisor Only) */}
                    {isSupervisor && (
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-3">
                            <h4 className="font-bold text-red-800 text-sm flex items-center gap-2">
                                <i className="fas fa-user-shield"></i> أدوات المشرف (Bulk Actions)
                            </h4>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <button 
                                    onClick={() => handleBulkAction('clean_old')}
                                    disabled={isCleanupProcessing}
                                    className="bg-white border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-100 disabled:opacity-50"
                                >
                                    <i className="fas fa-history mr-1"></i> حذف القديم
                                </button>
                                <button 
                                    onClick={() => handleBulkAction('delete_done')}
                                    disabled={isCleanupProcessing}
                                    className="bg-white border border-emerald-200 text-emerald-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-50 disabled:opacity-50"
                                >
                                    <i className="fas fa-check-double mr-1"></i> حذف المنجز
                                </button>
                                <button 
                                    onClick={() => handleBulkAction('delete_pending')}
                                    disabled={isCleanupProcessing}
                                    className="bg-white border border-amber-200 text-amber-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-amber-50 disabled:opacity-50"
                                >
                                    <i className="fas fa-clock mr-1"></i> حذف الانتظار
                                </button>
                                <button 
                                    onClick={() => handleBulkAction('delete_all')}
                                    disabled={isCleanupProcessing}
                                    className="bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50"
                                >
                                    <i className="fas fa-skull-crossbones mr-1"></i> حذف الكل
                                </button>
                            </div>
                            {isCleanupProcessing && <p className="text-xs text-red-500 font-bold text-center animate-pulse">جاري التنفيذ...</p>}
                        </div>
                    )}

                    <div className="border-t border-slate-100 my-2"></div>

                    <p className="text-xs text-slate-500 font-bold">إعدادات الحصص والمواعيد (Slots)</p>
                    <div className="space-y-4">
                        {MODALITIES.filter(m => m.id !== 'ALL' && m.id !== 'OTHER').map(mod => (
                            <div key={mod.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <i className={`fas ${mod.icon} text-slate-400`}></i> {mod.label}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase">Max Count</span>
                                        <input 
                                            type="number" 
                                            className="w-16 bg-white border border-slate-200 rounded-lg p-1 font-bold text-center text-sm"
                                            value={modalitySettings[mod.id]?.limit || 0}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value) || 0;
                                                setModalitySettings(prev => ({
                                                    ...prev,
                                                    [mod.id]: { ...prev[mod.id], limit: val }
                                                }));
                                            }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 block mb-1">Time Slots (HH:MM separated by comma)</label>
                                    <textarea 
                                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-medium h-16"
                                        placeholder="e.g. 09:00, 09:30, 10:00"
                                        value={(modalitySettings[mod.id]?.slots || []).join(', ')}
                                        onChange={(e) => {
                                            const slots = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                                            setModalitySettings(prev => ({
                                                ...prev,
                                                [mod.id]: { ...prev[mod.id], slots: slots }
                                            }));
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <button onClick={handleSaveLimits} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 sticky bottom-0">
                        حفظ الإعدادات
                    </button>
                </div>
            </Modal>

            {/* Bridge Modal */}
            <Modal isOpen={isBridgeModalOpen} onClose={() => setIsBridgeModalOpen(false)} title="الربط الذكي (Live Sync)">
                <div className="space-y-4 text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-full flex items-center justify-center mx-auto text-2xl text-white mb-2 shadow-lg shadow-emerald-200">
                        <i className="fas fa-satellite-dish animate-pulse"></i>
                    </div>
                    <h3 className="font-bold text-slate-800">مراقب الشبكة الذكي V11 (Keep-Alive Mode)</h3>
                    <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        الكود المحدث V11 يحتوي على تقنية <b>"Keep-Alive"</b> للحفاظ على الاتصال.<br/>
                        <b>يقوم بإنعاش الجلسة كل دقيقة لمنع تسجيل الخروج التلقائي.</b>
                    </p>
                    <button onClick={handleCopyScript} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                        <i className="fas fa-copy"></i> نسخ كود المراقبة المحدث V11
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default AppointmentsPage;
