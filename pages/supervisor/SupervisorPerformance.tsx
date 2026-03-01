
import React, { useState, useEffect } from 'react';
import { appointmentsDb } from '../../firebaseAppointments';
import { db, auth } from '../../firebase';
// @ts-ignore
import { collection, addDoc, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import Loading from '../../components/Loading';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { PrintHeader, PrintFooter } from '../../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

interface EmployeeStats {
    userId: string;
    name: string;
    totalCases: number; // Monthly
    daily: number;
    weekly: number;
}

interface ArchivedReport {
    id: string;
    month: string;
    createdAt: any;
    stats: EmployeeStats[];
}

const SupervisorPerformance: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
    
    // Live Data State
    const [liveStats, setLiveStats] = useState<EmployeeStats[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    
    // Archive State
    const [viewMode, setViewMode] = useState<'live' | 'archive'>('live');
    const [archivedReports, setArchivedReports] = useState<ArchivedReport[]>([]);
    const [selectedArchiveId, setSelectedArchiveId] = useState<string>('');

    // Fetch Live Data (Supabase)
    const fetchLiveStats = async () => {
        setLoading(true);
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const isCurrentMonth = selectedMonth === todayStr.slice(0, 7);

        // Start of Month
        const startOfMonth = `${selectedMonth}-01`;
        
        // End of Month
        const [y, m] = selectedMonth.split('-');
        const nextMonth = new Date(parseInt(y), parseInt(m), 1).toISOString().split('T')[0];

        // Start of Week (Saturday)
        const currentDay = now.getDay(); // 0-6
        const daysToSubtract = (currentDay + 1) % 7; 
        const startOfWeekDate = new Date(now);
        startOfWeekDate.setDate(now.getDate() - daysToSubtract);
        const startOfWeek = startOfWeekDate.toISOString().split('T')[0];

        try {
            // Determine query range
            // If current month, we might need data from startOfWeek (which could be in prev month)
            let queryStart = startOfMonth;
            if (isCurrentMonth && startOfWeek < startOfMonth) {
                queryStart = startOfWeek;
            }

            // Fetch all done appointments
            const qData = query(collection(appointmentsDb, 'appointments'), 
                where('status', '==', 'done'), 
                where('date', '>=', queryStart)
            );
            
            const dataSnap = await getDocs(qData);
            const data = dataSnap.docs.map(d => d.data());

            // Aggregation
            const agg: Record<string, EmployeeStats> = {};
            
            data.forEach((appt: any) => {
                const uid = appt.performedBy || 'unknown';
                const name = appt.performedByName || 'Unknown';
                const date = appt.date;
                
                // Filter out if date is beyond nextMonth (shouldn't happen with query but good safety)
                if (date >= nextMonth && !isCurrentMonth) return; 

                if (!agg[uid]) {
                    agg[uid] = { userId: uid, name, totalCases: 0, daily: 0, weekly: 0 };
                }
                
                // Monthly Count (Strictly within selected month)
                if (date >= startOfMonth && date < nextMonth) {
                    agg[uid].totalCases++;
                }

                // Daily & Weekly (Only if viewing current month)
                if (isCurrentMonth) {
                    if (date === todayStr) {
                        agg[uid].daily++;
                    }
                    if (date >= startOfWeek) {
                        agg[uid].weekly++;
                    }
                }
            });

            const sorted = Object.values(agg).sort((a,b) => b.totalCases - a.totalCases);
            setLiveStats(sorted);

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Error fetching live data', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Fetch Archives (Firestore)
    const fetchArchives = async () => {
        try {
            const q = query(collection(db, 'performance_archives'), orderBy('month', 'desc'));
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ArchivedReport));
            setArchivedReports(list);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (viewMode === 'live') {
            fetchLiveStats();
        } else {
            fetchArchives();
        }
    }, [selectedMonth, viewMode]);

    const handleSaveArchive = async () => {
        if (liveStats.length === 0) return setToast({ msg: 'No data to archive', type: 'error' });
        if (!confirm(`هل أنت متأكد من حفظ تقرير شهر ${selectedMonth}؟ سيتم تخزينه بشكل دائم.`)) return;

        try {
            await addDoc(collection(db, 'performance_archives'), {
                month: selectedMonth,
                stats: liveStats,
                createdAt: Timestamp.now(),
                createdBy: auth.currentUser?.email
            });
            setToast({ msg: 'تم حفظ التقرير بنجاح ✅', type: 'success' });
        } catch (e) {
            setToast({ msg: 'فشل الحفظ', type: 'error' });
        }
    };

    const currentStats = viewMode === 'live' 
        ? liveStats 
        : (archivedReports.find(r => r.id === selectedArchiveId)?.stats || []);

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <PrintHeader title="Performance Report" subtitle={viewMode === 'live' ? 'Live Data' : 'Archived Record'} month={selectedMonth} themeColor="violet" />

            <div className="max-w-6xl mx-auto px-4 py-8 print:p-0 print:max-w-none">
                
                {/* Header Controls (Hidden in Print) */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 print:hidden">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                            <i className="fas fa-arrow-left rtl:rotate-180"></i>
                        </button>
                        <h1 className="text-2xl font-black text-slate-800">مراقبة الأداء</h1>
                    </div>

                    <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button 
                                onClick={() => setViewMode('live')}
                                className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'live' ? 'bg-white shadow text-violet-600' : 'text-slate-500'}`}
                            >
                                Live (Supabase)
                            </button>
                            <button 
                                onClick={() => setViewMode('archive')}
                                className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${viewMode === 'archive' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                            >
                                Archives (Firestore)
                            </button>
                        </div>

                        {viewMode === 'live' ? (
                            <input 
                                type="month" 
                                className="bg-slate-50 border-none rounded-lg text-sm font-bold text-slate-700" 
                                value={selectedMonth} 
                                onChange={e => setSelectedMonth(e.target.value)} 
                            />
                        ) : (
                            <select 
                                className="bg-slate-50 border-none rounded-lg text-sm font-bold text-slate-700 min-w-[150px]"
                                value={selectedArchiveId}
                                onChange={e => setSelectedArchiveId(e.target.value)}
                            >
                                <option value="">Select Report...</option>
                                {archivedReports.map(r => (
                                    <option key={r.id} value={r.id}>{r.month} (Saved: {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : 'Date?'})</option>
                                ))}
                            </select>
                        )}

                        <button onClick={() => window.print()} className="bg-slate-800 text-white w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-700">
                            <i className="fas fa-print"></i>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-2 print:border-black print:rounded-none">
                    
                    {viewMode === 'live' && (
                        <div className="p-4 bg-violet-50 border-b border-violet-100 flex justify-between items-center print:hidden">
                            <div className="flex items-center gap-2 text-violet-800">
                                <i className="fas fa-database"></i>
                                <span className="text-xs font-bold">Live Data from Appointment System</span>
                            </div>
                            <button 
                                onClick={handleSaveArchive}
                                className="bg-violet-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-violet-700 shadow-md flex items-center gap-2"
                            >
                                <i className="fas fa-save"></i> ترحيل للأرشيف
                            </button>
                        </div>
                    )}

                    {loading ? <Loading /> : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-600 font-bold uppercase border-b border-slate-200 print:bg-white print:border-black print:text-black">
                                <tr>
                                    <th className="p-4 text-center w-16">#</th>
                                    <th className="p-4 text-right">Employee Name</th>
                                    <th className="p-4 text-center">Daily (Today)</th>
                                    <th className="p-4 text-center">Weekly (This Week)</th>
                                    <th className="p-4 text-center">Monthly (Total)</th>
                                    <th className="p-4 text-center">Performance Index</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 print:divide-black">
                                {currentStats.length === 0 ? (
                                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">No records found.</td></tr>
                                ) : (
                                    currentStats.map((stat, index) => (
                                        <tr key={stat.userId} className="hover:bg-slate-50 print:break-inside-avoid">
                                            <td className="p-4 text-center font-mono text-slate-400 print:text-black">{index + 1}</td>
                                            <td className="p-4 text-right font-bold text-slate-800 print:text-black">{stat.name}</td>
                                            
                                            <td className="p-4 text-center">
                                                <span className={`px-3 py-1 rounded-full font-bold ${stat.daily > 0 ? 'bg-blue-100 text-blue-800' : 'text-slate-300'} print:bg-transparent print:text-black`}>
                                                    {stat.daily || 0}
                                                </span>
                                            </td>

                                            <td className="p-4 text-center">
                                                <span className={`px-3 py-1 rounded-full font-bold ${stat.weekly > 0 ? 'bg-amber-100 text-amber-800' : 'text-slate-300'} print:bg-transparent print:text-black`}>
                                                    {stat.weekly || 0}
                                                </span>
                                            </td>

                                            <td className="p-4 text-center">
                                                <span className="bg-violet-100 text-violet-800 px-3 py-1 rounded-full font-black print:bg-transparent print:text-black print:border print:border-black">
                                                    {stat.totalCases}
                                                </span>
                                            </td>

                                            <td className="p-4 text-center">
                                                <div className="w-full bg-slate-100 rounded-full h-2.5 print:hidden">
                                                    <div 
                                                        className="bg-violet-600 h-2.5 rounded-full" 
                                                        style={{ width: `${(stat.totalCases / (currentStats[0]?.totalCases || 1)) * 100}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-[10px] text-slate-400 hidden print:inline">{(stat.totalCases / (currentStats[0]?.totalCases || 1) * 100).toFixed(0)}%</span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
            
            <PrintFooter themeColor="violet" />
        </div>
    );
};

export default SupervisorPerformance;
