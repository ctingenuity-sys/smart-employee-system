
import React, { useState, useEffect, useRef } from 'react';
import { auth, db as mainDb, firebaseConfig as mainConfig } from '../../firebase';
import { db as certDb } from '../../firebaseData';
// @ts-ignore
import { collection, updateDoc, deleteDoc, setDoc, doc, Timestamp, query, where, getDocs, writeBatch, limit, orderBy, addDoc, serverTimestamp, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';
// @ts-ignore
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
// @ts-ignore
import { initializeApp, deleteApp } from 'firebase/app';
import { User, LocationCheckRequest, UserDocument } from '../../types';
import Modal from '../../components/Modal';
import Toast from '../../components/Toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useDepartment } from '../../contexts/DepartmentContext';
import { UserRole } from '../../types';
// @ts-ignore
import { useNavigate, useLocation } from 'react-router-dom';
// Import the new storage service
import { uploadFile } from '../../services/storageClient';
import DocumentScanner from '../../components/DocumentScanner';

// Declare Html5QrcodeScanner from global scope (CDN)
declare const Html5QrcodeScanner: any;

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
    { key: 'sup_schedule_builder', label: 'بناء الجدول (Schedule Builder)' },
    { key: 'sup_rotation', label: 'التدوير (Rotation)' },
    { key: 'sup_reports', label: 'التقارير (Reports)' },
    { key: 'sup_attendance', label: 'الحضور (Attendance)' },
    { key: 'sup_employees', label: 'الموظفين (Employees)' },
    { key: 'sup_swaps', label: 'التبديلات (Swaps)' },
    { key: 'sup_leaves', label: 'الإجازات (Leaves)' },
    { key: 'sup_market', label: 'سوق المشرف (Sup Market)' },
    { key: 'sup_locations', label: 'المواقع (Locations)' },
    { key: 'sup_history', label: 'سجل المشرف (Sup History)' },
    { key: 'sup_performance', label: 'أداء المشرف (Sup Performance)' },
    { key: 'sup_panic', label: 'تقارير الطوارئ (Panic Reports)' },
    { key: 'sup_archive', label: 'الأرشيف (Archive)' },
    { key: 'sup_devices', label: 'الأجهزة (Devices)' },
    { key: 'sup_fms', label: 'FMS' },
    { key: 'sup_rooms', label: 'الغرف (Rooms)' },
    { key: 'sup_logbooks', label: 'السجلات (Logbooks)' },
    { key: 'sup_penalties', label: 'الجزاءات (Penalties)' },
];

