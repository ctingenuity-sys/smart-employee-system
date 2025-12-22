
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

const UserDashboard = React.lazy(() => import('./pages/UserDashboard'));
const UserSchedule = React.lazy(() => import('./pages/UserSchedule'));
const UserRequests = React.lazy(() => import('./pages/UserRequests'));
const UserMarket = React.lazy(() => import('./pages/UserMarket'));
const UserIncoming = React.lazy(() => import('./pages/UserIncoming'));
const UserHistory = React.lazy(() => import('./pages/UserHistory'));
const UserProfile = React.lazy(() => import('./pages/UserProfile'));

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

// --- Auth Context ---
interface AuthContextType {
  user: any;
  role: string | null;
  userName: string;
  loading: boolean;
}
const AuthContext = createContext<AuthContextType>({ user: null, role: null, userName: '', loading: true });
const useAuth = () => useContext(AuthContext);

// --- Auth Provider ---
const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        // Optimistic check: if we have local storage role, use it while fetching fresh data
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
            
            // Update Cache
            localStorage.setItem("role", userRole);
            localStorage.setItem("username", name);
          } else {
            setRole(null);
            setUserName(currentUser.email || '');
          }
        } catch (e) {
          console.error('Error fetching role', e);
          setRole(null);
        }
      } else {
        setUser(null);
        setRole(null);
        setUserName('');
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
      <AuthContext.Provider value={{ user, role, userName, loading }}>
          {children}
      </AuthContext.Provider>
  );
};

// --- Protected Route Component ---
const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
    const { user, role, userName } = useAuth();

    if (!user) return <Navigate to="/login" replace />;
    
    if (allowedRoles && role && !allowedRoles.includes(role)) {
        // Redirect based on actual role
        if (role === UserRole.USER) return <Navigate to="/user" replace />;
        if (role === UserRole.DOCTOR) return <Navigate to="/doctor" replace />;
        return <Navigate to="/login" replace />;
    }
    return (
        <Layout userRole={role || ''} userName={userName}>
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

        {/* User Routes */}
        <Route path="/user" element={<ProtectedRoute allowedRoles={[UserRole.USER]}><UserDashboard /></ProtectedRoute>} />
        <Route path="/user/schedule" element={<ProtectedRoute allowedRoles={[UserRole.USER]}><UserSchedule /></ProtectedRoute>} />
        <Route path="/user/requests" element={<ProtectedRoute allowedRoles={[UserRole.USER]}><UserRequests /></ProtectedRoute>} />
        <Route path="/user/market" element={<ProtectedRoute allowedRoles={[UserRole.USER]}><UserMarket /></ProtectedRoute>} />
        <Route path="/user/incoming" element={<ProtectedRoute allowedRoles={[UserRole.USER]}><UserIncoming /></ProtectedRoute>} />
        <Route path="/user/history" element={<ProtectedRoute allowedRoles={[UserRole.USER]}><UserHistory /></ProtectedRoute>} />
        <Route path="/user/profile" element={<ProtectedRoute allowedRoles={[UserRole.USER]}><UserProfile /></ProtectedRoute>} />

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

        {/* Shared Routes */}
        <Route path="/communications" element={<ProtectedRoute><CommunicationPage /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
        <Route path="/tech-support" element={<ProtectedRoute><TechSupportPage /></ProtectedRoute>} />
        <Route path="/hr-assistant" element={<ProtectedRoute><HRAssistantPage /></ProtectedRoute>} />

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
