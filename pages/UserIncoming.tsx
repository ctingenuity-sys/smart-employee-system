import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, getDocs, updateDoc, doc, Timestamp, getDoc, addDoc } from 'firebase/firestore';
import { SwapRequest, LeaveRequest } from '../types';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

interface SwapRequestWithUser extends SwapRequest {
    id: string;
    fromUser: { id: string, name: string };
}

interface LeaveRequestWithUser extends LeaveRequest {
    id: string;
    fromUser: { id: string, name: string };
}

const UserIncoming: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    const [incomingSwaps, setIncomingSwaps] = useState<SwapRequestWithUser[]>(() => {
        const cached = localStorage.getItem('usr_cached_incoming');
        return cached ? JSON.parse(cached) : [];
    });
    const [incomingLeaves, setIncomingLeaves] = useState<LeaveRequestWithUser[]>(() => {
        const cached = localStorage.getItem('usr_cached_incoming_leaves');
        return cached ? JSON.parse(cached) : [];
    });
    const [myPendingLeaves, setMyPendingLeaves] = useState<LeaveRequest[]>([]);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
    const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
        isOpen: false, title: '', message: '', onConfirm: () => {}
    });
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        localStorage.setItem('usr_cached_incoming', JSON.stringify(incomingSwaps));
        localStorage.setItem('usr_cached_incoming_leaves', JSON.stringify(incomingLeaves));
    }, [incomingSwaps, incomingLeaves]);

    useEffect(() => {
        if (!currentUserId) return;
        const qIncoming = query(collection(db, 'swapRequests'), where('to', '==', currentUserId), where('status', '==', 'pending'));
        getDocs(qIncoming).then(async (snap) => {
            const reqs = await Promise.all(snap.docs.map(async d => {
                const data = d.data() as SwapRequest;
                // Fetch user name
                let fromName = "Unknown";
                try {
                    const uDoc = await getDoc(doc(db, 'users', data.from));
                    if (uDoc.exists()) fromName = uDoc.data().name || uDoc.data().email;
                } catch(e){}
                
                return { ...data, id: d.id, fromUser: { id: data.from, name: fromName } };
            }));
            setIncomingSwaps(reqs);
        });

        const fetchLeaves = async () => {
            const leaves: LeaveRequestWithUser[] = [];

            // 1. Reliever Approvals
            const qLeaves = query(collection(db, 'leaveRequests'), where('relieverIds', 'array-contains', currentUserId), where('status', '==', 'pending_reliever'));
            const snap1 = await getDocs(qLeaves);
            for (const d of snap1.docs) {
                const data = d.data() as LeaveRequest;
                if (data.relieverApprovals && data.relieverApprovals[currentUserId]) continue;
                let fromName = "Unknown";
                try {
                    const uDoc = await getDoc(doc(db, 'users', data.from));
                    if (uDoc.exists()) fromName = uDoc.data().name || uDoc.data().email;
                } catch(e){}
                leaves.push({ ...data, id: d.id, fromUser: { id: data.from, name: fromName } });
            }

            setIncomingLeaves(leaves);
        };
        fetchLeaves();

        // Fetch my own pending leave requests
        const qMyLeaves = query(
            collection(db, 'leaveRequests'), 
            where('from', '==', currentUserId), 
            where('status', 'in', ['pending_reliever', 'pending_supervisor', 'pending_manager'])
        );
        getDocs(qMyLeaves).then(snap => {
            setMyPendingLeaves(snap.docs.map(d => ({ ...d.data(), id: d.id } as LeaveRequest)));
        });
    }, [currentUserId, refreshTrigger]);

    const handleSwapAction = (requestId: string, action: 'approved' | 'rejected') => {
        setConfirmModal({
          isOpen: true, 
          title: action === 'approved' ? t('user.incoming.accept') : t('sup.reject'), 
          message: t('confirm') + '?',
          onConfirm: async () => {
            setConfirmModal(prev => ({...prev, isOpen: false}));
            try { 
                const newStatus = action === 'approved' ? 'approvedByUser' : 'rejected'; 
                await updateDoc(doc(db, 'swapRequests', requestId), { status: newStatus, processedAt: Timestamp.now() }); 
                
                // Notify the requester
                const swapReq = incomingSwaps.find(r => r.id === requestId);
                if (swapReq) {
                    await addDoc(collection(db, 'notifications'), {
                        userId: swapReq.from,
                        departmentId: swapReq.departmentId || null,
                        title: 'تحديث على طلب التبديل',
                        message: `تم ${action === 'approved' ? 'الموافقة على' : 'رفض'} طلب التبديل الخاص بك من قبل الزميل.`,
                        link: '/user/history',
                        readBy: [],
                        createdAt: Timestamp.now(),
                        type: 'request'
                    });
                }

                setToast({ msg: 'Success', type: 'success' }); 
                setRefreshTrigger(prev => prev + 1);
            } catch (e) { 
                setToast({ msg: 'Error processing request', type: 'error' }); 
            }
          }
        });
    };

    const handleLeaveAction = async (req: LeaveRequestWithUser, action: 'approved' | 'rejected') => {
        if (!currentUserId) return;
        setConfirmModal({
          isOpen: true, 
          title: action === 'approved' ? t('user.incoming.accept') : t('sup.reject'), 
          message: t('confirm') + '?',
          onConfirm: async () => {
            setConfirmModal(prev => ({...prev, isOpen: false}));
            try { 
                const uDoc = await getDoc(doc(db, 'users', currentUserId));
                const userData = uDoc.exists() ? uDoc.data() : { name: 'Unknown', role: 'Employee', department: '' };
                
                const getJobTitle = (uData: any) => {
                    const JOB_CATEGORIES = [
                        { id: 'doctor', title: 'Doctors' },
                        { id: 'technologist', title: 'Specialists' },
                        { id: 'usg', title: 'Ultrasound' },
                        { id: 'technician', title: 'Technicians' },
                        { id: 'nurse', title: 'Nurses' },
                        { id: 'rso', title: 'R S O' },
                    ];
                    const jobCat = JOB_CATEGORIES.find(c => c.id === uData?.jobCategory);
                    return jobCat ? jobCat.title : (uData?.section || uData?.role || uData?.jobCategory || '-');
                };
                const userJobTitle = getJobTitle(userData);
                let stampTitle = userJobTitle;
                if (req.status === 'pending_supervisor') {
                    stampTitle = userData.role || 'Supervisor';
                } else if (req.status === 'pending_manager') {
                    stampTitle = userData.role || 'Manager';
                }

                const stamp = `AL JEDAANI HOSPITAL\nRADIOLOGY DEPARTMENT\n${stampTitle}\n${userData?.name || userData?.email || 'Unknown'}\n${new Date().toLocaleDateString()}`;

                let newStatus = req.status;
                let updateData: any = {};

                if (req.status === 'pending_reliever') {
                    const currentApprovals = req.relieverApprovals || {};
                    currentApprovals[currentUserId] = {
                        approved: action === 'approved',
                        stamp: stamp,
                        name: userData.name || userData.email,
                        uid: currentUserId,
                        jobTitle: userJobTitle,
                        timestamp: Timestamp.now()
                    };
                    updateData.relieverApprovals = currentApprovals;

                    if (action === 'rejected') {
                        newStatus = 'rejected';
                    } else {
                        const allRelieversApproved = req.relieverIds?.every(id => 
                            id === currentUserId || (currentApprovals[id] && currentApprovals[id].approved)
                        );
                        if (allRelieversApproved) {
                            if ((req as any).hasSupervisors) {
                                newStatus = 'pending_supervisor';
                            } else if ((req as any).hasManagers) {
                                newStatus = 'pending_manager';
                            } else {
                                newStatus = 'approved';
                            }
                        }
                    }
                } else if (req.status === 'pending_supervisor') {
                    const approvalData = {
                        approved: action === 'approved',
                        stamp: stamp,
                        name: userData.name || userData.email,
                        uid: currentUserId,
                        jobTitle: stampTitle,
                        timestamp: Timestamp.now()
                    };
                    updateData.supervisorApproval = approvalData;
                    newStatus = action === 'approved' ? 'pending_manager' : 'rejected';
                } else if (req.status === 'pending_manager') {
                    const approvalData = {
                        approved: action === 'approved',
                        stamp: stamp,
                        name: userData.name || userData.email,
                        uid: currentUserId,
                        jobTitle: stampTitle,
                        timestamp: Timestamp.now()
                    };
                    updateData.managerApproval = approvalData;
                    newStatus = action === 'approved' ? 'approved' : 'rejected';
                }

                updateData.status = newStatus;
                await updateDoc(doc(db, 'leaveRequests', req.id), updateData);

                // Notify the requester
                // @ts-ignore
                const { addDoc, collection } = await import('firebase/firestore');
                await addDoc(collection(db, 'notifications'), {
                    userId: req.from,
                    departmentId: req.departmentId || null,
                    title: 'تحديث على طلب الإجازة',
                    message: `تم تحديث حالة طلب الإجازة الخاص بك إلى: ${newStatus}`,
                    link: '/user/history',
                    readBy: [],
                    createdAt: Timestamp.now(),
                    type: 'request'
                });

                // If it moved to pending_supervisor, notify supervisors
                if (newStatus === 'pending_supervisor') {
                    await addDoc(collection(db, 'notifications'), {
                        targetRole: 'supervisor',
                        departmentId: req.departmentId || null,
                        title: 'طلب إجازة جديد',
                        message: `طلب إجازة بانتظار موافقة المشرف من ${req.fromUser?.name || 'موظف'}`,
                        link: '/user/incoming',
                        readBy: [],
                        createdAt: Timestamp.now(),
                        type: 'request'
                    });
                } else if (newStatus === 'pending_manager') {
                    await addDoc(collection(db, 'notifications'), {
                        targetRole: 'manager',
                        departmentId: req.departmentId || null,
                        title: 'طلب إجازة جديد',
                        message: `طلب إجازة بانتظار موافقة المدير من ${req.fromUser?.name || 'موظف'}`,
                        link: '/user/incoming',
                        readBy: [],
                        createdAt: Timestamp.now(),
                        type: 'request'
                    });
                }

                setToast({ msg: 'Success', type: 'success' }); 
                setRefreshTrigger(prev => prev + 1);
            } catch (e) { 
                setToast({ msg: 'Error processing request', type: 'error' }); 
            }
          }
        });
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">{t('user.tab.incoming')}</h1>
            </div>

            <div className="space-y-4">
                {incomingSwaps.length === 0 && incomingLeaves.length === 0 && myPendingLeaves.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <i className="fas fa-inbox text-3xl"></i>
                    </div>
                    <p className="text-slate-400 font-bold">{t('user.incoming.empty')}</p>
                </div>
                ) : (
                <>
                {incomingSwaps.map(req => (
                    <div key={req.id} className="bg-white p-6 rounded-3xl shadow-sm border border-indigo-50 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden group">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 group-hover:w-2 transition-all"></div>
                    <div className="flex items-center gap-4 pl-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold shadow-sm">
                            {req.fromUser.name.charAt(0)}
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800 text-lg">{req.fromUser.name}</h4>
                            <p className="text-sm text-slate-500">{t('user.req.swap')} • <span className="font-mono bg-slate-100 px-2 rounded text-slate-600">{req.startDate}</span></p>
                            {req.details && <p className="text-xs text-slate-400 mt-1 italic">"{req.details}"</p>}
                        </div>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <button onClick={() => handleSwapAction(req.id, 'approved')} className="flex-1 md:flex-none bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all">
                            {t('user.incoming.accept')} <i className="fas fa-check ml-2"></i>
                        </button>
                        <button onClick={() => handleSwapAction(req.id, 'rejected')} className="flex-1 md:flex-none bg-white border border-red-200 text-red-500 px-6 py-2.5 rounded-xl font-bold hover:bg-red-50 transition-all">
                            {t('sup.reject')} <i className="fas fa-times ml-2"></i>
                        </button>
                    </div>
                    </div>
                ))}
                
                {incomingLeaves.map(req => (
                    <div key={req.id} className="bg-white p-6 rounded-3xl shadow-sm border border-rose-50 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden group">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500 group-hover:w-2 transition-all"></div>
                    <div className="flex items-center gap-4 pl-4">
                        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-xl font-bold shadow-sm">
                            {req.fromUser.name.charAt(0)}
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800 text-lg">{req.fromUser.name}</h4>
                            <p className="text-sm text-slate-500 font-medium">{t('user.req.leave')} • {req.typeOfLeave}</p>
                            <p className="text-xs text-slate-400 mt-1"><i className="far fa-calendar-alt mr-1"></i> {req.startDate} {t('to')} {req.endDate} ({req.duration} {t('user.req.duration')})</p>
                            {req.reason && <p className="text-sm text-slate-600 mt-2 bg-slate-50 p-2 rounded-lg italic border-l-2 border-rose-200">"{req.reason}"</p>}
                        </div>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <button onClick={() => handleLeaveAction(req, 'approved')} className="flex-1 md:flex-none bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all">
                            {t('user.incoming.accept')} <i className="fas fa-check ml-2"></i>
                        </button>
                        <button onClick={() => handleLeaveAction(req, 'rejected')} className="flex-1 md:flex-none bg-white border border-red-200 text-red-500 px-6 py-2.5 rounded-xl font-bold hover:bg-red-50 transition-all">
                            {t('sup.reject')} <i className="fas fa-times ml-2"></i>
                        </button>
                    </div>
                    </div>
                ))}

                {/* My Own Pending Requests */}
                {myPendingLeaves.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">{t('user.tab.history')} (Pending)</h3>
                        <div className="space-y-4">
                            {myPendingLeaves.map(req => (
                                <div key={req.id} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden group opacity-80">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-400"></div>
                                    <div className="flex items-center gap-4 pl-4">
                                        <div className="w-12 h-12 rounded-2xl bg-white text-slate-400 flex items-center justify-center text-xl font-bold shadow-sm">
                                            <i className="fas fa-clock"></i>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-700 text-lg">{t('user.req.leave')} • {req.typeOfLeave}</h4>
                                            <p className="text-xs text-slate-500 mt-1"><i className="far fa-calendar-alt mr-1"></i> {req.startDate} {t('to')} {req.endDate}</p>
                                            <div className="mt-2 flex items-center gap-2">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">
                                                    {req.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-slate-400 italic">{t('sup.pending')}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                </>
                )}
            </div>

            <Modal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({...confirmModal, isOpen: false})} title={confirmModal.title}>
                <div className="space-y-4">
                    <p className="text-slate-600 font-medium">{confirmModal.message}</p>
                    <div className="flex gap-3 pt-2">
                        <button onClick={confirmModal.onConfirm} className="flex-1 bg-slate-900 text-white py-2.5 rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-all">{t('confirm')}</button>
                        <button onClick={() => setConfirmModal({...confirmModal, isOpen: false})} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold hover:bg-slate-200 transition-all">{t('cancel')}</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default UserIncoming;