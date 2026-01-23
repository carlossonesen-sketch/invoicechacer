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
 */
export function getPublicFirebaseEnv(): FirebasePublicEnv {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
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
