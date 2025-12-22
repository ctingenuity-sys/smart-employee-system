import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const inventoryConfig = {
  apiKey: (import.meta as any).env.VITE_INVENTORY_API_KEY,
  authDomain: (import.meta as any).env.VITE_INVENTORY_AUTH_DOMAIN,
  projectId: (import.meta as any).env.VITE_INVENTORY_PROJECT_ID,
  storageBucket: (import.meta as any).env.VITE_INVENTORY_STORAGE_BUCKET,
  messagingSenderId: (import.meta as any).env.VITE_INVENTORY_MESSAGING_SENDER_ID,
  appId: (import.meta as any).env.VITE_INVENTORY_APP_ID,
};

// Initialize a secondary app instance for Inventory
let inventoryApp;
if (getApps().find(app => app.name === "inventoryApp")) {
    inventoryApp = getApp("inventoryApp");
} else {
    inventoryApp = initializeApp(inventoryConfig, "inventoryApp");
}

export const inventoryDb = getFirestore(inventoryApp);
export const inventoryStorage = getStorage(inventoryApp);