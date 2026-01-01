
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, getDocs, Timestamp, getDoc } from 'firebase/firestore';
import { SwapRequest, Schedule, User } from '../../types';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const SupervisorSwaps: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });
        
        const qSwaps = query(collection(db, 'swapRequests'), where('status', 'in', ['pending', 'approvedByUser']));
        const unsubSwaps = onSnapshot(qSwaps, snap => {
            setSwapRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest)));
        });

        return () => { unsubUsers(); unsubSwaps(); };
    }, []);

    const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;

    // Duplicated Helper logic for resolving shift time
    const resolveShiftForUserDate = (userId: string, dateStr: string, schedules: Schedule[]) => {
        const userSchedules = schedules.filter(s => s.userId === userId);
        const dayOfWeek = new Date(dateStr).getDay();
        const specific = userSchedules.find(s => s.date === dateStr);
        if (specific) return specific;
        return userSchedules.find(sch => {
            if (sch.date) return false;
            let applies = false;
            const isFri = (sch.locationId || '').toLowerCase().includes('friday');
            if (dayOfWeek === 5) { if (isFri) applies = true; } else { if (!isFri && !(sch.locationId || '').includes('Holiday')) applies = true; }
            if (applies) {
                if (sch.validFrom && dateStr < sch.validFrom) applies = false;
                if (sch.validTo && dateStr > sch.validTo) applies = false;
            }
            return applies;
        });
    };

    const handleSwapAction = async (req: SwapRequest, isApproved: boolean) => {
      try {
          const status = isApproved ? 'approvedBySupervisor' : 'rejectedBySupervisor';
          
          if (isApproved && req.startDate) {
              // --- FIX: Include Previous Month in Query ---
              // Overlapping schedules (e.g., Dec 25 - Jan 25) are stored under '2023-12'.
              // If req.startDate is '2024-01-01', we must check '2023-12' as well.
              
              const currentMonth = req.startDate.slice(0, 7);
              
              const d = new Date(req.startDate);
              d.setMonth(d.getMonth() - 1);
              const prevMonth = d.toISOString().slice(0, 7);

              const qSch = query(
                  collection(db, 'schedules'), 
                  where('month', 'in', [prevMonth, currentMonth])
              );
              
              const snap = await getDocs(qSch);
              const allSchedules = snap.docs.map(d => d.data() as Schedule);

              const shiftA = resolveShiftForUserDate(req.from, req.startDate, allSchedules);
              const shiftB = resolveShiftForUserDate(req.to, req.startDate, allSchedules);

              const batch = writeBatch(db);
              const nameA = getUserName(req.from);
              const nameB = getUserName(req.to);

              const newDocA = doc(collection(db, 'schedules'));
              batch.set(newDocA, {
                  userId: req.from,
                  staffName: nameA,
                  date: req.startDate,
                  month: currentMonth, // Store new record in the current month
                  locationId: shiftB ? `Swap Duty - ${shiftB.locationId}` : 'Swap Duty - Off',
                  shifts: shiftB ? (shiftB.shifts || []) : [],
                  note: `Swap Approved: Covering ${nameB}`,
                  userType: 'user',
                  createdAt: Timestamp.now()
              });

              const newDocB = doc(collection(db, 'schedules'));
              batch.set(newDocB, {
                  userId: req.to,
                  staffName: nameB,
                  date: req.startDate,
                  month: currentMonth,
                  locationId: shiftA ? `Swap Duty - ${shiftA.locationId}` : 'Swap Duty - Off',
                  shifts: shiftA ? (shiftA.shifts || []) : [],
                  note: `Swap Approved: Covered by ${nameA}`,
                  userType: 'user',
                  createdAt: Timestamp.now()
              });

              const reqRef = doc(db, 'swapRequests', req.id);
              batch.update(reqRef, { status });

              await batch.commit();
              setToast({ msg: `Request Approved & Shifts Swapped!`, type: 'success' });

          } else {
              await updateDoc(doc(db, 'swapRequests', req.id), { status });
              setToast({ msg: `Request ${isApproved ? 'Approved' : 'Rejected'}`, type: 'success' });
          }
      } catch (e: any) { 
          setToast({ msg: 'Error: ' + e.message, type: 'error' }); 
      }
    };

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">{t('sup.swapReqs')}</h1>
            </div>

            <div className="grid gap-4">
                {swapRequests.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
                        No pending requests
                    </div>
                ) : (
                    swapRequests.map(req => (
                        <div key={req.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-xl shadow-sm">
                                    <i className="fas fa-exchange-alt"></i>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 font-bold text-slate-800 text-lg">
                                        <span>{getUserName(req.from)}</span>
                                        <i className="fas fa-arrow-right text-slate-400 text-sm"></i>
                                        <span>{getUserName(req.to)}</span>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-1">
                                        <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-600">{req.startDate}</span>
                                        {req.details && <span className="mx-2 italic text-slate-400">"{req.details}"</span>}
                                    </p>
                                    <div className="mt-1">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${req.status === 'approvedByUser' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                            {req.status === 'approvedByUser' ? 'Both Parties Agreed' : 'Pending User Approval'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleSwapAction(req, true)} className="bg-emerald-500 text-white px-5 py-2 rounded-xl font-bold hover:bg-emerald-600 shadow-md transition-all">
                                    {t('sup.approve')}
                                </button>
                                <button onClick={() => handleSwapAction(req, false)} className="bg-white border border-red-200 text-red-500 px-5 py-2 rounded-xl font-bold hover:bg-red-50 transition-all">
                                    {t('sup.reject')}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default SupervisorSwaps;
