
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// This is moved to the top level to be consistently available.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase App
let app: FirebaseApp;

// Check that the config has been provided
if (firebaseConfig.apiKey) {
    // Avoid re-initializing the app on hot reloads
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApp();
    }
} else {
    // If the config is not available, we can't initialize the app.
    // This can happen during the build process on the server.
    // We'll create a placeholder object to avoid crashing the app.
    // The actual services will be unavailable until the client-side code runs with env vars.
    app = {} as FirebaseApp;
}


const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
