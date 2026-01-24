/**
 * Authentication helpers for API routes
 */

import { NextRequest } from "next/server";
import { getAdminApp } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

/**
 * Get authenticated user ID from request
 * Supports both Authorization header (Bearer token) and session cookie
 * 
 * @throws {Error} If user is not authenticated or token is invalid
 */
export async function getAuthenticatedUserId(request: NextRequest): Promise<string> {
  const adminApp = getAdminApp();
  const adminAuth = getAuth(adminApp);
  
  // Try Authorization header first (Bearer token)
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const idToken = authHeader.substring(7).trim();
    if (idToken) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        return decodedToken.uid;
      } catch {
        throw new Error("UNAUTHORIZED: Invalid or expired ID token");
      }
    }
  }
  
  // Fall back to session cookie
  const sessionCookie = request.cookies.get("invoicechaser_session");
  if (sessionCookie?.value) {
    try {
      const decodedToken = await adminAuth.verifyIdToken(sessionCookie.value);
      return decodedToken.uid;
    } catch {
      throw new Error("UNAUTHORIZED: Invalid or expired session token");
    }
  }
  
  throw new Error("UNAUTHORIZED: No authentication token found");
}
