import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Force Node.js runtime for Vercel
export const runtime = "nodejs";

// Service account key type
interface ServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

// Sanitize and parse service account key
function parseServiceAccountKey(rawKey: string | undefined): ServiceAccountKey | null {
  if (!rawKey) {
    return null;
  }

  try {
    // Trim whitespace and newlines from the raw string
    const trimmedRaw = rawKey.trim();
    
    // Parse JSON
    const parsed = JSON.parse(trimmedRaw) as ServiceAccountKey;
    
    // Sanitize credential fields
    const sanitized: ServiceAccountKey = {
      ...parsed,
      project_id: String(parsed.project_id ?? "").trim(),
      client_email: String(parsed.client_email ?? "").trim(),
      private_key: String(parsed.private_key ?? "").replace(/\\n/g, "\n").trim(),
    };

    return sanitized;
  } catch (error) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}

// Initialize Firebase Admin if not already initialized
let adminApp: App | undefined;
if (getApps().length === 0) {
  const serviceAccount = parseServiceAccountKey(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  
  if (!serviceAccount) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is required or invalid");
  } else {
    try {
      // Also sanitize project ID from environment
      const projectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim();
      // TypeScript now knows serviceAccount is non-null in this block
      const account = serviceAccount;
      
      adminApp = initializeApp({
        credential: cert(account as unknown as { projectId: string; clientEmail: string; privateKey: string }),
        projectId: projectId || account.project_id,
      });
    } catch (error) {
      console.error("Failed to initialize Firebase Admin:", error instanceof Error ? error.message : "Unknown error");
    }
  }
} else {
  adminApp = getApps()[0];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { idToken } = body;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json(
        { error: "ID token is required" },
        { status: 400 }
      );
    }

    // Sanitize ID token by trimming whitespace
    idToken = idToken.trim();

    // Verify the ID token
    if (!adminApp) {
      return NextResponse.json(
        { error: "Firebase Admin not initialized. Please check server configuration." },
        { status: 500 }
      );
    }

    const adminAuth = getAuth(adminApp);
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // Set httpOnly session cookie
    const cookieStore = await cookies();
    cookieStore.set("invoicechaser_session", idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return NextResponse.json({ 
      success: true,
      uid: decodedToken.uid,
      email: decodedToken.email,
    });
  } catch (error: unknown) {
    // Safe debug logging (no secrets)
    const projectId = adminApp?.options.projectId;
    const projectIdHasWhitespace = projectId ? /\s/.test(projectId) : false;
    const projectIdLength = projectId?.length ?? 0;
    
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error("Session creation error:", {
      code: errorCode,
      message: errorMessage,
      projectIdLength,
      projectIdHasWhitespace,
      hasAdminApp: !!adminApp,
    });
    
    if (errorCode === "auth/id-token-expired") {
      return NextResponse.json(
        { error: "Authentication token has expired. Please sign in again." },
        { status: 401 }
      );
    }
    
    if (errorCode === "auth/argument-error") {
      return NextResponse.json(
        { error: "Invalid authentication token format." },
        { status: 401 }
      );
    }
    
    // Check for specific Firebase Auth errors
    if (errorCode?.startsWith("auth/")) {
      return NextResponse.json(
        { error: "Authentication verification failed. Please try signing in again." },
        { status: 401 }
      );
    }

    // Generic error with more context
    return NextResponse.json(
      { error: "Unable to create session. Please check server configuration." },
      { status: 500 }
    );
  }
}
