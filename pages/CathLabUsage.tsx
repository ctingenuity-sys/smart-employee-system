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

interface CathLabRecord {
    id: string;
    patientFileNumber: string;
    patientName: string;
    doctorName: string;
    date: string;
    stentType: string;
    balloonType: string;
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
    const [selectedStent, setSelectedStent] = useState('');
    const [selectedBalloon, setSelectedBalloon] = useState('');

    // Report State
    const [reportStart, setReportStart] = useState(new Date().toISOString().split('T')[0]);
    const [reportEnd, setReportEnd] = useState(new Date().toISOString().split('T')[0]);

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
        if (!patientFile || !patientName || !doctorName || (!selectedStent && !selectedBalloon)) {
            setToast({ msg: t('cath.msgReq'), type: 'error' });
            return;
        }
        try {
            await addDoc(collection(db, 'cath_lab_records'), {
                patientFileNumber: patientFile,
                patientName: patientName,
                doctorName: doctorName,
                date: recordDate,
                stentType: selectedStent,
                balloonType: selectedBalloon,
                departmentId: selectedDepartmentId,
                createdAt: Timestamp.now(),
                createdBy: userName
            });
            setPatientFile('');
            setPatientName('');
            setDoctorName('');
            setSelectedStent('');
            setSelectedBalloon('');
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
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.stentType')}</label>
                                <select className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={selectedStent} onChange={e => setSelectedStent(e.target.value)}>
                                    <option value="">{t('cath.stentNone')}</option>
                                    {stents.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">{t('cath.balloonType')}</label>
                                <select className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500" value={selectedBalloon} onChange={e => setSelectedBalloon(e.target.value)}>
                                    <option value="">{t('cath.balloonNone')}</option>
                                    {balloons.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                            </div>
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
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cath.repFrom')}</label>
                                <input type="date" className="border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" value={reportStart} onChange={e => setReportStart(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cath.repTo')}</label>
                                <input type="date" className="border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" value={reportEnd} onChange={e => setReportEnd(e.target.value)} />
                            </div>
                        </div>
                        <button onClick={() => window.print()} className="bg-slate-800 text-white px-6 py-2 rounded-xl font-bold hover:bg-slate-700 flex items-center gap-2">
                            <i className="fas fa-print"></i> {t('cath.repPrint')}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm rtl:text-right ltr:text-left">
                            <thead className="bg-slate-100 text-slate-600 border-y-2 border-slate-800 print:text-black">
                                <tr>
                                    <th className="p-3">{t('cath.date')}</th>
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
                                {records.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-slate-500 font-bold">{t('cath.repEmpty')}</td>
                                    </tr>
                                ) : (
                                    records.map(r => (
                                        <tr key={r.id}>
                                            <td className="p-3">{r.date}</td>
                                            <td className="p-3 font-mono">{r.patientFileNumber}</td>
                                            <td className="p-3 font-bold text-slate-800 print:text-black">{r.patientName}</td>
                                            <td className="p-3">{r.stentType || '-'}</td>
                                            <td className="p-3">{r.balloonType || '-'}</td>
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
                    </div>
                    <PrintFooter />
                </div>
            )}
        </div>
    );
};

export default CathLabUsage;
