
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, setDoc, doc } from "firebase/firestore";

// إعدادات المشروع القديم
const oldConfig = {
    apiKey: "AIzaSyDSHlCxPQqbiAQS03SuFhW8xzSCuSf_aKA",
    authDomain: "radiology-schedule-1ffba.firebaseapp.com",
    projectId: "radiology-schedule-1ffba",
    storageBucket: "radiology-schedule-1ffba.firebasestorage.app",
    messagingSenderId: "795761727835",
    appId: "1:795761727835:web:a7590200ee4cf6bb33227e"
};

// إعدادات المشروع الجديد
const newConfig = {
  apiKey: "AIzaSyAvPJezfCpQnGIgSXMUL_MuJskJKjTWBtE",
  authDomain: "radiology-inventory.appspot.com",
  projectId: "radiology-inventory",
  storageBucket: "radiology-inventory.appspot.com",
  messagingSenderId: "62836498953",
  appId: "1:62836498953:web:85899db40356c26cb30ed8"
};

// تهيئة التطبيقات
const oldApp = getApps().find(a => a.name === 'oldApp') || initializeApp(oldConfig, 'oldApp');
const newApp = getApps().find(a => a.name === 'newApp') || initializeApp(newConfig, 'newApp');

const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);

export const migrateCollections = async () => {
    const collectionsToMigrate = ['employee_records', 'fms_reports', 'room_reports', 'inventory_devices'];
    const results: any = {};

    for (const colName of collectionsToMigrate) {
        try {
            const oldSnap = await getDocs(collection(oldDb, colName));
            let count = 0;
            for (const document of oldSnap.docs) {
                await setDoc(doc(newDb, colName, document.id), document.data());
                count++;
            }
            results[colName] = `تم نقل ${count} عنصر`;
        } catch (e) {
            results[colName] = `خطأ: ${e}`;
        }
    }
    return results;
};
