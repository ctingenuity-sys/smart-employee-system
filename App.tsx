
import React, { useEffect, useState, Suspense, createContext, useContext } from 'react';
// @ts-ignore
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { auth, db } from './firebase';
import Loading from './components/Loading';
import ErrorBoundary from './components/ErrorBoundary';
// @ts-ignore
import ReloadPrompt from './components/ReloadPrompt';
import { UserRole } from './types';
import { LanguageProvider } from './contexts/LanguageContext';
// @ts-ignore
import { doc, getDoc, collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import Layout from './components/Layout';

// --- Offline Punch Sync Logic ---
const OFFLINE_PUNCHES_KEY = 'offline_punches';

const syncOfflinePunches = async () => {
    if (!navigator.onLine) return;
    const existing = JSON.parse(localStorage.getItem(OFFLINE_PUNCHES_KEY) || '[]');
    if (existing.length === 0) return;

    const successfulSyncs: number[] = [];
    
    for (let i = 0; i < existing.length; i++) {
        const p = existing[i];
        try {
            const payload = { ...p };
            delete payload._offlineTimestamp;
            
            if (payload.clientTimestampMs) {
                payload.clientTimestamp = Timestamp.fromMillis(payload.clientTimestampMs);
                delete payload.clientTimestampMs;
            }
            
            payload.timestamp = serverTimestamp();
            payload.isOfflineSync = true;

            await addDoc(collection(db, 'attendance_logs'), payload);
            successfulSyncs.push(i);
        } catch (e) {
            console.error("Failed to sync offline punch", e);
        }
    }
    
    if (successfulSyncs.length > 0) {
        const remaining = existing.filter((_: any, idx: number) => !successfulSyncs.includes(idx));
        localStorage.setItem(OFFLINE_PUNCHES_KEY, JSON.stringify(remaining));
        window.dispatchEvent(new Event('offline-sync-complete'));
    }
};

// --- Lazy Loading Pages (Code Splitting) ---
const Login = React.lazy(() => import('./pages/Login'));
const SupervisorDashboard = React.lazy(() => import('./pages/SupervisorDashboard'));
const SupervisorAttendance = React.lazy(() => import('./pages/supervisor/SupervisorAttendance'));
const SupervisorEmployees = React.lazy(() => import('./pages/supervisor/SupervisorEmployees'));
const SupervisorSwaps = React.lazy(() => import('./pages/supervisor/SupervisorSwaps'));
const SupervisorLeaves = React.lazy(() => import('./pages/supervisor/SupervisorLeaves'));
const SupervisorMarket = React.lazy(() => import('./pages/supervisor/SupervisorMarket'));
const SupervisorLocations = React.lazy(() => import('./pages/supervisor/SupervisorLocations'));
const SupervisorHistory = React.lazy(() => import('./pages/supervisor/SupervisorHistory'));
const SupervisorPerformance = React.lazy(() => import('./pages/supervisor/SupervisorPerformance'));
const SupervisorRotation = React.lazy(() => import('./pages/supervisor/SupervisorRotation'));
const PanicReportsPage = React.lazy(() => import('./pages/supervisor/PanicReportsPage'));

// NEW ADMIN PAGE
const DepartmentsPage = React.lazy(() => import('./pages/admin/DepartmentsPage'));

// NEW PAGES
const DeviceInventory = React.lazy(() => import('./pages/supervisor/DeviceInventory'));
const FMSReports = React.lazy(() => import('./pages/supervisor/FMSReports'));
const RoomReports = React.lazy(() => import('./pages/supervisor/RoomReports'));

const UserDashboard = React.lazy(() => import('./pages/UserDashboard'));
const UserSchedule = React.lazy(() => import('./pages/UserSchedule'));
const UserRequests = React.lazy(() => import('./pages/UserRequests'));
const UserMarket = React.lazy(() => import('./pages/UserMarket'));
const UserIncoming = React.lazy(() => import('./pages/UserIncoming'));
const UserHistory = React.lazy(() => import('./pages/UserHistory'));
const UserProfile = React.lazy(() => import('./pages/UserProfile'));
const UserPerformance = React.lazy(() => import('./pages/UserPerformance'));

const ScheduleBuilder = React.lazy(() => import('./pages/ScheduleBuilder'));
const Reports = React.lazy(() => import('./pages/Reports'));
const AttendanceAnalyzer = React.lazy(() => import('./pages/AttendanceAnalyzer'));
const InventoryPage = React.lazy(() => import('./pages/InventoryPage'));
const CommunicationPage = React.lazy(() => import('./pages/CommunicationPage'));
const TasksPage = React.lazy(() => import('./pages/TasksPage'));
const TechSupportPage = React.lazy(() => import('./pages/TechSupportPage'));
const HRAssistantPage = React.lazy(() => import('./pages/HRAssistantPage'));
const DoctorDashboard = React.lazy(() => import('./pages/DoctorDashboard'));
const AttendancePage = React.lazy(() => import('./pages/AttendancePage'));
const AppointmentsPage = React.lazy(() => import('./pages/AppointmentsPage'));
const PatientTicket = React.lazy(() => import('./pages/PatientTicket'));
const DataArchiver = React.lazy(() => import('./pages/DataArchiver')); 
const DepartmentBookings = React.lazy(() => import('./pages/DepartmentBookings'));
const CTConsentPage = React.lazy(() => import('./pages/CTConsentPage'));

const ModalityLogbook = React.lazy(() => import('./pages/ModalityLogbook'));

// --- Auth Context ---
interface AuthContextType {
  user: any;
  role: string | null;
  userName: string;
  departmentId?: string; // NEW
  loading: boolean;
  permissions: string[];
}
const AuthContext = createContext<AuthContextType>({ user: null, role: null, userName: '', loading: true, permissions: [] });
export const useAuth = () => useContext(AuthContext);

// --- Auth Provider ---
const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [departmentId, setDepartmentId] = useState<string|undefined>(undefined);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    const handleOnline = () => {
        syncOfflinePunches();
    };
    window.addEventListener('online', handleOnline);
    syncOfflinePunches();

    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        // Optimistic check
        const cachedRole = localStorage.getItem("role");
        const cachedName = localStorage.getItem("username");
        if(cachedRole) setRole(cachedRole);
        if(cachedName) setUserName(cachedName);
        setUser(currentUser);

        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const data: any = userSnap.data();
            const userRole = data?.role || null;
            const name = data?.name || data?.email;
            
            setRole(userRole);
            setUserName(name);
            setDepartmentId(data?.departmentId);
            setPermissions(data?.permissions || []); 
            
            localStorage.setItem("role", userRole);
            localStorage.setItem("username", name);
          } else {
            setRole(null);
            setUserName(currentUser.email || '');
            setPermissions([]);
          }
        } catch (e) {
          console.error('Error fetching role', e);
          setRole(null);
        }
      } else {
        setUser(null);
        setRole(null);
        setUserName('');
        setDepartmentId(undefined);
        setPermissions([]);
        localStorage.removeItem("role");
        localStorage.removeItem("username");
      }
      setLoading(false);
    });

    return () => {
        unsubscribe();
        window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100">
        <Loading />
      </div>
    );

  return (
      <AuthContext.Provider value={{ user, role, userName, departmentId, loading, permissions }}>
          {children}
      </AuthContext.Provider>
  );
};

