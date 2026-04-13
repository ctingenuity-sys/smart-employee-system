import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Department, SavedTemplate, User } from '../../types';
import Loading from '../../components/Loading';
import { useLanguage } from '../../contexts/LanguageContext';
import Toast from '../../components/Toast';

const OnCallManagement: React.FC = () => {
    const { t, dir } = useLanguage();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDept, setSelectedDept] = useState<Department | null>(null);
    const [schedules, setSchedules] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Update time every minute
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const fetchDepts = async () => {
            try {
                const snap = await getDocs(collection(db, 'departments'));
                setDepartments(snap.docs.map(d => ({ ...d.data(), id: d.id } as Department)));
                
                const userSnap = await getDocs(collection(db, 'users'));
                setAllUsers(userSnap.docs.map(d => ({ ...d.data(), id: d.id } as User)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchDepts();
    }, []);

    useEffect(() => {
        if (!selectedDept) {
            setSchedules([]);
            return;
        }

        setLoading(true);
        const q = query(
            collection(db, 'schedules'),
            where('departmentId', '==', selectedDept.id),
            where('userType', '==', 'doctor')
        );

        const unsub = onSnapshot(q, (snap) => {
            const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            setSchedules(docs);
            setLoading(false);
        }, (err) => {
            console.error(err);
            setLoading(false);
        });

        return () => unsub();
    }, [selectedDept]);

    const todayStr = useMemo(() => {
        const d = new Date(currentTime);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, [currentTime]);

    const isCurrentlyActive = (shifts: {start: string, end: string}[]) => {
        if (!shifts || shifts.length === 0) return false;
        
        return shifts.some(shift => {
            const parseTime = (t: string) => {
                const clean = t.trim();
                if (!clean.includes(':')) return null;
                const [h, m] = clean.split(':').map(Number);
                const date = new Date(currentTime);
                date.setHours(h, m, 0, 0);
                return date;
            };

            try {
                const start = parseTime(shift.start);
                const end = parseTime(shift.end);
                
                if (!start || !end) return false;

                // Handle night shifts (e.g. 20:00 - 08:00)
                if (end < start) {
                    if (currentTime >= start) return true;
                    return currentTime < end;
                }
                
                return currentTime >= start && currentTime <= end;
            } catch (e) {
                return false;
            }
        });
    };

    const onCallDoctors = useMemo(() => {
        if (!schedules || schedules.length === 0) return [];

        return schedules.map(sched => {
            // Check if today is within valid range
            const start = sched.validFrom || sched.date;
            const end = sched.validTo || sched.date;
            
            if (!start || !end) return null;
            if (todayStr < start || todayStr > end) return null;

            // Find user details
            const user = allUsers.find(u => u.id === sched.userId || u.name === sched.staffName);
            
            const shifts = sched.shifts || [];
            const active = isCurrentlyActive(shifts);

            // ONLY return the doctor if they are currently active (on duty)
            if (!active) return null;
            
            return {
                doctorName: sched.staffName || user?.name || 'Unknown Doctor',
                shifts: shifts,
                user,
                sched
            };
        }).filter(Boolean);
    }, [schedules, todayStr, allUsers, isCurrentlyActive]);

    if (loading && departments.length === 0) return <Loading />;

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header */}
            <div className="bg-slate-900 text-white p-6 md:p-10 mb-6">
                <div className="max-w-6xl mx-auto">
                    <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
                        <i className="fas fa-phone-volume text-emerald-400"></i>
                        {t('nav.onCallManagement')}
                    </h1>
                    <p className="text-slate-400">Real-time doctor schedules and on-call status across departments</p>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4">
                {/* Department Selection */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
                    {departments.map(dept => (
                        <button
                            key={dept.id}
                            onClick={() => setSelectedDept(dept)}
                            className={`p-4 rounded-2xl border transition-all flex flex-col items-center justify-center gap-2 text-center ${selectedDept?.id === dept.id ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200 scale-105' : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'}`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedDept?.id === dept.id ? 'bg-white/20' : 'bg-slate-100'}`}>
                                <i className={`fas ${dept.icon || 'fa-building'} ${selectedDept?.id === dept.id ? 'text-white' : 'text-slate-500'}`}></i>
                            </div>
                            <span className="text-xs font-bold truncate w-full">{dept.name}</span>
                        </button>
                    ))}
                </div>

                {selectedDept ? (
                    <div className="animate-fade-in-up">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                <i className="fas fa-user-md text-emerald-500"></i>
                                {selectedDept.name} - {t('nav.onCallManagement')}
                            </h2>
                            <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
                                <i className="fas fa-clock text-slate-400"></i>
                                <span className="text-sm font-bold text-slate-600">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>

                        {loading ? (
                            <div className="py-20"><Loading /></div>
                        ) : onCallDoctors.length > 0 ? (
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {onCallDoctors.map((doc, idx) => {
                                    const active = true; // They are all active now due to the filter
                                    const shiftText = doc!.shifts.map((s: any) => `${s.start} - ${s.end}`).join(', ');
                                    return (
                                        <div key={idx} className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-500 ring-2 ring-emerald-50 transition-all hover:shadow-md">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg bg-emerald-100 text-emerald-600">
                                                        {doc!.doctorName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-800">{doc!.doctorName}</h4>
                                                        <p className="text-xs text-slate-500 font-medium">Doctor / Consultant</p>
                                                    </div>
                                                </div>
                                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full animate-pulse">
                                                    ON DUTY NOW
                                                </span>
                                            </div>

                                            <div className="bg-slate-50 rounded-2xl p-4 mb-6">
                                                <div className="flex items-center justify-between text-xs mb-2">
                                                    <span className="text-slate-400 font-bold uppercase tracking-wider">Today's Shift</span>
                                                    <span className="text-slate-600 font-bold">{todayStr}</span>
                                                </div>
                                                <div className="text-lg font-black text-slate-800 flex items-center gap-2">
                                                    <i className="fas fa-calendar-day text-emerald-500"></i>
                                                    {shiftText}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <a 
                                                    href={`tel:${doc!.user?.phone || ''}`}
                                                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${doc!.user?.phone ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                                >
                                                    <i className="fas fa-phone"></i> Call
                                                </a>
                                                <a 
                                                    href={`https://wa.me/${doc!.user?.phone?.replace('+', '') || ''}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${doc!.user?.phone ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                                >
                                                    <i className="fab fa-whatsapp"></i> WhatsApp
                                                </a>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <i className="fas fa-user-md-slash text-3xl text-slate-300"></i>
                                </div>
                                <h3 className="text-lg font-bold text-slate-700">No Doctors On Duty Now</h3>
                                <p className="text-slate-500 text-sm mt-2">There are no doctors or consultants currently within their scheduled shift times for this department.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 animate-fade-in">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fas fa-hospital text-3xl text-slate-300"></i>
                        </div>
                        <h3 className="text-lg font-bold text-slate-700">Select a Department</h3>
                        <p className="text-slate-500 text-sm mt-2">Choose a department above to view their current on-call and duty schedules.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OnCallManagement;
