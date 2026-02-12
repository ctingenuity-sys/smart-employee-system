import React, { useState, useEffect, useMemo } from 'react';
import { inventoryDb, inventoryStorage } from '../firebaseInventory';
// @ts-ignore
import { collection, addDoc, doc, updateDoc, onSnapshot, Timestamp, deleteDoc } from 'firebase/firestore';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Material, Invoice, MaterialUsage, ForecastResult } from '../types';
import Loading from '../components/Loading';
import Toast from '../components/Toast';
import { useLanguage } from '../contexts/LanguageContext';
import { PrintHeader, PrintFooter } from './PrintLayout';
import { GoogleGenAI } from "@google/genai";

interface InventorySystemProps {
    userRole: string;
    userName: string;
    userEmail: string;
}

const InventorySystem: React.FC<InventorySystemProps> = ({ userRole, userName, userEmail }) => {
    const { t, dir } = useLanguage();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'usage' | 'incoming' | 'materials' | 'reports'>('dashboard');
    const [materials, setMaterials] = useState<Material[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [usages, setUsages] = useState<MaterialUsage[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);

    // AI Forecasting State
    const [forecasts, setForecasts] = useState<ForecastResult[]>([]);
    const [isForecasting, setIsForecasting] = useState(false);

    // --- Inputs States ---
    const [selectedMaterial, setSelectedMaterial] = useState('');
    const [usageAmount, setUsageAmount] = useState('');
    const [patientFileNumber, setPatientFileNumber] = useState('');

    const [incMaterial, setIncMaterial] = useState('');
    const [incQuantity, setIncQuantity] = useState('');
    const [incExpiry, setIncExpiry] = useState('');
    const [incImage, setIncImage] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    const [newMatName, setNewMatName] = useState('');
    const [newMatQty, setNewMatQty] = useState('');
    const [editingMat, setEditingMat] = useState<Material | null>(null);
    const [materialSearch, setMaterialSearch] = useState('');

    // Report Filters (Updated for Range)
    const [reportFilter, setReportFilter] = useState<'all' | 'range'>('range');
    const [reportStart, setReportStart] = useState(new Date().toISOString().slice(0, 7));
    const [reportEnd, setReportEnd] = useState(new Date().toISOString().slice(0, 7));

    // Incoming Tab Filter
    const [incomingViewMonth, setIncomingViewMonth] = useState(new Date().toISOString().slice(0, 7));

    const isAdmin = userRole === 'admin' || userRole === 'supervisor';

    useEffect(() => {
        setLoading(true);
        const unsubMat = onSnapshot(collection(inventoryDb, 'materials'), (snap: any) => {
            setMaterials(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Material)));
        });
        const unsubInv = onSnapshot(collection(inventoryDb, 'invoices'), (snap: any) => {
            const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Invoice));
            setInvoices(list.sort((a: any, b: any) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date(a.date?.seconds * 1000);
                const db = b.date?.toDate ? b.date.toDate() : new Date(b.date?.seconds * 1000);
                return db.getTime() - da.getTime();
            }));
        });
        const unsubUse = onSnapshot(collection(inventoryDb, 'usages'), (snap: any) => {
            const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as MaterialUsage));
            setUsages(list.sort((a: any, b: any) => {
                const da = a.date?.toDate ? a.date.toDate() : new Date(a.date?.seconds * 1000);
                const db = b.date?.toDate ? b.date.toDate() : new Date(b.date?.seconds * 1000);
                return db.getTime() - da.getTime();
            }));
        });

        setLoading(false);
        return () => { unsubMat(); unsubInv(); unsubUse(); };
    }, []);

    // ... (rest of the component implementation)
    const frequentMaterials = useMemo(() => {
        const counts: Record<string, number> = {};
        usages.forEach(u => {
            counts[u.material] = (counts[u.material] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(entry => entry[0]);
    }, [usages]);

    const stats = useMemo(() => {
        const lowStock = materials.filter(m => m.quantity <= 10).length;
        const totalItems = materials.reduce((acc, curr) => acc + curr.quantity, 0);
        const totalUsages = usages.length;
        const recentIncomings = invoices.length;
        
        const today = new Date();
        const nextMonth = new Date();
        nextMonth.setMonth(today.getMonth() + 1);
        
        const expiringSoon = invoices.filter(inv => {
            if (!inv.expiryDate) return false;
            const exp = new Date(inv.expiryDate);
            return exp >= today && exp <= nextMonth;
        }).length;

        return { lowStock, totalItems, totalUsages, recentIncomings, expiringSoon };
    }, [materials, usages, invoices]);

    // --- AI FORECASTING LOGIC ---
    const generateForecast = async () => {
        setIsForecasting(true);
        try {
            const apiKey = (process.env.API_KEY || '').trim();
            if (!apiKey) throw new Error("API Key missing");
            const ai = new GoogleGenAI({ apiKey });

            // Prepare Data: Current Stock + Usage History (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const recentUsages = usages.filter(u => {
                const d = u.date.toDate ? u.date.toDate() : new Date(u.date.seconds * 1000);
                return d >= thirtyDaysAgo;
            });

            // Format for AI
            const usageData = recentUsages.map(u => ({
                material: u.material,
                date: u.date.toDate ? u.date.toDate().toISOString().split('T')[0] : '',
                amount: u.amount
            }));

            const stockData = materials.map(m => ({
                name: m.name,
                current: m.quantity
            }));

            const prompt = `
                Analyze usage and stock to predict run-out dates.
                
                Current Stock:
                ${JSON.stringify(stockData)}
                
                Usage History (Last 30 Days):
                ${JSON.stringify(usageData)}
                
                For EACH material, calculate:
                1. Average daily usage (based on history).
                2. Days until stock hits zero.
                3. Predicted Date (YYYY-MM-DD).
                
                Return JSON ONLY:
                [
                  {
                    "materialName": "string",
                    "currentStock": number,
                    "avgDailyUsage": number,
                    "daysLeft": number,
                    "predictedDate": "YYYY-MM-DD",
                    "status": "critical" | "low" | "good" // critical if < 7 days, low if < 14 days
                  }
                ]
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { responseMimeType: 'application/json' }
            });

            const resultText = response.text || "[]";
            const predictions = JSON.parse(resultText) as ForecastResult[];
            setForecasts(predictions);
            setToast({ msg: 'Forecast Generated!', type: 'success' });

        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Forecasting failed: ' + e.message, type: 'error' });
        } finally {
            setIsForecasting(false);
        }
    };

    const handleUsageSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMaterial || !usageAmount || !patientFileNumber) {
            setToast({ msg: 'Missing Data', type: 'error' });
            return;
        }

        const mat = materials.find(m => m.name === selectedMaterial);
        if (!mat) return;

        const amount = parseFloat(usageAmount);
        if (mat.quantity < amount) {
            setToast({ msg: 'Not enough stock', type: 'error' });
            return;
        }

        try {
            await updateDoc(doc(inventoryDb, 'materials', mat.id), { quantity: mat.quantity - amount });
            await addDoc(collection(inventoryDb, 'usages'), {
                material: selectedMaterial,
                amount: amount,
                patientFileNumber,
                staffName: userName,
                staffEmail: userEmail,
                staffRole: userRole,
                date: Timestamp.now()
            });

            setToast({ msg: t('save'), type: 'success' });
            setUsageAmount('');
            setPatientFileNumber('');
        } catch (err) {
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    const handleIncomingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!incMaterial || !incQuantity) {
            setToast({ msg: 'Missing Data', type: 'error' });
            return;
        }

        setUploading(true);
        try {
            const mat = materials.find(m => m.name === incMaterial);
            if (!mat) throw new Error('Material not found');

            let imageUrl = null;
            if (incImage) {
                const storageRef = ref(inventoryStorage, `invoices/${Date.now()}_${incImage.name}`);
                await uploadBytes(storageRef, incImage);
                imageUrl = await getDownloadURL(storageRef);
            }

            const qty = parseFloat(incQuantity);
            await updateDoc(doc(inventoryDb, 'materials', mat.id), { quantity: mat.quantity + qty });
            await addDoc(collection(inventoryDb, 'invoices'), {
                material: incMaterial,
                quantityAdded: qty,
                date: Timestamp.now(),
                expiryDate: incExpiry || null,
                imageUrl: imageUrl,
                createdBy: userName // Save user who added stock for reporting
            });

            setToast({ msg: t('save'), type: 'success' });
            setIncQuantity('');
            setIncExpiry('');
            setIncImage(null);
        } catch (err: any) {
            setToast({ msg: 'Error: ' + err.message, type: 'error' });
        } finally {
            setUploading(false);
        }
    };

    const handleMaterialSave = async () => {
        if (!newMatName || !newMatQty) return;
        try {
            const qty = parseFloat(newMatQty);
            if (editingMat) {
                await updateDoc(doc(inventoryDb, 'materials', editingMat.id), { name: newMatName, quantity: qty });
                setToast({ msg: t('save'), type: 'success' });
            } else {
                await addDoc(collection(inventoryDb, 'materials'), { name: newMatName, quantity: qty });
                setToast({ msg: t('save'), type: 'success' });
            }
            setNewMatName(''); setNewMatQty(''); setEditingMat(null);
        } catch (err) {
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    const handleDeleteUsage = async (id: string) => {
        if(!confirm(t('confirm') + '?')) return;
        try {
            await deleteDoc(doc(inventoryDb, 'usages', id));
            setToast({ msg: t('delete'), type: 'success' });
        } catch (e) {
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    const handleDeleteInvoice = async (id: string) => {
        if(!confirm(t('confirm') + '?')) return;
        try {
            await deleteDoc(doc(inventoryDb, 'invoices', id));
            setToast({ msg: t('delete'), type: 'success' });
        } catch (e) {
            setToast({ msg: 'Error', type: 'error' });
        }
    };

    // --- AGGREGATION LOGIC FOR REPORTS (UPDATED FOR RANGE) ---

    // 1. Filter Raw Data based on Report Settings
    const filteredUsages = useMemo(() => {
        return usages.filter(u => {
            if (reportFilter === 'all') return true;
            if (!u.date) return false;
            const d = u.date.toDate ? u.date.toDate() : new Date(u.date.seconds * 1000);
            const iso = d.toISOString().slice(0, 7);
            return iso >= reportStart && iso <= reportEnd;
        });
    }, [usages, reportFilter, reportStart, reportEnd]);

    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv => {
            if (reportFilter === 'all') return true;
            if (!inv.date) return false;
            const d = inv.date.toDate ? inv.date.toDate() : new Date(inv.date.seconds * 1000);
            const iso = d.toISOString().slice(0, 7);
            return iso >= reportStart && iso <= reportEnd;
        });
    }, [invoices, reportFilter, reportStart, reportEnd]);

    // 2. Incoming Tab Display Data (Separate filter for the Incoming Tab view)
    const displayedInvoices = useMemo(() => {
        return invoices.filter(inv => {
            if (!inv.date) return false;
            const d = inv.date.toDate ? inv.date.toDate() : new Date(inv.date.seconds * 1000);
            const iso = d.toISOString().slice(0, 7);
            return iso === incomingViewMonth;
        });
    }, [invoices, incomingViewMonth]);

    // 3. Detailed Material Breakdown
    const materialStats = useMemo(() => {
        interface MatStat {
            totalIn: number;
            totalOut: number;
            staffUsage: Record<string, number>;
        }
        const stats: Record<string, MatStat> = {};

        // Process Invoices
        filteredInvoices.forEach(inv => {
            if (!stats[inv.material]) stats[inv.material] = { totalIn: 0, totalOut: 0, staffUsage: {} };
            stats[inv.material].totalIn += inv.quantityAdded;
        });

        // Process Usages
        filteredUsages.forEach(use => {
            if (!stats[use.material]) stats[use.material] = { totalIn: 0, totalOut: 0, staffUsage: {} };
            stats[use.material].totalOut += use.amount;
            
            const staff = use.staffName || 'Unknown';
            if (!stats[use.material].staffUsage[staff]) stats[use.material].staffUsage[staff] = 0;
            stats[use.material].staffUsage[staff] += use.amount;
        });

        return Object.entries(stats).sort((a,b) => a[0].localeCompare(b[0])); // Sort by material name
    }, [filteredInvoices, filteredUsages]);

    const totalIncoming = filteredInvoices.reduce((acc, curr) => acc + curr.quantityAdded, 0);
    const totalOutgoing = filteredUsages.reduce((acc, curr) => acc + curr.amount, 0);


    const filteredMaterials = materials.filter(m => 
        m.name.toLowerCase().includes(materialSearch.toLowerCase())
    );

    if (loading) return <Loading />;

    return (
        <div className="flex h-full min-h-screen bg-slate-50 print:bg-white" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* --- Internal Sidebar --- */}
            <div className="w-64 bg-white border-l border-slate-200 flex flex-col hidden lg:flex print:hidden">
                <div className="p-6">
                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        <i className="fas fa-boxes text-emerald-500"></i> {t('nav.inventory')}
                    </h2>
                </div>
                
                <nav className="flex-1 px-4 space-y-2">
                    <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-slate-800 text-white shadow-lg shadow-slate-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <i className="fas fa-th-large w-5"></i>
                        <span className="font-bold text-sm">{t('inv.dashboard')}</span>
                    </button>
                    <button onClick={() => setActiveTab('usage')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'usage' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <i className="fas fa-hand-holding-medical w-5"></i>
                        <span className="font-bold text-sm">{t('inv.usage')}</span>
                    </button>
                    
                    {isAdmin && (
                        <>
                            <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reports' ? 'bg-purple-600 text-white shadow-lg shadow-purple-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <i className="fas fa-chart-bar w-5"></i>
                                <span className="font-bold text-sm">{t('inv.reports')}</span>
                            </button>
                            <button onClick={() => setActiveTab('incoming')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'incoming' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <i className="fas fa-truck-loading w-5"></i>
                                <span className="font-bold text-sm">{t('inv.incoming')}</span>
                            </button>
                            <button onClick={() => setActiveTab('materials')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'materials' ? 'bg-blue-600 text-white shadow-lg shadow-blue-300' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <i className="fas fa-cubes w-5"></i>
                                <span className="font-bold text-sm">{t('inv.materials')}</span>
                            </button>
                        </>
                    )}
                </nav>

                <div className="p-4 bg-slate-50 m-4 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-emerald-500">{materials.length}</span>
                        <span className="text-xs text-slate-400">{t('inv.mat.unit')}</span>
                    </div>
                </div>
            </div>

            {/* --- Main Content Area --- */}
            <div className="flex-1 p-6 md:p-10 overflow-y-auto print:p-0">
                
                {/* Mobile Navigation */}
                <div className="lg:hidden flex overflow-x-auto gap-2 mb-6 pb-2 no-scrollbar print:hidden">
                    {['dashboard', 'usage'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === tab ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                            {t(`inv.${tab}`)}
                        </button>
                    ))}
                    {isAdmin && ['reports', 'incoming', 'materials'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === tab ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                            {t(`inv.${tab}`)}
                        </button>
                    ))}
                </div>

                {/* --- DASHBOARD TAB --- */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-8 animate-fade-in-up">
                        <header className="mb-8 flex justify-between items-center">
                            <h1 className="text-3xl font-black text-slate-800">{t('inv.dashboard')}</h1>
                            
                            {/* AI Forecasting Button */}
                            <button 
                                onClick={generateForecast} 
                                disabled={isForecasting}
                                className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 hover:scale-105 transition-transform"
                            >
                                {isForecasting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-crystal-ball"></i>}
                                AI Forecast
                            </button>
                        </header>

                        {/* AI Forecast Results Widget */}
                        {forecasts.length > 0 && (
                            <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-purple-100 relative overflow-hidden animate-fade-in">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full blur-3xl -mr-16 -mt-16"></div>
                                <h3 className="font-bold text-purple-900 text-lg mb-4 flex items-center gap-2">
                                    <i className="fas fa-robot text-purple-500"></i> AI Stock Predictions 📦
                                </h3>
                                <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                                    {forecasts.map((f, i) => (
                                        <div key={i} className={`min-w-[200px] p-4 rounded-xl border-l-4 shadow-sm flex-shrink-0 ${f.status === 'critical' ? 'bg-red-50 border-red-500' : f.status === 'low' ? 'bg-orange-50 border-orange-500' : 'bg-emerald-50 border-emerald-500'}`}>
                                            <h4 className="font-bold text-slate-800">{f.materialName}</h4>
                                            <p className="text-xs text-slate-500 mt-1">Runs out in <span className="font-bold">{f.daysLeft} days</span></p>
                                            <p className="text-[10px] text-slate-400">Date: {f.predictedDate}</p>
                                            <div className="mt-2 text-xs font-bold">
                                                Avg Usage: {f.avgDailyUsage.toFixed(1)}/day
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between h-40">
                                <div className="flex justify-between items-start">
                                    <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 text-xl"><i className="fas fa-exclamation-triangle"></i></div>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-slate-800">{stats.lowStock}</h3>
                                    <p className="text-sm font-bold text-slate-400">{t('inv.stat.low')}</p>
                                </div>
                            </div>
                            
                            {stats.expiringSoon > 0 && (
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-orange-100 flex flex-col justify-between h-40 relative overflow-hidden">
                                    <div className="absolute right-0 top-0 w-2 h-full bg-orange-400"></div>
                                    <div className="flex justify-between items-start">
                                        <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 text-xl"><i className="fas fa-hourglass-half"></i></div>
                                    </div>
                                    <div>
                                        <h3 className="text-3xl font-black text-slate-800">{stats.expiringSoon}</h3>
                                        <p className="text-sm font-bold text-slate-400">{t('inv.stat.expiry')}</p>
                                    </div>
                                </div>
                            )}

                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between h-40">
                                <div className="flex justify-between items-start">
                                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 text-xl"><i className="fas fa-hand-holding-medical"></i></div>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-slate-800">{stats.totalUsages}</h3>
                                    <p className="text-sm font-bold text-slate-400">{t('inv.stat.usage')}</p>
                                </div>
                            </div>
                            
                            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-3xl shadow-lg shadow-slate-300 text-white flex flex-col justify-between h-40">
                                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white text-xl"><i className="fas fa-cubes"></i></div>
                                <div>
                                    <h3 className="text-3xl font-black text-white">{stats.totalItems}</h3>
                                    <p className="text-sm font-bold text-slate-400">{t('inv.stat.total')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Low Stock Grid */}
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-battery-quarter text-red-500"></i> {t('inv.stat.low')}
                            </h3>
                            {materials.filter(m => m.quantity <= 10).length === 0 ? (
                                <div className="bg-emerald-50 p-8 rounded-3xl text-center border border-emerald-100">
                                    <i className="fas fa-check-circle text-4xl text-emerald-400 mb-2"></i>
                                    <p className="font-bold text-emerald-700">{t('inv.alert.good')}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {materials.filter(m => m.quantity <= 10).map(m => (
                                        <div key={m.id} className="bg-white p-4 rounded-2xl border-2 border-red-50 flex items-center gap-4 shadow-sm animate-pulse-slow">
                                            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-sm">
                                                {m.quantity}
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 truncate">{m.name}</h4>
                                                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2">
                                                    <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(m.quantity/20)*100}%` }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- USAGE TAB --- */}
                {activeTab === 'usage' && (
                    <div className="max-w-4xl mx-auto animate-fade-in-up">
                        <div className="grid md:grid-cols-2 gap-8 items-start">
                            <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-indigo-100 border border-indigo-50">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl"><i className="fas fa-hand-holding-medical"></i></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-800">{t('inv.usage.title')}</h2>
                                        <p className="text-slate-400 text-sm">{t('inv.usage.subtitle')}</p>
                                    </div>
                                </div>

                                {frequentMaterials.length > 0 && (
                                    <div className="mb-6">
                                        <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">{t('inv.quick')}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {frequentMaterials.map(matName => (
                                                <button 
                                                    key={matName}
                                                    onClick={() => setSelectedMaterial(matName)}
                                                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${selectedMaterial === matName ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                                >
                                                    {matName}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <form onSubmit={handleUsageSubmit} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-600">{t('inv.usage.material')}</label>
                                        <div className="relative">
                                            <select 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 rtl:pr-10 ltr:pl-4 outline-none focus:ring-2 focus:ring-indigo-200 font-bold text-slate-700 appearance-none"
                                                value={selectedMaterial}
                                                onChange={e => setSelectedMaterial(e.target.value)}
                                            >
                                                <option value="">...</option>
                                                {materials.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                            </select>
                                        </div>
                                        {selectedMaterial && (
                                            <div className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg inline-block">
                                                Qty: {materials.find(m => m.name === selectedMaterial)?.quantity}
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-600">{t('inv.usage.amount')}</label>
                                            <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-indigo-200" value={usageAmount} onChange={e => setUsageAmount(e.target.value)} placeholder="0" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-600">{t('inv.usage.file')}</label>
                                            <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-indigo-200" value={patientFileNumber} onChange={e => setPatientFileNumber(e.target.value)} placeholder="File No." />
                                        </div>
                                    </div>
                                    <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-indigo-300 hover:bg-indigo-700 hover:scale-[1.02] transition-all active:scale-95">
                                        {t('inv.usage.confirm')}
                                    </button>
                                </form>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-bold text-slate-700 text-lg">{t('inv.recent')}</h3>
                                {usages.slice(0, 5).map(u => (
                                    <div key={u.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                                <i className="fas fa-syringe"></i>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-sm">{u.material}</h4>
                                                <p className="text-xs text-slate-400">{u.staffName} • {u.patientFileNumber}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="block font-black text-indigo-600">-{u.amount}</span>
                                            <span className="text-[10px] text-slate-400 font-mono dir-ltr">{u.date?.toDate ? u.date.toDate().toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) : ''}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- MATERIALS & INCOMING --- */}
                {(activeTab === 'materials' || activeTab === 'incoming') && (
                    <div className="animate-fade-in-up">
                        {activeTab === 'incoming' ? (
                            <div className="space-y-10">
                                {/* Top: Add New Invoice Form */}
                                <div className="max-w-3xl mx-auto bg-white p-8 rounded-[2rem] shadow-xl border border-emerald-50 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
                                    <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                        <span className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-100"><i className="fas fa-truck-loading"></i></span>
                                        {t('inv.inc.title')}
                                    </h2>
                                    <form onSubmit={handleIncomingSubmit} className="space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <select 
                                                className="col-span-2 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none font-bold text-slate-700 focus:ring-2 focus:ring-emerald-200 transition-all"
                                                value={incMaterial}
                                                onChange={e => setIncMaterial(e.target.value)}
                                            >
                                                <option value="">...</option>
                                                {materials.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                            </select>
                                            <div className="col-span-2 md:col-span-1">
                                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('inv.inc.qty')}</label>
                                                <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-emerald-200 transition-all" value={incQuantity} onChange={e => setIncQuantity(e.target.value)} placeholder="0" />
                                            </div>
                                            <div className="col-span-2 md:col-span-1">
                                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('inv.inc.exp')}</label>
                                                <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none text-slate-600 focus:ring-2 focus:ring-emerald-200 transition-all" value={incExpiry} onChange={e => setIncExpiry(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:bg-emerald-50 hover:border-emerald-300 transition-all relative cursor-pointer group">
                                            <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={e => setIncImage(e.target.files ? e.target.files[0] : null)} />
                                            <div className="relative z-0">
                                                <i className={`fas fa-cloud-upload-alt text-4xl mb-3 transition-colors ${incImage ? 'text-emerald-500' : 'text-slate-300 group-hover:text-emerald-400'}`}></i>
                                                <p className={`font-bold ${incImage ? 'text-emerald-600' : 'text-slate-500 group-hover:text-emerald-600'}`}>{incImage ? incImage.name : t('inv.inc.upload')}</p>
                                            </div>
                                        </div>
                                        <button disabled={uploading} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 hover:scale-[1.01] transition-all active:scale-95 disabled:opacity-70 disabled:scale-100">
                                            {uploading ? <i className="fas fa-spinner fa-spin"></i> : t('inv.inc.btn')}
                                        </button>
                                    </form>
                                </div>

                                {/* Bottom: Invoice History Grid */}
                                <div>
                                    <div className="flex justify-between items-center mb-6 px-2">
                                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                            <i className="fas fa-history text-slate-400"></i> {t('inv.recent')}
                                            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{displayedInvoices.length}</span>
                                        </h3>
                                        {/* INCOMING FILTER */}
                                        <input 
                                            type="month" 
                                            className="bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-200"
                                            value={incomingViewMonth}
                                            onChange={e => setIncomingViewMonth(e.target.value)}
                                        />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {displayedInvoices.map(inv => (
                                            <div key={inv.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col relative">
                                                {isAdmin && (
                                                    <button 
                                                        onClick={() => handleDeleteInvoice(inv.id)}
                                                        className="absolute top-2 left-2 z-20 text-red-400 hover:text-red-600 bg-white/80 p-1.5 rounded-full hover:bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                                                        title="Delete Invoice"
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                )}
                                                {/* Image / Header */}
                                                <div className="h-40 bg-slate-50 relative overflow-hidden cursor-pointer" onClick={() => inv.imageUrl && window.open(inv.imageUrl, '_blank')}>
                                                    {inv.imageUrl ? (
                                                        <>
                                                            <img src={inv.imageUrl} alt="Invoice" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                                <i className="fas fa-external-link-alt text-white text-2xl drop-shadow-md"></i>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-100">
                                                            <i className="fas fa-file-invoice text-4xl mb-2"></i>
                                                            <span className="text-[10px] font-bold uppercase tracking-wider">No Image</span>
                                                        </div>
                                                    )}
                                                    {/* Date Badge */}
                                                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-slate-800 text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm border border-slate-100">
                                                        {inv.date?.toDate ? inv.date.toDate().toLocaleDateString('en-US') : 'N/A'}
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div className="p-5 flex-1 flex flex-col">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <h4 className="font-bold text-slate-800 text-lg truncate pr-2" title={inv.material}>{inv.material}</h4>
                                                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 font-bold text-sm shrink-0 border border-emerald-100">
                                                            <i className="fas fa-arrow-down"></i>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="mt-auto space-y-3">
                                                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                            <span className="text-xs font-bold text-slate-500">{t('inv.inc.qty')}</span>
                                                            <span className="text-xl font-black text-emerald-600">+{inv.quantityAdded}</span>
                                                        </div>
                                                        
                                                        {inv.expiryDate && (
                                                            <div className="flex items-center gap-2 text-xs font-bold text-orange-600 bg-orange-50 px-3 py-2 rounded-lg border border-orange-100">
                                                                <i className="fas fa-hourglass-end"></i>
                                                                <span>Exp: <span className="font-mono">{inv.expiryDate}</span></span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {displayedInvoices.length === 0 && (
                                        <div className="text-center py-16 text-slate-400 bg-white rounded-[2rem] border border-dashed border-slate-200">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <i className="fas fa-box-open text-2xl opacity-50"></i>
                                            </div>
                                            <p className="font-medium">No invoices for {incomingViewMonth}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                                    <h2 className="text-2xl font-black text-slate-800">{t('inv.mat.title')}</h2>
                                    <div className="flex gap-2 w-full md:w-auto">
                                        <div className="relative flex-1 md:w-64">
                                            <i className="fas fa-search absolute right-3 top-3.5 text-slate-400 text-sm"></i>
                                            <input 
                                                className="w-full bg-white border border-slate-200 rounded-xl py-3 pr-9 pl-4 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                                                placeholder={t('search')}
                                                value={materialSearch}
                                                onChange={e => setMaterialSearch(e.target.value)}
                                            />
                                        </div>
                                        <button onClick={() => { setEditingMat(null); setNewMatName(''); setNewMatQty(''); }} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700">
                                            <i className="fas fa-plus rtl:ml-2 ltr:mr-2"></i> {t('add')}
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Add/Edit Area */}
                                {(newMatName || editingMat || newMatQty) && (
                                    <div className="bg-slate-800 p-6 rounded-2xl text-white flex flex-col md:flex-row gap-4 items-center animate-fade-in">
                                        <input className="bg-slate-700 border-none rounded-xl p-3 w-full text-white placeholder-slate-400" placeholder={t('inv.mat.name')} value={newMatName} onChange={e => setNewMatName(e.target.value)} />
                                        <input className="bg-slate-700 border-none rounded-xl p-3 w-full md:w-32 text-white placeholder-slate-400" type="number" placeholder={t('inv.inc.qty')} value={newMatQty} onChange={e => setNewMatQty(e.target.value)} />
                                        <button onClick={handleMaterialSave} className="bg-blue-500 px-6 py-3 rounded-xl font-bold hover:bg-blue-400 w-full md:w-auto">{t('save')}</button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {filteredMaterials.map(m => (
                                        <div key={m.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                                    <i className="fas fa-box"></i>
                                                </div>
                                                <button onClick={() => { setEditingMat(m); setNewMatName(m.name); setNewMatQty(m.quantity.toString()); }} className="text-slate-300 hover:text-blue-500"><i className="fas fa-pen"></i></button>
                                            </div>
                                            <h4 className="font-bold text-slate-800 mb-1 truncate" title={m.name}>{m.name}</h4>
                                            <p className={`text-sm font-bold ${m.quantity <= 10 ? 'text-red-500' : 'text-emerald-500'}`}>{m.quantity} {t('inv.mat.unit')}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- REPORTS TAB --- */}
                {activeTab === 'reports' && (
                    <div className="space-y-6 animate-fade-in-up">
                        
                        <PrintHeader title={t('inv.rep.title')} subtitle="TRANSACTION LOG" />

                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 print:hidden">
                            <h2 className="text-xl font-black text-slate-800">{t('inv.rep.title')}</h2>
                            <div className="flex gap-2 items-center">
                                <select className="bg-slate-50 border-none rounded-lg p-2 text-sm font-bold text-slate-600" value={reportFilter} onChange={e => setReportFilter(e.target.value as any)}>
                                    <option value="all">All Time</option>
                                    <option value="range">Date Range</option>
                                </select>
                                {reportFilter === 'range' && (
                                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1">
                                        <input type="month" className="bg-transparent border-none text-sm p-1" value={reportStart} onChange={e => setReportStart(e.target.value)} />
                                        <span className="text-slate-400 font-bold">➜</span>
                                        <input type="month" className="bg-transparent border-none text-sm p-1" value={reportEnd} onChange={e => setReportEnd(e.target.value)} />
                                    </div>
                                )}
                                <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700"><i className="fas fa-print rtl:ml-2 ltr:mr-2"></i> {t('print')}</button>
                            </div>
                        </div>

                        {/* Detailed Material Breakdown (NEW) */}
                        <div className="print:break-inside-avoid">
                            <h3 className="text-lg font-black text-slate-700 mb-4 uppercase tracking-wider flex items-center gap-2">
                                <i className="fas fa-cubes text-indigo-500"></i> Material Breakdown
                                <span className="text-xs font-normal text-slate-400 ml-2">
                                    ({reportFilter === 'range' ? `${reportStart} ➜ ${reportEnd}` : 'All Time'})
                                </span>
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {materialStats.map(([matName, stat]) => (
                                    <div key={matName} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                        <div className="bg-slate-50 p-3 border-b border-slate-100 flex justify-between items-center">
                                            <h4 className="font-bold text-slate-800 truncate pr-2" title={matName}>{matName}</h4>
                                            <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                                                Net: {stat.totalIn - stat.totalOut > 0 ? '+' : ''}{stat.totalIn - stat.totalOut}
                                            </span>
                                        </div>
                                        
                                        <div className="p-4 space-y-4">
                                            <div className="flex gap-2">
                                                <div className="flex-1 bg-emerald-50 rounded-lg p-2 text-center border border-emerald-100">
                                                    <span className="block text-[10px] text-emerald-600 font-bold uppercase">In</span>
                                                    <span className="block text-lg font-black text-emerald-700">{stat.totalIn}</span>
                                                </div>
                                                <div className="flex-1 bg-red-50 rounded-lg p-2 text-center border border-red-100">
                                                    <span className="block text-[10px] text-red-600 font-bold uppercase">Out</span>
                                                    <span className="block text-lg font-black text-red-700">{stat.totalOut}</span>
                                                </div>
                                            </div>

                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 border-b border-slate-100 pb-1">Consumed By</p>
                                                <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                                                    {Object.entries(stat.staffUsage).length === 0 ? (
                                                        <p className="text-xs text-slate-400 italic text-center py-2">No usage recorded</p>
                                                    ) : (
                                                                    Object.entries(stat.staffUsage)
                                                                            .sort((a, b) => (b[1] as number) - (a[1] as number)) // هنا حددنا النوع
                                                                            .map(([staff, amount]) =>(                                                          
                                                                       <div key={staff} className="flex justify-between items-center text-xs">
                                                                <span className="text-slate-600 font-medium truncate w-2/3" title={staff}>{staff}</span>
                                                                <span className="font-bold text-slate-800 bg-slate-100 px-1.5 rounded">{amount}</span>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Original Detailed Log Table */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden print:border-2 print:border-slate-800 print:shadow-none print:rounded-none">
                            <table className={`w-full text-sm ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 print:bg-white print:border-b-2 print:border-slate-800 print:text-black">
                                    <tr>
                                        <th className="p-4 border-r print:border-slate-800">{t('date')}</th>
                                        <th className="p-4 border-r print:border-slate-800">{t('inv.usage.material')}</th>
                                        <th className="p-4 border-r print:border-slate-800">{t('inv.usage.amount')}</th>
                                        <th className="p-4 border-r print:border-slate-800">{t('role.user')}</th>
                                        <th className="p-4">{t('inv.usage.file')}</th>
                                        {isAdmin && <th className="p-4 print:hidden w-10"></th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 print:divide-slate-800">
                                    {filteredUsages.map(u => (
                                        <tr key={u.id} className="hover:bg-slate-50/50 print:break-inside-avoid group">
                                            <td className="p-4 font-mono text-slate-500 dir-ltr print:text-black border-r print:border-slate-800">{u.date?.toDate ? u.date.toDate().toLocaleDateString('en-US') : 'N/A'}</td>
                                            <td className="p-4 font-bold text-slate-800 border-r print:border-slate-800">{u.material}</td>
                                            <td className="p-4 font-bold text-red-500 border-r print:border-slate-800">-{u.amount}</td>
                                            <td className="p-4 text-slate-600 border-r print:border-slate-800 print:text-black">{u.staffName}</td>
                                            <td className="p-4 font-mono text-slate-500 print:text-black">{u.patientFileNumber}</td>
                                            {isAdmin && (
                                                <td className="p-4 print:hidden text-center">
                                                    <button onClick={() => handleDeleteUsage(u.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        <PrintFooter />
                    </div>
                )}

            </div>
        </div>
    );
};

export default InventorySystem;