// Mapped to match the specific CSS classes requested
const JOB_CATEGORIES = [
    { id: 'doctor', title: 'Doctors', cssClass: 'doctors', icon: 'fa-user-md', cardTheme: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white border-rose-400' },
    { id: 'technologist', title: 'Specialists', cssClass: 'technologists', icon: 'fa-user-graduate', cardTheme: 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white border-cyan-400' },
    { id: 'usg', title: 'Ultrasound', cssClass: 'technologists', icon: 'fa-wave-square', isHidden: true, cardTheme: 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white border-indigo-400' }, 
    { id: 'technician', title: 'Technicians', cssClass: 'technicians', icon: 'fa-cogs', cardTheme: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white border-amber-400' },
    { id: 'nurse', title: 'Nurses', cssClass: 'assistants', icon: 'fa-user-nurse', cardTheme: 'bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white border-purple-400' },
    { id: 'rso', title: 'R S O', cssClass: 'rso', icon: 'fa-radiation', cardTheme: 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white border-yellow-400' },
];

const styles = `
/* --------------------------------------------------------------------------------
   Updated Styles for "Dazzling" UI
-------------------------------------------------------------------------------- */
.section-circle {
    width: 260px; /* Increased Size */
    height: 260px; /* Increased Size */
    border-radius: 50%;
    color: white;
    font-size: 24px;
    font-weight: 800;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25), inset 0 0 20px rgba(255,255,255,0.2);
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    text-align: center;
    padding: 20px;
    line-height: 1.2;
    flex-direction: column;
    user-select: none;
    position: relative;
    margin: 20px; 
    border: 6px solid rgba(255,255,255,0.3);
    backdrop-filter: blur(5px);
}
.section-circle:hover {
    transform: translateY(-15px) scale(1.05);
    filter: brightness(1.1);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.3), inset 0 0 30px rgba(255,255,255,0.4);
    z-index: 10;
}

/* Circle Colors */
.doctors { background: linear-gradient(135deg, #ff416c, #ff4b2b); }
.technologists { background: linear-gradient(135deg, #36d1dc, #5b86e5); }
.technicians { background: linear-gradient(135deg, #fbc7aa, #f5af19); color: #333; text-shadow: none; }
.assistants { background: linear-gradient(135deg, #667eea, #764ba2); }
.rso { background: linear-gradient(135deg, #f7971e, #ffd200); text-shadow: 1px 1px 2px rgba(0,0,0,0.2); }

.section-title {
    font-size: 26px;
    margin-bottom: 5px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    pointer-events: none;
    letter-spacing: -0.5px;
}
.employee-count {
    font-size: 42px;
    font-weight: 900;
    text-shadow: 2px 2px 10px rgba(0,0,0,0.3);
    pointer-events: none;
}

/* --- New Circular Warning Styles --- */
.ring-danger {
    border-color: #ef4444; 
    animation: ripple-danger 2s linear infinite;
}
.ring-warning {
    border-color: #eab308; 
    animation: ripple-warning 2s linear infinite;
}
@keyframes ripple-danger {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4), 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0), 0 0 0 0 rgba(239, 68, 68, 0.4); }
  100% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0), 0 0 0 30px rgba(239, 68, 68, 0); }
}
@keyframes ripple-warning {
  0% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4), 0 0 0 0 rgba(234, 179, 8, 0.4); }
  50% { box-shadow: 0 0 0 15px rgba(234, 179, 8, 0), 0 0 0 0 rgba(234, 179, 8, 0.4); }
  100% { box-shadow: 0 0 0 15px rgba(234, 179, 8, 0), 0 0 0 30px rgba(234, 179, 8, 0); }
}

/* Badges */
.floating-badge {
    position: absolute;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 18px;
    font-weight: 900;
    border: 4px solid white;
    z-index: 20;
    box-shadow: 0 6px 12px rgba(0,0,0,0.3);
}
.badge-danger { background-color: #ef4444; color: white; top: -10px; right: -10px; animation: bounce-badge 2s infinite; }
.badge-warning { background-color: #eab308; color: #333; top: -10px; left: -10px; }

@keyframes bounce-badge {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
}

/* Document Buttons - Dazzling Style */
.dazzle-btn {
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    border: none;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
}
.dazzle-btn:hover {
    transform: translateY(-2px) scale(1.05);
    box-shadow: 0 8px 25px rgba(0,0,0,0.2);
}
.dazzle-btn::after {
    content: '';
    position: absolute;
    top: 0; left: -100%;
    width: 100%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
    transition: 0.5s;
}
.dazzle-btn:hover::after {
    left: 100%;
}

/* Card Effects */
.glass-card-effect {
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
}

/* New Input Styles */
.input-group-modern {
    position: relative;
    transition: all 0.3s ease;
}
.input-group-modern:focus-within {
    transform: translateY(-2px);
}
.input-modern {
    width: 100%;
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    padding: 12px 12px 12px 45px;
    font-size: 14px;
    font-weight: 600;
    color: #334155;
    transition: all 0.3s ease;
    outline: none;
}
.input-modern:focus {
    background: #fff;
    border-color: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}
.input-icon {
    position: absolute;
    left: 15px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 16px;
    transition: all 0.3s ease;
}
.input-group-modern:focus-within .input-icon {
    color: #3b82f6;
}
`;

const SupervisorEmployees: React.FC = () => {
    const { t, dir } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const { role: authRole, user: currentUser } = useAuth();
    const { departments, selectedDepartmentId } = useDepartment();
    
    console.log('AuthRole:', authRole, 'UserRole.ADMIN:', UserRole.ADMIN);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>(location.state?.departmentId || 'all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'role' | 'category'>('name');
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
    const [loading, setLoading] = useState(false);
    
    // View Mode Toggle
    const [viewMode, setViewMode] = useState<'table' | 'visual'>('visual'); 

    // Visual Mode State
    const [selectedCategoryUsers, setSelectedCategoryUsers] = useState<User[]>([]);
    const [selectedCategoryTitle, setSelectedCategoryTitle] = useState('');
    const [selectedCategoryTheme, setSelectedCategoryTheme] = useState(''); // New for modal theme
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [hiddenEmployeesVisible, setHiddenEmployeesVisible] = useState(false);

    const [offlineResult, setOfflineResult] = useState<any>(null);
    const [verificationCode, setVerificationCode] = useState('');

    // Document Upload State
    const [isUploading, setIsUploading] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [scannerCategory, setScannerCategory] = useState<'registration' | 'license' | 'general'>('general');
    
    // Link/Scan Modal State
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [linkData, setLinkData] = useState({ name: '', url: '', category: 'registration' as 'registration' | 'license' | 'general', expiryDate: '' });
    const [isScanning, setIsScanning] = useState(false);
    const scannerRef = useRef<any>(null);
    
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
    const [newUserDepartment, setNewUserDepartment] = useState('');
    const [newUserSupervisor, setNewUserSupervisor] = useState('');
    const [newUserManager, setNewUserManager] = useState('');
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

    const [mainUsers, setMainUsers] = useState<User[]>([]);
    const [certData, setCertData] = useState<Record<string, any>>({});

    // Fetch Main Users (Real-time)
    useEffect(() => {
        setLoading(true);
        const unsubscribe = onSnapshot(
            collection(mainDb, 'users'), 
            (snapshot) => {
                const usersList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as User));
                setMainUsers(usersList);
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching main users:", error);
                setToast({ msg: "Connection Issue: Running in offline mode", type: 'info' });
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, []);

    // Fetch Cert Records (Real-time)
    useEffect(() => {
        const unsubscribe = onSnapshot(
            collection(certDb, 'employee_records'), 
            (snapshot) => {
                const data: Record<string, any> = {};
                snapshot.forEach(d => { data[d.id] = d.data(); });
                setCertData(data);
            },
            (error) => {
                console.error("Error fetching cert records:", error);
                // Do not block UI if cert DB fails
            }
        );
        return () => unsubscribe();
    }, []);

    // Merge Data
    useEffect(() => {
        if (mainUsers.length > 0) {
            const merged = mainUsers.map(u => ({ 
                ...u, 
                ...(certData[u.id] || {}) 
            }));
            setUsers(merged);
        }
    }, [mainUsers, certData]);
        
    useEffect(() => {
        if (currentAdminId) {
            const qChecks = query(
                collection(mainDb, 'location_checks'), 
                where('supervisorId', '==', currentAdminId),
                where('status', '==', 'completed')
            );
            
            const unsubscribe = onSnapshot(qChecks, (snapshot) => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data() as LocationCheckRequest;
                        const completedTime = data.completedAt?.toDate().getTime();
                        const now = Date.now();
                        
                        if (completedTime && now - completedTime < 60000) {
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
            return () => unsubscribe();
        }
    }, [currentAdminId]);

    // Handle Scanner
    useEffect(() => {
        let scanner: any = null;

        if (isScanning && isLinkModalOpen) {
            // Wait for modal to render div
            const timer = setTimeout(() => {
                try {
                    // Ensure element exists and isn't already populated
                    const readerElem = document.getElementById("reader");
                    if (readerElem && !readerElem.innerHTML) {
                        scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
                        scannerRef.current = scanner;
                        
                        scanner.render(
                            (decodedText: string) => {
                                setLinkData(prev => ({ ...prev, url: decodedText }));
                                setToast({ msg: "تم مسح الكود بنجاح!", type: 'success' });
                                
                                // Proper cleanup sequence
                                scanner.clear().then(() => {
                                    setIsScanning(false);
                                }).catch((err: any) => {
                                    console.error("Failed to clear", err);
                                    setIsScanning(false);
                                });
                            },
                            (error: any) => {
                                // Scanning...
                            }
                        );
                    }
                } catch (e) {
                    console.error("Scanner Error", e);
                    setToast({ msg: "خطأ في تشغيل الكاميرا", type: 'error' });
                }
            }, 300);
            return () => clearTimeout(timer);
        } else {
            // Cleanup if modal closes or scanning stops
            if (scannerRef.current) {
                scannerRef.current.clear().catch((e: any) => console.error(e));
                scannerRef.current = null;
            }
        }
    }, [isScanning, isLinkModalOpen]);

    const handleAddUser = async () => {
        const email = newUserEmail.trim();
        const password = newUserPassword.trim();

        if (!email || !password) return setToast({ msg: 'Email & Password required', type: 'error' });
        
        if (newUserRole === 'admin' && authRole?.toLowerCase() !== UserRole.ADMIN.toLowerCase()) {
            return setToast({ msg: 'Only Admins can create Admins', type: 'error' });
        }
        
        setIsAddingUser(true);
        const appName = `SecondaryApp-${Date.now()}`;
        let secondaryApp: any;
        
        try {
            secondaryApp = initializeApp(mainConfig, appName);
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUserId = userCredential.user.uid;
            
            const defaultPermissions = ['schedule', 'requests', 'market', 'incoming', 'history', 'profile', 'performance', 'appointments', 'communications', 'inventory', 'tasks', 'tech_support'];

            await setDoc(doc(mainDb, 'users', newUserId), {
                uid: newUserId,
                email: email,
                name: newUserName.trim(),
                role: newUserRole,
                departmentId: newUserDepartment || null,
                supervisorId: newUserSupervisor || null,
                managerId: newUserManager || null,
                phone: newUserPhone.trim(),
                permissions: defaultPermissions,
                jobCategory: newUserCategory || 'technician',
                gender: newUserGender || 'male',
                hireDate: newUserHireDate || '',
                isHidden: newUserHidden || false,
                createdAt: Timestamp.now()
            });

            // Initialize Cert Record
            await setDoc(doc(certDb, 'employee_records', newUserId), {
                userId: newUserId,
                documents: [],
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
        
        if (editForm.role === 'admin' && authRole?.toLowerCase() !== UserRole.ADMIN.toLowerCase()) {
            return setToast({ msg: 'Only Admins can set Admins', type: 'error' });
        }
        
        try {
            // 1. Update Main DB (Profile)
            await updateDoc(doc(mainDb, 'users', editForm.id), {
                name: editForm.name || '',
                email: editForm.email || '', 
                role: editForm.role || 'user',
                departmentId: editForm.departmentId || null,
                supervisorId: editForm.supervisorId || null,
                managerId: editForm.managerId || null,
                phone: editForm.phone || '', 
                permissions: editForm.permissions || [],
                jobCategory: editForm.jobCategory || 'technician',
                nationality: editForm.nationality || '',
                gender: editForm.gender || 'male',
                hireDate: editForm.hireDate || '',
                isHidden: editForm.isHidden || false
            });

            // 2. Update Cert DB (Certificates)
            await setDoc(doc(certDb, 'employee_records', editForm.id), {
                licenseExpiry: editForm.licenseExpiry || null,
                registrationExpiry: editForm.registrationExpiry || null,
                nrrcExpiry: editForm.nrrcExpiry || null
            }, { merge: true });

            // Update local state
            console.log('Updating user:', editForm.id, 'with:', editForm);
            setUsers(prev => prev.map(u => u.id === editForm.id ? { ...u, ...editForm } : u));

            setToast({ msg: 'User Updated Successfully', type: 'success' });
            setIsEditModalOpen(false);
        } catch (e: any) {
            console.error(e);
            setToast({ msg: 'Error updating: ' + e.message, type: 'error' });
        }
    };
    

    // --- Updated File Upload Logic using Firebase Storage ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: 'registration' | 'license' | 'general' = 'general') => {
        const file = e.target.files?.[0];
        if (!file || !editForm.id) return;

        if (file.type !== 'application/pdf') {
            setToast({ msg: 'يرجى رفع ملف PDF فقط', type: 'error' });
            return;
        }

        setIsUploading(true);
        try {
            // Upload to Firebase Storage
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

            // Save the link in Cert DB
            await setDoc(doc(certDb, 'employee_records', editForm.id), {
                documents: arrayUnion(newDoc)
            }, { merge: true });

            // Update local state
            setEditForm(prev => ({
                ...prev,
                documents: [...(prev.documents || []), newDoc]
            }));

            setToast({ msg: 'تم رفع الملف بنجاح', type: 'success' });
        } catch (error: any) {
            console.error("Upload error:", error);
            if (error.message === 'CORS_ERROR') {
                setShowCorsHelp(true);
            } else {
                setToast({ msg: 'فشل رفع الملف: ' + error.message, type: 'error' });
            }
        } finally {
            setIsUploading(false);
        }
    };

    const handleScannerSave = async (file: File) => {
        if (!editForm.id) return;
        setIsUploading(true);
        setShowScanner(false);
        try {
            const folderPath = `user_documents/${editForm.id}`;
            const downloadUrl = await uploadFile(file, folderPath);

            if (!downloadUrl) {
                setIsUploading(false);
                return;
            }

            const newDoc: UserDocument = {
                name: file.name,
                url: downloadUrl,
                type: 'pdf',
                category: scannerCategory,
                uploadedAt: new Date().toISOString()
            };

            await setDoc(doc(certDb, 'employee_records', editForm.id), {
                documents: arrayUnion(newDoc)
            }, { merge: true });

            setEditForm(prev => ({
                ...prev,
                documents: [...(prev.documents || []), newDoc]
            }));

            setToast({ msg: 'تم رفع الملف بنجاح', type: 'success' });
        } catch (error: any) {
            console.error("Upload error:", error);
            if (error.message === 'CORS_ERROR') {
                setShowCorsHelp(true);
            } else {
                setToast({ msg: 'فشل رفع الملف: ' + error.message, type: 'error' });
            }
        } finally {
            setIsUploading(false);
        }
    };

    // --- New Handler: Add Link / QR ---
    const handleAddLink = async () => {
        if (!editForm.id || !linkData.name || !linkData.url) {
            setToast({ msg: "Please fill all fields", type: 'error' });
            return;
        }

        try {
            const newDoc: UserDocument = {
                name: linkData.name,
                url: linkData.url,
                type: 'link', // Mark as link
                category: linkData.category,
                expiryDate: linkData.expiryDate || undefined, // Save expiry date if exists
                uploadedAt: new Date().toISOString()
            };

            // Save the link in Cert DB
            await setDoc(doc(certDb, 'employee_records', editForm.id), {
                documents: arrayUnion(newDoc)
            }, { merge: true });

            setEditForm(prev => ({
                ...prev,
                documents: [...(prev.documents || []), newDoc]
            }));

            setToast({ msg: 'تم إضافة الرابط بنجاح', type: 'success' });
            setIsLinkModalOpen(false);
            setLinkData({ name: '', url: '', category: 'registration', expiryDate: '' });
            if (scannerRef.current) scannerRef.current.clear();
            setIsScanning(false);

        } catch (e: any) {
            setToast({ msg: 'Error saving link', type: 'error' });
        }
    };

    const handleDeleteDocument = async (docItem: UserDocument) => {
        if (!editForm.id || !confirm('هل أنت متأكد من حذف هذا الملف؟')) return;
        try {
            // Remove the link from Cert DB
            await updateDoc(doc(certDb, 'employee_records', editForm.id), {
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
        if (authRole !== UserRole.ADMIN) return;
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
            const batch = writeBatch(mainDb);
            const deleteByQuery = async (col: string, field: string) => {
                const q = query(collection(mainDb, col), where(field, '==', user.id));
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
            
            batch.delete(doc(mainDb, 'users', user.id));
            await batch.commit();

            // Delete from Cert DB
            await deleteDoc(doc(certDb, 'employee_records', user.id));
            setToast({ msg: 'User Deleted from Database. Note: User still exists in Auth (Login). Disable in Firebase Console if needed.', type: 'success' });
        } catch(e:any) {
            setToast({ msg: 'Error: ' + e.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleResetBiometric = async (user: User) => {
        if (!confirm(`هل أنت متأكد من فك ارتباط الجهاز للموظف ${user.name}؟ سيتمكن من تسجيل الدخول من جهاز جديد.`)) return;
        try {
            await updateDoc(doc(mainDb, 'users', user.id), { biometricId: null, biometricRegisteredAt: null });
            setToast({ msg: 'تم فك ارتباط الجهاز بنجاح', type: 'success' });
        } catch (e) { setToast({ msg: 'Error', type: 'error' }); }
    };

    const handleResetAllDevices = async () => {
        if (!confirm("⚠️ تحذير هام: هذا الإجراء سيقوم بفك ارتباط جميع الموظفين بأجهزتهم الحالية. سيحتاج الجميع لإعادة التسجيل عند الدخول القادم. هل أنت متأكد؟")) return;
        
        setLoading(true);
        try {
            const snap = await getDocs(collection(mainDb, 'users'));
            const docs = snap.docs;
            const batchSize = 450;
            let count = 0;

            for (let i = 0; i < docs.length; i += batchSize) {
                const chunk = docs.slice(i, i + batchSize);
                const batch = writeBatch(mainDb);
                
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

            await addDoc(collection(mainDb, 'attendance_overrides'), {
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
            await addDoc(collection(mainDb, 'location_checks'), {
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
              const qLogs = query(collection(mainDb, 'attendance_logs'), where('userId', '==', user.id), orderBy('timestamp', 'desc'), limit(5));
              snap = await getDocs(qLogs);
          } catch (error: any) {
              const qFallback = query(collection(mainDb, 'attendance_logs'), where('userId', '==', user.id));
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
        
        // Supervisor/Manager Isolation: Can only see users in their department or users assigned to them
        if (authRole === UserRole.SUPERVISOR) {
            if (u.departmentId !== selectedDepartmentId && u.supervisorId !== currentUser?.uid) {
                return false;
            }
        } else if (authRole === UserRole.MANAGER) {
            if (u.departmentId !== selectedDepartmentId && u.managerId !== currentUser?.uid) {
                return false;
            }
        }

        // Department Filter Logic
        if (selectedDepartmentFilter !== 'all') {
            if (u.departmentId !== selectedDepartmentFilter) return false;
            // Exclude Admin/Supervisor/Manager from department view as requested
            if (['admin', 'supervisor', 'manager'].includes(u.role?.toLowerCase() || '')) return false;
        }

        return (
            u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            u.email.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }).sort((a, b) => {
        if (sortBy === 'role') {
            return (a.role || '').localeCompare(b.role || '');
        } else if (sortBy === 'category') {
            return (a.jobCategory || '').localeCompare(b.jobCategory || '');
        } else {
            return (a.name || '').localeCompare(b.name || '');
        }
    });

    const openEditModal = (user: User) => {
        const perms = user.permissions && user.permissions.length > 0 
            ? user.permissions 
            : ALL_PERMISSIONS.map(p => p.key);
            
        setEditForm({ ...user, permissions: perms, jobCategory: user.jobCategory || 'technician', gender: user.gender || 'male', hireDate: user.hireDate || '', nationality: user.nationality || '', isHidden: user.isHidden || false });
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
            
            // Check Documents Expiry
            if (u.documents) {
                u.documents.forEach(doc => {
                    if (doc.expiryDate) {
                        const expDate = new Date(doc.expiryDate);
                        const diff = (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                        if (diff < 0) counts.expired++;
                        else if (diff <= THRESHOLD) counts.nearExpiry++;
                    }
                });
            }
        });
        return counts;
    };

    const openCategoryList = (catId: string) => {
        const filtered = users.filter(u => {
             // Check for hidden state
             if (u.isHidden && !hiddenEmployeesVisible) return false;
             if (['admin', 'supervisor', 'manager'].includes(u.role)) return false;
             return (u.jobCategory || 'technician') === catId;
        });
        const categoryData = JOB_CATEGORIES.find(c => c.id === catId);
        
        setSelectedCategoryUsers(filtered);
        setSelectedCategoryTitle(categoryData?.title || '');
        setSelectedCategoryTheme(categoryData?.cardTheme || 'from-gray-50 to-gray-100 border-gray-200'); // Set theme
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

    // Helper to calculate duration since hire date
    const calculateDuration = (dateString?: string) => {
        if (!dateString) return 'New';
        const start = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (diffDays < 30) return 'New Joiner';
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} Months`;
        return `${Math.floor(diffDays / 365)} Years`;
    };

    // Helper to style document buttons based on expiry (Dazzling Version)
    const getDocumentButtonStyle = (doc: UserDocument) => {
        if (!doc.expiryDate) {
             return "bg-gradient-to-r from-slate-400 to-slate-600 text-white border-none dazzle-btn"; 
        }
        
        const today = new Date(); today.setHours(0,0,0,0);
        const expDate = new Date(doc.expiryDate);
        const diff = (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        
        if (diff < 0) return "bg-gradient-to-r from-red-500 to-rose-600 text-white animate-pulse dazzle-btn border-none shadow-[0_0_10px_rgba(239,68,68,0.5)]"; // Expired
        if (diff <= 30) return "bg-gradient-to-r from-amber-400 to-orange-500 text-white dazzle-btn border-none shadow-[0_0_10px_rgba(245,158,11,0.5)]"; // Soon
        return "bg-gradient-to-r from-emerald-500 to-teal-600 text-white dazzle-btn border-none"; // Valid
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
    
    // Get document link button
    const getDocumentLink = (user: User, cat: string, label: string) => {
        const docItem = user.documents?.find(d => d.category === cat);
        if (docItem && docItem.url) {
            return (
                <a 
                    href={docItem.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] ${getDocumentButtonStyle(docItem)}`}
                    title={`View ${label}`}
                >
                    <i className={`fas ${docItem.type === 'link' ? 'fa-link' : 'fa-file-pdf'}`}></i> {label}
                </a>
            );
        }
        return (
            <span className="flex items-center gap-1 bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-full text-[10px] cursor-not-allowed opacity-60">
                 <i className="fas fa-ban"></i> {label}
            </span>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in" dir={dir}>
            <style>{styles}</style>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            {loading && <div className="fixed inset-0 bg-white/50 z-50 flex items-center justify-center"><div className="w-10 h-10 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div></div>}
            
            {/* Secret Button for Hidden Employees (Invisible Trigger in Bottom Right) */}
            <div id="secretTrigger" onClick={toggleHiddenEmployees} className="fixed bottom-0 right-0 w-20 h-20 cursor-pointer z-50 opacity-0"></div>

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
                                <div className="p-6 border-t border-slate-50 space-y-5 animate-in fade-in duration-300 bg-slate-50/50">
                                    
                                    {/* Personal Info */}
                                    <div className="space-y-3">
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Personal Information</p>
                                        <div className="input-group-modern">
                                            <i className="fas fa-user input-icon"></i>
                                            <input className="input-modern" placeholder={t('sup.user.name')} value={newUserName} onChange={e => setNewUserName(e.target.value)} />
                                        </div>
                                        <div className="input-group-modern">
                                            <i className="fas fa-envelope input-icon"></i>
                                            <input className="input-modern" placeholder="Email Address" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
                                        </div>
                                        <div className="input-group-modern">
                                            <i className="fas fa-lock input-icon"></i>
                                            <input className="input-modern" placeholder="Password" type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} />
                                        </div>
                                        <div className="input-group-modern">
                                            <i className="fas fa-phone input-icon"></i>
                                            <input className="input-modern" placeholder="Phone Number" value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} />
                                        </div>
                                    </div>

                                    {/* Job Details */}
                                    <div className="space-y-3 pt-2 border-t border-slate-200">
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Job Details</p>
                                        <div className="grid grid-cols-2 gap-3">
                                             <div className="input-group-modern">
                                                <i className="fas fa-venus-mars input-icon"></i>
                                                <select className="input-modern" value={newUserGender} onChange={e => setNewUserGender(e.target.value as 'male'|'female')}>
                                                    <option value="male">Male</option>
                                                    <option value="female">Female</option>
                                                </select>
                                            </div>
                                            <div className="input-group-modern">
                                                <i className="fas fa-calendar-alt input-icon"></i>
                                                <input type="date" className="input-modern" value={newUserHireDate} onChange={e => setNewUserHireDate(e.target.value)} placeholder="Hire Date" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="input-group-modern">
                                                <i className="fas fa-building input-icon"></i>
                                                <select className="input-modern" value={newUserDepartment} onChange={e => setNewUserDepartment(e.target.value)}>
                                                    <option value="">-- اختر القسم --</option>
                                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="input-group-modern">
                                                <i className="fas fa-user-tie input-icon"></i>
                                                <select className="input-modern" value={newUserSupervisor} onChange={e => setNewUserSupervisor(e.target.value)}>
                                                    <option value="">-- اختر المشرف --</option>
                                                    {users.filter(u => u.role === 'supervisor' || u.role === 'admin').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="input-group-modern">
                                                <i className="fas fa-user-shield input-icon"></i>
                                                <select className="input-modern" value={newUserManager} onChange={e => setNewUserManager(e.target.value)}>
                                                    <option value="">-- اختر المدير --</option>
                                                    {users.filter(u => u.role === 'manager' || u.role === 'admin').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="input-group-modern">
                                                <i className="fas fa-user-tag input-icon"></i>
                                                <select className="input-modern" value={newUserRole} onChange={e => setNewUserRole(e.target.value)}>
                                                    <option value="user">User</option>
                                                    <option value="doctor">Doctor</option>
                                                    <option value="supervisor">Supervisor</option>
                                                    <option value="manager">Manager</option>
                                                    {(authRole?.toLowerCase() === UserRole.ADMIN.toLowerCase()) && <option value="admin">Admin</option>}
                                                </select>
                                            </div>
                                            <div className="input-group-modern">
                                                <i className="fas fa-briefcase input-icon"></i>
                                                <select className="input-modern" value={newUserCategory} onChange={e => setNewUserCategory(e.target.value)}>
                                                    {JOB_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors shadow-sm">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${newUserHidden ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 bg-slate-100'}`}>
                                            {newUserHidden && <i className="fas fa-check text-xs"></i>}
                                        </div>
                                        <input type="checkbox" checked={newUserHidden} onChange={e => setNewUserHidden(e.target.checked)} className="hidden" />
                                        <span className="text-xs text-slate-600 font-bold">Hide from public lists (Secret Mode)</span>
                                    </label>

                                    <button 
                                        onClick={handleAddUser} 
                                        disabled={isAddingUser}
                                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl font-black hover:from-blue-700 hover:to-indigo-700 shadow-lg disabled:opacity-50 transform active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                    >
                                        {isAddingUser ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-plus-circle"></i> {t('add')}</>}
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
                            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2 flex-1">
                                    <i className="fas fa-search text-gray-400"></i>
                                    <input 
                                        className="bg-transparent outline-none text-sm w-full font-bold text-gray-600"
                                        placeholder="Search Users..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                {authRole === UserRole.ADMIN && (
                                    <div className="flex items-center gap-2">
                                        <i className="fas fa-building text-gray-400"></i>
                                        <select 
                                            className="bg-transparent outline-none text-sm font-bold text-gray-600 cursor-pointer"
                                            value={selectedDepartmentFilter}
                                            onChange={e => setSelectedDepartmentFilter(e.target.value)}
                                        >
                                            <option value="all">All Departments</option>
                                            {departments.map(dept => (
                                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-sort text-gray-400"></i>
                                    <select 
                                        className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-600 outline-none focus:ring-2 focus:ring-blue-500/20"
                                        value={sortBy}
                                        onChange={e => setSortBy(e.target.value as any)}
                                    >
                                        <option value="name">Name</option>
                                        <option value="role">Role</option>
                                        <option value="category">Category</option>
                                    </select>
                                </div>
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
                                                        {user.departmentId && (
                                                            <p className="text-xs text-indigo-500 font-medium mt-0.5">
                                                                <i className="fas fa-building mr-1"></i>
                                                                {departments.find(d => d.id === user.departmentId)?.name || 'Unknown Dept'}
                                                            </p>
                                                        )}
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
                // Use a centered container
                <div className="min-h-[70vh] flex flex-col items-center justify-center animate-fade-in-up">
                    <div className="flex flex-wrap gap-8 justify-center pb-20 pt-10">
                        {/* Hide categories marked as isHidden: true from visual circles */}
                        {JOB_CATEGORIES.filter(c => !(c as any).isHidden).map(cat => {
                            const catUsers = users.filter(u => {
                                 // Check for hidden state
                                 const isHidden = (u as any).isHidden;
                                 if (isHidden && !hiddenEmployeesVisible) return false;
                                 if (['admin', 'supervisor', 'manager'].includes(u.role)) return false;
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
                                    
                                    {/* Floating Badges */}
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
                                    
                                    {/* If both exist, show warning count on left */}
                                    {hasDanger && hasWarning && (
                                        <div className="floating-badge badge-warning">
                                            {warningCounts.nearExpiry}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Edit Modal (Enhanced) */}
             {/* Edit Modal (Enhanced) */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="تعديل بيانات الموظف">
                <div className="space-y-4 max-h-[80vh] overflow-y-auto p-1">
                    
                    {/* Basic Info Section */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">الاسم الكامل</label>
                                <input 
                                    className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-200 outline-none" 
                                    value={editForm.name || ''} 
                                    onChange={e => setEditForm({...editForm, name: e.target.value})} 
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">الصلاحية (Role)</label>
                                <select 
                                    className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-200 outline-none" 
                                    value={editForm.role || 'user'} 
                                    onChange={e => setEditForm({...editForm, role: e.target.value})}
                                    disabled={authRole?.toLowerCase() !== UserRole.ADMIN.toLowerCase() && editForm.role?.toLowerCase() === UserRole.ADMIN.toLowerCase()}
                                >
                                    <option value="user">User</option>
                                    <option value="doctor">Doctor</option>
                                    <option value="supervisor">Supervisor</option>
                                    <option value="manager">Manager</option>
                                    {(authRole?.toLowerCase() === UserRole.ADMIN.toLowerCase()) && <option value="admin">Admin</option>}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">القسم (Department)</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                                    value={editForm.departmentId || ''} 
                                    onChange={e => setEditForm({...editForm, departmentId: e.target.value})}
                                >
                                    <option value="">-- اختر القسم --</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">المشرف (Supervisor)</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                                    value={editForm.supervisorId || ''} 
                                    onChange={e => setEditForm({...editForm, supervisorId: e.target.value})}
                                >
                                    <option value="">-- اختر المشرف --</option>
                                    {users.filter(u => u.role === 'supervisor' || u.role === 'admin').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">المدير (Manager)</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                                    value={editForm.managerId || ''} 
                                    onChange={e => setEditForm({...editForm, managerId: e.target.value})}
                                >
                                    <option value="">-- اختر المدير --</option>
                                    {users.filter(u => u.role === 'manager' || u.role === 'admin').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">المسمى الوظيفي (Job Category)</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                                    value={editForm.jobCategory || 'technician'} 
                                    onChange={e => setEditForm({...editForm, jobCategory: e.target.value as any})}
                                >
                                    {JOB_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">البريد الإلكتروني</label>
                                <input 
                                    type="email"
                                    className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-200 outline-none" 
                                    value={editForm.email || ''} 
                                    onChange={e => setEditForm({...editForm, email: e.target.value})} 
                                />
                                <p className="text-[9px] text-amber-600 mt-1">* تحديث البريد هنا لتصحيح السجلات فقط.</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">رقم الهاتف</label>
                                <input 
                                    className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-200 outline-none" 
                                    value={editForm.phone || ''} 
                                    onChange={e => setEditForm({...editForm, phone: e.target.value})} 
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">Jinsia (Nationality)</label>
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                                placeholder="e.g. Saudi, Egyptian"
                                value={editForm.nationality || ''} 
                                onChange={e => setEditForm({...editForm, nationality: e.target.value})} 
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">الجنس (Gender)</label>
                            <select 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                                value={editForm.gender || 'male'} 
                                onChange={e => setEditForm({...editForm, gender: e.target.value as 'male' | 'female'})}
                            >
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">تاريخ التعيين</label>
                        <input 
                            type="date" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                            value={editForm.hireDate || ''} 
                            onChange={e => setEditForm({...editForm, hireDate: e.target.value})} 
                        />
                    </div>

                    {/* PDF UPLOAD SECTION */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-blue-800 text-sm flex items-center gap-2"><i className="fas fa-file-pdf"></i> Documents (PDF)</h4>
                            <div className="flex gap-2 flex-wrap">
                                {/* NEW BUTTON for Link/QR */}
                                <button 
                                    onClick={() => { setIsLinkModalOpen(true); setIsEditModalOpen(false); }} // Close edit, open link modal (or nested)
                                    className="cursor-pointer bg-white text-purple-600 px-3 py-1 rounded-lg text-[10px] font-bold border border-purple-200 hover:bg-purple-50 transition-colors flex items-center gap-1"
                                >
                                    <i className="fas fa-link"></i> Link / QR
                                </button>

                                <div className="flex items-center gap-1">
                                    <label className="cursor-pointer bg-white text-blue-600 px-3 py-1 rounded-lg text-[10px] font-bold border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1">
                                        <i className="fas fa-certificate"></i> + Reg. Certificate
                                        <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'registration')} disabled={isUploading} />
                                    </label>
                                    <button 
                                        onClick={() => { setScannerCategory('registration'); setShowScanner(true); }}
                                        className="cursor-pointer bg-white text-blue-600 px-2 py-1 rounded-lg text-[10px] font-bold border border-blue-200 hover:bg-blue-100 transition-colors flex items-center"
                                        title="Scan Reg. Certificate"
                                    >
                                        <i className="fas fa-camera"></i>
                                    </button>
                                </div>

                                <div className="flex items-center gap-1">
                                    <label className="cursor-pointer bg-white text-emerald-600 px-3 py-1 rounded-lg text-[10px] font-bold border border-emerald-200 hover:bg-emerald-50 transition-colors flex items-center gap-1">
                                        <i className="fas fa-id-card"></i> + License
                                        <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFileUpload(e, 'license')} disabled={isUploading} />
                                    </label>
                                    <button 
                                        onClick={() => { setScannerCategory('license'); setShowScanner(true); }}
                                        className="cursor-pointer bg-white text-emerald-600 px-2 py-1 rounded-lg text-[10px] font-bold border border-emerald-200 hover:bg-emerald-50 transition-colors flex items-center"
                                        title="Scan License"
                                    >
                                        <i className="fas fa-camera"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            {editForm.documents?.map((doc, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-white p-2 rounded-lg border border-blue-200 text-xs">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${doc.category === 'registration' ? 'bg-blue-100 text-blue-700' : doc.category === 'license' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {doc.category || 'General'}
                                        </span>
                                        {/* Handle Link vs File */}
                                        <a href={doc.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 font-bold truncate max-w-[150px]">
                                            <i className={`fas ${doc.type === 'link' ? 'fa-link' : 'fa-file-alt'}`}></i> {doc.name}
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
                        <label className="text-xs font-bold text-slate-500 block mb-3">Permissions {authRole !== UserRole.ADMIN && <span className="text-red-500 font-normal">(View Only)</span>}</label>
                        <div className="grid grid-cols-2 gap-2">
                            {ALL_PERMISSIONS.map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => togglePermission(p.key)}
                                    disabled={authRole !== UserRole.ADMIN}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold text-left flex items-center justify-between border transition-all ${
                                        editForm.permissions?.includes(p.key) 
                                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                    } ${authRole !== UserRole.ADMIN ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    <span>{p.label}</span>
                                    {editForm.permissions?.includes(p.key) && <i className="fas fa-check"></i>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleUpdateUser} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg">حفظ التغييرات</button>
                </div>
            </Modal>

            {/* Link/QR Modal */}
            <Modal isOpen={isLinkModalOpen} onClose={() => { setIsLinkModalOpen(false); setIsEditModalOpen(true); setIsScanning(false); }} title="Add Document Link">
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Document Category</label>
                        <select 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold" 
                            value={linkData.category}
                            onChange={(e) => setLinkData({...linkData, category: e.target.value as any})}
                        >
                            <option value="registration">Registration</option>
                            <option value="license">License</option>
                            <option value="general">General / Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Document Name</label>
                        <input 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" 
                            placeholder="e.g. SCFHS Card"
                            value={linkData.name}
                            onChange={(e) => setLinkData({...linkData, name: e.target.value})}
                        />
                    </div>
                    
                    {/* NEW: Expiry Date Field */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Expiry Date (Optional)</label>
                        <input 
                            type="date"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" 
                            value={linkData.expiryDate}
                            onChange={(e) => setLinkData({...linkData, expiryDate: e.target.value})}
                        />
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">URL (Link)</label>
                        <div className="flex gap-2">
                            <input 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" 
                                placeholder="https://..."
                                value={linkData.url}
                                onChange={(e) => setLinkData({...linkData, url: e.target.value})}
                            />
                            <button 
                                onClick={() => setIsScanning(!isScanning)} 
                                className={`px-3 rounded-xl border ${isScanning ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                            >
                                <i className={`fas ${isScanning ? 'fa-stop' : 'fa-qrcode'}`}></i>
                            </button>
                        </div>
                    </div>

                    {isScanning && (
                        <div className="bg-slate-100 rounded-xl overflow-hidden relative h-64 w-full border border-slate-300">
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                <span className="animate-pulse">جار تشغيل الكاميرا...</span>
                            </div>
                            <div id="reader" className="w-full h-full relative z-10"></div>
                        </div>
                    )}

                    <div className="flex gap-2 justify-end pt-4">
                        <button onClick={() => { setIsLinkModalOpen(false); setIsEditModalOpen(true); }} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">Cancel</button>
                        <button onClick={handleAddLink} className="px-6 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold shadow-md hover:bg-blue-700">Add Link</button>
                    </div>
                </div>
            </Modal>

            {/* Category List Modal (New Colorful Card Layout) */}
            <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title={`${selectedCategoryTitle} List`} maxWidth="max-w-4xl">
                <div className="grid grid-cols-1 gap-6 max-h-[60vh] overflow-y-auto pr-2 pb-4 custom-scrollbar">
                    {selectedCategoryUsers.length === 0 ? (
                        <div className="col-span-1 text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
                            <i className="fas fa-user-slash text-4xl mb-3 opacity-50"></i>
                            <p>No employees in this category.</p>
                        </div>
                    ) : (
                        selectedCategoryUsers.map(user => (
                            <div key={user.id} className={`group relative ${selectedCategoryTheme} rounded-[24px] p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border border-white/20 overflow-hidden`}>
                                
                                {/* Background Decorative Icon */}
                                <div className="absolute -right-6 -bottom-6 text-[120px] text-white opacity-10 pointer-events-none rotate-12">
                                    <i className={`fas ${JOB_CATEGORIES.find(c => c.id === user.jobCategory)?.icon || 'fa-user'}`}></i>
                                </div>

                                {/* Header Section */}
                                <div className="flex flex-col md:flex-row gap-6 items-start relative z-10">
                                    <div className="relative shrink-0">
                                        <div className="w-20 h-20 rounded-full p-1 bg-white/20 backdrop-blur-sm shadow-inner">
                                            <img 
                                                src={getAvatar(user)} 
                                                alt={user.name} 
                                                className="w-full h-full rounded-full object-cover bg-white shadow-md" 
                                                referrerPolicy="no-referrer"
                                            />
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-sm text-slate-700 shadow-lg border-2 border-white bg-white">
                                            <i className={`fas ${JOB_CATEGORIES.find(c => c.id === user.jobCategory)?.icon || 'fa-user'}`}></i>
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 w-full">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-black text-white text-2xl leading-tight drop-shadow-md">{user.name}</h3>
                                                <p className="text-white/80 font-bold text-sm mb-1 flex items-center gap-2">
                                                    <i className="fas fa-envelope opacity-70"></i> {user.email}
                                                </p>
                                                {user.departmentId && (
                                                    <p className="text-white/90 font-medium text-xs mb-3 flex items-center gap-2 bg-black/20 w-fit px-2 py-1 rounded-md">
                                                        <i className="fas fa-building opacity-70"></i> 
                                                        {departments.find(d => d.id === user.departmentId)?.name || 'Unknown Dept'}
                                                    </p>
                                                )}
                                            </div>
                                            <button 
                                                onClick={() => { setIsCategoryModalOpen(false); openEditModal(user); }}
                                                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white text-white hover:text-slate-800 transition-all shadow-lg backdrop-blur-md flex items-center justify-center border border-white/30"
                                            >
                                                <i className="fas fa-pen"></i>
                                            </button>
                                        </div>
                                        
                                        {/* Info Pills Row */}
                                        <div className="flex flex-wrap gap-2 mb-4">
                                             {/* Specialty Pill */}
                                             <span className="flex items-center gap-1 text-[11px] font-black px-3 py-1 bg-white/20 text-white rounded-full border border-white/30 backdrop-blur-md shadow-sm">
                                                <i className="fas fa-briefcase"></i> {JOB_CATEGORIES.find(c => c.id === user.jobCategory)?.title || 'Staff'}
                                            </span>

                                            {/* Nationality Pill */}
                                            {user.nationality && (
                                                <span className="flex items-center gap-1 text-[11px] font-black px-3 py-1 bg-white/20 text-white rounded-full border border-white/30 backdrop-blur-md shadow-sm">
                                                    <i className="fas fa-globe"></i> {user.nationality}
                                                </span>
                                            )}

                                            {/* Hire Date Pill */}
                                            {user.hireDate && (
                                                <span className="flex items-center gap-1 text-[11px] font-black px-3 py-1 bg-white/20 text-white rounded-full border border-white/30 backdrop-blur-md shadow-sm">
                                                    <i className="fas fa-calendar-alt"></i> {calculateDuration(user.hireDate)}
                                                </span>
                                            )}
                                            
                                            {user.phone && (
                                                <span className="flex items-center gap-1 text-[11px] font-black px-3 py-1 bg-white/20 text-white rounded-full border border-white/30 backdrop-blur-md shadow-sm">
                                                    <i className="fas fa-phone"></i> {user.phone}
                                                </span>
                                            )}
                                        </div>

                                        {/* Certificates Section (Glass Cards) */}
                                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 shadow-inner">
                                            <p className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <i className="fas fa-shield-alt"></i> Compliance & Documents
                                            </p>
                                            
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                                {/* License Card */}
                                                <div className="bg-white rounded-xl p-3 shadow-lg border-l-4 border-emerald-500 relative overflow-hidden group/card">
                                                    <div className="flex items-center justify-between mb-2 relative z-10">
                                                        <span className="text-xs font-black text-slate-700 flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><i className="fas fa-id-card"></i></div>
                                                            License
                                                        </span>
                                                        {getDocumentLink(user, 'license', 'View')}
                                                    </div>
                                                    <div className="mt-1 pl-8">
                                                        {getExpiryStatusBadge(user, 'licenseExpiry', 'Exp')}
                                                    </div>
                                                </div>

                                                {/* Registration Card */}
                                                <div className="bg-white rounded-xl p-3 shadow-lg border-l-4 border-blue-500 relative overflow-hidden group/card">
                                                    <div className="flex items-center justify-between mb-2 relative z-10">
                                                        <span className="text-xs font-black text-slate-700 flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><i className="fas fa-file-contract"></i></div>
                                                            Registration
                                                        </span>
                                                        {getDocumentLink(user, 'registration', 'View')}
                                                    </div>
                                                    <div className="mt-1 pl-8">
                                                        {getExpiryStatusBadge(user, 'registrationExpiry', 'Exp')}
                                                    </div>
                                                </div>

                                                {/* NRRC – RSO Only */}
                                                {user.jobCategory === 'rso' && (
                                                    <div className="bg-white rounded-xl p-3 shadow-lg border-l-4 border-purple-500 relative overflow-hidden group/card sm:col-span-2">
                                                        <div className="flex items-center justify-between mb-2 relative z-10">
                                                            <span className="text-xs font-black text-slate-700 flex items-center gap-2">
                                                                <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-600"><i className="fas fa-radiation"></i></div>
                                                                NRRC Certificate
                                                            </span>
                                                            {getDocumentLink(user, 'nrrc', 'View')}
                                                        </div>
                                                        <div className="mt-1 pl-8">
                                                            {getExpiryStatusBadge(user, 'nrrcExpiry', 'Exp')}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* GENERAL / OTHER DOCUMENTS SECTION */}
                                            {(() => {
                                                const generalDocs = user.documents?.filter(d => 
                                                    d.category === 'general' || 
                                                    (d.category !== 'license' && d.category !== 'registration' && d.category !== 'nrrc_certificate')
                                                ) || [];

                                                if (generalDocs.length === 0) return null;

                                                return (
                                                    <div className="mt-3 pt-3 border-t border-white/10">
                                                        <div className="flex flex-wrap gap-2">
                                                            {generalDocs.map((doc, idx) => (
                                                                <a 
                                                                    key={idx}
                                                                    href={doc.url} 
                                                                    target="_blank" 
                                                                    rel="noreferrer"
                                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-white/20 text-white hover:bg-white hover:text-slate-800 transition-all border border-white/30 shadow-sm backdrop-blur-sm"
                                                                    title={doc.name}
                                                                >
                                                                    <i className={`fas ${doc.type === 'link' ? 'fa-link' : 'fa-file-alt'}`}></i> 
                                                                    <span className="truncate max-w-[120px]">{doc.name}</span>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
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
                        <p className="font-bold flex items-center gap-2"><i className="fas fa-exclamation-triangle"></i> لماذا تظهر هذه الصفحة؟</p>
                        <p className="mt-2 text-xs">
                            نعتذر عن الإزعاج. قواعد البيانات (Firestore) تعمل لأنها نصوص فقط، أما <b>رفع الملفات (Storage)</b> فيتطلب إعدادات أمان خاصة من جوجل (CORS) للسماح للمتصفح برفع الملفات إلى خادم خارجي.
                        </p>
                        <p className="mt-1 text-xs font-bold">هذا الإعداد يتم مرة واحدة فقط للمشروع الجديد.</p>
                    </div>
                    
                    <div className="space-y-3">
                        <p className="text-sm font-bold text-slate-700">لحل المشكلة نهائياً، يرجى اتباع الخطوات التالية:</p>
                        
                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                            <span className="text-xs font-bold text-amber-800 uppercase block mb-1">خطوة هامة جداً: تفعيل التخزين أولاً</span>
                            <p className="text-xs text-amber-900 mb-2">
                                إذا ظهر لك خطأ <span className="font-mono bg-amber-100 px-1">404 The specified bucket does not exist</span>، فهذا يعني أنك لم تفعل خدمة التخزين بعد.
                            </p>
                            <a href="https://console.firebase.google.com/project/radiology-inventory/storage" target="_blank" rel="noreferrer" className="text-amber-700 hover:underline text-xs font-bold flex items-center gap-1">
                                <i className="fas fa-database"></i> اضغط هنا واضغط على "Get Started" لإنشاء الـ Bucket
                            </a>
                            
                            <div className="mt-3 pt-3 border-t border-amber-200">
                                <p className="text-[10px] font-bold text-amber-900 mb-1">واجهت خطأ "Unknown Error" في الموقع؟</p>
                                <p className="text-[10px] text-amber-800 mb-2">لا تقلق، يمكنك إنشاؤه يدوياً. انسخ هذا الأمر وضعه في Cloud Shell قبل أمر الـ CORS:</p>
                                <div className="bg-white/50 p-2 rounded font-mono text-[10px] text-amber-900 select-all border border-amber-200" dir="ltr">
                                    gsutil mb -l us-central1 gs://radiology-inventory.appspot.com
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                            <span className="text-xs font-bold text-slate-500 uppercase block mb-1">الخطوة 1: فتح Cloud Shell</span>
                            <a href="https://ssh.cloud.google.com/cloudshell/editor?project=radiology-inventory" target="_blank" rel="noreferrer" className="text-purple-600 hover:underline text-xs font-bold flex items-center gap-1">
                                <i className="fas fa-terminal"></i> اضغط هنا لفتح Cloud Shell مباشرة
                            </a>
                        </div>

                        <div className="bg-slate-900 text-green-400 p-4 rounded-xl font-mono text-[10px] overflow-x-auto" dir="ltr">
                            <p className="text-slate-400 mb-2"># الخطوة 2: انسخ هذا الكود بالكامل والصقه في الـ Terminal واضغط Enter:</p>
                            <div className="select-all whitespace-pre-wrap break-all">
                                {`echo '[{"origin": ["*"],"method": ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],"maxAgeSeconds": 3600}]' > cors.json && gsutil cors set cors.json gs://radiology-inventory.appspot.com`}
                            </div>
                        </div>
                        
                        <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-100">
                            <p className="text-[10px] text-blue-800 font-bold mb-1">
                                <i className="fas fa-info-circle"></i> هام لمستخدمي الخطة المجانية (Spark):
                            </p>
                            <p className="text-[10px] text-blue-800 mb-2">
                                إذا ظهر لك خطأ <span className="font-mono bg-blue-100 px-1">Billing account disabled</span> عند محاولة إنشاء الـ Bucket بالأوامر، فهذا طبيعي لأن جوجل تمنع الإنشاء اليدوي للحسابات المجانية.
                            </p>
                            <p className="text-[10px] text-blue-800 mb-2 font-bold">
                                الحل الوحيد هو إنشاؤه من خلال Firebase Console. إذا واجهت "Unknown Error":
                            </p>
                            <ul className="list-disc list-inside text-[10px] text-blue-800 space-y-1">
                                <li>جرب تحديث الصفحة (Refresh) والمحاولة مجدداً.</li>
                                <li>جرب فتح الرابط في <b>متصفح خفي (Incognito)</b>.</li>
                                <li>تأكد من تعطيل أي مانع إعلانات (AdBlock).</li>
                            </ul>
                            <div className="flex flex-col gap-2 mt-2">
                                <a href="https://console.firebase.google.com/project/radiology-inventory/storage" target="_blank" rel="noreferrer" className="text-blue-700 hover:underline text-xs font-bold flex items-center gap-1">
                                    <i className="fas fa-external-link-alt"></i> المحاولة عبر Firebase Console (الحل الوحيد)
                                </a>
                                
                                <div className="bg-red-50 p-2 rounded border border-red-100 mt-1">
                                    <p className="text-[10px] font-bold text-red-800 mb-1">
                                        <i className="fas fa-times-circle"></i> لا يمكن الإنشاء من Google Cloud Console للحسابات المجانية.
                                    </p>
                                    <p className="text-[10px] text-red-800">
                                        يجب أن تنجح في إنشائه من Firebase Console لتجاوز خطأ "Unknown Error". جرب الحلول التالية:
                                    </p>
                                    <ul className="list-decimal list-inside text-[10px] text-red-800 mt-1 space-y-1 font-bold">
                                        <li>افتح الرابط من <u>الموبايل</u> (غالباً ينجح).</li>
                                        <li>استخدم متصفح <u>Edge</u> أو <u>Safari</u> بدلاً من Chrome.</li>
                                        <li>تأكد من إغلاق أي VPN.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        
                        <p className="text-xs text-slate-400 mt-2">تنويه: هذا الإعداد يتم مرة واحدة فقط للمشروع.</p>
                    </div>

                    <button onClick={() => setShowCorsHelp(false)} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold">
                        حسناً، فهمت
                    </button>
                </div>
            </Modal>

            {showScanner && (
                <DocumentScanner 
                    onSave={handleScannerSave} 
                    onCancel={() => setShowScanner(false)} 
                />
            )}
        </div>
    );
};

export default SupervisorEmployees;
