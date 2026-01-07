
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db } from '../firebase'; // db kept ONLY for system_settings (low usage)

import { QRCodeCanvas } from 'qrcode.react';


// @ts-ignore
import { 
  doc, 
  getDoc, 
  setDoc,
  Timestamp
} from 'firebase/firestore';
import { Appointment } from '../types';
import Loading from '../components/Loading';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { GoogleGenAI } from "@google/genai";

// Enhanced Keywords based on specific IHMS formats
// ORDER MATTERS: X-RAY is placed ABOVE US to catch "HUMERUS" before "US" matches the substring
const MODALITIES = [
    { 
        id: 'MRI', 
        label: 'MRI', 
        icon: 'fa-magnet', 
        color: 'text-blue-600 bg-blue-50', 
        border: 'border-blue-200', 
        keywords: ['MRI', 'MR ', 'MAGNETIC', 'M.R.I', 'رنين', 'مغناطيسي'],
        instructionImage: 'https://forms.gle/reVThvP19PygkGwbA', // ضع رابط الموقع هنا
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

// --- Helper: Convert File to Base64 for Gemini ---
const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise as string, mimeType: file.type },
    };
};

// --- Helper: Local Date String ---
// This ensures we get the date based on User's Machine Time, not UTC
const getLocalToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- Helper: Local Regex Parser (Fallback) ---
const parseMedicalTextLocally = (text: string) => {
    const clean = text.replace(/\|/g, 'I').replace(/\s+/g, ' ').trim();
    const data: any = {};

    // Patient Name
    const nameWithIdMatch = clean.match(/([A-Z\s\u0600-\u06FF]{3,40})\s*[\(\[]\s*(\d{1,12})\s*[\)\]]/);
    if (nameWithIdMatch) {
        data.patientName = nameWithIdMatch[1].trim();
        data.fileNumber = nameWithIdMatch[2]; 
    } else {
        const nameLabelMatch = clean.match(/(?:Name|Patient|Pat\.?|الاسم|المريض)\s*[:\.\-]\s*([A-Za-z\s\u0600-\u06FF]{3,40})/i);
        if (nameLabelMatch) data.patientName = nameLabelMatch[1].trim();
    }

    // File Number
    if (!data.fileNumber) {
        const orderNumMatch = clean.match(/\b(10\d{5,8})\b/); 
        if (orderNumMatch) {
            data.fileNumber = orderNumMatch[1];
        } else {
            const fileLabelMatch = clean.match(/(?:File|MRN|ID|No|PIN|Reg|رقم|الملف)[:#\.\s-]*(\d{1,12})/i);
            if (fileLabelMatch) data.fileNumber = fileLabelMatch[1];
        }
    }

    // Age
    const ageMatch = clean.match(/(?:Age|Y\/O|Years|DOB|العمر)[:\s]*(\d{1,3})/i);
    if (ageMatch) data.patientAge = ageMatch[1];

    // Doctor
    const docMatch = clean.match(/(?:Dr\.|Dr|Doctor|Physician|Ref\.?\s?By|Consultant|Specialist|د\.|دكتور|طبيب|استشاري)[:\s\.]*([A-Za-z\s\u0600-\u06FF\.]{3,30})/i);
    if (docMatch) data.doctorName = docMatch[1].trim();

    // Modality Detection
    const upperText = clean.toUpperCase();
    if (upperText.includes('MRI') || upperText.includes('MAGNETIC')) data.examType = 'MRI';
    else if (upperText.includes('CT') || upperText.includes('COMPUTED')) data.examType = 'CT';
    else if (upperText.includes('ULTRASOUND') || upperText.includes('SONO') || upperText.includes('US ')) data.examType = 'US';
    else if (upperText.includes('X-RAY') || upperText.includes('XRAY')) data.examType = 'X-RAY';
    else data.examType = 'OTHER';

    // Procedure Name (Simple Line Scoring)
    const lines = text.split('\n');
    const anatomyKeywords = ['BRAIN','CHEST','ABD','PELVIS','SPINE','KNEE','SHOULDER','NECK'];
    const bestLine = lines.find(l => anatomyKeywords.some(k => l.toUpperCase().includes(k)) && l.length < 50);
    if (bestLine) data.procedureName = bestLine.trim();

    return data;
};

interface ExtendedAppointment extends Appointment {
    roomNumber?: string;
    preparation?: string;
}

const AppointmentsPage: React.FC = () => {
    const { t, dir, language } = useLanguage();
    const navigate = useNavigate();
    
    // Data State
    const [appointments, setAppointments] = useState<ExtendedAppointment[]>([]);
    const appointmentsRef = useRef<ExtendedAppointment[]>([]); 
    
    // FIX: Initialize with Local Date instead of UTC to avoid "Yesterday" bug
    const [selectedDate, setSelectedDate] = useState(getLocalToday());
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
    
    const [manualSlotsCount, setManualSlotsCount] = useState<number>(0);
    const [manualSlots, setManualSlots] = useState<string[]>([]);

    // Quota & Slots State
    const [modalitySettings, setModalitySettings] = useState<Record<string, ModalitySettings>>(DEFAULT_SETTINGS);
    // NEW: Real-time booked count for the current date/modality
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
    const [isDayLimitReached, setIsDayLimitReached] = useState(false); // NEW: Track if limit reached

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
    const [bookedTicketData, setBookedTicketData] = useState<ExtendedAppointment | null>(null);

    // Logbook Range State - FIX: Use Local Date
    const [logStartDate, setLogStartDate] = useState(getLocalToday());
    const [logEndDate, setLogEndDate] = useState(getLocalToday());
    const [logbookData, setLogbookData] = useState<ExtendedAppointment[]>([]);
    const [isLogLoading, setIsLogLoading] = useState(false);

    const [toast, setToast] = useState<{msg: string, type: 'success'|'info'|'error'} | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [isScanning, setIsScanning] = useState(false); // Used for AI OCR
    const [ocrStatus, setOcrStatus] = useState(''); // Text status for Tesseract

    // Manual Add State - FIX: Use Local Date
    const [manualDate, setManualDate] = useState(getLocalToday());
    const [manualTime, setManualTime] = useState('08:00');
    const [manualRoom, setManualRoom] = useState('');
    const [patientName, setPatientName] = useState('');
    const [fileNumber, setFileNumber] = useState(''); 
    const [examType, setExamType] = useState('MRI');
    const [specificExamName, setSpecificExamName] = useState(''); // NEW: Specific exam name
    const [doctorName, setDoctorName] = useState('');
    const [patientAge, setPatientAge] = useState('');
    const [notes, setNotes] = useState('');
    const [preparationText, setPreparationText] = useState(''); // NEW: Editable Prep Text

    // Bridge Manual Input
    const [manualJsonInput, setManualJsonInput] = useState('');

    // --- NEW: Ref for file input ---
    const fileInputRef = useRef<HTMLInputElement>(null);
    // --- NEW: Scan Mode State ---
    const [scanMode, setScanMode] = useState<'ai' | 'local'>('ai');
    
    // --- NEW: External Gemini Text Paste State ---
    const [pastedGeminiText, setPastedGeminiText] = useState('');

    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || 'User';
    const isSupervisor = localStorage.getItem('role') === 'admin' || localStorage.getItem('role') === 'supervisor';

    useEffect(() => {
        appointmentsRef.current = appointments;
    }, [appointments]);

    // Load Settings
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, 'system_settings', 'appointment_slots');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setModalitySettings(docSnap.data() as Record<string, ModalitySettings>);
                } else {
                    if (isSupervisor) {
                        await setDoc(docRef, DEFAULT_SETTINGS);
                    }
                }
            } catch (e) {
                console.error("Failed to load settings", e);
            }
        };
        fetchSettings();
    }, [isSupervisor]);


    useEffect(() => {
        const slots = modalitySettings[editingModalityId]?.slots || [];
        const normalized = slots.map(normalizeTime).filter(Boolean);

        setManualSlots(normalized);
        setManualSlotsCount(normalized.length);
        }, [editingModalityId]);



    const normalizeTime = (time?: string) => {
  if (!time) return '';
  if (/^\d{2}:\d{2}$/.test(time)) return time;
  const match = time.match(/(\d{1,2}):(\d{2})\s?(am|pm)/i);
  if (!match) return '';
  let hour = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toLowerCase();
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, '0')}:${minutes}`;
};


    // Update Prep Text when Exam Type Changes (Manual Selection)
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
        setIsListening(true);
        let payload: any[] = [];
        if (Array.isArray(rawPayload)) {
            payload = rawPayload;
        } else if (rawPayload && typeof rawPayload === 'object') {
            payload = [rawPayload];
        }

        if (payload.length === 0) {
            setIsListening(false);
            return;
        }

        const rowsToInsert: any[] = [];

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
            if(!d) return getLocalToday(); // Use local date
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
                    const safeFileNo = commonInfo.fileNumber || `NOFILE_${Math.random().toString(36).substr(2,5)}`;
                    const uniqueId = `${group.date}_${safeFileNo}_${modId}`.replace(/[^a-zA-Z0-9_]/g, '');
                    
                    rowsToInsert.push({
                        id: uniqueId,
                        ...commonInfo,
                        examType: modId, 
                        examList: group.exams, 
                        doctorName: group.doc,
                        refNo: group.ref,
                        date: group.date, 
                        time: group.time,
                        createdAt: new Date().toISOString()
                    });
                });

            } else {
                const sName = findValue(p, ['serviceName', 'examName']) || 'General Exam';
                const modId = detectModality(sName);
                const safeFileNo = commonInfo.fileNumber || `NOFILE_${Math.random().toString(36).substr(2,5)}`;
                const uniqueId = `${cleanDate(p.queDate)}_${safeFileNo}_${modId}`.replace(/[^a-zA-Z0-9_]/g, '');
                
                rowsToInsert.push({
                    id: uniqueId,
                    ...commonInfo,
                    examType: modId,
                    examList: [sName],
                    doctorName: p.doctorName || 'Unknown Dr',
                    refNo: String(p.refNo || ''),
                    date: cleanDate(p.queDate),
                    time: qTime,
                    createdAt: new Date().toISOString()
                });
            }
        });

        try {
            if (rowsToInsert.length > 0) {
                const { error } = await supabase.from('appointments').upsert(rowsToInsert, { onConflict: 'id' });
                
                if (error) {
                    console.error("Supabase Write Error:", error);
                    setToast({ msg: 'خطأ في حفظ البيانات في قاعدة البيانات', type: 'error' });
                } else {
                    setToast({ msg: `تم استقبال ${rowsToInsert.length} فحوصات! 📥`, type: 'success' });
                    setLastSyncTime(new Date());
                    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                    
                }
            }
        } catch (e) {
            console.error("Sync Write Error:", e);
        }
        setTimeout(() => setIsListening(false), 1000);
    };

    // --- 2. INTELLIGENT EXAM SPLITTER (Bridge Listener) ---
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (!event.data || event.data.type !== 'SMART_SYNC_DATA') return;
            console.log("📨 Received Data from Bridge:", event.data.payload?.length);
            await processIncomingData(event.data.payload);
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [selectedDate]); 

    // --- 2. SUPABASE REALTIME LISTENER ---
    useEffect(() => {
        setLoading(true);

        const fetchInitialData = async () => {
            let query = supabase.from('appointments').select('*');

            if (!selectedDate && activeView !== 'scheduled' && activeView !== 'done') {
                setAppointments([]);
                setLoading(false);
                return; 
            }

            setLoading(true);
            
            if (activeView === 'scheduled') {
                // Scheduled: Future or Today
                query = query.eq('status', 'scheduled')
                             .order('scheduledDate', { ascending: true })
                             .order('time', { ascending: true });
            } else if (activeView === 'processing') {
                // Processing: SHOW ALL ACTIVE
                query = query.eq('status', 'processing')
                             .order('time', { ascending: false });

            } else if (activeView === 'done') {
                // Done: Show ALL history (descending), permanent record
                query = query.eq('status', 'done')
                             .order('completedAt', { ascending: false })
                             .limit(200); // Reasonable limit for performance
            } else {
                // Pending: Default behavior
                query = query.eq('date', selectedDate)
                             .eq('status', 'pending')
                             .order('time', { ascending: false })
                             .order('fileNumber', { ascending: false });
            }

            const { data, error } = await query;
            
            if (error) {
                console.error("Fetch Error", error);
                setLoading(false);
                return;
            }

            if (data) {
                setAppointments(data as ExtendedAppointment[]);
            }
            setLoading(false);
        };

        fetchInitialData();

        const channel = supabase
            .channel('appointments_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'appointments' },
                (payload) => {
                    const newRow = payload.new as ExtendedAppointment;
                    const oldRow = payload.old as ExtendedAppointment;
                    
                    setAppointments(prev => {
                        let updated = [...prev];

                        if (payload.eventType === 'INSERT') {
                            let matchesView = false;
                            if (activeView === 'scheduled') matchesView = newRow.status === 'scheduled';
                            else if (activeView === 'processing') matchesView = newRow.status === 'processing';
                            else if (activeView === 'done') matchesView = newRow.status === 'done';
                            else matchesView = ((newRow.date === selectedDate || newRow.scheduledDate === selectedDate) && newRow.status === activeView);
                            
                            if (matchesView) {
                                updated = [newRow, ...prev];
                            }
                        } else if (payload.eventType === 'UPDATE') {
                            let matchesView = false;
                            if (activeView === 'scheduled') matchesView = newRow.status === 'scheduled';
                            else if (activeView === 'processing') matchesView = newRow.status === 'processing';
                            else if (activeView === 'done') matchesView = newRow.status === 'done'; // Always show done
                            else matchesView = (newRow.date === selectedDate && newRow.status === activeView);
                            
                            if (matchesView) {
                                const idx = updated.findIndex(a => a.id === newRow.id);
                                if (idx > -1) updated[idx] = newRow;
                                else updated = [newRow, ...updated];
                            } else {
                                // Remove if no longer matching view
                                updated = updated.filter(a => a.id !== newRow.id);
                            }
                        } else if (payload.eventType === 'DELETE') {
                            updated = updated.filter(a => a.id !== oldRow.id);
                        }
                        
                        return updated.sort((a, b) => {
                            if (activeView === 'done') {
                                // Sort by completion time for Done view
                                const cA = a.completedAt || '';
                                const cB = b.completedAt || '';
                                return cB.localeCompare(cA);
                            }
                            
                            const timeA = a.time || '00:00';
                            const timeB = b.time || '00:00';
                            
                            if (activeView === 'processing') return 0;
                            
                            const timeComparison = timeB.localeCompare(timeA); 
                            if (timeComparison !== 0) return timeComparison;
                            
                            const fileA = a.fileNumber || '';
                            const fileB = b.fileNumber || '';
                            return fileB.localeCompare(fileA);
                        });
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
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
                (a.patientName && a.patientName.toLowerCase().includes(lowerQ)) || 
                (a.fileNumber && a.fileNumber.includes(lowerQ)) ||
                (a.refNo && a.refNo.includes(lowerQ))
            );
        }
        return list;
    }, [appointments, activeModality, searchQuery]);

    // --- FETCH ACTUAL SCHEDULED COUNT FOR QUOTA ---
    // Fetch real-time count of scheduled items for current date/modality regardless of view
  useEffect(() => {
        const fetchBookedCount = async () => {
            // FIX: Prevent query if date is empty to avoid 400 Bad Request
            if (!selectedDate) {
                setCurrentBookedCount(0);
                return;
            }

            let q = supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'scheduled')
                .eq('scheduledDate', selectedDate); 
                
            if (activeModality !== 'ALL') {
                q = q.eq('examType', activeModality);
            }
            
            const { count, error } = await q;
            if (!error && count !== null) {
                setCurrentBookedCount(count);
            }
        };

        fetchBookedCount();
        
        // Setup listener for count updates
        const countChannel = supabase
            .channel('count_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'appointments' }, 
                () => fetchBookedCount() // Re-fetch on any change
            )
            .subscribe();

        return () => { supabase.removeChannel(countChannel); };
    }, [selectedDate, activeModality]);


    // --- ACTIONS ---
    const handleAcceptPatient = async (appt: ExtendedAppointment) => {
        try {
            setAppointments(prev => prev.filter(a => a.id !== appt.id));
            const { error } = await supabase.from('appointments').update({
                status: 'done',
                performedBy: currentUserId,
                performedByName: currentUserName,
                completedAt: new Date().toISOString()
            }).eq('id', appt.id);

            if (error) throw error;
            setToast({ msg: `تم إنجاز ${appt.patientName} ✅`, type: 'success' });
        } catch(e: any) {
            setToast({msg: 'خطأ في العملية', type: 'error'});
        }
    };

    const handleDelete = async (id: string) => {
        if(!confirm(t('confirm') + '?')) return;
        try {
            setAppointments(prev => prev.filter(a => a.id !== id));
            const { error } = await supabase.from('appointments').delete().eq('id', id);
            if (error) throw error;
            setToast({ msg: t('delete'), type: 'success' });
        } catch(e) { console.error(e); }
    };
    
    // NEW: Cancel Appointment (Revert to Pending)
    const handleCancelAppointment = async (appt: ExtendedAppointment) => {
    if (!confirm(t('appt.confirmCancel'))) return;
        try {
            // Optimistic update
            setAppointments(prev => prev.filter(a => a.id !== appt.id));
            
            const { error } = await supabase.from('appointments').update({
                status: 'pending',
                scheduledDate: null,
                time: null,
                notes: appt.notes ? appt.notes + '\n[System]: Appointment Cancelled' : '[System]: Appointment Cancelled'
            }).eq('id', appt.id);
            
            if (error) throw error;
        setToast({ msg: t('appt.toast.cancelled'), type: 'success' });
        } catch (e) {
            console.error(e);
        setToast({ msg: t('error.general'), type: 'error' });
        }
    };

    // --- DOUBLE BOOKING CHECK (SUPABASE) ---
    const checkAvailability = async (date: string, time: string, type: string) => {
        if (type === 'X-RAY' || type === 'OTHER') return true;

        const { data, error } = await supabase.from('appointments').select('*')
            .or(`date.eq.${date},scheduledDate.eq.${date}`)
            .eq('time', time)
            .eq('examType', type)
            .neq('status', 'done')
            .neq('status', 'cancelled');

        if (error) {
            console.error("Availability Check Error:", error);
            return false; // Fail safe
        }

        return data.length === 0;
    };

    // --- WORKFLOW: START EXAM ---
    const handleStartExam = async (appt: ExtendedAppointment) => {
        if (processingId) return;
        setProcessingId(appt.id);

        try {
            if (appt.status !== 'pending' && appt.status !== 'scheduled') {
            throw new Error(t('appt.alreadyTaken'));            }

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

            const { error } = await supabase.from('appointments').update({
                status: 'processing',
                performedBy: currentUserId,
                performedByName: currentUserName,
                registrationNumber: regNo
            }).eq('id', appt.id);

            if (error) throw error;
            
            setCurrentRegNo(regNo);
            setIsRegModalOpen(true);
            if (navigator.vibrate) navigator.vibrate(200);

        } catch(e: any) {
        setToast({ msg: t('error.general'), type: 'error' });
        } finally {
            setProcessingId(null);
        }
    };

    // --- WORKFLOW: FINISH EXAM ---
    const handleFinishClick = (appt: ExtendedAppointment) => {
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

            const { error } = await supabase.from('appointments').update({
                status: 'done',
                completedAt: new Date().toISOString(),
                isPanic: isPanic,
                panicDetails: isPanic ? panicDescription : null
            }).eq('id', finishingAppt.id);

            if (error) throw error;

            setToast({ 
            msg: isPanic ? t('appt.toast.panic') : t('appt.toast.finish'), 
            type: 'success' 
        });
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

            setIsPanicModalOpen(false);
            setFinishingAppt(null);
            setPanicDescription('');

        } catch (e) {
            console.error(e);
                    setToast({ 
                msg: t('appt.toast.error'), 
                type: 'error'});
                }
    };

    // --- GENERIC ACTIONS ---
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
            if (!bookingAppt || !bookingDate) return;
            setBookingWarning('');
            setAvailableSlots([]);
            setIsDayLimitReached(false);

            try {
                // Check quota for the specific date selected in modal
                const { data, error } = await supabase.from('appointments').select('time')
                    .eq('status', 'scheduled')
                    .eq('scheduledDate', bookingDate)
                    .eq('examType', bookingAppt.examType);

                if (error) throw error;

                const bookedTimes = data.map(d => d.time);
                const currentCount = data.length;
                
                const settings = modalitySettings[bookingAppt.examType] || DEFAULT_SETTINGS['OTHER'];
                const limit = settings.limit;
                const definedSlots = settings.slots || [];

                if (currentCount >= limit) {
                const warningMsg = t('appt.limitWarning')
                    .replace('{count}', currentCount.toString())
                    .replace('{limit}', limit.toString());

setBookingWarning(warningMsg);                    setIsDayLimitReached(true);
                    setAvailableSlots([]);
                } else {
                    setBookingWarning(`✅ متاح: ${limit - currentCount} أماكن.`);
                    setIsDayLimitReached(false);
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
        if (!bookingAppt || !bookingDate || (!bookingTime && (!isDayLimitReached || isSupervisor))) {
            setToast({msg: t('appt.slotsAvailable'), type: 'error'});
            return;
        }
        
        // Final guard against users booking when limit is reached
        if (isDayLimitReached && !isSupervisor) {
             setToast({msg: t('appt.dayFull'), type: 'error'});
             return;
        }

        try {
            setAppointments(prev => prev.filter(a => a.id !== bookingAppt.id));

            const bookingData = {
                ...bookingAppt,
                scheduledDate: bookingDate,
                time: bookingTime || '08:00', // Supervisor fallback time
                roomNumber: bookingRoom,
                preparation: bookingPrep
            };
            setBookedTicketData(bookingData);

            const { error } = await supabase.from('appointments').update({
                status: 'scheduled',
                scheduledDate: bookingDate,
                time: bookingTime || '08:00', 
                roomNumber: bookingRoom, 
                preparation: bookingPrep, 
                notes: `${bookingAppt.notes || ''}\n📅 Booked: ${bookingDate} ${bookingTime}`
            }).eq('id', bookingAppt.id);

            if (error) throw error;

            setBookedTicketId(bookingAppt.id);
            setIsBookingModalOpen(false);
            setIsTicketModalOpen(true);
            setBookingAppt(null);
            
            if (navigator.vibrate) navigator.vibrate(100);
        } catch(e) { setToast({ msg: t('appt.saveError'), type: 'error' }); }
    };

    const handleUndo = async (appt: ExtendedAppointment) => {
        if (!isSupervisor && appt.performedBy !== currentUserId) {
        setToast({ msg: t('appt.error.notYourColleague'), type: 'error' });
              return;
              }
        try {
            setAppointments(prev => prev.filter(a => a.id !== appt.id));

            const { error } = await supabase.from('appointments').update({
                status: 'pending',
                performedBy: null,
                performedByName: null,
                completedAt: null,
                isPanic: false
            }).eq('id', appt.id);

            if (error) throw error;

            setToast({ msg: t('appt.confirmCancel'), type: 'info' });
        } catch(e) { console.error(e); }
    };

    const handleExternalGemini = () => {
        const prompt = "Please analyze this medical invoice/document image. Extract the following fields and return them in this specific JSON format: { \"patientName\": \"...\", \"fileNumber\": \"...\", \"doctorName\": \"...\", \"patientAge\": \"...\", \"examType\": \"...\" (MRI/CT/US/X-RAY/FLUO/OTHER), \"procedureName\": \"...\" }. Return ONLY the JSON.";
        navigator.clipboard.writeText(prompt);
        setToast({ msg: 'تم نسخ الأمر! الصقه في موقع Gemini مع الصورة.', type: 'info' });
        window.open("https://gemini.google.com/app", "_blank");
    };

    const handleSmartPaste = () => {
        try {
            const cleanJson = pastedGeminiText.replace(/```json|```/g, '').trim();
            const start = cleanJson.indexOf('{');
            const end = cleanJson.lastIndexOf('}');
            
            if (start !== -1 && end !== -1) {
                const jsonStr = cleanJson.substring(start, end + 1);
                const data = JSON.parse(jsonStr);
                
                if (data.patientName) setPatientName(data.patientName);
                if (data.fileNumber) setFileNumber(data.fileNumber);
                if (data.doctorName) setDoctorName(data.doctorName);
                if (data.patientAge) setPatientAge(data.patientAge);
                if (data.procedureName) setSpecificExamName(data.procedureName);
                
                const validTypes = MODALITIES.map(m => m.id);
                let detectedType = 'OTHER';
                if (data.examType) {
                    const upperType = data.examType.toUpperCase();
                    if (validTypes.includes(upperType)) detectedType = upperType;
                    else {
                        if(upperType.includes('MRI')) detectedType = 'MRI';
                        else if(upperType.includes('CT')) detectedType = 'CT';
                        else if(upperType.includes('ULTRASOUND')) detectedType = 'US';
                        else if(upperType.includes('X-RAY')) detectedType = 'X-RAY';
                    }
                }
                setExamType(detectedType);
                
                const prep = modalitySettings[detectedType]?.prep || MODALITIES.find(m => m.id === detectedType)?.defaultPrep || '';
                setPreparationText(prep);

            setToast({ msg: t('appt.toast.dataFilled'), type: 'success' });  
                          setPastedGeminiText('');
            } else {
                throw new Error("Invalid JSON format");
            }
        } catch (e) {
            setToast({ msg: 'فشل تحليل النص. تأكد من نسخ كود JSON صحيح.', type: 'error' });
        }
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

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        const file = e.target.files[0];
        
        if (scanMode === 'ai') {
            await handleScanAI(file);
        } else {
            await handleScanLocal(file);
        }
        e.target.value = '';
    };

    const handleTriggerScan = (mode: 'ai' | 'local') => {
        setScanMode(mode);
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleScanLocal = async (file: File) => {
        setIsScanning(true);
        setOcrStatus('جاري القراءة (محلي)...');
        setToast({ msg: 'جاري التحليل محلياً... ⏳', type: 'info' });

        try {
            // @ts-ignore
            if (!window.Tesseract) {
                throw new Error("مكتبة OCR غير جاهزة، يرجى تحديث الصفحة.");
            }

            // @ts-ignore
            const { data: { text } } = await window.Tesseract.recognize(
                file,
                'eng',
                { 
                    logger: (m: any) => {
                        if (m.status === 'recognizing text') {
                            setOcrStatus(`مسح محلي: ${(m.progress * 100).toFixed(0)}%`);
                        }
                    }
                }
            );

            const data = parseMedicalTextLocally(text);
            
            if (data.patientName) setPatientName(data.patientName);
            if (data.fileNumber) setFileNumber(data.fileNumber);
            if (data.doctorName) setDoctorName(data.doctorName);
            if (data.patientAge) setPatientAge(data.patientAge);
            if (data.procedureName) setSpecificExamName(data.procedureName);
            
            if (data.examType) {
                const type = MODALITIES.find(m => m.id === data.examType) ? data.examType : 'OTHER';
                setExamType(type);
                const prep = modalitySettings[type]?.prep || MODALITIES.find(m => m.id === type)?.defaultPrep || '';
                setPreparationText(prep);
            }

            setToast({ msg: 'تم استخراج البيانات (محلي) ✅', type: 'success' });

        } catch (error: any) {
            console.error("Local Scan Error", error);
            setToast({ msg: 'فشل المسح المحلي. يرجى المحاولة يدوياً.', type: 'error' });
        } finally {
            setIsScanning(false);
            setOcrStatus('');
        }
    };

    const handleScanAI = async (file: File) => {
        setIsScanning(true);
        setOcrStatus('جاري التحليل بالذكاء الاصطناعي...');
        setToast({ msg: 'جاري التحليل الذكي... ⏳', type: 'info' });

        try {
            let apiKey = process.env.API_KEY;
            // @ts-ignore
            if (!apiKey && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
                 // @ts-ignore
                 apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            }

            if (!apiKey) throw new Error("API Key not found.");

            const ai = new GoogleGenAI({ apiKey });
            const imagePart = await fileToGenerativePart(file);
            
            const response = await ai.models.generateContent({
                model: 'gemini-1.5-flash', 
                contents: {
                    parts: [
                        imagePart,
                        { text: `Extract JSON {patientName, fileNumber, procedureName, examType ('MRI'|'CT'|'US'|'X-RAY'|'FLUO'|'OTHER'), doctorName, patientAge} from this medical document image. Return only JSON.` }
                    ]
                }
            });

            const responseText = response?.text || "{}";
            const cleanJson = responseText.replace(/```json|```/g, '').trim();
            const data = JSON.parse(cleanJson);

            setToast({ msg: 'تم استخراج البيانات (AI) ✅', type: 'success' });

            if (data.patientName) setPatientName(data.patientName);
            if (data.fileNumber) setFileNumber(data.fileNumber);
            if (data.doctorName) setDoctorName(data.doctorName);
            if (data.patientAge) setPatientAge(data.patientAge);
            if (data.room) setManualRoom(data.room);
            if (data.procedureName) setSpecificExamName(data.procedureName);
            
            const validTypes = MODALITIES.map(m => m.id);
            let detectedType = 'OTHER';
            if (data.examType) {
                const upperType = data.examType.toUpperCase();
                if (validTypes.includes(upperType)) {
                    detectedType = upperType;
                } else {
                    const procUpper = (data.procedureName || '').toUpperCase();
                    if(procUpper.includes('MRI') || procUpper.includes('MAGNETIC')) detectedType = 'MRI';
                    else if(procUpper.includes('CT') || procUpper.includes('COMPUTED')) detectedType = 'CT';
                    else if(procUpper.includes('US') || procUpper.includes('ULTRASOUND')) detectedType = 'US';
                    else if(procUpper.includes('X-RAY')) detectedType = 'X-RAY';
                }
            }
            setExamType(detectedType);

            const prep = modalitySettings[detectedType]?.prep || MODALITIES.find(m => m.id === detectedType)?.defaultPrep || '';
            setPreparationText(prep);

        } catch (error: any) {
            console.error("AI Scan Error", error);
            if (error.message?.includes('429')) {
                setToast({ msg: 'استنفذت باقة AI. جرب المسح المحلي.', type: 'error' });
            } else {
                setToast({ msg: 'فشل المسح الذكي. جرب المسح المحلي.', type: 'error' });
            }
        } finally {
            setIsScanning(false);
            setOcrStatus('');
        }
    };

    // حساب ما إذا كان القسم المختار قد وصل للحد الأقصى اليوم (Universal Check)
    const currentModalityLimit = useMemo(() => {
        if (activeModality === 'ALL') return null;
        return modalitySettings[activeModality]?.limit || 0;
    }, [activeModality, modalitySettings]);

    // Use the REAL-TIME count from useEffect below for accuracy
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
        if (!patientName || !examType) return;

        if (await checkAvailability(manualDate, manualTime, examType) === false) {
        setToast({ 
            msg: t('appt.error.alreadyBooked').replace('{time}', manualTime), 
            type: 'error' 
        });
            return;
        }

        try {
            const uniqueId = `MANUAL_${Date.now()}`;
            const status = manualDate ? 'scheduled' : 'pending';
            const examList = specificExamName ? [specificExamName] : [examType];

            const { error } = await supabase.from('appointments').insert({
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

            if (error) throw error;

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

    const generateSlots = () => {
        const start = parseInt(editStartTime.split(':')[0]) * 60 + parseInt(editStartTime.split(':')[1]);
        const end = parseInt(editEndTime.split(':')[0]) * 60 + parseInt(editEndTime.split(':')[1]);
        const interval = parseInt(String(editInterval));
        
        const newSlots: string[] = [];
        for (let time = start; time < end; time += interval) {
            const h = Math.floor(time / 60).toString().padStart(2, '0');
            const m = (time % 60).toString().padStart(2, '0');
            newSlots.push(`${h}:${m}`);
        }

        setModalitySettings(prev => ({
            ...prev,
            [editingModalityId]: { ...prev[editingModalityId], slots: newSlots }
        }));
    };

    const handleCopyScript = () => {
        const script = `
