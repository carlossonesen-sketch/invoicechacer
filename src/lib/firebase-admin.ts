/**
 * Centralized Firebase Admin SDK initialization
 * Use this module to get Admin Firestore instance for server-side operations
 * Works in Next.js API routes and local node scripts
 */

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

// Initialize Firebase Admin if not already initialized
let adminApp: App | undefined;
let adminDb: Firestore | undefined;

/**
 * Initialize Firebase Admin explicitly
 * Throws an error with helpful message if initialization fails
 * Idempotent - safe to call multiple times
 * 
 * @throws {Error} If FIREBASE_SERVICE_ACCOUNT_KEY is missing or invalid
 * @throws {Error} If Firebase Admin initialization fails
 */
export function initFirebaseAdmin(): void {
  // Check if already initialized
  if (getApps().length > 0) {
    if (!adminApp) {
      adminApp = getApps()[0];
    }
    return;
  }

  // Check for service account key
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY environment variable is missing. " +
      "Please set it in your .env.local file or Vercel environment variables. " +
      "Use scripts/service-account-to-env.ps1 to convert serviceAccountKey.json to this format."
    );
  }

  // Parse JSON with helpful error messages
  let serviceAccount: any;
  try {
    const trimmedRaw = rawKey.trim();
    const parsed = JSON.parse(trimmedRaw);
    
    // Validate required fields
    if (!parsed.private_key || !parsed.client_email || !parsed.project_id) {
      throw new Error("Service account key is missing required fields (private_key, client_email, project_id)");
    }
    
    // Sanitize and prepare service account
    serviceAccount = {
      ...parsed,
      project_id: (parsed.project_id ?? "").trim(),
      client_email: (parsed.client_email ?? "").trim(),
      private_key: (parsed.private_key ?? "").replace(/\\n/g, "\n").trim(),
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_KEY environment variable is invalid JSON. " +
        "Please ensure it's a valid service account key JSON string. " +
        "Use scripts/service-account-to-env.ps1 to convert serviceAccountKey.json to this format."
      );
    }
    throw error;
  }

  // Safety check: Verify service account project_id matches environment project ID
  const envProjectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "").trim();
  const serviceAccountProjectId = serviceAccount.project_id;
  
  if (envProjectId && serviceAccountProjectId && envProjectId !== serviceAccountProjectId) {
    throw new Error(
      `Service account project_id (${serviceAccountProjectId}) does not match NEXT_PUBLIC_FIREBASE_PROJECT_ID (${envProjectId}). ` +
      "You are using the wrong serviceAccountKey.json."
    );
  }

  // Initialize Firebase Admin
  try {
    const projectId = envProjectId || serviceAccount.project_id;
    
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: projectId,
    });
  } catch (error) {
    throw new Error(
      `Failed to initialize Firebase Admin: ${error instanceof Error ? error.message : "Unknown error"}. ` +
      "Please check your FIREBASE_SERVICE_ACCOUNT_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variables."
    );
  }
}

/**
 * Get Firebase Admin Firestore instance
 * Automatically initializes Admin if not already initialized
 * 
 * @throws {Error} If initialization fails
 */
export function getAdminFirestore(): Firestore {
  // Ensure Admin is initialized
  initFirebaseAdmin();
  
  if (!adminApp) {
    throw new Error("Firebase Admin App is not available after initialization");
  }

  if (!adminDb) {
    adminDb = getFirestore(adminApp);
  }

  return adminDb;
}

/**
 * Get Firebase Admin App instance
 * Automatically initializes Admin if not already initialized
 * 
 * @throws {Error} If initialization fails
 */
export function getAdminApp(): App {
  // Ensure Admin is initialized
  initFirebaseAdmin();
  
  if (!adminApp) {
    throw new Error("Firebase Admin App is not available after initialization");
  }

  return adminApp;
}

/**
 * Alias for getAdminFirestore() for convenience
 */
export function getAdminDb(): Firestore {
  return getAdminFirestore();
}
