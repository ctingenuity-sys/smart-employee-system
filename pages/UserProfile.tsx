
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, addDoc, Timestamp } from 'firebase/firestore';
import { ActionLog, PeerRecognition, User } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

// Helper for safe dates
const safeDate = (val: any) => {
    if (!val) return '-';
    if (typeof val === 'string') return val;
    if (val.toDate) return val.toDate().toLocaleDateString('en-US');
    return String(val);
};

const UserProfile: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || 'User';
    
    const [myActions, setMyActions] = useState<ActionLog[]>([]);
    const [myKudos, setMyKudos] = useState<PeerRecognition[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [patientsCount, setPatientsCount] = useState(0);
    
    const [isKudosModalOpen, setIsKudosModalOpen] = useState(false);
    const [kudosForm, setKudosForm] = useState({ toUserId: '', type: 'thankyou' as 'hero'|'thankyou'|'teamplayer', message: '' });
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);

    useEffect(() => {
        if (!currentUserId) return;

        const qKudos = query(collection(db, 'peer_recognition'), where('toUserId', '==', currentUserId));
        const unsubKudos = onSnapshot(qKudos, (snap) => {
            const fetchedKudos = snap.docs.map(d => ({ id: d.id, ...d.data() } as PeerRecognition));
            fetchedKudos.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setMyKudos(fetchedKudos);
        });

        const qActions = query(collection(db, 'actions'), where('employeeId', '==', currentUserId));
        const unsubActions = onSnapshot(qActions, (snap) => {
            const fetchedActions = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActionLog));
            fetchedActions.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setMyActions(fetchedActions);
        });

        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });

        // Get Patients Count from Supabase
        const fetchPatientCount = async () => {
            try {
                const { count, error } = await supabase
                    .from('appointments')
                    .select('*', { count: 'exact', head: true })
                    .eq('performedBy', currentUserId)
                    .eq('status', 'done');

                if (error) throw error;
                setPatientsCount(count || 0);
            } catch (e) { console.error("Supabase count error:", e); }
        };
        fetchPatientCount();

        return () => { unsubKudos(); unsubActions(); unsubUsers(); };
    }, [currentUserId]);

    const handleSendKudos = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!currentUserId) return;
        if(!kudosForm.toUserId || !kudosForm.message) return setToast({msg: 'Please select a colleague and write a message', type: 'error'});
        
        try {
            const targetUserObj = users.find(u => u.id === kudosForm.toUserId);
            const targetName = targetUserObj ? (targetUserObj.name || targetUserObj.email) : 'Colleague';
  
            await addDoc(collection(db, 'peer_recognition'), {
                fromUserId: currentUserId,
                fromUserName: currentUserName,
                toUserId: kudosForm.toUserId,
                toUserName: targetName, 
                type: kudosForm.type,
                message: kudosForm.message,
                createdAt: Timestamp.now()
            });
            setToast({ msg: 'Appreciation Sent Successfully! 🎉', type: 'success' });
            setIsKudosModalOpen(false);
            setKudosForm({ toUserId: '', type: 'thankyou', message: '' });
        } catch(e) {
            setToast({ msg: 'Error sending appreciation', type: 'error' });
        }
    };

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">{t('user.tab.profile')}</h1>
            </div>

            {/* Score Card */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden mb-8">
                <div className="absolute right-0 top-0 h-full w-1/3 bg-white/5 skew-x-12"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-full flex items-center justify-center border-4 border-white/20 text-3xl font-black">
                            {100 - (myActions.filter(a => ['violation', 'unjustified_absence', 'late'].includes(a.type)).length * 10)}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black">{t('stats.attendance')}</h2>
                            <p className="text-slate-400">Points based on monthly performance</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <div className="bg-white/10 px-4 py-2 rounded-xl text-center min-w-[80px]">
                            <span className="block text-2xl font-black text-emerald-400">{myKudos.length}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-300">Kudos</span>
                        </div>
                        <div className="bg-white/10 px-4 py-2 rounded-xl text-center min-w-[80px]">
                            <span className="block text-2xl font-black text-blue-400">{patientsCount}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-300">Cases</span>
                        </div>
                        <div className="bg-white/10 px-4 py-2 rounded-xl text-center min-w-[80px]">
                            <span className="block text-2xl font-black text-red-400">{myActions.filter(a => ['violation', 'late', 'unjustified_absence'].includes(a.type)).length}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-300">Flags</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end mb-6">
                <button 
                    onClick={() => setIsKudosModalOpen(true)}
                    className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-orange-200 hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
                >
                    <i className="fas fa-heart text-white animate-pulse"></i> {t('kudos.send')}
                </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Kudos Wall */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <i className="fas fa-award text-amber-500"></i> {t('kudos.received')}
                    </h3>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {myKudos.length === 0 ? (
                            <p className="text-center text-slate-400 py-8 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                No kudos yet. Be a hero today!
                            </p>
                        ) : (
                            myKudos.map(k => (
                                <div key={k.id} className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-xl border border-amber-100 relative overflow-hidden group hover:shadow-md transition-all">
                                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <i className={`fas ${k.type === 'hero' ? 'fa-medal' : k.type === 'teamplayer' ? 'fa-users' : 'fa-thumbs-up'} text-4xl text-amber-600`}></i>
                                    </div>
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded text-white ${k.type === 'hero' ? 'bg-purple-500' : k.type === 'teamplayer' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                                                {t(`kudos.${k.type}`)}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-mono">
                                                {safeDate(k.createdAt)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-700 font-medium italic">"{k.message}"</p>
                                        <p className="text-xs text-amber-700 font-bold mt-2 flex items-center gap-1">
                                            <i className="fas fa-user-circle"></i> {k.fromUserName}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Action Log History */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <i className="fas fa-clipboard-list text-blue-500"></i> Performance Log
                    </h3>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {myActions.length === 0 ? (
                            <p className="text-center text-slate-400 py-4 text-sm">Clean record!</p>
                        ) : (
                            myActions.map(act => (
                                <div key={act.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                                    <div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${act.type === 'positive' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                            {t(`action.${act.type}`) || act.type}
                                        </span>
                                        {/* SAFE DATE RENDERING */}
                                        <p className="text-xs text-slate-500 mt-1 font-mono">{safeDate(act.fromDate)}</p>
                                    </div>
                                    <p className="text-xs text-slate-700 font-medium max-w-[50%] text-right">{act.description}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Modal: Send Kudos */}
            <Modal isOpen={isKudosModalOpen} onClose={() => setIsKudosModalOpen(false)} title={t('kudos.send')}>
                <form onSubmit={handleSendKudos} className="space-y-5">
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-center">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm text-2xl">
                            🎉
                        </div>
                        <p className="text-amber-800 text-xs font-bold">Encourage your colleagues and spread positivity!</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t('user.req.colleague')}</label>
                        <select 
                            className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-amber-200"
                            value={kudosForm.toUserId}
                            onChange={e => setKudosForm({...kudosForm, toUserId: e.target.value})}
                            required
                        >
                            <option value="">Select Colleague...</option>
                            {users.filter(u => u.id !== currentUserId).map(u => (
                                <option key={u.id} value={u.id}>{u.name || u.email}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2">Select Badge</label>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { id: 'thankyou', label: t('kudos.thank'), icon: 'fa-thumbs-up', color: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' },
                                { id: 'teamplayer', label: t('kudos.team'), icon: 'fa-users', color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' },
                                { id: 'hero', label: t('kudos.hero'), icon: 'fa-medal', color: 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100' }
                            ].map(type => (
                                <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => setKudosForm({...kudosForm, type: type.id as any})}
                                    className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${kudosForm.type === type.id ? type.color.replace('50', '100').replace('hover:', '') + ' border-current ring-2 ring-offset-1 ring-slate-100' : 'bg-white border-slate-100 text-slate-400 grayscale hover:grayscale-0'}`}
                                >
                                    <i className={`fas ${type.icon} text-2xl`}></i>
                                    <span className="text-[10px] font-bold">{type.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Message</label>
                        <textarea 
                            className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-amber-200 min-h-[100px] resize-none"
                            placeholder="Write something nice..."
                            value={kudosForm.message}
                            onChange={e => setKudosForm({...kudosForm, message: e.target.value})}
                            required
                        ></textarea>
                    </div>

                    <button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3.5 rounded-xl font-bold hover:shadow-lg hover:scale-[1.02] transition-all active:scale-95 shadow-md shadow-orange-200 flex items-center justify-center gap-2">
                        <i className="fas fa-paper-plane"></i> Send Appreciation
                    </button>
                </form>
            </Modal>
        </div>
    );
};

export default UserProfile;
