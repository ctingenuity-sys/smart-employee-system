import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { GoogleGenAI } from "@google/genai";
import { auth } from '../firebase';
import Toast from '../components/Toast';

const HRAssistantPage: React.FC = () => {
    const { t, dir } = useLanguage();
    
    // Chat State
    const [query, setQuery] = useState('');
    const [response, setResponse] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);

    // HR POLICIES KNOWLEDGE BASE (Simplified)
    // In a real app, this could be loaded from a Firestore collection 'policies'
    const policyContext = `
        You are an expert HR Assistant for a Hospital. You answer employee questions based on Saudi Labor Law and standard Hospital policies.
        
        Key Policies:
        1. **Annual Leave**: 30 days per year. Must be requested 2 weeks in advance.
        2. **Sick Leave**: 
           - First 30 days: Full Pay.
           - Next 60 days: 75% Pay.
           - Next 30 days: No Pay.
           - Requires a medical report from an authorized clinic within 48 hours.
        3. **Overtime**: Calculated as 1.5x basic hourly rate. Must be pre-approved by the supervisor.
        4. **Shift Swap**: Allowed twice per month. Must be approved by both parties and the supervisor.
        5. **Dress Code**: Scrubs for technicians/nurses. Lab coat + formal wear for doctors.
        6. **Late Attendance**: 
           - 1-15 mins late: Grace period (max 3 times/month).
           - 15+ mins late: Deducted from salary or overtime balance.
        
        Tone: Professional, empathetic, clear, and helpful. 
        If you don't know the answer based on these policies, say "Please check with the HR department directly for this specific case."
        Answer in the same language as the user (Arabic or English).
    `;

    const handleAsk = async () => {
        if(!query) return;
        setIsThinking(true);
        setResponse(""); 
        try {
            const apiKey = (process.env.API_KEY || '').trim();
            if (!apiKey) {
                throw new Error("API Key configuration missing.");
            }
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `
              ${policyContext}
              
              User Question: "${query}"
              
              Provide a clear and accurate answer:
            `;
            
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });
            setResponse(result.text || "I'm sorry, I couldn't generate an answer.");
        } catch(e: any) { 
            console.error("AI Error:", e);
            setResponse(`Error: ${e.message}`); 
        }
        finally { setIsThinking(false); }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* Header */}
            <div className="bg-pink-600 text-white p-6 md:p-10 mb-6 shadow-lg">
                <div className="max-w-4xl mx-auto flex items-center gap-4">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm border-2 border-white/30">
                        <i className="fas fa-user-tie text-3xl"></i>
                    </div>
                    <div>
                        <h1 className="text-3xl font-black mb-1">HR Assistant</h1>
                        <p className="text-pink-100 font-medium">Policy & Inquiry Bot 💬</p>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4">
                
                <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-pink-100 flex flex-col h-[70vh] animate-fade-in">
                    {/* Chat Area */}
                    <div className="flex-1 p-6 overflow-y-auto bg-slate-50 space-y-4 custom-scrollbar">
                        <div className="flex gap-4">
                            <div className="w-10 h-10 rounded-full bg-pink-600 flex-shrink-0 flex items-center justify-center text-white shadow-md">
                                <i className="fas fa-robot"></i>
                            </div>
                            <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 text-slate-700 text-sm max-w-[80%]">
                                <p>Welcome! I am your HR Assistant. Ask me about leaves, overtime, or hospital policies.</p>
                            </div>
                        </div>

                        {response && (
                            <div className="flex gap-4 flex-row-reverse">
                                <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center text-slate-600">
                                    <i className="fas fa-user"></i>
                                </div>
                                <div className="bg-pink-50 p-4 rounded-2xl rounded-tr-none border border-pink-100 text-pink-900 text-sm max-w-[80%]">
                                    <p className="font-bold">{query}</p>
                                </div>
                            </div>
                        )}

                        {isThinking && (
                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-pink-600 flex-shrink-0 flex items-center justify-center text-white shadow-md animate-pulse">
                                    <i className="fas fa-robot"></i>
                                </div>
                                <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 text-slate-500 text-sm italic">
                                    Consulting the policy handbook...
                                </div>
                            </div>
                        )}

                        {response && !isThinking && (
                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-pink-600 flex-shrink-0 flex items-center justify-center text-white shadow-md">
                                    <i className="fas fa-robot"></i>
                                </div>
                                <div className={`p-5 rounded-2xl rounded-tl-none shadow-md border text-sm max-w-[85%] prose prose-sm bg-white border-slate-200 text-slate-800`}>
                                    <div className="whitespace-pre-wrap leading-relaxed">{response}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-slate-100">
                        <div className="relative">
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 pr-14 text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-pink-200 focus:bg-white transition-all font-medium"
                                placeholder="e.g. How is overtime calculated?"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAsk()}
                            />
                            <button 
                                onClick={handleAsk}
                                disabled={isThinking || !query}
                                className="absolute right-2 top-2 w-10 h-10 bg-pink-600 text-white rounded-xl flex items-center justify-center hover:bg-pink-700 disabled:opacity-50 disabled:hover:bg-pink-600 transition-all shadow-md"
                            >
                                {isThinking ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                            </button>
                        </div>
                        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
                            {["Overtime Policy", "Sick Leave Rules", "Dress Code"].map(q => (
                                <button key={q} onClick={() => setQuery(q)} className="text-xs bg-slate-100 hover:bg-pink-50 text-slate-600 hover:text-pink-600 px-3 py-1.5 rounded-full border border-slate-200 transition-colors whitespace-nowrap">
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HRAssistantPage;