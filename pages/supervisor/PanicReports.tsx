
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { PanicReport } from '../../types';
import Loading from '../../components/Loading';
import { useLanguage } from '../../contexts/LanguageContext';
import { PrintHeader, PrintFooter } from '../../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const PanicReports: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [reports, setReports] = useState<PanicReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

    useEffect(() => {
        setLoading(true);
        const q = query(
            collection(db, 'panic_reports'), 
            where('date', '>=', `${filterMonth}-01`),
            where('date', '<=', `${filterMonth}-31`)
        );
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PanicReport));
            list.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
            setReports(list);
            setLoading(false);
        });
        return () => unsub();
    }, [filterMonth]);

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-12 print:bg-white print:pb-0" dir={dir}>
            
            <PrintHeader title="Panic Reports Log" subtitle="Critical Findings Registry" month={filterMonth} themeColor="rose" />

            <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in print:p-0 print:max-w-none">
                
                {/* Header Screen Only */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 print:hidden">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                            <i className="fas fa-arrow-left rtl:rotate-180"></i>
                        </button>
                        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                            <i className="fas fa-exclamation-triangle text-red-500"></i> Panic Reports
                        </h1>
                    </div>
                    
                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                        <input 
                            type="month" 
                            className="bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold text-slate-700" 
                            value={filterMonth} 
                            onChange={e => setFilterMonth(e.target.value)} 
                        />
                        <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition-all flex items-center gap-2">
                            <i className="fas fa-print"></i> Print
                        </button>
                    </div>
                </div>

                {loading ? <Loading /> : reports.length === 0 ? (
                    <div className="text-center py-20 text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                        No panic reports found for this month.
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-2 print:border-slate-800 print:rounded-none">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-100 text-slate-600 font-bold uppercase border-b border-slate-200 print:bg-white print:border-black print:text-black">
                                <tr>
                                    <th className="p-3">Date/Time</th>
                                    <th className="p-3">Reg No.</th>
                                    <th className="p-3">Patient Name</th>
                                    <th className="p-3">File No.</th>
                                    <th className="p-3">Exam</th>
                                    <th className="p-3 w-1/3">Critical Findings</th>
                                    <th className="p-3">Doctor</th>
                                    <th className="p-3">Reported By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                                {reports.map((report) => (
                                    <tr key={report.id} className="hover:bg-red-50/50 print:break-inside-avoid">
                                        <td className="p-3 font-mono">
                                            <div className="font-bold text-slate-800">{report.date}</div>
                                            <div className="text-slate-500">{report.time}</div>
                                        </td>
                                        <td className="p-3 font-black text-emerald-700">{report.registrationNumber}</td>
                                        <td className="p-3 font-bold text-slate-800">{report.patientName}</td>
                                        <td className="p-3 font-mono text-slate-600">{report.fileNumber}</td>
                                        <td className="p-3">
                                            <span className="bg-slate-100 px-2 py-1 rounded font-bold text-slate-700 print:bg-transparent print:p-0">{report.examType}</span>
                                        </td>
                                        <td className="p-3 font-medium text-red-700 bg-red-50/50 print:bg-transparent print:text-black italic border-l-2 border-red-200 print:border-none">
                                            {report.findings}
                                        </td>
                                        <td className="p-3 text-slate-600">{report.doctorName}</td>
                                        <td className="p-3 font-bold text-slate-700">{report.reportedBy}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            
            <PrintFooter />
        </div>
    );
};

export default PanicReports;
