// @ts-ignore
import { initializeApp, getApp, getApps } from "firebase/app";
// @ts-ignore
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const appointmentsConfig = {
  apiKey: "AIzaSyDwJ1DSNOP1juagArkLRNo2deOrHJPe9IE",
  authDomain: "appointment-72d56.firebaseapp.com",
  projectId: "appointment-72d56",
  storageBucket: "appointment-72d56.firebasestorage.app",
  messagingSenderId: "341667253074",
  appId: "1:341667253074:web:0ce28f191a78303a48888b"
};

// Initialize a secondary app instance for Appointments to avoid conflict with the main app
let appointmentsApp;
try {
    // Check if named app already exists
    appointmentsApp = getApp("appointmentsApp");
} catch (e) {
    // Initialize if not exists
    appointmentsApp = initializeApp(appointmentsConfig, "appointmentsApp");
}

// Initialize Firestore with persistent cache settings (replaces deprecated enableIndexedDbPersistence)
export const appointmentsDb = initializeFirestore(appointmentsApp, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});
