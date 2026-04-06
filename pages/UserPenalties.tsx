import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy } from 'firebase/firestore';
import { Penalty } from '../types';
import PenaltyPrintable from '../components/PenaltyPrintable';
import { useLanguage, getTranslationKeyForArabic } from '../contexts/LanguageContext';
import { printPenaltyDocument } from '../utils/printPenalty';

const UserPenalties: React.FC = () => {
    const { t, dir } = useLanguage();
    const [penalties, setPenalties] = useState<Penalty[]>([]);
    const [rejectionReason, setRejectionReason] = useState('');
    const [selectedPenaltyAction, setSelectedPenaltyAction] = useState<Penalty | null>(null);
    const [selectedPenaltyPrint, setSelectedPenaltyPrint] = useState<Penalty | null>(null);

    useEffect(() => {
        if (!auth.currentUser) return;
        const q = query(collection(db, 'penalties'), where('employeeId', '==', auth.currentUser.uid), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPenalties(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Penalty)));
        });
        return () => unsubscribe();
    }, [auth.currentUser]);

    const handleAction = async (penaltyId: string, status: 'accepted' | 'rejected') => {
        const penaltyRef = doc(db, 'penalties', penaltyId);
        await updateDoc(penaltyRef, {
            status,
            rejectionReason: status === 'rejected' ? rejectionReason : ''
        });
        alert(t('penalty.successUpdate'));
        setSelectedPenaltyAction(null);
        setRejectionReason('');
    };

    return (
        <div className="p-6 max-w-5xl mx-auto" dir={dir}>
            <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 shadow-sm">
                    <i className="fas fa-exclamation-circle text-2xl"></i>
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{t('penalty.myPenalties')}</h1>
                    <p className="text-gray-500 mt-1">{t('penalty.myPenaltiesSubtitle')}</p>
                </div>
            </div>

            <div className="space-y-6">
                {penalties.map(p => {
                    const descKey = getTranslationKeyForArabic(p.description);
                    return (
                    <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                        <div className={`p-4 border-b ${p.status === 'pending' ? 'bg-yellow-50 border-yellow-100' : p.status === 'accepted' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'} flex justify-between items-center`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${p.status === 'pending' ? 'bg-yellow-200 text-yellow-700' : p.status === 'accepted' ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700'}`}>
                                    <i className={`fas ${p.status === 'pending' ? 'fa-clock' : p.status === 'accepted' ? 'fa-check' : 'fa-times'}`}></i>
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900">
                                        {
                                            (() => {
                                                const arKey = getTranslationKeyForArabic(p.penaltyType);
                                                if (arKey) return t(arKey);
                                                switch(p.penaltyType) {
                                                    case '1st Warning': return t('penalty.1stWarning');
                                                    case '2nd Warning': return t('penalty.2ndWarning');
                                                    case 'Final Warning': return t('penalty.finalWarning');
                                                    case 'Deduction': return `${t('penalty.deduction')} (${p.deductionDays} ${t('penalty.days')})`;
                                                    case 'Suspension': return `${t('penalty.suspension')} (${p.suspensionDays} ${t('penalty.days')})`;
                                                    case 'Dismissal': return t('penalty.dismissal');
                                                    default: return p.penaltyType;
                                                }
                                            })()
                                        }
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                        {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('en-GB') : ''}
                                    </p>
                                </div>
                            </div>
                            <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${
                                p.status === 'pending' ? 'bg-yellow-200 text-yellow-800' :
                                p.status === 'accepted' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                            }`}>
                                {
                                    p.status === 'pending' ? t('penalty.pending') :
                                    p.status === 'accepted' ? t('penalty.accepted') : t('penalty.rejected')
                                }
                            </span>
                        </div>
                        
                        <div className="p-6">
                            <div className="mb-6">
                                <h4 className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">{t('penalty.violation')}</h4>
                                <p className="text-gray-800 text-lg bg-gray-50 p-4 rounded-xl border border-gray-100 leading-relaxed">
                                    <i className="fas fa-quote-right text-gray-300 mr-2"></i>
                                    {descKey ? t(descKey) : p.description}
                                </p>
                            </div>

                            {p.status === 'rejected' && p.rejectionReason && (
                                <div className="mb-6 bg-red-50 p-4 rounded-xl border border-red-100">
                                    <h4 className="text-sm font-bold text-red-800 mb-1">{t('penalty.reason')}:</h4>
                                    <p className="text-red-700">{p.rejectionReason}</p>
                                </div>
                            )}

                            {p.status === 'pending' && (
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                    <h4 className="font-bold text-gray-800 mb-4 text-center">{t('penalty.pleaseTakeAction')}</h4>
                                    
                                    {selectedPenaltyAction?.id === p.id ? (
                                        <div className="animate-fade-in-up">
                                            <textarea 
                                                className="w-full p-3 border border-gray-300 rounded-xl mb-3 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none" 
                                                placeholder={t('penalty.writeRejectionReason')}
                                                value={rejectionReason} 
                                                onChange={(e) => setRejectionReason(e.target.value)} 
                                                rows={3}
                                            />
                                            <div className="flex gap-3">
                                                <button 
                                                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm" 
                                                    onClick={() => handleAction(p.id, 'rejected')}
                                                    disabled={!rejectionReason.trim()}
                                                >
                                                    {t('penalty.confirmRejection')}
                                                </button>
                                                <button 
                                                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors" 
                                                    onClick={() => {
                                                        setSelectedPenaltyAction(null);
                                                        setRejectionReason('');
                                                    }}
                                                >
                                                    {t('cancel')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex gap-4">
                                            <button 
                                                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors shadow-sm flex items-center justify-center gap-2" 
                                                onClick={() => handleAction(p.id, 'accepted')}
                                            >
                                                <i className="fas fa-check-circle text-lg"></i> {t('penalty.accept')}
                                            </button>
                                            <button 
                                                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm flex items-center justify-center gap-2" 
                                                onClick={() => setSelectedPenaltyAction(p)}
                                            >
                                                <i className="fas fa-times-circle text-lg"></i> {t('penalty.reject')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {p.status !== 'pending' && (
                                <div className="mt-4 flex justify-end">
                                    <button 
                                        className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2 font-bold shadow-sm" 
                                        onClick={() => setSelectedPenaltyPrint(p)}
                                    >
                                        <i className="fas fa-print text-blue-600"></i> {t('penalty.print')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )})}
                
                {penalties.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300 shadow-sm">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fas fa-shield-alt text-4xl text-gray-300"></i>
                        </div>
                        <h3 className="text-xl font-bold text-gray-700 mb-2">{t('penalty.cleanRecord')}</h3>
                        <p className="text-gray-500">{t('penalty.noPenalties')}</p>
                    </div>
                )}
            </div>
            
            {selectedPenaltyPrint && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative animate-fade-in-up">
                        <button 
                            className="absolute top-4 right-4 w-10 h-10 bg-gray-100 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors print:hidden flex items-center justify-center z-10"
                            onClick={() => setSelectedPenaltyPrint(null)}
                        >
                            <i className="fas fa-times text-xl"></i>
                        </button>
                        <div className="p-8 print:p-0">
                            <PenaltyPrintable penalty={selectedPenaltyPrint} />
                            <div className="mt-8 flex justify-center print:hidden">
                                <button 
                                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                                    onClick={() => printPenaltyDocument(selectedPenaltyPrint)}
                                >
                                    <i className="fas fa-print text-xl"></i> {t('print')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserPenalties;
