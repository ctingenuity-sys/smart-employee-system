import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { OpenShift, Location } from '../types';
import Toast from '../components/Toast';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const UserMarket: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    const [openShifts, setOpenShifts] = useState<OpenShift[]>(() => {
        const cached = localStorage.getItem('usr_cached_market_shifts');
        return cached ? JSON.parse(cached) : [];
    });
    const [locations, setLocations] = useState<Location[]>(() => {
        const cached = localStorage.getItem('usr_cached_market_locs');
        return cached ? JSON.parse(cached) : [];
    });
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        localStorage.setItem('usr_cached_market_shifts', JSON.stringify(openShifts));
    }, [openShifts]);

    useEffect(() => {
        localStorage.setItem('usr_cached_market_locs', JSON.stringify(locations));
    }, [locations]);

    useEffect(() => {
        getDocs(collection(db, 'locations')).then((snap) => {
            setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
        });
        const qOpenShifts = query(collection(db, 'openShifts'), where('status', '==', 'open'));
        getDocs(qOpenShifts).then((snap) => {
            setOpenShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as OpenShift)));
        });
    }, [refreshTrigger]);

    const handleClaimShift = async (shift: OpenShift) => {
        if (!currentUserId) return;
        try {
            await updateDoc(doc(db, 'openShifts', shift.id), {
                status: 'claimed',
                claimedBy: currentUserId,
                claimedAt: Timestamp.now()
            });
            setToast({ msg: t('user.market.claimed'), type: 'success' });
        } catch (e) {
            setToast({ msg: 'Error claiming shift', type: 'error' });
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <i className="fas fa-store text-amber-500"></i> {t('user.market.title')}
                </h1>
            </div>

            {openShifts.length === 0 ? (
                <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center">
                    <i className="fas fa-store-slash text-4xl text-slate-300 mb-4"></i>
                    <p className="text-slate-500 font-bold">{t('user.market.empty')}</p>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 gap-4">
                    {openShifts.map(shift => (
                        <div key={shift.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center group hover:border-amber-200 transition-all">
                            <div>
                                <h4 className="font-bold text-slate-800 text-lg mb-1">{shift.date}</h4>
                                <p className="text-sm font-bold text-indigo-600 mb-1">{shift.shiftTime}</p>
                                <p className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg inline-block">
                                    {locations.find(l => l.id === shift.locationId)?.name || shift.locationId}
                                </p>
                            </div>
                            <button 
                                onClick={() => handleClaimShift(shift)}
                                className="bg-amber-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-amber-200 hover:bg-amber-600 hover:scale-105 transition-all"
                            >
                                {t('user.market.claim')}
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <p className="text-center text-xs text-slate-400 mt-8">{t('user.market.desc')}</p>
        </div>
    );
};

export default UserMarket;