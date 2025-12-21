
import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { User, ActionLog } from '../types';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import { PrintHeader, PrintFooter } from '../components/PrintLayout';
// @ts-ignore
import { collection, getDocs, addDoc, deleteDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';

// --- Configuration ---
const POINTS_PER_MONTH = 120;

const Reports: React.FC = () => {
    const { t, dir } = useLanguage();
    // --- State ---
    const [employees, setEmployees] = useState<User[]>([]);
    const [actions, setActions] = useState<ActionLog[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterEmp, setFilterEmp] = useState('');
    const [filterMonth, setFilterMonth] = useState((new Date().getMonth() + 1).toString());
    const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
    const [filterFromDate, setFilterFromDate] = useState('');
    const [filterToDate, setFilterToDate] = useState('');

    // Add/Edit Form State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        employeeId: '',
        type: 'late',
        fromDate: new Date().toISOString().split('T')[0],
        toDate: new Date().toISOString().split('T')[0],
        description: ''
    });

    // We define action weights here, mapped to translation keys
    const ACTION_WEIGHTS: Record<string, number> = {
        'annual_leave': 0, 
        'sick_leave': 1, 
        'justified_absence': 2, 
        'unjustified_absence': 10,
        'late': 3, 
        'mission': 0, 
        'violation': 10,
        'positive': -5
    };

    // --- Initial Load ---
    useEffect(() => {
        const init = async () => {
            try {
                const [uSnap, aSnap] = await Promise.all([
                    getDocs(collection(db, 'users')),
                    getDocs(collection(db, 'actions'))
                ]);
                setEmployees(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
                setActions(aSnap.docs.map(d => ({ id: d.id, ...d.data() } as ActionLog)));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    // --- Helpers ---
    const getMonthCount = () => {
        if (filterFromDate && filterToDate) {
            const start = new Date(filterFromDate);
            const end = new Date(filterToDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
            return Math.max(1, Math.round(diffDays / 30)); 
        }
        if (filterYear && !filterMonth) return 12;
        return 1;
    };

    const getDateRange = () => {
        let start = filterFromDate;
        let end = filterToDate;

        if (!start && !end) {
            if (filterYear && filterMonth) {
                const y = parseInt(filterYear);
                const m = parseInt(filterMonth);
                const firstDay = new Date(y, m - 1, 1);
                const lastDay = new Date(y, m, 0);
                start = firstDay.toISOString().split('T')[0];
                end = lastDay.toISOString().split('T')[0];
            } else if (filterYear) {
                start = `${filterYear}-01-01`;
                end = `${filterYear}-12-31`;
            }
        }
        return { start, end };
    };

    // --- Computed Data ---
    const filteredActions = useMemo(() => {
        const { start, end } = getDateRange();
        
        return actions.filter(act => {
            if (filterEmp && act.employeeId !== filterEmp) return false;
            if (start && act.toDate < start) return false;
            if (end && act.fromDate > end) return false;
            return true;
        }).sort((a, b) => new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime());
    }, [actions, filterEmp, filterMonth, filterYear, filterFromDate, filterToDate]);

    const evaluation = useMemo(() => {
        if (!filterEmp) return null;

        const months = getMonthCount();
        const maxScore = months * POINTS_PER_MONTH;
        
        let totalDeductions = 0;
        
        filteredActions.forEach(act => {
            const weight = ACTION_WEIGHTS[act.type] || 0;
            const s = new Date(act.fromDate);
            const e = new Date(act.toDate);
            const diff = Math.abs(e.getTime() - s.getTime());
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1; 
            
            totalDeductions += (weight * days);
        });

        const finalScore = Math.min(maxScore, Math.max(0, maxScore - totalDeductions));
        const percentage = Math.round((finalScore / maxScore) * 100);

        let grade = t('grade.excellent');
        let color = 'text-emerald-500 stroke-emerald-500';
        let bg = 'bg-emerald-50';
        
        if (percentage < 50) { grade = t('grade.weak'); color = 'text-red-500 stroke-red-500'; bg = 'bg-red-50'; }
        else if (percentage < 70) { grade = t('grade.acceptable'); color = 'text-orange-500 stroke-orange-500'; bg = 'bg-orange-50'; }
        else if (percentage < 85) { grade = t('grade.vgood'); color = 'text-blue-500 stroke-blue-500'; bg = 'bg-blue-50'; }

        return {
            months,
            maxScore,
            totalDeductions,
            finalScore,
            percentage,
            grade,
            color,
            bg
        };
    }, [filteredActions, filterEmp, filterMonth, filterYear, filterFromDate, filterToDate, t]);

    // --- Handlers ---
    const handleSubmit = async () => {
        if (!formData.employeeId || !formData.type) return alert('Missing Data');
        const payload = { ...formData, createdAt: new Date() };
        try {
            if (editingId) {
                await updateDoc(doc(db, 'actions', editingId), payload);
                setActions(prev => prev.map(a => a.id === editingId ? { ...a, ...payload } : a));
            } else {
                const ref = await addDoc(collection(db, 'actions'), payload);
                setActions(prev => [{ id: ref.id, ...payload } as any, ...prev]);
            }
            setIsFormOpen(false);
            setEditingId(null);
            setFormData({ ...formData, description: '', type: 'late' });
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (id: string) => {
        if (confirm(t('confirm') + '?')) {
            await deleteDoc(doc(db, 'actions', id));
            setActions(prev => prev.filter(a => a.id !== id));
        }
    };

    const handleEdit = (act: ActionLog) => {
        setFormData({
            employeeId: act.employeeId,
            type: act.type,
            fromDate: act.fromDate,
            toDate: act.toDate,
            description: act.description
        });
        setEditingId(act.id);
        setIsFormOpen(true);
    };

    const handlePrint = () => {
        // Ensure browser print dialog opens
        window.print();
    };

    if (loading) return <Loading />;

    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = evaluation ? circumference - (evaluation.percentage / 100) * circumference : 0;

    // Determine print header details
    const selectedEmployeeName = filterEmp ? employees.find(e => e.id === filterEmp)?.name : "All Staff";
    const dateTitle = filterFromDate && filterToDate ? `${filterFromDate} - ${filterToDate}` : `${filterYear}-${filterMonth.padStart(2, '0')}`;

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-12 print:bg-white print:p-0 print:pb-0" dir={dir}>
            
            {/* Generic Print Header for Reports */}
            <PrintHeader 
                title={t('rep.title')} 
                subtitle={`EVALUATION REPORT: ${selectedEmployeeName}`} 
                month={dateTitle} 
            />

            {/* Header (Hidden in Print) */}
            <div className="bg-slate-900 text-white pt-8 pb-16 px-6 print:hidden">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight">{t('rep.title')}</h1>
                        <p className="text-slate-400 mt-2">{t('rep.subtitle')} ({POINTS_PER_MONTH} pts/mo)</p>
                    </div>
                    <button 
                        onClick={() => { setEditingId(null); setIsFormOpen(true); }}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center gap-2"
                    >
                        <i className="fas fa-plus-circle"></i> {t('rep.add')}
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 -mt-10 print:mt-0 print:px-0">
                
                {/* Filters Bar */}
                <div className="bg-white rounded-2xl shadow-lg p-4 mb-8 flex flex-wrap gap-4 items-center border border-gray-100 print:hidden">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold text-gray-400 mb-1">{t('rep.filter.emp')}</label>
                        <select className="w-full bg-slate-50 border-none rounded-lg font-bold text-slate-700 focus:ring-2 focus:ring-blue-200" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
                            <option value="">-- All --</option>
                            {employees.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                        </select>
                    </div>
                    
                    <div className="w-[120px]">
                        <label className="block text-xs font-bold text-gray-400 mb-1">{t('month')}</label>
                        <select className="w-full bg-slate-50 border-none rounded-lg font-bold text-slate-700" value={filterMonth} onChange={e => {setFilterMonth(e.target.value); setFilterFromDate(''); setFilterToDate('');}}>
                            <option value="">All</option>
                            {[...Array(12)].map((_, i) => <option key={i} value={i+1}>{i+1}</option>)}
                        </select>
                    </div>

                    <div className="w-[120px]">
                        <label className="block text-xs font-bold text-gray-400 mb-1">{t('year')}</label>
                        <select className="w-full bg-slate-50 border-none rounded-lg font-bold text-slate-700" value={filterYear} onChange={e => {setFilterYear(e.target.value); setFilterFromDate(''); setFilterToDate('');}}>
                            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    <div className="flex-1 min-w-[200px] rtl:border-l ltr:border-r border-gray-100 rtl:pl-4 ltr:pr-4 rtl:ml-2 ltr:mr-2">
                        <label className="block text-xs font-bold text-gray-400 mb-1">{t('rep.filter.custom')}</label>
                        <div className="flex gap-2">
                            <input type="date" className="w-full bg-slate-50 border-none rounded-lg text-xs" value={filterFromDate} onChange={e => setFilterFromDate(e.target.value)} />
                            <input type="date" className="w-full bg-slate-50 border-none rounded-lg text-xs" value={filterToDate} onChange={e => setFilterToDate(e.target.value)} />
                        </div>
                    </div>

                    <button onClick={handlePrint} className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center">
                        <i className="fas fa-print"></i>
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:block">
                    
                    {/* LEFT: Evaluation Card */}
                    <div className="lg:col-span-1 print:mb-6 print:break-inside-avoid">
                        {evaluation ? (
                            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 sticky top-4 print:border-2 print:border-slate-800 print:shadow-none">
                                <div className={`p-6 text-center ${evaluation.bg} border-b border-gray-100 print:bg-white print:border-b-2 print:border-slate-800`}>
                                    <h2 className="text-xl font-bold text-slate-800 mb-4 uppercase">{t('rep.card')}</h2>
                                    
                                    <div className="relative w-48 h-48 mx-auto mb-4">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle cx="96" cy="96" r={radius} className="text-gray-200 fill-none stroke-current" strokeWidth="12" />
                                            <circle cx="96" cy="96" r={radius} className={`${evaluation.color} fill-none transition-all duration-1000 ease-out`} strokeWidth="12" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                                        </svg>
                                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                                            <span className={`text-4xl font-black ${evaluation.color.split(' ')[0]}`}>{evaluation.percentage}%</span>
                                            <span className="block text-xs font-bold text-gray-400 mt-1 uppercase">{evaluation.grade}</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-center gap-2 mb-2">
                                        <span className="bg-white border px-3 py-1 rounded-full text-xs font-bold shadow-sm text-slate-600">
                                            {evaluation.months} {t('month')}
                                        </span>
                                        <span className="bg-white border px-3 py-1 rounded-full text-xs font-bold shadow-sm text-slate-600">
                                            {filteredActions.length} Actions
                                        </span>
                                    </div>
                                </div>

                                <div className="p-6 space-y-4">
                                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center print:bg-transparent print:text-black print:border"><i className="fas fa-star"></i></div>
                                            <span className="text-sm font-bold text-gray-600 uppercase">{t('rep.base')}</span>
                                        </div>
                                        <span className="font-bold text-lg text-slate-800">{evaluation.maxScore}</span>
                                    </div>

                                    <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center print:bg-transparent print:text-black print:border"><i className="fas fa-minus-circle"></i></div>
                                            <span className="text-sm font-bold text-gray-600 uppercase">{t('rep.deduct')}</span>
                                        </div>
                                        <span className="font-bold text-lg text-red-600">-{evaluation.totalDeductions}</span>
                                    </div>

                                    <div className="border-t-2 border-dashed border-gray-300 pt-4 mt-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-lg font-black text-slate-800 uppercase">{t('rep.net')}</span>
                                            <span className={`text-2xl font-black ${evaluation.color.split(' ')[0]}`}>{evaluation.finalScore}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-3xl p-8 text-center border-2 border-dashed border-gray-200 print:hidden">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                    <i className="fas fa-chart-pie text-4xl"></i>
                                </div>
                                <h3 className="text-lg font-bold text-slate-600">Select Employee</h3>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Actions List */}
                    <div className="lg:col-span-2 space-y-6 print:w-full">
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden print:border-2 print:border-slate-800 print:shadow-none print:rounded-lg">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 print:bg-white print:border-b-2 print:border-slate-800">
                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 uppercase">
                                    <i className="fas fa-history text-blue-500 print:hidden"></i> {t('rep.log')}
                                </h3>
                                <span className="text-xs font-bold bg-white px-2 py-1 rounded border text-gray-500">{filteredActions.length}</span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className={`w-full text-sm ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                    <thead className="bg-gray-50 text-gray-500 font-medium print:bg-white print:text-black print:border-b-2 print:border-slate-800">
                                        <tr>
                                            <th className="p-4">{t('rep.filter.emp')}</th>
                                            <th className="p-4">{t('req.type')}</th>
                                            <th className="p-4">{t('date')}</th>
                                            <th className="p-4">Points</th>
                                            <th className="p-4 print:hidden">{t('actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 print:divide-slate-300">
                                        {filteredActions.length === 0 ? (
                                            <tr><td colSpan={5} className="p-8 text-center text-slate-400">---</td></tr>
                                        ) : filteredActions.map(act => {
                                            const weight = ACTION_WEIGHTS[act.type];
                                            const isPositive = weight < 0;
                                            return (
                                                <tr key={act.id} className="hover:bg-slate-50 transition-colors group print:hover:bg-transparent">
                                                    <td className="p-4 border-r print:border-slate-300">
                                                        <div className="font-bold text-slate-700">{employees.find(e => e.id === act.employeeId)?.name || 'Unknown'}</div>
                                                        <div className="text-xs text-slate-400 print:text-slate-600">{act.description}</div>
                                                    </td>
                                                    <td className="p-4 border-r print:border-slate-300">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold border ${isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'} print:border-none print:bg-transparent print:text-black print:p-0`}>
                                                            {t(`action.${act.type}`)}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-xs font-mono text-slate-600 border-r print:border-slate-300">
                                                        {act.fromDate} 
                                                        {act.fromDate !== act.toDate && <><br/><i className="fas fa-arrow-down text-[10px] my-1 opacity-50 print:hidden"></i><span className="hidden print:inline"> - </span><br/>{act.toDate}</>}
                                                    </td>
                                                    <td className="p-4 font-bold border-r print:border-slate-300">
                                                        {isPositive ? (
                                                            <span className="text-emerald-500">+{Math.abs(weight)}</span>
                                                        ) : (
                                                            <span className="text-red-500">-{weight}</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 print:hidden">
                                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => handleEdit(act)} className="w-8 h-8 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"><i className="fas fa-pen text-xs"></i></button>
                                                            <button onClick={() => handleDelete(act.id)} className="w-8 h-8 rounded bg-red-50 text-red-600 hover:bg-red-100"><i className="fas fa-trash text-xs"></i></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <PrintFooter />

            {/* Modal for Adding/Editing */}
            <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editingId ? t('edit') : t('add')}>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">{t('rep.filter.emp')}</label>
                        <select 
                            className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-100"
                            value={formData.employeeId}
                            onChange={e => setFormData({...formData, employeeId: e.target.value})}
                            disabled={!!filterEmp && !editingId} 
                        >
                            <option value="">Select...</option>
                            {employees.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">{t('from')}</label>
                            <input type="date" className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-sm" value={formData.fromDate} onChange={e => setFormData({...formData, fromDate: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">{t('to')}</label>
                            <input type="date" className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-sm" value={formData.toDate} onChange={e => setFormData({...formData, toDate: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">{t('req.type')}</label>
                        <select 
                            className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-100"
                            value={formData.type}
                            onChange={e => setFormData({...formData, type: e.target.value})}
                        >
                            {Object.entries(ACTION_WEIGHTS).map(([k, weight]) => (
                                <option key={k} value={k}>{t(`action.${k}`)} ({weight > 0 ? `-${weight}` : `+${Math.abs(weight)}`})</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">{t('notes')}</label>
                        <textarea 
                            className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-100 min-h-[80px]"
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                        ></textarea>
                    </div>

                    <button onClick={handleSubmit} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg">
                        {t('save')}
                    </button>
                </div>
            </Modal>

        </div>
    );
}

export default Reports;
