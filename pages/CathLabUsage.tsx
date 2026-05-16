import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, Timestamp, getDocs, getDoc } from 'firebase/firestore';
import { useDepartment } from '../contexts/DepartmentContext';
import { useLanguage } from '../contexts/LanguageContext';
import Toast from '../components/Toast';
import { PrintHeader, PrintFooter } from '../components/PrintLayout';

interface Supply {
    id: string;
    type: 'stent' | 'balloon' | 'doctor';
    name: string;
}

interface UsedSupply {
    name: string;
    size: string;
    count: number;
}

interface CathLabRecord {
    id: string;
    patientFileNumber: string;
    patientName: string;
    doctorName: string;
    date: string;
    procedureType?: string;
    stentType: string;
    stentCount?: number;
    balloonType: string;
    balloonCount?: number;
    usedDcbPrevial?: boolean;
    dcbPrevialCount?: number;
    stents?: UsedSupply[];
    balloons?: UsedSupply[];
    departmentId: string;
    createdAt: any;
    createdBy: string;
}

const CathLabUsage: React.FC = () => {
    const { selectedDepartmentId } = useDepartment();
    const { t } = useLanguage();
    const [supplies, setSupplies] = useState<Supply[]>([]);
    const [records, setRecords] = useState<CathLabRecord[]>([]);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

    const [activeTab, setActiveTab] = useState<'form' | 'report' | 'manage'>('form');

    // User State
    const [userRole, setUserRole] = useState('user');
    const [userName, setUserName] = useState('');

    useEffect(() => {
        const fetchUser = async () => {
            if (auth.currentUser) {
                const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
                if (snap.exists()) {
                    setUserRole(snap.data().role);
                    setUserName(snap.data().name || 'User');
                }
            }
        };
        fetchUser();
    }, []);

    // Management State
    const [newSupplyName, setNewSupplyName] = useState('');
    const [newSupplyType, setNewSupplyType] = useState<'stent' | 'balloon' | 'doctor'>('stent');

    // Form State
    const [patientFile, setPatientFile] = useState('');
    const [patientName, setPatientName] = useState('');
    const [doctorName, setDoctorName] = useState('');
    const [recordDate, setRecordDate] = useState(new Date().toISOString().split('T')[0]);
    const [procedureType, setProcedureType] = useState('CAG');
    const [useDcbPrevial, setUseDcbPrevial] = useState(false);
    const [dcbPrevialCount, setDcbPrevialCount] = useState<number|''>('');
    const [stentsList, setStentsList] = useState<{name: string, size: string, count: number|''}[]>([{name: '', size: '', count: ''}]);
    const [balloonsList, setBalloonsList] = useState<{name: string, size: string, count: number|''}[]>([{name: '', size: '', count: ''}]);

    // Report State
    const [reportStart, setReportStart] = useState(new Date().toISOString().split('T')[0]);
    const [reportEnd, setReportEnd] = useState(new Date().toISOString().split('T')[0]);
    const [reportMode, setReportMode] = useState<'records' | 'summary'>('records');
    const [reportProcedureType, setReportProcedureType] = useState('all');

    useEffect(() => {
        if (!selectedDepartmentId) return;

        const unsubSupplies = onSnapshot(query(collection(db, 'cath_lab_supplies')), (snap: any) => {
            setSupplies(snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as Supply)));
        });

        return () => {
            unsubSupplies();
        };
    }, [selectedDepartmentId]);

    useEffect(() => {
        if (!selectedDepartmentId || activeTab !== 'report') return;
        
        const fetchRecords = async () => {
            const q = query(
                collection(db, 'cath_lab_records'), 
                ... (selectedDepartmentId ? [where('departmentId', '==', selectedDepartmentId)] : []),
                where('date', '>=', reportStart),
                where('date', '<=', reportEnd)
            );
            const snap = await getDocs(q);
            let fetched = snap.docs.map((d: any) => ({ ...d.data(), id: d.id } as CathLabRecord));
            fetched.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setRecords(fetched);
        };
        fetchRecords();
    }, [selectedDepartmentId, reportStart, reportEnd, activeTab]);


    const handleAddSupply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSupplyName) return;
        try {
            await addDoc(collection(db, 'cath_lab_supplies'), {
                name: newSupplyName,
                type: newSupplyType,
            });
            setNewSupplyName('');
            setToast({ msg: t('cath.msgAdded'), type: 'success' });
        } catch (error) {
            setToast({ msg: t('cath.msgErr'), type: 'error' });
        }
    };

    const handleDeleteSupply = async (id: string) => {
        if (!window.confirm(t('cath.confirmDel'))) return;
        try {
            await deleteDoc(doc(db, 'cath_lab_supplies', id));
            setToast({ msg: t('cath.msgDeleted'), type: 'success' });
        } catch (error) {
            setToast({ msg: t('cath.msgErr'), type: 'error' });
        }
    };

    const handleAddRecord = async (e: React.FormEvent) => {
        e.preventDefault();
        const validStents = stentsList.filter(s => s.name);
        const validBalloons = balloonsList.filter(b => b.name);
        
        if (!patientFile || !patientName || !doctorName || (procedureType === 'CAG+PCI' && validStents.length === 0 && validBalloons.length === 0 && !useDcbPrevial)) {
            setToast({ msg: t('cath.msgReq'), type: 'error' });
            return;
        }
        try {
            await addDoc(collection(db, 'cath_lab_records'), {
                patientFileNumber: patientFile,
                patientName: patientName,
                doctorName: doctorName,
                date: recordDate,
                procedureType: procedureType,
                usedDcbPrevial: procedureType === 'CAG+PCI' ? useDcbPrevial : false,
                dcbPrevialCount: procedureType === 'CAG+PCI' && useDcbPrevial ? (Number(dcbPrevialCount) || 1) : 0,
                stents: procedureType === 'CAG+PCI' ? validStents.map(s => ({...s, count: Number(s.count) || 1})) : [],
                balloons: procedureType === 'CAG+PCI' ? validBalloons.map(b => ({...b, count: Number(b.count) || 1})) : [],
                stentType: procedureType === 'CAG+PCI' && validStents.length > 0 ? validStents.map(s => s.name).join(', ') : '',
                stentCount: procedureType === 'CAG+PCI' ? validStents.reduce((acc, curr) => acc + (Number(curr.count) || 1), 0) : 0,
                balloonType: procedureType === 'CAG+PCI' && validBalloons.length > 0 ? validBalloons.map(b => b.name).join(', ') : '',
                balloonCount: procedureType === 'CAG+PCI' ? validBalloons.reduce((acc, curr) => acc + (Number(curr.count) || 1), 0) : 0,
                departmentId: selectedDepartmentId,
                createdAt: Timestamp.now(),
                createdBy: userName
            });
            setPatientFile('');
            setPatientName('');
            setDoctorName('');
            setProcedureType('CAG');
            setUseDcbPrevial(false);
            setDcbPrevialCount('');
            setStentsList([{name: '', size: '', count: ''}]);
            setBalloonsList([{name: '', size: '', count: ''}]);
            setToast({ msg: t('cath.msgSaved'), type: 'success' });
        } catch (error) {
            setToast({ msg: t('cath.msgSaveErr'), type: 'error' });
        }
    };

    const handleDeleteRecord = async (id: string) => {
        if (!window.confirm(t('cath.confirmDel'))) return;
        try {
            await deleteDoc(doc(db, 'cath_lab_records', id));
            setRecords(records.filter(r => r.id !== id));
            setToast({ msg: t('cath.msgDeleted'), type: 'success' });
        } catch (error) {
            setToast({ msg: t('cath.msgErr'), type: 'error' });
        }
    };

    const isAdmin = userRole === 'admin' || userRole === 'supervisor';
    const stents = supplies.filter(s => s.type === 'stent');
    const balloons = supplies.filter(s => s.type === 'balloon');
    const doctors = supplies.filter(s => s.type === 'doctor');

    const filteredRecords = records.filter(r => reportProcedureType === 'all' || r.procedureType === reportProcedureType);

    const getSummaryData = () => {
        const summary: Record<string, {category: string, name: string, size: string, count: number}> = {};
        filteredRecords.forEach(r => {
            if (r.stents && r.stents.length > 0) {
                r.stents.forEach(s => {
                    const key = `stent_${s.name}_${s.size||'no-size'}`;
                    if (!summary[key]) summary[key] = { category: t('cath.typeStent'), name: s.name, size: s.size||'-', count: 0 };
                    summary[key].count += (Number(s.count) || 1);
                });
            } else if (r.stentType) {
                const types = r.stentType.split(', ');
                types.forEach(name => {
                    if(!name) return;
                    const key = `stent_${name}_old`;
                    if (!summary[key]) summary[key] = { category: t('cath.typeStent'), name: name, size: '-', count: 0 };
                    summary[key].count += types.length === 1 ? (r.stentCount || 1) : 1; 
                });
            }

            if (r.usedDcbPrevial) {
                const key = `stent_DCB_PREVIAL_no-size`;
                if (!summary[key]) summary[key] = { category: t('cath.typeStent'), name: 'DCB PREVIAL', size: '-', count: 0 };
                summary[key].count += (Number(r.dcbPrevialCount) || 1);
            }

            if (r.balloons && r.balloons.length > 0) {
                r.balloons.forEach(s => {
                    const key = `balloon_${s.name}_${s.size||'no-size'}`;
                    if (!summary[key]) summary[key] = { category: t('cath.typeBalloon'), name: s.name, size: s.size||'-', count: 0 };
                    summary[key].count += (Number(s.count) || 1);
                });
            } else if (r.balloonType) {
                const types = r.balloonType.split(', ');
                types.forEach(name => {
                    if(!name) return;
                    const key = `balloon_${name}_old`;
                    if (!summary[key]) summary[key] = { category: t('cath.typeBalloon'), name: name, size: '-', count: 0 };
                    summary[key].count += types.length === 1 ? (r.balloonCount || 1) : 1;
                });
            }
        });
        return Object.values(summary).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <style>
                {`
                @media print {
                    @page {
                        size: portrait;
                    }
                }
                `}
            </style>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex flex-wrap gap-2 mb-6 rtl:space-x-reverse print:hidden">
                <button onClick={() => setActiveTab('form')} className={`px-4 py-2 rounded-lg font-bold transition-colors ${activeTab === 'form' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-50 border'}`}>
                    {t('cath.tabForm')}
                </button>
                <button onClick={() => setActiveTab('report')} className={`px-4 py-2 rounded-lg font-bold transition-colors ${activeTab === 'report' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-50 border'}`}>
                    {t('cath.tabReport')}
                </button>
                {isAdmin && (
                    <button onClick={() => setActiveTab('manage')} className={`px-4 py-2 rounded-lg font-bold transition-colors ${activeTab === 'manage' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-50 border'}`}>
                        {t('cath.tabManage')}
                    </button>
                )}
            </div>

            {activeTab === 'form' && (
                <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 animate-fade-in-up">
                    <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                        <i className="fas fa-file-medical text-indigo-500"></i> {t('cath.titleForm')}
                    </h2>
                    <form onSubmit={handleAddRecord} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.fileId')}</label>
                                <input required type="text" className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={patientFile} onChange={e => setPatientFile(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.patientName')}</label>
                                <input required type="text" className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={patientName} onChange={e => setPatientName(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.doctorName')}</label>
                                <select required className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={doctorName} onChange={e => setDoctorName(e.target.value)}>
                                    <option value="">{t('cath.doctorNone')}</option>
                                    {doctors.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.date')}</label>
                                <input required type="date" className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={recordDate} onChange={e => setRecordDate(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.procedureType')}</label>
                                <select className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={procedureType} onChange={e => setProcedureType(e.target.value)}>
                                    <option value="CAG">CAG</option>
                                    <option value="CAG+PCI">CAG+PCI</option>
                                </select>
                            </div>
                            {procedureType === 'CAG+PCI' && (
                                <>
                                    <div className="md:col-span-2 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                                        <label className="flex items-center gap-3 text-sm font-bold text-indigo-900 cursor-pointer">
                                            <input type="checkbox" className="w-5 h-5 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500" checked={useDcbPrevial} onChange={e => setUseDcbPrevial(e.target.checked)} />
                                            {t('cath.typeStent')} DCB PREVIAL
                                        </label>
                                        {useDcbPrevial && (
                                            <div className="mt-3 ml-8">
                                                <input required type="number" min="1" placeholder={t('cath.count')} className="w-full md:w-32 border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={dcbPrevialCount} onChange={e => setDcbPrevialCount(e.target.value === '' ? '' : parseInt(e.target.value))} />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.stentType')}</label>
                                {stentsList.map((stent, index) => (
                                    <div key={index} className="flex flex-wrap md:flex-nowrap gap-2 mb-2">
                                        <select required={index === 0 && stentsList.length === 1 && balloonsList[0].name === '' && !useDcbPrevial} className="flex-1 w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={stent.name} onChange={e => { const newL = [...stentsList]; newL[index].name = e.target.value; setStentsList(newL); }}>
                                            <option value="">{t('cath.stentNone')}</option>
                                            {stents.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                        </select>
                                        <input type="text" placeholder={t('cath.sizeEx')} className="w-24 flex-none border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={stent.size} onChange={e => { const newL = [...stentsList]; newL[index].size = e.target.value; setStentsList(newL); }} />
                                        <input type="number" min="1" placeholder={t('cath.count')} className="w-20 flex-none border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={stent.count} onChange={e => { const newL = [...stentsList]; newL[index].count = e.target.value === '' ? '' : parseInt(e.target.value); setStentsList(newL); }} />
                                        {index > 0 && <button type="button" onClick={() => setStentsList(stentsList.filter((_, i) => i !== index))} className="text-red-500 px-3 hover:bg-red-50 rounded-lg"><i className="fas fa-trash"></i></button>}
                                    </div>
                                ))}
                                <button type="button" onClick={() => setStentsList([...stentsList, {name:'', size:'', count:''}])} className="text-indigo-600 text-sm font-bold mt-1 bg-indigo-50 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-colors"><i className="fas fa-plus"></i> {t('cath.addStent')}</button>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.balloonType')}</label>
                                {balloonsList.map((balloon, index) => (
                                    <div key={index} className="flex flex-wrap md:flex-nowrap gap-2 mb-2">
                                        <select className="flex-1 w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={balloon.name} onChange={e => { const newL = [...balloonsList]; newL[index].name = e.target.value; setBalloonsList(newL); }}>
                                            <option value="">{t('cath.balloonNone')}</option>
                                            {balloons.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                        </select>
                                        <input type="text" placeholder={t('cath.sizeEx')} className="w-24 flex-none border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={balloon.size} onChange={e => { const newL = [...balloonsList]; newL[index].size = e.target.value; setBalloonsList(newL); }} />
                                        <input type="number" min="1" placeholder={t('cath.count')} className="w-20 flex-none border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={balloon.count} onChange={e => { const newL = [...balloonsList]; newL[index].count = e.target.value === '' ? '' : parseInt(e.target.value); setBalloonsList(newL); }} />
                                        {index > 0 && <button type="button" onClick={() => setBalloonsList(balloonsList.filter((_, i) => i !== index))} className="text-red-500 px-3 hover:bg-red-50 rounded-lg"><i className="fas fa-trash"></i></button>}
                                    </div>
                                ))}
                                <button type="button" onClick={() => setBalloonsList([...balloonsList, {name:'', size:'', count:''}])} className="text-indigo-600 text-sm font-bold mt-1 bg-indigo-50 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-colors"><i className="fas fa-plus"></i> {t('cath.addBalloon')}</button>
                            </div>
                            </>
                            )}
                        </div>
                        <button type="submit" className="w-full md:w-auto bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-colors">
                            {t('cath.save')}
                        </button>
                    </form>
                </div>
            )}

            {activeTab === 'manage' && isAdmin && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-fade-in-up">
                    <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
                        <i className="fas fa-boxes text-emerald-500"></i> {t('cath.titleManage')}
                    </h2>
                    <form onSubmit={handleAddSupply} className="flex gap-4 items-end mb-8">
                        <div className="flex-1">
                            <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.manageName')}</label>
                            <input required type="text" className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500" value={newSupplyName} onChange={e => setNewSupplyName(e.target.value)} placeholder={t('cath.manageEx')} />
                        </div>
                        <div className="w-1/3">
                            <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.manageType')}</label>
                            <select className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500" value={newSupplyType} onChange={e => setNewSupplyType(e.target.value as 'stent'|'balloon'|'doctor')}>
                                <option value="stent">{t('cath.typeStent')}</option>
                                <option value="balloon">{t('cath.typeBalloon')}</option>
                                <option value="doctor">{t('cath.typeDoctor')}</option>
                            </select>
                        </div>
                        <button type="submit" className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-emerald-700">{t('cath.add')}</button>
                    </form>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div>
                            <h3 className="font-bold text-slate-700 mb-4 bg-slate-100 p-2 rounded-lg text-center">{t('cath.listStents')}</h3>
                            <ul className="space-y-2">
                                {stents.map(s => (
                                    <li key={s.id} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg bg-slate-50">
                                        <span className="font-bold">{s.name}</span>
                                        <button type="button" onClick={() => handleDeleteSupply(s.id)} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-700 mb-4 bg-slate-100 p-2 rounded-lg text-center">{t('cath.listBalloons')}</h3>
                            <ul className="space-y-2">
                                {balloons.map(s => (
                                    <li key={s.id} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg bg-slate-50">
                                        <span className="font-bold">{s.name}</span>
                                        <button type="button" onClick={() => handleDeleteSupply(s.id)} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-700 mb-4 bg-slate-100 p-2 rounded-lg text-center">{t('cath.listDoctors')}</h3>
                            <ul className="space-y-2">
                                {doctors.map(s => (
                                    <li key={s.id} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg bg-slate-50">
                                        <span className="font-bold">{s.name}</span>
                                        <button type="button" onClick={() => handleDeleteSupply(s.id)} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'report' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-fade-in-up">
                    <PrintHeader compact={true} useOldLogo={true} title={t('cath.repTitle')} subtitle={`${t('cath.repFrom')} ${reportStart} ${t('cath.repTo')} ${reportEnd}`} />
                    
                    <div className="flex justify-between items-center mb-6 print:hidden bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex bg-white rounded-lg p-1 border border-slate-300">
                                <button onClick={() => setReportMode('records')} className={`px-4 py-1.5 rounded-md text-sm font-bold ${reportMode === 'records' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>{t('cath.repModeRecords')}</button>
                                <button onClick={() => setReportMode('summary')} className={`px-4 py-1.5 rounded-md text-sm font-bold ${reportMode === 'summary' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>{t('cath.repModeSummary')}</button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cath.procedureType')}</label>
                                <select className="border border-slate-300 rounded-lg p-1.5 outline-none focus:ring-2 focus:ring-blue-500" value={reportProcedureType} onChange={e => setReportProcedureType(e.target.value)}>
                                    <option value="all">{t('cath.procAll')}</option>
                                    <option value="CAG">CAG</option>
                                    <option value="CAG+PCI">CAG+PCI</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cath.repFrom')}</label>
                                <input type="date" className="border border-slate-300 rounded-lg p-1.5 outline-none focus:ring-2 focus:ring-blue-500" value={reportStart} onChange={e => setReportStart(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cath.repTo')}</label>
                                <input type="date" className="border border-slate-300 rounded-lg p-1.5 outline-none focus:ring-2 focus:ring-blue-500" value={reportEnd} onChange={e => setReportEnd(e.target.value)} />
                            </div>
                        </div>
                        <button onClick={() => window.print()} className="bg-slate-800 text-white px-6 py-2 rounded-xl font-bold hover:bg-slate-700 flex items-center gap-2">
                            <i className="fas fa-print"></i> {t('cath.repPrint')}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        {reportMode === 'records' ? (
                        <table className="w-full text-sm rtl:text-right ltr:text-left">
                            <thead className="bg-slate-100 text-slate-600 border-y-2 border-slate-800 print:text-black">
                                <tr>
                                    <th className="p-3">{t('cath.date')}</th>
                                    <th className="p-3">{t('cath.procedureType')}</th>
                                    <th className="p-3">{t('cath.fileId')}</th>
                                    <th className="p-3">{t('cath.patientName')}</th>
                                    <th className="p-3">{t('cath.stentType')}</th>
                                    <th className="p-3">{t('cath.balloonType')}</th>
                                    <th className="p-3">{t('cath.doctorName')}</th>
                                    <th className="p-3 print:hidden">{t('cath.by')}</th>
                                    {isAdmin && <th className="p-3 print:hidden"></th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 print:divide-slate-400 print:text-black">
                                {filteredRecords.length === 0 ? (
                                    <tr>
                                        <td colSpan={isAdmin ? 9 : 8} className="p-8 text-center text-slate-500 font-bold">{t('cath.repEmpty')}</td>
                                    </tr>
                                ) : (
                                    filteredRecords.map(r => (
                                        <tr key={r.id}>
                                            <td className="p-3">{r.date}</td>
                                            <td className="p-3 font-bold text-indigo-600">{r.procedureType || 'CAG+PCI'}</td>
                                            <td className="p-3 font-mono">{r.patientFileNumber}</td>
                                            <td className="p-3 font-bold text-slate-800 print:text-black">{r.patientName}</td>
                                            <td className="p-3">
                                                {r.usedDcbPrevial && <div className="font-bold text-indigo-700">DCB PREVIAL (x{r.dcbPrevialCount})</div>}
                                                {r.stents && r.stents.length > 0 ? (
                                                    r.stents.map((s, i) => <div key={i}>{s.name} {s.size ? `[${s.size}]` : ''} (x{s.count})</div>)
                                                ) : (
                                                    r.stentType ? `${r.stentType} ${r.stentCount && r.stentCount > 0 ? `(x${r.stentCount})` : ''}` : (!r.usedDcbPrevial ? '-' : null)
                                                )}
                                            </td>
                                            <td className="p-3">
                                                {r.balloons && r.balloons.length > 0 ? (
                                                    r.balloons.map((s, i) => <div key={i}>{s.name} {s.size ? `[${s.size}]` : ''} (x{s.count})</div>)
                                                ) : (
                                                    r.balloonType ? `${r.balloonType} ${r.balloonCount && r.balloonCount > 0 ? `(x${r.balloonCount})` : ''}` : '-'
                                                )}
                                            </td>
                                            <td className="p-3">{r.doctorName}</td>
                                            <td className="p-3 print:hidden text-xs text-slate-500">{r.createdBy}</td>
                                            {isAdmin && (
                                                <td className="p-3 print:hidden text-left">
                                                    <button type="button" onClick={() => handleDeleteRecord(r.id)} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        ) : (
                        <table className="w-full text-sm rtl:text-right ltr:text-left">
                            <thead className="bg-slate-100 text-slate-600 border-y-2 border-slate-800 print:text-black">
                                <tr>
                                    <th className="p-3">{t('cath.summaryType')}</th>
                                    <th className="p-3">{t('cath.summaryName')}</th>
                                    <th className="p-3">{t('cath.summarySize')}</th>
                                    <th className="p-3 text-center w-32">{t('cath.summaryCount')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 print:divide-slate-400 print:text-black">
                                {getSummaryData().length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-slate-500 font-bold">{t('cath.repEmpty')}</td>
                                    </tr>
                                ) : (
                                    getSummaryData().map((s, idx) => (
                                        <tr key={idx}>
                                            <td className="p-3 font-bold text-slate-700 whitespace-nowrap">{s.category}</td>
                                            <td className="p-3 font-medium">{s.name}</td>
                                            <td className="p-3 text-slate-600 font-mono">{s.size}</td>
                                            <td className="p-3 font-bold text-lg text-indigo-600 bg-indigo-50 text-center">{s.count}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        )}
                    </div>
                    <PrintFooter />
                </div>
            )}
        </div>
    );
};

export default CathLabUsage;
