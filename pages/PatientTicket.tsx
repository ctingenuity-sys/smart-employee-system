
import React, { useEffect, useState } from 'react';
// @ts-ignore
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
// @ts-ignore
import { doc, getDoc } from 'firebase/firestore';
import Loading from '../components/Loading';

const PatientTicket: React.FC = () => {
    const { id } = useParams();
    const [appointment, setAppointment] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchTicket = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, 'appointments', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setAppointment({ id: docSnap.id, ...docSnap.data() });
                } else {
                    setError('عذراً، لم يتم العثور على الموعد أو تم إلغاؤه.');
                }
            } catch (e) {
                setError('حدث خطأ أثناء تحميل البيانات.');
            } finally {
                setLoading(false);
            }
        };
        fetchTicket();
    }, [id]);

    if (loading) return <div className="h-screen flex items-center justify-center"><Loading /></div>;
    if (error) return <div className="h-screen flex items-center justify-center text-red-500 font-bold p-4 text-center">{error}</div>;
    if (!appointment) return null;

    // Use current origin for QR code link
    const qrLink = `${window.location.origin}/#/ticket/${id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrLink)}`;

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans" dir="rtl">
            <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 relative">
                
                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600"></div>
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-50 rounded-full blur-3xl opacity-50"></div>

                <div className="p-8 text-center relative z-10">
                    <div className="w-20 h-20 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-3xl font-black mx-auto mb-4 shadow-lg shadow-blue-200">
                        AJ
                    </div>
                    <h1 className="text-xl font-black text-slate-800 leading-tight">مستشفى الجدعاني</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">قسم الأشعة - Radiology Dept</p>
                </div>

                <div className="px-8 pb-8 relative z-10">
                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative overflow-hidden">
                        {/* Dashed line visual */}
                        <div className="absolute top-0 left-0 w-1 h-full border-l-2 border-dashed border-slate-300 opacity-30"></div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">المريض Patient</label>
                                <p className="text-lg font-black text-slate-800">{appointment.patientName}</p>
                            </div>
                            
                            <div className="flex justify-between items-center">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">رقم الملف ID</label>
                                    <p className="text-base font-mono font-bold text-slate-700">{appointment.fileNumber}</p>
                                </div>
                                <div className="text-left">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">العمر Age</label>
                                    <p className="text-base font-bold text-slate-700">{appointment.patientAge || '-'}</p>
                                </div>
                            </div>

                            <div className="w-full h-px bg-slate-200"></div>

                            <div className="flex justify-between items-center">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">الفحص Exam</label>
                                    <span className="inline-block bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold mt-1">
                                        {appointment.examType}
                                    </span>
                                </div>
                                <div className="text-left">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">الغرفة Room</label>
                                    <p className="text-base font-black text-slate-800">{appointment.roomNumber || 'Gen'}</p>
                                </div>
                            </div>

                            <div className="bg-blue-600 text-white rounded-xl p-4 flex justify-between items-center shadow-md">
                                <div>
                                    <label className="text-[10px] font-bold opacity-80 uppercase">التاريخ Date</label>
                                    <p className="text-sm font-bold">{appointment.scheduledDate || appointment.date}</p>
                                </div>
                                <div className="text-left">
                                    <label className="text-[10px] font-bold opacity-80 uppercase">الوقت Time</label>
                                    <p className="text-xl font-black">{appointment.time}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col items-center">
                        <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-100 mb-4">
                            <img src={qrUrl} alt="QR Code" className="w-32 h-32 rounded-lg" />
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold">يرجى إبراز هذا الكود عند الاستقبال</p>
                    </div>

                    {appointment.preparation && (
                        <div className="mt-6 bg-orange-50 border border-orange-100 rounded-xl p-4">
                            <h4 className="text-xs font-black text-orange-700 mb-1 flex items-center gap-1">
                                <i className="fas fa-exclamation-circle"></i> تعليمات هامة:
                            </h4>
                            <p className="text-xs text-orange-800 font-medium leading-relaxed">
                                {appointment.preparation}
                            </p>
                        </div>
                    )}

                    <button 
                        onClick={() => window.print()}
                        className="w-full mt-8 bg-slate-900 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform active:scale-95 no-print"
                    >
                        <i className="fas fa-download"></i> تحميل التذكرة (PDF)
                    </button>
                </div>
            </div>
            
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; }
                    .shadow-2xl { shadow: none; }
                    .min-h-screen { min-height: auto; }
                }
            `}</style>
        </div>
    );
};

export default PatientTicket;
