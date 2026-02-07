
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, Timestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { uploadFile } from '../../services/storageClient';
import { useLanguage } from '../../contexts/LanguageContext';
import Toast from '../../components/Toast';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const FMSReports: React.FC = () => {
    const { dir } = useLanguage();
    const navigate = useNavigate();
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    
    // Form
    const [reportName, setReportName] = useState('');
    const [reportDate, setReportDate] = useState('');
    const [fileUrl, setFileUrl] = useState('');
    
    // Expanded States for Accordion
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'fms_reports'), (snap) => {
            setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedGroups);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedGroups(newSet);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        setUploading(true);
        try {
            const url = await uploadFile(e.target.files[0], 'fms_reports');
            if (url) {
                setFileUrl(url);
                setToast({ msg: 'File Uploaded', type: 'success' });
            }
        } catch (e) {
            setToast({ msg: 'Upload Error', type: 'error' });
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reportName || !reportDate || !fileUrl) return setToast({ msg: 'All fields required', type: 'error' });

        try {
            // Check if group exists
            const existingGroup = groups.find(g => g.name.toLowerCase() === reportName.toLowerCase());
            const newItem = { date: reportDate, url: fileUrl, addedAt: new Date().toISOString() };

            if (existingGroup) {
                await updateDoc(doc(db, 'fms_reports', existingGroup.id), {
                    items: arrayUnion(newItem)
                });
            } else {
                await addDoc(collection(db, 'fms_reports'), {
                    name: reportName,
                    items: [newItem],
                    createdAt: Timestamp.now()
                });
            }
            setToast({ msg: 'Report Added', type: 'success' });
            setIsModalOpen(false);
            setReportName(''); setReportDate(''); setFileUrl('');
        } catch (e) {
            setToast({ msg: 'Error saving report', type: 'error' });
        }
    };

    const handleDeleteItem = async (groupId: string, item: any) => {
        if (!confirm('Delete this report?')) return;
        try {
            await updateDoc(doc(db, 'fms_reports', groupId), {
                items: arrayRemove(item)
            });
        } catch(e) { setToast({ msg: 'Error deleting', type: 'error' }); }
    };

    const handleDeleteGroup = async (groupId: string) => {
        if (!confirm('Delete entire group?')) return;
        try {
            await deleteDoc(doc(db, 'fms_reports', groupId));
        } catch(e) { setToast({ msg: 'Error deleting', type: 'error' }); }
    };

    const getStatus = (dateStr: string) => {
        const today = new Date();
        const rDate = new Date(dateStr);
        const alertDate = new Date(rDate);
        alertDate.setDate(alertDate.getDate() - 30);
        if (today > rDate) return { text: 'EXPIRED', bg: 'bg-red-500', border: 'border-red-500' };
        if (today >= alertDate) return { text: 'DUE SOON', bg: 'bg-amber-500', border: 'border-amber-500' };
        return { text: 'VALID', bg: 'bg-emerald-500', border: 'border-emerald-500' };
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20" dir="ltr">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-slate-200 px-6 py-4 shadow-sm">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/supervisor')} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <h1 className="text-2xl font-black text-slate-800 text-sky-600">
                             FMS Reports
                        </h1>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-6 space-y-6">
                <button onClick={() => setIsModalOpen(true)} className="w-full bg-gradient-to-r from-sky-500 to-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-sky-200 hover:scale-[1.01] transition-transform">
                    + Add New Report
                </button>

                {groups.map(group => {
                    const sortedItems = (group.items || []).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    const latest = sortedItems[0];
                    const status = latest ? getStatus(latest.date) : { text: 'EMPTY', bg: 'bg-slate-400', border: 'border-slate-300' };
                    const isExpanded = expandedGroups.has(group.id);

                    return (
                        <div key={group.id} className={`bg-white rounded-2xl shadow-sm border-l-8 ${status.border} overflow-hidden transition-all`}>
                            <div 
                                className="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleExpand(group.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <h3 className="text-lg font-bold text-slate-800">{group.name}</h3>
                                    <span className={`text-[10px] text-white px-2 py-0.5 rounded-full font-bold ${status.bg}`}>{status.text}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-400 font-bold">{group.items?.length || 0} Files</span>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }} className="text-slate-300 hover:text-red-500"><i className="fas fa-trash"></i></button>
                                    <i className={`fas fa-chevron-down text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}></i>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="bg-slate-50 border-t border-slate-100 p-2">
                                    {sortedItems.map((item: any, idx: number) => {
                                        const itemStatus = getStatus(item.date);
                                        return (
                                            <div key={idx} className="flex justify-between items-center p-3 border-b border-slate-100 last:border-0 hover:bg-white rounded-lg transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <span className="bg-slate-200 text-slate-700 font-mono text-xs px-2 py-1 rounded">{item.date}</span>
                                                    {itemStatus.text !== 'VALID' && <span className="text-[10px] text-red-500 font-bold">({itemStatus.text})</span>}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <a href={item.url} target="_blank" className="text-sky-600 text-xs font-bold hover:underline flex items-center gap-1">
                                                        <i className="fas fa-file-pdf"></i> View
                                                    </a>
                                                    <button onClick={() => handleDeleteItem(group.id, item)} className="text-slate-300 hover:text-red-500"><i className="fas fa-times"></i></button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-fade-in-up">
                        <h3 className="text-xl font-bold text-slate-800 mb-6">Add Report</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                                placeholder="Report Name (e.g. Water Quality)"
                                value={reportName}
                                onChange={e => setReportName(e.target.value)}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <input 
                                    type="date" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                                    value={reportDate}
                                    onChange={e => setReportDate(e.target.value)}
                                />
                                <div className="relative">
                                    <input type="file" accept="application/pdf" className="hidden" id="pdf-upload" onChange={handleFileUpload} />
                                    <label htmlFor="pdf-upload" className={`w-full h-full flex items-center justify-center rounded-xl border-2 border-dashed cursor-pointer font-bold text-xs transition-colors ${fileUrl ? 'border-emerald-300 bg-emerald-50 text-emerald-600' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>
                                        {uploading ? 'Uploading...' : fileUrl ? 'File Ready ✅' : 'Upload PDF'}
                                    </label>
                                </div>
                            </div>
                            
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">Cancel</button>
                                <button type="submit" disabled={uploading || !fileUrl} className="px-6 py-3 rounded-xl bg-sky-600 text-white font-bold hover:bg-sky-700 shadow-lg disabled:opacity-50">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FMSReports;
