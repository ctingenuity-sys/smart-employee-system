
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { Department, User } from '../../types';
import Toast from '../../components/Toast';
import Modal from '../../components/Modal';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const COLORS = [
    { name: 'Red', class: 'bg-red-500' },
    { name: 'Blue', class: 'bg-blue-500' },
    { name: 'Green', class: 'bg-green-500' },
    { name: 'Yellow', class: 'bg-yellow-500' },
    { name: 'Purple', class: 'bg-purple-500' },
    { name: 'Pink', class: 'bg-pink-500' },
    { name: 'Indigo', class: 'bg-indigo-500' },
    { name: 'Orange', class: 'bg-orange-500' },
    { name: 'Teal', class: 'bg-teal-500' },
    { name: 'Slate', class: 'bg-slate-500' },
];

const ICONS = [
    'fa-hospital-user', 'fa-user-nurse', 'fa-cogs', 'fa-heartbeat', 'fa-syringe', 'fa-x-ray', 
    'fa-flask', 'fa-ambulance', 'fa-tooth', 'fa-eye', 'fa-baby', 'fa-brain', 'fa-bone'
];

const DepartmentsPage: React.FC = () => {
    const navigate = useNavigate();
    const [departments, setDepartments] = useState<Department[]>(() => {
        const cached = localStorage.getItem('usr_cached_depts');
        return cached ? JSON.parse(cached) : [];
    });
    const [users, setUsers] = useState<User[]>(() => {
        const cached = localStorage.getItem('usr_cached_dept_users');
        return cached ? JSON.parse(cached) : [];
    }); // To select managers
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    
    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [formManager, setFormManager] = useState('');
    const [formColor, setFormColor] = useState('bg-blue-500');
    const [formIcon, setFormIcon] = useState('fa-hospital-user');

    useEffect(() => {
        localStorage.setItem('usr_cached_depts', JSON.stringify(departments));
    }, [departments]);

    useEffect(() => {
        localStorage.setItem('usr_cached_dept_users', JSON.stringify(users));
    }, [users]);

    useEffect(() => {
        // Fetch Departments
        const qDepts = query(collection(db, 'departments'), orderBy('name'));
        getDocs(qDepts).then((snap) => {
            setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
        });

        // Fetch Users (for manager selection)
        getDocs(collection(db, 'users')).then((snap) => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });
    }, [refreshTrigger]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName) return setToast({ msg: 'Department name is required', type: 'error' });

        try {
            const payload = {
                name: formName,
                managerId: formManager || null,
                color: formColor,
                icon: formIcon,
                updatedAt: Timestamp.now()
            };

            if (editingId) {
                await updateDoc(doc(db, 'departments', editingId), payload);
                setToast({ msg: 'Department Updated', type: 'success' });
            } else {
                await addDoc(collection(db, 'departments'), {
                    ...payload,
                    createdAt: Timestamp.now()
                });
                setToast({ msg: 'Department Created', type: 'success' });
            }
            setIsModalOpen(false);
            resetForm();
        } catch (error: any) {
            setToast({ msg: 'Error: ' + error.message, type: 'error' });
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure? This will not delete users but will unlink them.')) return;
        try {
            await deleteDoc(doc(db, 'departments', id));
            setToast({ msg: 'Department Deleted', type: 'success' });
        } catch (error) {
            setToast({ msg: 'Delete Error', type: 'error' });
        }
    };

    const openEdit = (dept: Department) => {
        setEditingId(dept.id);
        setFormName(dept.name);
        setFormManager(dept.managerId || '');
        setFormColor(dept.color || 'bg-blue-500');
        setFormIcon(dept.icon || 'fa-hospital-user');
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setFormName('');
        setFormManager('');
        setFormColor('bg-blue-500');
        setFormIcon('fa-hospital-user');
    };

    // Get Manager Name Helper
    const getManagerName = (id?: string) => {
        if (!id) return 'Not Assigned';
        const u = users.find(user => user.id === id);
        return u ? u.name : 'Unknown User';
    };

    // Count employees in department
    const getEmployeeCount = (deptId: string) => {
        return users.filter(u => u.departmentId === deptId).length;
    };

    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans" dir="rtl">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/supervisor')} className="p-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-all text-slate-500">
                            <i className="fas fa-arrow-right"></i>
                        </button>
                        <div>
                            <h1 className="text-3xl font-black text-slate-800">إدارة الأقسام</h1>
                            <p className="text-slate-500">إنشاء وتوزيع الأقسام الطبية والإدارية</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => { resetForm(); setIsModalOpen(true); }}
                        className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2"
                    >
                        <i className="fas fa-plus"></i> إضافة قسم جديد
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {departments.map(dept => (
                        <div key={dept.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative group hover:shadow-md transition-all">
                            <div className={`absolute top-0 right-0 w-full h-2 ${dept.color}`}></div>
                            
                            <div className="flex justify-between items-start mb-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg ${dept.color}`}>
                                    <i className={`fas ${dept.icon}`}></i>
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEdit(dept)} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600"><i className="fas fa-pen"></i></button>
                                    <button onClick={() => handleDelete(dept.id)} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-red-50 hover:text-red-600"><i className="fas fa-trash"></i></button>
                                </div>
                            </div>

                            <h3 className="text-xl font-black text-slate-800 mb-1">{dept.name}</h3>
                            <p className="text-xs text-slate-400 font-bold mb-4 uppercase tracking-wider">
                                {dept.id.substring(0,8)}
                            </p>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <i className="fas fa-user-tie text-slate-400"></i>
                                        <span className="text-xs font-bold text-slate-600">المشرف</span>
                                    </div>
                                    <span className="text-xs font-black text-indigo-600 truncate max-w-[120px]">
                                        {getManagerName(dept.managerId)}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <i className="fas fa-users text-slate-400"></i>
                                        <span className="text-xs font-bold text-slate-600">الموظفين</span>
                                    </div>
                                    <span className="text-xs font-black text-slate-800 bg-white px-2 py-1 rounded-lg border border-slate-200">
                                        {getEmployeeCount(dept.id)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Create/Edit Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'تعديل القسم' : 'إضافة قسم جديد'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">اسم القسم</label>
                        <input 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-100 outline-none"
                            placeholder="مثال: التمريض، الصيانة..."
                            value={formName}
                            onChange={e => setFormName(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">مشرف القسم (اختياري)</label>
                        <select 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-100 outline-none"
                            value={formManager}
                            onChange={e => setFormManager(e.target.value)}
                        >
                            <option value="">-- اختر مشرفاً --</option>
                            {users.filter(u => u.role === 'supervisor' || u.role === 'admin').map(u => (
                                <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2">لون ونوع الأيقونة</label>
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                            {COLORS.map(c => (
                                <button 
                                    key={c.name}
                                    type="button"
                                    onClick={() => setFormColor(c.class)}
                                    className={`w-8 h-8 rounded-full ${c.class} ${formColor === c.class ? 'ring-4 ring-slate-200 scale-110' : ''}`}
                                />
                            ))}
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                            {ICONS.map(icon => (
                                <button
                                    key={icon}
                                    type="button"
                                    onClick={() => setFormIcon(icon)}
                                    className={`p-2 rounded-lg text-lg flex items-center justify-center transition-all ${formIcon === icon ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                >
                                    <i className={`fas ${icon}`}></i>
                                </button>
                            ))}
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all">
                        حفظ البيانات
                    </button>
                </form>
            </Modal>
        </div>
    );
};

export default DepartmentsPage;
