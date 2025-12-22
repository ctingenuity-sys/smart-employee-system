
import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { GoogleGenAI } from "@google/genai";
import VoiceInput from '../components/VoiceInput';
// @ts-ignore
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import Toast from '../components/Toast';

const TechSupportPage: React.FC = () => {
    const { t, dir } = useLanguage();
    const [activeTab, setActiveTab] = useState<'chat' | 'medical' | 'sbar'>('chat');
    
    // Tech Support Chat State
    const [techQuery, setTechQuery] = useState('');
    const [techResponse, setTechResponse] = useState('');
    const [isTechThinking, setIsTechThinking] = useState(false);

    // Medical Copilot State
    const [medQuery, setMedQuery] = useState('');
    const [medResponse, setMedResponse] = useState('');
    const [isMedThinking, setIsMedThinking] = useState(false);

    // SBAR State
    const [sbarInput, setSbarInput] = useState('');
    const [sbarResult, setSbarResult] = useState('');
    const [isGeneratingSbar, setIsGeneratingSbar] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);

    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || t('role.user');

    // KNOWLEDGE BASE (Tech Support)
    const knowledgeBaseTech = `
        You are an expert Radiology Technical Support Copilot. You help technicians and doctors troubleshoot equipment issues.
        Use this knowledge base for common issues:
        
        1. CT Scanner (General):
           - Tube Overheat: Wait 15 mins for cooling. Check cooling oil level indicator.
           - Error 503 / Communication Error: Restart the acquisition console. Check network cable at the gantry.
           - Streak Artifacts: Recalibrate the detector or check for metal objects on patient.
        
        2. MRI (Siemens/GE):
           - Quench Button: DANGER! Only use if life-threatening (e.g. metal pinned patient). Helium will vent.
           - Coil Not Detected: Unplug and replug coil connector. Check for bent pins.
           - Image Noise: Check if door is fully sealed (RF Cage leak).
        
        3. PACS / Workstation:
           - Images not sending: Check 'Job Queue' in RIS. Restart DICOM service. Ping the PACS server IP.
           - Screen Frozen: Ctrl+Alt+Del -> Task Manager -> Kill 'PostProcessing.exe'.
        
        4. X-Ray / DR:
           - Detector Not Ready: Check battery level of wireless panel. Re-sync via console menu.
           - Exposure Error: Check door interlock switch.
        
        If the issue sounds like a critical hardware failure (smoke, loud noise, persistent error after restart), advise them to call the main maintenance line immediately.
        Keep answers short, step-by-step, and professional.
    `;

    // KNOWLEDGE BASE (Medical)
    const knowledgeBaseMedical = `
        You are an expert Radiology Medical Consultant AI (Radiologist Copilot).
        Your goal is to assist Radiologists and Technologists with:
        1. **Protocols**: CT/MRI sequences, Contrast timing (phases), Patient positioning.
        2. **Diagnosis Support**: Differential diagnosis based on imaging findings description.
        3. **Safety**: Contrast media guidelines (Creatinine/eGFR limits), MRI safety zones.
        
        **Guidelines:**
        - Provide concise, clinically relevant answers.
        - For Protocols: Mention scan range, contrast volume, rate, and delay times (Arterial, Venous, Delayed).
        - For Diagnosis: List top 3 differentials based on standard radiological literature (Radiopaedia style).
        - **Disclaimer**: Always end with "This is an AI suggestion. Clinical correlation required."
    `;

    const handleAIRequest = async (prompt: string, setResponse: (val: string) => void, setLoading: (val: boolean) => void) => {
        setLoading(true);
        setResponse("");
        try {
            const apiKey = (process.env.API_KEY || '').trim();
            if (!apiKey) {
                throw new Error("Missing API Key. Please add GEMINI_API_KEY to your .env file.");
            }
            
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });
            setResponse(response.text || "No response generated.");
        } catch(e: any) { 
            console.error("AI Error:", e);
            let msg = e.message;
            if (msg.includes('400') || msg.includes('API key')) {
                msg = "Invalid API Key. Please check your .env file configuration.";
            }
            setResponse(`⚠️ Error: ${msg}`);
            setToast({ msg: msg, type: 'error' });
        } finally { 
            setLoading(false); 
        }
    };

    const handleTechAsk = () => {
        if(!techQuery) return;
        const prompt = `${knowledgeBaseTech}\nUser Query: "${techQuery}"\nProvide a solution:`;
        handleAIRequest(prompt, setTechResponse, setIsTechThinking);
    };

    const handleMedicalAsk = () => {
        if(!medQuery) return;
        const prompt = `${knowledgeBaseMedical}\nMedical Query: "${medQuery}"\nProvide clinical guidance:`;
        handleAIRequest(prompt, setMedResponse, setIsMedThinking);
    };

    const handleGenerateSbar = () => {
        if(!sbarInput) return;
        const prompt = `Convert this informal note to SBAR format.\nInput: "${sbarInput}"`;
        handleAIRequest(prompt, setSbarResult, setIsGeneratingSbar);
    };

    const handleSaveSbar = async () => {
        if (!currentUserId) return;
        try {
            await addDoc(collection(db, 'shiftLogs'), {
                userId: currentUserId,
                userName: currentUserName,
                location: 'Handover (SBAR)',
                content: sbarResult,
                category: 'general',
                isImportant: false,
                type: 'handover',
                createdAt: Timestamp.now()
            });
            setToast({ msg: t('save'), type: 'success' });
            setSbarInput(''); setSbarResult('');
        } catch(e) { setToast({msg: 'Error saving log', type: 'error'}); }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* Header */}
            <div className="bg-cyan-600 text-white p-6 md:p-10 mb-6 shadow-lg">
                <div className="max-w-4xl mx-auto flex items-center gap-4">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm border-2 border-white/30">
                        <i className="fas fa-microchip text-3xl"></i>
                    </div>
                    <div>
                        <h1 className="text-3xl font-black mb-1">{t('tech.title')}</h1>
                        <p className="text-cyan-100 font-medium">Smart AI Tools & Support</p>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4">
                
                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b border-gray-200 pb-1 overflow-x-auto no-scrollbar">
                    <button 
                        onClick={() => setActiveTab('chat')} 
                        className={`pb-3 px-4 text-sm font-bold transition-all border-b-4 whitespace-nowrap ${activeTab === 'chat' ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <i className="fas fa-robot rtl:ml-2 ltr:mr-2"></i> Tech Chat
                    </button>
                    <button 
                        onClick={() => setActiveTab('medical')} 
                        className={`pb-3 px-4 text-sm font-bold transition-all border-b-4 whitespace-nowrap ${activeTab === 'medical' ? 'border-rose-600 text-rose-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <i className="fas fa-user-md rtl:ml-2 ltr:mr-2"></i> Medical Copilot
                    </button>
                    <button 
                        onClick={() => setActiveTab('sbar')} 
                        className={`pb-3 px-4 text-sm font-bold transition-all border-b-4 whitespace-nowrap ${activeTab === 'sbar' ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <i className="fas fa-file-medical-alt rtl:ml-2 ltr:mr-2"></i> SBAR Handover
                    </button>
                </div>

                {/* --- TECH CHAT --- */}
                {activeTab === 'chat' && (
                    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-cyan-100 flex flex-col h-[65vh] animate-fade-in">
                        <div className="flex-1 p-6 overflow-y-auto bg-slate-50 space-y-4 custom-scrollbar">
                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-cyan-600 flex-shrink-0 flex items-center justify-center text-white shadow-md">
                                    <i className="fas fa-wrench"></i>
                                </div>
                                <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 text-slate-700 text-sm max-w-[80%]">
                                    <p>Hello! I am your Technical Support Copilot. Ask me about machine errors (CT, MRI, X-Ray) or PACS issues.</p>
                                </div>
                            </div>
                            {techResponse && (
                                <div className="flex gap-4 flex-row-reverse">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center text-slate-600">
                                        <i className="fas fa-user"></i>
                                    </div>
                                    <div className="bg-cyan-50 p-4 rounded-2xl rounded-tr-none border border-cyan-100 text-cyan-900 text-sm max-w-[80%]">
                                        <p className="font-bold">{techQuery}</p>
                                    </div>
                                </div>
                            )}
                            {isTechThinking && (
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-full bg-cyan-600 flex-shrink-0 flex items-center justify-center text-white shadow-md animate-pulse">
                                        <i className="fas fa-wrench"></i>
                                    </div>
                                    <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 text-slate-500 text-sm italic">Thinking...</div>
                                </div>
                            )}
                            {techResponse && !isTechThinking && (
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-full bg-cyan-600 flex-shrink-0 flex items-center justify-center text-white shadow-md">
                                        <i className="fas fa-wrench"></i>
                                    </div>
                                    <div className={`p-5 rounded-2xl rounded-tl-none shadow-md border text-sm max-w-[85%] prose prose-sm bg-white border-slate-200 text-slate-800`}>
                                        <div className="whitespace-pre-wrap leading-relaxed">{techResponse}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-white border-t border-slate-100 relative">
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 pr-14 text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-cyan-200 transition-all font-medium"
                                placeholder={t('tech.ask')}
                                value={techQuery}
                                onChange={e => setTechQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleTechAsk()}
                            />
                            <button onClick={handleTechAsk} disabled={isTechThinking || !techQuery} className="absolute right-6 top-6 text-cyan-600 hover:text-cyan-700 disabled:opacity-50">
                                <i className="fas fa-paper-plane text-xl"></i>
                            </button>
                        </div>
                    </div>
                )}

                {/* --- MEDICAL COPILOT --- */}
                {activeTab === 'medical' && (
                    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-rose-100 flex flex-col h-[65vh] animate-fade-in">
                        <div className="flex-1 p-6 overflow-y-auto bg-slate-50 space-y-4 custom-scrollbar">
                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-rose-600 flex-shrink-0 flex items-center justify-center text-white shadow-md">
                                    <i className="fas fa-user-md"></i>
                                </div>
                                <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 text-slate-700 text-sm max-w-[80%]">
                                    <p>I am your Radiology Medical Copilot. Ask about protocols (CT/MRI Phases), contrast guidelines, or differential diagnosis.</p>
                                </div>
                            </div>
                            {medResponse && (
                                <div className="flex gap-4 flex-row-reverse">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center text-slate-600">
                                        <i className="fas fa-user"></i>
                                    </div>
                                    <div className="bg-rose-50 p-4 rounded-2xl rounded-tr-none border border-rose-100 text-rose-900 text-sm max-w-[80%]">
                                        <p className="font-bold">{medQuery}</p>
                                    </div>
                                </div>
                            )}
                            {isMedThinking && (
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-full bg-rose-600 flex-shrink-0 flex items-center justify-center text-white shadow-md animate-pulse">
                                        <i className="fas fa-heartbeat"></i>
                                    </div>
                                    <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 text-slate-500 text-sm italic">Consulting guidelines...</div>
                                </div>
                            )}
                            {medResponse && !isMedThinking && (
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-full bg-rose-600 flex-shrink-0 flex items-center justify-center text-white shadow-md">
                                        <i className="fas fa-user-md"></i>
                                    </div>
                                    <div className={`p-5 rounded-2xl rounded-tl-none shadow-md border text-sm max-w-[85%] prose prose-sm bg-white border-slate-200 text-slate-800`}>
                                        <div className="whitespace-pre-wrap leading-relaxed">{medResponse}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-white border-t border-slate-100 relative">
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 pr-14 text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-rose-200 transition-all font-medium"
                                placeholder="e.g. Protocol for Pancreatic CT, or Differentials for Ring Enhancing Lesion"
                                value={medQuery}
                                onChange={e => setMedQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleMedicalAsk()}
                            />
                            <button onClick={handleMedicalAsk} disabled={isMedThinking || !medQuery} className="absolute right-6 top-6 text-rose-600 hover:text-rose-700 disabled:opacity-50">
                                <i className="fas fa-paper-plane text-xl"></i>
                            </button>
                        </div>
                    </div>
                )}

                {/* --- SBAR HANDOVER --- */}
                {activeTab === 'sbar' && (
                    <div className="bg-white rounded-3xl p-6 shadow-xl border border-violet-100 animate-fade-in">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center">
                                <i className="fas fa-file-medical-alt text-lg"></i>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">{t('sbar.title')}</h3>
                                <p className="text-xs text-slate-400">{t('sbar.desc')}</p>
                            </div>
                        </div>
                        
                        <div className="space-y-4">
                            <VoiceInput 
                                isTextArea 
                                placeholder="e.g. Patient in room 4 has contrast allergy, doctor notified, waiting for new orders..."
                                value={sbarInput}
                                onChange={setSbarInput}
                                onTranscript={setSbarInput}
                            />
                            <button 
                                onClick={handleGenerateSbar}
                                disabled={isGeneratingSbar || !sbarInput}
                                className="w-full bg-violet-600 text-white py-3 rounded-xl font-bold hover:bg-violet-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-200"
                            >
                                {isGeneratingSbar ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magic"></i>} {t('sbar.gen')}
                            </button>
                        </div>
                        
                        {sbarResult && (
                            <div className="mt-6 bg-slate-50 p-4 rounded-xl border border-slate-200 relative animate-fade-in-up">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Result:</h4>
                                <textarea 
                                    className="w-full bg-transparent text-sm text-slate-800 h-40 outline-none resize-none font-medium"
                                    value={sbarResult}
                                    onChange={(e) => setSbarResult(e.target.value)}
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={handleSaveSbar} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-600 flex items-center gap-2 shadow-md">
                                        <i className="fas fa-save"></i> Save to Log
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TechSupportPage;
