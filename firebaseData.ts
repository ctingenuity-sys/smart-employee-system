// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyAvPJezfCpQnGIgSXMUL_MuJskJKjTWBtE",
  authDomain: "radiology-inventory.appspot.com",
  projectId: "radiology-inventory",
  storageBucket: "radiology-inventory.appspot.com",
  messagingSenderId: "62836498953",
  appId: "1:62836498953:web:85899db40356c26cb30ed8"
};

// Initialize Firebase
const appName = "departDataApp";
let app;

try {
  app = getApp(appName);
} catch (e) {
  app = initializeApp(firebaseConfig, appName);
}

// Export services for Certificates, Licenses, Devices, FMS, Rooms
export const db = getFirestore(app);
export const storage = getStorage(app);
storage.maxUploadRetryTime = 10000; // 10 seconds timeout
export const auth = getAuth(app);
