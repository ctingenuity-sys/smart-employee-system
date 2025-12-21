import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, updateDoc, doc, Timestamp, getDoc } from 'firebase/firestore';
import { SwapRequest } from '../types';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

interface SwapRequestWithUser extends SwapRequest {
    id: string;
    fromUser: { id: string, name: string };
}

const UserIncoming: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    const [incomingSwaps, setIncomingSwaps] = useState<SwapRequestWithUser[]>([]);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
    const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
        isOpen: false, title: '', message: '', onConfirm: () => {}
    });

    useEffect(() => {
        if (!currentUserId) return;
        const qIncoming = query(collection(db, 'swapRequests'), where('to', '==', currentUserId), where('status', '==', 'pending'));
        const unsub = onSnapshot(qIncoming, async (snap) => {
            const reqs = await Promise.all(snap.docs.map(async d => {
                const data = d.data() as SwapRequest;
                // Fetch user name
                let fromName = "Unknown";
                try {
                    const uDoc = await getDoc(doc(db, 'users', data.from));
                    if (uDoc.exists()) fromName = uDoc.data().name || uDoc.data().email;
                } catch(e){}
                
                return { id: d.id, ...data, fromUser: { id: data.from, name: fromName } };
            }));
            setIncomingSwaps(reqs);
        });
        return () => unsub();
    }, [currentUserId]);

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
                setToast({ msg: 'Success', type: 'success' }); 
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
                {incomingSwaps.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <i className="fas fa-inbox text-3xl"></i>
                    </div>
                    <p className="text-slate-400 font-bold">{t('user.incoming.empty')}</p>
                </div>
                ) : (
                incomingSwaps.map(req => (
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
                ))
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