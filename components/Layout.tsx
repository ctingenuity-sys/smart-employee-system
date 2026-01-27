
import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
// @ts-ignore
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
// @ts-ignore
import { collection, onSnapshot, query, where, orderBy, limit, Timestamp, doc, getDoc, updateDoc, serverTimestamp, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { UserRole } from '../types';
import Modal from './Modal';
import Toast from './Toast';
import { useLanguage } from '../contexts/LanguageContext';

interface LayoutProps {
  children: React.ReactNode;
  userRole: string;
  userName: string;
  permissions?: string[]; 
}

const playNotificationSound = (type: 'normal' | 'alert' = 'normal') => {
  try {
    const src = type === 'alert' 
        ? 'https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3' 
        : 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'; 
    const audio = new Audio(src); 
    audio.volume = 1.0; 
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {});
    }
  } catch (e) {}
};

const showBrowserNotification = (title: string, body: string, type: 'normal' | 'alert' = 'normal') => {
  playNotificationSound(type);
  if (!('Notification' in window)) return;
  
  const options: any = {
      body, 
      icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
      requireInteraction: type === 'alert',
      silent: true
  };

  if (Notification.permission === 'granted') {
    new Notification(title, options);
  } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
          if (permission === 'granted') new Notification(title, options);
      });
  }
};

const GlobalNotificationListener: React.FC<{ userId: string, userRole: string }> = ({ userId, userRole }) => {
    const isFirstRun = useRef(true);
    const { t } = useLanguage();

    useEffect(() => {
        const t = setTimeout(() => { isFirstRun.current = false; }, 3000); 
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (!userId) return;

        // Announcements
        const unsubAnnounce = onSnapshot(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(1)), (snap: any) => {
            if (isFirstRun.current) return;
            snap.docChanges().forEach((change: any) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    showBrowserNotification(`تعميم: ${data.title}`, data.content);
                }
            });
        });

        return () => {
            unsubAnnounce();
        };
    }, [userId, userRole]);

    return null;
};

