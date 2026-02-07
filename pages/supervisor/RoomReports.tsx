
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { uploadFile } from '../../services/storageClient';
import { useLanguage } from '../../contexts/LanguageContext';
import Toast from '../../components/Toast';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const RoomReports: React.FC = () => {
    const { dir } = useLanguage();
    const navigate = useNavigate();
    const [rooms, setRooms] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    
    // Form
    const [editingId, setEditingId] = useState<string|null>(null);
    const [formData, setFormData] = useState({ number: '', device: '', surveyDate: '', surveyUrl: '' });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'room_reports'), (snap) => {
            setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        setUploading(true);
        try {
            const url = await uploadFile(e.target.files[0], 'room_reports');
            if (url) {
                setFormData(prev => ({ ...prev, surveyUrl: url }));
                setToast({ msg: 'Survey Uploaded', type: 'success' });
            }
        } catch (e) {
            setToast({ msg: 'Upload Error', type: 'error' });
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!formData.number || !formData.device) return setToast({ msg: 'Missing info', type: 'error' });
        
        try {
            if (editingId) {
                await updateDoc(doc(db, 'room_reports', editingId), formData);
                setToast({ msg: 'Room Updated', type: 'success' });
            } else {
                await addDoc(collection(db, 'room_reports'), { ...formData, createdAt: Timestamp.now() });
                setToast({ msg: 'Room Added', type: 'success' });
            }
            setIsModalOpen(false);
            setFormData({ number: '', device: '', surveyDate: '', surveyUrl: '' });
            setEditingId(null);
        } catch (e) { setToast({ msg: 'Error saving', type: 'error' }); }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Delete room record?')) {
            await deleteDoc(doc(db, 'room_reports', id));
        }
    };

    const checkStatus = (dateStr: string) => {
        if (!dateStr) return { class: 'bg-amber-100 text-amber-800', text: 'No Date' };
        const today = new Date();
        const expiry = new Date(dateStr);
        const warningDate = new Date(expiry);
        warningDate.setDate(expiry.getDate() - 30);
        if (today > expiry) return { class: 'bg-red-100 text-red-800', text: 'Expired' };
        if (today >= warningDate) return { class: 'bg-yellow-100 text-yellow-800', text: 'Expires Soon' };
        return { class: 'bg-emerald-100 text-emerald-800', text: 'Valid' };
    };

    const filteredRooms = rooms.filter(r => 
        r.number.toLowerCase().includes(searchTerm.toLowerCase()) || 
        r.device.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20" dir="ltr">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-slate-200 px-6 py-4 shadow-sm">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button onClick={() => navigate('/supervisor')} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <h1 className="text-2xl font-black text-slate-800 text-indigo-600">Room Reports</h1>
                    </div>
                    <div className="relative w-full md:w-96">
                        <i className="fas fa-search absolute left-3 top-3 text-slate-400"></i>
                        <input 
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-full text-sm font-bold focus:ring-2 focus:ring-indigo-200 outline-none"
                            placeholder="Search rooms..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRooms.map(room => {
                    const status = checkStatus(room.surveyDate);
                    return (
                        <div key={room.id} className={`bg-white rounded-2xl p-6 shadow-sm border-t-8 flex flex-col relative group transition-all hover:-translate-y-1 hover:shadow-lg ${status.text === 'Expired' ? 'border-red-400' : status.text === 'Expires Soon' ? 'border-yellow-400' : 'border-emerald-400'}`}>
                             <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setFormData(room); setEditingId(room.id); setIsModalOpen(true); }} className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center"><i className="fas fa-pen text-xs"></i></button>
                                <button onClick={() => handleDelete(room.id)} className="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center"><i className="fas fa-trash text-xs"></i></button>
                            </div>

                            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center text-3xl mb-4 text-indigo-500">
                                🚪
                            </div>
                            
                            <h3 className="text-xl font-black text-slate-800">Room {room.number}</h3>
                            <p className="text-sm text-slate-500 font-bold mb-4">{room.device}</p>
                            
                            <div className="mt-auto space-y-3">
                                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                                    <span className="text-xs font-bold text-slate-400">Status</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${status.class}`}>{status.text}</span>
                                </div>
                                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                                    <span className="text-xs font-bold text-slate-400">Survey Exp</span>
                                    <span className="text-xs font-mono font-bold text-slate-700">{room.surveyDate || 'N/A'}</span>
                                </div>
                                
                                <a 
                                    href={room.surveyUrl || '#'} 
                                    target="_blank" 
                                    className={`w-full py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-colors ${room.surveyUrl ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                >
                                    <i className="fas fa-file-pdf"></i> View Survey
                                </a>
                            </div>
                        </div>
                    );
                })}
            </div>

            <button onClick={() => { setEditingId(null); setFormData({number:'', device:'', surveyDate:'', surveyUrl:''}); setIsModalOpen(true); }} className="fixed bottom-8 right-8 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center text-2xl hover:scale-110 transition-all z-40">
                <i className="fas fa-plus"></i>
            </button>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-fade-in-up">
                        <h3 className="text-xl font-bold text-slate-800 mb-6">{editingId ? 'Edit Room' : 'Add Room'}</h3>
                        <div className="space-y-4">
                            <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold" placeholder="Room Number (e.g. R-101)" value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} />
                            <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold" placeholder="Device Name" value={formData.device} onChange={e => setFormData({...formData, device: e.target.value})} />
                            
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Survey Expiry</label>
                                <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3" value={formData.surveyDate} onChange={e => setFormData({...formData, surveyDate: e.target.value})} />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Survey Report (PDF)</label>
                                <div className="relative">
                                    <input type="file" accept="application/pdf" className="hidden" id="survey-upload" onChange={handleFileUpload} />
                                    <label htmlFor="survey-upload" className={`w-full p-4 flex items-center justify-center rounded-xl border-2 border-dashed cursor-pointer font-bold text-xs transition-colors ${formData.surveyUrl ? 'border-emerald-300 bg-emerald-50 text-emerald-600' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>
                                        {uploading ? 'Uploading...' : formData.surveyUrl ? 'File Attached ✅' : 'Click to Upload PDF'}
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">Cancel</button>
                            <button onClick={handleSubmit} disabled={uploading} className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg disabled:opacity-50">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoomReports;
