
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

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Initialize Firestore with Persistence (Caching)
// This reduces reads by serving data from local cache when possible
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const storage = getStorage(app);
