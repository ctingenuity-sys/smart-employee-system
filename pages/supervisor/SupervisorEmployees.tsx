
import React, { useState, useEffect } from 'react';
import { db, firebaseConfig, auth } from '../../firebase'; // Removed storage import
// @ts-ignore
import { collection, updateDoc, deleteDoc, setDoc, onSnapshot, doc, Timestamp, query, where, getDocs, writeBatch, limit, orderBy, addDoc,serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
// @ts-ignore
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
// @ts-ignore
import { initializeApp, deleteApp } from 'firebase/app';
import { User, LocationCheckRequest, UserDocument } from '../../types';
import Modal from '../../components/Modal';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
// Import the new storage service
import { uploadFile } from '../../services/storageClient';

const ALL_PERMISSIONS = [
    { key: 'schedule', label: 'الجدول (User Schedule)' },
    { key: 'requests', label: 'الطلبات (Leave/Swaps)' },
    { key: 'market', label: 'سوق الورديات (Market)' },
    { key: 'incoming', label: 'الوارد (Incoming)' },
    { key: 'history', label: 'السجل (History)' },
    { key: 'profile', label: 'الملف الشخصي (Profile)' },
    { key: 'performance', label: 'الأداء (Performance)' },
    { key: 'appointments', label: 'المواعيد (Appointments)' },
    { key: 'communications', label: 'التواصل (Comm/Log)' },
    { key: 'inventory', label: 'المخزون (Inventory)' },
    { key: 'tasks', label: 'المهام (Tasks)' },
    { key: 'tech_support', label: 'الدعم الفني (Tech)' },
    { key: 'hr_assistant', label: 'HR Assistant' },
];

// Mapped to match the specific CSS classes requested
const JOB_CATEGORIES = [
    { id: 'doctor', title: 'Doctors', cssClass: 'doctors', icon: 'fa-user-md' },
    { id: 'technologist', title: 'Specialists', cssClass: 'technologists', icon: 'fa-user-graduate' },
    { id: 'usg', title: 'Ultrasound', cssClass: 'technologists', icon: 'fa-wave-square', isHidden: true }, // Added USG but hidden from circles
    { id: 'technician', title: 'Technicians', cssClass: 'technicians', icon: 'fa-cogs' },
    { id: 'nurse', title: 'Nurses', cssClass: 'assistants', icon: 'fa-user-nurse' },
    { id: 'rso', title: 'R S O', cssClass: 'rso', icon: 'fa-radiation' },
];

const styles = `
/* --------------------------------------------------------------------------------
   General Styles & Animations from Request
-------------------------------------------------------------------------------- */
.section-circle {
    width: 200px;
    height: 200px;
    border-radius: 50%;
    color: white;
    font-size: 20px;
    font-weight: 700;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
    transition: transform 0.3s ease, filter 0.3s ease;
    text-align: center;
    padding: 10px;
    line-height: 1.2;
    flex-direction: column;
    user-select: none;
    position: relative;
    margin-bottom: 40px; /* Adjusted space */
    border: 4px solid transparent; /* Prepare for border change */
}
.section-circle:hover {
    transform: translateY(-10px) scale(1.02);
    filter: brightness(1.1);
}

/* Circle Colors */
.doctors { background: linear-gradient(135deg, #ff416c, #ff4b2b); }
.technologists { background: linear-gradient(135deg, #36d1dc, #5b86e5); }
.technicians { background: linear-gradient(135deg, #fbc7aa, #f5af19); color: #333; text-shadow: none; }
.assistants { background: linear-gradient(135deg, #667eea, #764ba2); }
.rso { background: linear-gradient(135deg, #f7971e, #ffd200); text-shadow: 1px 1px 2px rgba(0,0,0,0.2); }

.section-title {
    font-size: 22px;
    margin-bottom: 5px;
    text-shadow: 1px 1px 3px rgba(0,0,0,0.3);
    pointer-events: none;
}
.employee-count {
    font-size: 32px;
    font-weight: 900;
    text-shadow: 1px 1px 5px rgba(0,0,0,0.5);
    pointer-events: none;
}

/* --- New Circular Warning Styles --- */

/* Danger Ring (Expired) */
.ring-danger {
    border-color: #ef4444; /* Red Border */
    animation: ripple-danger 2s linear infinite;
}

/* Warning Ring (Near Expiry) */
.ring-warning {
    border-color: #eab308; /* Yellow Border */
    animation: ripple-warning 2s linear infinite;
}

@keyframes ripple-danger {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4), 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0), 0 0 0 0 rgba(239, 68, 68, 0.4); }
  100% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0), 0 0 0 20px rgba(239, 68, 68, 0); }
}

@keyframes ripple-warning {
  0% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4), 0 0 0 0 rgba(234, 179, 8, 0.4); }
  50% { box-shadow: 0 0 0 10px rgba(234, 179, 8, 0), 0 0 0 0 rgba(234, 179, 8, 0.4); }
  100% { box-shadow: 0 0 0 10px rgba(234, 179, 8, 0), 0 0 0 20px rgba(234, 179, 8, 0); }
}

/* Badges Floating on the Edge */
.floating-badge {
    position: absolute;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 16px;
    font-weight: 900;
    border: 3px solid white;
    z-index: 10;
    box-shadow: 0 4px 6px rgba(0,0,0,0.2);
}

.badge-danger {
    background-color: #ef4444;
    color: white;
    top: -10px;
    right: -10px;
    animation: bounce-badge 2s infinite;
}

.badge-warning {
    background-color: #eab308;
    color: #333;
    top: -10px;
    left: -10px;
}

@keyframes bounce-badge {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
}


/* Secret Button */
#secretTrigger {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 30px;
    height: 30px;
    z-index: 9999;
    cursor: default; /* No pointer cursor to avoid detection */
    background: transparent;
}

/* Employee Card Styles (Inside Modal) */
.person {
    display: flex;
    align-items: flex-start;
    padding: 15px;
    border: 1px solid #eee;
    margin-bottom: 12px;
    border-radius: 12px;
    position: relative;
    gap: 15px;
    background-color: #ffffff;
    transition: all 0.2s ease;
}
.person:hover {
    background-color: #f8fbff;
    border-color: #bbdefb;
    box-shadow: 0 5px 15px rgba(0,0,0,0.05);
}
.person img {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    background-color: #eee;
    border: 2px solid #fff;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}
.person-info {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.person-info strong {
    font-size: 16px;
    color: #1565c0;
}
.metadata-container {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 4px;
}
.metadata-item {
    font-size: 12px;
    color: #546e7a;
    background: #f5f7f9;
    padding: 2px 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
}
.status-section {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    min-width: 180px;
}
.person-link {
    font-size: 11px;
    text-decoration: none;
    color: #1976d2;
    background: #e3f2fd;
    padding: 2px 8px;
    border-radius: 12px;
    transition: 0.2s;
    display: inline-block;
    margin-bottom: 2px;
}
.person-link:hover { background: #bbdefb; }

.valid-license { color: #2e7d32; font-weight: bold; font-size: 11px; background: #e8f5e9; padding: 2px 6px; rounded: 4px; }
.expired-license { color: #c62828; font-weight: bold; font-size: 11px; background: #ffebee; padding: 2px 6px; rounded: 4px; animation: pulse 2s infinite; }
.near-expiry-license { color: #f9a825; font-weight: bold; font-size: 11px; background: #fffde7; padding: 2px 6px; rounded: 4px; }
`;

const SupervisorEmployees: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
    const [loading, setLoading] = useState(false);
    
    // View Mode Toggle
    const [viewMode, setViewMode] = useState<'table' | 'visual'>('visual'); // Default to visual as per request preference

    // Visual Mode State
    const [selectedCategoryUsers, setSelectedCategoryUsers] = useState<User[]>([]);
    const [selectedCategoryTitle, setSelectedCategoryTitle] = useState('');
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [hiddenEmployeesVisible, setHiddenEmployeesVisible] = useState(false);

    const [offlineResult, setOfflineResult] = useState<any>(null);
    const [verificationCode, setVerificationCode] = useState('');

    // Document Upload State
    const [isUploading, setIsUploading] = useState(false);
    
    // Missing State Definitions
    const [showCorsHelp, setShowCorsHelp] = useState(false);

    // Missing Helper Function
    const downloadCorsConfig = () => {
        const corsConfig = [
            {
                "origin": ["*"],
                "method": ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
                "maxAgeSeconds": 3600
            }
        ];
        const blob = new Blob([JSON.stringify(corsConfig, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cors.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const verifyOfflineCode = () => {
        try {
            const decodedData = atob(verificationCode);
            const [lat, lng, timestamp, userId] = decodedData.split('|');
            const date = new Date(parseInt(timestamp) * 1000);
            
            setOfflineResult({
                lat,
                lng,
                time: date.toLocaleString(),
                userId,
                isValid: true
            });
        } catch (e) {
            alert("الكود غير صالح أو غير مكتمل");
            setOfflineResult(null);
        }
    };

    const [isAddFormOpen, setIsAddFormOpen] = useState(false);
    const [isOfflineVerifierOpen, setIsOfflineVerifierOpen] = useState(false);
    // Modal States
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editForm, setEditForm] = useState<Partial<User>>({});
    const [isAddingUser, setIsAddingUser] = useState(false);
    
    // Add User Form State
    const [newUserName, setNewUserName] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState('user');
    const [newUserPhone, setNewUserPhone] = useState('');
    const [newUserCategory, setNewUserCategory] = useState('technician');
    const [newUserGender, setNewUserGender] = useState<'male'|'female'>('male');
    const [newUserHireDate, setNewUserHireDate] = useState('');
    const [newUserHidden, setNewUserHidden] = useState(false);
    
    // Live Check Result State
    const [checkResult, setCheckResult] = useState<LocationCheckRequest | null>(null);
    const [showMapModal, setShowMapModal] = useState(false);

    const currentAdminName = localStorage.getItem('username') || 'Admin';
    const currentAdminId = auth.currentUser?.uid;

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'users'), (snap) => {
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
        });
        
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
                        
                        if (now - completedTime < 60000) {
                            setToast({ msg: `Check Completed for User!`, type: 'success' });
                            setCheckResult(data);
                            setShowMapModal(true);
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

    const handleAddUser = async () => {
        const email = newUserEmail.trim();
        const password = newUserPassword.trim();

        if (!email || !password) return setToast({ msg: 'Email & Password required', type: 'error' });
        
        setIsAddingUser(true);
        const appName = `SecondaryApp-${Date.now()}`;
        let secondaryApp: any;
        
        try {
            secondaryApp = initializeApp(firebaseConfig, appName);
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUserId = userCredential.user.uid;
            
            const defaultPermissions = ALL_PERMISSIONS.map(p => p.key);

            await setDoc(doc(db, 'users', newUserId), {
                uid: newUserId,
                email: email,
                name: newUserName.trim(),
                role: newUserRole,
                phone: newUserPhone.trim(),
                permissions: defaultPermissions,
                jobCategory: newUserCategory || 'technician',
                gender: newUserGender || 'male',
                hireDate: newUserHireDate || '',
                isHidden: newUserHidden || false,
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
            // sanitize fields to avoid undefined error
            await updateDoc(doc(db, 'users', editForm.id), {
                name: editForm.name || '',
                role: editForm.role || 'user',
                phone: editForm.phone || '', // FIXED: Ensure not undefined
                permissions: editForm.permissions || [],
                jobCategory: editForm.jobCategory || 'technician',
                licenseExpiry: editForm.licenseExpiry || null,
                registrationExpiry: editForm.registrationExpiry || null,
                nrrcExpiry: editForm.nrrcExpiry || null,
                nationality: editForm.nationality || '',
                gender: editForm.gender || 'male',
                hireDate: editForm.hireDate || '',
                isHidden: editForm.isHidden || false
            });
            setToast({ msg: 'User Updated', type: 'success' });
            setIsEditModalOpen(false);
        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Error updating: ' + e.message, type: 'error' });
        }
    };

    // --- Updated File Upload Logic using Supabase (Bypass Firebase CORS) ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: 'registration' | 'license' | 'general' = 'general') => {
        const file = e.target.files?.[0];
        if (!file || !editForm.id) return;

        if (file.type !== 'application/pdf') {
            setToast({ msg: 'يرجى رفع ملف PDF فقط', type: 'error' });
            return;
        }

        setIsUploading(true);
        try {
            // Upload to Supabase Storage instead of Firebase
            // Use the user's ID as a folder structure
            const folderPath = `user_documents/${editForm.id}`;
            const downloadUrl = await uploadFile(file, folderPath);

            if (!downloadUrl) {
                // If uploadFile returns null, it handled the error/alert already
                setIsUploading(false);
                return;
            }

            const newDoc: UserDocument = {
                name: file.name,
                url: downloadUrl,
                type: 'pdf',
                category: category,
                uploadedAt: new Date().toISOString()
            };

            // Save the link in Firebase Firestore
            await updateDoc(doc(db, 'users', editForm.id), {
                documents: arrayUnion(newDoc)
            });

            // Update local state
            setEditForm(prev => ({
                ...prev,
                documents: [...(prev.documents || []), newDoc]
            }));

            setToast({ msg: 'تم رفع الملف بنجاح', type: 'success' });
        } catch (error: any) {
            console.error("Upload error:", error);
            // Check for CORS or Network errors explicitly to show helper
            if (error.message && (error.message.includes('CORS') || error.message.includes('network') || error.code === 'storage/unknown')) {
               setShowCorsHelp(true);
            }
            setToast({ msg: 'فشل رفع الملف: ' + error.message, type: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteDocument = async (docItem: UserDocument) => {
        if (!editForm.id || !confirm('هل أنت متأكد من حذف هذا الملف؟')) return;
        try {
            // Remove the link from Firestore only. 
            await updateDoc(doc(db, 'users', editForm.id), {
                documents: arrayRemove(docItem)
            });

            setEditForm(prev => ({
                ...prev,
                documents: (prev.documents || []).filter(d => d.url !== docItem.url)
            }));
            
            setToast({ msg: 'تم حذف الملف', type: 'success' });
        } catch (error) {
            setToast({ msg: 'فشل الحذف', type: 'error' });
        }
    };

    const togglePermission = (key: string) => {
        const currentPerms = editForm.permissions || [];
        if (currentPerms.includes(key)) {
            setEditForm({ ...editForm, permissions: currentPerms.filter(p => p !== key) });
        } else {
            setEditForm({ ...editForm, permissions: [...currentPerms, key] });
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
        if (!confirm(`هل أنت متأكد من فك ارتباط الجهاز للموظف ${user.name}؟ سيتمكن من تسجيل الدخول من جهاز جديد.`)) return;
        try {
            await updateDoc(doc(db, 'users', user.id), { biometricId: null, biometricRegisteredAt: null });
            setToast({ msg: 'تم فك ارتباط الجهاز بنجاح', type: 'success' });
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleResetAllDevices = async () => {
        if (!confirm("⚠️ تحذير هام: هذا الإجراء سيقوم بفك ارتباط جميع الموظفين بأجهزتهم الحالية. سيحتاج الجميع لإعادة التسجيل عند الدخول القادم. هل أنت متأكد؟")) return;
        
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, 'users'));
            const docs = snap.docs;
            const batchSize = 450;
            let count = 0;

            for (let i = 0; i < docs.length; i += batchSize) {
                const chunk = docs.slice(i, i + batchSize);
                const batch = writeBatch(db);
                
                chunk.forEach(doc => {
                    batch.update(doc.ref, { 
                        biometricId: null, 
                        biometricRegisteredAt: null 
                    });
                    count++;
                });
                
                await batch.commit();
            }
            
            if (count > 0) {
                setToast({ msg: `تم تصفير الأجهزة لـ ${count} موظف بنجاح`, type: 'success' });
            } else {
                setToast({ msg: 'لا يوجد موظفين لتحديثهم', type: 'info' });
            }
        } catch(e: any) {
            console.error(e);
            setToast({ msg: 'حدث خطأ: ' + e.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleUnlockAttendance = async (user: User) => {
        try {
            // Set validity to only 45 seconds from NOW (30 seconds for user + buffer)
            const validityDuration = 45 * 1000; 
            const expiryDate = new Date(Date.now() + validityDuration);

            await addDoc(collection(db, 'attendance_overrides'), {
                userId: user.id,
                userName: user.name,
                grantedBy: currentAdminName,
                grantedAt: serverTimestamp(), // Use server timestamp for creation
                validUntil: Timestamp.fromDate(expiryDate), 
                type: 'single_use' // Mark as single use
            });
            setToast({ msg: '🔓 Access Granted: 30 Seconds Window (One-Time)', type: 'success' });
        } catch(e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleSendLiveCheck = async (user: User) => {
        try {
            await addDoc(collection(db, 'location_checks'), {
                targetUserId: user.id,
                supervisorId: currentAdminId,
                status: 'pending',
                createdAt: serverTimestamp(),
                requestedAtStr: new Date().toISOString() 
            });
            
            setToast({ msg: 'تم إرسال الطلب بنجاح', type: 'success' });
        } catch (e) {
            setToast({ msg: 'فشل في الإرسال', type: 'error' });
        }
    };

    const handleDiagnoseUser = async (user: User) => {
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
          
          let msg = `🔍 Report for: ${user.name}\n🆔 UID: ${user.id}\n📱 Biometric Linked: ${user.biometricId ? 'YES ✅' : 'NO ❌'}\n----------------\n`;
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

    const filteredUsers = users.filter(u => {
        if (u.isHidden && !hiddenEmployeesVisible) return false;
        return (
            u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            u.email.toLowerCase().includes(searchQuery.toLowerCase())
        );
    });

    const openEditModal = (user: User) => {
        const perms = user.permissions && user.permissions.length > 0 
            ? user.permissions 
            : ALL_PERMISSIONS.map(p => p.key);
            
        setEditForm({ ...user, permissions: perms, jobCategory: user.jobCategory || 'technician', gender: user.gender || 'male', hireDate: user.hireDate || '', isHidden: user.isHidden || false });
        setIsEditModalOpen(true);
    };

    // --- VISUAL VIEW HELPER FUNCTIONS ---
    const getWarningCounts = (categoryUsers: User[], categoryId: string) => {
        const today = new Date();
        today.setHours(0,0,0,0);
        const THRESHOLD = 30; // days
        let counts = { expired: 0, nearExpiry: 0 };

        categoryUsers.forEach(u => {
            const expiryKeys = ['licenseExpiry', 'registrationExpiry'];
            if(categoryId === 'rso') expiryKeys.push('nrrcExpiry'); // RSO specific

            expiryKeys.forEach(key => {
                const dateStr = (u as any)[key];
                if (dateStr) {
                    const expDate = new Date(dateStr);
                    const diff = (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                    if (diff < 0) counts.expired++;
                    else if (diff <= THRESHOLD) counts.nearExpiry++;
                }
            });
        });
        return counts;
    };

    const openCategoryList = (catId: string) => {
        const filtered = users.filter(u => {
             // Check for hidden state
             if (u.isHidden && !hiddenEmployeesVisible) return false;
             return (u.jobCategory || 'technician') === catId;
        });
        const categoryData = JOB_CATEGORIES.find(c => c.id === catId);
        
        setSelectedCategoryUsers(filtered);
        setSelectedCategoryTitle(categoryData?.title || '');
        // We use the CSS class name instead of gradient
        setIsCategoryModalOpen(true);
    };

    const getExpiryStatusBadge = (user: User, key: string, label: string) => {
        const dateStr = (user as any)[key];
        if (!dateStr) return (
             <span className="text-[10px] text-slate-300 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-100 flex items-center gap-1 opacity-60">
                 <i className="fas fa-minus-circle"></i> {label} N/A
             </span>
        );
        
        const today = new Date(); today.setHours(0,0,0,0);
        const expDate = new Date(dateStr);
        const diff = (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        
        if (diff < 0) return (
            <span className="text-[10px] text-white font-bold bg-red-500 px-2 py-0.5 rounded shadow-sm animate-pulse flex items-center gap-1">
                <i className="fas fa-exclamation-triangle"></i> {label} Exp.
            </span>
        );
        
        if (diff <= 30) return (
            <span className="text-[10px] text-yellow-800 font-bold bg-yellow-300 px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                <i className="fas fa-clock"></i> {label} {diff.toFixed(0)}d
            </span>
        );

        return (
            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                <i className="fas fa-check-circle"></i> {label} OK
            </span>
        );
    };
    
    // Toggle hidden employees visibility
    const toggleHiddenEmployees = () => {
        if (!hiddenEmployeesVisible && !confirm('Show hidden profiles?')) return;
        setHiddenEmployeesVisible(!hiddenEmployeesVisible);
    };

    const getAvatar = (user: User) => {
        if (user.gender === 'female') return 'https://cdn-icons-png.flaticon.com/512/4140/4140047.png';
        return 'https://cdn-icons-png.flaticon.com/512/4140/4140048.png';
    }
    
    const getDocumentLink = (user: User, cat: string, label: string) => {
        const docItem = user.documents?.find(d => d.category === cat);
        if (docItem && docItem.url) {
            return (
                <a 
                    href={docItem.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 px-2 py-1 rounded transition-colors text-[10px] font-bold"
                    title={`View ${label}`}
                >
                    <i className="fas fa-file-pdf"></i> {label}
                </a>
            );
        }
        return (
            <span className="flex items-center gap-1 bg-slate-50 text-slate-300 border border-slate-100 px-2 py-1 rounded text-[10px] cursor-not-allowed opacity-60">
                 <i className="fas fa-file-excel"></i> {label}
            </span>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            <style>{styles}</style>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            {loading && <div className="fixed inset-0 bg-white/50 z-50 flex items-center justify-center"><div className="w-10 h-10 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div></div>}
            
            {/* Secret Button for Hidden Employees (Invisible Trigger in Bottom Left) */}
            <div id="secretTrigger" onClick={toggleHiddenEmployees}></div>

            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/supervisor')} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors">
                        <i className="fas fa-arrow-left rtl:rotate-180"></i>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800">{t('sup.tab.users')}</h1>
                        <p className="text-xs text-slate-500 font-bold">Staff Records & Compliance</p>
                    </div>
                </div>
                
                <div className="flex gap-3">
                    <div className="bg-slate-100 p-1 rounded-xl flex">
                        <button 
                            onClick={() => setViewMode('table')} 
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'table' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                        >
                            <i className="fas fa-table mr-2"></i> Table View
                        </button>
                        <button 
                            onClick={() => setViewMode('visual')} 
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'visual' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}
                        >
                            <i className="fas fa-project-diagram mr-2"></i> Visual View
                        </button>
                    </div>
                    <button 
                        onClick={handleResetAllDevices}
                        className="bg-red-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:bg-red-700 transition-all text-xs flex items-center gap-2"
                    >
                        <i className="fas fa-biohazard"></i> Reset Devices
                    </button>
                </div>
            </div>

            {/* --- TABLE VIEW --- */}
            {viewMode === 'table' && (
                <div className="grid lg:grid-cols-3 gap-8 items-start">
                    
                    <div className="lg:col-span-1 space-y-4 sticky top-4">
                        {/* Add User Accordion */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                            <button 
                                onClick={() => setIsAddFormOpen(!isAddFormOpen)}
                                className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-3 font-bold text-slate-800">
                                    <i className="fas fa-user-plus text-blue-500"></i>
                                    {t('sup.user.add')}
                                </div>
                                <i className={`fas fa-chevron-${isAddFormOpen ? 'up' : 'down'} text-slate-400 text-xs`}></i>
                            </button>
                            {isAddFormOpen && (
                                <div className="p-5 border-t border-slate-50 space-y-3 animate-in fade-in duration-300">
                                    <input className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm" placeholder={t('sup.user.name')} value={newUserName} onChange={e => setNewUserName(e.target.value)} />
                                    <input className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm" placeholder="Email" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
                                    <input className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm" placeholder="Password" type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} />
                                    <input className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm" placeholder="Phone" value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} />
                                    
                                    <div className="grid grid-cols-2 gap-2">
                                         <select className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold" value={newUserGender} onChange={e => setNewUserGender(e.target.value as 'male'|'female')}>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                        </select>
                                        <input type="date" className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm" value={newUserHireDate} onChange={e => setNewUserHireDate(e.target.value)} placeholder="Hire Date" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <select className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold" value={newUserRole} onChange={e => setNewUserRole(e.target.value)}>
                                            <option value="user">User</option>
                                            <option value="doctor">Doctor</option>
                                            <option value="supervisor">Supervisor</option>
                                        </select>
                                        <select className="w-full bg-slate-50 border-none rounded-xl p-3 text-sm font-bold" value={newUserCategory} onChange={e => setNewUserCategory(e.target.value)}>
                                            {JOB_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                        </select>
                                    </div>
                                    
                                    <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                                        <input type="checkbox" checked={newUserHidden} onChange={e => setNewUserHidden(e.target.checked)} />
                                        <span className="text-xs text-slate-500 font-bold">Hide from lists (Secret)</span>
                                    </label>

                                    <button 
                                        onClick={handleAddUser} 
                                        disabled={isAddingUser}
                                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-md disabled:opacity-50"
                                    >
                                        {isAddingUser ? <i className="fas fa-spinner fa-spin"></i> : t('add')}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Offline Verification */}
                        <div className="bg-slate-900 rounded-3xl shadow-lg border border-slate-800 overflow-hidden">
                            <button 
                                onClick={() => setIsOfflineVerifierOpen(!isOfflineVerifierOpen)}
                                className="w-full flex items-center justify-between p-5 hover:bg-slate-800 transition-colors"
                            >
                                <div className="flex items-center gap-3 font-bold text-white">
                                    <i className="fas fa-shield-alt text-cyan-400"></i>
                                    إثبات الموقع (أوفلاين)
                                </div>
                                <i className={`fas fa-chevron-${isOfflineVerifierOpen ? 'up' : 'down'} text-slate-500 text-xs`}></i>
                            </button>
                            {isOfflineVerifierOpen && (
                                <div className="p-5 border-t border-white/5 space-y-4 animate-in fade-in duration-300">
                                    <input 
                                        type="text"
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value)}
                                        placeholder="أدخل الكود المستلم..."
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs focus:ring-1 ring-cyan-500 outline-none"
                                    />
                                    <button 
                                        onClick={verifyOfflineCode}
                                        className="w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-500 transition-all active:scale-95 text-sm"
                                    >
                                        تحقق من الكود
                                    </button>

                                    {offlineResult && (
                                        <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl space-y-2">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-cyan-400">وقت التوليد:</span>
                                                <span className="text-white">{offlineResult.time}</span>
                                            </div>
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-cyan-400">المعرف:</span>
                                                <span className="text-white font-mono">{offlineResult.userId.substring(0,8)}...</span>
                                            </div>
                                            <a 
                                                href={`https://www.google.com/maps?q=${offlineResult.lat},${offlineResult.lng}`}
                                                target="_blank" rel="noreferrer"
                                                className="block text-center bg-white/5 hover:bg-white/10 text-white text-[10px] py-2 rounded-lg transition-colors"
                                            >
                                                <i className="fas fa-map-marker-alt text-cyan-400 mr-1"></i> فتح الموقع على الخريطة
                                            </a>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

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
                                            <th className="p-5">Category</th>
                                            <th className="p-5">Device</th>
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
                                                        <h4 className="font-bold text-slate-800">{user.name} {user.isHidden && <i className="fas fa-eye-slash text-xs text-red-300 ml-1"></i>}</h4>
                                                        <p className="text-sm text-slate-400">{user.email}</p>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">{user.role}</span>
                                                </td>
                                                <td className="p-4">
                                                    <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 uppercase border border-blue-100">
                                                        {JOB_CATEGORIES.find(c => c.id === user.jobCategory)?.title || user.jobCategory || 'Technician'}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    {user.biometricId ? (
                                                        <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 w-fit">
                                                            <i className="fas fa-link text-xs"></i> 
                                                            <span className="text-[10px] font-bold">LINKED</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 text-xs italic">No Device</span>
                                                    )}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleSendLiveCheck(user)} className="text-red-600 hover:bg-red-50 p-1 rounded animate-pulse" title="Live Check"><i className="fas fa-map-marker-alt"></i></button>
                                                        {user.biometricId && <button onClick={() => handleResetBiometric(user)} className="text-orange-500 hover:bg-orange-50 p-1 rounded" title="فك ارتباط الجهاز (Reset Device)"><i className="fas fa-unlock-alt"></i></button>}
                                                        <button onClick={() => handleUnlockAttendance(user)} className="text-purple-500 hover:bg-purple-50 p-1 rounded" title="Unlock Att (30s)"><i className="fas fa-history"></i></button>
                                                        <button onClick={() => handleDiagnoseUser(user)} className="text-indigo-500 hover:bg-indigo-50 p-1 rounded" title="Diagnose"><i className="fas fa-stethoscope"></i></button>
                                                        <button onClick={() => openEditModal(user)} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><i className="fas fa-pen"></i></button>
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
                </div>
            )}

            {/* --- VISUAL VIEW (SECRET CIRCLES) --- */}
            {viewMode === 'visual' && (
                <div className="flex flex-wrap gap-8 justify-center pb-20 pt-10">
                    {/* Hide categories marked as isHidden: true from visual circles */}
                    {JOB_CATEGORIES.filter(c => !(c as any).isHidden).map(cat => {
                        const catUsers = users.filter(u => {
                             // Check for hidden state
                             const isHidden = (u as any).isHidden;
                             if (isHidden && !hiddenEmployeesVisible) return false;
                             return (u.jobCategory || 'technician') === cat.id;
                        });
                        const warningCounts = getWarningCounts(catUsers, cat.id);
                        const hasDanger = warningCounts.expired > 0;
                        const hasWarning = warningCounts.nearExpiry > 0;
                        
                        let ringClass = '';
                        if (hasDanger) ringClass = 'ring-danger';
                        else if (hasWarning) ringClass = 'ring-warning';

                        return (
                            <div 
                                key={cat.id} 
                                onClick={() => openCategoryList(cat.id)}
                                className={`section-circle ${cat.cssClass} ${ringClass}`}
                            >
                                <div className="section-title">{cat.title}</div>
                                <div className="employee-count">{catUsers.length}</div>
                                
                                {/* Floating Badges instead of Ropes */}
                                {hasDanger && (
                                    <div className="floating-badge badge-danger">
                                        {warningCounts.expired}
                                    </div>
                                )}
                                
                                {(hasWarning && !hasDanger) && (
                                    <div className="floating-badge badge-warning">
                                        {warningCounts.nearExpiry}
                                    </div>
                                )}
                                
                                {/* If both exist, show warning count on left (danger on right via hasDanger above) */}
                                {hasDanger && hasWarning && (
                                    <div className="floating-badge badge-warning">
                                        {warningCounts.nearExpiry}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Edit Modal (Enhanced) */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit User & Compliance">
                <div className="space-y-4 max-h-[80vh] overflow-y-auto p-1">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">Name</label>
                            <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">Role (Permission)</label>
                            <select className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" value={editForm.role || 'user'} onChange={e => setEditForm({...editForm, role: e.target.value})}>
                                <option value="user">User</option>
                                <option value="doctor">Doctor</option>
                                <option value="supervisor">Supervisor</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">Gender</label>
                            <select 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                                value={editForm.gender || 'male'} 
                                onChange={e => setEditForm({...editForm, gender: e.target.value as 'male'|'female'})}
                            >
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">Hire Date</label>
                            <input 
                                type="date" 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                                value={editForm.hireDate || ''} 
                                onChange={e => setEditForm({...editForm, hireDate: e.target.value})} 
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Job Category (For Visuals)</label>
                        <select 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                            value={editForm.jobCategory || 'technician'} 
                            onChange={e => setEditForm({...editForm, jobCategory: e.target.value as any})}
                        >
                            {JOB_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                    </div>

                    {/* PDF UPLOAD SECTION */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-blue-800 text-sm flex items-center gap-2"><i className="fas fa-file-pdf"></i> Documents (PDF)</h4>
                            <div className="flex gap-2">
                                <label className="cursor-pointer bg-white text-blue-600 px-3 py-1 rounded-lg text-[10px] font-bold border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1">
                                    <i className="fas fa-certificate"></i> + Reg. Certificate
                                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'registration')} disabled={isUploading} />
                                </label>
                                <label className="cursor-pointer bg-white text-emerald-600 px-3 py-1 rounded-lg text-[10px] font-bold border border-emerald-200 hover:bg-emerald-50 transition-colors flex items-center gap-1">
                                    <i className="fas fa-id-card"></i> + License
                                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'license')} disabled={isUploading} />
                                </label>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            {editForm.documents?.map((doc, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-white p-2 rounded-lg border border-blue-200 text-xs">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${doc.category === 'registration' ? 'bg-blue-100 text-blue-700' : doc.category === 'license' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {doc.category || 'General'}
                                        </span>
                                        <a href={doc.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 font-bold truncate max-w-[150px]">
                                            <i className="fas fa-file-alt"></i> {doc.name}
                                        </a>
                                    </div>
                                    <button onClick={() => handleDeleteDocument(doc)} className="text-red-400 hover:text-red-600 px-2">
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            ))}
                            {(!editForm.documents || editForm.documents.length === 0) && (
                                <p className="text-xs text-slate-400 italic text-center">No documents uploaded.</p>
                            )}
                        </div>
                        
                        {isUploading && <p className="text-center text-xs text-blue-500 animate-pulse font-bold">Uploading...</p>}
                    </div>

                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 space-y-3">
                        <h4 className="font-bold text-amber-800 text-sm flex items-center gap-2"><i className="fas fa-file-contract"></i> Compliance Dates</h4>
                        
                        <div>
                            <label className="text-[10px] font-bold text-amber-700 block mb-1">Professional License Expiry (Registration)</label>
                            <input type="date" className="w-full bg-white border border-amber-200 rounded-lg p-2 text-sm" value={editForm.licenseExpiry || ''} onChange={e => setEditForm({...editForm, licenseExpiry: e.target.value})} />
                        </div>
                        
                        <div>
                            <label className="text-[10px] font-bold text-amber-700 block mb-1">Hospital Registration Expiry</label>
                            <input type="date" className="w-full bg-white border border-amber-200 rounded-lg p-2 text-sm" value={editForm.registrationExpiry || ''} onChange={e => setEditForm({...editForm, registrationExpiry: e.target.value})} />
                        </div>

                        {editForm.jobCategory === 'rso' && (
                            <div>
                                <label className="text-[10px] font-bold text-purple-700 block mb-1">NRRC Certificate Expiry</label>
                                <input type="date" className="w-full bg-white border border-purple-200 rounded-lg p-2 text-sm" value={editForm.nrrcExpiry || ''} onChange={e => setEditForm({...editForm, nrrcExpiry: e.target.value})} />
                            </div>
                        )}
                    </div>

                    <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg cursor-pointer">
                        <input type="checkbox" checked={editForm.isHidden || false} onChange={e => setEditForm({...editForm, isHidden: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                        <span className="text-xs text-slate-500 font-bold">Hide from lists (Secret Mode)</span>
                    </label>

                    <div className="border-t border-slate-100 pt-4">
                        <label className="text-xs font-bold text-slate-500 block mb-3">Permissions</label>
                        <div className="grid grid-cols-2 gap-2">
                            {ALL_PERMISSIONS.map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => togglePermission(p.key)}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold text-left flex items-center justify-between border transition-all ${
                                        editForm.permissions?.includes(p.key) 
                                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    <span>{p.label}</span>
                                    {editForm.permissions?.includes(p.key) && <i className="fas fa-check"></i>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleUpdateUser} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg">Save Changes</button>
                </div>
            </Modal>

            {/* Category List Modal (New Card Layout) */}
            <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title={`${selectedCategoryTitle} List`}>
                <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-1 pb-2 custom-scrollbar">
                    {selectedCategoryUsers.length === 0 ? (
                        <div className="col-span-1 text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
                            <i className="fas fa-user-slash text-4xl mb-3 opacity-50"></i>
                            <p>No employees in this category.</p>
                        </div>
                    ) : (
                        selectedCategoryUsers.map(user => (
                            <div key={user.id} className="group relative bg-white rounded-2xl p-5 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 overflow-hidden">
                                
                                <div className={`absolute top-0 left-0 w-1 h-full ${
                                    user.jobCategory === 'doctor' ? 'bg-rose-500' : 
                                    user.jobCategory === 'rso' ? 'bg-amber-500' : 'bg-blue-500'
                                }`}></div>

                                {/* Header */}
                                <div className="flex gap-4 items-start mb-4">
                                    <div className="relative">
                                        <img 
                                            src={getAvatar(user)} 
                                            alt={user.name} 
                                            className="w-14 h-14 rounded-full border-2 border-white shadow-md bg-slate-50 object-cover" 
                                        />
                                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white shadow-sm border-2 border-white ${
                                            user.jobCategory === 'doctor' ? 'bg-rose-500' : 'bg-blue-500'
                                        }`}>
                                            <i className={`fas ${JOB_CATEGORIES.find(c => c.id === user.jobCategory)?.icon || 'fa-user'}`}></i>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-slate-800 text-base">{user.name}</h3>
                                        <p className="text-xs text-slate-400 font-mono mb-1">{user.email}</p>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded uppercase border border-slate-200">
                                                {user.role}
                                            </span>
                                            {user.phone && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-50 text-slate-500 rounded border border-slate-100 flex items-center gap-1">
                                                    <i className="fas fa-phone"></i> {user.phone}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => { setIsCategoryModalOpen(false); openEditModal(user); }}
                                        className="text-slate-300 hover:text-blue-500 p-2 transition-colors"
                                    >
                                        <i className="fas fa-pen"></i>
                                    </button>
                                </div>

                                {/* Hire Date */}
                                {user.hireDate && (
                                    <div className="flex items-center gap-2 mb-3 text-xs text-slate-500 bg-slate-50/50 p-2 rounded-lg border border-slate-50">
                                        <i className="fas fa-calendar-alt text-blue-400"></i>
                                        <span className="font-bold">Joined:</span> {user.hireDate}
                                    </div>
                                )}

                                {/* Dates & Status (Badges) */}
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    {getExpiryStatusBadge(user, 'licenseExpiry', 'License')}
                                    {getExpiryStatusBadge(user, 'registrationExpiry', 'Reg.')}
                                    {user.jobCategory === 'rso' && getExpiryStatusBadge(user, 'nrrcExpiry', 'NRRC')}
                                </div>

                                {/* Document Links (The requested feature) */}
                                <div className="pt-3 border-t border-slate-50">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Certificates</p>
                                        <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold">
                                            {user.documents?.length || 0} Files
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {getDocumentLink(user, 'license', 'License')}
                                        {getDocumentLink(user, 'registration', 'Registration')}
                                        {user.jobCategory === 'rso' && getDocumentLink(user, 'nrrc', 'NRRC')}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
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
                    </div>
                )}
            </Modal>
            
            {/* CORS Help Modal */}
            <Modal isOpen={showCorsHelp} onClose={() => setShowCorsHelp(false)} title="إعدادات الخادم مطلوبة (CORS)">
                <div className="space-y-4">
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-amber-900 text-sm">
                        <p className="font-bold flex items-center gap-2"><i className="fas fa-exclamation-triangle"></i> مشكلة في رفع الملفات</p>
                        <p className="mt-2">يرفض خادم التخزين (Firebase Storage) استقبال الملفات من هذا الموقع لأنه يفتقد إعدادات الأمان (CORS).</p>
                    </div>
                    
                    <div className="space-y-3">
                        <p className="text-sm font-bold text-slate-700">لحل المشكلة نهائياً، يرجى اتباع الخطوات التالية:</p>
                        
                        <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                            <span className="text-xs font-bold text-slate-500 uppercase block mb-1">الخطوة 1: تحميل ملف الإعدادات</span>
                            <button onClick={downloadCorsConfig} className="bg-white border border-slate-300 px-3 py-1.5 rounded text-xs font-bold hover:bg-slate-50">
                                <i className="fas fa-download"></i> تحميل cors.json
                            </button>
                        </div>

                        <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                            <span className="text-xs font-bold text-slate-500 uppercase block mb-1">الخطوة 2: فتح Google Cloud Console</span>
                            <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs font-bold">
                                اضغط هنا لفتح لوحة التحكم <i className="fas fa-external-link-alt"></i>
                            </a>
                        </div>

                        <div className="bg-slate-900 text-green-400 p-4 rounded-xl font-mono text-[10px] overflow-x-auto">
                            <p className="text-slate-400 mb-2"># الخطوة 3: افتح Cloud Shell (أيقونة _) وارفع ملف cors.json ثم اكتب:</p>
                            gsutil cors set cors.json gs://radiology-schedule-1ffba.firebasestorage.app
                        </div>
                        
                        <p className="text-xs text-slate-400 mt-2">تنويه: هذا الإعداد يتم مرة واحدة فقط للمشروع.</p>
                    </div>

                    <button onClick={() => setShowCorsHelp(false)} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold">
                        حسناً، فهمت
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default SupervisorEmployees;
