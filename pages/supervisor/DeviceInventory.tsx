
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { uploadFile } from '../../services/storageClient';
import { useLanguage } from '../../contexts/LanguageContext';
import Toast from '../../components/Toast';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const DeviceInventory: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [devices, setDevices] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [loading, setLoading] = useState(true);

    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        serial: '',
        category: '',
        installDate: '',
        image: '',
        maintUrl: '',
        maintDate: '',
        qualUrl: '',
        qualDate: ''
    });

    // Upload States
    const [uploadingImg, setUploadingImg] = useState(false);
    const [uploadingPPM, setUploadingPPM] = useState(false);
    const [uploadingQC, setUploadingQC] = useState(false);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'inventory_devices'), (snap) => {
            setDevices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const xrayCategories = ['CT', 'X-Ray', 'Panoramic & Dental', 'Cath Lab', 'Mammogram & BMD', 'Portable', 'C-ARM', 'FLOUROSCOPY'];
    const showQualityFields = xrayCategories.includes(formData.category);

    const handleFileUpload = async (file: File, field: 'image' | 'maintUrl' | 'qualUrl') => {
        if (field === 'image') setUploadingImg(true);
        if (field === 'maintUrl') setUploadingPPM(true);
        if (field === 'qualUrl') setUploadingQC(true);

        try {
            const url = await uploadFile(file, `devices/${field}`);
            if (url) {
                setFormData(prev => ({ ...prev, [field]: url }));
                setToast({ msg: 'File Uploaded', type: 'success' });
            }
        } catch (e) {
            setToast({ msg: 'Upload Failed', type: 'error' });
        } finally {
            setUploadingImg(false); setUploadingPPM(false); setUploadingQC(false);
        }
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.category) return setToast({ msg: 'Missing Fields', type: 'error' });
        
        try {
            if (editingId) {
                await updateDoc(doc(db, 'inventory_devices', editingId), formData);
                setToast({ msg: 'Device Updated', type: 'success' });
            } else {
                await addDoc(collection(db, 'inventory_devices'), { ...formData, createdAt: Timestamp.now() });
                setToast({ msg: 'Device Added', type: 'success' });
            }
            setIsModalOpen(false);
            resetForm();
        } catch (e) {
            setToast({ msg: 'Error saving', type: 'error' });
        }
    };

    const handleDelete = async (id: string) => {
        if(confirm('Delete this device?')) {
            await deleteDoc(doc(db, 'inventory_devices', id));
        }
    };

    const resetForm = () => {
        setFormData({ name: '', serial: '', category: '', installDate: '', image: '', maintUrl: '', maintDate: '', qualUrl: '', qualDate: '' });
        setEditingId(null);
    };

    const openEdit = (dev: any) => {
        setFormData(dev);
        setEditingId(dev.id);
        setIsModalOpen(true);
    };

    // --- Render Logic ---
    const filteredDevices = devices.filter(d => 
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        d.serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    const categories = [...new Set(filteredDevices.map(d => (d.category || 'Other').toUpperCase()))];

    const checkStatus = (dateStr: string) => {
        if (!dateStr) return { class: 'bg-amber-100 text-amber-800', text: 'No Date' };
        const today = new Date();
        const expiry = new Date(dateStr);
        const warningDate = new Date(expiry);
        warningDate.setDate(expiry.getDate() - 30);
        if (today > expiry) return { class: 'bg-red-100 text-red-800', text: 'Expired' };
        if (today >= warningDate) return { class: 'bg-yellow-100 text-yellow-800', text: 'Due Soon' };
        return { class: 'bg-emerald-100 text-emerald-800', text: 'Valid' };
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20" dir="ltr">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-slate-200 px-6 py-4 shadow-sm">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button onClick={() => navigate('/supervisor')} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                            <i className="fas fa-microscope text-sky-600"></i> Device Inventory
                            <span className="text-xs bg-sky-600 text-white px-2 py-1 rounded-full">{devices.length}</span>
                        </h1>
                    </div>
                    <div className="relative w-full md:w-96">
                        <i className="fas fa-search absolute left-3 top-3 text-slate-400"></i>
                        <input 
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-full text-sm font-bold focus:ring-2 focus:ring-sky-200 outline-none transition-all"
                            placeholder="Search devices..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6 space-y-8">
                {categories.map(cat => (
                    <div key={cat} className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-1 bg-sky-500 rounded-full"></div>
                            <h2 className="text-xl font-bold text-slate-800">{cat}</h2>
                            <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{filteredDevices.filter(d => (d.category||'Other').toUpperCase() === cat).length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredDevices.filter(d => (d.category||'Other').toUpperCase() === cat).map(dev => {
                                const stMaint = checkStatus(dev.maintDate);
                                const hasAlert = stMaint.text !== 'Valid';
                                return (
                                    <div key={dev.id} className={`bg-white rounded-2xl p-5 shadow-sm border transition-all hover:-translate-y-1 hover:shadow-lg relative group ${hasAlert ? 'border-red-200 bg-red-50/10' : 'border-slate-100'}`}>
                                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openEdit(dev)} className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 hover:bg-sky-200 flex items-center justify-center"><i className="fas fa-pen text-xs"></i></button>
                                            <button onClick={() => handleDelete(dev.id)} className="w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center"><i className="fas fa-trash text-xs"></i></button>
                                        </div>
                                        
                                        <div className="flex gap-4 items-center mb-4">
                                            <img src={dev.image || 'https://via.placeholder.com/150'} className="w-16 h-16 rounded-xl object-cover bg-slate-100 border border-slate-200" alt="Device" />
                                            <div>
                                                <h3 className="font-bold text-slate-800 leading-tight">{dev.name}</h3>
                                                <p className="text-xs text-slate-500 font-mono mt-1">{dev.serial}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Inst: {dev.installDate || 'N/A'}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                                                <a href={dev.maintUrl || '#'} target="_blank" className={`text-xs font-bold flex items-center gap-1 ${dev.maintUrl ? 'text-sky-600 hover:underline' : 'text-slate-400 cursor-not-allowed'}`}>
                                                    <i className="fas fa-file-contract"></i> PPM Report
                                                </a>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${stMaint.class}`}>{stMaint.text}</span>
                                            </div>
                                            {['CT','X-Ray','Portable','C-ARM'].some(x => (dev.category||'').includes(x)) && (
                                                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                                                    <a href={dev.qualUrl || '#'} target="_blank" className={`text-xs font-bold flex items-center gap-1 ${dev.qualUrl ? 'text-purple-600 hover:underline' : 'text-slate-400 cursor-not-allowed'}`}>
                                                        <i className="fas fa-shield-alt"></i> QC Report
                                                    </a>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${checkStatus(dev.qualDate).class}`}>{checkStatus(dev.qualDate).text}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="fixed bottom-8 right-8 w-14 h-14 bg-sky-600 text-white rounded-full shadow-xl flex items-center justify-center text-2xl hover:scale-110 hover:rotate-90 transition-all z-40">
                <i className="fas fa-plus"></i>
            </button>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-fade-in-up">
                        <h2 className="text-xl font-black text-slate-800 mb-6 border-b border-slate-100 pb-4">
                            {editingId ? 'Edit Device' : 'Add New Device'}
                        </h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Category</label>
                                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                                    <option value="">Select...</option>
                                    {xrayCategories.concat(['MRI','Ultrasound','Other']).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Name</label>
                                <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Serial Number</label>
                                <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" value={formData.serial} onChange={e => setFormData({...formData, serial: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Installation Date</label>
                                <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" value={formData.installDate} onChange={e => setFormData({...formData, installDate: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Device Image</label>
                                <div className="flex gap-2">
                                    <input type="file" className="text-xs w-full" onChange={e => e.target.files && handleFileUpload(e.target.files[0], 'image')} />
                                    {uploadingImg && <i className="fas fa-spinner fa-spin text-sky-500"></i>}
                                </div>
                            </div>
                            
                            <div className="md:col-span-2 border-t border-dashed border-slate-200 pt-4 mt-2">
                                <span className="text-xs font-bold text-sky-600 uppercase tracking-widest block mb-4">Maintenance & Reports</span>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">PPM Report (PDF)</label>
                                <div className="flex gap-2">
                                    <input type="file" className="text-xs w-full" onChange={e => e.target.files && handleFileUpload(e.target.files[0], 'maintUrl')} />
                                    {uploadingPPM && <i className="fas fa-spinner fa-spin text-sky-500"></i>}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">PPM Expiry</label>
                                <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" value={formData.maintDate} onChange={e => setFormData({...formData, maintDate: e.target.value})} />
                            </div>

                            {showQualityFields && (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 mb-1 block">QC Report (PDF)</label>
                                        <div className="flex gap-2">
                                            <input type="file" className="text-xs w-full" onChange={e => e.target.files && handleFileUpload(e.target.files[0], 'qualUrl')} />
                                            {uploadingQC && <i className="fas fa-spinner fa-spin text-sky-500"></i>}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 mb-1 block">QC Expiry</label>
                                        <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" value={formData.qualDate} onChange={e => setFormData({...formData, qualDate: e.target.value})} />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex justify-end gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">Cancel</button>
                            <button onClick={handleSubmit} className="px-6 py-3 rounded-xl bg-sky-600 text-white font-bold hover:bg-sky-700 shadow-lg">Save Device</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeviceInventory;
