
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';

// Helper to find value case-insensitively
const findValue = (obj: any, keys: string[]): any => {
    if (!obj) return null;
    const lowerKeys = keys.map(k => k.toLowerCase());
    for (const key of Object.keys(obj)) {
        if (lowerKeys.includes(key.toLowerCase()) && obj[key]) {
            return obj[key];
        }
    }
    return null;
};

const MODALITY_KEYWORDS: Record<string, string[]> = {
    'MRI': ['MRI', 'MR ', 'MAGNETIC', 'M.R.I', 'رنين'],
    'CT': ['C.T.', 'CT ', 'COMPUTED', 'CAT ', 'MDCT', 'مقطعية'],
    'US': ['US ', 'U.S', 'ULTRASOUND', 'SONO', 'DOPPLER', 'ECHO', 'تلفزيونية'],
    'X-RAY': ['X-RAY', 'XRAY', 'XR ', 'MAMMO', 'CR ', 'DR ', 'CHEST', 'PLAIN', 'SPINE', 'KNEE', 'سينية'],
    'FLUO': ['FLUO', 'BARIUM', 'CONTRAST', 'HSG', 'MCUG', 'صبغة'],
};

const BridgePage: React.FC = () => {
    const { t, dir } = useLanguage();
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const [activeTab, setActiveTab] = useState<'manual' | 'extension'>('extension');

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
    };

    // --- Chrome Extension Generator Logic ---
    const downloadFile = (filename: string, content: string) => {
        const element = document.createElement('a');
        const file = new Blob([content], {type: 'text/plain'});
        element.href = URL.createObjectURL(file);
        element.download = filename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const handleDownloadManifest = () => {
        const manifest = {
            "manifest_version": 3,
            "name": "Smart Employee Bridge",
            "version": "2.0",
            "description": "Auto-sync patient data from Hospital System (IHMS) to Smart Employee App.",
            "host_permissions": [
                "http://192.168.0.8/*",
                "http://*/*"
            ],
            "content_scripts": [
                {
                    "matches": ["http://192.168.0.8/*", "http://10.*/*", "http://172.*/*"],
                    "js": ["smart-bridge.js"],
                    "world": "MAIN",
                    "run_at": "document_start"
                }
            ],
            "icons": {
                "128": "icon.png"
            }
        };
        downloadFile('manifest.json', JSON.stringify(manifest, null, 2));
    };

    const handleDownloadScript = () => {
        const currentOrigin = window.location.href.split('#')[0];
        const targetUrl = `${currentOrigin}#/appointments`;

        const scriptContent = `
/* 🚀 AJ-SMART-BRIDGE AUTO-INJECTOR V2.0 */
(function() {
    // Prevent double injection
    if (window.AJ_BRIDGE_ACTIVE) return;
    window.AJ_BRIDGE_ACTIVE = true;

    console.log("%c 🟢 Smart Bridge Extension Active ", "background: #0f172a; color: #00ff00; font-size: 12px; font-weight: bold; padding: 4px; border-radius: 4px;");

    const APP_URL = "${targetUrl}";
    let syncWin = null;

    // UI Overlay
    const createUI = () => {
        const container = document.createElement('div');
        Object.assign(container.style, {
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: '999999',
            backgroundColor: '#0f172a',
            color: 'white',
            padding: '10px 15px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            fontFamily: 'sans-serif',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            border: '1px solid #334155',
            transition: 'all 0.3s ease'
        });

        const statusDot = document.createElement('div');
        Object.assign(statusDot.style, {
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#22c55e',
            boxShadow: '0 0 10px #22c55e'
        });

        const text = document.createElement('span');
        text.innerText = 'Smart Sync Active';
        text.style.fontWeight = 'bold';

        container.appendChild(statusDot);
        container.appendChild(text);
        document.body.appendChild(container);

        // Hover Effect
        container.onmouseenter = () => { container.style.transform = 'scale(1.05)'; };
        container.onmouseleave = () => { container.style.transform = 'scale(1)'; };
    };

    if (document.readyState === 'complete') createUI();
    else window.addEventListener('load', createUI);

    // Window Management
    function openSyncWindow() {
        if (!syncWin || syncWin.closed) {
            // Check if we already have a frame or window
            syncWin = window.open(APP_URL, "SmartAppSyncWindow");
        }
        return syncWin;
    }

    // XHR Interceptor
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            try {
                if (this.getResponseHeader("content-type")?.includes("application/json")) {
                    const json = JSON.parse(this.responseText);
                    let payload = json.d || json.result || json;
                    if (!Array.isArray(payload)) payload = [payload];
                    
                    // Filter relevant packets
                    if (payload[0]?.patientName || payload[0]?.fileNumber || payload[0]?.mrn) {
                        console.log("⚡ Smart Bridge: Data Captured", payload.length);
                        
                        syncWin = openSyncWindow();
                        
                        // Send with retry
                        let attempts = 0;
                        const sendInterval = setInterval(() => {
                            if (syncWin && !syncWin.closed) {
                                syncWin.postMessage({ type: 'SMART_SYNC_DATA', payload }, '*');
                                clearInterval(sendInterval);
                                // Visual Feedback
                                const ui = document.querySelector('div[style*="z-index: 999999"] span');
                                if(ui) {
                                    const oldText = ui.innerText;
                                    ui.innerText = 'Data Sent 🚀';
                                    setTimeout(() => ui.innerText = oldText, 2000);
                                }
                            }
                            attempts++;
                            if (attempts > 10) clearInterval(sendInterval);
                        }, 500);
                    }
                }
            } catch (e) {}
        });
        return originalSend.apply(this, arguments);
    };
})();
        `;
        downloadFile('smart-bridge.js', scriptContent);
    };


    // --- Data Processing Logic (Same as before) ---
    const processPayload = async (rawPayload: any) => {
        setStatus('processing');
        let payload: any[] = [];
        if (Array.isArray(rawPayload)) {
            payload = rawPayload;
        } else if (rawPayload && typeof rawPayload === 'object') {
            payload = [rawPayload];
        }

        if (payload.length === 0) {
            setStatus('idle');
            return;
        }

        addLog(`Received ${payload.length} records. Processing...`);

        const rowsToInsert: any[] = [];

        const detectModality = (serviceName: string) => {
            const sNameUpper = serviceName.toUpperCase();
            for (const [id, keywords] of Object.entries(MODALITY_KEYWORDS)) {
                if (keywords.some(k => sNameUpper.includes(k))) return id;
            }
            return 'OTHER';
        };

        const cleanTime = (t: any) => (t ? String(t).trim().substring(0, 5) : '00:00');
        const cleanDate = (d: any) => (d ? String(d).split('T')[0] : new Date().toISOString().split('T')[0]);

        payload.forEach((p: any) => {
            // FIX: IGNORE RECORDS WITH RESULTS BUT NO NEW ORDERS
            if ((!p.xrayPatientDetails || p.xrayPatientDetails.length === 0) && (p.xrayResultDetails && p.xrayResultDetails.length > 0)) {
                return; 
            }

            const pName = findValue(p, ['patientName', 'engName', 'name', 'patName', 'fullName']) || 'Unknown';
            const cleanName = pName.includes(' - ') ? pName.split(' - ')[1] : pName;
            const fNum = findValue(p, ['fileNumber', 'fileNo', 'mrn', 'patientId', 'pid']) || '';
            const age = findValue(p, ['ageYear', 'age', 'patientAge', 'dob']);
            const rawQueTime = findValue(p, ['queTime', 'time', 'visitTime']) || '';
            const qTime = cleanTime(rawQueTime);

            const commonInfo = {
                patientName: cleanName,
                fileNumber: String(fNum),
                patientAge: age ? String(age) : '',
                status: 'pending',
                createdBy: 'Bridge Auto',
                createdByName: 'System',
                notes: ''
            };

            const detailsArr = p.xrayPatientDetails || p.orderDetails || p.services || [];

            if (Array.isArray(detailsArr) && detailsArr.length > 0) {
                detailsArr.forEach((det: any) => {
                    const sName = findValue(det, ['serviceName', 'examName', 'procedure', 'xrayName']);
                    if (!sName) return;
                    const modId = detectModality(sName);
                    const safeFileNo = commonInfo.fileNumber || `NOFILE_${Math.random().toString(36).substr(2,5)}`;
                    const uniqueId = `${cleanDate(det.queDate || p.queDate)}_${safeFileNo}_${modId}`.replace(/[^a-zA-Z0-9_]/g, '');

                    rowsToInsert.push({
                        id: uniqueId,
                        ...commonInfo,
                        examType: modId,
                        examList: [sName],
                        doctorName: det.doctorName || p.doctorName || 'Unknown Dr',
                        refNo: String(det.queRefNo || det.refNo || p.refNo || ''),
                        date: cleanDate(det.queDate || p.queDate),
                        time: cleanTime(det.queTime || rawQueTime),
                        createdAt: new Date().toISOString()
                    });
                });
            } else {
                const sName = findValue(p, ['serviceName', 'examName']) || 'General Exam';
                const modId = detectModality(sName);
                const safeFileNo = commonInfo.fileNumber || `NOFILE_${Math.random().toString(36).substr(2,5)}`;
                const uniqueId = `${cleanDate(p.queDate)}_${safeFileNo}_${modId}`.replace(/[^a-zA-Z0-9_]/g, '');

                rowsToInsert.push({
                    id: uniqueId,
                    ...commonInfo,
                    examType: modId,
                    examList: [sName],
                    doctorName: p.doctorName || 'Unknown Dr',
                    refNo: String(p.refNo || ''),
                    date: cleanDate(p.queDate),
                    time: qTime,
                    createdAt: new Date().toISOString()
                });
            }
        });

        try {
            if (rowsToInsert.length > 0) {
                const { error } = await supabase.from('appointments').upsert(rowsToInsert, { onConflict: 'id' });
                if (error) throw error;
                addLog(`✅ Successfully saved ${rowsToInsert.length} appointments.`);
                setStatus('success');
            } else {
                addLog('⚠️ No valid appointments parsed.');
            }
        } catch (e: any) {
            console.error(e);
            addLog(`❌ Error: ${e.message}`);
            setStatus('error');
        }
    };

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data && event.data.type === 'SMART_SYNC_DATA') {
                processPayload(event.data.payload);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-6 font-sans" dir={dir}>
            <div className="max-w-5xl mx-auto">
                
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <i className="fas fa-satellite-dish text-3xl text-white animate-pulse-slow"></i>
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">Smart Bridge <span className="text-emerald-500">Center</span></h1>
                        <p className="text-slate-400 font-medium">IHMS Integration & Sync Console</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b border-slate-800 pb-1">
                    <button 
                        onClick={() => setActiveTab('extension')} 
                        className={`px-4 py-2 text-sm font-bold transition-all ${activeTab === 'extension' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-white'}`}
                    >
                        <i className="fab fa-chrome mr-2"></i> Chrome Extension (Auto)
                    </button>
                    <button 
                        onClick={() => setActiveTab('manual')} 
                        className={`px-4 py-2 text-sm font-bold transition-all ${activeTab === 'manual' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-white'}`}
                    >
                        <i className="fas fa-code mr-2"></i> Console Console (Manual)
                    </button>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                    
                    {/* Left Column: Instructions & Generator */}
                    <div className="space-y-6">
                        
                        {activeTab === 'extension' && (
                            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <i className="fas fa-puzzle-piece text-emerald-500"></i> إنشاء إضافة التزامن التلقائي
                                </h2>
                                <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                                    قم بتحميل الملفات التالية، وضعها في مجلد واحد، ثم ثبتها في متصفح Chrome لمرة واحدة فقط ليتم نقل البيانات تلقائياً دون تدخل منك.
                                </p>
                                
                                <div className="space-y-3 mb-6">
                                    <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                                        <div className="flex items-center gap-3">
                                            <i className="fas fa-file-code text-yellow-400"></i>
                                            <div className="text-sm">
                                                <p className="font-bold text-slate-200">manifest.json</p>
                                                <p className="text-[10px] text-slate-500">Configuration File</p>
                                            </div>
                                        </div>
                                        <button onClick={handleDownloadManifest} className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg transition-colors font-bold">
                                            تحميل
                                        </button>
                                    </div>
                                    
                                    <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                                        <div className="flex items-center gap-3">
                                            <i className="fab fa-js text-blue-400"></i>
                                            <div className="text-sm">
                                                <p className="font-bold text-slate-200">smart-bridge.js</p>
                                                <p className="text-[10px] text-slate-500">Sync Logic Script</p>
                                            </div>
                                        </div>
                                        <button onClick={handleDownloadScript} className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg transition-colors font-bold">
                                            تحميل
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-emerald-900/20 border border-emerald-500/20 rounded-xl p-4">
                                    <h4 className="text-emerald-400 font-bold text-xs uppercase mb-2">طريقة التثبيت:</h4>
                                    <ol className="list-decimal list-inside text-xs text-emerald-100/70 space-y-1">
                                        <li>ضع الملفين في مجلد جديد باسم "SmartBridge".</li>
                                        <li>افتح <code className="bg-black/30 px-1 rounded">chrome://extensions</code> في المتصفح.</li>
                                        <li>فعل "Developer mode" في الزاوية العلوية.</li>
                                        <li>اضغط "Load unpacked" واختر المجلد.</li>
                                        <li>مبروك! سيظهر زر أخضر أسفل شاشة النظام.</li>
                                    </ol>
                                </div>
                            </div>
                        )}

                        {activeTab === 'manual' && (
                            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                                <h2 className="text-xl font-bold text-white mb-4">الطريقة اليدوية (Script)</h2>
                                <p className="text-slate-400 text-sm mb-4">
                                    إذا كنت لا تستطيع تثبيت الإضافة، انسخ هذا الكود والصقه في الـ Console (F12) داخل نظام المستشفى.
                                </p>
                                <button 
                                    onClick={handleDownloadScript} 
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    <i className="fas fa-copy"></i> نسخ كود الربط
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Live Console */}
                    <div className="bg-black rounded-3xl border border-slate-800 p-4 flex flex-col h-[500px]">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                            <h3 className="font-bold text-slate-300 text-sm flex items-center gap-2">
                                <i className="fas fa-terminal"></i> Live Sync Console
                            </h3>
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${status === 'processing' ? 'bg-yellow-500/20 text-yellow-500' : status === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}>
                                {status}
                            </span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1 custom-scrollbar pr-2">
                            {logs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                                    <i className="fas fa-satellite-dish text-4xl mb-3"></i>
                                    <p>Waiting for data from extension...</p>
                                </div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className={`pb-1 border-b border-slate-900 ${log.includes('Error') ? 'text-red-400' : 'text-emerald-400/80'}`}>
                                        <span className="opacity-50 mr-2 text-[10px]">{log.split(']')[0]}]</span>
                                        {log.split(']')[1]}
                                    </div>
                                ))
                            )}
                        </div>
                        
                        <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-500 text-center">
                            Keep this tab open to maintain real-time sync via extension.
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default BridgePage;
