
import React, { useState, useEffect } from 'react';
import { appointmentsDb } from '../../firebaseAppointments';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { ExtendedAppointment } from '../../types';
import Loading from '../../components/Loading';
import { useLanguage } from '../../contexts/LanguageContext';
import { PrintHeader, PrintFooter } from '../../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const PanicReportsPage: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [reports, setReports] = useState<ExtendedAppointment[]>([]);
    const [loading, setLoading] = useState(true);
    // Default to current month
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

    useEffect(() => {
        const fetchReports = async () => {
            setLoading(true);
            try {
                // Calculate date range for the selected month
                const [year, month] = selectedMonth.split('-');
                const startOfMonth = `${selectedMonth}-01`;
                // Get the first day of the next month to ensure we capture everything in the current month
                const nextMonthDate = new Date(parseInt(year), parseInt(month), 1);
                const endOfMonth = nextMonthDate.toISOString();

                // Fetch appointments where isPanic is true within the selected range
                const qData = query(collection(appointmentsDb, 'appointments'), where('isPanic', '==', true), where('completedAt', '>=', startOfMonth), where('completedAt', '<', endOfMonth), orderBy('completedAt', 'asc'));
                const dataSnap = await getDocs(qData);
                const data = dataSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const error = null;

                if (error) throw error;
                if (data) {
                    setReports(data as ExtendedAppointment[]);
                }
            } catch (e) {
                console.error("Error fetching panic reports:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchReports();
    }, [selectedMonth]);

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {/* Force Portrait Print & Compact Styles */}
            <style>{`
                @media print {
                    @page { size: portrait; margin: 5mm; }
                    body { -webkit-print-color-adjust: exact; font-size: 10px; }
                    .print-compact { padding: 8px !important; margin-bottom: 8px !important; }
                }
            `}</style>

            <PrintHeader title="Panic & Critical Findings Report" subtitle="Monthly Incident Log" month={selectedMonth} themeColor="rose" />

            <div className="max-w-6xl mx-auto px-4 py-8 print:p-0 print:max-w-none">
                
                <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4 print:hidden">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                            <i className="fas fa-arrow-left rtl:rotate-180"></i>
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-slate-800">سجل الحالات الحرجة (Panic)</h1>
                            <p className="text-xs text-slate-500 font-bold">عرض الحالات التي تم الإبلاغ عنها</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-slate-200 w-full md:w-auto">
                        <label className="text-xs font-bold text-slate-500 pl-2">الشهر:</label>
                        <input 
                            type="month" 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)} 
                            className="bg-slate-50 border-none rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-rose-200"
                        />
                        <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-700 flex items-center gap-2">
                            <i className="fas fa-print"></i> Print
                        </button>
                    </div>
                </div>

                <div className="space-y-4 print:space-y-2">
                    {reports.length === 0 ? (
                        <div className="text-center py-20 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                            <i className="fas fa-check-circle text-4xl mb-4 text-emerald-400"></i>
                            <p>No Panic Reports Recorded for {selectedMonth}.</p>
                        </div>
                    ) : (
                        reports.map((report, index) => (
                            <div key={report.id} className="bg-white rounded-2xl shadow-sm border-l-4 border-red-500 p-6 flex flex-col md:flex-row gap-6 print:break-inside-avoid print:border-l-4 print:border-red-500 print:mb-2 print:p-2 print:gap-3 print:rounded-lg border border-slate-100 print-compact">
                                
                                {/* Screen-only Sidebar */}
                                <div className="flex-shrink-0 flex flex-col items-center justify-center bg-red-50 w-24 h-full min-h-[100px] rounded-xl border border-red-100 print:hidden">
                                    <span className="text-xs font-bold text-red-400 uppercase">Case</span>
                                    <span className="text-2xl font-black text-red-600">#{index + 1}</span>
                                    <span className="text-[10px] text-red-400 font-mono mt-1">{report.time}</span>
                                </div>
                                
                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-2 print:mb-1">
                                        <div>
                                            <h3 className="font-black text-lg text-slate-800 print:text-sm">
                                                {/* Print-only inline case number */}
                                                <span className="hidden print:inline text-red-600 mr-2">#{index + 1}</span>
                                                {report.patientName}
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-bold mt-1 print:gap-2 print:text-[10px] print:mt-0.5">
                                                <span className="bg-slate-100 px-2 py-0.5 rounded print:bg-transparent print:p-0">ID: {report.fileNumber}</span>
                                                <span className="bg-slate-100 px-2 py-0.5 rounded print:bg-transparent print:p-0">Reg: {report.registrationNumber || 'N/A'}</span>
                                                <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100 print:border-0 print:bg-transparent print:p-0 print:text-black">
                                                    {new Date(report.completedAt || report.date).toLocaleDateString()} {report.time}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider print:border print:border-red-200 print:bg-red-50 print:text-[9px] print:px-2 print:py-0">
                                            {report.examType}
                                        </span>
                                    </div>
                                    
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-3 print:bg-white print:border print:border-slate-300 print:p-2 print:mt-1 print:text-xs">
                                        <p className="text-xs font-bold text-slate-400 uppercase mb-1 print:hidden">Critical Findings:</p>
                                        <p className="text-sm font-medium text-slate-800 leading-relaxed whitespace-pre-wrap print:text-[11px]">{report.panicDetails || 'No details provided.'}</p>
                                    </div>

                                    <div className="flex justify-between items-end mt-4 pt-3 border-t border-slate-100 print:mt-1 print:pt-1">
                                        <div className="text-xs text-slate-500 print:text-[9px]">
                                            Ref Doctor: <span className="font-bold text-slate-700">{report.doctorName || '-'}</span>
                                        </div>
                                        <div className="text-xs text-slate-500 print:text-[9px]">
                                            Reported By: <span className="font-bold text-slate-700">{report.performedByName || 'Unknown'}</span>
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
