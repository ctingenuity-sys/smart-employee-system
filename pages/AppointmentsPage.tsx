
import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, addDoc, Timestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Appointment } from '../types';
import Loading from '../components/Loading';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import VoiceInput from '../components/VoiceInput';

const MODALITIES = [
    { id: 'MRI', label: 'MRI', icon: 'fa-magnet', color: 'text-blue-600 bg-blue-50' },
    { id: 'CT', label: 'CT Scan', icon: 'fa-ring', color: 'text-emerald-600 bg-emerald-50' },
    { id: 'X-RAY', label: 'X-Ray', icon: 'fa-x-ray', color: 'text-slate-600 bg-slate-50' },
    { id: 'US', label: 'Ultrasound', icon: 'fa-wave-square', color: 'text-indigo-600 bg-indigo-50' },
    { id: 'FLUO', label: 'Fluoroscopy', icon: 'fa-video', color: 'text-amber-600 bg-amber-50' },
    { id: 'MAMMO', label: 'Mammography', icon: 'fa-venus', color: 'text-pink-600 bg-pink-50' },
    { id: 'OTHER', label: 'General/Other', icon: 'fa-notes-medical', color: 'text-gray-600 bg-gray-50' }
];

const AppointmentsPage: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    
    // Data State
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedModality, setSelectedModality] = useState('ALL');
    
    // UI State
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'info'|'error'} | null>(null);

    // Form State
    const [patientName, setPatientName] = useState('');
    const [fileNumber, setFileNumber] = useState(''); // NEW: File Number State
    const [examType, setExamType] = useState('MRI');
    const [apptTime, setApptTime] = useState('');
    const [notes, setNotes] = useState('');

    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || 'User';
    const storedRole = localStorage.getItem('role') || 'user';
    const isSupervisor = storedRole === 'admin' || storedRole === 'supervisor';

    useEffect(() => {
        setLoading(true);
        // Query by date
        const q = query(
            collection(db, 'appointments'),
            where('date', '==', selectedDate)
        );

        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
            // Client-side sort by time
            list.sort((a, b) => a.time.localeCompare(b.time));
            setAppointments(list);
            setLoading(false);
        });

        return () => unsub();
    }, [selectedDate]);

    // Filter Logic
    const filteredAppointments = useMemo(() => {
        if (selectedModality === 'ALL') return appointments;
        return appointments.filter(a => a.examType === selectedModality);
    }, [appointments, selectedModality]);

    // Stats Logic
    const stats = useMemo(() => {
        const total = appointments.length;
        const pending = appointments.filter(a => a.status === 'pending').length;
        const done = appointments.filter(a => a.status === 'done').length;
        return { total, pending, done };
    }, [appointments]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!patientName || !examType || !apptTime) {
            setToast({ msg: 'Please fill required fields', type: 'error' });
            return;
        }

        try {
            await addDoc(collection(db, 'appointments'), {
                patientName,
                fileNumber: fileNumber || '', // Save File Number
                examType,
                date: selectedDate,
                time: apptTime,
                notes,
                status: 'pending',
                createdBy: currentUserId,
                createdByName: currentUserName,
                createdAt: Timestamp.now()
            });
            setToast({ msg: t('save'), type: 'success' });
            setIsAddModalOpen(false);
            setPatientName(''); 
            setFileNumber('');
            setApptTime(''); 
            setNotes('');
            // Keep exam type for faster entry
        } catch (e) {
            setToast({ msg: 'Error adding appointment', type: 'error' });
        }
    };

    const handleDelete = async (id: string) => {
        if(!confirm(t('confirm') + '?')) return;
        try {
            await deleteDoc(doc(db, 'appointments', id));
            setToast({ msg: t('delete'), type: 'success' });
        } catch(e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleStatusToggle = async (appt: Appointment) => {
        try {
            const newStatus = appt.status === 'done' ? 'pending' : 'done';
            const updateData: any = { status: newStatus };

            // Logic to track who performed the exam
            if (newStatus === 'done') {
                updateData.performedBy = currentUserId;
                updateData.performedByName = currentUserName;
            } else {
                updateData.performedBy = null;
                updateData.performedByName = null;
            }

            await updateDoc(doc(db, 'appointments', appt.id), updateData);
        } catch(e) { console.error(e); }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* Header */}
            <div className="bg-cyan-600 text-white p-6 shadow-lg">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
                            <i className="fas fa-arrow-left rtl:rotate-180"></i>
                        </button>
                        <div>
                            <h1 className="text-2xl font-black">{t('appt.title')}</h1>
                            <p className="text-cyan-100 text-sm opacity-90">{stats.total} Appointments • {stats.pending} Pending</p>
                        </div>
                    </div>
                    <button onClick={() => setIsAddModalOpen(true)} className="bg-white text-cyan-600 px-6 py-3 rounded-xl font-bold shadow-md hover:bg-cyan-50 flex items-center gap-2 transition-all hover:scale-105">
                        <i className="fas fa-plus"></i>
                        <span className="hidden md:inline">{t('add')}</span>
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex flex-col lg:flex-row gap-8">
                    
                    {/* --- MAIN CONTENT (LEFT/CENTER) --- */}
                    <div className="flex-1 order-2 lg:order-1">
                        
                        {/* Mobile Date Filter (Visible only on small screens) */}
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6 flex justify-between items-center lg:hidden">
                            <h3 className="font-bold text-slate-700">{t('date')}:</h3>
                            <input 
                                type="date" 
                                value={selectedDate} 
                                onChange={(e) => setSelectedDate(e.target.value)} 
                                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-600 outline-none focus:ring-2 focus:ring-cyan-100"
                            />
                        </div>

                        <div className="space-y-4">
                            {loading ? <Loading /> : filteredAppointments.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                        <i className="fas fa-calendar-day text-4xl"></i>
                                    </div>
                                    <p className="text-slate-500 font-bold">No appointments found</p>
                                    <p className="text-slate-400 text-sm">Select a different date or department</p>
                                </div>
                            ) : (
                                filteredAppointments.map(appt => {
                                    const modInfo = MODALITIES.find(m => m.id === appt.examType) || MODALITIES[MODALITIES.length - 1];
                                    return (
                                        <div key={appt.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center hover:shadow-md transition-all group relative overflow-hidden">
                                            {/* Status Stripe */}
                                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${appt.status === 'done' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                            
                                            <div className="flex gap-5 items-center w-full md:w-auto mb-4 md:mb-0 pl-3">
                                                <div className="flex flex-col items-center justify-center min-w-[60px]">
                                                    <div className="text-lg font-black text-slate-700">{appt.time}</div>
                                                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase mt-1 ${appt.status === 'done' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                        {t(`appt.${appt.status}`)}
                                                    </div>
                                                </div>
                                                
                                                <div className="h-10 w-px bg-slate-100 hidden md:block"></div>

                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="font-bold text-slate-800 text-lg">{appt.patientName}</h4>
                                                        {appt.fileNumber && (
                                                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                                                File: {appt.fileNumber}
                                                            </span>
                                                        )}
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${modInfo.color}`}>
                                                            <i className={`fas ${modInfo.icon}`}></i> {modInfo.label}
                                                        </span>
                                                    </div>
                                                    {appt.notes && (
                                                        <p className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded inline-block max-w-full truncate mb-1">
                                                            <i className="fas fa-microphone-alt mr-1 opacity-50"></i> {appt.notes}
                                                        </p>
                                                    )}
                                                    {/* Display Who Performed & Who Booked */}
                                                    <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-3">
                                                        <span><i className="fas fa-edit"></i> Booked by: <strong className="text-slate-600">{appt.createdByName}</strong></span>
                                                        {appt.status === 'done' && appt.performedByName && (
                                                            <span className="text-emerald-600 bg-emerald-50 px-1 rounded"><i className="fas fa-check-double"></i> Exam by: <strong>{appt.performedByName}</strong></span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 w-full md:w-auto justify-end pl-3">
                                                
                                                <button 
                                                    onClick={() => handleStatusToggle(appt)}
                                                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${appt.status === 'done' ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-emerald-500 hover:text-white'}`}
                                                    title={appt.status === 'done' ? "Mark Pending" : "Mark Done"}
                                                >
                                                    <i className="fas fa-check"></i>
                                                </button>
                                                
                                                {/* Delete Button - Only for Supervisors */}
                                                {isSupervisor && (
                                                    <button onClick={() => handleDelete(appt.id)} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors">
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* --- SIDEBAR (RIGHT) --- */}
                    <div className="w-full lg:w-80 shrink-0 order-1 lg:order-2 space-y-6">
                        
                        {/* Calendar Card */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <i className="far fa-calendar-alt text-cyan-500"></i> {t('date')}
                            </h3>
                            <input 
                                type="date" 
                                value={selectedDate} 
                                onChange={(e) => setSelectedDate(e.target.value)} 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-cyan-100 cursor-pointer"
                            />
                        </div>

                        {/* Departments Filter */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-filter text-cyan-500"></i> Departments
                            </h3>
                            <div className="space-y-2">
                                <button 
                                    onClick={() => setSelectedModality('ALL')}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${selectedModality === 'ALL' ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                >
                                    <span>All Departments</span>
                                    <span className="bg-white/20 px-2 py-0.5 rounded text-xs">{appointments.length}</span>
                                </button>
                                {MODALITIES.map(mod => {
                                    const count = appointments.filter(a => a.examType === mod.id).length;
                                    return (
                                        <button 
                                            key={mod.id}
                                            onClick={() => setSelectedModality(mod.id)}
                                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${selectedModality === mod.id ? 'bg-cyan-600 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-600 hover:border-cyan-200'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${selectedModality === mod.id ? 'bg-white/20 text-white' : mod.color}`}>
                                                    <i className={`fas ${mod.icon}`}></i>
                                                </div>
                                                <span>{mod.label}</span>
                                            </div>
                                            {count > 0 && <span className={`text-xs px-2 py-0.5 rounded-full ${selectedModality === mod.id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Daily Stats */}
                        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-lg">
                            <h3 className="font-bold mb-4 opacity-90">Daily Summary</h3>
                            <div className="flex justify-between text-center divide-x divide-white/10 rtl:divide-x-reverse">
                                <div className="flex-1">
                                    <div className="text-3xl font-black text-emerald-400">{stats.done}</div>
                                    <div className="text-[10px] uppercase tracking-wider opacity-60">Done</div>
                                </div>
                                <div className="flex-1">
                                    <div className="text-3xl font-black text-amber-400">{stats.pending}</div>
                                    <div className="text-[10px] uppercase tracking-wider opacity-60">Pending</div>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-white/10">
                                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-emerald-500 h-full transition-all duration-1000" 
                                        style={{ width: `${stats.total > 0 ? (stats.done / stats.total) * 100 : 0}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between mt-1 text-[10px] opacity-50">
                                    <span>Progress</span>
                                    <span>{stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}%</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* Add Modal */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={t('appt.new')}>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 mb-1">{t('appt.patient')}</label>
                            <VoiceInput value={patientName} onChange={setPatientName} onTranscript={setPatientName} placeholder="Full Name" />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 mb-1">File Number</label>
                            <input 
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-cyan-100 font-bold"
                                value={fileNumber}
                                onChange={e => setFileNumber(e.target.value)}
                                placeholder="e.g. 12345"
                            />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">{t('appt.exam')}</label>
                            <select 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-cyan-100 font-bold text-slate-700"
                                value={examType}
                                onChange={e => setExamType(e.target.value)}
                            >
                                {MODALITIES.map(m => (
                                    <option key={m.id} value={m.id}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">{t('time')}</label>
                            <input type="time" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-cyan-100 font-bold" value={apptTime} onChange={e => setApptTime(e.target.value)} required />
                        </div>
                    </div>
                    
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-bold text-slate-500">{t('notes')}</label>
                            <span className="text-[10px] bg-cyan-50 text-cyan-600 px-2 py-0.5 rounded font-bold">Voice Enabled <i className="fas fa-microphone"></i></span>
                        </div>
                        <VoiceInput 
                            value={notes} 
                            onChange={setNotes} 
                            onTranscript={(txt) => setNotes(prev => prev ? `${prev} ${txt}` : txt)} 
                            placeholder="Clinical notes, specific requirements..."
                            isTextArea={true}
                        />
                    </div>
                    
                    <button type="submit" className="w-full bg-cyan-600 text-white py-3.5 rounded-xl font-bold hover:bg-cyan-700 shadow-lg flex items-center justify-center gap-2">
                        <i className="fas fa-check-circle"></i> {t('save')}
                    </button>
                </form>
            </Modal>
        </div>
    );
};

export default AppointmentsPage;
