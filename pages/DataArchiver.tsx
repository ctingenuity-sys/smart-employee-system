
import React, { useState } from 'react';
import { db } from '../firebase';
// @ts-ignore
import { collection, query, where, getDocs, writeBatch, Timestamp, limit, addDoc } from 'firebase/firestore';
import { supabase } from '../supabaseClient'; // Import Supabase
import Toast from '../components/Toast';
import { useLanguage } from '../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const DataArchiver: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    
    // --- State for Archiving ---
    const [targetCollection, setTargetCollection] = useState('attendance_logs');
    const [archiveDate, setArchiveDate] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    
    // --- State for Viewer ---
    const [viewMode, setViewMode] = useState(false);
    const [localData, setLocalData] = useState<any[]>([]);
    const [localFileName, setLocalFileName] = useState('');
    const [viewerSearch, setViewerSearch] = useState('');

    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'|'info'} | null>(null);

    const collectionsMap = {
        'attendance_logs': 'Firebase: سجلات الحضور (Attendance)',
        'shiftLogs': 'Firebase: سجلات الورديات (Shift Logs)',
        'actions': 'Firebase: الإجراءات (Actions)',
        'schedules': 'Firebase: الجداول القديمة (Schedules)',
        'swapRequests': 'Firebase: طلبات التبديل (Swaps)',
        'leaveRequests': 'Firebase: طلبات الإجازة (Leaves)',
        'supabase_appointments': 'Supabase: المواعيد والسجلات (Appointments)' // Added Supabase
    };

    // --- Archiving Logic ---
    const handleArchiveAndPurge = async () => {
        if (!archiveDate) return setToast({ msg: 'يرجى تحديد التاريخ', type: 'error' });
        if (deleteConfirmation !== 'DELETE') return setToast({ msg: 'يرجى كتابة كلمة DELETE للتأكيد', type: 'error' });

        setIsProcessing(true);
        try {
            let dataToExport: any[] = [];
            let deletedCount = 0;

            // --- SUPABASE LOGIC ---
            if (targetCollection === 'supabase_appointments') {
                // 1. Fetch
                const { data, error } = await supabase
                    .from('appointments')
                    .select('*')
                    .lt('date', archiveDate); // Assuming 'date' is YYYY-MM-DD

                if (error) throw error;
                if (!data || data.length === 0) {
                    setIsProcessing(false);
                    return setToast({ msg: 'لا توجد بيانات أقدم من هذا التاريخ', type: 'info' });
                }
                dataToExport = data;

                // --- 1.5 AUTO-SAVE PERFORMANCE STATS ---
                // قبل الحذف، نقوم بتجميع الإحصائيات وحفظها في performance_archives
                // حتى لا تتأثر صفحة الأداء بالحذف
                const statsByMonth: Record<string, Record<string, {name: string, count: number}>> = {};
                
                data.forEach((appt: any) => {
                    if (appt.status === 'done') {
                        const dateStr = appt.date || ''; 
                        const month = dateStr.substring(0, 7); // YYYY-MM
                        const uid = appt.performedBy || 'unknown';
                        const name = appt.performedByName || 'Unknown';

                        if (month.length === 7) {
                            if (!statsByMonth[month]) statsByMonth[month] = {};
                            if (!statsByMonth[month][uid]) statsByMonth[month][uid] = { name, count: 0 };
                            statsByMonth[month][uid].count++;
                        }
                    }
                });

                // Save calculated stats to Firebase Archive Collection
                for (const [month, usersStats] of Object.entries(statsByMonth)) {
                    const statsArray = Object.entries(usersStats).map(([uid, val]) => ({
                        userId: uid,
                        name: val.name,
                        totalCases: val.count
                    }));

                    // Add to performance_archives collection
                    await addDoc(collection(db, 'performance_archives'), {
                        month: month,
                        stats: statsArray,
                        createdAt: Timestamp.now(),
                        source: 'Auto-Archiver (Backup before Delete)',
                        originalRecordCount: data.length
                    });
                }
                
                // 2. Delete (Requires RLS Policy allowing delete)
                const idsToDelete = data.map((d: any) => d.id);
                const { error: delError } = await supabase
                    .from('appointments')
                    .delete()
                    .in('id', idsToDelete);
                
                if (delError) throw delError;
                deletedCount = idsToDelete.length;

            } else {
                // --- FIREBASE LOGIC ---
                let dateField = 'date'; // Default for logs
                if (targetCollection === 'shiftLogs' || targetCollection === 'swapRequests' || targetCollection === 'leaveRequests' || targetCollection === 'actions') {
                    dateField = 'createdAt'; 
                } else if (targetCollection === 'schedules') {
                    dateField = 'validTo'; 
                }

                let q;
                if (targetCollection === 'attendance_logs' || targetCollection === 'schedules') {
                     q = query(collection(db, targetCollection), where(dateField, '<', archiveDate));
                } else {
                     const ts = Timestamp.fromDate(new Date(archiveDate));
                     q = query(collection(db, targetCollection), where(dateField, '<', ts));
                }

                const snapshot = await getDocs(q);
                
                if (snapshot.empty) {
                    setIsProcessing(false);
                    return setToast({ msg: 'لا توجد بيانات أقدم من هذا التاريخ', type: 'info' });
                }

                dataToExport = snapshot.docs.map(doc => {
                    const d = doc.data();
                    const safeData: any = { _id: doc.id }; 
                    Object.keys(d).forEach(key => {
                        const val = d[key];
                        if (val && typeof val === 'object' && val.seconds) {
                            safeData[key] = new Date(val.seconds * 1000).toISOString();
                        } else {
                            safeData[key] = val;
                        }
                    });
                    return safeData;
                });

                // Batch Delete
                const batchSize = 500;
                const docs = snapshot.docs;
                
                for (let i = 0; i < docs.length; i += batchSize) {
                    const batch = writeBatch(db);
                    const chunk = docs.slice(i, i + batchSize);
                    chunk.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                    deletedCount += chunk.length;
                }
            }

            // 3. Download JSON (Shared)
            const fileName = `${targetCollection}_ARCHIVE_${archiveDate}_${Date.now()}.json`;
            const jsonString = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setToast({ msg: `تمت الأرشفة وحفظ الإحصائيات وحذف ${deletedCount} سجل بنجاح ✅`, type: 'success' });
            setDeleteConfirmation('');

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'حدث خطأ: ' + e.message, type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    // --- Viewer Logic ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    setLocalData(json);
                    setLocalFileName(file.name);
                    setViewMode(true);
                    setToast({ msg: 'تم تحميل الملف بنجاح', type: 'success' });
                } else {
                    setToast({ msg: 'ملف غير صالح', type: 'error' });
                }
            } catch (err) {
                setToast({ msg: 'خطأ في قراءة الملف', type: 'error' });
            }
        };
        reader.readAsText(file);
    };

    // Generic Table Renderer
    const renderTable = () => {
        if (localData.length === 0) return <p className="text-center text-slate-500 p-10">الملف فارغ</p>;

        const sample = localData.slice(0, 5);
        // FIX: Cast to string[] explicitly to handle TS "unknown[]" error
        const headers = Array.from(new Set(sample.flatMap((d: any) => Object.keys(d)))).filter((k: any) => k !== '_id') as string[];

        const filtered = localData.filter(row => 
            JSON.stringify(row).toLowerCase().includes(viewerSearch.toLowerCase())
        );

        return (
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-200 text-slate-700 uppercase font-bold">
                        <tr>
                            <th className="p-3">#</th>
                            {headers.map(h => <th key={h} className="p-3 whitespace-nowrap">{h}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {filtered.slice(0, 100).map((row: any, i) => (
                            <tr key={i} className="hover:bg-blue-50">
                                <td className="p-3 font-mono">{i + 1}</td>
                                {headers.map((h: string) => (
                                    <td key={h} className="p-3 border-r border-slate-100 max-w-[200px] truncate" title={String(row[h])}>
                                        {String(row[h])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length > 100 && (
                    <div className="p-4 text-center text-slate-500 bg-slate-50 text-xs">
                        يتم عرض أول 100 نتيجة فقط من أصل {filtered.length}. استخدم البحث للوصول لنتائج محددة.
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header */}
            <div className="bg-slate-900 text-white p-6 mb-6">
                <div className="max-w-6xl mx-auto flex items-center gap-4">
                    <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                        <i className="fas fa-arrow-left rtl:rotate-180"></i>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black">أرشيف البيانات (Data Archiver)</h1>
                        <p className="text-slate-400 text-sm">تفريغ المساحة وتصفح الأرشيف المحلي</p>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 space-y-8">
                
                {/* 1. Archiving Section */}
                {!viewMode && (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 animate-fade-in-up">
                        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <i className="fas fa-box-archive text-amber-500"></i> تصدير وحذف البيانات القديمة
                        </h2>
                        
                        <div className="grid md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-500 mb-2">نوع البيانات</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-200"
                                    value={targetCollection}
                                    onChange={e => setTargetCollection(e.target.value)}
                                >
                                    {Object.entries(collectionsMap).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-500 mb-2">أرشفة ما قبل تاريخ</label>
                                <input 
                                    type="date" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-200"
                                    value={archiveDate}
                                    onChange={e => setArchiveDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="bg-red-50 border border-red-100 p-4 rounded-xl mb-6">
                            <p className="text-red-800 text-sm font-bold mb-2">⚠️ منطقة الخطر: البيانات سيتم حذفها نهائياً من السحابة بعد التنزيل.</p>
                            <p className="text-xs text-red-600 mb-2 font-bold opacity-80">* ملاحظة: سيتم حفظ نسخة من إحصائيات الأداء تلقائياً قبل الحذف.</p>
                            <input 
                                className="w-full bg-white border border-red-200 rounded-lg p-2 text-sm placeholder-red-300"
                                placeholder="اكتب DELETE للتأكيد"
                                value={deleteConfirmation}
                                onChange={e => setDeleteConfirmation(e.target.value)}
                            />
                        </div>

                        <button 
                            onClick={handleArchiveAndPurge}
                            disabled={isProcessing || deleteConfirmation !== 'DELETE'}
                            className="w-full bg-slate-800 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                        >
                            {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-export"></i>}
                            تصدير وحذف (Export & Purge)
                        </button>
                    </div>
                )}

                {/* 2. Local Viewer Section */}
                <div className={`bg-white rounded-3xl shadow-sm border border-slate-200 p-8 animate-fade-in-up ${viewMode ? 'min-h-[80vh]' : ''}`}>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <i className="fas fa-folder-open text-blue-500"></i> المستعرض المحلي (Offline Viewer)
                        </h2>
                        {viewMode && (
                            <button onClick={() => { setViewMode(false); setLocalData([]); }} className="text-red-500 font-bold text-sm hover:underline">
                                إغلاق الملف
                            </button>
                        )}
                    </div>

                    {!viewMode ? (
                        <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center hover:bg-slate-50 transition-colors relative">
                            <input type="file" accept=".json" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                            <i className="fas fa-upload text-4xl text-slate-300 mb-4"></i>
                            <p className="text-slate-500 font-bold">اضغط لاختيار ملف JSON من جهازك</p>
                            <p className="text-xs text-slate-400 mt-2">سيتم عرض البيانات هنا دون رفعها إلى السيرفر</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-col md:flex-row justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100 gap-4">
                                <div>
                                    <p className="text-xs font-bold text-blue-400 uppercase">File Loaded</p>
                                    <p className="text-blue-900 font-bold truncate max-w-md">{localFileName}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-blue-400 uppercase">Records</p>
                                    <p className="text-blue-900 font-black text-xl">{localData.length}</p>
                                </div>
                            </div>

                            <div className="relative">
                                <i className="fas fa-search absolute right-4 top-3.5 text-slate-400"></i>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pr-10 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                                    placeholder="بحث في البيانات المحلية..."
                                    value={viewerSearch}
                                    onChange={e => setViewerSearch(e.target.value)}
                                />
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-inner bg-slate-50 max-h-[600px] overflow-y-auto">
                                {renderTable()}
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default DataArchiver;
