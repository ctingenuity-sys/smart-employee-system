
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, getDocs, Timestamp, getDoc, addDoc } from 'firebase/firestore';
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

    // Exception Modal State
    const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
    const [exceptionDate, setExceptionDate] = useState('');
    const [exceptionTargetUser, setExceptionTargetUser] = useState('');
    const [currentMonthReq, setCurrentMonthReq] = useState<SwapRequest | null>(null);

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
                          note: (sch.note || '') + ` - Month Swap: Was ${nameA}`,
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
                          note: (sch.note || '') + ` - Month Swap: Was ${nameB}`,
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
        if (!confirm('هل أنت متأكد من إلغاء هذا التبديل وإعادة الجداول لأصحابها تماماً؟')) return;
        
        try {
            const batch = writeBatch(db);
            
            // Helper to clean notes from swap text
            const cleanNote = (note: string) => {
                return note.replace(/ ?-? ?Month Swap: Was.+/gi, '').trim();
            };

            if (req.type === 'month') {
                const nameA = getUserName(req.from); // Original Owner A
                const nameB = getUserName(req.to);   // Original Owner B
                const targetMonth = req.startDate ? req.startDate.slice(0, 7) : '';

                // 1. Find tickets currently with User A (that were originally B's)
                const qA_holding_B = query(
                    collection(db, 'schedules'), 
                    where('userId', '==', req.from), 
                    where('month', '==', targetMonth)
                );
                // 2. Find tickets currently with User B (that were originally A's)
                const qB_holding_A = query(
                    collection(db, 'schedules'), 
                    where('userId', '==', req.to), 
                    where('month', '==', targetMonth)
                );

                const snapA = await getDocs(qA_holding_B);
                const snapB = await getDocs(qB_holding_A);

                // Revert B's tickets (currently at A) back to B
                snapA.docs.forEach(d => {
                    const data = d.data() as Schedule;
                    // Check if this ticket was part of a swap
                    if ((data.note || '').includes('Month Swap: Was')) {
                        batch.update(d.ref, {
                            userId: req.to, // Give back to B
                            staffName: nameB,
                            note: cleanNote(data.note || ''), // Remove swap text
                            updatedAt: Timestamp.now()
                        });
                    }
                });

                // Revert A's tickets (currently at B) back to A
                snapB.docs.forEach(d => {
                    const data = d.data() as Schedule;
                    if ((data.note || '').includes('Month Swap: Was')) {
                        batch.update(d.ref, {
                            userId: req.from, // Give back to A
                            staffName: nameA,
                            note: cleanNote(data.note || ''), // Remove swap text
                            updatedAt: Timestamp.now()
                        });
                    }
                });

            } else {
                // --- DAY SWAP REVERT ---
                // Find and DELETE the specific schedule docs created for this day
                const qDaySwaps = query(
                    collection(db, 'schedules'),
                    where('date', '==', req.startDate),
                    where('note', '>=', 'Swap Approved'),
                    where('note', '<=', 'Swap Approved\uf8ff')
                );
                
                const snapDay = await getDocs(qDaySwaps);
                snapDay.docs.forEach(d => {
                    // Only delete docs belonging to these two users
                    const data = d.data();
                    if (data.userId === req.from || data.userId === req.to) {
                        batch.delete(d.ref);
                    }
                });
            }

            // Change status to 'rejected' so it disappears from "Active History" 
            batch.update(doc(db, 'swapRequests', req.id), { status: 'rejected' });

            await batch.commit();
            setToast({ msg: `تم إلغاء التبديل وإعادة الجداول لحالتها الأصلية.`, type: 'success' });

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Revert Error: ' + e.message, type: 'error' });
        }
    };

    // --- EXCEPTION DAY HANDLER (Swap Back Specific Day) ---
    const handleOpenException = (req: SwapRequest) => {
        setCurrentMonthReq(req);
        // Default to reversing the swap: If User A holds the month, target is User B (original owner)
        // Since 'req.to' is holding 'req.from' shifts usually (or vice versa), let's default to the *original requester* (req.from)
        // Actually, we should check who holds the month now.
        // req.from sent to req.to. So req.to holds req.from's shift.
        // If we want to swap back, we take from req.to and give to req.from.
        setExceptionTargetUser(req.from); 
        setExceptionDate(req.startDate || '');
        setIsExceptionModalOpen(true);
    };

    const confirmExceptionSwap = async () => {
        if (!currentMonthReq || !exceptionDate || !exceptionTargetUser) return;
        
        try {
            // Who currently "owns" the shift for this month?
            // In a Month Swap (A -> B), B holds A's shift.
            // We want to move this specific day from [Current Holder] to [Target User].
            
            // Note: Since Month Swap physically moved the shift to B, B is the current owner in DB.
            // We just need to perform a "Day Swap" logic where:
            // FROM: The person currently working (likely req.to or req.from depending on perspective)
            // TO: The person we selected (exceptionTargetUser)
            
            // To be safe, we query the schedule for this date/month to find the *actual* shift object
            // regardless of who holds it, then re-assign it for this specific day.
            
            const monthStr = exceptionDate.slice(0, 7);
            const targetName = getUserName(exceptionTargetUser);

            // 1. Find ANY schedule for the original participants on this date/month
            // We search for schedules belonging to either A or B for this month.
            const qSch = query(
                collection(db, 'schedules'),
                where('month', '==', monthStr),
                where('userId', 'in', [currentMonthReq.from, currentMonthReq.to])
            );
            
            const snap = await getDocs(qSch);
            const schedules = snap.docs.map(d => d.data() as Schedule);
            
            // We need to find the shift that is ACTIVE on this day.
            // Since it's a month swap, the 'userId' field in DB reflects the current worker.
            // We want to find the shift currently assigned to the OTHER person, and give it to 'exceptionTargetUser'.
            
            // Identify the "Current Holder" who needs to give up the shift
            // It is the person who is NOT the 'exceptionTargetUser'
            const currentHolderId = (currentMonthReq.from === exceptionTargetUser) ? currentMonthReq.to : currentMonthReq.from;
            const currentHolderName = getUserName(currentHolderId);

            // Resolve shift for the Current Holder
            const shiftToSwap = resolveShiftForUserDate(currentHolderId, exceptionDate, schedules);
            
            if (!shiftToSwap) {
                setToast({ msg: 'No shift found for the current holder on this date.', type: 'error' });
                return;
            }

            // Create Exception (Day Override)
            await addDoc(collection(db, 'schedules'), {
                userId: exceptionTargetUser,
                staffName: targetName,
                date: exceptionDate,
                month: monthStr,
                locationId: `Swap Duty - ${shiftToSwap.locationId}`,
                shifts: shiftToSwap.shifts || [],
                note: `Day Exception (Month Swap Override) - Was ${currentHolderName}`,
                userType: 'user',
                createdAt: Timestamp.now()
            });

            // We also need to make sure the Current Holder doesn't show up.
            // We create an "Off" or "Swap Duty - Off" ticket for them for this day.
            await addDoc(collection(db, 'schedules'), {
                userId: currentHolderId,
                staffName: currentHolderName,
                date: exceptionDate,
                month: monthStr,
                locationId: 'Swap Duty - Off', // Marker for OFF
                shifts: [],
                note: `Day Exception - Covered by ${targetName}`,
                userType: 'user',
                createdAt: Timestamp.now()
            });

            setToast({ msg: 'تم استثناء اليوم وتبديله بنجاح!', type: 'success' });
            setIsExceptionModalOpen(false);

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Error: ' + e.message, type: 'error' });
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
                                    // HISTORY ACTIONS: REVERT & EXCEPTION
                                    <div className="flex gap-2">
                                        {req.type === 'month' && (
                                            <button 
                                                onClick={() => handleOpenException(req)}
                                                className="bg-amber-50 text-amber-700 px-4 py-2 rounded-xl font-bold hover:bg-amber-100 border border-amber-200 transition-all text-xs flex items-center gap-2"
                                                title="تبديل يوم محدد داخل الشهر"
                                            >
                                                <i className="fas fa-calendar-day"></i> استثناء يوم
                                            </button>
                                        )}
                                        <button onClick={() => handleRevertSwap(req)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all text-xs flex items-center gap-2 shadow-sm">
                                            <i className="fas fa-undo"></i> إلغاء التبديل
                                        </button>
                                    </div>
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

            {/* Exception Day Modal */}
            <Modal isOpen={isExceptionModalOpen} onClose={() => setIsExceptionModalOpen(false)} title="استثناء يوم (تبديل جزئي)">
                <div className="space-y-4">
                    <div className="bg-amber-50 p-3 rounded-xl text-amber-800 text-xs font-bold border border-amber-200">
                        <i className="fas fa-info-circle mr-1"></i> سيتم إنشاء "تبديل يومي" للتاريخ المحدد، مما يغطي على التبديل الشهري لهذا اليوم فقط.
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">اختر التاريخ</label>
                        <input 
                            type="date" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                            value={exceptionDate}
                            onChange={e => setExceptionDate(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">الموظف البديل لهذا اليوم</label>
                        <select 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                            value={exceptionTargetUser}
                            onChange={e => setExceptionTargetUser(e.target.value)}
                        >
                            <option value="">اختر موظف...</option>
                            {/* Option 1: The original requester (Swap Back) */}
                            {currentMonthReq && (
                                <>
                                    <option value={currentMonthReq.from}>
                                        {getUserName(currentMonthReq.from)} (إرجاع للأصل)
                                    </option>
                                    <option value={currentMonthReq.to}>
                                        {getUserName(currentMonthReq.to)} (تثبيت للبديل)
                                    </option>
                                </>
                            )}
                            <option disabled>-----------</option>
                            {/* Option 2: Anyone else */}
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.name || u.email}</option>
                            ))}
                        </select>
                    </div>

                    <button 
                        onClick={confirmExceptionSwap}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-black transition-all"
                    >
                        تأكيد التبديل الجزئي
                    </button>
                </div>
            </Modal>

        </div>
    );
};

export default SupervisorSwaps;