const Layout: React.FC<LayoutProps> = ({ children, userRole, userName, permissions = [] }) => {
  const { t, language, toggleLanguage, dir } = useLanguage();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const currentUserId = auth.currentUser?.uid;

  // Change Password State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
  const [isPwLoading, setIsPwLoading] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.clear(); 
    navigate('/login');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
          setToast({ msg: t('pw.matchError'), type: 'error' });
          return;
      }
      if (newPassword.length < 6) {
          setToast({ msg: t('pw.lengthError'), type: 'error' });
          return;
      }
      setIsPwLoading(true);
      const user = auth.currentUser;
      if (user && user.email) {
          const credential = EmailAuthProvider.credential(user.email, currentPassword);
          try {
              await reauthenticateWithCredential(user, credential);
              await updatePassword(user, newPassword);
              setToast({ msg: t('pw.success'), type: 'success' });
              setIsPasswordModalOpen(false);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
          } catch (error: any) {
              setToast({ msg: 'Error: ' + error.message, type: 'error' });
          }
      }
      setIsPwLoading(false);
  };

  const isActive = (path: string) => location.pathname === path ? 'bg-primary text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700 hover:text-white';
  const sidebarPosition = dir === 'rtl' ? 'right-0' : 'left-0';
  const transformDirection = dir === 'rtl' ? 'translate-x-full' : '-translate-x-full';

  const canAccess = (feature: string) => {
      if (userRole === UserRole.ADMIN || userRole === UserRole.SUPERVISOR) return true;
      if (!permissions || permissions.length === 0) return true;
      return permissions.includes(feature);
  };

  return (
    <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible" dir={dir}>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {currentUserId && <GlobalNotificationListener userId={currentUserId} userRole={userRole} />}

      <div className={`fixed inset-0 z-20 transition-opacity bg-black opacity-50 lg:hidden ${isSidebarOpen ? 'block' : 'hidden'} print:hidden`} onClick={() => setIsSidebarOpen(false)}></div>

      <div className={`fixed inset-y-0 ${sidebarPosition} z-30 w-64 overflow-y-auto transition duration-300 transform bg-secondary lg:translate-x-0 lg:static lg:inset-0 ${isSidebarOpen ? 'translate-x-0' : transformDirection} print:hidden flex flex-col`}>
        <div className="flex items-center justify-between h-20 shadow-md bg-slate-900 flex-shrink-0 px-4">
          <h1 className="text-xl font-bold text-white flex items-center">
            <i className="fas fa-hospital-user mr-2 text-accent"></i>
            {t('app.name')}
          </h1>
        </div>

        <div className="p-4 border-b border-slate-700 mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
                 {userName.charAt(0).toUpperCase()}
             </div>
             <div>
                <p className="text-sm font-bold text-white truncate max-w-[120px]">{userName}</p>
                <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-blue-600 text-white rounded-full">
                    {t(`role.${userRole}`) || userRole}
                </span>
             </div>
          </div>
          <button onClick={() => setIsPasswordModalOpen(true)} className="mt-3 w-full py-1.5 text-xs bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition-colors">
             <i className="fas fa-key mr-1"></i> {t('pw.change')}
          </button>
        </div>

        <nav className="px-4 space-y-2 flex-1">
          <button onClick={toggleLanguage} className="flex items-center w-full px-4 py-2 mb-4 text-sm font-bold text-slate-300 bg-slate-800 rounded-lg hover:text-white hover:bg-slate-700 transition-colors">
              <i className="fas fa-globe w-6"></i>
              <span className="font-medium">{language === 'ar' ? 'English' : 'العربية'}</span>
          </button>

          {(userRole === UserRole.ADMIN || userRole === UserRole.SUPERVISOR) && (
            <>
              <Link to="/supervisor" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/supervisor')}`}>
                <i className="fas fa-chart-line w-6"></i>
                <span className="font-medium">{t('nav.dashboard')}</span>
              </Link>
              <Link to="/schedule-builder" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/schedule-builder')}`}>
                <i className="fas fa-calendar-alt w-6"></i>
                <span className="font-medium">{t('nav.scheduleBuilder')}</span>
              </Link>
              <Link to="/supervisor/rotation" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/supervisor/rotation')}`}>
                <i className="fas fa-sync-alt w-6"></i>
                <span className="font-medium">{t('nav.rotation')}</span>
              </Link>
              <Link to="/reports" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/reports')}`}>
                <i className="fas fa-file-contract w-6"></i>
                <span className="font-medium">{t('nav.reports')}</span>
              </Link>
              <Link to="/attendance" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/attendance')}`}>
                <i className="fas fa-robot w-6"></i>
                <span className="font-medium">{t('nav.attendance')}</span>
              </Link>
              {/* Added Archiver Link */}
              <Link to="/supervisor/archive" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/supervisor/archive')}`}>
                <i className="fas fa-archive w-6"></i>
                <span className="font-medium">أرشيف البيانات</span>
              </Link>
            </>
          )}

          {(userRole === UserRole.USER) && (
            <>
              <Link to="/user" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/user')}`}>
                <i className="fas fa-user-clock w-6"></i>
                <span className="font-medium">{t('nav.dashboard')}</span>
              </Link>
              {canAccess('schedule') && (
                  <Link to="/user/schedule" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/user/schedule')}`}>
                    <i className="fas fa-calendar-alt w-6"></i>
                    <span className="font-medium">{t('user.tab.schedule')}</span>
                  </Link>
              )}
            </>
          )}

          {(userRole === UserRole.DOCTOR) && (
            <>
              <Link to="/doctor" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/doctor')}`}>
                <i className="fas fa-user-md w-6"></i>
                <span className="font-medium">{t('doc.station')}</span>
              </Link>
            </>
          )}

          <div className="pt-4 mt-4 border-t border-slate-700">
             <p className="px-4 text-xs font-bold text-slate-500 mb-2">{t('nav.sharedTools')}</p>
             
             {canAccess('appointments') && (
                 <Link to="/appointments" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/appointments')}`}>
                    <i className="fas fa-calendar-check w-6 text-indigo-400"></i>
                    <span className="font-medium">{t('nav.appointments')}</span>
                 </Link>
             )}

             {canAccess('communications') && (
                 <Link to="/communications" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/communications')}`}>
                    <i className="fas fa-comments w-6 text-blue-400"></i>
                    <span className="font-medium">{t('nav.communications')}</span>
                 </Link>
             )}

             {canAccess('inventory') && (
                 <Link to="/inventory" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/inventory')}`}>
                    <i className="fas fa-boxes w-6 text-emerald-400"></i>
                    <span className="font-medium">{t('nav.inventory')}</span>
                 </Link>
             )}
             
             {canAccess('tasks') && (
                 <Link to="/tasks" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/tasks')}`}>
                    <i className="fas fa-tasks w-6 text-amber-400"></i>
                    <span className="font-medium">{t('nav.tasks')}</span>
                 </Link>
             )}

             {canAccess('tech_support') && (
                 <Link to="/tech-support" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/tech-support')}`}>
                    <i className="fas fa-headset w-6 text-cyan-400"></i>
                    <span className="font-medium">{t('nav.techSupport')}</span>
                 </Link>
             )}

             {canAccess('hr_assistant') && (
                 <Link to="/hr-assistant" className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive('/hr-assistant')}`}>
                    <i className="fas fa-user-tie w-6 text-pink-400"></i>
                    <span className="font-medium">HR Assistant</span>
                 </Link>
             )}
          </div>

        </nav>
        
        <div className="p-4 bg-slate-900 mt-auto flex-shrink-0">
            <button onClick={handleLogout} className="flex items-center justify-center w-full px-4 py-2 text-sm font-bold text-white transition-colors bg-danger rounded-lg hover:bg-red-700">
                <i className="fas fa-sign-out-alt w-6"></i>
                {t('logout')}
            </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden print:overflow-visible print:h-auto">
        <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm lg:hidden print:hidden">
            <div className="text-xl font-bold text-secondary">{t('app.name')}</div>
            <button onClick={() => setIsSidebarOpen(true)} className="text-secondary focus:outline-none">
                <i className="fas fa-bars fa-lg"></i>
            </button>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-100 p-4 lg:p-8 print:bg-white print:p-0 print:overflow-visible">
            {children}
        </main>
      </div>

      <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} title={t('pw.change')}>
          <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">{t('pw.current')}</label>
                  <input type="password" required className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="********" />
              </div>
              <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">{t('pw.new')}</label>
                  <input type="password" required className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 chars" />
              </div>
              <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">{t('pw.confirm')}</label>
                  <input type="password" required className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="********" />
              </div>
              <button type="submit" disabled={isPwLoading} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-slate-700 disabled:opacity-70 transition-all">
                  {isPwLoading ? <i className="fas fa-spinner fa-spin"></i> : t('pw.change')}
              </button>
          </form>
      </Modal>
    </div>
  );
};

export default Layout;