/* 🚀 AJ-SMART-BRIDGE V13 (Stealth Mode + Auto-Send) */
(function() {
    console.clear();
    console.log("%c 🟢 Bridge Active: Stealth Mode Enabled... ", "background: #000; color: #0f0; font-size:12px;");

    const APP_URL = "${window.location.origin}/#/appointments";
    let syncWin = null;

    window.onbeforeunload = function() {
        return "⚠️ Bridge is active. Are you sure you want to close?";
    };

    function openSyncWindow() {
        if (!syncWin || syncWin.closed) {
            syncWin = window.open(APP_URL, "SmartAppSyncWindow");
        }
        return syncWin;
    }

    function sendData(data) {
        if (!data) return;
        let payload = data;
        
        if (data.d) payload = data.d;
        if (data.result) payload = data.result;
        
        if (!Array.isArray(payload)) payload = [payload];

        const isValid = payload.length > 0 && (
            payload[0].engName || 
            payload[0].patientName || 
            payload[0].xrayPatientDetails || 
            payload[0].fileNumber
        );

        if (isValid) {
            console.log("🔥 Data Intercepted. Syncing...");
            syncWin = openSyncWindow();
            setTimeout(() => {
                syncWin.postMessage({ type: 'SMART_SYNC_DATA', payload: payload }, '*');
            }, 300);
        }
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            const contentType = this.getResponseHeader("content-type");
            if (contentType && contentType.includes("application/json")) {
                try {
                    const text = this.responseText;
                    if (text) {
                        const json = JSON.parse(text);
                        sendData(json);
                    }
                } catch (e) {}
            }
        });
        return originalSend.apply(this, arguments);
    };
})();
`;
        navigator.clipboard.writeText(script);
        setToast({ msg: 'تم نسخ الكود الشبح (V13)!', type: 'success' });
    };

    // Logbook logic...
    const fetchLogbookData = async () => {
        setIsLogLoading(true);
        try {
            const { data, error } = await supabase
                .from('appointments')
                .select('*')
                .gte('date', logStartDate)
                .lte('date', logEndDate);

            if(error) throw error;

            const list = (data || []).map((d: any) => ({...d} as ExtendedAppointment));
            
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
        const sourceData = logbookData.length > 0 ? logbookData : appointments;
        return sourceData.filter(a => {
            if (type === 'MRI') return a.examType === 'MRI';
            if (type === 'CT') return a.examType === 'CT';
            return a.examType !== 'MRI' && a.examType !== 'CT'; 
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
                                {activeView === 'scheduled' ? <span>{t( 'appt.viewScheduled')}</span> : <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} className="bg-transparent border-none text-white p-0 text-xs font-bold focus:ring-0" />}
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
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${activeModality === mod.id ? 'bg-white/30 text-current' : 'bg-slate-100 text-slate-500'}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
            {/* رسالة تنبيه عند اكتمال العدد */}
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
            
            {/* زر سريع للمشرف لزيادة الحد إذا لزم الأمر */}
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

            {/* Content */}
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
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredAppointments.map(appt => {
                            const mod = MODALITIES.find(m => m.id === appt.examType) || MODALITIES[MODALITIES.length - 1];
                            const isScheduled = appt.status === 'scheduled';
                            
                            const dateDisplay = appt.scheduledDate || appt.date;
                            const timeDisplay = appt.time;

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
                    <div className="flex gap-2">
                        <button 
                            onClick={() => { setScanMode('local'); fileInputRef.current?.click(); }}
                            className="flex-1 py-3 rounded-xl bg-blue-50 text-blue-600 font-bold border border-blue-200 hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <i className="fas fa-camera"></i>{t('appt.scanLocal')}
                        </button>
                        <button 
                            onClick={() => { setScanMode('ai'); fileInputRef.current?.click(); }}
                            className="flex-1 py-3 rounded-xl bg-purple-50 text-purple-600 font-bold border border-purple-200 hover:bg-purple-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <i className="fas fa-robot"></i>{t('appt.scanAI')}
                        </button>
                    </div>

                    <div className="relative">
                        <button 
                            onClick={handleExternalGemini}
                            className="w-full py-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold shadow-lg hover:shadow-emerald-200 hover:scale-[1.02] transition-all flex items-center justify-center gap-3 border border-emerald-400 cursor-pointer"
                        >
                            <span className="bg-white/20 p-1.5 rounded-lg"><i className="fas fa-external-link-alt text-lg"></i></span>
                            <div className="text-right">
                                <p className="text-xs opacity-90">{t('appt.geminiUse')}</p>
                                <p className="text-sm font-black">{t('appt.geminiCopy')}</p>
                            </div>
                        </button>
                        
                        <div className="mt-3 bg-slate-50 border-2 border-dashed border-teal-200 rounded-xl p-3">
                            <textarea 
                                className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none resize-none placeholder-slate-400 min-h-[60px]"
                                placeholder="الصق النتيجة من Gemini هنا (JSON)..."
                                value={pastedGeminiText}
                                onChange={(e) => setPastedGeminiText(e.target.value)}
                            />
                            {pastedGeminiText && (
                                <button 
                                    onClick={handleSmartPaste}
                                    className="w-full mt-2 bg-teal-600 text-white py-2 rounded-lg font-bold text-xs hover:bg-teal-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <i className="fas fa-magic"></i>{t('appt.autoFill')}
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <input 
                        ref={fileInputRef}
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        className="hidden"
                        onChange={handleFileChange}
                    />

                    {isScanning && (
                        <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed border-indigo-200">
                            <i className="fas fa-spinner fa-spin text-2xl text-indigo-500 mb-2"></i>
                            <p className="text-sm font-bold text-slate-600">{ocrStatus}</p>
                        </div>
                    )}

                    <form onSubmit={handleManualSubmit} className="space-y-4 border-t border-slate-100 pt-4">
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
                                        <select className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold" value={manualTime} onChange={e=>setManualTime(e.target.value)}>
                                            {modalitySettings[examType].slots.map(slot => (
                                                <option key={slot} value={slot}>{slot}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input type="time" className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold" value={manualTime} onChange={e=>setManualTime(e.target.value)} />
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
                            placeholder={t('appt.patientName')} // تم التغيير هنا
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

            {/* Bridge Modal */}
            <Modal isOpen={isBridgeModalOpen} onClose={() => setIsBridgeModalOpen(false)} title="الربط الذكي">
                <div className="space-y-4 text-center">
                    <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                       {t('appt.bridgeInfo')}
                    </p>
                    <button onClick={handleCopyScript} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 cursor-pointer">
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
                            className="w-full mt-2 bg-blue-600 text-white py-2 rounded-lg font-bold text-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                        >
                           {t('appt.processManual')}
                        </button>
                    </div>
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
                            Close
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Other Modals (Booking, Ticket, Add, Settings, Bridge) */}
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
        </div>
    );
};

export default AppointmentsPage;
