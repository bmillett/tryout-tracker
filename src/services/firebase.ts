import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  type Firestore 
} from 'firebase/firestore';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

const STORAGE_KEY = 'ignite_firebase_config';

const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyBhEpQgAWyTd0Ke8rLygX4xZKfXUMza9_U",
  authDomain: "tryout-tracker-450cc.firebaseapp.com",
  projectId: "tryout-tracker-450cc",
  storageBucket: "tryout-tracker-450cc.firebasestorage.app",
  messagingSenderId: "859066108556",
  appId: "1:859066108556:web:2b613913b0399ba83f49a9"
};

export function getStoredFirebaseConfig(): FirebaseConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Check env vars fallback
      const env = (import.meta as any).env;
      if (env?.VITE_FIREBASE_API_KEY && env?.VITE_FIREBASE_PROJECT_ID) {
        return {
          apiKey: env.VITE_FIREBASE_API_KEY,
          authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
          projectId: env.VITE_FIREBASE_PROJECT_ID,
          storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
          messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
          appId: env.VITE_FIREBASE_APP_ID || ''
        };
      }
      return DEFAULT_FIREBASE_CONFIG;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_FIREBASE_CONFIG;
  }
}

export function saveStoredFirebaseConfig(config: FirebaseConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

let appInstance: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;

export function getFirestoreDB(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;

  const config = getStoredFirebaseConfig();
  if (!config || !config.apiKey || !config.projectId) {
    return null;
  }

  try {
    if (!getApps().length) {
      appInstance = initializeApp(config);
    } else {
      appInstance = getApps()[0];
    }

    // Initialize Firestore with robust multi-tab persistent offline cache
    firestoreInstance = initializeFirestore(appInstance, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });

    return firestoreInstance;
  } catch (err) {
    console.warn('Firebase init error:', err);
    return null;
  }
}

export function reinitFirebase(config: FirebaseConfig): boolean {
  try {
    saveStoredFirebaseConfig(config);
    firestoreInstance = null;
    appInstance = null;
    return getFirestoreDB() !== null;
  } catch {
    return false;
  }
}
