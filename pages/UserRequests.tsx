
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, getDocs, Timestamp } from 'firebase/firestore';
import { User } from '../types';
import Toast from '../components/Toast';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const UserRequests: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    
    const [users, setUsers] = useState<User[]>(() => {
        const cached = localStorage.getItem('usr_cached_users');
        return cached ? JSON.parse(cached) : [];
    });
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Swap Form
    const [targetUser, setTargetUser] = useState('');
    const [swapType, setSwapType] = useState('day');
    const [swapDate, setSwapDate] = useState('');
    const [swapDetails, setSwapDetails] = useState('');
    const [swapErrors, setSwapErrors] = useState<{target?: string, date?: string}>({});

    // Leave Form
    const [leaveStart, setLeaveStart] = useState('');
    const [leaveEnd, setLeaveEnd] = useState('');
    const [leaveReason, setLeaveReason] = useState('');
    const [leaveErrors, setLeaveErrors] = useState<{start?: string, end?: string, reason?: string}>({});

    useEffect(() => {
        localStorage.setItem('usr_cached_users', JSON.stringify(users));
    }, [users]);

    useEffect(() => {
        getDocs(collection(db, 'users')).then((snap) => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });
    }, [refreshTrigger]);

    const validateSwap = () => {
        const errs: any = {};
        if (!targetUser) errs.target = 'Please select a colleague';
        if (!swapDate) errs.date = 'Date is required';
        setSwapErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const validateLeave = () => {
        const errs: any = {};
        if (!leaveStart) errs.start = 'Start date required';
        if (!leaveEnd) errs.end = 'End date required';
        if (!leaveReason) errs.reason = 'Reason is required';
        if (leaveStart && leaveEnd && leaveStart > leaveEnd) errs.end = 'End date cannot be before start date';
        setLeaveErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSwapSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateSwap()) return;
        if (!currentUserId) return;
        
        try {
            await addDoc(collection(db, 'swapRequests'), {
                from: currentUserId,
                to: targetUser,
                type: swapType,
                details: swapDetails,
                startDate: swapDate,
                status: 'pending',
                createdAt: Timestamp.now()
            });
            setToast({ msg: t('save'), type: 'success' });
            setTargetUser(''); setSwapDetails(''); setSwapDate('');
            setTimeout(() => navigate('/user/history'), 1500);
        } catch (e) {
            setToast({ msg: 'Error sending request', type: 'error' });
        }
    };

    const handleLeaveSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateLeave()) return;
        if (!currentUserId) return;
        
        try {
          await addDoc(collection(db, 'leaveRequests'), { 
              from: currentUserId, 
              startDate: leaveStart, 
              endDate: leaveEnd, 
              reason: leaveReason, 
              status: 'pending', 
              createdAt: Timestamp.now() 
          });
          setToast({ msg: t('save'), type: 'success' });
          setLeaveStart(''); setLeaveEnd(''); setLeaveReason('');
          setTimeout(() => navigate('/user/history'), 1500);
        } catch (e) { 
            setToast({ msg: 'Error sending request', type: 'error' }); 
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">{t('user.tab.requests')}</h1>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Swap Request Form */}
                <div className="bg-white p-6 rounded-3xl shadow-lg border border-indigo-50 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><i className="fas fa-exchange-alt"></i></span>
                            {t('user.req.swap')}
                        </h3>
                    </div>
                    <form onSubmit={handleSwapSubmit} className="space-y-4 relative z-10">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">{t('user.req.type')}</label>
                                <div className="flex bg-slate-50 p-1 rounded-xl">
                                    <button type="button" onClick={() => setSwapType('day')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${swapType === 'day' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>{t('user.req.day')}</button>
                                    <button type="button" onClick={() => setSwapType('month')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${swapType === 'month' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>{t('user.req.month')}</button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">{swapType === 'day' ? 'Date' : 'Month'}</label>
                                <input 
                                    type={swapType === 'day' ? 'date' : 'month'} 
                                    className={`w-full bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-600 py-2.5 focus:ring-2 focus:ring-indigo-100 ${swapErrors.date ? 'ring-2 ring-red-200 bg-red-50' : ''}`}
                                    value={swapDate}
                                    onChange={e => { setSwapDate(e.target.value); setSwapErrors({...swapErrors, date:''}) }}
                                />
                                {swapErrors.date && <p className="text-[10px] text-red-500 mt-1 ml-1">{swapErrors.date}</p>}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 mb-1 block">{t('user.req.colleague')}</label>
                            <select 
                                className={`w-full bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-600 py-3 focus:ring-2 focus:ring-indigo-100 ${swapErrors.target ? 'ring-2 ring-red-200 bg-red-50' : ''}`}
                                value={targetUser}
                                onChange={e => { setTargetUser(e.target.value); setSwapErrors({...swapErrors, target:''}) }}
                            >
                                <option value="">{t('user.req.colleague')}...</option>
                                {users.filter(u => u.id !== currentUserId).map(u => (
                                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                                ))}
                            </select>
                            {swapErrors.target && <p className="text-[10px] text-red-500 mt-1 ml-1">{swapErrors.target}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">{t('notes')}</label>
                            <textarea 
                                className="w-full bg-slate-50 border-none rounded-xl text-sm p-3 focus:ring-2 focus:ring-indigo-100 min-h-[80px]"
                                placeholder="..."
                                value={swapDetails}
                                onChange={e => setSwapDetails(e.target.value)}
                            ></textarea>
                        </div>
                        <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg shadow-slate-300 hover:bg-slate-800 transition-all active:scale-95">
                            {t('user.req.send')}
                        </button>
                    </form>
                </div>

                {/* Leave Request Form */}
                <div className="bg-white p-6 rounded-3xl shadow-lg border border-red-50 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-orange-500"></div>
                    <h3 className="font-bold text-slate-800 text-lg mb-6 flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center"><i className="fas fa-umbrella-beach"></i></span>
                        {t('user.req.leave')}
                    </h3>
                    <form onSubmit={handleLeaveSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">{t('user.req.from')}</label>
                                <input type="date" className={`w-full bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-600 py-2.5 focus:ring-2 focus:ring-rose-100 ${leaveErrors.start ? 'ring-2 ring-red-200' : ''}`} value={leaveStart} onChange={e => {setLeaveStart(e.target.value); setLeaveErrors({...leaveErrors, start:''})}} />
                                {leaveErrors.start && <p className="text-[10px] text-red-500 mt-1">{leaveErrors.start}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">{t('user.req.to')}</label>
                                <input type="date" className={`w-full bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-600 py-2.5 focus:ring-2 focus:ring-rose-100 ${leaveErrors.end ? 'ring-2 ring-red-200' : ''}`} value={leaveEnd} onChange={e => {setLeaveEnd(e.target.value); setLeaveErrors({...leaveErrors, end:''})}} />
                                {leaveErrors.end && <p className="text-[10px] text-red-500 mt-1">{leaveErrors.end}</p>}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">{t('user.req.reason')}</label>
                            <textarea className={`w-full bg-slate-50 border-none rounded-xl text-sm p-3 focus:ring-2 focus:ring-rose-100 min-h-[80px] ${leaveErrors.reason ? 'ring-2 ring-red-200' : ''}`} placeholder="..." value={leaveReason} onChange={e => {setLeaveReason(e.target.value); setLeaveErrors({...leaveErrors, reason:''})}}></textarea>
                            {leaveErrors.reason && <p className="text-[10px] text-red-500 mt-1">{leaveErrors.reason}</p>}
                        </div>
                        <button type="submit" className="w-full bg-white border-2 border-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-50 hover:text-rose-600 hover:border-rose-100 transition-all active:scale-95">
                            {t('user.req.apply')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default UserRequests;
