
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { PanicReport } from '../../types';
import Loading from '../../components/Loading';
import { useLanguage } from '../../contexts/LanguageContext';
import { PrintHeader, PrintFooter } from '../../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const PanicReportsPage: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [reports, setReports] = useState<PanicReport[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'panic_reports'), orderBy('createdAt', 'desc'), limit(100));
        const unsub = onSnapshot(q, (snap) => {
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as PanicReport)));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            <PrintHeader title="Panic & Critical Findings Report" subtitle="Recent Incidents" themeColor="rose" />

            <div className="max-w-6xl mx-auto px-4 py-8 print:p-0 print:max-w-none">
                
                <div className="flex items-center justify-between mb-8 print:hidden">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                            <i className="fas fa-arrow-left rtl:rotate-180"></i>
                        </button>
                        <h1 className="text-2xl font-black text-slate-800">سجل الحالات الحرجة (Panic)</h1>
                    </div>
                    <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-700">
                        <i className="fas fa-print mr-2"></i> Print Report
                    </button>
                </div>

                <div className="space-y-4">
                    {reports.length === 0 ? (
                        <div className="text-center py-20 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                            <i className="fas fa-check-circle text-4xl mb-4 text-emerald-400"></i>
                            <p>No Panic Reports Recorded.</p>
                        </div>
                    ) : (
                        reports.map(report => (
                            <div key={report.id} className="bg-white rounded-2xl shadow-sm border-l-4 border-red-500 p-6 flex flex-col md:flex-row gap-6 print:break-inside-avoid print:border print:border-red-500">
                                <div className="flex-shrink-0 flex flex-col items-center justify-center bg-red-50 w-24 h-24 rounded-xl border border-red-100 print:hidden">
                                    <span className="text-xs font-bold text-red-400 uppercase">Panic</span>
                                    <i className="fas fa-exclamation-triangle text-3xl text-red-500 my-1"></i>
                                    <span className="text-[10px] text-red-400 font-mono">{report.time}</span>
                                </div>
                                
                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h3 className="font-black text-lg text-slate-800">{report.patientName}</h3>
                                            <div className="flex items-center gap-3 text-xs text-slate-500 font-bold mt-1">
                                                <span className="bg-slate-100 px-2 py-0.5 rounded">ID: {report.fileNumber}</span>
                                                <span className="bg-slate-100 px-2 py-0.5 rounded">Reg: {report.registrationNumber}</span>
                                                <span className="text-red-500">{report.date}</span>
                                            </div>
                                        </div>
                                        <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider print:border print:border-red-500">
                                            {report.examType}
                                        </span>
                                    </div>
                                    
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-3 print:bg-white print:border-red-200">
                                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Critical Findings:</p>
                                        <p className="text-sm font-medium text-slate-800 leading-relaxed whitespace-pre-wrap">{report.findings}</p>
                                    </div>

                                    <div className="flex justify-between items-end mt-4 pt-3 border-t border-slate-100">
                                        <div className="text-xs text-slate-500">
                                            Doctor: <span className="font-bold text-slate-700">{report.doctorName}</span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Reported By: <span className="font-bold text-slate-700">{report.reportedBy}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            
            <PrintFooter themeColor="rose" />
        </div>
    );
};

export default PanicReportsPage;
