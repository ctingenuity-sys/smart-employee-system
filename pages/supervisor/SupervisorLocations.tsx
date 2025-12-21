import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { Location } from '../../types';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const SupervisorLocations: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [locations, setLocations] = useState<Location[]>([]);
    const [newLocationName, setNewLocationName] = useState('');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'locations'), snap => {
            setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
        });
        return () => unsub();
    }, []);

    const handleAddLocation = async () => {
        if (!newLocationName) return;
        try {
            await addDoc(collection(db, 'locations'), { name: newLocationName });
            setToast({ msg: 'Location Added', type: 'success' });
            setNewLocationName('');
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleDeleteLocation = async (id: string) => {
        if (!confirm(t('confirm') + '?')) return;
        try {
            await deleteDoc(doc(db, 'locations', id));
            setToast({ msg: 'Location Deleted', type: 'success' });
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">{t('sup.tab.locations')}</h1>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
                <div className="md:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><i className="fas fa-list text-blue-500"></i> {t('sup.loc.title')}</h3>
                    <div className="space-y-2">
                        {locations.map(loc => (
                            <div key={loc.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100 hover:bg-white hover:shadow-sm transition-all group">
                                <span className="font-bold text-slate-700">{loc.name}</span>
                                <button onClick={() => handleDeleteLocation(loc.id)} className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"><i className="fas fa-trash"></i></button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 h-fit sticky top-4">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><i className="fas fa-plus-circle text-emerald-500"></i> {t('sup.loc.add')}</h3>
                    <input className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm mb-3 font-bold" placeholder="Location Name" value={newLocationName} onChange={e => setNewLocationName(e.target.value)} />
                    <button onClick={handleAddLocation} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg">{t('add')}</button>
                </div>
            </div>
        </div>
    );
};

export default SupervisorLocations;