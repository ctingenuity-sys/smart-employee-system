
import React, { useState, useEffect } from 'react';
import { db, firebaseConfig, auth } from '../../firebase';
// @ts-ignore
import { collection, updateDoc, deleteDoc, setDoc, onSnapshot, doc, Timestamp, query, where, getDocs, writeBatch, limit, orderBy, addDoc,serverTimestamp } from 'firebase/firestore';
// @ts-ignore
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
// @ts-ignore
import { initializeApp, deleteApp } from 'firebase/app';
import { User, LocationCheckRequest } from '../../types';
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
    const [newUserName, setNewUserName] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState('user');
    const [newUserPhone, setNewUserPhone] = useState('');
    
    // Live Check Result State
    const [checkResult, setCheckResult] = useState<LocationCheckRequest | null>(null);
    const [showMapModal, setShowMapModal] = useState(false);

    const currentAdminName = localStorage.getItem('username') || 'Admin';
    const currentAdminId = auth.currentUser?.uid;

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'users'), (snap) => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });
        
        // Listen for completed checks initiated by THIS supervisor only
        // Simplified query to avoid index errors, filtering in memory
        if (currentAdminId) {
            const qChecks = query(
                collection(db, 'location_checks'), 
                where('supervisorId', '==', currentAdminId),
                where('status', '==', 'completed')
            );
            
            const unsubChecks = onSnapshot(qChecks, (snap) => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data() as LocationCheckRequest;
                        const completedTime = data.completedAt?.toDate().getTime();
                        const now = Date.now();
                        
                        // Only show if completed within the last 60 seconds
                        if (now - completedTime < 60000) {
                            setToast({ msg: `Check Completed for User!`, type: 'success' });
                            setCheckResult(data);
                            setShowMapModal(true);
                            
                            // Auto-hide logic (1 minute from now)
                            setTimeout(() => {
                                setShowMapModal(false);
                                setCheckResult(null);
                            }, 60000); 
                        }
                    }
                });
            });
            return () => { unsub(); unsubChecks(); };
        }

        return () => { unsub(); };
    }, [currentAdminId]);

    // --- Actions ---
    const handleAddUser = async () => {
        const email = newUserEmail.trim();
        const password = newUserPassword.trim();

        if (!email || !password) return setToast({ msg: 'Email & Password required', type: 'error' });
        
        setIsAddingUser(true);
        // Use unique app name to avoid collisions
        const appName = `SecondaryApp-${Date.now()}`;
        let secondaryApp: any;
        
        try {
            secondaryApp = initializeApp(firebaseConfig, appName);
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUserId = userCredential.user.uid;
            
            await setDoc(doc(db, 'users', newUserId), {
                uid: newUserId,
                email: email,
                name: newUserName.trim(),
                role: newUserRole,
                phone: newUserPhone.trim(),
                createdAt: Timestamp.now()
            });
            
            setToast({ msg: 'User Added Successfully!', type: 'success' });
            setNewUserName(''); setNewUserEmail(''); setNewUserPassword(''); setNewUserPhone('');
            
            await signOut(secondaryAuth);
            await deleteApp(secondaryApp);
        } catch (e: any) {
            console.error("Add User Error:", e);
            let errMsg = e.message;
            if (e.code === 'auth/email-already-in-use') errMsg = 'Email already exists';
            if (e.code === 'auth/weak-password') errMsg = 'Password too weak';
            if (e.code === 'auth/invalid-email') errMsg = 'Invalid email address';
            setToast({ msg: 'Error: ' + errMsg, type: 'error' });
            
            if (secondaryApp) { 
                try { await deleteApp(secondaryApp); } catch(err) { console.error("Error deleting app", err); } 
            }
        } finally {
            setIsAddingUser(false);
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
            setToast({ msg: 'Error updating: ' + e.message, type: 'error' });
        }
    };

    const handleDeleteUser = async (user: User) => {
        if (!confirm(`Delete ${user.name}? This will wipe all data.`)) return;
        if (!confirm(`FINAL WARNING: This is irreversible.`)) return;
        
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const deleteByQuery = async (col: string, field: string) => {
                const q = query(collection(db, col), where(field, '==', user.id));
                const snap = await getDocs(q);
                snap.docs.forEach(d => batch.delete(d.ref));
            };
            
            await Promise.all([
                deleteByQuery('schedules', 'userId'),
                deleteByQuery('attendance_logs', 'userId'),
                deleteByQuery('leaveRequests', 'from'),
                deleteByQuery('swapRequests', 'from'),
                deleteByQuery('swapRequests', 'to'),
                deleteByQuery('actions', 'employeeId'),
                deleteByQuery('attendance_overrides', 'userId'),
            ]);
            
            batch.delete(doc(db, 'users', user.id));
            await batch.commit();
            setToast({ msg: 'User Deleted', type: 'success' });
        } catch(e:any) {
            setToast({ msg: 'Error: ' + e.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleResetBiometric = async (user: User) => {
        if (!confirm(`Reset biometric binding for ${user.name}?`)) return;
        try {
            await updateDoc(doc(db, 'users', user.id), { biometricId: null, biometricRegisteredAt: null });
            setToast({ msg: 'Biometric Reset', type: 'success' });
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleUnlockAttendance = async (user: User) => {
        try {
            await addDoc(collection(db, 'attendance_overrides'), {
                userId: user.id,
                userName: user.name,
                grantedBy: currentAdminName,
                grantedAt: Timestamp.now(),
                validUntil: Timestamp.fromDate(new Date(Date.now() + 3600000)) // +1 Hour
            });
            setToast({ msg: 'Unlocked for 1 Hour', type: 'success' });
        } catch(e) { setToast({ msg: 'Error', type: 'error' }); }
    };

const handleSendLiveCheck = async (user: User) => {
    try {
        await addDoc(collection(db, 'location_checks'), {
            targetUserId: user.id, // تأكد أن هذا هو نفس الـ ID الذي ظهر في كونسول الموظف
            supervisorId: currentAdminId,
            status: 'pending',
            createdAt: serverTimestamp(), // Use server timestamp for accurate timing
            requestedAtStr: new Date().toISOString() 
        });
        setToast({ msg: 'تم إرسال الطلب بنجاح', type: 'success' });
    } catch (e) {
        setToast({ msg: 'فشل في الإرسال', type: 'error' });
    }
};
    // --- Diagnose User Logic ---
    const handleDiagnoseUser = async (user: User) => {
      // Just check logs without sending request
      setLoading(true);
      try {
          let snap;
          try {
              const qLogs = query(collection(db, 'attendance_logs'), where('userId', '==', user.id), orderBy('timestamp', 'desc'), limit(5));
              snap = await getDocs(qLogs);
          } catch (error: any) {
              const qFallback = query(collection(db, 'attendance_logs'), where('userId', '==', user.id));
              const fullSnap = await getDocs(qFallback);
              const sortedDocs = fullSnap.docs.sort((a, b) => (b.data().timestamp?.seconds || 0) - (a.data().timestamp?.seconds || 0)).slice(0, 5);
              snap = { empty: sortedDocs.length === 0, docs: sortedDocs, size: sortedDocs.length };
          }
          
          let msg = `🔍 Report for: ${user.name}\n🆔 UID: ${user.id}\n📱 Biometric: ${user.biometricId ? 'YES ✅' : 'NO ❌'}\n----------------\n`;
          if (snap.empty) {
              msg += `⚠️ NO LOGS FOUND.\n`;
          } else {
              const lastLog = snap.docs[0].data();
              const lastLogTime = lastLog.timestamp?.toDate ? lastLog.timestamp.toDate() : new Date();
              msg += `✅ Last Punch: ${lastLogTime.toLocaleString()}\n📍 Loc: ${lastLog.distanceKm ? (lastLog.distanceKm * 1000).toFixed(0) + 'm' : 'N/A'}\n`;
          }
          alert(msg);
      } catch (e: any) {
          setToast({ msg: 'Error: ' + e.message, type: 'error' });
      } finally {
          setLoading(false);
      }
    };

    const filteredUsers = users.filter(u => 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            {loading && <div className="fixed inset-0 bg-white/50 z-50 flex items-center justify-center"><div className="w-10 h-10 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div></div>}

            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                        <i className="fas fa-arrow-left rtl:rotate-180"></i>
                    </button>
                    <h1 className="text-2xl font-black text-slate-800">{t('sup.tab.users')}</h1>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* User List */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                            <i className="fas fa-search text-gray-400"></i>
                            <input 
                                className="bg-transparent outline-none text-sm w-full font-bold text-gray-600"
                                placeholder="Search Users..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="overflow-x-auto">
                            <table className={`w-full ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase border-b border-gray-100">
                                    <tr>
                                        <th className="p-5">{t('role.user')}</th>
                                        <th className="p-5">{t('sup.user.role')}</th>
                                        <th className="p-5">Bio</th>
                                        <th className="p-5 text-center">{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-sm">
                                    {filteredUsers.map(user => (
                                        <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="p-4 flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs">
                                                    {user.name ? user.name.charAt(0) : '?'}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800">{user.name}</h4>
                                                    <p className="text-[10px] text-slate-400">{user.email}</p>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">{user.role}</span>
                                            </td>
                                            <td className="p-4">
                                                {user.biometricId ? <i className="fas fa-fingerprint text-emerald-500"></i> : <span className="text-slate-300">-</span>}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleSendLiveCheck(user)} className="text-red-600 hover:bg-red-50 p-1 rounded animate-pulse" title="Live Check"><i className="fas fa-map-marker-alt"></i></button>
                                                    {user.biometricId && <button onClick={() => handleResetBiometric(user)} className="text-orange-500 hover:bg-orange-50 p-1 rounded" title="Reset Bio"><i className="fas fa-unlock-alt"></i></button>}
                                                    <button onClick={() => handleUnlockAttendance(user)} className="text-purple-500 hover:bg-purple-50 p-1 rounded" title="Unlock Att"><i className="fas fa-history"></i></button>
                                                    <button onClick={() => handleDiagnoseUser(user)} className="text-indigo-500 hover:bg-indigo-50 p-1 rounded" title="Diagnose"><i className="fas fa-stethoscope"></i></button>
                                                    <button onClick={() => { setEditForm(user); setIsEditModalOpen(true); }} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><i className="fas fa-pen"></i></button>
                                                    <button onClick={() => handleDeleteUser(user)} className="text-red-500 hover:bg-red-50 p-1 rounded"><i className="fas fa-trash"></i></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Add User Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 sticky top-4">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><i className="fas fa-user-plus text-blue-500"></i> {t('sup.user.add')}</h3>
                        <div className="space-y-3">
                            <input className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm" placeholder={t('sup.user.name')} value={newUserName} onChange={e => setNewUserName(e.target.value)} />
                            <input className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm" placeholder="Email" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
                            <input className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm" placeholder="Password" type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} />
                            <input className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm" placeholder="Phone (Optional)" value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} />
                            <select className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm" value={newUserRole} onChange={e => setNewUserRole(e.target.value)}>
                                <option value="user">User</option>
                                <option value="doctor">Doctor</option>
                                <option value="supervisor">Supervisor</option>
                                <option value="admin">Admin</option>
                            </select>
                            <button 
                                onClick={handleAddUser} 
                                disabled={isAddingUser}
                                className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg flex items-center justify-center disabled:opacity-50"
                            >
                                {isAddingUser ? <i className="fas fa-spinner fa-spin"></i> : t('add')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit User">
                <div className="space-y-4">
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} placeholder="Name" />
                    <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} placeholder="Phone" />
                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3" value={editForm.role || 'user'} onChange={e => setEditForm({...editForm, role: e.target.value})}>
                        <option value="user">User</option>
                        <option value="doctor">Doctor</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button onClick={handleUpdateUser} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg">Update</button>
                </div>
            </Modal>

            {/* Map Modal */}
            <Modal isOpen={showMapModal} onClose={() => setShowMapModal(false)} title="Live Location Result">
                {checkResult && (
                    <div className="space-y-4 p-2">
                        <div className="text-center mb-2">
                        <h3 className="text-xl font-black text-slate-800">{checkResult.userName}</h3>
                        <span className="text-xs text-slate-500 uppercase tracking-widest">Location Verified</span>
                    </div>

                    <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl text-center font-bold text-sm border border-emerald-100">
                        Check Completed at {checkResult.completedAt?.toDate().toLocaleTimeString()}
                    </div>
                                
                        <div className="w-full h-[400px] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-inner">
                            <iframe 
                                width="100%" 
                                height="100%" 
                                frameBorder="0" 
                                scrolling="no" 
                                marginHeight={0} 
                                marginWidth={0} 
                                src={`https://maps.google.com/maps?q=${checkResult.locationLat},${checkResult.locationLng}&hl=en&z=15&output=embed`}
                                title="Location Map"
                            ></iframe>
                        </div>
                        <div className="flex justify-center">
                            <a 
                                href={`https://www.google.com/maps/search/?api=1&query=${checkResult.locationLat},${checkResult.locationLng}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-blue-600 hover:underline text-xs font-bold flex items-center gap-1"
                            >
                                <i className="fas fa-external-link-alt"></i> Open in Google Maps
                            </a>
                        </div>
                        <div className="text-center text-xs text-slate-400">
                            Accuracy: ~{checkResult.accuracy?.toFixed(0)}m
                        </div>
                        <div className="text-center text-[10px] text-red-400 font-bold mt-2">
                            This window will close automatically in 1 minute.
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default SupervisorEmployees;
