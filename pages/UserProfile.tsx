
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { db as certDb } from '../firebaseData';
// @ts-ignore
import { collection, query, where, getDocs, addDoc, Timestamp, getCountFromServer, doc, getDoc, updateDoc } from 'firebase/firestore';
import { ActionLog, PeerRecognition, User } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useDepartment } from '../contexts/DepartmentContext';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import { appointmentsDb } from '../firebaseAppointments';

// Helper for safe dates
const safeDate = (val: any) => {
    if (!val) return '-';
    if (typeof val === 'string') return val;
    if (val.toDate) return val.toDate().toLocaleDateString('en-US');
    return String(val);
};

const UserProfile: React.FC = () => {
    const { t, dir } = useLanguage();
    const { selectedDepartmentId } = useDepartment();
    const navigate = useNavigate();
    const currentUserId = auth.currentUser?.uid;
    const currentUserName = localStorage.getItem('username') || 'User';
    
    const [myActions, setMyActions] = useState<ActionLog[]>(() => {
        const cached = localStorage.getItem('usr_cached_actions');
        return cached ? JSON.parse(cached) : [];
    });
    const [myKudos, setMyKudos] = useState<PeerRecognition[]>(() => {
        const cached = localStorage.getItem('usr_cached_kudos');
        return cached ? JSON.parse(cached) : [];
    });
    const [myCertifications, setMyCertifications] = useState<any[]>([]);
    const [users, setUsers] = useState<User[]>(() => {
        const cached = localStorage.getItem('usr_cached_users');
        return cached ? JSON.parse(cached) : [];
    });
    const [patientsCount, setPatientsCount] = useState(0);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    
    // User Profile Information State
    const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [editEmpNumber, setEditEmpNumber] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    
    const [isKudosModalOpen, setIsKudosModalOpen] = useState(false);
    const [kudosForm, setKudosForm] = useState({ toUserId: '', type: 'thankyou' as 'hero'|'thankyou'|'teamplayer', message: '' });
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);

    useEffect(() => {
        if (!currentUserId) return;
        const fetchUserProfile = async () => {
            try {
                const userDocSnap = await getDoc(doc(db, 'users', currentUserId));
                if (userDocSnap.exists()) {
                    const data = { id: userDocSnap.id, ...userDocSnap.data() } as User;
                    setCurrentUserProfile(data);
                    setEditEmpNumber(data.employeeNumber || '');
                    setEditPhone(data.phone || '');
                }
            } catch (err) {
                console.error("Error fetching user profile:", err);
            }
        };
        fetchUserProfile();
    }, [currentUserId, refreshTrigger]);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUserId) return;
        setIsSavingProfile(true);
        try {
            await updateDoc(doc(db, 'users', currentUserId), {
                employeeNumber: editEmpNumber.trim(),
                phone: editPhone.trim()
            });
            setCurrentUserProfile(prev => prev ? ({ ...prev, employeeNumber: editEmpNumber.trim(), phone: editPhone.trim() }) : null);
            setToast({ msg: 'تم تحديث الرقم الوظيفي والبيانات بنجاح!', type: 'success' });
            setIsEditProfileOpen(false);
            setRefreshTrigger(prev => prev + 1);
        } catch (err: any) {
            setToast({ msg: 'فشل التحديث: ' + err.message, type: 'error' });
        } finally {
            setIsSavingProfile(false);
        }
    };

    useEffect(() => {
        localStorage.setItem('usr_cached_actions', JSON.stringify(myActions));
    }, [myActions]);

    useEffect(() => {
        localStorage.setItem('usr_cached_kudos', JSON.stringify(myKudos));
    }, [myKudos]);

    useEffect(() => {
        localStorage.setItem('usr_cached_users', JSON.stringify(users));
    }, [users]);

    useEffect(() => {
        if (!currentUserId || !selectedDepartmentId) return;

        const qKudos = query(collection(db, 'peer_recognition'), where('toUserId', '==', currentUserId));
        getDocs(qKudos).then((snap) => {
            const fetchedKudos = snap.docs.map(d => ({ ...d.data(), id: d.id } as PeerRecognition));
            fetchedKudos.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setMyKudos(fetchedKudos);
        });

        const qActions = query(collection(db, 'actions'), where('employeeId', '==', currentUserId));
        getDocs(qActions).then((snap) => {
            const fetchedActions = snap.docs.map(d => ({ ...d.data(), id: d.id } as ActionLog));
            fetchedActions.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setMyActions(fetchedActions);
        });

        const qUsers = query(collection(db, 'users'), where('departmentId', '==', selectedDepartmentId));
        getDocs(qUsers).then((snap) => {
            setUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as User)));
        });

        const fetchUserCerts = async () => {
            try {
                const certDocRef = doc(certDb, 'employee_records', currentUserId!);
                const certDocSnap = await getDoc(certDocRef);
                if (certDocSnap.exists()) {
                    const certData = certDocSnap.data();
                    const certs = [];
                    const docs = certData.documents || [];
                    
                    const licenseDoc = docs.find((d: any) => d.category === 'license');
                    if (certData.licenseExpiry || licenseDoc) {
                        certs.push({ 
                            id: 'license', 
                            category: 'license',
                            name: 'License', 
                            expiryDate: certData.licenseExpiry || '-', 
                            documentUrl: licenseDoc?.url 
                        });
                    }
                    const regDoc = docs.find((d: any) => d.category === 'registration');
                    if (certData.registrationExpiry || regDoc) {
                        certs.push({ 
                            id: 'registration', 
                            category: 'registration',
                            name: 'Registration', 
                            expiryDate: certData.registrationExpiry || '-', 
                            documentUrl: regDoc?.url 
                        });
                    }
                    const nrrcDoc = docs.find((d: any) => d.category === 'nrrc');
                    if (certData.nrrcExpiry || nrrcDoc) {
                        certs.push({ 
                            id: 'nrrc', 
                            category: 'nrrc',
                            name: 'NRRC Certificate', 
                            expiryDate: certData.nrrcExpiry || '-', 
                            documentUrl: nrrcDoc?.url 
                        });
                    }

                    // Add other general documents
                    docs.forEach((d: any) => {
                        if (d.category !== 'license' && d.category !== 'registration' && d.category !== 'nrrc') {
                            certs.push({
                                id: d.uploadedAt || Math.random().toString(),
                                name: d.name,
                                expiryDate: d.expiryDate || '-',
                                documentUrl: d.url
                            });
                        }
                    });

                    setMyCertifications(certs);
                }
            } catch (e) { console.error("Error fetching user certs:", e); }
        };
        fetchUserCerts();

        // Get Patients Count from Supabase
        const fetchPatientCount = async () => {
            try {
                const qCount = query(collection(appointmentsDb, 'appointments'), where('performedBy', '==', currentUserId), where('status', '==', 'done'));
                const countSnap = await getCountFromServer(qCount);
                const count = countSnap.data().count;
                const error = null;

                if (error) throw error;
                setPatientsCount(count || 0);
            } catch (e) { console.error("Supabase count error:", e); }
        };
        fetchPatientCount();

    }, [currentUserId, refreshTrigger, selectedDepartmentId]);

    const handleSendKudos = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!currentUserId) return;
        if(!kudosForm.toUserId || !kudosForm.message) return setToast({msg: 'Please select a colleague and write a message', type: 'error'});
        
        try {
            const targetUserObj = users.find(u => u.id === kudosForm.toUserId);
            const targetName = targetUserObj ? (targetUserObj.name || targetUserObj.email) : 'Colleague';
            const senderUserObj = users.find(u => u.id === currentUserId);
  
            await addDoc(collection(db, 'peer_recognition'), {
                fromUserId: currentUserId,
                fromUserName: currentUserName,
                toUserId: kudosForm.toUserId,
                toUserName: targetName, 
                departmentId: selectedDepartmentId,
                type: kudosForm.type,
                message: kudosForm.message,
                createdAt: Timestamp.now()
            });
            setToast({ msg: 'Appreciation Sent Successfully! 🎉', type: 'success' });
            setIsKudosModalOpen(false);
            setKudosForm({ toUserId: '', type: 'thankyou', message: '' });
        } catch(e) {
            setToast({ msg: 'Error sending appreciation', type: 'error' });
        }
    };

    return (
        <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/user')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                        <i className="fas fa-arrow-left rtl:rotate-180"></i>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800">{t('user.tab.profile')}</h1>
                        <p className="text-xs text-slate-500 font-medium">الملف التعريفي والبيانات الوظيفية</p>
                    </div>
                </div>

                <button 
                    onClick={() => {
                        setEditEmpNumber(currentUserProfile?.employeeNumber || '');
                        setEditPhone(currentUserProfile?.phone || '');
                        setIsEditProfileOpen(true);
                    }}
                    className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 shadow-sm flex items-center gap-2 transition-all hover:shadow"
                >
                    <i className="fas fa-user-edit text-blue-500"></i> تعديل بيانات الموظف
                </button>
            </div>

            {/* Employee ID & Profile Overview Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm mb-8">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center text-2xl font-black shadow-md shadow-blue-200">
                            {currentUserProfile?.name ? currentUserProfile.name.charAt(0) : currentUserName.charAt(0)}
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <h2 className="text-xl font-black text-slate-800">
                                    {currentUserProfile?.name || currentUserName}
                                </h2>
                                <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
                                    {currentUserProfile?.jobCategory || currentUserProfile?.role || 'Staff'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 font-medium flex items-center gap-2">
                                <i className="fas fa-envelope text-slate-300"></i> {currentUserProfile?.email || auth.currentUser?.email || '-'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                        {/* Employee Number Badge */}
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-sm">
                            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center text-sm shadow-sm">
                                <i className="fas fa-id-badge"></i>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-amber-800/70 uppercase tracking-wider">الرقم الوظيفي (ID)</span>
                                <span className="text-sm font-black text-amber-950">
                                    {currentUserProfile?.employeeNumber ? `#${currentUserProfile.employeeNumber}` : 'غير محدد'}
                                </span>
                            </div>
                        </div>

                        {/* Phone Badge */}
                        {currentUserProfile?.phone && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl px-4 py-2.5 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center text-sm">
                                    <i className="fas fa-phone"></i>
                                </div>
                                <div>
                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">رقم الهاتف</span>
                                    <span className="text-xs font-bold text-slate-700 dir-ltr">{currentUserProfile.phone}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Score Card */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden mb-8">
                <div className="absolute right-0 top-0 h-full w-1/3 bg-white/5 skew-x-12"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-full flex items-center justify-center border-4 border-white/20 text-3xl font-black">
                            {100 - (myActions.filter(a => ['violation', 'unjustified_absence', 'late'].includes(a.type)).length * 10)}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black">{t('stats.attendance')}</h2>
                            <p className="text-slate-400">Points based on monthly performance</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <div className="bg-white/10 px-4 py-2 rounded-xl text-center min-w-[80px]">
                            <span className="block text-2xl font-black text-emerald-400">{myKudos.length}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-300">Kudos</span>
                        </div>
                        <div className="bg-white/10 px-4 py-2 rounded-xl text-center min-w-[80px]">
                            <span className="block text-2xl font-black text-blue-400">{patientsCount}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-300">Cases</span>
                        </div>
                        <div className="bg-white/10 px-4 py-2 rounded-xl text-center min-w-[80px]">
                            <span className="block text-2xl font-black text-red-400">{myActions.filter(a => ['violation', 'late', 'unjustified_absence'].includes(a.type)).length}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-300">Flags</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-4 mb-6">
                <button 
                    onClick={() => setIsKudosModalOpen(true)}
                    className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-orange-200 hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
                >
                    <i className="fas fa-heart text-white animate-pulse"></i> {t('kudos.send')}
                </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Kudos Wall */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <i className="fas fa-award text-amber-500"></i> {t('kudos.received')}
                    </h3>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {myKudos.length === 0 ? (
                            <p className="text-center text-slate-400 py-8 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                No kudos yet. Be a hero today!
                            </p>
                        ) : (
                            myKudos.map(k => (
                                <div key={k.id} className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-xl border border-amber-100 relative overflow-hidden group hover:shadow-md transition-all">
                                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <i className={`fas ${k.type === 'hero' ? 'fa-medal' : k.type === 'teamplayer' ? 'fa-users' : 'fa-thumbs-up'} text-4xl text-amber-600`}></i>
                                    </div>
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded text-white ${k.type === 'hero' ? 'bg-purple-500' : k.type === 'teamplayer' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                                                {t(`kudos.${k.type}`)}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-mono">
                                                {safeDate(k.createdAt)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-700 font-medium italic">"{k.message}"</p>
                                        <p className="text-xs text-amber-700 font-bold mt-2 flex items-center gap-1">
                                            <i className="fas fa-user-circle"></i> {k.fromUserName}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Action Log History */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <i className="fas fa-clipboard-list text-blue-500"></i> Performance Log
                    </h3>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {myActions.length === 0 ? (
                            <p className="text-center text-slate-400 py-4 text-sm">Clean record!</p>
                        ) : (
                            myActions.map(act => (
                                <div key={act.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                                    <div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${act.type === 'positive' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                            {t(`action.${act.type}`) || act.type}
                                        </span>
                                        {/* SAFE DATE RENDERING */}
                                        <p className="text-xs text-slate-500 mt-1 font-mono">{safeDate(act.fromDate)}</p>
                                    </div>
                                    <p className="text-xs text-slate-700 font-medium max-w-[50%] text-right">{act.description}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Certifications */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <i className="fas fa-certificate text-amber-500"></i> Certifications
                        </h3>
                    </div>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {myCertifications.length === 0 ? (
                            <p className="text-center text-slate-400 py-4 text-sm">No certifications.</p>
                        ) : (
                            myCertifications.map(cert => {
                                console.log('Checking certification:', cert);
                                return (
                                <div key={cert.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                                    <div>
                                        <p className="text-sm font-bold text-slate-700">{cert.name}</p>
                                        <p className={`text-[10px] mt-1 font-mono ${cert.expiryDate !== '-' && new Date(cert.expiryDate) < new Date() ? 'text-red-500 font-bold' : 'text-slate-500'}`}>
                                            Expires: {cert.expiryDate} {cert.expiryDate !== '-' && new Date(cert.expiryDate) < new Date() ? '(Expired)' : ''}
                                            {cert.category && cert.category.toLowerCase() === 'license' && (
                                                <a 
                                                    href={cert.documentUrl || '#'}
                                                    target="_blank" 
                                                    rel="noreferrer" 
                                                    className={`ml-2 text-xl ${cert.documentUrl ? 'text-blue-500 hover:text-blue-600' : 'text-slate-300 cursor-not-allowed'}`}
                                                    onClick={(e) => {
                                                        if (!cert.documentUrl) e.preventDefault();
                                                    }}
                                                >
                                                    <i className="fas fa-file-pdf"></i>
                                                </a>
                                            )}
                                        </p>
                                    </div>
                                    {cert.documentUrl && (
                                        <a href={cert.documentUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600">
                                            <i className="fas fa-file-pdf text-xl"></i>
                                        </a>
                                    )}
                                </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Modal: Send Kudos */}
            <Modal isOpen={isKudosModalOpen} onClose={() => setIsKudosModalOpen(false)} title={t('kudos.send')}>
                <form onSubmit={handleSendKudos} className="space-y-5">
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-center">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm text-2xl">
                            🎉
                        </div>
                        <p className="text-amber-800 text-xs font-bold">Encourage your colleagues and spread positivity!</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t('user.req.colleague')}</label>
                        <select 
                            className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-amber-200"
                            value={kudosForm.toUserId}
                            onChange={e => setKudosForm({...kudosForm, toUserId: e.target.value})}
                            required
                        >
                            <option value="">Select Colleague...</option>
                            {users.filter(u => u.id !== currentUserId && !['admin', 'supervisor', 'manager'].includes(u.role)).map(u => (
                                <option key={u.id} value={u.id}>{u.name || u.email}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2">Select Badge</label>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { id: 'thankyou', label: t('kudos.thank'), icon: 'fa-thumbs-up', color: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' },
                                { id: 'teamplayer', label: t('kudos.team'), icon: 'fa-users', color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' },
                                { id: 'hero', label: t('kudos.hero'), icon: 'fa-medal', color: 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100' }
                            ].map(type => (
                                <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => setKudosForm({...kudosForm, type: type.id as any})}
                                    className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${kudosForm.type === type.id ? type.color.replace('50', '100').replace('hover:', '') + ' border-current ring-2 ring-offset-1 ring-slate-100' : 'bg-white border-slate-100 text-slate-400 grayscale hover:grayscale-0'}`}
                                >
                                    <i className={`fas ${type.icon} text-2xl`}></i>
                                    <span className="text-[10px] font-bold">{type.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Message</label>
                        <textarea 
                            className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-amber-200 min-h-[100px] resize-none"
                            placeholder="Write something nice..."
                            value={kudosForm.message}
                            onChange={e => setKudosForm({...kudosForm, message: e.target.value})}
                            required
                        ></textarea>
                    </div>

                    <button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3.5 rounded-xl font-bold hover:shadow-lg hover:scale-[1.02] transition-all active:scale-95 shadow-md shadow-orange-200 flex items-center justify-center gap-2">
                        <i className="fas fa-paper-plane"></i> Send Appreciation
                    </button>
                </form>
            </Modal>

            {/* Edit Profile / Employee Number Modal */}
            <Modal isOpen={isEditProfileOpen} onClose={() => setIsEditProfileOpen(false)} title="تعديل بيانات الموظف والرقم الوظيفي">
                <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800 flex items-start gap-3 mb-2">
                        <i className="fas fa-info-circle text-blue-500 text-base mt-0.5"></i>
                        <div>
                            <p className="font-bold mb-0.5">الرقم الوظيفي الخاص بك:</p>
                            <p className="text-blue-700/90">يُستخدم هذا الرقم كمعرف شخصي فريد في نماذج التقييم السنوي والشهادات والمعاملات الرسمية.</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                            <i className="fas fa-id-badge text-amber-500"></i> الرقم الوظيفي (Employee Number / ID)
                        </label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-300 focus:bg-white transition-all"
                            placeholder="مثال: 10423 أو EMP-882"
                            value={editEmpNumber}
                            onChange={e => setEditEmpNumber(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                            <i className="fas fa-phone text-blue-500"></i> رقم الهاتف (Phone Number)
                        </label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-300 focus:bg-white transition-all dir-ltr"
                            placeholder="+966 5X XXX XXXX"
                            value={editPhone}
                            onChange={e => setEditPhone(e.target.value)}
                        />
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button 
                            type="button" 
                            onClick={() => setIsEditProfileOpen(false)}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-sm transition-all"
                        >
                            إلغاء
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSavingProfile}
                            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl font-bold text-sm shadow-md shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isSavingProfile ? (
                                <>
                                    <i className="fas fa-spinner fa-spin"></i> جاري الحفظ...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-check"></i> حفظ التعديلات
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default UserProfile;