// --- Protected Route Component ---
interface ProtectedRouteProps {
  children?: React.ReactNode; 
  allowedRoles?: any[]; 
  requiredPermission?: string; 
}

const ProtectedRoute = ({ children, allowedRoles, requiredPermission }: ProtectedRouteProps) => {
    const { user, role, userName, permissions } = useAuth();

    if (!user) return <Navigate to="/login" replace />;
    
    // FIX: Strictly check if role exists when allowedRoles are defined
    if (allowedRoles) {
        if (!role || !allowedRoles.includes(role)) {
            if (role === UserRole.USER) return <Navigate to="/user" replace />;
            if (role === UserRole.DOCTOR) return <Navigate to="/doctor" replace />;
            if (role === UserRole.MANAGER || role === UserRole.SUPERVISOR) return <Navigate to="/supervisor" replace />;
            return <Navigate to="/login" replace />;
        }
    }

    if ((role === UserRole.USER || role === UserRole.SUPERVISOR || role === UserRole.MANAGER) && requiredPermission && permissions) {
        if (!permissions.includes(requiredPermission)) {
             return (
                 <Layout userRole={role || ''} userName={userName} permissions={permissions}>
                    <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6">
                        <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                            <i className="fas fa-lock text-3xl text-slate-400"></i>
                        </div>
                        <h2 className="text-xl font-bold text-slate-700">Access Restricted</h2>
                        <p className="text-slate-500 mt-2">You do not have permission to view this page. Contact your administrator.</p>
                    </div>
                 </Layout>
             );
        }
    }

    return (
        <Layout userRole={role || ''} userName={userName} permissions={permissions}>
            <Suspense fallback={<div className="p-8"><Loading /></div>}>
                {children}
            </Suspense>
        </Layout>
    );
};

