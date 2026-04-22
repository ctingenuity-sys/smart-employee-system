import React from 'react';

interface PrintStyleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (style: 'new' | 'old') => void;
}

export const PrintStyleModal: React.FC<PrintStyleModalProps> = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden relative" dir="rtl">
                <div className="bg-slate-800 p-4 text-white flex justify-between items-center">
                    <h3 className="font-bold text-lg">خيارات الطباعة</h3>
                    <button onClick={onClose} className="text-slate-300 hover:text-white">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-slate-600 mb-6 font-bold text-sm">الرجاء اختيار شكل وتنسيق الورقة قبل الطباعة:</p>
                    
                    <div className="flex flex-col gap-4">
                        <button 
                            onClick={() => {
                                onConfirm('new');
                                onClose();
                            }}
                            className="flex items-center gap-4 p-4 border-2 border-indigo-100 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                        >
                            <div className="w-12 h-12 shrink-0 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xl">
                                ✨
                            </div>
                            <div className="text-right">
                                <h4 className="font-bold text-slate-800">الطباعة الحديثة</h4>
                                <p className="text-xs text-slate-500">التنسيق الجديد مع اللوجو الحديث للمستشفى</p>
                            </div>
                        </button>

                        <button 
                            onClick={() => {
                                onConfirm('old');
                                onClose();
                            }}
                            className="flex items-center gap-4 p-4 border-2 border-slate-200 rounded-xl hover:border-slate-500 hover:bg-slate-50 transition-colors"
                        >
                            <div className="w-12 h-12 shrink-0 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xl">
                                📜
                            </div>
                            <div className="text-right">
                                <h4 className="font-bold text-slate-800">الطباعة القديمة</h4>
                                <p className="text-xs text-slate-500">التنسيق الكلاسيكي مع اللوجو القديم</p>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
