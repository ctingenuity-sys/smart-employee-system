
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
// @ts-ignore
import { doc, getDoc, collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
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

  return (
      <AuthContext.Provider value={{ user, role, userName, departmentId, loading, permissions }}>
          {children}
      </AuthContext.Provider>
  );
};
