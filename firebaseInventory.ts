
// @ts-ignore
import { initializeApp, getApp, getApps } from "firebase/app";
// @ts-ignore
import { getFirestore } from "firebase/firestore";
// @ts-ignore
import { getStorage } from "firebase/storage";

const inventoryConfig = {
  apiKey: "AIzaSyAvPJezfCpQnGIgSXMUL_MuJskJKjTWBtE",
  authDomain: "radiology-inventory.appspot.com",
  projectId: "radiology-inventory",
  storageBucket: "radiology-inventory.appspot.com",
  messagingSenderId: "62836498953",
  appId: "1:62836498953:web:85899db40356c26cb30ed8", // Adapted for web based on provided android ID structure
};

// Initialize a secondary app instance for Inventory to avoid conflict with the main app
let inventoryApp;
try {
    // Check if named app already exists
    inventoryApp = getApp("inventoryApp");
} catch (e) {
    // Initialize if not exists
    inventoryApp = initializeApp(inventoryConfig, "inventoryApp");
}

export const inventoryDb = getFirestore(inventoryApp);
export const inventoryStorage = getStorage(inventoryApp);
