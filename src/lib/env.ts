/**
 * Environment variable validation for Firebase client-side config
 */

export interface FirebasePublicEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Get all required Firebase public environment variables
 * Returns empty strings if missing (safe for render)
 * Trims all values to avoid issues from trailing newlines/whitespace
 */
export function getPublicFirebaseEnv(): FirebasePublicEnv {
  const apiKey = (process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "").trim();
  const authDomain = (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "").trim();
  const projectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  const storageBucket = (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  const messagingSenderId = (process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "").trim();
  const appId = (process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "").trim();

  // Warn if any required vars are empty after trimming
  const emptyVars: string[] = [];
  if (!apiKey) emptyVars.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!authDomain) emptyVars.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!projectId) emptyVars.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!storageBucket) emptyVars.push("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
  if (!messagingSenderId) emptyVars.push("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
  if (!appId) emptyVars.push("NEXT_PUBLIC_FIREBASE_APP_ID");

  if (emptyVars.length > 0) {
    console.warn("[Firebase] Empty environment variables after trimming:", emptyVars);
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

export interface EnvValidationResult {
  isValid: boolean;
  missingKeys: string[];
}

/**
 * Validate that all required Firebase environment variables are present and non-empty
 * Does NOT throw - safe to call during render
 */
export function assertPublicFirebaseEnv(): EnvValidationResult {
  const env = getPublicFirebaseEnv();
  const requiredKeys: (keyof FirebasePublicEnv)[] = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
  ];

  const missingKeys: string[] = [];
  
  for (const key of requiredKeys) {
    if (!env[key] || env[key].trim() === "") {
      missingKeys.push(`NEXT_PUBLIC_FIREBASE_${key.toUpperCase()}`);
    }
  }

  if (missingKeys.length > 0) {
    console.error("[ENV] Missing Firebase env vars:", missingKeys);
  }

  return {
    isValid: missingKeys.length === 0,
    missingKeys,
  };
}