const AppRoutes: React.FC = () => {
  const { user, role } = useAuth();

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ErrorBoundary>
        <ReloadPrompt />
        <Routes>
          {/* Public Routes */}
          <Route path="/ticket/:id" element={<Suspense fallback={<Loading />}><PatientTicket /></Suspense>} />

          <Route
            path="/login"
            element={
              <Suspense fallback={<Loading />}>
                  {!user ? <Login /> : 
                  role === UserRole.DOCTOR ? <Navigate to="/doctor" replace /> :
                  role === UserRole.USER ? <Navigate to="/user" replace /> :
                  role === UserRole.ADMIN || role === UserRole.SUPERVISOR || role === UserRole.MANAGER ? <Navigate to="/supervisor" replace /> :
                  <div className="flex items-center justify-center h-screen bg-slate-100">
                      <div className="text-center p-8 bg-white rounded-2xl shadow-xl">
                          <i className="fas fa-user-slash text-4xl text-red-500 mb-4"></i>
                          <h2 className="text-xl font-bold text-slate-800">Account Not Found</h2>
                          <p className="text-slate-500 mt-2">Your account details are missing. Please contact the administrator.</p>
                          <button onClick={() => auth.signOut()} className="mt-6 px-6 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700">
                              Logout
                          </button>
                      </div>
                  </div>
                  }
              </Suspense>
            }
          />

          {/* Supervisor Routes */}
          <Route path="/supervisor" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]}><SupervisorDashboard /></ProtectedRoute>} />
          <Route path="/supervisor/attendance" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_attendance"><SupervisorAttendance /></ProtectedRoute>} />
          <Route path="/supervisor/employees" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_employees"><SupervisorEmployees /></ProtectedRoute>} />
          <Route path="/supervisor/swaps" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_swaps"><SupervisorSwaps /></ProtectedRoute>} />
          <Route path="/supervisor/leaves" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_leaves"><SupervisorLeaves /></ProtectedRoute>} />
          <Route path="/supervisor/market" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_market"><SupervisorMarket /></ProtectedRoute>} />
          <Route path="/supervisor/locations" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_locations"><SupervisorLocations /></ProtectedRoute>} />
          <Route path="/supervisor/history" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_history"><SupervisorHistory /></ProtectedRoute>} />
          <Route path="/supervisor/performance" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_performance"><SupervisorPerformance /></ProtectedRoute>} />
          <Route path="/supervisor/panic-reports" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_panic"><PanicReportsPage /></ProtectedRoute>} />
          <Route path="/supervisor/rotation" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_rotation"><SupervisorRotation /></ProtectedRoute>} />
          
          {/* --- Departments Management (ADMIN ONLY) --- */}
          <Route path="/admin/departments" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><DepartmentsPage /></ProtectedRoute>} />

          {/* NEW ROUTES FOR DEVICES, FMS, ROOMS */}
          <Route path="/supervisor/devices" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_devices"><DeviceInventory /></ProtectedRoute>} />
          <Route path="/supervisor/fms" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_fms"><FMSReports /></ProtectedRoute>} />
          <Route path="/supervisor/rooms" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_rooms"><RoomReports /></ProtectedRoute>} />

          {/* NEW: Data Archiver Route */}
          <Route path="/supervisor/archive" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_archive"><DataArchiver /></ProtectedRoute>} />

          {/* --- MODALITY LOGBOOKS (New Pages) --- */}
          <Route path="/logbook/mri" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_logbooks"><ModalityLogbook type="MRI" title="MRI Department" colorTheme="blue" /></ProtectedRoute>} />
          <Route path="/logbook/ct" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_logbooks"><ModalityLogbook type="CT" title="CT Department" colorTheme="emerald" /></ProtectedRoute>} />
          <Route path="/logbook/us" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_logbooks"><ModalityLogbook type="US" title="Ultrasound" colorTheme="indigo" /></ProtectedRoute>} />
          <Route path="/logbook/xray" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_logbooks"><ModalityLogbook type="X-RAY" title="X-Ray & General" colorTheme="slate" /></ProtectedRoute>} />

          {/* User Routes */}
          <Route path="/user" element={<ProtectedRoute allowedRoles={[UserRole.USER]}><UserDashboard /></ProtectedRoute>} />
          <Route path="/user/schedule" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="schedule"><UserSchedule /></ProtectedRoute>} />
          <Route path="/user/requests" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="requests"><UserRequests /></ProtectedRoute>} />
          <Route path="/user/market" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="market"><UserMarket /></ProtectedRoute>} />
          <Route path="/user/incoming" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="incoming"><UserIncoming /></ProtectedRoute>} />
          <Route path="/user/history" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="history"><UserHistory /></ProtectedRoute>} />
          <Route path="/user/profile" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="profile"><UserProfile /></ProtectedRoute>} />
          <Route path="/user/performance" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="performance"><UserPerformance /></ProtectedRoute>} />

          {/* Other Routes */}
          <Route path="/schedule-builder" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_schedule_builder"><ScheduleBuilder /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_reports"><Reports /></ProtectedRoute>} />
          <Route path="/attendance" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.MANAGER]} requiredPermission="sup_attendance"><AttendanceAnalyzer /></ProtectedRoute>} />

          <Route path="/attendance-punch" element={
              <Suspense fallback={<Loading />}>
                  {user ? <AttendancePage /> : <Navigate to="/login" replace />}
              </Suspense>
          } />

          <Route path="/doctor" element={<ProtectedRoute allowedRoles={[UserRole.DOCTOR]}><DoctorDashboard /></ProtectedRoute>} />

          {/* Shared Routes with Permissions */}
          <Route path="/communications" element={<ProtectedRoute requiredPermission="communications"><CommunicationPage /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute requiredPermission="inventory"><InventoryPage /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute requiredPermission="tasks"><TasksPage /></ProtectedRoute>} />
          <Route path="/tech-support" element={<ProtectedRoute requiredPermission="tech_support"><TechSupportPage /></ProtectedRoute>} />
          <Route path="/hr-assistant" element={<ProtectedRoute requiredPermission="hr_assistant"><HRAssistantPage /></ProtectedRoute>} />
          <Route path="/appointments" element={<ProtectedRoute requiredPermission="appointments"><AppointmentsPage /></ProtectedRoute>} />
          <Route path="/department-bookings" element={<ProtectedRoute requiredPermission="appointments"><DepartmentBookings /></ProtectedRoute>} />
          <Route path="/ct-consent" element={<ProtectedRoute requiredPermission="appointments"><CTConsentPage /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ErrorBoundary>
    </Router>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </LanguageProvider>
  );
};

export default App;
