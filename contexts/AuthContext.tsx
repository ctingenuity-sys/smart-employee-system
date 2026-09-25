
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
// @ts-ignore
import { doc, getDoc, collection, addDoc, serverTimestamp, Timestamp, updateDoc, arrayUnion, query, where, getDocs, setDoc } from 'firebase/firestore';
import { UserRole } from '../types';

// --- Offline Punch Sync Logic ---
const OFFLINE_PUNCHES_KEY = 'offline_punches';

const syncOfflinePunches = async () => {
    if (!navigator.onLine) return;
    const existingStr = localStorage.getItem(OFFLINE_PUNCHES_KEY);
    if (!existingStr) return;
    const existing = JSON.parse(existingStr || '[]');
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

interface AuthContextType {
  user: any;
  role: string | null;
  userName: string;
  departmentId?: string;
  loading: boolean;
  permissions: string[];
}

const AuthContext = createContext<AuthContextType>({ 
    user: null, 
    role: null, 
    userName: '', 
    loading: true, 
    permissions: [] 
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
          let userSnap = await getDoc(userRef);
          let data: any = null;
          let activeDocRef = userRef;

          if (userSnap.exists()) {
            data = userSnap.data();
          } else if (currentUser.email) {
            // Fallback: search by email if document UID doesn't match auth UID
            try {
              const currentEmailLower = (currentUser.email || '').toLowerCase().trim();
              const emailsToMatch = [currentEmailLower];
              if (currentEmailLower === 'cath@gmail.com') emailsToMatch.push('cathlab@gmail.com');
              if (currentEmailLower === 'cathlab@gmail.com') emailsToMatch.push('cath@gmail.com');

              // Case-insensitive search across users
              const allSnap = await getDocs(collection(db, 'users'));
              const matched = allSnap.docs.find(d => {
                const docEmail = (d.data().email || '').toLowerCase().trim();
                const docRole = (d.data().role || '').toLowerCase().trim();
                return emailsToMatch.includes(docEmail) || 
                       (currentEmailLower.includes('cath') && docRole === 'cath_lab');
              });

              if (matched) {
                data = matched.data();
                activeDocRef = doc(db, 'users', matched.id);
                // Also link to currentUser.uid for fast subsequent lookups
                setDoc(userRef, { ...data, uid: currentUser.uid }, { merge: true }).catch(() => {});
              }
            } catch (err) {
              console.warn("Error in fallback user lookup:", err);
            }
          }
          
          if (data) {
            let userRole = data?.role || null;
            if (userRole === 'cath' || userRole === 'cathlab') {
              userRole = UserRole.CATH_LAB;
            }
            const name = data?.name || data?.email;
            
            let userPerms = data?.permissions || [];

            // If user is Cath-Lab, ensure catheter_supplies permission is ALWAYS granted
            const isCathLab = userRole === UserRole.CATH_LAB || userRole === 'cath_lab' || 
                              String(userRole).toLowerCase().includes('cath') || 
                              (currentUser.email || '').toLowerCase().includes('cath');
            if (isCathLab) {
              userRole = UserRole.CATH_LAB;
              if (!userPerms.includes('catheter_supplies')) {
                userPerms = [...userPerms, 'catheter_supplies'];
                try {
                  updateDoc(activeDocRef, { permissions: arrayUnion('catheter_supplies') }).catch(() => {});
                  if (activeDocRef.id !== userRef.id) {
                    updateDoc(userRef, { permissions: arrayUnion('catheter_supplies') }).catch(() => {});
                  }
                } catch (err) {
                  console.warn("Could not auto-update cath permissions in Firestore:", err);
                }
              }
            }
            
            // If user is a Supervisor or Manager, ensure all supervisor tools (including sup_payroll, sup_attendance) are granted
            const isManagement = userRole === UserRole.SUPERVISOR || userRole === UserRole.MANAGER || userRole === UserRole.ADMIN || String(userRole).toLowerCase().includes('supervisor');
            if (isManagement) {
              const essentialSupervisorPerms = [
                'sup_payroll', 
                'sup_attendance', 
                'sup_employees', 
                'sup_schedule_builder', 
                'sup_reports', 
                'sup_leaves', 
                'sup_swaps', 
                'sup_rotation', 
                'sup_history', 
                'sup_performance',
                'sup_market',
                'sup_locations',
                'sup_devices',
                'sup_fms',
                'sup_rooms',
                'sup_logbooks',
                'sup_penalties',
                'sup_archive',
                'radiology_log',
                'communications',
                'inventory',
                'tasks',
                'tech_support',
                'appointments',
                'handover'
              ];
              const missing = essentialSupervisorPerms.filter(k => !userPerms.includes(k));
              if (missing.length > 0) {
                userPerms = [...userPerms, ...missing];
                try {
                  updateDoc(activeDocRef, { permissions: arrayUnion(...missing) });
                  if (activeDocRef.id !== userRef.id) {
                    updateDoc(userRef, { permissions: arrayUnion(...missing) }).catch(() => {});
                  }
                } catch (err) {
                  console.warn("Could not auto-update supervisor permissions in Firestore:", err);
                }
              }
            }

            setRole(userRole);
            setUserName(name);
            setDepartmentId(data?.departmentId);
            setPermissions(userPerms); 
            
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

  if (loading) {
      return (
          <div className="h-screen flex items-center justify-center bg-slate-100">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
      );
  }

  return (
      <AuthContext.Provider value={{ user, role, userName, departmentId, loading, permissions }}>
          {children}
      </AuthContext.Provider>
  );
};
