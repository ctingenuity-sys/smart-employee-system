import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { LeaveRequest, User } from '../../types';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const SupervisorLeaves: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });
        
        const qLeaves = query(collection(db, 'leaveRequests'), where('status', '==', 'pending'));
        const unsubLeaves = onSnapshot(qLeaves, snap => {
            setLeaveRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
        });

        return () => { unsubUsers(); unsubLeaves(); };
    }, []);

    const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;

    const handleLeaveAction = async (id: string, isApproved: boolean) => {
        try {
            await updateDoc(doc(db, 'leaveRequests', id), { status: isApproved ? 'approved' : 'rejected' });
            setToast({ msg: `Request ${isApproved ? 'Approved' : 'Rejected'}`, type: 'success' });
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">{t('sup.leaveReqs')}</h1>
            </div>

            <div className="grid gap-4">
                {leaveRequests.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
                        No pending requests
                    </div>
                ) : (
                    leaveRequests.map(req => (
                        <div key={req.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center text-xl shadow-sm">
                                    <i className="fas fa-umbrella-beach"></i>
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800 text-lg">{getUserName(req.from)}</h4>
                                    <p className="text-sm text-slate-500 mt-1">
                                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{req.startDate}</span>
                                        <i className="fas fa-arrow-right mx-2 text-slate-300 text-xs"></i>
                                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{req.endDate}</span>
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1 italic">"{req.reason}"</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleLeaveAction(req.id, true)} className="bg-emerald-500 text-white px-5 py-2 rounded-xl font-bold hover:bg-emerald-600 shadow-md transition-all">
                                    {t('sup.approve')}
                                </button>
                                <button onClick={() => handleLeaveAction(req.id, false)} className="bg-white border border-red-200 text-red-500 px-5 py-2 rounded-xl font-bold hover:bg-red-50 transition-all">
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

export default SupervisorLeaves;