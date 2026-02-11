
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { uploadFile } from '../../services/storageClient';
import { useLanguage } from '../../contexts/LanguageContext';
import Toast from '../../components/Toast';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

// --- COLOR THEMES ---
const THEMES: Record<string, any> = {
    'MRI': { 
        gradient: 'from-violet-500 to-purple-600', 
        light: 'from-violet-50 to-purple-50',
        text: 'text-violet-700', 
        border: 'border-violet-200', 
        iconBg: 'bg-violet-100', 
        shadow: 'shadow-violet-200' 
    },
    'CT': { 
        gradient: 'from-cyan-500 to-blue-600', 
        light: 'from-cyan-50 to-blue-50',
        text: 'text-cyan-700', 
        border: 'border-cyan-200', 
        iconBg: 'bg-cyan-100', 
        shadow: 'shadow-cyan-200' 
    },
    'X-RAY': { 
        gradient: 'from-emerald-500 to-teal-600', 
        light: 'from-emerald-50 to-teal-50',
        text: 'text-emerald-700', 
        border: 'border-emerald-200', 
        iconBg: 'bg-emerald-100', 
        shadow: 'shadow-emerald-200' 
    },
    'ULTRASOUND': { 
        gradient: 'from-pink-500 to-rose-600', 
        light: 'from-pink-50 to-rose-50',
        text: 'text-pink-700', 
        border: 'border-pink-200', 
        iconBg: 'bg-pink-100', 
        shadow: 'shadow-pink-200' 
    },
    'DEFAULT': { 
        gradient: 'from-slate-700 to-slate-900', 
        light: 'from-white to-slate-50',
        text: 'text-slate-700', 
        border: 'border-slate-200', 
        iconBg: 'bg-slate-100', 
        shadow: 'shadow-slate-200' 
    }
};

const getTheme = (cat: string) => {
    const key = Object.keys(THEMES).find(k => cat.toUpperCase().includes(k)) || 'DEFAULT';
    return THEMES[key];
};

