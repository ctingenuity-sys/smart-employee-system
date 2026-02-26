import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, query, where, onSnapshot, getDoc, doc, getDocs } from 'firebase/firestore';
import { SwapRequest, LeaveRequest } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

interface UnifiedHistoryItem {
    id: string;
    rawType: 'swap' | 'leave';
    displayType: string;
    date: string;
    details: string;
    status: string;
    createdAt: any;
    isOutgoing?: boolean;
}

const UserHistory: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    
    const [sentHistory, setSentHistory] = useState<any[]>([]);
    const [receivedHistory, setReceivedHistory] = useState<any[]>([]);
    const [leaveHistory, setLeaveHistory] = useState<any[]>([]);
    
    const [histFilterType, setHistFilterType] = useState<'all' | 'swap' | 'leave'>('all');
    const [histFilterStatus, setHistFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        if (!currentUserId) return;

        // Sent Swaps
        const qSent = query(collection(db, 'swapRequests'), where('from', '==', currentUserId));
        getDocs(qSent).then(async (snap) => {
            const list = await Promise.all(snap.docs.map(async d => { 
                const data = d.data() as SwapRequest; 
                // Fetch recipient name
                let name = "Unknown";
                try {
                    const uDoc = await getDoc(doc(db, 'users', data.to));
                    if(uDoc.exists()) name = uDoc.data().name;
                } catch(e){}
                return { id: d.id, ...data, isOutgoing: true, otherUserName: name }; 
            }));
            setSentHistory(list);
        });

        // Received Swaps (Not pending)
        const qReceived = query(collection(db, 'swapRequests'), where('to', '==', currentUserId));
        getDocs(qReceived).then(async (snap) => {
            const list = await Promise.all(snap.docs.filter(d => d.data().status !== 'pending').map(async d => { 
                const data = d.data() as SwapRequest; 
                let name = "Unknown";
                try {
                    const uDoc = await getDoc(doc(db, 'users', data.from));
                    if(uDoc.exists()) name = uDoc.data().name;
                } catch(e){}
                return { id: d.id, ...data, isOutgoing: false, otherUserName: name }; 
            }));
            setReceivedHistory(list);
        });

        // Leaves
        const qLeaves = query(collection(db, 'leaveRequests'), where('from', '==', currentUserId));
        getDocs(qLeaves).then((snap) => {
            setLeaveHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)).reverse());
        });

    }, [currentUserId, refreshTrigger]);

    const filteredHistory = useMemo(() => {
        const swaps: UnifiedHistoryItem[] = [...sentHistory, ...receivedHistory].map(s => ({
            id: s.id,
            rawType: 'swap',
            displayType: s.type,
            date: s.startDate || '',
            details: `${s.isOutgoing ? t('user.req.to') : t('user.req.from')}: ${s.otherUserName} ${s.details ? `(${s.details})` : ''}`,
            status: s.status,
            createdAt: s.createdAt,
            isOutgoing: s.isOutgoing
        }));
        const leaves: UnifiedHistoryItem[] = leaveHistory.map(l => ({
            id: l.id,
            rawType: 'leave',
            displayType: 'Leave',
            date: `${l.startDate} > ${l.endDate}`,
            details: l.reason,
            status: l.status,
            createdAt: l.createdAt
        }));
        let combined = [...swaps, ...leaves];
        combined.sort((a, b) => {
            const ta = a.createdAt?.seconds || 0;
            const tb = b.createdAt?.seconds || 0;
            return tb - ta;
        });
        return combined.filter(item => {
            if (histFilterType !== 'all' && item.rawType !== histFilterType) return false;
            if (histFilterStatus !== 'all') {
                const s = (item.status || '').toLowerCase();
                if (histFilterStatus === 'approved' && !s.includes('approved')) return false;
                if (histFilterStatus === 'rejected' && !s.includes('rejected')) return false;
                if (histFilterStatus === 'pending' && s !== 'pending' && s !== 'approvedbyuser') return false;
            }
            return true;
        });
    }, [sentHistory, receivedHistory, leaveHistory, histFilterType, histFilterStatus, t]);

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                    <i className="fas fa-arrow-left rtl:rotate-180"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-800">{t('user.tab.history')}</h1>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase">Filter By:</span>
                        <select className="bg-white border-none rounded-lg text-xs font-bold text-slate-600 py-1.5 focus:ring-0" value={histFilterType} onChange={e => setHistFilterType(e.target.value as any)}>
                            <option value="all">All Types</option>
                            <option value="swap">Swaps</option>
                            <option value="leave">Leaves</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <select className="bg-white border-none rounded-lg text-xs font-bold text-slate-600 py-1.5 focus:ring-0" value={histFilterStatus} onChange={e => setHistFilterStatus(e.target.value as any)}>
                            <option value="all">All Status</option>
                            <option value="approved">Approved</option>
                            <option value="pending">Pending</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-slate-500 font-bold border-b border-slate-100">
                            <tr>
                                <th className="p-4 w-10"></th>
                                <th className="p-4">{t('user.req.type')}</th>
                                <th className="p-4">{t('details')}</th>
                                <th className="p-4">{t('date')}</th>
                                <th className="p-4 text-center">{t('status')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredHistory.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-4 text-center">
                                        <div className={`w-2 h-2 rounded-full ${item.status.includes('approved') ? 'bg-emerald-500' : item.status.includes('rejected') ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${item.rawType === 'swap' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                                            {item.rawType === 'swap' ? (item.isOutgoing ? 'Sent Swap' : 'Received Swap') : 'Leave'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-slate-600 font-medium">
                                        {item.details}
                                    </td>
                                    <td className="p-4 font-mono text-xs text-slate-500">
                                        {item.date}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                                            item.status.includes('approved') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                            item.status.includes('rejected') ? 'bg-red-50 text-red-600 border-red-100' : 
                                            'bg-amber-50 text-amber-600 border-amber-100'
                                        }`}>
                                            {item.status === 'approvedByUser' ? 'Waiting Supervisor' : item.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UserHistory;