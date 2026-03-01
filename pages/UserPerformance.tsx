
import React, { useState, useEffect } from 'react';
import { appointmentsDb } from '../firebaseAppointments';
import { collection, query, where, getDocs, getCountFromServer, orderBy, limit } from 'firebase/firestore';
import { auth } from '../firebase';
import Loading from '../components/Loading';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const UserPerformance: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    const [loading, setLoading] = useState(true);
    
    const [todayCount, setTodayCount] = useState(0);
    const [monthCount, setMonthCount] = useState(0);
    const [dailyActivity, setDailyActivity] = useState<{date: string, count: number}[]>([]);

    useEffect(() => {
        if (!currentUserId) return;

        const fetchData = async () => {
            setLoading(true);
            const today = new Date().toISOString().split('T')[0];
            const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

            try {
                // Today's Count
                const qToday = query(collection(appointmentsDb, 'appointments'), where('performedBy', '==', currentUserId), where('status', '==', 'done'), where('date', '==', today));
                const todaySnap = await getCountFromServer(qToday);
                const todayC = todaySnap.data().count;

                // Month's Count
                const qMonth = query(collection(appointmentsDb, 'appointments'), where('performedBy', '==', currentUserId), where('status', '==', 'done'), where('date', '>=', startOfMonth));
                const monthSnap = await getCountFromServer(qMonth);
                const monthC = monthSnap.data().count;

                // Daily Breakdown (Last 30 days)
                const qData = query(collection(appointmentsDb, 'appointments'), where('performedBy', '==', currentUserId), where('status', '==', 'done'), orderBy('date', 'asc'), limit(500));
                const dataSnap = await getDocs(qData);
                const data = dataSnap.docs.map(d => d.data()); // Reasonable limit for chart

                if (data) {
                    const counts: Record<string, number> = {};
                    data.forEach((d: any) => {
                        const date = d.date; // already YYYY-MM-DD
                        counts[date] = (counts[date] || 0) + 1;
                    });
                    
                    const activity = Object.entries(counts).map(([date, count]) => ({date, count}));
                    setDailyActivity(activity.slice(-14)); // Last 14 active days
                }

                setTodayCount(todayC || 0);
                setMonthCount(monthC || 0);

            } catch (e) {
                console.error("Error fetching stats:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [currentUserId]);

    if (loading) return <Loading />;

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            
            {/* --- MAGICAL HERO SECTION (Consistent with Dashboard) --- */}
            <div className="relative overflow-hidden mb-8 rounded-b-[40px] shadow-2xl transition-all duration-1000 min-h-[300px] flex items-center -mx-4 -mt-8">
                
                {/* Dynamic Animated Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-violet-900 via-purple-800 to-slate-900 animate-aurora">
                    {/* Floating Blobs */}
                    <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-purple-500 rounded-full mix-blend-screen filter blur-[100px] opacity-30 animate-pulse-slow"></div>
                    <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-indigo-500 rounded-full mix-blend-screen filter blur-[100px] opacity-20 animate-pulse-slow delay-1000"></div>
                    
                    {/* Grain Texture Overlay */}
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay"></div>
                </div>

                <div className="max-w-4xl mx-auto px-6 w-full relative z-10">
                    <div className="flex items-center gap-4 mb-6">
                        <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors backdrop-blur-md border border-white/10">
                            <i className="fas fa-arrow-left rtl:rotate-180"></i>
                        </button>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                            <span className="text-[10px] font-bold text-white tracking-widest uppercase">Performance Analytics</span>
                        </div>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-black text-white leading-tight drop-shadow-lg tracking-tight mb-2">
                        مؤشرات الأداء
                        <span className="text-purple-400">.</span>
                    </h1>
                    <p className="text-blue-200 text-lg font-medium opacity-80 max-w-lg">
                        تتبع إنجازاتك اليومية والشهرية وتحليل نشاطك المهني
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 -mt-12 relative z-20">
                {/* Today Card */}
                <div className="bg-white/80 backdrop-blur-xl rounded-[32px] p-8 text-slate-800 shadow-xl border border-white/50 relative overflow-hidden group hover:transform hover:scale-[1.02] transition-all duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-indigo-500/20 transition-colors"></div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl shadow-sm">
                                <i className="fas fa-calendar-day"></i>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider">Today</span>
                        </div>
                        <p className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-1">إنجاز اليوم</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-6xl font-black text-indigo-600 tracking-tighter">{todayCount}</span>
                            <span className="text-lg font-bold text-slate-400">حالة</span>
                        </div>
                    </div>
                </div>

                {/* Month Card */}
                <div className="bg-white/80 backdrop-blur-xl rounded-[32px] p-8 text-slate-800 shadow-xl border border-white/50 relative overflow-hidden group hover:transform hover:scale-[1.02] transition-all duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-emerald-500/20 transition-colors"></div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl shadow-sm">
                                <i className="fas fa-chart-bar"></i>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider">Monthly</span>
                        </div>
                        <p className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-1">إنجاز الشهر</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-6xl font-black text-emerald-600 tracking-tighter">{monthCount}</span>
                            <span className="text-lg font-bold text-slate-400">حالة</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Activity Chart (Simple CSS Bars) */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <i className="fas fa-wave-square text-indigo-500"></i> النشاط اليومي (آخر أسبوعين)
                </h3>
                
                {dailyActivity.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">لا يوجد نشاط مسجل مؤخراً</div>
                ) : (
                    <>
                        <div className="flex items-end gap-2 h-40 mt-4 mb-8">
                            {dailyActivity.map((day, i) => {
                                const max = Math.max(...dailyActivity.map(d => d.count), 10);
                                const height = (day.count / max) * 100;
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                                        <div className="w-full bg-slate-100 rounded-t-lg relative h-full flex items-end overflow-hidden">
                                            <div 
                                                className="w-full bg-indigo-500 rounded-t-lg transition-all duration-500 group-hover:bg-indigo-600"
                                                style={{ height: `${height}%` }}
                                            ></div>
                                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                                {day.count} حالة
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-bold rotate-45 mt-2 origin-left whitespace-nowrap">
                                            {day.date.slice(5)}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Detailed Table */}
                        <div className="border-t border-slate-100 pt-6">
                            <h4 className="text-sm font-bold text-slate-500 mb-3">تفاصيل الأيام</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {dailyActivity.slice().reverse().map((day, i) => (
                                    <div key={i} className="bg-slate-50 p-3 rounded-xl flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-500">{day.date}</span>
                                        <span className="bg-white px-2 py-1 rounded-lg text-xs font-black text-indigo-600 shadow-sm border border-slate-100">
                                            {day.count}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

        </div>
    );
};

export default UserPerformance;
