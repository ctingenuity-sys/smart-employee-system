
// @ts-ignore
import { initializeApp, getApp, getApps } from "firebase/app";
// @ts-ignore
import { getAuth } from "firebase/auth";
// @ts-ignore
import { getFirestore } from "firebase/firestore"; // Removed initializeFirestore & cache
// @ts-ignore
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
    apiKey: "AIzaSyDSHlCxPQqbiAQS03SuFhW8xzSCuSf_aKA", // <--- استبدل هذا بمفتاح المشروع الجديد إذا أنشأت واحدًا
    authDomain: "radiology-schedule-1ffba.firebaseapp.com",
    projectId: "radiology-schedule-1ffba",
    storageBucket: "radiology-schedule-1ffba.firebasestorage.app",
    messagingSenderId: "795761727835",
    appId: "1:795761727835:web:a7590200ee4cf6bb33227e"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Switch to standard Firestore without offline persistence to prevent quota sync loops
export const db = getFirestore(app);

export const storage = getStorage(app);
