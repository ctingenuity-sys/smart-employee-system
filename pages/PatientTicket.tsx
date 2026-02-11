
import React, { useEffect, useState, useRef } from 'react';
// @ts-ignore
import { useParams } from 'react-router-dom';
import Loading from '../components/Loading';
import { db } from '../firebase';
// @ts-ignore
import { doc, getDoc } from 'firebase/firestore';
import { ExtendedAppointment } from '../types';

const PatientTicket: React.FC = () => {
    const { id } = useParams();
    const [appointment, setAppointment] = useState<ExtendedAppointment | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    // Reference to the ticket element
    const ticketRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchTicket = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'appointments', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setAppointment({ id: docSnap.id, ...docSnap.data() } as ExtendedAppointment);
                } else {
                    setError('Ticket not found');
                }
            } catch (e) {
                console.error(e);
                setError('Error loading data');
            } finally {
                setLoading(false);
            }
        };
        fetchTicket();
    }, [id]);

    const getInstructionLink = (type: string) => {
        const t = (type || '').toUpperCase();
        if (t === 'MRI') return 'https://forms.gle/reVThvP19PygkGwbA';
        if (t === 'CT') return 'https://forms.gle/QmxviSZU6me8iHmR6';
        return '';
    };

    const instructionLink = appointment ? getInstructionLink(appointment.examType) : '';
    const instructionQrUrl = instructionLink 
        ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(instructionLink)}`
        : null;

    const ticketQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(window.location.origin + '/#/ticket/' + id)}`;

    const getTheme = (type: string) => {
        const t = (type || '').toUpperCase();
        if (t === 'MRI') return 'from-indigo-600 via-blue-700 to-blue-900';
        if (t === 'CT') return 'from-teal-500 via-emerald-600 to-emerald-800';
        return 'from-slate-700 via-slate-800 to-slate-900';
    };

    // --- SAVE IMAGE FUNCTION ---
    const handleSaveImage = async () => {
        if (!ticketRef.current) return;
        setIsSaving(true);
        try {
            // @ts-ignore
            if (!window.html2canvas) {
                alert("Image library not ready, please refresh.");
                setIsSaving(false);
                return;
            }

            // @ts-ignore
            const canvas = await window.html2canvas(ticketRef.current, {
                scale: 3, // High resolution
                useCORS: true, 
                backgroundColor: null, 
                logging: false
            });

            const image = canvas.toDataURL("image/png");
            const link = document.createElement("a");
            link.href = image;
            link.download = `Ticket-${appointment?.patientName || 'Patient'}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err) {
            console.error("Screenshot failed:", err);
            alert("Failed to save image.");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loading /></div>;
    if (error || !appointment) return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;

    return (
        <div className="min-h-screen bg-slate-200 py-10 px-4 flex flex-col items-center justify-center print:bg-white print:p-0" dir="ltr">
            
            {/* MAIN TICKET CONTAINER */}
            <div ref={ticketRef} className="w-full max-w-sm bg-white rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden relative print:shadow-none border border-slate-100 mb-6">
                
                {/* 1. TOP SECTION */}
                <div className={`relative p-8 pb-10 bg-gradient-to-br ${getTheme(appointment.examType)} text-white text-center`}>
                    <div className="absolute top-4 right-6 opacity-20 text-4xl font-black">AJ</div>
                    <div className="relative z-10">
                        <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 mx-auto mb-3 shadow-inner">
                            <i className="fas fa-hospital-symbol text-2xl"></i>
                        </div>
                        <h1 className="text-sm font-bold tracking-[0.2em] uppercase">Al-Jedaani Hospital</h1>
                        <p className="text-[9px] font-medium opacity-80 tracking-widest uppercase">Radiology Department • قسم الأشعة</p>
                    </div>
                </div>

                {/* 2. PATIENT INFO SECTION */}
                <div className="relative -mt-6 bg-white rounded-t-[2.5rem] px-6 pt-8 pb-4">
                    <div className="text-center mb-6">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Patient Full Name</span>
                        <h2 className="text-xl font-black text-slate-800 mt-1 uppercase leading-tight">{appointment.patientName}</h2>
                        <p className="text-xs font-bold text-blue-600 mt-1">ID: {appointment.fileNumber}</p>
                    </div>

                    {/* Information Grid */}
                    <div className="grid grid-cols-3 gap-2 mb-6">
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center">
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Date</p>
                            <p className="text-[11px] font-black text-slate-800">{appointment.scheduledDate || appointment.date}</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center">
                            <p className="text-[8px] font-bold text-slate-400 uppercase">Time</p>
                            <p className="text-[11px] font-black text-slate-800">{appointment.time}</p>
                        </div>
                        <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-200 text-center">
                            <p className="text-[8px] font-bold text-blue-100 uppercase">Room</p>
                            <p className="text-[11px] font-black text-white">{appointment.roomNumber || '---'}</p>
                        </div>
                    </div>

                    {/* Exam Name Label */}
                    <div className="bg-slate-800 rounded-2xl p-4 text-center mb-4 shadow-md relative overflow-hidden">
                        <div className="absolute left-0 top-0 w-1 h-full bg-blue-500"></div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Examination</p>
                        <p className="text-base font-black text-white">{appointment.examType} - {appointment.examList?.[0] || ''}</p>
                    </div>

                    {/* Preparation */}
                    {appointment.preparation && (
                        <div className="mb-6 p-4 bg-amber-50 rounded-2xl border-2 border-amber-100 relative overflow-hidden" dir="rtl">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-100 rounded-full -mr-8 -mt-8 opacity-50"></div>
                            <div className="relative z-10">
                                <h3 className="text-[10px] font-black text-amber-600 uppercase mb-2 flex items-center gap-2">
                                    <i className="fas fa-clipboard-list text-amber-500"></i> تعليمات التحضير (هام)
                                </h3>
                                <p className="text-xs text-slate-700 font-bold leading-relaxed whitespace-pre-wrap">
                                    {appointment.preparation}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Instruction QR */}
                    {instructionQrUrl && (
                        <div className="relative p-1 rounded-[2rem] bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200 shadow-xl mb-6 group transform hover:scale-[1.02] transition-transform">
                            <div className="bg-white rounded-[1.8rem] p-4 flex flex-col items-center">
                                <h3 className="text-[10px] font-black text-amber-600 uppercase mb-3 tracking-widest">⚠️ Scan for Details</h3>
                                <div className="relative p-2 bg-slate-50 rounded-2xl border-2 border-dashed border-amber-200">
                                    <img src={instructionQrUrl} alt="Instructions" className="w-24 h-24" />
                                    <div className="absolute -bottom-2 -right-2 bg-amber-500 text-white text-[8px] font-black px-2 py-1 rounded-lg shadow-lg rotate-12">SCAN ME</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. THE TICKET CUT */}
                <div className="relative h-4 flex items-center">
                    <div className="w-8 h-8 bg-slate-200 rounded-full -ml-4 border border-slate-300 print:hidden"></div>
                    <div className="flex-1 border-b-2 border-dashed border-slate-200 mx-2"></div>
                    <div className="w-8 h-8 bg-slate-200 rounded-full -mr-4 border border-slate-300 print:hidden"></div>
                </div>

                {/* 5. FOOTER */}
                <div className="bg-slate-50 p-6 flex items-center justify-between rounded-b-[3rem]">
                    <div className="flex-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-tighter">Verification</p>
                        <p className="text-[10px] font-bold text-slate-800 leading-tight">Present this ticket<br/>at the reception</p>
                        <p className="text-[8px] text-slate-400 mt-2 font-mono">#{id?.substring(0,12).toUpperCase()}</p>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                        <img src={ticketQrUrl} alt="Verification" className="w-16 h-16" />
                    </div>
                </div>
            </div>

            {/* SAVE BUTTON */}
            <button 
                onClick={handleSaveImage}
                disabled={isSaving}
                className="w-full max-w-sm bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:shadow-emerald-200 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:scale-100 print:hidden"
            >
                {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-download text-lg"></i> <span>Download Ticket</span></>}
            </button>

            <style>{`
                @media print {
                    body { background: white !important; }
                    .min-h-screen { padding: 0 !important; display: block !important; }
                    button { display: none !important; }
                    .rounded-[3rem] { border-radius: 0 !important; }
                }
            `}</style>
        </div>
    );
};

export default PatientTicket;