const DeviceInventory: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [devices, setDevices] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [loading, setLoading] = useState(true);

    // Accordion State
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

    const toggleCategory = (cat: string) => {
        const newSet = new Set(expandedCategories);
        if (newSet.has(cat)) newSet.delete(cat);
        else newSet.add(cat);
        setExpandedCategories(newSet);
    };

    // --- Logic ---
    const filteredDevices = devices.filter(d => 
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        d.serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
const categories = [
  ...new Set(
    filteredDevices.map(d => (d.category || 'Other').toUpperCase())
  )
] as string[];

    const checkDateStatus = (dateStr: string) => {
        if (!dateStr) return 'NA';
        const today = new Date();
        const expiry = new Date(dateStr);
        const warningDate = new Date(expiry);
        warningDate.setDate(expiry.getDate() - 30);
        
        if (today > expiry) return 'EXPIRED';
        if (today >= warningDate) return 'WARNING';
        return 'VALID';
    };

    // Analyze status for a specific device (checks both PPM and QC)
    const getDeviceStatus = (dev: any) => {
        const ppmStatus = checkDateStatus(dev.maintDate);
        const qcStatus = checkDateStatus(dev.qualDate);

        if (ppmStatus === 'EXPIRED' || qcStatus === 'EXPIRED') {
            return { class: 'bg-red-500 text-white shadow-lg shadow-red-200 border-red-400 animate-pulse', text: 'EXPIRED', icon: 'fa-exclamation-triangle', level: 3 };
        }
        if (ppmStatus === 'WARNING' || qcStatus === 'WARNING') {
            return { class: 'bg-amber-500 text-white shadow-lg shadow-amber-200 border-amber-400', text: 'DUE SOON', icon: 'fa-clock', level: 2 };
        }
        if (ppmStatus === 'NA' && qcStatus === 'NA') {
            return { class: 'bg-slate-200 text-slate-500 border-slate-300', text: 'N/A', icon: 'fa-minus', level: 0 };
        }
        return { class: 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 border-emerald-400', text: 'VALID', icon: 'fa-check-circle', level: 1 };
    };

    // Calculate status for the entire category Group
    const getGroupStatus = (groupDevices: any[]) => {
        let maxLevel = 0;
        let alertCount = 0;

        groupDevices.forEach(d => {
            const status = getDeviceStatus(d);
            if (status.level > maxLevel) maxLevel = status.level;
            if (status.level >= 2) alertCount++;
        });

        if (maxLevel === 3) return { type: 'CRITICAL', bg: 'bg-gradient-to-r from-red-600 to-rose-600 animate-pulse-slow', border: 'border-red-400', alertCount };
        if (maxLevel === 2) return { type: 'WARNING', bg: 'bg-gradient-to-r from-amber-500 to-orange-500', border: 'border-amber-400', alertCount };
        return { type: 'OK', bg: '', border: '', alertCount: 0 };
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20 relative overflow-hidden" dir="ltr">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-blue-900 to-slate-900 z-0"></div>
            <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl z-0"></div>
            <div className="absolute top-[100px] left-[-50px] w-64 h-64 bg-purple-500/20 rounded-full blur-3xl z-0"></div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* Header */}
            <div className="relative z-10 px-6 py-8">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button onClick={() => navigate('/supervisor')} className="w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all border border-white/10">
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <div>
                            <h1 className="text-3xl font-black text-white flex items-center gap-3">
                                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 text-transparent bg-clip-text">Device Inventory</span>
                            </h1>
                            <p className="text-blue-200 font-medium">Manage & Track Equipment Status</p>
                        </div>
                    </div>
                    
                    <div className="relative w-full md:w-96 group">
                        <i className="fas fa-search absolute left-4 top-4 text-blue-300 group-focus-within:text-cyan-400 transition-colors"></i>
                        <input 
                            className="w-full pl-12 pr-6 py-3.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-blue-200 focus:bg-white/20 focus:border-cyan-400/50 focus:ring-4 focus:ring-cyan-500/20 outline-none transition-all font-bold"
                            placeholder="Search devices, serials..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="relative z-10 max-w-7xl mx-auto p-6 space-y-6">
                {categories.map(cat => {
                    const theme = getTheme(cat);
                    const catDevices = filteredDevices.filter(d => (d.category||'Other').toUpperCase() === cat);
                    const groupStatus = getGroupStatus(catDevices);
                    const isExpanded = expandedCategories.has(cat);
                    
                    // Header Styling based on Alert Status
                    const headerStyle = groupStatus.type !== 'OK' 
                        ? `${groupStatus.bg} text-white shadow-lg border-2 ${groupStatus.border}`
                        : `bg-white hover:bg-slate-50 text-slate-800 border border-slate-200`;

                    const countBadgeStyle = groupStatus.type !== 'OK'
                        ? 'bg-white/20 text-white border-white/30'
                        : `bg-slate-100 ${theme.text} border-slate-200`;

                    return (
                        <div key={cat} className="rounded-[2rem] overflow-hidden shadow-sm transition-all duration-300">
                            {/* Accordion Header */}
                            <div 
                                onClick={() => toggleCategory(cat)}
                                className={`p-5 flex items-center justify-between cursor-pointer transition-all ${headerStyle}`}
                            >
                                <div className="flex items-center gap-4">
                                    {groupStatus.type !== 'OK' ? (
                                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl backdrop-blur-sm animate-pulse">
                                            <i className="fas fa-exclamation-triangle"></i>
                                        </div>
                                    ) : (
                                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${theme.gradient} flex items-center justify-center text-white text-xl shadow-md`}>
                                            <i className="fas fa-cubes"></i>
                                        </div>
                                    )}
                                    
                                    <div>
                                        <h2 className="text-xl font-black uppercase tracking-wide">{cat}</h2>
                                        <p className={`text-xs font-bold ${groupStatus.type !== 'OK' ? 'text-white/80' : 'text-slate-400'}`}>
                                            {catDevices.length} Machines
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {/* Alert Badge */}
                                    {groupStatus.alertCount > 0 && (
                                        <div className="flex items-center gap-2 bg-red-600 text-white px-3 py-1.5 rounded-full text-xs font-black shadow-md border-2 border-white animate-bounce">
                                            <i className="fas fa-bell"></i> {groupStatus.alertCount} ALERTS
                                        </div>
                                    )}
                                    
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-white/30' : ''}`}>
                                        <i className="fas fa-chevron-down"></i>
                                    </div>
                                </div>
                            </div>

                            {/* Accordion Content */}
                            <div className={`bg-slate-50 transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[2000px] opacity-100 p-6' : 'max-h-0 opacity-0 p-0'}`}>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {catDevices.map(dev => {
                                        const statusInfo = getDeviceStatus(dev);
                                        
                                        return (
                                            <div key={dev.id} className={`group relative bg-white rounded-[2rem] p-1 shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300 border border-slate-100`}>
                                                
                                                <div className="rounded-[1.8rem] h-full overflow-hidden flex flex-col relative">
                                                    
                                                    {/* Action Buttons */}
                                                    <div className="absolute top-3 right-3 flex gap-2 z-20 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                                        <button onClick={() => openEdit(dev)} className="w-9 h-9 rounded-full bg-white/90 backdrop-blur text-blue-600 shadow-md hover:bg-blue-600 hover:text-white flex items-center justify-center transition-colors"><i className="fas fa-pen"></i></button>
                                                        <button onClick={() => handleDelete(dev.id)} className="w-9 h-9 rounded-full bg-white/90 backdrop-blur text-red-500 shadow-md hover:bg-red-500 hover:text-white flex items-center justify-center transition-colors"><i className="fas fa-trash"></i></button>
                                                    </div>

                                                    {/* Device Image */}
                                                    <div className="h-40 w-full relative overflow-hidden bg-slate-100">
                                                        {dev.image ? (
                                                            <img src={dev.image} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Device" />
                                                        ) : (
                                                            <div className={`w-full h-full flex items-center justify-center ${theme.iconBg}`}>
                                                                <i className={`fas fa-microscope text-4xl opacity-30 ${theme.text}`}></i>
                                                            </div>
                                                        )}
                                                        {/* Status Badge */}
                                                        <div className="absolute bottom-3 left-3">
                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wider flex items-center gap-1.5 border-2 border-white/20 shadow-lg backdrop-blur-md ${statusInfo.class}`}>
                                                                <i className={`fas ${statusInfo.icon}`}></i> {statusInfo.text}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="p-5 flex-1 flex flex-col">
                                                        <h3 className="text-lg font-black text-slate-800 leading-tight mb-1">{dev.name}</h3>
                                                        <p className="text-xs font-mono font-bold text-slate-400 mb-4 bg-slate-50 w-fit px-2 py-0.5 rounded border border-slate-100">SN: {dev.serial || 'N/A'}</p>

                                                        <div className="space-y-3 mt-auto">
                                                            {/* PPM Report */}
                                                            <div className={`flex justify-between items-center p-2.5 rounded-xl border transition-colors ${dev.maintUrl ? 'bg-slate-50 border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-100' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${dev.maintUrl ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-400'}`}>
                                                                        <i className="fas fa-file-contract"></i>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-bold text-slate-500 uppercase">PPM Report</p>
                                                                        <p className={`text-[10px] font-black ${checkDateStatus(dev.maintDate) !== 'VALID' ? 'text-red-500' : 'text-slate-800'}`}>{dev.maintDate || 'No Date'}</p>
                                                                    </div>
                                                                </div>
                                                                {dev.maintUrl && (
                                                                    <a href={dev.maintUrl} target="_blank" className="text-blue-600 hover:text-blue-800"><i className="fas fa-external-link-alt"></i></a>
                                                                )}
                                                            </div>

                                                            {/* QC Report (Conditional) */}
                                                            {['CT','X-Ray','Portable','C-ARM'].some(x => (dev.category||'').includes(x)) && (
                                                                <div className={`flex justify-between items-center p-2.5 rounded-xl border transition-colors ${dev.qualUrl ? 'bg-slate-50 border-slate-100 group-hover:bg-purple-50 group-hover:border-purple-100' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${dev.qualUrl ? 'bg-purple-100 text-purple-600' : 'bg-slate-200 text-slate-400'}`}>
                                                                            <i className="fas fa-shield-alt"></i>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[10px] font-bold text-slate-500 uppercase">QC Report</p>
                                                                            <p className={`text-[10px] font-black ${checkDateStatus(dev.qualDate) !== 'VALID' ? 'text-red-500' : 'text-slate-800'}`}>{dev.qualDate || 'No Date'}</p>
                                                                        </div>
                                                                    </div>
                                                                    {dev.qualUrl && (
                                                                        <a href={dev.qualUrl} target="_blank" className="text-purple-600 hover:text-purple-800"><i className="fas fa-external-link-alt"></i></a>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Floating Add Button */}
            <button 
                onClick={() => { resetForm(); setIsModalOpen(true); }} 
                className="fixed bottom-8 right-8 w-16 h-16 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-full shadow-[0_10px_30px_rgba(37,99,235,0.5)] flex items-center justify-center text-2xl hover:scale-110 hover:rotate-90 transition-all z-40 border-4 border-white/20 backdrop-blur-sm"
            >
                <i className="fas fa-plus"></i>
            </button>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl animate-scale-in">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-black text-slate-800">
                                {editingId ? 'Edit Device Details' : 'Add New Device'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Device Category</label>
                                <div className="relative">
                                    <select 
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all appearance-none"
                                        value={formData.category}
                                        onChange={e => setFormData({...formData, category: e.target.value})}
                                    >
                                        <option value="">Select Category...</option>
                                        {xrayCategories.concat(['MRI','Ultrasound','Other']).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <i className="fas fa-chevron-down absolute right-4 top-5 text-slate-400 pointer-events-none"></i>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Device Name</label>
                                <input className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all" placeholder="e.g. MRI Siemens Vida" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Serial Number</label>
                                <input className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all" placeholder="SN-123456" value={formData.serial} onChange={e => setFormData({...formData, serial: e.target.value})} />
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Install Date</label>
                                <input type="date" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all" value={formData.installDate} onChange={e => setFormData({...formData, installDate: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Device Image</label>
                                <div className="relative group cursor-pointer">
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={e => e.target.files && handleFileUpload(e.target.files[0], 'image')} />
                                    <div className={`w-full p-3.5 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-all ${formData.image ? 'border-emerald-400 bg-emerald-50 text-emerald-600' : 'border-slate-300 bg-slate-50 text-slate-400 group-hover:border-blue-400 group-hover:text-blue-500'}`}>
                                        {uploadingImg ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-camera"></i>}
                                        <span className="text-xs font-bold">{formData.image ? 'Image Uploaded' : 'Upload Photo'}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="md:col-span-2 py-2">
                                <div className="h-px w-full bg-slate-100"></div>
                            </div>

                            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 md:col-span-2">
                                <h3 className="font-bold text-blue-800 text-sm mb-4 flex items-center gap-2"><i className="fas fa-tools"></i> Preventive Maintenance (PPM)</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-blue-400 uppercase mb-1 block">Expiry Date</label>
                                        <input type="date" className="w-full bg-white border border-blue-200 rounded-lg p-2 text-sm font-bold text-slate-700" value={formData.maintDate} onChange={e => setFormData({...formData, maintDate: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-blue-400 uppercase mb-1 block">Report PDF</label>
                                        <div className="relative">
                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={e => e.target.files && handleFileUpload(e.target.files[0], 'maintUrl')} />
                                            <div className={`w-full p-2 rounded-lg border border-blue-200 flex items-center justify-center gap-2 text-xs font-bold bg-white ${formData.maintUrl ? 'text-emerald-600' : 'text-blue-400'}`}>
                                                {uploadingPPM ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-upload"></i>}
                                                {formData.maintUrl ? 'File Attached' : 'Upload Report'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {showQualityFields && (
                                <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 md:col-span-2">
                                    <h3 className="font-bold text-purple-800 text-sm mb-4 flex items-center gap-2"><i className="fas fa-certificate"></i> Quality Control (QC)</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-purple-400 uppercase mb-1 block">Expiry Date</label>
                                            <input type="date" className="w-full bg-white border border-purple-200 rounded-lg p-2 text-sm font-bold text-slate-700" value={formData.qualDate} onChange={e => setFormData({...formData, qualDate: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-purple-400 uppercase mb-1 block">Report PDF</label>
                                            <div className="relative">
                                                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={e => e.target.files && handleFileUpload(e.target.files[0], 'qualUrl')} />
                                                <div className={`w-full p-2 rounded-lg border border-purple-200 flex items-center justify-center gap-2 text-xs font-bold bg-white ${formData.qualUrl ? 'text-emerald-600' : 'text-purple-400'}`}>
                                                    {uploadingQC ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-upload"></i>}
                                                    {formData.qualUrl ? 'File Attached' : 'Upload Report'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4 pt-4 border-t border-slate-100">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSubmit} className="flex-[2] py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold hover:shadow-lg transition-all shadow-blue-200 shadow-md">
                                {editingId ? 'Update Device' : 'Save Device'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeviceInventory;
