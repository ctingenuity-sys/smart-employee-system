import React, { useEffect, useState } from 'react';
// @ts-ignore
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { auth, db } from './firebase';
import Login from './pages/Login';
import SupervisorDashboard from './pages/SupervisorDashboard';
import UserDashboard from './pages/UserDashboard';
import ScheduleBuilder from './pages/ScheduleBuilder';
import Reports from './pages/Reports';
import AttendanceAnalyzer from './pages/AttendanceAnalyzer';
import InventoryPage from './pages/InventoryPage';
import CommunicationPage from './pages/CommunicationPage';
import TasksPage from './pages/TasksPage';
import TechSupportPage from './pages/TechSupportPage';
import HRAssistantPage from './pages/HRAssistantPage';
import DoctorDashboard from './pages/DoctorDashboard'; 
import AttendancePage from './pages/AttendancePage'; // Import New Page
import Layout from './components/Layout';
import Loading from './components/Loading';
import { UserRole } from './types';
import { LanguageProvider } from './contexts/LanguageContext';

// @ts-ignore
import { doc, getDoc } from 'firebase/firestore';

const AppContent: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setLoading(true); 
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const data: any = userSnap.data();
            const userRole = data?.role || null;
            const name = data?.name || data?.email;
            
            setRole(userRole);
            setUserName(name);
            setUser(currentUser);

            localStorage.setItem("role", userRole);
            localStorage.setItem("username", name);
          } else {
            setRole(null);
            setUserName(currentUser.email || '');
            setUser(currentUser);
          }
        } catch (e) {
          console.error('Error fetching role', e);
          setUser(currentUser);
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
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            !user ? <Login /> : 
            role === UserRole.DOCTOR ? <Navigate to="/doctor" replace /> :
            (role === UserRole.USER ? <Navigate to="/user" replace /> : <Navigate to="/supervisor" replace />)
          }
        />

        <Route
          path="/supervisor"
          element={
            user && (role === UserRole.ADMIN || role === UserRole.SUPERVISOR) ? (
              <Layout userRole={role} userName={userName}>
                <SupervisorDashboard />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/schedule-builder"
          element={
            user && (role === UserRole.ADMIN || role === UserRole.SUPERVISOR) ? (
              <Layout userRole={role} userName={userName}>
                <ScheduleBuilder />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/reports"
          element={
            user && (role === UserRole.ADMIN || role === UserRole.SUPERVISOR) ? (
              <Layout userRole={role} userName={userName}>
                <Reports />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/attendance"
          element={
            user && (role === UserRole.ADMIN || role === UserRole.SUPERVISOR) ? (
              <Layout userRole={role} userName={userName}>
                <AttendanceAnalyzer />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/user"
          element={
            user && (role === UserRole.USER) ? (
              <Layout userRole={role} userName={userName}>
                <UserDashboard />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Separate Attendance Page (No Layout) */}
        <Route
          path="/attendance-punch"
          element={
            user ? <AttendancePage /> : <Navigate to="/login" replace />
          }
        />

        <Route
          path="/doctor"
          element={
            user && (role === UserRole.DOCTOR) ? (
              <Layout userRole={role} userName={userName}>
                <DoctorDashboard />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/communications"
          element={
            user ? (
              <Layout userRole={role || UserRole.USER} userName={userName}>
                <CommunicationPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/inventory"
          element={
            user ? (
              <Layout userRole={role || UserRole.USER} userName={userName}>
                <InventoryPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/tasks"
          element={
            user ? (
              <Layout userRole={role || UserRole.USER} userName={userName}>
                <TasksPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/tech-support"
          element={
            user ? (
              <Layout userRole={role || UserRole.USER} userName={userName}>
                <TechSupportPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/hr-assistant"
          element={
            user ? (
              <Layout userRole={role || UserRole.USER} userName={userName}>
                <HRAssistantPage />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
};

export default App;