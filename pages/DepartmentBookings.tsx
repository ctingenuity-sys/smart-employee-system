import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { appointmentsDb } from '../firebaseAppointments';
import { collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import Loading from '../components/Loading';

// --- Constants (Mirrored from AppointmentsPage) ---
const MODALITIES = [
    { id: 'MRI', label: 'MRI', icon: 'fa-magnet', color: 'text-blue-600 bg-blue-50', border: 'border-blue-200' },
    { id: 'CT', label: 'CT Scan', icon: 'fa-ring', color: 'text-emerald-600 bg-emerald-50', border: 'border-emerald-200' },
    { id: 'US', label: 'Ultrasound', icon: 'fa-wave-square', color: 'text-indigo-600 bg-indigo-50', border: 'border-indigo-200' },
    { id: 'X-RAY', label: 'X-Ray & General', icon: 'fa-x-ray', color: 'text-slate-600 bg-slate-50', border: 'border-slate-200' },
    { id: 'FLUO', label: 'Fluoroscopy', icon: 'fa-video', color: 'text-amber-600 bg-amber-50', border: 'border-amber-200' },
    { id: 'OTHER', label: 'General', icon: 'fa-notes-medical', color: 'text-gray-600 bg-gray-50', border: 'border-gray-200' }
];

const DEFAULT_SETTINGS: any = {
    'MRI': { limit: 15, slots: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'] },
    'CT': { limit: 20, slots: ['09:00', '09:20', '09:40', '10:00', '10:20', '10:40', '11:00', '11:20', '11:40', '12:00'] },
    'US': { limit: 30, slots: [] }, // US usually doesn't have fixed slots in this system, but we'll handle it
    'X-RAY': { limit: 50, slots: [] },
    'FLUO': { limit: 10, slots: ['08:00', '09:00', '10:00'] },
    'OTHER': { limit: 100, slots: [] }
};

const DepartmentBookings: React.FC = () => {
    const { t, dir } = useLanguage();
    const [selectedModality, setSelectedModality] = useState('MRI');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [slots, setSlots] = useState<string[]>([]);
    const [bookedSlots, setBookedSlots] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalitySettings, setModalitySettings] = useState<any>(DEFAULT_SETTINGS);

    // Booking Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState('');
    const [patientName, setPatientName] = useState('');
    const [fileNumber, setFileNumber] = useState('');
    const [phone, setPhone] = useState('');
    const [gender, setGender] = useState('');
    const [notes, setNotes] = useState('');
    const [isBooking, setIsBooking] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

    // Pending Patients Logic
    const [pendingPatients, setPendingPatients] = useState<any[]>([]);
    const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);

    useEffect(() => {
        if (isModalOpen) {
            const fetchPending = async () => {
                try {
                    const q = query(
                        collection(appointmentsDb, 'appointments'),
                        where('examType', '==', selectedModality),
                        where('status', '==', 'pending')
                    );
                    const snap = await getDocs(q);
                    const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                    setPendingPatients(data);
                } catch (e) {
                    console.error("Error fetching pending", e);
                }
            };
            fetchPending();
        } else {
            // Reset form when modal closes
            setSelectedPendingId(null);
            setPatientName('');
            setFileNumber('');
            setPhone('');
            setNotes('');
        }
    }, [isModalOpen, selectedModality]);

    // Fetch Settings
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(appointmentsDb, 'system_settings', 'appointment_slots');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setModalitySettings(docSnap.data());
                }
            } catch (e) {
                console.error("Error fetching settings", e);
            }
        };
        fetchSettings();
    }, []);

    // Fetch Slots & Bookings
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Get Defined Slots
                const settings = modalitySettings[selectedModality] || DEFAULT_SETTINGS[selectedModality];
                const definedSlots = settings?.slots || [];
                setSlots(definedSlots);

                // 2. Get Booked Slots
                const q = query(
                    collection(appointmentsDb, 'appointments'),
                    where('examType', '==', selectedModality),
                    where('scheduledDate', '==', selectedDate), // Ensure field name matches DB (scheduledDate vs date)
                    where('status', 'in', ['scheduled', 'pending', 'processing']) // Consider all active statuses as booked? Or just scheduled?
                    // Usually 'scheduled' means a confirmed future slot. 'pending' might be a request without a slot.
                    // Let's assume 'scheduled' appointments have a time slot.
                );
                
                // Also check for 'date' field if 'scheduledDate' is not used consistently
                // For simplicity, let's query broadly and filter in memory if needed, or stick to 'scheduledDate' if that's the convention for bookings.
                // Looking at AppointmentsPage, it uses 'scheduledDate' for 'scheduled' view.

                const snapshot = await getDocs(q);
                const booked = snapshot.docs
                    .map(d => d.data().time)
                    .filter(t => t); // Filter out undefined/null times
                
                setBookedSlots(booked);

            } catch (e) {
                console.error("Error fetching data", e);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedModality, selectedDate, modalitySettings]);

    const handleSlotClick = (slot: string) => {
        if (bookedSlots.includes(slot)) return;
        setSelectedSlot(slot);
        setIsModalOpen(true);
    };

    const handleBook = async () => {
        if (!patientName || !fileNumber) {
            setToast({ msg: 'Please fill in all required fields', type: 'error' });
            return;
        }

        setIsBooking(true);
        try {
            if (selectedPendingId) {
                // Update existing pending appointment
                await updateDoc(doc(appointmentsDb, 'appointments', selectedPendingId), {
                    status: 'scheduled',
                    scheduledDate: selectedDate,
                    date: selectedDate,
                    time: selectedSlot,
                    patientName,
                    fileNumber,
                    phone,
                    gender,
                    notes,
                    updatedAt: new Date().toISOString(),
                    updatedBy: auth.currentUser?.uid || 'system'
                });
            } else {
                // Create New Appointment
                const id = `${selectedDate}_${fileNumber}_${selectedModality}_${Date.now()}`;
                await setDoc(doc(appointmentsDb, 'appointments', id), {
                    id,
                    patientName,
                    fileNumber,
                    phone,
                    gender,
                    notes,
                    examType: selectedModality,
                    scheduledDate: selectedDate, 
                    date: selectedDate, 
                    time: selectedSlot,
                    status: 'scheduled',
                    createdAt: new Date().toISOString(),
                    createdBy: auth.currentUser?.uid || 'system',
                    createdByName: localStorage.getItem('username') || 'User'
                });
            }

            setToast({ msg: 'Appointment booked successfully!', type: 'success' });
            setIsModalOpen(false);
            
            // Refresh booked slots locally
            setBookedSlots(prev => [...prev, selectedSlot]);
            
            // Reset Form
            setPatientName('');
            setFileNumber('');
            setPhone('');
            setGender('');
            setNotes('');
            setSelectedPendingId(null);
        } catch (e) {
            console.error("Booking error", e);
            setToast({ msg: 'Failed to book appointment', type: 'error' });
        } finally {
            setIsBooking(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">
                        <i className="fas fa-calendar-check text-blue-600 mr-3"></i>
                        Department Bookings
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">View availability and book appointments for all departments.</p>
                </div>
                
                {/* Date Picker */}
                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                    <input 
                        type="date" 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent border-none outline-none text-slate-700 font-bold text-lg"
                    />
                </div>
            </div>

            {/* Department Tabs */}
            <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                {MODALITIES.map(mod => (
                    <button
                        key={mod.id}
                        onClick={() => setSelectedModality(mod.id)}
                        className={`
                            relative px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 shadow-sm border
                            ${selectedModality === mod.id 
                                ? `${mod.color.replace('text-', 'bg-').replace('bg-', 'text-white ')} border-transparent shadow-lg transform -translate-y-1` 
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }
                        `}
                    >
                        <div className="flex items-center gap-2">
                            <i className={`fas ${mod.icon} text-lg ${selectedModality === mod.id ? 'text-white' : mod.color.split(' ')[0]}`}></i>
                            <span>{mod.label}</span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Slots Grid */}
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 min-h-[400px]">
                {loading ? (
                    <div className="h-full flex items-center justify-center py-20">
                        <Loading />
                    </div>
                ) : (
                    <>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-700">
                                Available Slots for <span className="text-blue-600">{selectedModality}</span> on {selectedDate}
                            </h2>
                            <div className="flex gap-4 text-sm font-bold">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                    <span className="text-slate-500">Available</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                                    <span className="text-slate-500">Booked</span>
                                </div>
                            </div>
                        </div>

                        {slots.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {slots.map((slot, idx) => {
                                    const isBooked = bookedSlots.includes(slot);
                                    return (
                                        <button
                                            key={idx}
                                            disabled={isBooked}
                                            onClick={() => handleSlotClick(slot)}
                                            className={`
                                                relative group p-4 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center gap-2
                                                ${isBooked 
                                                    ? 'bg-rose-50 border-rose-100 cursor-not-allowed opacity-60' 
                                                    : 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-md cursor-pointer hover:-translate-y-1'
                                                }
                                            `}
                                        >
                                            <i className={`fas fa-clock text-xl ${isBooked ? 'text-rose-400' : 'text-emerald-500'}`}></i>
                                            <span className={`text-lg font-black ${isBooked ? 'text-rose-400' : 'text-emerald-700'}`}>
                                                {slot}
                                            </span>
                                            {isBooked && (
                                                <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-20">
                                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <i className="fas fa-calendar-times text-3xl text-slate-400"></i>
                                </div>
                                <h3 className="text-lg font-bold text-slate-600">No slots defined for this day/modality.</h3>
                                <p className="text-slate-400 mt-2">Please check the schedule settings or select another date.</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Booking Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Confirm Booking">
                <div className="space-y-4">
                    
                    {/* Pending Patients Selection */}
                    {pendingPatients.length > 0 && (
                        <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 mb-2">
                            <label className="text-xs font-bold text-amber-700 uppercase mb-2 block flex items-center gap-2">
                                <i className="fas fa-clock"></i> Select from Waiting List ({pendingPatients.length})
                            </label>
                            <select 
                                className="w-full bg-white border border-amber-300 rounded-lg p-2 font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                                onChange={(e) => {
                                    const p = pendingPatients.find(p => p.id === e.target.value);
                                    if (p) {
                                        setPatientName(p.patientName);
                                        setFileNumber(p.fileNumber);
                                        setPhone(p.phone || '');
                                        setNotes(p.notes || '');
                                        setSelectedPendingId(p.id);
                                    } else {
                                        setPatientName('');
                                        setFileNumber('');
                                        setPhone('');
                                        setNotes('');
                                        setSelectedPendingId(null);
                                    }
                                }}
                                value={selectedPendingId || ''}
                            >
                                <option value="">-- New Patient (Create New) --</option>
                                {pendingPatients.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.patientName} ({p.fileNumber}) - {new Date(p.createdAt).toLocaleDateString()}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xl font-bold">
                            <i className="fas fa-calendar-day"></i>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Appointment Details</p>
                            <p className="text-lg font-black text-blue-800">{selectedModality} - {selectedDate} at {selectedSlot}</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Patient Name</label>
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Enter patient name"
                                value={patientName}
                                onChange={e => setPatientName(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">File Number</label>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="File No."
                                    value={fileNumber}
                                    onChange={e => setFileNumber(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">{t('user.gender')}</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={gender}
                                    onChange={e => setGender(e.target.value)}
                                >
                                    <option value="">Select</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Phone (Optional)</label>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="05..."
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Notes (Optional)</label>
                            <textarea 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                                placeholder="Any additional notes..."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    <button 
                        onClick={handleBook}
                        disabled={isBooking}
                        className="w-full bg-blue-600 text-white py-4 rounded-xl font-black text-lg shadow-lg hover:bg-blue-700 transform active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        {isBooking ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check-circle"></i> Confirm Booking</>}
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default DepartmentBookings;
