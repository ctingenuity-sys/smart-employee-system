
import React, { useEffect, useState } from 'react';
// @ts-ignore
import { useParams } from 'react-router-dom';
import Loading from '../components/Loading';
import { supabase } from '../supabaseClient';
import { ExtendedAppointment } from '../types';

const PatientTicket: React.FC = () => {
    const { id } = useParams();
    const [appointment, setAppointment] = useState<ExtendedAppointment | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchTicket = async () => {
            if (!id) return;
            try {
                // Fetch from Supabase
                const { data, error } = await supabase
                    .from('appointments')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;

                if (data) {
                    setAppointment(data as ExtendedAppointment);
                } else {
                    setError('عذراً، لم يتم العثور على الموعد أو تم إلغاؤه.');
                }
            } catch (e) {
                console.error(e);
                setError('حدث خطأ أثناء تحميل البيانات.');
            } finally {
                setLoading(false);
            }
        };
        fetchTicket();
    }, [id]);

    // Keyboard shortcut for printing
    useEffect(() => {
        const handlePrintShortcut = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                window.print();
            }
        };
        window.addEventListener('keydown', handlePrintShortcut);
        return () => window.removeEventListener('keydown', handlePrintShortcut);
    }, []);

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loading /></div>;
    if (error) return <div className="min-h-screen flex items-center justify-center text-red-500 font-bold p-4 text-center bg-slate-50">{error}</div>;
    if (!appointment) return null;

    // Use current origin for QR code link
    const qrLink = `${window.location.origin}/#/ticket/${id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrLink)}`;

    // Determine specific exam name (Join if multiple)
    const specificExamName = appointment.examList && appointment.examList.length > 0 
        ? appointment.examList.join(' + ') 
        : appointment.examType;

    // Theme Colors based on Modality
    const getTheme = (type: string) => {
        const t = (type || '').toUpperCase();
        if (t === 'MRI') return 'from-blue-600 to-indigo-700 shadow-blue-300';
        if (t === 'CT') return 'from-emerald-500 to-teal-600 shadow-emerald-300';
        if (t === 'US') return 'from-purple-500 to-fuchsia-600 shadow-purple-300';
        return 'from-slate-700 to-slate-900 shadow-slate-400';
    };

    const themeGradient = getTheme(appointment.examType);

    return (
        <div className="min-h-screen bg-slate-100 py-8 px-4 font-sans flex items-center justify-center print:bg-white print:p-0" dir="ltr">
            
            {/* TICKET CONTAINER */}
            <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden relative print:shadow-none print:w-full print:max-w-none">
                
                {/* --- HEADER SECTION (Gradient) --- */}
                <div className={`relative p-8 pb-12 bg-gradient-to-br ${themeGradient} text-white text-center print:bg-white print:text-black print:pb-4`}>
                    
                    {/* Decorative Circles */}
                    <div className="absolute top-[-50px] left-[-50px] w-40 h-40 bg-white opacity-10 rounded-full blur-2xl pointer-events-none"></div>
                    <div className="absolute bottom-[-20px] right-[-20px] w-32 h-32 bg-white opacity-10 rounded-full blur-2xl pointer-events-none"></div>

                    {/* Logo & Title */}
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border-2 border-white/30 mb-4 shadow-lg print:border-black print:text-black">
                            <span className="text-2xl font-black tracking-tighter">AJ</span>
                        </div>
                        <h1 className="text-lg font-bold tracking-widest uppercase opacity-90">Al-Jedaani Hospitals</h1>
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-75">Radiology Department</p>
                    </div>
                </div>

                {/* --- BODY SECTION (Overlapping Card) --- */}
                <div className="relative z-20 -mt-8 px-6 pb-6">
                    <div className="bg-white rounded-3xl shadow-xl p-6 border border-slate-100 print:shadow-none print:border-2 print:border-black">
                        
                        {/* Patient Name */}
                        <div className="text-center mb-6 border-b border-dashed border-slate-200 pb-6">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Patient Name | اسم المريض</p>
                            <h2 className="text-2xl font-black text-slate-800 leading-tight mb-2">{appointment.patientName}</h2>
                            <div className="flex justify-center gap-2">
                                <span className="bg-slate-50 text-slate-500 px-3 py-1 rounded-lg text-xs font-bold border border-slate-100">
                                    ID: <span className="text-slate-900 font-black">{appointment.fileNumber || '---'}</span>
                                </span>
                                <span className="bg-slate-50 text-slate-500 px-3 py-1 rounded-lg text-xs font-bold border border-slate-100">
                                    Age: <span className="text-slate-900 font-black">{appointment.patientAge || '-'}</span>
                                </span>
                            </div>
                        </div>

                        {/* Details Grid */}
                        <div className="space-y-3 mb-6">
                            
                            {/* Row 1: Date & Time */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 text-center">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Date (التاريخ)</p>
                                    <p className="text-sm font-black text-slate-800">{appointment.scheduledDate || appointment.date}</p>
                                </div>
                                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 text-center">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Time (الوقت)</p>
                                    <p className="text-sm font-black text-slate-800">{appointment.time}</p>
                                </div>
                            </div>

                            {/* Row 2: Department & Room */}
                            <div className="grid grid-cols-2 gap-3">
                                 <div className="bg-blue-50 p-2.5 rounded-2xl border border-blue-100 text-center">
                                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wide">Department (القسم)</p>
                                    <p className="text-sm font-black text-blue-900">{appointment.examType}</p>
                                 </div>
                                 <div className="bg-purple-50 p-2.5 rounded-2xl border border-purple-100 text-center">
                                    <p className="text-[9px] font-bold text-purple-400 uppercase tracking-wide">Room (الغرفة)</p>
                                    <p className="text-sm font-black text-purple-900">{appointment.roomNumber || 'General'}</p>
                                 </div>
                            </div>

                            {/* Row 3: Exam Name (Full Width) */}
                            <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-lg relative overflow-hidden text-center">
                                <div className="absolute right-0 top-0 w-16 h-full bg-white/5 skew-x-12"></div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Examination (الفحص)</p>
                                <p className="text-lg font-black leading-tight text-white">{specificExamName}</p>
                                {appointment.doctorName && <p className="text-[9px] text-slate-400 mt-1">Ref: {appointment.doctorName}</p>}
                            </div>
                        </div>

                        {/* Preparation Instructions */}
                        {appointment.preparation ? (
                            <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r-xl mb-6">
                                <h3 className="text-[10px] font-black text-amber-800 uppercase flex items-center gap-1 mb-1">
                                    <i className="fas fa-info-circle"></i> Preparation / التحضيرات
                                </h3>
                                <p className="text-xs text-amber-900 font-bold leading-relaxed whitespace-pre-wrap" dir="auto">
                                    {appointment.preparation}
                                </p>
                            </div>
                        ) : (
                            <div className="text-center text-[10px] text-slate-400 italic mb-6">No specific preparations required.</div>
                        )}

                        {/* Cut Line */}
                        <div className="relative flex items-center justify-between mb-4">
                            <div className="w-4 h-8 bg-slate-100 rounded-r-full -ml-6 print:hidden"></div>
                            <div className="flex-1 border-b-2 border-dashed border-slate-200 mx-2"></div>
                            <div className="w-4 h-8 bg-slate-100 rounded-l-full -mr-6 print:hidden"></div>
                        </div>

                        {/* Footer / QR */}
                        <div className="flex flex-col items-center justify-center">
                            <div className="flex items-center gap-4">
                                <div className="p-1 bg-white border border-slate-200 rounded-lg shadow-sm">
                                    <img src={qrUrl} alt="QR" className="w-24 h-24 rounded-md" />
                                </div>
                                <div className="text-left">
                                    <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Scan Code</p>
                                    <p className="text-xs font-black text-slate-800 mb-1">Patient Check-in</p>
                                    <p className="text-[9px] text-slate-300 font-mono bg-slate-50 px-2 py-0.5 rounded">{appointment.id.substring(0,8)}...</p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* --- FOOTER --- */}
                <div className="bg-slate-50 p-4 text-center text-[9px] text-slate-400 font-medium leading-relaxed border-t border-slate-200">
                    <p>Please arrive 15 minutes before your scheduled time.</p>
                    <p dir="rtl">يرجى الحضور قبل الموعد بـ 15 دقيقة.</p>
                    
                    <button 
                        onClick={() => window.print()}
                        className="mt-4 w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 print:hidden"
                    >
                        <i className="fas fa-print"></i> Print Ticket
                    </button>
                </div>

            </div>
            
            <style>{`
                @media print {
                    body { background: white; -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
                    .min-h-screen { min-height: auto; height: auto; padding: 0; display: block; }
                    .shadow-2xl, .shadow-xl, .shadow-lg { box-shadow: none !important; }
                    button { display: none !important; }
                    .bg-slate-100, .bg-slate-50 { background-color: #fff !important; }
                }
            `}</style>
        </div>
    );
};

export default PatientTicket;
