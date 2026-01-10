
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { db } from '../firebase';
// @ts-ignore
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ExtendedAppointment } from '../types';
import Loading from '../components/Loading';
import { PrintHeader, PrintFooter } from '../components/PrintLayout';
import { useLanguage } from '../contexts/LanguageContext';
import Modal from '../components/Modal';
import Toast from '../components/Toast';

interface ModalityLogbookProps {
    type: 'MRI' | 'CT' | 'US' | 'X-RAY' | 'FLUO' | 'OTHER';
    title: string;
    colorTheme: 'blue' | 'emerald' | 'indigo' | 'slate' | 'amber';
}

const getLocalToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const ModalityLogbook: React.FC<ModalityLogbookProps> = ({ type, title, colorTheme = 'slate' }) => {
    const { t, dir } = useLanguage();
    const [logs, setLogs] = useState<ExtendedAppointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState(getLocalToday());
    const [endDate, setEndDate] = useState(getLocalToday());
    const [isArchiveMode, setIsArchiveMode] = useState(false); // New Flag
    
    // Counter Settings
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [currentCounter, setCurrentCounter] = useState<number>(0);
    const [newCounter, setNewCounter] = useState<string>('');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'|'info'} | null>(null);

    // Color Maps
    const colors: Record<string, string> = {
        blue: 'bg-blue-600 border-blue-600 text-blue-600 bg-blue-50',
        emerald: 'bg-emerald-600 border-emerald-600 text-emerald-600 bg-emerald-50',
        indigo: 'bg-indigo-600 border-indigo-600 text-indigo-600 bg-indigo-50',
        slate: 'bg-slate-600 border-slate-600 text-slate-600 bg-slate-50',
        amber: 'bg-amber-600 border-amber-600 text-amber-600 bg-amber-50',
    };

    const activeColorClass = colors[colorTheme] || colors['slate'];
    const activeBgClass = activeColorClass.split(' ')[0] || 'bg-slate-600';

    const fetchLogs = async () => {
        setIsArchiveMode(false); // Reset archive mode on live fetch
        if (!startDate || !endDate) return;

        setLoading(true);
        
        try {
            const queryStart = `${startDate}T00:00:00`;
            const queryEnd = `${endDate}T23:59:59`;

            let query = supabase
                .from('appointments')
                .select('*')
                .eq('status', 'done')
                .gte('completedAt', queryStart)
                .lte('completedAt', queryEnd);

            if (type === 'X-RAY') {
                query = query.in('examType', ['X-RAY', 'OTHER']);
            } else {
                query = query.eq('examType', type);
            }

            const { data, error } = await query.order('completedAt', { ascending: true });

            if (error) throw error;
            setLogs(data as ExtendedAppointment[]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleImportArchive = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    // Filter loaded data for current modality type
                    const filtered = json.filter((a: any) => {
                        // Handle potential slight schema diffs
                        const eType = a.examType || 'OTHER';
                        if (type === 'X-RAY') return eType === 'X-RAY' || eType === 'OTHER';
                        return eType === type;
                    });
                    
                    setLogs(filtered);
                    setIsArchiveMode(true);
                    setToast({ msg: `تم تحميل ${filtered.length} سجل من الأرشيف (وضع العرض المحلي)`, type: 'success' });
                } else {
                    setToast({ msg: 'ملف غير صالح', type: 'error' });
                }
            } catch (err) {
                setToast({ msg: 'خطأ في قراءة الملف', type: 'error' });
            }
        };
        reader.readAsText(file);
    };

    const fetchCounter = async () => {
        try {
            const docRef = doc(db, 'system_settings', 'appointment_slots');
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                const settings = data[type] || {};
                setCurrentCounter(settings.currentCounter || 1);
                setNewCounter((settings.currentCounter || 1).toString());
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchLogs();
    }, [startDate, endDate, type]);

    useEffect(() => {
        if(isSettingsOpen) fetchCounter();
    }, [isSettingsOpen]);

    const handleUpdateCounter = async () => {
        const val = parseInt(newCounter);
        if (isNaN(val) || val < 0) return setToast({msg: 'رقم غير صحيح', type: 'error'});

        try {
            const docRef = doc(db, 'system_settings', 'appointment_slots');
            await updateDoc(docRef, {
                [`${type}.currentCounter`]: val
            });
            setToast({msg: 'تم تحديث بداية العداد بنجاح ✅', type: 'success'});
            setCurrentCounter(val);
            setTimeout(() => setIsSettingsOpen(false), 1500);
        } catch (e) {
            setToast({msg: 'فشل التحديث', type: 'error'});
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans print:bg-white print:p-0" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <PrintHeader title={`سجل حالات قسم - ${title}`} subtitle={isArchiveMode ? "نسخة أرشيفية (محلية)" : `${startDate} إلى ${endDate}`} themeColor={colorTheme} />

            <div className="max-w-7xl mx-auto px-4 py-8 print:p-0 print:max-w-none">
                
                {/* Controls (Hidden in Print) */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 print:hidden">
                    <div className="flex items-center gap-4">
                         <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg ${activeBgClass}`}>
                            <i className="fas fa-clipboard-list"></i>
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-800">{title} Logbook</h1>
                            <p className="text-xs text-slate-500 font-bold">سجل الحالات المنجزة</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
                        {isArchiveMode ? (
                            <div className="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold border border-amber-200 flex items-center gap-2">
                                <i className="fas fa-history"></i> وضع عرض الأرشيف
                                <button onClick={fetchLogs} className="text-red-500 hover:text-red-700 underline ml-2">عودة للمباشر</button>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-2 px-2 border-r border-slate-100">
                                    <span className="text-xs font-bold text-slate-400">From:</span>
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-50 border-none rounded-lg text-xs font-bold py-2" />
                                </div>
                                <div className="flex items-center gap-2 px-2">
                                    <span className="text-xs font-bold text-slate-400">To:</span>
                                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-50 border-none rounded-lg text-xs font-bold py-2" />
                                </div>
                                <button onClick={fetchLogs} className={`w-9 h-9 rounded-lg text-white flex items-center justify-center hover:opacity-90 transition-all shadow-md ${activeBgClass}`}>
                                    <i className="fas fa-sync-alt"></i>
                                </button>
                            </>
                        )}
                        
                        <div className="relative">
                            <input 
                                type="file" 
                                accept=".json" 
                                onChange={handleImportArchive} 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                                title="استيراد ملف أرشيف JSON"
                            />
                            <button className="bg-slate-100 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 flex items-center gap-2 border border-slate-200">
                                <i className="fas fa-file-upload"></i> أرشيف
                            </button>
                        </div>

                        <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 flex items-center gap-2">
                            <i className="fas fa-print"></i> طباعة
                        </button>

                        <button onClick={() => setIsSettingsOpen(true)} className="bg-amber-500 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-600 flex items-center gap-2 shadow-lg shadow-amber-200">
                            <i className="fas fa-cog"></i> إعداد الترقيم
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-2 print:border-black print:rounded-none">
                    {loading ? <div className="p-10"><Loading /></div> : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right print:text-xs">
                                <thead className={`text-white font-bold uppercase ${activeBgClass} print:text-black print:bg-slate-200 print:border-b-2 print:border-black`}>
                                    <tr>
                                        <th className="p-4 print:p-2 text-center w-16">#</th>
                                        <th className="p-4 print:p-2">Reg No.</th>
                                        <th className="p-4 print:p-2">تاريخ الإنجاز</th>
                                        <th className="p-4 print:p-2">اسم المريض</th>
                                        <th className="p-4 print:p-2">رقم الملف (ID)</th>
                                        <th className="p-4 print:p-2">الفحص</th>
                                        <th className="p-4 print:p-2">بواسطة</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                                    {logs.length === 0 ? (
                                        <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد سجلات للعرض</td></tr>
                                    ) : (
                                        logs.map((row, i) => (
                                            <tr key={row.id} className="hover:bg-slate-50 print:break-inside-avoid">
                                                <td className="p-4 print:p-1 text-center font-mono text-slate-400 print:text-black">{i + 1}</td>
                                                <td className="p-4 print:p-1 font-black text-slate-800 print:text-black">{row.registrationNumber || '-'}</td>
                                                <td className="p-4 print:p-1 font-mono text-xs text-slate-500 print:text-black">
                                                    {/* Display Completed At if available, else date/time */}
                                                    {row.completedAt ? new Date(row.completedAt).toLocaleString('en-US', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'}) : `${row.date} ${row.time}`}
                                                </td>
                                                <td className="p-4 print:p-1 font-bold text-slate-800 print:text-black">{row.patientName}</td>
                                                <td className="p-4 print:p-1 font-mono text-blue-600 print:text-black">{row.fileNumber}</td>
                                                <td className="p-4 print:p-1">
                                                    <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-[10px] font-bold border border-slate-200 print:border-0 print:bg-transparent print:p-0 print:text-black">
                                                        {row.examList?.join(', ') || row.examType}
                                                    </span>
                                                </td>
                                                <td className="p-4 print:p-1 font-bold text-emerald-700 print:text-black text-xs">{row.performedByName || '-'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="p-4 bg-slate-50 border-t border-slate-200 print:bg-white print:border-t-2 print:border-black flex justify-between items-center font-bold text-xs">
                        <span>عدد الحالات: {logs.length}</span>
                        <span>تم الطباعة في: {new Date().toLocaleString()}</span>
                    </div>
                </div>

                <PrintFooter themeColor={colorTheme} />
            </div>

            {/* Settings Modal */}
            <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title={`إعدادات ترقيم ${title}`}>
                <div className="space-y-6 text-center">
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-amber-900 text-sm">
                        <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
                        <p className="font-bold">تنبيه هام</p>
                        <p>تغيير هذا الرقم سيؤثر على المريض القادم الذي سيتم تسجيل دخوله (Start Exam). يرجى توخي الحذر لعدم تكرار الأرقام.</p>
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase">الرقم الحالي (سيتم استخدام الرقم التالي)</span>
                        <div className="text-4xl font-black text-slate-800 bg-slate-100 px-6 py-2 rounded-2xl border-b-4 border-slate-300">
                            {currentCounter}
                        </div>
                    </div>

                    <div className="text-right">
                        <label className="text-xs font-bold text-slate-500 mb-1 block">تعديل بداية الترقيم إلى:</label>
                        <input 
                            type="number" 
                            className="w-full bg-white border-2 border-slate-200 rounded-xl p-3 text-lg font-bold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 transition-all text-center"
                            placeholder="مثلاً: 500"
                            value={newCounter}
                            onChange={e => setNewCounter(e.target.value)}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">المريض القادم سيأخذ الرقم: {parseInt(newCounter || '0')}</p>
                    </div>

                    <button 
                        onClick={handleUpdateCounter}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-all"
                    >
                        حفظ التعديل
                    </button>
                </div>
            </Modal>

        </div>
    );
};

export default ModalityLogbook;
