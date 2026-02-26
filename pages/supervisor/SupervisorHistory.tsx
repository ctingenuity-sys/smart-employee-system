
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { SwapRequest, LeaveRequest, User } from '../../types';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { PrintHeader, PrintFooter } from '../../components/PrintLayout';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

interface HistoryItem {
    id: string;
    type: 'swap' | 'leave';
    userId: string; 
    targetId?: string; 
    startDate: string;
    endDate?: string;
    details: string;
    status: string;
    createdAt: any;
}

const SupervisorHistory: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [historyData, setHistoryData] = useState<HistoryItem[]>(() => {
        const cached = localStorage.getItem('usr_cached_sup_hist');
        return cached ? JSON.parse(cached) : [];
    });
    const [users, setUsers] = useState<User[]>(() => {
        const cached = localStorage.getItem('usr_cached_sup_users');
        return cached ? JSON.parse(cached) : [];
    });
    const [histFilterType, setHistFilterType] = useState<'all' | 'swap' | 'leave'>('all');
    const [histFilterMonth, setHistFilterMonth] = useState(new Date().toISOString().slice(0, 7));
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        localStorage.setItem('usr_cached_sup_hist', JSON.stringify(historyData));
    }, [historyData]);

    useEffect(() => {
        localStorage.setItem('usr_cached_sup_users', JSON.stringify(users));
    }, [users]);

    useEffect(() => {
        getDocs(collection(db, 'users')).then(snap => setUsers(snap.docs.map(d => ({id:d.id, ...d.data()} as User))));
        
        const qSwaps = query(collection(db, 'swapRequests'), where('status', 'in', ['approvedBySupervisor', 'rejectedBySupervisor', 'rejected']));
        getDocs(qSwaps).then(snap => {
            const swaps = snap.docs.map(d => ({
                id: d.id, type: 'swap', userId: d.data().from, targetId: d.data().to, startDate: d.data().startDate, details: d.data().details, status: d.data().status, createdAt: d.data().createdAt
            } as HistoryItem));
            setHistoryData(prev => [...prev.filter(i => i.type !== 'swap'), ...swaps]);
        });

        const qLeaves = query(collection(db, 'leaveRequests'), where('status', 'in', ['approved', 'rejected']));
        getDocs(qLeaves).then(snap => {
            const leaves = snap.docs.map(d => ({
                id: d.id, type: 'leave', userId: d.data().from, startDate: d.data().startDate, endDate: d.data().endDate, details: d.data().reason, status: d.data().status, createdAt: d.data().createdAt
            } as HistoryItem));
            setHistoryData(prev => [...prev.filter(i => i.type !== 'leave'), ...leaves]);
        });
    }, [refreshTrigger]);

    const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;

    const handleDelete = async (item: HistoryItem) => {
        if(!confirm('Delete record?')) return;
        try {
            await deleteDoc(doc(db, item.type === 'swap' ? 'swapRequests' : 'leaveRequests', item.id));
            setHistoryData(prev => prev.filter(i => i.id !== item.id));
            setToast({ msg: 'Deleted', type: 'success' });
        } catch(e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const filteredData = useMemo(() => {
        return historyData.filter(item => {
            if (histFilterType !== 'all' && item.type !== histFilterType) return false;
            if (histFilterMonth && !item.startDate?.startsWith(histFilterMonth)) return false;
            return true;
        }).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }, [historyData, histFilterType, histFilterMonth]);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in print:p-0 print:max-w-none" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <PrintHeader title="Request History Report" month={histFilterMonth} subtitle="Processed Requests" themeColor="indigo" />

            <div className="flex items-center gap-4 mb-8 print:hidden">
                <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">Request History</h1>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:border-2 print:border-slate-800 print:shadow-none print:rounded-none">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-4 items-center print:hidden">
                    <select className="bg-white border-none rounded-lg text-xs font-bold p-2" value={histFilterType} onChange={e => setHistFilterType(e.target.value as any)}>
                        <option value="all">All Types</option>
                        <option value="swap">Swaps</option>
                        <option value="leave">Leaves</option>
                    </select>
                    <input type="month" className="bg-white border-none rounded-lg text-xs font-bold p-2" value={histFilterMonth} onChange={e => setHistFilterMonth(e.target.value)} />
                    <button onClick={() => window.print()} className="ml-auto bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 flex items-center gap-2">
                        <i className="fas fa-print"></i> Print Report
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold print:bg-white print:border-b-2 print:border-slate-800 print:text-black">
                            <tr>
                                <th className="p-4 print:p-2">Type</th>
                                <th className="p-4 print:p-2">User</th>
                                <th className="p-4 print:p-2">Details</th>
                                <th className="p-4 print:p-2">Date</th>
                                <th className="p-4 print:p-2">Status</th>
                                <th className="p-4 w-10 print:hidden"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                            {filteredData.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50 print:break-inside-avoid">
                                    <td className="p-4 print:p-2">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase border ${item.type === 'swap' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-rose-50 text-rose-600 border-rose-100'} print:border-0 print:bg-transparent print:text-black print:p-0`}>
                                            {item.type}
                                        </span>
                                    </td>
                                    <td className="p-4 font-bold text-slate-700 print:p-2 print:text-black">{getUserName(item.userId)}</td>
                                    <td className="p-4 text-slate-600 text-xs print:p-2 print:text-black">{item.details} {item.type === 'swap' && `→ ${getUserName(item.targetId!)}`}</td>
                                    <td className="p-4 font-mono text-xs text-slate-500 print:p-2 print:text-black">{item.startDate} {item.endDate ? `- ${item.endDate}` : ''}</td>
                                    <td className="p-4 print:p-2">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${item.status.includes('approved') ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'} print:bg-transparent print:text-black print:border print:border-black`}>
                                            {item.status.replace(/BySupervisor|ByUser/, '')}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center print:hidden">
                                        <button onClick={() => handleDelete(item)} className="text-slate-300 hover:text-red-500"><i className="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <PrintFooter themeColor="indigo" />
        </div>
    );
};

export default SupervisorHistory;
