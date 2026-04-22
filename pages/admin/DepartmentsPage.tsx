
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { db as certDb } from '../../firebaseData';
import { inventoryDb } from '../../firebaseInventory';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, orderBy, Timestamp, where } from 'firebase/firestore';
import { Department, User, SwapRequest, LeaveRequest } from '../../types';
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
    const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    
    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [formManager, setFormManager] = useState('');
    const [formColor, setFormColor] = useState('bg-blue-500');
    const [formIcon, setFormIcon] = useState('fa-hospital-user');
    const [formCategories, setFormCategories] = useState<string[]>([]);
    const [newCategory, setNewCategory] = useState('');

    const [isMigrating, setIsMigrating] = useState(false);

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
            setDepartments(snap.docs.map(d => ({ ...d.data(), id: d.id } as Department)));
        });

        // Fetch Users (for manager selection)
        getDocs(collection(db, 'users')).then((snap) => {
            setUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as User)));
        });

        // Fetch Swap Requests
        const qSwaps = query(collection(db, 'swapRequests'), where('status', '==', 'approvedByUser'));
        getDocs(qSwaps).then(snap => {
            setSwapRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SwapRequest)));
        });

        // Fetch Leave Requests
        const qLeaves = query(collection(db, 'leaveRequests'), where('status', 'in', ['pending_supervisor', 'pending_manager']));
        getDocs(qLeaves).then(snap => {
            setLeaveRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as LeaveRequest)));
        });
    }, [refreshTrigger]);

    const handleMigrateLegacyData = async () => {
        if (!window.confirm('هل أنت متأكد من رغبتك في ترحيل البيانات القديمة إلى قسم "الأشعة"؟ هذه العملية قد تستغرق بعض الوقت.')) return;
        
        setIsMigrating(true);
        try {
            // 1. Ensure Radiology department exists
            let targetDeptId = '';
            const existingRadiology = departments.find(d => d.name.includes('الأشعة') || d.name.includes('Radiology'));
            
            if (existingRadiology) {
                targetDeptId = existingRadiology.id;
            } else {
                const newDeptRef = await addDoc(collection(db, 'departments'), {
                    name: 'الأشعة (Radiology)',
                    color: 'bg-blue-500',
                    icon: 'fa-x-ray',
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                });
                targetDeptId = newDeptRef.id;
                setRefreshTrigger(prev => prev + 1);
            }

            // Collections to migrate from main db
            const collectionsToMigrate = [
                'users', 'schedules', 'leaveRequests', 'swapRequests', 
                'attendance_logs', 'openShifts', 'actions', 'peer_recognition',
                'locations', 'schedule_templates', 'monthly_publishes', 
                'performance_archives', 'penalties', 'shiftLogs'
            ];

            // Collections to migrate from certDb
            const certDbCollections = [
                'inventory_devices', 'fms_reports', 'room_reports', 'employee_records'
            ];

            let migratedCount = 0;

            for (const colName of collectionsToMigrate) {
                const snap = await getDocs(collection(db, colName));
                for (const document of snap.docs) {
                    const data = document.data();
                    if (!data.departmentId) {
                        await updateDoc(doc(db, colName, document.id), {
                            departmentId: targetDeptId
                        });
                        migratedCount++;
                    }
                }
            }

            for (const colName of certDbCollections) {
                const snap = await getDocs(collection(certDb, colName));
                for (const document of snap.docs) {
                    const data = document.data();
                    if (!data.departmentId) {
                        await updateDoc(doc(certDb, colName, document.id), {
                            departmentId: targetDeptId
                        });
                        migratedCount++;
                    }
                }
            }

            setToast({ msg: `تم ترحيل ${migratedCount} سجل بنجاح إلى قسم الأشعة.`, type: 'success' });
        } catch (error: any) {
            console.error("Migration error:", error);
            setToast({ msg: 'حدث خطأ أثناء الترحيل: ' + error.message, type: 'error' });
        } finally {
            setIsMigrating(false);
        }
    };

    const handleMigrateInventory = async () => {
        if (!window.confirm('هل أنت متأكد من رغبتك في ترحيل بيانات المخزون القديمة إلى قسم "الأشعة"؟')) return;
        
        setIsMigrating(true);
        try {
            // 1. Ensure Radiology department exists
            let targetDeptId = '';
            const existingRadiology = departments.find(d => d.name.includes('الأشعة') || d.name.includes('Radiology'));
            
            if (existingRadiology) {
                targetDeptId = existingRadiology.id;
            } else {
                const newDeptRef = await addDoc(collection(db, 'departments'), {
                    name: 'الأشعة (Radiology)',
                    color: 'bg-blue-500',
                    icon: 'fa-x-ray',
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                });
                targetDeptId = newDeptRef.id;
                setRefreshTrigger(prev => prev + 1);
            }

            // Collections to migrate from inventoryDb
            const inventoryCollections = ['materials', 'invoices', 'usages'];
            let migratedCount = 0;

            for (const colName of inventoryCollections) {
                const snap = await getDocs(collection(inventoryDb, colName));
                for (const document of snap.docs) {
                    const data = document.data();
                    if (!data.departmentId) {
                        await updateDoc(doc(inventoryDb, colName, document.id), {
                            departmentId: targetDeptId
                        });
                        migratedCount++;
                    }
                }
            }

            setToast({ msg: `تم ترحيل ${migratedCount} سجل مخزون بنجاح إلى قسم الأشعة.`, type: 'success' });
        } catch (error: any) {
            console.error("Migration error:", error);
            setToast({ msg: 'خطأ في ترحيل البيانات: ' + error.message, type: 'error' });
        } finally {
            setIsMigrating(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName) return setToast({ msg: 'Department name is required', type: 'error' });

        try {
            const payload = {
                name: formName,
                managerId: formManager || null,
                color: formColor,
                icon: formIcon,
                categories: formCategories,
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
        setFormCategories(dept.categories || []);
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setFormName('');
        setFormManager('');
        setFormColor('bg-blue-500');
        setFormIcon('fa-hospital-user');
        setFormCategories([]);
        setNewCategory('');
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
                    <div className="flex gap-3">
                        <button 
                            onClick={handleMigrateLegacyData}
                            disabled={isMigrating}
                            className="bg-orange-500 text-white px-4 py-3 rounded-xl font-bold shadow-lg hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {isMigrating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-database"></i>}
                            ترحيل البيانات القديمة
                        </button>
                        <button 
                            onClick={handleMigrateInventory}
                            disabled={isMigrating}
                            className="bg-teal-500 text-white px-4 py-3 rounded-xl font-bold shadow-lg hover:bg-teal-600 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {isMigrating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-box-open"></i>}
                            ترحيل المخزون القديم
                        </button>
                        <button 
                            onClick={() => { resetForm(); setIsModalOpen(true); }}
                            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2"
                        >
                            <i className="fas fa-plus"></i> إضافة قسم جديد
                        </button>
                    </div>
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
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-slate-800 bg-white px-2 py-1 rounded-lg border border-slate-200">
                                            {getEmployeeCount(dept.id)}
                                        </span>
                                        <button 
                                            onClick={() => navigate('/supervisor/employees', { state: { departmentId: dept.id } })}
                                            className="text-xs bg-indigo-100 text-indigo-600 hover:bg-indigo-200 px-2 py-1 rounded-lg font-bold transition-colors"
                                            title="عرض الموظفين"
                                        >
                                            <i className="fas fa-eye"></i>
                                        </button>
                                    </div>
                                </div>
                                {dept.categories && dept.categories.length > 0 && (
                                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-2 mb-2">
                                            <i className="fas fa-tags text-slate-400"></i>
                                            <span className="text-xs font-bold text-slate-600">الفئات</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {dept.categories.map(cat => (
                                                <span key={cat} className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-bold">
                                                    {cat}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* NEW: Pending Requests Section */}
            <div className="mt-12 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h2 className="text-2xl font-black text-slate-800 mb-6 underline decoration-indigo-500 underline-offset-8">الطلبات المعلقة</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-700 mb-4">طلبات التبديل ({swapRequests.length})</h3>
                        <div className="space-y-3">
                            {swapRequests.map(r => (
                                <div key={r.id} className="p-4 bg-purple-50 rounded-xl border border-purple-100 text-sm">
                                    <p className="font-bold text-purple-900">{r.details}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-700 mb-4">طلبات الإجازات ({leaveRequests.length})</h3>
                        <div className="space-y-3">
                            {leaveRequests.map(r => (
                                <div key={r.id} className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-sm">
                                    <p className="font-bold text-rose-900">{r.reason}</p>
                                    <p className="text-xs text-rose-700">{r.startDate} - {r.endDate}</p>
                                </div>
                            ))}
                        </div>
                    </div>
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
                        <label className="block text-xs font-bold text-slate-500 mb-1">فئات الموظفين (Categories)</label>
                        <div className="flex gap-2 mb-2">
                            <input 
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-100 outline-none"
                                placeholder="مثال: طبيب، فني..."
                                value={newCategory}
                                onChange={e => setNewCategory(e.target.value)}
                            />
                            <button 
                                type="button"
                                onClick={() => {
                                    if (newCategory && !formCategories.includes(newCategory)) {
                                        setFormCategories([...formCategories, newCategory]);
                                        setNewCategory('');
                                    }
                                }}
                                className="bg-slate-800 text-white px-4 rounded-xl font-bold"
                            >
                                إضافة
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {formCategories.map(cat => (
                                <span key={cat} className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2">
                                    {cat}
                                    <button type="button" onClick={() => setFormCategories(formCategories.filter(c => c !== cat))} className="text-indigo-400 hover:text-indigo-600">
                                        <i className="fas fa-times"></i>
                                    </button>
                                </span>
                            ))}
                        </div>
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
