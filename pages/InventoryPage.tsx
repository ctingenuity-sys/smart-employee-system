import React, { useEffect, useState } from 'react';
import InventorySystem from '../components/InventorySystem';
import { auth, db } from '../firebase';
// @ts-ignore
import { doc, getDoc } from 'firebase/firestore';
import Loading from '../components/Loading';

const InventoryPage: React.FC = () => {
    const [userData, setUserData] = useState<{role: string, name: string, email?: string, uid?: string, permissions?: string[]} | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            if (auth.currentUser) {
                try {
                    const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
                    if (snap.exists()) {
                        const data = snap.data() as any;
                        setUserData({
                            role: data.role,
                            name: data.name || auth.currentUser.displayName || auth.currentUser.email || 'User',
                            email: data.email || auth.currentUser.email || '',
                            uid: auth.currentUser.uid,
                            permissions: data.permissions || []
                        });
                    } else {
                        setUserData({
                            role: 'employee',
                            name: auth.currentUser.displayName || auth.currentUser.email || 'User',
                            email: auth.currentUser.email || '',
                            uid: auth.currentUser.uid,
                            permissions: []
                        });
                    }
                } catch (e) {
                    console.error(e);
                }
            }
            setLoading(false);
        };
        fetchUser();
    }, []);

    if (loading) return <Loading />;
    if (!userData) return <div>Access Denied</div>;

    return (
        <InventorySystem 
            userRole={userData.role} 
            userName={userData.name} 
            userEmail={userData.email || auth.currentUser?.email || ''} 
            userId={userData.uid || auth.currentUser?.uid || ''}
            userPermissions={userData.permissions}
        />
    );
};

export default InventoryPage;