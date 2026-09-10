
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
import { useAttendanceStatus } from '../hooks/useAttendanceStatus';
import { useDepartment } from '../contexts/DepartmentContext';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import DepartmentChatWidget from './DepartmentChatWidget';
import { sendMobileNotification, syncUserPushSubscription } from '../services/notificationService';
import { PWAInstallButton } from './PWAInstallButton';
import { MobileNotificationModal } from './MobileNotificationModal';

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

const GlobalNotificationListener: React.FC<{ userId: string, userRole: string, departmentId: string | null }> = ({ userId, userRole, departmentId }) => {
    const isFirstRun = useRef(true);
    const { t } = useLanguage();

    useEffect(() => {
        const t = setTimeout(() => { isFirstRun.current = false; }, 3000); 
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (!userId || !departmentId) return;

        // Listen to the new notifications collection
        const qNotif = query(collection(db, 'notifications'), where('departmentId', '==', departmentId), orderBy('createdAt', 'desc'), limit(1));
        
        const unsubNotif = onSnapshot(qNotif, (snap: any) => {
            if (isFirstRun.current) return;
            snap.docChanges().forEach((change: any) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    
                    // Check if notification is for me
                    let isForMe = false;
                    if (data.userId === userId) isForMe = true;
                    else if (!data.userId && data.targetRole === userRole) isForMe = true;
                    else if (!data.userId && !data.targetRole) isForMe = true;

                    if (isForMe && (!data.readBy || !data.readBy.includes(userId))) {
                        sendMobileNotification(data.title, {
                            body: data.message,
                            type: data.type === 'alert' ? 'alert' : 'normal',
                            tag: `notif-${change.doc.id}`
                        });
                        // Dispatch custom event to show toast in Layout
                        window.dispatchEvent(new CustomEvent('app-notification', { detail: { title: data.title, message: data.message } }));
                    }
                }
            });
        });

        return () => {
            unsubNotif();
        };
    }, [userId, userRole, departmentId]);

    return null;
};

