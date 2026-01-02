
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, getDocs, Timestamp, getDoc } from 'firebase/firestore';
import { SwapRequest, Schedule, User } from '../../types';
import Toast from '../../components/Toast';
import Modal from '../../components/Modal';
import { useLanguage } from '../../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const SupervisorSwaps: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    
    // Data States
    const [pendingRequests, setPendingRequests] = useState<SwapRequest[]>([]);
    const [historyRequests, setHistoryRequests] = useState<SwapRequest[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    
    // UI States
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [selectedReq, setSelectedReq] = useState<SwapRequest | null>(null);
    const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });
        
        // Pending Requests
        const qPending = query(collection(db, 'swapRequests'), where('status', 'in', ['pending', 'approvedByUser']));
        const unsubPending = onSnapshot(qPending, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest));
            // Sort Pending by newest as well
            list.sort((a: any, b: any) => {
                const tA = a.createdAt?.seconds || 0;
                const tB = b.createdAt?.seconds || 0;
                return tB - tA;
            });
            setPendingRequests(list);
        });

        // History/Active Requests (Approved Month Swaps for Revert capability)
        const qHistory = query(collection(db, 'swapRequests'), where('status', '==', 'approvedBySupervisor'));
        const unsubHistory = onSnapshot(qHistory, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SwapRequest));
            
            // SORTING LOGIC: Newest First
            list.sort((a: any, b: any) => {
                const tA = a.createdAt?.seconds || 0;
                const tB = b.createdAt?.seconds || 0;
                return tB - tA; // Descending order
            });
            
            setHistoryRequests(list);
        });

        return () => { unsubUsers(); unsubPending(); unsubHistory(); };
    }, []);

    const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;

    // Helper to identify Friday shifts
    const isFridayShift = (sch: Schedule) => {
        const loc = (sch.locationId || '').toLowerCase();
        const note = (sch.note || '').toLowerCase();
        
        // Check text markers
        if (loc.includes('friday') || loc.includes('الجمعة') || note.includes('friday') || note.includes('الجمعة')) return true;
        
        // Check specific date
        if (sch.date) {
            const d = new Date(sch.date);
            if (d.getDay() === 5) return true; // 5 is Friday
        }
        
        return false;
    };

    // Helper logic for resolving shift time (Day Swap)
    const resolveShiftForUserDate = (userId: string, dateStr: string, schedules: Schedule[]) => {
        const userSchedules = schedules.filter(s => s.userId === userId);
        const dayOfWeek = new Date(dateStr).getDay();
        const specific = userSchedules.find(s => s.date === dateStr);
        if (specific) return specific;
        return userSchedules.find(sch => {
            if (sch.date) return false;
            let applies = false;
            const isFri = isFridayShift(sch);
            if (dayOfWeek === 5) { if (isFri) applies = true; } else { if (!isFri && !(sch.locationId || '').includes('Holiday')) applies = true; }
            if (applies) {
                if (sch.validFrom && dateStr < sch.validFrom) applies = false;
                if (sch.validTo && dateStr > sch.validTo) applies = false;
            }
            return applies;
        });
    };

    // Open Modal for Month Swaps
    const initiateApproval = (req: SwapRequest) => {
        if (req.type === 'month') {
            setSelectedReq(req);
            setIsOptionModalOpen(true);
        } else {
            handleSwapAction(req, true, false); // Day swap doesn't need friday options
        }
    };

    const handleSwapAction = async (req: SwapRequest, isApproved: boolean, excludeFridays: boolean = false) => {
      try {
          const status = isApproved ? 'approvedBySupervisor' : 'rejectedBySupervisor';
          
          if (isApproved && req.startDate) {
              const batch = writeBatch(db);
              const nameA = getUserName(req.from);
              const nameB = getUserName(req.to);

              if (req.type === 'month') {
                  // --- MONTH SWAP LOGIC ---
                  const targetMonth = req.startDate.slice(0, 7); // YYYY-MM

                  // 1. Get User A's schedules
                  const qA = query(collection(db, 'schedules'), where('userId', '==', req.from), where('month', '==', targetMonth));
                  const snapA = await getDocs(qA);

                  // 2. Get User B's schedules
                  const qB = query(collection(db, 'schedules'), where('userId', '==', req.to), where('month', '==', targetMonth));
                  const snapB = await getDocs(qB);

                  let count = 0;

                  // Move A's tickets to B
                  snapA.docs.forEach(d => {
                      const sch = d.data() as Schedule;
                      if (excludeFridays && isFridayShift(sch)) return; // Skip if Excluding Fridays

                      batch.update(d.ref, {
                          userId: req.to,
                          staffName: nameB,
                          note: `Month Swap: Was ${nameA}`,
                          updatedAt: Timestamp.now()
                      });
                      count++;
                  });

                  // Move B's tickets to A
                  snapB.docs.forEach(d => {
                      const sch = d.data() as Schedule;
                      if (excludeFridays && isFridayShift(sch)) return; // Skip if Excluding Fridays

                      batch.update(d.ref, {
                          userId: req.from,
                          staffName: nameA,
                          note: `Month Swap: Was ${nameB}`,
                          updatedAt: Timestamp.now()
                      });
                      count++;
                  });

                  // Store the option chosen in the request for reference/revert
                  batch.update(doc(db, 'swapRequests', req.id), { 
                      status, 
                      swapOption: excludeFridays ? 'exclude_fridays' : 'full_month'
                  });

                  setToast({ msg: `Month Swapped! (${count} shifts moved)`, type: 'success' });

              } else {
                  // --- DAY SWAP LOGIC (Existing) ---
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

                  const newDocA = doc(collection(db, 'schedules'));
                  batch.set(newDocA, {
                      userId: req.from,
                      staffName: nameA,
                      date: req.startDate,
                      month: currentMonth,
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
                  
                  batch.update(doc(db, 'swapRequests', req.id), { status });
                  setToast({ msg: `Day Swap Approved!`, type: 'success' });
              }

              await batch.commit();

          } else {
              // Reject
              await updateDoc(doc(db, 'swapRequests', req.id), { status });
              setToast({ msg: `Request Rejected`, type: 'success' });
          }
          
          setIsOptionModalOpen(false);
          setSelectedReq(null);

      } catch (e: any) { 
          setToast({ msg: 'Error: ' + e.message, type: 'error' }); 
      }
    };

    // --- REVERT FUNCTIONALITY ---
    const handleRevertSwap = async (req: SwapRequest) => {
        if (!confirm('هل أنت متأكد من إلغاء هذا التبديل وإعادة الجداول لأصحابها؟')) return;
        
        try {
            const batch = writeBatch(db);
            const nameA = getUserName(req.from); // Original Owner A
            const nameB = getUserName(req.to);   // Original Owner B
            const targetMonth = req.startDate ? req.startDate.slice(0, 7) : '';
            const excludeFridays = (req as any).swapOption === 'exclude_fridays';

            // IMPORTANT: "Reverting" means moving items CURRENTLY held by B (but marked as 'Was A') back to A.
            // And items CURRENTLY held by A (marked 'Was B') back to B.

            // 1. Find tickets currently with User A (that were B's)
            const qA_holding_B = query(
                collection(db, 'schedules'), 
                where('userId', '==', req.from), 
                where('month', '==', targetMonth)
            );
            // 2. Find tickets currently with User B (that were A's)
            const qB_holding_A = query(
                collection(db, 'schedules'), 
                where('userId', '==', req.to), 
                where('month', '==', targetMonth)
            );

            const snapA = await getDocs(qA_holding_B);
            const snapB = await getDocs(qB_holding_A);

            let revertedCount = 0;

            // Move B's original tickets back to B (currently held by A)
            snapA.docs.forEach(d => {
                const data = d.data() as Schedule;
                // Only revert if it looks like a swapped ticket OR simply revert everything if it's a full swap
                // Safer check: look for note or simply reverse the swap logic
                if (excludeFridays && isFridayShift(data)) return;

                batch.update(d.ref, {
                    userId: req.to,
                    staffName: nameB,
                    note: `Reverted: Was ${nameA}`, // Clear or update note
                    updatedAt: Timestamp.now()
                });
                revertedCount++;
            });

            // Move A's original tickets back to A (currently held by B)
            snapB.docs.forEach(d => {
                const data = d.data() as Schedule;
                if (excludeFridays && isFridayShift(data)) return;

                batch.update(d.ref, {
                    userId: req.from,
                    staffName: nameA,
                    note: `Reverted: Was ${nameB}`,
                    updatedAt: Timestamp.now()
                });
                revertedCount++;
            });

            // Mark request as reverted or deleted
            batch.update(doc(db, 'swapRequests', req.id), { status: 'reverted' });

            await batch.commit();
            setToast({ msg: `Swap Reverted Successfully (${revertedCount} shifts restored).`, type: 'success' });

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Revert Error: ' + e.message, type: 'error' });
        }
    };

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                        <i className="fas fa-arrow-left rtl:rotate-180"></i>
                    </button>
                    <h1 className="text-2xl font-black text-slate-800">{t('sup.swapReqs')}</h1>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('pending')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'pending' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                    >
                        Pending ({pendingRequests.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'history' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                    >
                        Active History
                    </button>
                </div>
            </div>

            <div className="grid gap-4">
                {(activeTab === 'pending' ? pendingRequests : historyRequests).length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
                        {activeTab === 'pending' ? 'No pending requests' : 'No active history'}
                    </div>
                ) : (
                    (activeTab === 'pending' ? pendingRequests : historyRequests).map(req => (
                        <div key={req.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 group hover:border-indigo-200 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-sm ${req.status === 'approvedBySupervisor' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                    <i className="fas fa-exchange-alt"></i>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 font-bold text-slate-800 text-lg">
                                        <span>{getUserName(req.from)}</span>
                                        <i className="fas fa-arrow-right text-slate-300 text-xs"></i>
                                        <span>{getUserName(req.to)}</span>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                                        <span className={`bg-slate-100 px-2 py-0.5 rounded font-bold ${req.type === 'month' ? 'text-indigo-600' : 'text-slate-600'}`}>
                                            {req.type === 'month' ? `MONTH: ${req.startDate?.slice(0,7)}` : req.startDate}
                                        </span>
                                        {req.details && <span className="italic text-slate-400">"{req.details}"</span>}
                                        {(req as any).swapOption === 'exclude_fridays' && (
                                            <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">No Fridays</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex gap-2">
                                {activeTab === 'pending' ? (
                                    <>
                                        <button onClick={() => initiateApproval(req)} className="bg-emerald-500 text-white px-5 py-2 rounded-xl font-bold hover:bg-emerald-600 shadow-md transition-all text-sm">
                                            {t('sup.approve')}
                                        </button>
                                        <button onClick={() => handleSwapAction(req, false)} className="bg-white border border-red-200 text-red-500 px-5 py-2 rounded-xl font-bold hover:bg-red-50 transition-all text-sm">
                                            {t('sup.reject')}
                                        </button>
                                    </>
                                ) : (
                                    // REVERT BUTTON FOR HISTORY
                                    req.type === 'month' && (
                                        <button onClick={() => handleRevertSwap(req)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all text-xs flex items-center gap-2 shadow-sm">
                                            <i className="fas fa-undo"></i> Revert Swap
                                        </button>
                                    )
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal for Month Swap Options */}
            <Modal isOpen={isOptionModalOpen} onClose={() => setIsOptionModalOpen(false)} title="خيارات تبديل الشهر">
                <div className="space-y-4 text-center">
                    <p className="text-slate-600 mb-4">كيف تريد تنفيذ تبديل الشهر؟</p>
                    
                    <button 
                        onClick={() => selectedReq && handleSwapAction(selectedReq, true, false)}
                        className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-indigo-700 flex items-center justify-center gap-2"
                    >
                        <i className="fas fa-calendar-alt"></i>
                        تبديل الشهر بالكامل
                        <span className="text-xs font-normal opacity-80">(يشمل الجمع)</span>
                    </button>

                    <button 
                        onClick={() => selectedReq && handleSwapAction(selectedReq, true, true)}
                        className="w-full bg-white border-2 border-indigo-100 text-indigo-700 py-4 rounded-xl font-bold hover:bg-indigo-50 flex items-center justify-center gap-2"
                    >
                        <i className="fas fa-calendar-minus"></i>
                        تبديل الشهر 
                        <span className="text-red-500 font-black">(بدون الجمع)</span>
                    </button>

                    <button 
                        onClick={() => setIsOptionModalOpen(false)}
                        className="text-slate-400 text-sm mt-2 hover:text-slate-600"
                    >
                        إلغاء
                    </button>
                </div>
            </Modal>

        </div>
    );
};

export default SupervisorSwaps;
