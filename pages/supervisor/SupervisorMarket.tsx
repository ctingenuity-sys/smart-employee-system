import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, Timestamp, query, getDocs } from 'firebase/firestore';
import { OpenShift, Location, User } from '../../types';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const convertTo24Hour = (timeStr: string): string | null => {
    if (!timeStr) return null;
    let s = timeStr.toLowerCase().trim();
    if (/^\d{1,2}$/.test(s)) return `${s.padStart(2, '0')}:00`;
    s = s.replace(/(\d+)\.(\d+)/, '$1:$2');
    if (s.match(/\b12\s*:?\s*0{0,2}\s*mn\b/)) return '24:00';
    if (s.match(/\b12\s*:?\s*0{0,2}\s*n\b/)) return '12:00';
    let modifier = null;
    if (s.includes('pm')) modifier = 'pm'; else if (s.includes('am')) modifier = 'am';
    const cleanTime = s.replace(/[^\d:]/g, ''); 
    const parts = cleanTime.split(':');
    let h = parseInt(parts[0], 10);
    let m = parts[1] ? parseInt(parts[1], 10) : 0;
    if (modifier) { if (modifier === 'pm' && h < 12) h += 12; if (modifier === 'am' && h === 12) h = 0; }
    if (h === 24) return '24:00';
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const parseMultiShifts = (text: string) => {
    if (!text) return [];
    const segments = text.trim().split(/[\/,]|\s+and\s+|&/i);
    const shifts: { start: string, end: string }[] = [];
    segments.forEach(seg => {
        const rangeParts = seg.trim().split(/\s*(?:[-–—]|\bto\b)\s*/i);
        if (rangeParts.length >= 2) {
            const s = convertTo24Hour(rangeParts[0].trim());
            const e = convertTo24Hour(rangeParts[rangeParts.length - 1].trim());
            if (s && e) shifts.push({ start: s, end: e });
        }
    });
    return shifts;
};

const SupervisorMarket: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [openShifts, setOpenShifts] = useState<OpenShift[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);

    const [newShiftDate, setNewShiftDate] = useState('');
    const [newShiftTime, setNewShiftTime] = useState('08:00 - 16:00');
    const [newShiftLocation, setNewShiftLocation] = useState('');

    useEffect(() => {
        const unsubLocs = onSnapshot(collection(db, 'locations'), snap => setLocations(snap.docs.map(d => ({id:d.id, ...d.data()} as Location))));
        const unsubUsers = onSnapshot(collection(db, 'users'), snap => setUsers(snap.docs.map(d => ({id:d.id, ...d.data()} as User))));
        const unsubShifts = onSnapshot(collection(db, 'openShifts'), snap => setOpenShifts(snap.docs.map(d => ({id:d.id, ...d.data()} as OpenShift))));
        return () => { unsubLocs(); unsubUsers(); unsubShifts(); };
    }, []);

    const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;

    const handlePostOpenShift = async () => {
        if (!newShiftDate || !newShiftLocation) return;
        try {
            await addDoc(collection(db, 'openShifts'), {
                date: newShiftDate,
                shiftTime: newShiftTime,
                locationId: newShiftLocation,
                status: 'open',
                createdBy: 'Admin',
                createdAt: Timestamp.now()
            });
            setToast({ msg: 'Shift Posted', type: 'success' });
            setNewShiftDate('');
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleDeleteShift = async (id: string) => {
        if(!confirm('Delete this shift?')) return;
        try {
            await deleteDoc(doc(db, 'openShifts', id));
            setToast({ msg: 'Shift Deleted', type: 'success' });
        } catch(e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleApproveClaim = async (shift: OpenShift) => {
        try {
            await updateDoc(doc(db, 'openShifts', shift.id), { status: 'approved' });
            if (shift.claimedBy && shift.date) {
               await addDoc(collection(db, 'schedules'), {
                   userId: shift.claimedBy,
                   locationId: shift.locationId, 
                   date: shift.date,
                   shifts: parseMultiShifts(shift.shiftTime),
                   note: 'Open Shift Claim',
                   month: shift.date.slice(0, 7),
                   userType: 'user',
                   createdAt: Timestamp.now()
               });
            }
            setToast({ msg: 'Claim Approved & Added to Schedule', type: 'success' });
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">{t('sup.tab.market')}</h1>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100 mb-8">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><i className="fas fa-plus-circle text-amber-500"></i> {t('sup.market.post')}</h3>
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-slate-400 block mb-1">Date</label>
                        <input type="date" className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold" value={newShiftDate} onChange={e => setNewShiftDate(e.target.value)} />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-slate-400 block mb-1">Time</label>
                        <input className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold" value={newShiftTime} onChange={e => setNewShiftTime(e.target.value)} placeholder="08:00 - 16:00" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs font-bold text-slate-400 block mb-1">Location</label>
                        <select className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold" value={newShiftLocation} onChange={e => setNewShiftLocation(e.target.value)}>
                            <option value="">Select...</option>
                            {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                        </select>
                    </div>
                    <button onClick={handlePostOpenShift} className="bg-amber-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-amber-600 shadow-lg transition-all">{t('add')}</button>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                {openShifts.map(shift => (
                    <div key={shift.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative group">
                        <button onClick={() => handleDeleteShift(shift.id)} className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash"></i></button>
                        <div className="flex justify-between items-start">
                            <div>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${shift.status === 'open' ? 'bg-emerald-100 text-emerald-600' : shift.status === 'claimed' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                                    {shift.status === 'claimed' ? t('sup.market.claimed') : shift.status}
                                </span>
                                <h4 className="font-bold text-slate-800 mt-2 text-lg">{shift.date}</h4>
                                <p className="text-sm text-slate-500 font-medium">{shift.shiftTime}</p>
                                <p className="text-xs text-indigo-500 font-bold mt-1 bg-indigo-50 px-2 py-0.5 rounded inline-block">{shift.locationId}</p>
                            </div>
                            {shift.status === 'claimed' && (
                                <div className="text-right">
                                    <p className="text-xs text-slate-400">Claimed By:</p>
                                    <p className="font-bold text-slate-700 text-sm mb-2">{getUserName(shift.claimedBy!)}</p>
                                    <button onClick={() => handleApproveClaim(shift)} className="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-600 shadow-md">
                                        {t('sup.market.approveClaim')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SupervisorMarket;