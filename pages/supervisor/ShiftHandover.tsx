import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { ShiftLog, User } from '../../types';
import Toast from '../../components/Toast';
import Modal from '../../components/Modal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDepartment } from '../../contexts/DepartmentContext';

const ShiftHandover: React.FC = () => {
    const { t } = useLanguage();
    const { selectedDepartmentId } = useDepartment();
    const [logs, setLogs] = useState<ShiftLog[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newLog, setNewLog] = useState({ content: '', type: 'handover' as 'handover' | 'issue' | 'note', category: 'general' as 'machine' | 'patient' | 'supply' | 'general', isImportant: false });
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

    useEffect(() => {
        if (!selectedDepartmentId) return;
        const q = query(collection(db, 'shiftHandovers'), where('departmentId', '==', selectedDepartmentId), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as ShiftLog)));
        });
        return unsub;
    }, [selectedDepartmentId]);

    const handleSubmit = async () => {
        if (!newLog.content || !selectedDepartmentId) return;
        try {
            await addDoc(collection(db, 'shiftHandovers'), {
                ...newLog,
                userId: auth.currentUser?.uid,
                userName: auth.currentUser?.displayName || 'Staff',
                departmentId: selectedDepartmentId,
                createdAt: Timestamp.now()
            });
            setToast({ msg: 'تم إضافة الملاحظة بنجاح', type: 'success' });
            setIsModalOpen(false);
            setNewLog({ content: '', type: 'handover', category: 'general', isImportant: false });
        } catch (e) {
            setToast({ msg: 'فشل إضافة الملاحظة', type: 'error' });
        }
    };

    return (
        <div className="p-6">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">{t('shift.handover.title')}</h1>
                <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700">
                    + إضافة ملاحظة
                </button>
            </div>

            <div className="space-y-4">
                {logs.map(log => (
                    <div key={log.id} className={`p-4 rounded-xl border ${log.isImportant ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-slate-800">{log.userName}</span>
                            <span className="text-xs text-slate-500">{log.createdAt.toDate().toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-700">{log.content}</p>
                        <div className="mt-2 flex gap-2">
                            <span className="text-[10px] bg-slate-100 px-2 py-1 rounded">{log.type}</span>
                            <span className="text-[10px] bg-slate-100 px-2 py-1 rounded">{log.category}</span>
                        </div>
                    </div>
                ))}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="إضافة ملاحظة تسليم وردية">
                <div className="space-y-4">
                    <textarea 
                        className="w-full p-3 border rounded-xl"
                        placeholder="اكتب الملاحظة هنا..."
                        value={newLog.content}
                        onChange={e => setNewLog({...newLog, content: e.target.value})}
                    />
                    <select className="w-full p-3 border rounded-xl" value={newLog.type} onChange={e => setNewLog({...newLog, type: e.target.value as any})}>
                        <option value="handover">تسليم</option>
                        <option value="issue">مشكلة</option>
                        <option value="note">ملاحظة</option>
                    </select>
                    <select className="w-full p-3 border rounded-xl" value={newLog.category} onChange={e => setNewLog({...newLog, category: e.target.value as any})}>
                        <option value="general">عام</option>
                        <option value="patient">مريض</option>
                        <option value="machine">جهاز</option>
                        <option value="supply">مستلزمات</option>
                    </select>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={newLog.isImportant} onChange={e => setNewLog({...newLog, isImportant: e.target.checked})} />
                        ملاحظة هامة
                    </label>
                    <button onClick={handleSubmit} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">
                        حفظ
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default ShiftHandover;
