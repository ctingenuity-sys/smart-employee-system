
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
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
                const { count: todayC } = await supabase
                    .from('appointments')
                    .select('*', { count: 'exact', head: true })
                    .eq('performedBy', currentUserId)
                    .eq('status', 'done')
                    .eq('date', today);

                // Month's Count
                const { count: monthC } = await supabase
                    .from('appointments')
                    .select('*', { count: 'exact', head: true })
                    .eq('performedBy', currentUserId)
                    .eq('status', 'done')
                    .gte('date', startOfMonth);

                // Daily Breakdown (Last 30 days)
                const { data } = await supabase
                    .from('appointments')
                    .select('date')
                    .eq('performedBy', currentUserId)
                    .eq('status', 'done')
                    .order('date', { ascending: true })
                    .limit(500); // Reasonable limit for chart

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
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">مؤشرات الأداء</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Today Card */}
                <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -mr-16 -mt-16"></div>
                    <div className="relative z-10">
                        <p className="text-blue-100 font-bold text-sm uppercase tracking-wider mb-2">إنجاز اليوم</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-5xl font-black">{todayCount}</span>
                            <span className="text-lg font-medium opacity-80">حالة</span>
                        </div>
                    </div>
                    <div className="absolute bottom-4 left-4 bg-white/20 p-2 rounded-xl">
                        <i className="fas fa-calendar-day text-2xl"></i>
                    </div>
                </div>

                {/* Month Card */}
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -mr-16 -mt-16"></div>
                    <div className="relative z-10">
                        <p className="text-emerald-100 font-bold text-sm uppercase tracking-wider mb-2">إنجاز الشهر</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-5xl font-black">{monthCount}</span>
                            <span className="text-lg font-medium opacity-80">حالة</span>
                        </div>
                    </div>
                    <div className="absolute bottom-4 left-4 bg-white/20 p-2 rounded-xl">
                        <i className="fas fa-chart-bar text-2xl"></i>
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
                    <div className="flex items-end gap-2 h-40 mt-4">
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
                )}
            </div>

        </div>
    );
};

export default UserPerformance;
