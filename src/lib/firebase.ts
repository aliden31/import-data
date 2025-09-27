
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";

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
let app: FirebaseApp | null = null;

function initializeFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey) {
    return null;
  }

  if (app) {
    return app;
  }

  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }

  return app;
}

const resolvedApp = initializeFirebaseApp();

function createUnavailableServiceProxy<T extends object>(serviceName: string): T {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          `Firebase ${serviceName} service is unavailable. Verify that Firebase environment variables are configured.`,
        );
      },
      apply() {
        throw new Error(
          `Firebase ${serviceName} service is unavailable. Verify that Firebase environment variables are configured.`,
        );
      },
    },
  ) as T;
}

const db: Firestore = resolvedApp
  ? getFirestore(resolvedApp)
  : createUnavailableServiceProxy<Firestore>('Firestore');
const auth: Auth = resolvedApp
  ? getAuth(resolvedApp)
  : createUnavailableServiceProxy<Auth>('Auth');

export { resolvedApp as app, db, auth };
