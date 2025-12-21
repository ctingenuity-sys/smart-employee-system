
import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, limit, onSnapshot, Timestamp, arrayUnion, where, getDocs } from 'firebase/firestore';
import { ShiftLog, Announcement, User, Location } from '../types';
import Loading from '../components/Loading';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import VoiceInput from '../components/VoiceInput';
import { useLanguage } from '../contexts/LanguageContext';
import { GoogleGenAI } from "@google/genai";

const CommunicationPage: React.FC = () => {
    const { t, dir } = useLanguage();
    const [activeTab, setActiveTab] = useState<'logbook' | 'announcements'>('logbook');
    const [shiftLogs, setShiftLogs] = useState<ShiftLog[]>([]);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'info'|'error'} | null>(null);

    // Forms
    const [logContent, setLogContent] = useState('');
    const [logCategory, setLogCategory] = useState<'general'|'machine'|'patient'|'supply'>('general');
    const [logImportant, setLogImportant] = useState(false);
    const [logLocation, setLogLocation] = useState(''); // Sender Location

    // Checklist State
    const [checklist, setChecklist] = useState({
        devices: false,
        inventory: false,
        keys: false,
        clean: false
    });

    const [newAnnounceTitle, setNewAnnounceTitle] = useState('');
    const [newAnnounceContent, setNewAnnounceContent] = useState('');
    const [newAnnouncePriority, setNewAnnouncePriority] = useState<'normal'|'urgent'|'critical'>('normal');

    // Modals
    const [viewersModal, setViewersModal] = useState<{isOpen: boolean, title: string, viewers: string[]}>({
        isOpen: false, title: '', viewers: []
    });
    
    // Receive Modal
    const [receiveModal, setReceiveModal] = useState<{isOpen: boolean, logId: string}>({
        isOpen: false, logId: ''
    });
    const [receiverLocation, setReceiverLocation] = useState('');

    // Edit Log Modal
    const [editLogModal, setEditLogModal] = useState<{isOpen: boolean, log: ShiftLog | null}>({
        isOpen: false, log: null
    });

    // Edit Announce Modal
    const [editAnnounceModal, setEditAnnounceModal] = useState<{isOpen: boolean, ann: Announcement | null}>({
        isOpen: false, ann: null
    });

    // AI Analysis Modal
    const [showInsightsModal, setShowInsightsModal] = useState(false);
    const [insightsContent, setInsightsContent] = useState('');
    const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

    // Printing & Filtering Filters
    const [filterMonth, setFilterMonth] = useState((new Date().getMonth() + 1).toString());
    const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
    const [isPrinting, setIsPrinting] = useState(false);

    const isFirstLoad = useRef(true);
    const userId = auth.currentUser?.uid;
    const userName = localStorage.getItem('username') || t('role.user');
    const storedRole = localStorage.getItem('role') || 'user';
    const isSupervisor = storedRole === 'admin' || storedRole === 'supervisor';

    // Quick Templates (Dynamic from Language Context)
    const quickTemplates = [
        t('comm.tpl.handover'),
        t('comm.tpl.deviceIssue'),
        t('comm.tpl.patientHandover'),
        t('comm.tpl.smooth')
    ];

    // --- Data Fetching ---
    useEffect(() => {
        setLoading(true);

        // 1. Fetch Users & Locations
        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });
        
        getDocs(collection(db, 'locations')).then(snap => {
             setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
        });

        // 2. Fetch Logs based on Filter Month/Year
        const start = new Date(parseInt(filterYear), parseInt(filterMonth) - 1, 1);
        const end = new Date(parseInt(filterYear), parseInt(filterMonth), 0, 23, 59, 59);

        const qLogs = query(
            collection(db, 'shiftLogs'), 
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<=', Timestamp.fromDate(end)),
            orderBy('createdAt', 'desc')
        );

        const unsubLogs = onSnapshot(qLogs, (snap) => {
            const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShiftLog));
            setShiftLogs(logs);
        });

        // 3. Fetch Announcements (Always fetch latest)
        const qAnnounce = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
        const unsubAnnounce = onSnapshot(qAnnounce, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
            setAnnouncements(list);

            // Auto-mark as seen logic
            if (userId) {
                list.forEach(ann => {
                    if (ann.isActive && !ann.seenBy?.includes(userId)) {
                        updateDoc(doc(db, 'announcements', ann.id), {
                            seenBy: arrayUnion(userId)
                        }).catch(console.error);
                    }
                });
            }
        });

        setTimeout(() => {
            isFirstLoad.current = false;
            setLoading(false);
        }, 1000);

        return () => {
            unsubUsers();
            unsubLogs();
            unsubAnnounce();
        };
    }, [userId, userName, storedRole, filterMonth, filterYear]);

    // --- Handlers: Shift Logs ---

    const handleLogSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Construct Content from Checklist + Text
        let finalContent = logContent;
        const checkedItems = [];
        if (checklist.devices) checkedItems.push(`✅ ${t('check.devices')}`);
        if (checklist.inventory) checkedItems.push(`✅ ${t('check.inventory')}`);
        if (checklist.keys) checkedItems.push(`✅ ${t('check.keys')}`);
        if (checklist.clean) checkedItems.push(`✅ ${t('check.clean')}`);
        
        if (checkedItems.length > 0) {
            finalContent = `${checkedItems.join(' • ')}\n${finalContent}`;
        }

        if (!finalContent.trim()) return setToast({msg: 'Empty Log', type: 'error'});
        if (!logLocation) return setToast({msg: t('location'), type: 'error'});

        try {
            await addDoc(collection(db, 'shiftLogs'), {
                userId,
                userName,
                location: logLocation,
                content: finalContent,
                category: logCategory,
                isImportant: logImportant,
                type: logImportant ? 'issue' : 'handover',
                createdAt: Timestamp.now()
            });
            setToast({ msg: t('save'), type: 'success' });
            setLogContent(''); setLogImportant(false);
            setChecklist({ devices: false, inventory: false, keys: false, clean: false });
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleConfirmReceive = async () => {
        if (!receiverLocation) return setToast({msg: t('location'), type: 'error'});
        try {
            await updateDoc(doc(db, 'shiftLogs', receiveModal.logId), {
                receivedBy: userName,
                receiverLocation: receiverLocation,
                receivedAt: Timestamp.now()
            });
            setToast({ msg: t('comm.receive'), type: 'success' });
            setReceiveModal({ isOpen: false, logId: '' });
            setReceiverLocation('');
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleDeleteLog = async (id: string) => {
        if (!isSupervisor) return;
        if (confirm(t('confirm') + '?')) {
            await deleteDoc(doc(db, 'shiftLogs', id));
            setToast({ msg: t('delete'), type: 'success' });
        }
    };

    const handleEditLogSave = async () => {
        if (!editLogModal.log) return;
        try {
            await updateDoc(doc(db, 'shiftLogs', editLogModal.log.id), {
                content: editLogModal.log.content,
                location: editLogModal.log.location
            });
            setToast({ msg: t('save'), type: 'success' });
            setEditLogModal({isOpen: false, log: null});
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleGenerateInsights = async () => {
        if (shiftLogs.length === 0) {
            setToast({msg: 'No logs to analyze', type: 'info'});
            return;
        }
        
        setShowInsightsModal(true);
        setIsGeneratingInsights(true);
        setInsightsContent('');

        try {
            const apiKey = (process.env.API_KEY || '').trim();
            if (!apiKey) {
                throw new Error("API Key missing");
            }

            // Collect last 50 logs text
            const logTexts = shiftLogs.slice(0, 50).map(l => 
                `- [${l.category?.toUpperCase()}] ${l.userName}: ${l.content}`
            ).join('\n');

            const ai = new GoogleGenAI({ apiKey });
            const prompt = `
                Analyze these hospital shift logs. Identifying:
                1. 🔴 Critical recurring issues (e.g. broken machines, supply shortages).
                2. 🟡 Operational bottlenecks or communication gaps.
                3. 🟢 Positive trends or commendations.
                
                Format as HTML sections (<h3>, <ul>, <li>). Keep it brief and actionable for a supervisor.
                
                Logs:
                ${logTexts}
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });

            setInsightsContent(response.text || "No insights found.");
        } catch (e: any) {
            console.error(e);
            let msg = "Failed to generate analysis.";
            if (e.message?.includes("API key") || e.message?.includes("400")) {
                msg = "Invalid API Key. Please check your configuration.";
            }
            setInsightsContent(msg);
        } finally {
            setIsGeneratingInsights(false);
        }
    };

    const handlePrintLogs = async () => {
        setIsPrinting(true);
        setTimeout(() => {
            const printContent = document.getElementById('printable-logs');
            if (printContent) {
                const w = window.open("", "_blank");
                if (w) {
                    w.document.write(`
                        <html dir="${dir}"><head><title>${t('comm.logbook')}</title>
                        <style>
                            @page { size: A4 portrait; margin: 15mm; }
                            body{font-family:'Segoe UI', 'Cairo', sans-serif; padding: 20px; color: #111;} 
                            table{width:100%;border-collapse:collapse; border: 2px solid #333; margin-top: 20px;} 
                            th{background:#f0f0f0; border: 1px solid #333; padding: 10px; font-weight:900; text-transform:uppercase; text-align: ${dir === 'rtl' ? 'right' : 'left'};}
                            td{border: 1px solid #333; padding: 8px; text-align: ${dir === 'rtl' ? 'right' : 'left'}; font-weight:600;}
                            .header-row { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
                            .logo-box { display: flex; align-items: center; gap: 10px; }
                            .logo-circle { width: 50px; height: 50px; background: #333; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; border: 2px solid #333 !important; -webkit-print-color-adjust: exact; }
                            .header-center { text-align: center; }
                            .header-right { text-align: right; }
                            h1, h2, h3 { margin: 0; line-height: 1.2; text-transform: uppercase; }
                            .footer { position: fixed; bottom: 0; left: 0; right: 0; border-top: 2px solid #999; padding-top: 10px; display: flex; justify-content: space-between; font-weight: bold; font-size: 10px; }
                        </style>
                        </head><body>
                        
                        <div class="header-row">
                            <div class="logo-box">
                                <div class="logo-circle">AL</div>
                                <div>
                                    <h1 style="font-size: 16px;">AL JEDAANI GROUP<br/>OF HOSPITALS</h1>
                                    <p style="font-size: 10px; margin-top: 2px; color: #555;">JEDDAH, SAUDI ARABIA</p>
                                </div>
                            </div>
                            <div class="header-center">
                                <h1 style="font-size: 24px;">${t('comm.logbook')}</h1>
                                <h3 style="font-size: 14px; text-decoration: underline;">${filterMonth} / ${filterYear}</h3>
                            </div>
                            <div class="header-right">
                                <h2 style="font-size: 16px;">RADIOLOGY</h2>
                                <h3 style="font-size: 14px; color: #333;">DEPARTMENT</h3>
                            </div>
                        </div>

                        ${printContent.innerHTML}

                        <div class="footer">
                            <div>AL JEDAANI GROUP OF HOSPITALS</div>
                            <div style="text-align: right;">
                                DR. MOHAMED SHAFEE<br/>
                                <span style="font-size: 9px; font-weight: normal;">HEAD OF DEPARTMENT OF RADIOLOGY</span>
                            </div>
                        </div>
                        </body></html>
                    `);
                    w.document.close();
                    w.focus();
                    setTimeout(() => w.print(), 500);
                }
            }
            setIsPrinting(false);
        }, 500);
    };

    // --- Handlers: Announcements ---

    const handleAddAnnouncement = async () => {
        if (!isSupervisor) return;
        if (!newAnnounceTitle || !newAnnounceContent) return;
        try {
            await addDoc(collection(db, 'announcements'), {
                title: newAnnounceTitle,
                content: newAnnounceContent,
                priority: newAnnouncePriority,
                isActive: true,
                createdAt: Timestamp.now(),
                createdBy: userName,
                seenBy: []
            });
            setNewAnnounceTitle(''); setNewAnnounceContent('');
            setToast({ msg: t('save'), type: 'success' });
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleDeleteAnnouncement = async (id: string) => {
        if (!isSupervisor) return;
        if (confirm(t('confirm') + '?')) {
            await deleteDoc(doc(db, 'announcements', id));
            setToast({ msg: t('delete'), type: 'success' });
        }
    };

    const handleEditAnnounceSave = async () => {
        if (!editAnnounceModal.ann) return;
        try {
            await updateDoc(doc(db, 'announcements', editAnnounceModal.ann.id), {
                title: editAnnounceModal.ann.title,
                content: editAnnounceModal.ann.content,
                priority: editAnnounceModal.ann.priority
            });
            setToast({ msg: t('save'), type: 'success' });
            setEditAnnounceModal({isOpen: false, ann: null});
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    // Voice Dictation Handler
    const handleDictation = (text: string) => {
        // Append text if content already exists, else set it
        setLogContent(prev => prev ? `${prev} ${text}` : text);
    };

    // Checklist Toggle
    const toggleCheck = (key: keyof typeof checklist) => {
        setChecklist(prev => ({...prev, [key]: !prev[key]}));
    };

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header */}
            <div className="bg-slate-900 text-white p-6 md:p-10 mb-6">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black mb-2">{t('comm.title')}</h1>
                        <p className="text-slate-400">{t('comm.subtitle')}</p>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4">
                {/* Tabs */}
                <div className="flex gap-4 mb-8 border-b border-gray-200 pb-1 overflow-x-auto no-scrollbar">
                    <button 
                        onClick={() => setActiveTab('logbook')} 
                        className={`pb-3 px-4 text-sm font-bold transition-all border-b-4 whitespace-nowrap ${activeTab === 'logbook' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <i className="fas fa-clipboard-list rtl:ml-2 ltr:mr-2"></i> {t('comm.logbook')}
                    </button>
                    <button 
                        onClick={() => setActiveTab('announcements')} 
                        className={`pb-3 px-4 text-sm font-bold transition-all border-b-4 whitespace-nowrap ${activeTab === 'announcements' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <i className="fas fa-bullhorn rtl:ml-2 ltr:mr-2"></i> {t('comm.announcements')}
                    </button>
                </div>

                {/* --- TAB: LOGBOOK --- */}
                {activeTab === 'logbook' && (
                    <div className="grid md:grid-cols-12 gap-6 animate-fade-in-up">
                        {/* Form (Left - 4 cols) */}
                        <div className="md:col-span-4 space-y-6">
                            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 sticky top-4">
                                <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                                    <i className="fas fa-pen-fancy text-indigo-500"></i> {t('comm.log.title')}
                                </h3>
                                <form onSubmit={handleLogSubmit} className="space-y-4">
                                    {/* Location Select */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-2">{t('comm.log.loc')}</label>
                                        <select 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-100 text-sm font-bold"
                                            value={logLocation}
                                            onChange={e => setLogLocation(e.target.value)}
                                            required
                                        >
                                            <option value="">...</option>
                                            {locations.map(loc => (
                                                <option key={loc.id} value={loc.name}>{loc.name}</option>
                                            ))}
                                            <option value="General">General</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-2">{t('comm.log.cat')}</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'general', label: t('comm.cat.general'), icon: 'fa-comment' },
                                                { id: 'machine', label: t('comm.cat.machine'), icon: 'fa-server' },
                                                { id: 'patient', label: t('comm.cat.patient'), icon: 'fa-user-injured' },
                                                { id: 'supply', label: t('comm.cat.supply'), icon: 'fa-box' }
                                            ].map(cat => (
                                                <button 
                                                    key={cat.id}
                                                    type="button"
                                                    onClick={() => setLogCategory(cat.id as any)}
                                                    className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${logCategory === cat.id ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                                                >
                                                    <i className={`fas ${cat.icon}`}></i> {cat.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* Smart Checklist */}
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 mb-2 block">{t('comm.checklist')}</label>
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            {Object.entries(checklist).map(([key, checked]) => (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => toggleCheck(key as any)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${checked ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                                                >
                                                    <i className={`fas ${checked ? 'fa-check-circle' : 'fa-circle'} rtl:ml-1 ltr:mr-1`}></i>
                                                    {t(`check.${key}`)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs font-bold text-slate-500">{t('comm.log.content')}</label>
                                            <span className="text-[10px] text-indigo-500 font-bold bg-indigo-50 px-2 py-0.5 rounded">
                                                <i className="fas fa-microphone rtl:ml-1 ltr:mr-1"></i>
                                            </span>
                                        </div>
                                        
                                        {/* Quick Templates Chips */}
                                        <div className="flex gap-2 flex-wrap mb-2">
                                            {quickTemplates.map((tpl, i) => (
                                                <button 
                                                    key={i} 
                                                    type="button" 
                                                    onClick={() => setLogContent(tpl)}
                                                    className="bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 text-[10px] px-2 py-1 rounded-full border border-slate-200 transition-colors"
                                                >
                                                    {tpl.slice(0, 20)}...
                                                </button>
                                            ))}
                                        </div>

                                        <VoiceInput 
                                            isTextArea
                                            value={logContent}
                                            onChange={setLogContent}
                                            onTranscript={handleDictation}
                                            placeholder={t('comm.log.content')}
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 bg-red-50 p-3 rounded-xl border border-red-100">
                                        <input 
                                            type="checkbox" 
                                            id="isImportant" 
                                            checked={logImportant}
                                            onChange={e => setLogImportant(e.target.checked)}
                                            className="w-4 h-4 text-red-600 rounded focus:ring-red-500" 
                                        />
                                        <label htmlFor="isImportant" className="text-xs font-bold text-red-700 cursor-pointer">
                                            {t('comm.log.important')}
                                        </label>
                                    </div>

                                    <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-transform active:scale-95">
                                        {t('comm.log.btn')}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* Logs List (Right - 8 cols) */}
                        <div className="md:col-span-8">
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full min-h-[600px]">
                                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                                    <h3 className="font-bold text-slate-800 text-lg">{t('comm.logbook')}</h3>
                                    
                                    {/* Filters & Print Controls */}
                                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                                        <div className="flex items-center px-2">
                                            <i className="fas fa-filter text-slate-400 text-xs rtl:ml-2 ltr:mr-2"></i>
                                            <span className="text-xs font-bold text-slate-500">{t('comm.filter')}:</span>
                                        </div>
                                        <select 
                                            className="bg-white border-none rounded-lg text-xs font-bold text-slate-600 py-1.5 focus:ring-0"
                                            value={filterMonth}
                                            onChange={e => setFilterMonth(e.target.value)}
                                        >
                                            {[...Array(12)].map((_, i) => <option key={i} value={i+1}>{i+1}</option>)}
                                        </select>
                                        <select 
                                            className="bg-white border-none rounded-lg text-xs font-bold text-slate-600 py-1.5 focus:ring-0"
                                            value={filterYear}
                                            onChange={e => setFilterYear(e.target.value)}
                                        >
                                            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                        
                                        {/* Print Button - Supervisor Only */}
                                        {/* Make print accessible generally as requested */}
                                        <button onClick={handlePrintLogs} disabled={isPrinting} className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-700 rtl:border-r ltr:border-l border-slate-600 rtl:mr-2 ltr:ml-2 rtl:pr-3 ltr:pl-3">
                                            {isPrinting ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-print rtl:ml-1 ltr:mr-1"></i> {t('print')}</>}
                                        </button>
                                        
                                        {isSupervisor && (
                                            <button onClick={handleGenerateInsights} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 flex items-center gap-1 shadow-md">
                                                <i className="fas fa-brain"></i> Analyze
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 p-6 space-y-4 overflow-y-auto max-h-[800px]">
                                    {shiftLogs.length === 0 && (
                                        <div className="text-center py-20 text-slate-400">
                                            <i className="fas fa-calendar-times text-5xl mb-4 opacity-30"></i>
                                            <p>---</p>
                                        </div>
                                    )}
                                    {shiftLogs.map(log => (
                                        <div key={log.id} className={`relative p-5 rounded-2xl rtl:border-r-4 ltr:border-l-4 shadow-sm transition-all hover:shadow-md ${log.isImportant ? 'rtl:border-r-red-500 ltr:border-l-red-500 bg-red-50/30' : 'rtl:border-r-slate-400 ltr:border-l-slate-400 bg-white border border-slate-100'}`}>
                                            
                                            {/* Supervisor Actions */}
                                            {isSupervisor && (
                                                <div className="absolute top-4 rtl:left-4 ltr:right-4 flex gap-2">
                                                    <button onClick={() => setEditLogModal({isOpen: true, log})} className="text-slate-300 hover:text-blue-500 transition-colors">
                                                        <i className="fas fa-pen"></i>
                                                    </button>
                                                    <button onClick={() => handleDeleteLog(log.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 shadow-inner">
                                                        {log.userName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                                            {log.userName}
                                                            {log.location && <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full">{log.location}</span>}
                                                        </h4>
                                                        <span className="text-[10px] text-slate-400 font-mono dir-ltr">{log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('en-US') : ''}</span>
                                                    </div>
                                                </div>
                                                {log.category && (
                                                    <span className="text-[10px] px-2 py-1 rounded bg-white border border-slate-200 text-slate-500 font-bold rtl:ml-12 ltr:mr-12 md:mx-0">
                                                        {t(`comm.cat.${log.category}`)}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap rtl:pr-14 rtl:pl-4 ltr:pl-14 ltr:pr-4">{log.content}</p>
                                            
                                            {/* Action Bar */}
                                            <div className="flex flex-wrap justify-between items-center mt-4 pt-3 border-t border-slate-100/50 gap-2">
                                                <div>
                                                    {log.isImportant && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-1 rounded-md"><i className="fas fa-exclamation-circle"></i> {t('comm.prio.urgent')}</span>}
                                                </div>
                                                
                                                {log.receivedBy ? (
                                                    <div className="flex items-center gap-2 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                                        <i className="fas fa-check-double"></i> 
                                                        <span>{t('comm.receivedBy')}: {log.receivedBy}</span>
                                                        {log.receiverLocation && <span className="text-emerald-500">({log.receiverLocation})</span>}
                                                    </div>
                                                ) : (
                                                    // Show receive button if not me
                                                    log.userId !== userId && (
                                                        <button 
                                                            onClick={() => setReceiveModal({isOpen: true, logId: log.id})}
                                                            className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
                                                        >
                                                            <i className="fas fa-check"></i> {t('comm.receive')}
                                                        </button>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: ANNOUNCEMENTS --- */}
                {activeTab === 'announcements' && (
                    <div className="grid md:grid-cols-12 gap-6 animate-fade-in-up">
                        {/* Admin Form (Only for Supervisors) */}
                        {isSupervisor && (
                            <div className="md:col-span-4">
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-orange-100 sticky top-4">
                                    <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                                        <i className="fas fa-bullhorn text-orange-500"></i> {t('comm.ann.new')}
                                    </h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500">{t('comm.ann.title')}</label>
                                            <input 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-200 outline-none font-bold text-sm"
                                                value={newAnnounceTitle}
                                                onChange={e => setNewAnnounceTitle(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500">{t('comm.ann.content')}</label>
                                            <textarea 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-200 outline-none min-h-[100px] text-sm"
                                                value={newAnnounceContent}
                                                onChange={e => setNewAnnounceContent(e.target.value)}
                                            ></textarea>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500">{t('comm.ann.priority')}</label>
                                            <select 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-200 outline-none text-sm font-bold"
                                                value={newAnnouncePriority}
                                                onChange={e => setNewAnnouncePriority(e.target.value as any)}
                                            >
                                                <option value="normal">{t('comm.prio.normal')}</option>
                                                <option value="urgent">{t('comm.prio.urgent')}</option>
                                                <option value="critical">{t('comm.prio.critical')}</option>
                                            </select>
                                        </div>
                                        <button onClick={handleAddAnnouncement} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200">
                                            {t('comm.ann.post')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* List */}
                        <div className={`${isSupervisor ? 'md:col-span-8' : 'md:col-span-12'}`}>
                            <div className="space-y-4">
                                {announcements.map(ann => (
                                    <div key={ann.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative group">
                                        {isSupervisor && (
                                            <div className="absolute top-4 rtl:left-4 ltr:right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                <button onClick={() => setEditAnnounceModal({isOpen: true, ann})} className="text-slate-300 hover:text-blue-500">
                                                    <i className="fas fa-pen"></i>
                                                </button>
                                                <button onClick={() => handleDeleteAnnouncement(ann.id)} className="text-slate-300 hover:text-red-500">
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        )}
                                        
                                        <div className="flex justify-between items-start mb-3">
                                            <h4 className="font-black text-xl text-slate-800">{ann.title}</h4>
                                            <div className="flex gap-2">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${ann.priority === 'critical' ? 'bg-red-100 text-red-600' : ann.priority === 'urgent' ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    {t(`comm.prio.${ann.priority}`)}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <p className="text-slate-600 text-sm leading-relaxed mb-4">{ann.content}</p>
                                        
                                        <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                                            <div className="text-xs text-slate-400">
                                                {t('from')}: <span className="font-bold text-slate-600">{ann.createdBy}</span> • {ann.createdAt?.toDate ? ann.createdAt.toDate().toLocaleDateString('en-US') : ''}
                                            </div>
                                            
                                            {isSupervisor && (
                                                <button 
                                                    onClick={() => setViewersModal({ isOpen: true, title: ann.title, viewers: ann.seenBy || [] })}
                                                    className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200 font-bold flex items-center gap-2"
                                                >
                                                    <i className="fas fa-eye"></i> {ann.seenBy ? ann.seenBy.length : 0}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Hidden Print Table */}
            <div id="printable-logs" className="hidden">
                 <table style={{width: '100%', borderCollapse: 'collapse', border: '1px solid #999'}}>
                    <thead>
                        <tr style={{background: '#f0f0f0'}}>
                            <th style={{padding: '10px', border: '1px solid #999'}}>{t('date')}</th>
                            <th style={{padding: '10px', border: '1px solid #999'}}>{t('comm.log.loc')}</th>
                            <th style={{padding: '10px', border: '1px solid #999'}}>{t('comm.receivedBy')}</th>
                            <th style={{padding: '10px', border: '1px solid #999'}}>{t('details')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shiftLogs.map(log => (
                            <tr key={log.id} style={{borderBottom: '1px solid #ccc'}}>
                                <td style={{padding: '8px', border: '1px solid #999'}}>
                                    {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString('en-US') : '-'}
                                </td>
                                <td style={{padding: '8px', border: '1px solid #999'}}>
                                    <strong>{log.userName}</strong><br/>
                                    <span style={{fontSize: '11px', color: '#666'}}>{log.location || '-'}</span>
                                </td>
                                <td style={{padding: '8px', border: '1px solid #999'}}>
                                    <strong>{log.receivedBy || '-'}</strong><br/>
                                    <span style={{fontSize: '11px', color: '#666'}}>{log.receiverLocation || '-'}</span>
                                </td>
                                <td style={{padding: '8px', border: '1px solid #999'}}>
                                    {log.content} {log.isImportant && <span style={{color:'red', fontWeight:'bold'}}>(!{t('comm.prio.urgent')})</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                 </table>
            </div>

            {/* Viewers Modal */}
            <Modal isOpen={viewersModal.isOpen} onClose={() => setViewersModal(prev => ({...prev, isOpen: false}))} title={t('comm.views')}>
                <div className="mb-4">
                    <h4 className="font-bold text-slate-800 text-sm mb-2">{t('comm.ann.title')}: {viewersModal.title}</h4>
                    <p className="text-xs text-slate-500">{t('comm.views')}: {viewersModal.viewers.length}</p>
                </div>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                    {viewersModal.viewers.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <i className="fas fa-eye-slash text-2xl mb-2 opacity-50"></i>
                            <p className="text-sm">---</p>
                        </div>
                    ) : (
                        viewersModal.viewers.map(uid => {
                            const user = users.find(u => u.id === uid);
                            return (
                                <div key={uid} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shadow-sm">
                                            {user?.name ? user.name.charAt(0) : '?'}
                                    </div>
                                    <div>
                                            <p className="font-bold text-slate-700 text-sm">{user?.name || 'Unknown'}</p>
                                            <p className="text-[10px] text-slate-400">{user?.email || 'No Email'}</p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100">
                    <button onClick={() => setViewersModal(prev => ({...prev, isOpen: false}))} className="w-full py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                    {t('cancel')}
                    </button>
                </div>
            </Modal>

            {/* Receive Modal (Confirm Location) */}
            <Modal isOpen={receiveModal.isOpen} onClose={() => setReceiveModal({isOpen: false, logId: ''})} title={t('comm.receive')}>
                <div className="space-y-4">
                    <p className="text-slate-600 text-sm">{t('comm.log.loc')}:</p>
                    <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-100 text-sm font-bold"
                        value={receiverLocation}
                        onChange={e => setReceiverLocation(e.target.value)}
                    >
                        <option value="">...</option>
                        {locations.map(loc => (
                            <option key={loc.id} value={loc.name}>{loc.name}</option>
                        ))}
                    </select>
                    <button onClick={handleConfirmReceive} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">
                        {t('confirm')}
                    </button>
                </div>
            </Modal>

            {/* Edit Log Modal */}
            <Modal isOpen={editLogModal.isOpen} onClose={() => setEditLogModal({isOpen: false, log: null})} title={t('edit')}>
                {editLogModal.log && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500">{t('location')}</label>
                            <select 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm"
                                value={editLogModal.log.location || ''}
                                onChange={e => setEditLogModal({isOpen: true, log: {...editLogModal.log!, location: e.target.value}})}
                            >
                                {locations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500">{t('comm.log.content')}</label>
                            <textarea 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm min-h-[100px]"
                                value={editLogModal.log.content}
                                onChange={e => setEditLogModal({isOpen: true, log: {...editLogModal.log!, content: e.target.value}})}
                            />
                        </div>
                        <button onClick={handleEditLogSave} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">
                            {t('save')}
                        </button>
                    </div>
                )}
            </Modal>

            {/* Edit Announcement Modal */}
            <Modal isOpen={editAnnounceModal.isOpen} onClose={() => setEditAnnounceModal({isOpen: false, ann: null})} title={t('edit')}>
                 {editAnnounceModal.ann && (
                    <div className="space-y-4">
                        <input 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                            value={editAnnounceModal.ann.title}
                            onChange={e => setEditAnnounceModal({isOpen: true, ann: {...editAnnounceModal.ann!, title: e.target.value}})}
                        />
                         <textarea 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 min-h-[100px]"
                            value={editAnnounceModal.ann.content}
                            onChange={e => setEditAnnounceModal({isOpen: true, ann: {...editAnnounceModal.ann!, content: e.target.value}})}
                        />
                         <select 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3"
                            value={editAnnounceModal.ann.priority}
                            onChange={e => setEditAnnounceModal({isOpen: true, ann: {...editAnnounceModal.ann!, priority: e.target.value as any}})}
                        >
                            <option value="normal">{t('comm.prio.normal')}</option>
                            <option value="urgent">{t('comm.prio.urgent')}</option>
                            <option value="critical">{t('comm.prio.critical')}</option>
                        </select>
                        <button onClick={handleEditAnnounceSave} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600">
                            {t('save')}
                        </button>
                    </div>
                 )}
            </Modal>

            {/* AI Insights Modal */}
            <Modal isOpen={showInsightsModal} onClose={() => setShowInsightsModal(false)} title="AI Log Analysis">
                <div className="space-y-4">
                    {isGeneratingInsights ? (
                        <div className="text-center py-10">
                            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-slate-500 font-bold animate-pulse">Analyzing logs for patterns...</p>
                        </div>
                    ) : (
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 prose prose-sm max-w-none text-slate-800">
                            <div dangerouslySetInnerHTML={{__html: insightsContent}} />
                        </div>
                    )}
                    <button onClick={() => setShowInsightsModal(false)} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700">
                        Close Report
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default CommunicationPage;
