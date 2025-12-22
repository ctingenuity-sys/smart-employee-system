import React, { useState, useEffect } from 'react';
import { db, firebaseConfig } from '../../firebase';
// @ts-ignore
import { collection, updateDoc, deleteDoc, setDoc, onSnapshot, doc, Timestamp, query, where, getDocs, writeBatch, limit, orderBy, addDoc } from 'firebase/firestore';
// @ts-ignore
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
// @ts-ignore
import { initializeApp, deleteApp } from 'firebase/app';
import { User } from '../../types';
import Modal from '../../components/Modal';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';

const SupervisorEmployees: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
    const [loading, setLoading] = useState(false);

    // Modal States
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editForm, setEditForm] = useState<Partial<User>>({});
    const [isAddingUser, setIsAddingUser] = useState(false);
    
    // Form States
    const [newUserData, setNewUserData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'user',
        phone: ''
    });

    const currentAdminName = localStorage.getItem('username') || 'Admin';

    useEffect(() => {
        // ترتيب المستخدمين حسب تاريخ الإنشاء ليكون الأحدث في الأعلى
        const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });
        return () => unsub();
    }, []);

    // --- Actions ---
    const handleAddUser = async () => {
        const { email, password, name, role, phone } = newUserData;

        if (!email.trim() || !password.trim() || !name.trim()) {
            return setToast({ msg: 'Please fill all required fields', type: 'error' });
        }
        
        setIsAddingUser(true);
        const appName = `SecondaryApp-${Date.now()}`;
        let secondaryApp: any;
        
        try {
            secondaryApp = initializeApp(firebaseConfig, appName);
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
            const newUserId = userCredential.user.uid;
            
            await setDoc(doc(db, 'users', newUserId), {
                uid: newUserId,
                email: email.toLowerCase().trim(),
                name: name.trim(),
                role: role,
                phone: phone.trim(),
                createdAt: Timestamp.now(),
                biometricId: null // تهيئة القيمة
            });
            
            setToast({ msg: 'User Added Successfully!', type: 'success' });
            setNewUserData({ name: '', email: '', password: '', role: 'user', phone: '' });
            
            await signOut(secondaryAuth);
            await deleteApp(secondaryApp);
        } catch (e: any) {
            console.error("Add User Error:", e);
            let errMsg = e.message;
            if (e.code === 'auth/email-already-in-use') errMsg = 'Email already exists';
            setToast({ msg: errMsg, type: 'error' });
            if (secondaryApp) await deleteApp(secondaryApp);
        } finally {
            setIsAddingUser(false);
        }
    };


    const handleResetBiometric = async (user: User) => {
    // استخدام نافذة تأكيد لضمان عدم الحذف بالخطأ
    if (!confirm(`Reset biometric binding for ${user.name}?`)) return;
    
    setLoading(true);
    try {
        await updateDoc(doc(db, 'users', user.id), { 
            biometricId: null, 
            biometricRegisteredAt: null 
        });
        setToast({ msg: 'Biometric Reset Successfully', type: 'success' });
    } catch (e: any) { 
        setToast({ msg: 'Error: ' + e.message, type: 'error' }); 
    } finally {
        setLoading(false);
    }
};


    const handleUpdateUser = async () => {
        if (!editForm.id) return;
        try {
            await updateDoc(doc(db, 'users', editForm.id), {
                name: editForm.name,
                role: editForm.role || 'user',
                phone: editForm.phone
            });
            setToast({ msg: 'User Updated', type: 'success' });
            setIsEditModalOpen(false);
        } catch (e: any) {
            setToast({ msg: 'Error: ' + e.message, type: 'error' });
        }
    };

    const handleDeleteUser = async (user: User) => {
        const confirmDelete = window.confirm(`Delete ${user.name}? This will wipe all their data.`);
        if (!confirmDelete) return;
        
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const collectionsToDelete = [
                { col: 'schedules', field: 'userId' },
                { col: 'attendance_logs', field: 'userId' },
                { col: 'leaveRequests', field: 'from' },
                { col: 'swapRequests', field: 'from' },
                { col: 'actions', field: 'employeeId' }
            ];
            
            for (const item of collectionsToDelete) {
                const q = query(collection(db, item.col), where(item.field, '==', user.id));
                const snap = await getDocs(q);
                snap.docs.forEach(d => batch.delete(d.ref));
            }
            
            batch.delete(doc(db, 'users', user.id));
            await batch.commit();
            setToast({ msg: 'User and all related data deleted', type: 'success' });
        } catch(e:any) {
            setToast({ msg: 'Error: ' + e.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleUnlockAttendance = async (user: User) => {
        try {
            // إضافة تصريح استثنائي صالح لمدة دقيقة واحدة للتبصيم من أي مكان
            await addDoc(collection(db, 'attendance_overrides'), {
                userId: user.id,
                userName: user.name,
                grantedBy: currentAdminName,
                grantedAt: Timestamp.now(),
                validUntil: Timestamp.fromDate(new Date(Date.now() + 30000)) 
            });
            setToast({ msg: 'Attendance unlocked for 30 seconds', type: 'success' });
        } catch(e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const filteredUsers = users.filter(u => 
        u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            {/* Loading Overlay */}
            {loading && (
                <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center">
                        <div className="w-12 h-12 border-4 border-blue-600 rounded-full animate-spin border-t-transparent mb-4"></div>
                        <p className="font-bold text-slate-700">Processing...</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all">
                        <i className="fas fa-arrow-left rtl:rotate-180"></i>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800">{t('sup.tab.users')}</h1>
                        <p className="text-slate-500 text-sm font-medium">Total: {users.length} employees</p>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* User List Table */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                            <i className="fas fa-search text-slate-400"></i>
                            <input 
                                className="bg-transparent outline-none text-sm w-full font-semibold text-slate-700"
                                placeholder="Search by name or email..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="overflow-x-auto">
                            <table className={`w-full ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="p-5">{t('role.user')}</th>
                                        <th className="p-5">Role</th>
                                        <th className="p-5 text-center">Status</th>
                                        <th className="p-5 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredUsers.map(user => (
                                        <tr key={user.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 flex items-center justify-center font-black shadow-sm">
                                                        {user.name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 leading-none mb-1">{user.name}</h4>
                                                        <p className="text-xs text-slate-400 font-medium">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight ${
                                                    user.role === 'admin' ? 'bg-red-100 text-red-600' : 
                                                    user.role === 'supervisor' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                                                }`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                {user.biometricId ? (
                                                    <div className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md text-xs font-bold">
                                                        <i className="fas fa-fingerprint"></i> Linked
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 text-xs italic">Not Linked</span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                            <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                
                                                {/* زر إعادة تعيين البصمة - يظهر فقط إذا كانت البصمة موجودة */}
                                                {user.biometricId && (
                                                    <button 
                                                        onClick={() => handleResetBiometric(user)} 
                                                        className="w-8 h-8 flex items-center justify-center text-orange-600 hover:bg-orange-100 rounded-lg transition-colors" 
                                                        title="Reset Biometric Fingerprint"
                                                    >
                                                  <i className="fas fa-fingerprint" style={{ fontSize: '14px', display: 'block' }}></i>        
                                                    </button>
                                                )}

                                                <button 
                                                    onClick={() => handleUnlockAttendance(user)} 
                                                    className="w-8 h-8 flex items-center justify-center text-purple-600 hover:bg-purple-100 rounded-lg transition-colors" 
                                                    title="Unlock Temporary Access"
                                                >
                                                    <i className="fas fa-key text-xs"></i>
                                                </button>

                                                <button 
                                                    onClick={() => { setEditForm(user); setIsEditModalOpen(true); }} 
                                                    className="w-8 h-8 flex items-center justify-center text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                >
                                                    <i className="fas fa-pen text-xs"></i>
                                                </button>

                                                <button 
                                                    onClick={() => handleDeleteUser(user)} 
                                                    className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                                                >
                                                    <i className="fas fa-trash-alt text-xs"></i>
                                                </button>
                                            </div>
                                        </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Add User Sidebar */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 sticky top-8">
                        <div className="mb-6">
                            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm">
                                    <i className="fas fa-plus"></i>
                                </span>
                                {t('sup.user.add')}
                            </h3>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 ml-1 mb-1 block">Full Name</label>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-100 focus:border-blue-500 focus:bg-white transition-all rounded-xl p-3 text-sm outline-none font-semibold" 
                                    placeholder="e.g. John Doe" 
                                    value={newUserData.name} 
                                    onChange={e => setNewUserData({...newUserData, name: e.target.value})} 
                                />
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-slate-500 ml-1 mb-1 block">Email Address</label>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-100 focus:border-blue-500 focus:bg-white transition-all rounded-xl p-3 text-sm outline-none font-semibold" 
                                    placeholder="email@company.com" 
                                    type="email" 
                                    value={newUserData.email} 
                                    onChange={e => setNewUserData({...newUserData, email: e.target.value})} 
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 ml-1 mb-1 block">Password</label>
                                <input 
                                    className="w-full bg-slate-50 border border-slate-100 focus:border-blue-500 focus:bg-white transition-all rounded-xl p-3 text-sm outline-none font-semibold" 
                                    placeholder="Min 6 characters" 
                                    type="password" 
                                    value={newUserData.password} 
                                    onChange={e => setNewUserData({...newUserData, password: e.target.value})} 
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-xs font-bold text-slate-500 ml-1 mb-1 block">Role</label>
                                    <select 
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm outline-none font-bold text-slate-700" 
                                        value={newUserData.role} 
                                        onChange={e => setNewUserData({...newUserData, role: e.target.value})}
                                    >
                                        <option value="user">Employee</option>
                                        <option value="doctor">Doctor</option>
                                        <option value="supervisor">Supervisor</option>
                                        <option value="admin">Administrator</option>
                                    </select>
                                </div>
                            </div>

                            <button 
                                onClick={handleAddUser} 
                                disabled={isAddingUser}
                                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-blue-700 transition-all shadow-lg shadow-slate-200 flex items-center justify-center disabled:opacity-50 mt-4 group"
                            >
                                {isAddingUser ? (
                                    <i className="fas fa-circle-notch fa-spin"></i>
                                ) : (
                                    <>
                                        <span>Create User Account</span>
                                        <i className="fas fa-chevron-right ml-2 text-[10px] group-hover:translate-x-1 transition-transform rtl:rotate-180"></i>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Update Employee Profile">
                <div className="space-y-5 p-2">
                    <div className="grid gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Full Name</label>
                            <input className="w-full bg-slate-100 border-none rounded-xl p-3 font-bold text-slate-700 focus:ring-2 ring-blue-500" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Phone Number</label>
                            <input className="w-full bg-slate-100 border-none rounded-xl p-3 font-bold text-slate-700" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Access Level</label>
                            <select className="w-full bg-slate-100 border-none rounded-xl p-3 font-bold text-slate-700" value={editForm.role || 'user'} onChange={e => setEditForm({...editForm, role: e.target.value})}>
                                <option value="user">User</option>
                                <option value="doctor">Doctor</option>
                                <option value="supervisor">Supervisor</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3 mt-6">
                        <button onClick={() => setIsEditModalOpen(false)} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                        <button onClick={handleUpdateUser} className="flex-2 px-8 bg-blue-600 text-white py-3 rounded-xl font-black shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">Save Changes</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default SupervisorEmployees;