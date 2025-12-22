
// firebase.ts
// @ts-ignore
import { initializeApp } from "firebase/app";
// @ts-ignore
import { getAuth } from "firebase/auth";
// @ts-ignore
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
// @ts-ignore
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
    apiKey: "AIzaSyDSHlCxPQqbiAQS03SuFhW8xzSCuSf_aKA",
    authDomain: "radiology-schedule-1ffba.firebaseapp.com",
    projectId: "radiology-schedule-1ffba",
    storageBucket: "radiology-schedule-1ffba.firebasestorage.app",
    messagingSenderId: "795761727835",
    appId: "1:795761727835:web:a7590200ee4cf6bb33227e"
};

// ❗ لا يوجد default export في v9
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// CHANGE: Switched to persistentLocalCache to save reads on reload
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export const storage = getStorage(app);