const Layout: React.FC<LayoutProps> = ({ children, userRole, userName, permissions = [] }) => {
  const { t, language, toggleLanguage, dir } = useLanguage();
  const { isDark } = useTheme();
  const { departments, selectedDepartmentId, setSelectedDepartmentId } = useDepartment();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_desktop_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Mobile push notifications center modal state
  const [isMobileNotifModalOpen, setIsMobileNotifModalOpen] = useState(false);

  const toggleDesktopSidebar = () => {
    setIsDesktopCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_desktop_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

  const navigate = useNavigate();
  const location = useLocation();
  const currentUserId = auth.currentUser?.uid;
  const isUserDashboard = location.pathname === '/user';
  const isSupervisorDashboard = location.pathname === '/supervisor';
  const isFullWidthDashboard = isUserDashboard || isSupervisorDashboard;

  // Fetch Attendance Status for Sidebar Logic
  const shiftStatus = useAttendanceStatus(currentUserId);
  const isOnDuty = shiftStatus.state === 'READY_OUT' || shiftStatus.state === 'LOCKED';

  // Change Password State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Sync Push Subscription on User Login
  useEffect(() => {
    if (currentUserId) {
      syncUserPushSubscription(currentUserId, selectedDepartmentId || undefined);
    }
  }, [currentUserId, selectedDepartmentId]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);
  const [isPwLoading, setIsPwLoading] = useState(false);

  useEffect(() => {
      const handleAppNotification = (e: any) => {
          setToast({ msg: `${t(e.detail.title)}: ${t(e.detail.message)}`, type: 'info' });
      };
      window.addEventListener('app-notification', handleAppNotification);
      return () => window.removeEventListener('app-notification', handleAppNotification);
  }, [t]);

  const handleLogout = async () => {
    const savedTheme = localStorage.getItem('app_theme');
    const savedThemeBackup = localStorage.getItem('theme');
    const savedLang = localStorage.getItem('app_lang');
    await signOut(auth);
    localStorage.clear(); 
    if (savedTheme) localStorage.setItem('app_theme', savedTheme);
    if (savedThemeBackup) localStorage.setItem('theme', savedThemeBackup);
    if (savedLang) localStorage.setItem('app_lang', savedLang);
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

  const isActive = (path: string, exact: boolean = true) => {
    if (exact) {
      return (location.pathname + location.search) === path || (path === location.pathname && !location.search)
        ? 'bg-primary text-white shadow-lg' 
        : 'text-slate-300 hover:bg-slate-700 hover:text-white';
    }
    return location.pathname === path ? 'bg-primary text-white shadow-lg' : 'text-slate-300 hover:bg-slate-700 hover:text-white';
  };
  const sidebarPosition = dir === 'rtl' ? 'right-0' : 'left-0';
  const transformDirection = dir === 'rtl' ? 'translate-x-full' : '-translate-x-full';
  const desktopWidthClass = isDesktopCollapsed ? 'lg:w-20' : 'lg:w-64';

  const canAccess = (feature: string) => {
      if (userRole === UserRole.ADMIN) return true;
      if (userRole === UserRole.CUSTODY_CLERK) {
          return feature === 'inventory' || feature === 'custody_distribution';
      }
      if (feature === 'inventory') {
          return Boolean(
              userRole === UserRole.ADMIN ||
              userRole === UserRole.SUPERVISOR ||
              userRole === UserRole.MANAGER ||
              permissions?.includes('inventory') || 
              permissions?.includes('custody_distribution')
          );
      }
      if (!permissions) return true; // Legacy users
      return permissions.includes(feature);
  };

  return (
    <div className={`flex h-screen overflow-hidden print:h-auto print:overflow-visible transition-colors duration-300 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-800'}`} dir={dir}>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {currentUserId && <GlobalNotificationListener userId={currentUserId} userRole={userRole} departmentId={selectedDepartmentId} />}

      {/* Mobile Backdrop */}
      <div className={`fixed inset-0 z-[9990] transition-opacity bg-black opacity-50 lg:hidden ${isSidebarOpen ? 'block pointer-events-auto' : 'hidden pointer-events-none'} print:hidden`} onClick={() => setIsSidebarOpen(false)}></div>

      {/* Sidebar (Desktop Collapsible & Mobile Drawer) */}
      <div className={`fixed inset-y-0 ${sidebarPosition} z-[9999] w-64 ${desktopWidthClass} transition-all duration-300 transform ${isDark ? 'bg-slate-950 border-r rtl:border-r-0 rtl:border-l border-slate-800/90' : 'bg-secondary'} lg:translate-x-0 lg:static lg:inset-0 ${isSidebarOpen ? 'translate-x-0 opacity-100 pointer-events-auto visible' : `${transformDirection} opacity-0 pointer-events-none invisible lg:opacity-100 lg:pointer-events-auto lg:visible`} print:hidden flex flex-col shadow-xl`}>
        <div className={`flex items-center justify-between h-16 shadow-md ${isDark ? 'bg-slate-900/90 border-b border-slate-800' : 'bg-slate-900'} flex-shrink-0 px-3`}>
          {!isDesktopCollapsed ? (
            <h1 className="text-lg font-bold text-white flex items-center truncate">
              <i className="fas fa-hospital-user mr-2 text-accent"></i>
              <span className="truncate">{t('app.name')}</span>
            </h1>
          ) : (
            <div className="mx-auto text-accent text-xl hidden lg:block" title={t('app.name')}>
              <i className="fas fa-hospital-user"></i>
            </div>
          )}
          
          <button 
            type="button"
            onClick={toggleDesktopSidebar}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title={isDesktopCollapsed ? "توسيع القائمة الجانبية (Expand)" : "طي القائمة الجانبية (Collapse)"}
          >
            <i className={`fas ${isDesktopCollapsed ? (dir === 'rtl' ? 'fa-angles-left' : 'fa-angles-right') : (dir === 'rtl' ? 'fa-angles-right' : 'fa-angles-left')} text-xs`}></i>
          </button>
        </div>

        {/* User Card */}
        <div className={`p-3 border-b border-slate-700/80 mb-2 flex-shrink-0 relative ${isDesktopCollapsed ? 'lg:px-2' : ''}`}>
          <div className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center' : 'justify-between'}`}>
              <div className="flex items-center gap-2.5">
                 <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-sm shrink-0" title={userName}>
                     {userName.charAt(0).toUpperCase()}
                 </div>
                 {!isDesktopCollapsed && (
                   <div className="overflow-hidden">
                      <p className="text-xs font-bold text-white truncate max-w-[110px]">{userName}</p>
                      <span className="inline-block px-1.5 py-0.2 text-[9px] font-medium bg-blue-600 text-white rounded-full">
                          {t(`role.${userRole}`) || userRole}
                      </span>
                   </div>
                 )}
              </div>
              {!isDesktopCollapsed && <NotificationBell userRole={userRole} />}
          </div>
          {!isDesktopCollapsed ? (
            <button onClick={() => setIsPasswordModalOpen(true)} className="mt-2.5 w-full py-1 text-[11px] bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition-colors">
               <i className="fas fa-key mr-1"></i> {t('pw.change')}
            </button>
          ) : (
            <button onClick={() => setIsPasswordModalOpen(true)} className="mt-2 w-full py-1 text-xs bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition-colors hidden lg:flex items-center justify-center" title={t('pw.change')}>
               <i className="fas fa-key"></i>
            </button>
          )}
        </div>

        <nav 
          className="px-2 space-y-1.5 flex-1 overflow-y-auto"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) {
              setIsSidebarOpen(false);
            }
          }}
        >
          {userRole === UserRole.ADMIN && !isDesktopCollapsed && (
              <div className="mb-3 px-1">
                  <select 
                      className="w-full bg-slate-800 text-slate-300 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                      value={selectedDepartmentId || ''}
                      onChange={(e) => setSelectedDepartmentId(e.target.value || null)}
                  >
                      <option value="">كل الأقسام (All)</option>
                      {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                  </select>
              </div>
          )}
          
          <button 
            onClick={toggleLanguage} 
            className={`flex items-center w-full ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2 mb-2 text-xs font-bold text-slate-300 bg-slate-800 rounded-lg hover:text-white hover:bg-slate-700 transition-colors`}
            title={language === 'ar' ? 'English' : 'العربية'}
          >
              <i className="fas fa-globe w-5 text-center"></i>
              {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{language === 'ar' ? 'English' : 'العربية'}</span>}
          </button>

          {(userRole === UserRole.ADMIN || userRole === UserRole.SUPERVISOR || userRole === UserRole.MANAGER) && (
            <>
              {userRole === UserRole.ADMIN && (
                  <Link to="/admin/departments" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/admin/departments')}`} title="Departments">
                    <i className="fas fa-building w-5 text-center text-purple-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">Departments</span>}
                  </Link>
              )}
              <Link to="/supervisor" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/supervisor')}`} title={t('nav.dashboard')}>
                <i className="fas fa-chart-line w-5 text-center"></i>
                {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.dashboard')}</span>}
              </Link>
              {canAccess('sup_schedule_builder') && (
                  <Link to="/schedule-builder" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/schedule-builder')}`} title={t('nav.scheduleBuilder')}>
                    <i className="fas fa-calendar-alt w-5 text-center"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.scheduleBuilder')}</span>}
                  </Link>
              )}
              {canAccess('sup_rotation') && (
                  <Link to="/supervisor/rotation" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/supervisor/rotation')}`} title={t('nav.rotation')}>
                    <i className="fas fa-sync-alt w-5 text-center"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.rotation')}</span>}
                  </Link>
              )}
              {canAccess('sup_penalties') && (
                  <Link to="/supervisor/penalties" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/supervisor/penalties')}`} title={t('nav.penalties')}>
                    <i className="fas fa-gavel w-5 text-center text-amber-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.penalties')}</span>}
                  </Link>
              )}
              {canAccess('sup_reports') && (
                  <Link to="/reports" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/reports')}`} title={t('nav.reports')}>
                    <i className="fas fa-file-contract w-5 text-center text-blue-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.reports')}</span>}
                  </Link>
              )}
              {canAccess('sup_attendance') && (
                  <Link to="/attendance" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/attendance')}`} title={t('nav.attendance')}>
                    <i className="fas fa-robot w-5 text-center text-emerald-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.attendance')}</span>}
                  </Link>
              )}
              {canAccess('sup_archive') && (
                  <Link to="/supervisor/archive" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/supervisor/archive')}`} title={t('nav.dataArchive')}>
                    <i className="fas fa-archive w-5 text-center text-slate-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.dataArchive')}</span>}
                  </Link>
              )}
            </>
          )}

          {(userRole === UserRole.USER) && (
            <>
              <Link to="/user" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/user')}`} title={t('nav.dashboard')}>
                <i className="fas fa-user-clock w-5 text-center"></i>
                {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.dashboard')}</span>}
              </Link>
              {canAccess('schedule') && (
                  <Link to="/user/schedule" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/user/schedule')}`} title={t('user.tab.schedule')}>
                    <i className="fas fa-calendar-alt w-5 text-center"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('user.tab.schedule')}</span>}
                  </Link>
              )}
              <Link to="/user/penalties" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/user/penalties')}`} title={t('nav.penalties')}>
                <i className="fas fa-gavel w-5 text-center text-amber-400"></i>
                {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.penalties')}</span>}
              </Link>
              <Link to="/department-bookings" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/department-bookings')}`} title="Department Bookings">
                <i className="fas fa-calendar-check w-5 text-center"></i>
                {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">Department Bookings</span>}
              </Link>
            </>
          )}

          {(userRole === UserRole.DOCTOR) && (
            <>
              <Link to="/doctor" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/doctor')}`} title={t('doc.station')}>
                <i className="fas fa-user-md w-5 text-center"></i>
                {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('doc.station')}</span>}
              </Link>
            </>
          )}

          {(userRole !== UserRole.CATH_LAB) && (
            <div className="pt-2 mt-2 border-t border-slate-700/80">
             {!isDesktopCollapsed && <p className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('nav.sharedTools')}</p>}
             
             {canAccess('sup_schedule_builder') && (
                  <Link to="/department-bookings" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/department-bookings')}`} title="Department Bookings">
                    <i className="fas fa-calendar-check w-5 text-center text-sky-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">Department Bookings</span>}
                  </Link>
             )}

             {canAccess('radiology_log') && (
               <Link to="/radiology-logbook" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/radiology-logbook')}`} title={t('nav.radiologyLog')}>
                  <i className="fas fa-book-medical w-5 text-center text-amber-400"></i>
                  {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.radiologyLog')}</span>}
               </Link>
             )}
              
             {(userRole === UserRole.ADMIN || userRole === UserRole.SUPERVISOR || userRole === UserRole.MANAGER || userRole === UserRole.DOCTOR || userRole === UserRole.USER) && canAccess('handover') && canAccess('communications') && (
                 <Link to="/communications" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/communications')}`} title={t('nav.handover')}>
                    <i className="fas fa-handshake w-5 text-center text-blue-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.handover')}</span>}
                 </Link>
             )}

             {(userRole === UserRole.ADMIN || userRole === UserRole.SUPERVISOR || userRole === UserRole.MANAGER || userRole === UserRole.DOCTOR || userRole === UserRole.USER) && (
                 <Link to="/supervisor/oncall" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/supervisor/oncall')}`} title="On-Call Management">
                    <i className="fas fa-phone-volume w-5 text-center text-emerald-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">On-Call Management</span>}
                 </Link>
             )}

             {canAccess('inventory') && (
                 <Link to="/inventory" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/inventory', false)}`} title={t('nav.inventory')}>
                    <i className="fas fa-boxes w-5 text-center text-emerald-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.inventory')}</span>}
                 </Link>
             )}
            </div>
          )}

          {userRole !== UserRole.CUSTODY_CLERK && canAccess('catheter_supplies') && (
          <div className={userRole === UserRole.CATH_LAB ? "pt-2 mt-2 border-t border-slate-700/80" : ""}>
            <Link to="/cath-lab-usage" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/cath-lab-usage')}`} title={t('nav.cathLabUsage')}>
               <i className="fas fa-heartbeat w-5 text-center text-rose-400"></i>
               {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.cathLabUsage')}</span>}
            </Link>
          </div>
          )}
             
          {(userRole !== UserRole.CATH_LAB && userRole !== UserRole.CUSTODY_CLERK) && (
            <>
             {canAccess('tasks') && (
                 <Link to="/tasks" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/tasks')}`} title={t('nav.tasks')}>
                    <i className="fas fa-tasks w-5 text-center text-amber-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.tasks')}</span>}
                 </Link>
             )}

             {canAccess('tech_support') && (
                 <Link to="/tech-support" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/tech-support')}`} title={t('nav.techSupport')}>
                    <i className="fas fa-headset w-5 text-center text-cyan-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">{t('nav.techSupport')}</span>}
                 </Link>
             )}

             {canAccess('hr_assistant') && (
                 <Link to="/hr-assistant" className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'px-3'} py-2.5 rounded-lg transition-colors text-xs ${isActive('/hr-assistant')}`} title="HR Assistant">
                    <i className="fas fa-user-tie w-5 text-center text-pink-400"></i>
                    {!isDesktopCollapsed && <span className="font-medium mr-2 ml-2">HR Assistant</span>}
                 </Link>
             )}
            </>
          )}

        </nav>
        
        <div className={`p-3 border-t mt-auto flex-shrink-0 ${isDark ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-900 border-slate-800'}`}>
            <div className="mb-2">
                <ThemeToggle className="w-full justify-center !rounded-xl !py-2" showLabel={!isDesktopCollapsed} />
            </div>
            <button 
              onClick={handleLogout} 
              className={`flex items-center ${isDesktopCollapsed ? 'lg:justify-center px-2' : 'justify-center px-3'} w-full py-2 text-xs font-bold text-white transition-colors bg-danger rounded-lg hover:bg-red-700`}
              title={t('logout')}
            >
                <i className="fas fa-sign-out-alt w-5 text-center"></i>
                {!isDesktopCollapsed && <span className="mr-2 ml-2">{t('logout')}</span>}
            </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden print:overflow-visible print:h-auto min-w-0">
        {/* Top Header Bar for Desktop and Mobile */}
        <header className={`flex items-center justify-between px-3 sm:px-6 py-2.5 transition-colors duration-300 ${isDark ? 'bg-slate-900/95 border-b border-slate-800 text-white' : 'bg-white border-b border-slate-200 text-slate-800'} shadow-xs print:hidden shrink-0`}>
            <div className="flex items-center gap-2.5 sm:gap-3">
                <button 
                  type="button"
                  onClick={toggleDesktopSidebar} 
                  className={`hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-lg ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} transition-colors cursor-pointer`}
                  title={isDesktopCollapsed ? "توسيع القائمة الجانبية (Expand)" : "طي القائمة الجانبية (Collapse)"}
                >
                    <i className="fas fa-bars text-sm"></i>
                </button>
                <button 
                  type="button"
                  onClick={() => setIsSidebarOpen(true)} 
                  className={`lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-lg ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} transition-colors focus:outline-none`}
                >
                    <i className="fas fa-bars text-sm"></i>
                </button>
                <div className={`text-xs sm:text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'} flex items-center gap-2 truncate`}>
                   <span className="truncate">{t('app.name')}</span>
                </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5">
                {userRole === UserRole.ADMIN && (
                    <div className="hidden sm:block">
                        <select 
                            className={`border rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                              isDark 
                                ? 'bg-slate-800 text-slate-200 border-slate-700' 
                                : 'bg-slate-50 text-slate-700 border-slate-300'
                            }`}
                            value={selectedDepartmentId || ''}
                            onChange={(e) => setSelectedDepartmentId(e.target.value || null)}
                        >
                            <option value="">كل الأقسام (All)</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Theme Toggle Button */}
                <ThemeToggle />

                {/* In-App PWA Install Button */}
                <PWAInstallButton />

                {/* Mobile Background Notifications Center */}
                <button
                  type="button"
                  onClick={() => setIsMobileNotifModalOpen(true)}
                  className={`px-2.5 h-9 sm:h-10 rounded-2xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs ${
                    isDark
                      ? 'bg-slate-800/90 text-blue-400 border-slate-700 hover:bg-slate-750'
                      : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                  }`}
                  title={language === 'ar' ? 'إشعارات الجوال المباشرة حتى والتطبيق مقفل 📱' : 'Mobile Push Notifications'}
                >
                  <i className="fas fa-bell text-xs"></i>
                  <span className="hidden md:inline">{language === 'ar' ? 'إشعارات الجوال' : 'Mobile Alerts'}</span>
                </button>

                {/* Language Switcher */}
                <button
                  type="button"
                  onClick={toggleLanguage}
                  className={`px-2.5 sm:px-3 h-9 sm:h-10 rounded-2xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs ${
                    isDark
                      ? 'bg-slate-800/90 text-cyan-300 border-slate-700 hover:bg-slate-750'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                  title="Switch Language / تغيير اللغة"
                >
                  <i className="fas fa-globe text-xs"></i>
                  <span className="hidden xs:inline">{language === 'ar' ? 'English' : 'عربي'}</span>
                </button>

                {/* Change Password Button */}
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(true)}
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center border transition-colors cursor-pointer shadow-xs ${
                    isDark
                      ? 'bg-slate-800/90 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-750'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                  title={t('pw.change')}
                >
                  <i className="fas fa-key text-xs"></i>
                </button>
            </div>
        </header>

        <main className={`flex-1 overflow-x-hidden overflow-y-auto transition-colors duration-300 ${isFullWidthDashboard ? 'p-0' : (isDark ? 'bg-slate-900 text-slate-100 p-3 sm:p-4 lg:p-6' : 'bg-slate-100 text-slate-800 p-3 sm:p-4 lg:p-6')} print:bg-white print:p-0 print:overflow-visible min-w-0`}>
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

      {/* Persistent Floating Department Live Chat Widget */}
      <DepartmentChatWidget />

      {/* Mobile Push Notifications Center Modal */}
      <MobileNotificationModal
        isOpen={isMobileNotifModalOpen}
        onClose={() => setIsMobileNotifModalOpen(false)}
      />
    </div>
  );
};

export default Layout;
