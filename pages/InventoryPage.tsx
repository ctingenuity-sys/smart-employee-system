
import React, { useEffect, useState } from 'react';
import InventorySystem from '../components/InventorySystem';
import { auth, db } from '../firebase';
// @ts-ignore
import { doc, getDoc } from 'firebase/firestore';
import Loading from '../components/Loading';

const InventoryPage: React.FC = () => {
    const [userData, setUserData] = useState<{role: string, name: string} | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            if (auth.currentUser) {
                try {
                    const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
                    if (snap.exists()) {
                        setUserData({
                            role: snap.data().role,
                            name: snap.data().name || auth.currentUser.email || 'User'
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
            userEmail={auth.currentUser?.email || ''} 
        />
    );
};

export default InventoryPage;
