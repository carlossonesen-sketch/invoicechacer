import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Initialize Firebase Admin if not already initialized
let adminApp: App;
if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  
  if (!serviceAccount) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is required");
  } else {
    try {
      const serviceAccountJson = JSON.parse(serviceAccount);
      adminApp = initializeApp({
        credential: cert(serviceAccountJson),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    } catch (error) {
      console.error("Failed to initialize Firebase Admin:", error);
    }
  }
} else {
  adminApp = getApps()[0];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json(
        { error: "ID token is required" },
        { status: 400 }
      );
    }

    // Verify the ID token
    if (!adminApp) {
      return NextResponse.json(
        { error: "Firebase Admin not initialized" },
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
  } catch (error: any) {
    console.error("Session creation error:", error);
    
    if (error.code === "auth/id-token-expired") {
      return NextResponse.json(
        { error: "Token expired" },
        { status: 401 }
      );
    }
    
    if (error.code === "auth/argument-error") {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
