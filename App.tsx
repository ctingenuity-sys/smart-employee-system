
import React, { useEffect, useState, Suspense, createContext, useContext } from 'react';
// @ts-ignore
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { auth, db } from './firebase';
import Loading from './components/Loading';
import { UserRole } from './types';
import { LanguageProvider } from './contexts/LanguageContext';
// @ts-ignore
import { doc, getDoc } from 'firebase/firestore';
import Layout from './components/Layout';

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
const PanicReportsPage = React.lazy(() => import('./pages/supervisor/PanicReportsPage'));

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

const ModalityLogbook = React.lazy(() => import('./pages/ModalityLogbook')); // NEW

// --- Auth Context ---
interface AuthContextType {
  user: any;
  role: string | null;
  userName: string;
  loading: boolean;
  permissions: string[];
}
const AuthContext = createContext<AuthContextType>({ user: null, role: null, userName: '', loading: true, permissions: [] });
const useAuth = () => useContext(AuthContext);

// --- Auth Provider ---
const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
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
            setPermissions(data?.permissions || []); // Load permissions
            
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
        setPermissions([]);
        localStorage.removeItem("role");
        localStorage.removeItem("username");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100">
        <Loading />
      </div>
    );

  return (
      <AuthContext.Provider value={{ user, role, userName, loading, permissions }}>
          {children}
      </AuthContext.Provider>
  );
};

// --- Protected Route Component ---
interface ProtectedRouteProps {
  children?: React.ReactNode; 
  allowedRoles?: any[]; 
  requiredPermission?: string; // New Prop for specific feature check
}

const ProtectedRoute = ({ children, allowedRoles, requiredPermission }: ProtectedRouteProps) => {
    const { user, role, userName, permissions } = useAuth();

    if (!user) return <Navigate to="/login" replace />;
    
    // Role Check
    if (allowedRoles && role && !allowedRoles.includes(role)) {
        if (role === UserRole.USER) return <Navigate to="/user" replace />;
        if (role === UserRole.DOCTOR) return <Navigate to="/doctor" replace />;
        return <Navigate to="/login" replace />;
    }

    // Permission Check (Only for Users, Admins/Supervisors/Doctors usually have full access or distinct roles)
    // If a permission is required AND the user is a standard 'user', check the list.
    // If permissions list is empty/undefined for a user, we assume they have access (backward compatibility),
    // OR we can default to restricted. Let's assume restricted if permissions array exists but doesn't contain it.
    // However, to keep "maintain all other functions" for existing users without data migration, 
    // we should strictly check ONLY if permissions array is explicitly set. 
    // Better strategy: If the user doc HAS a permissions array, enforce it. If not, allow all.
    
    if (role === UserRole.USER && requiredPermission && permissions && permissions.length > 0) {
        if (!permissions.includes(requiredPermission)) {
             return (
                 <Layout userRole={role || ''} userName={userName} permissions={permissions}>
                    <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6">
                        <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                            <i className="fas fa-lock text-3xl text-slate-400"></i>
                        </div>
                        <h2 className="text-xl font-bold text-slate-700">Access Restricted</h2>
                        <p className="text-slate-500 mt-2">You do not have permission to view this page. Contact your supervisor.</p>
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
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/ticket/:id" element={<Suspense fallback={<Loading />}><PatientTicket /></Suspense>} />

        <Route
          path="/login"
          element={
            <Suspense fallback={<Loading />}>
                {!user ? <Login /> : 
                role === UserRole.DOCTOR ? <Navigate to="/doctor" replace /> :
                (role === UserRole.USER ? <Navigate to="/user" replace /> : <Navigate to="/supervisor" replace />)
                }
            </Suspense>
          }
        />

        {/* Supervisor Routes */}
        <Route path="/supervisor" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><SupervisorDashboard /></ProtectedRoute>} />
        <Route path="/supervisor/attendance" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><SupervisorAttendance /></ProtectedRoute>} />
        <Route path="/supervisor/employees" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><SupervisorEmployees /></ProtectedRoute>} />
        <Route path="/supervisor/swaps" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><SupervisorSwaps /></ProtectedRoute>} />
        <Route path="/supervisor/leaves" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><SupervisorLeaves /></ProtectedRoute>} />
        <Route path="/supervisor/market" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><SupervisorMarket /></ProtectedRoute>} />
        <Route path="/supervisor/locations" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><SupervisorLocations /></ProtectedRoute>} />
        <Route path="/supervisor/history" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><SupervisorHistory /></ProtectedRoute>} />
        
        {/* NEW SUPERVISOR ROUTES */}
        <Route path="/supervisor/performance" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><SupervisorPerformance /></ProtectedRoute>} />
        <Route path="/supervisor/panic-reports" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><PanicReportsPage /></ProtectedRoute>} />

        {/* --- MODALITY LOGBOOKS (New Pages) --- */}
        <Route path="/logbook/mri" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><ModalityLogbook type="MRI" title="MRI Department" colorTheme="blue" /></ProtectedRoute>} />
        <Route path="/logbook/ct" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><ModalityLogbook type="CT" title="CT Department" colorTheme="emerald" /></ProtectedRoute>} />
        <Route path="/logbook/us" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><ModalityLogbook type="US" title="Ultrasound" colorTheme="indigo" /></ProtectedRoute>} />
        <Route path="/logbook/xray" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><ModalityLogbook type="X-RAY" title="X-Ray & General" colorTheme="slate" /></ProtectedRoute>} />

        {/* User Routes with Permissions */}
        <Route path="/user" element={<ProtectedRoute allowedRoles={[UserRole.USER]}><UserDashboard /></ProtectedRoute>} />
        <Route path="/user/schedule" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="schedule"><UserSchedule /></ProtectedRoute>} />
        <Route path="/user/requests" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="requests"><UserRequests /></ProtectedRoute>} />
        <Route path="/user/market" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="market"><UserMarket /></ProtectedRoute>} />
        <Route path="/user/incoming" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="incoming"><UserIncoming /></ProtectedRoute>} />
        <Route path="/user/history" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="history"><UserHistory /></ProtectedRoute>} />
        <Route path="/user/profile" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="profile"><UserProfile /></ProtectedRoute>} />
        <Route path="/user/performance" element={<ProtectedRoute allowedRoles={[UserRole.USER]} requiredPermission="performance"><UserPerformance /></ProtectedRoute>} />

        {/* Other Routes */}
        <Route path="/schedule-builder" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><ScheduleBuilder /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><Reports /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPERVISOR]}><AttendanceAnalyzer /></ProtectedRoute>} />

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

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
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
