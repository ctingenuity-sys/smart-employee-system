
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { useLanguage } from '../contexts/LanguageContext';
import Modal from './Modal';

const FloatingAI: React.FC = () => {
    const { t, dir } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [history, setHistory] = useState<{q: string, a: string}[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [history, isThinking]);

    const handleAsk = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isThinking) return;

        const userQ = query;
        setQuery('');
        setIsThinking(true);
        
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            // Use gemini-3-flash-preview as it is the recommended model for basic text tasks
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Context: Radiology Department Assistant. Role: Help medical staff. Question: "${userQ}"`,
                config: {
                    systemInstruction: "You are RadBot, a helpful AI assistant for a hospital radiology department. Be professional, concise, and accurate."
                }
            });

            setHistory(prev => [...prev, { q: userQ, a: response.text || "I'm sorry, I couldn't process that." }]);
        } catch (error: any) {
            let msg = "Communication error with AI brain.";
            if (error.message?.includes('429')) msg = "Brain overload (Quota). Please try again shortly.";
            setHistory(prev => [...prev, { q: userQ, a: msg }]);
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <>
            <button 
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-2xl z-[100] flex items-center justify-center hover:scale-110 hover:rotate-6 transition-all group border border-white/20"
            >
                <i className="fas fa-robot text-2xl"></i>
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
            </button>

            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="RadBot AI Assistant">
                <div className="flex flex-col h-[500px]" dir={dir}>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 rounded-2xl border border-slate-100 mb-4 custom-scrollbar">
                        {history.map((chat, i) => (
                            <div key={i} className="space-y-2">
                                <div className="flex justify-end"><div className="bg-indigo-600 text-white px-4 py-2 rounded-2xl rounded-tr-none text-sm font-bold max-w-[80%]">{chat.q}</div></div>
                                <div className="flex justify-start"><div className="bg-white border border-slate-200 text-slate-800 px-4 py-2 rounded-2xl rounded-tl-none text-sm shadow-sm max-w-[85%]">{chat.a}</div></div>
                            </div>
                        ))}
                        {isThinking && <div className="flex justify-start animate-pulse"><div className="bg-slate-200 h-8 w-24 rounded-full"></div></div>}
                    </div>
                    <form onSubmit={handleAsk} className="relative">
                        <input className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-6 pr-14 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" placeholder="Ask RadBot..." value={query} onChange={e => setQuery(e.target.value)} />
                        <button type="submit" className="absolute right-3 top-3 w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-colors shadow-lg"><i className="fas fa-paper-plane"></i></button>
                    </form>
                </div>
            </Modal>
        </>
    );
};

export default FloatingAI;
