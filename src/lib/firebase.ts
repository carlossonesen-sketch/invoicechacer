import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { initializeFirestore, Firestore } from "firebase/firestore";
import { getPublicFirebaseEnv, assertPublicFirebaseEnv } from "./env";

// Validate environment variables before initializing
const envValidation = typeof window !== "undefined" ? assertPublicFirebaseEnv() : { isValid: false, missingKeys: [] };
const firebaseEnv = getPublicFirebaseEnv();

// Initialize Firebase only if config is valid
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
export const firebaseUnavailable = !envValidation.isValid;

if (typeof window !== "undefined") {
  if (envValidation.isValid) {
    // Only initialize on client side with valid config
    const firebaseConfig = {
      apiKey: firebaseEnv.apiKey,
      authDomain: firebaseEnv.authDomain,
      projectId: firebaseEnv.projectId,
      storageBucket: firebaseEnv.storageBucket,
      messagingSenderId: firebaseEnv.messagingSenderId,
      appId: firebaseEnv.appId,
    };

    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }
    auth = getAuth(app);
    // Use long-polling to avoid Edge/proxy "client is offline" errors (WebChannel/HTTP/2 often blocked).
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    } as any);
  } else {
    // Firebase unavailable - do not initialize
    console.error("[Firebase] Missing required environment variables. Firebase features will be unavailable.");
  }
}

// Export with fallback handling
export { auth, db };
export default app;
