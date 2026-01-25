/**
 * Authentication helpers for API routes
 */

import { NextRequest } from "next/server";
import { getAdminApp } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

// Only in non-production: avoid PII/secrets in logs and verbose auth errors
const DEV_TOOLS = process.env.NEXT_PUBLIC_DEV_TOOLS === "1" && process.env.NODE_ENV !== "production";

/**
 * Decode JWT payload (middle segment) without verifying. Returns { aud, iss, sub, exp, iat } or null.
 */
function decodeJwtPayloadUnsafe(token: string): { aud?: string; iss?: string; sub?: string; exp?: number; iat?: number } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part, "base64url").toString("utf8");
    const p = JSON.parse(json) as Record<string, unknown>;
    return { aud: p.aud as string, iss: p.iss as string, sub: p.sub as string, exp: p.exp as number, iat: p.iat as number };
  } catch {
    return null;
  }
}

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
      let decoded: { aud?: string; iss?: string; sub?: string; exp?: number; iat?: number } | null = null;
      if (DEV_TOOLS) {
        console.log("[AUTH DEBUG] NEXT_PUBLIC_FIREBASE_PROJECT_ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
        decoded = decodeJwtPayloadUnsafe(idToken);
        if (decoded) {
          console.log("[AUTH DEBUG] decoded aud, iss, sub, exp, iat:", decoded.aud, decoded.iss, decoded.sub, decoded.exp, decoded.iat);
        }
      }
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        return decodedToken.uid;
      } catch (err) {
        if (DEV_TOOLS) {
          const e = err as { code?: string; message?: string; stack?: string };
          console.log("[AUTH DEBUG] verifyIdToken err:", e?.code, e?.message, e?.stack);
        }
        const e = err as Error;
        const msg =
          DEV_TOOLS && decoded
            ? `UNAUTHORIZED: ${e?.message ?? "Invalid or expired ID token"} (decoded aud=${decoded.aud} iss=${decoded.iss})`
            : "UNAUTHORIZED: Invalid or expired ID token";
        throw new Error(msg);
      }
    }
  }

  // Fall back to session cookie
  const sessionCookie = request.cookies.get("invoicechaser_session");
  if (sessionCookie?.value) {
    const token = sessionCookie.value;
    let decoded: { aud?: string; iss?: string; sub?: string; exp?: number; iat?: number } | null = null;
    if (DEV_TOOLS) {
      console.log("[AUTH DEBUG] NEXT_PUBLIC_FIREBASE_PROJECT_ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
      decoded = decodeJwtPayloadUnsafe(token);
      if (decoded) {
        console.log("[AUTH DEBUG] decoded (session) aud, iss, sub, exp, iat:", decoded.aud, decoded.iss, decoded.sub, decoded.exp, decoded.iat);
      }
    }
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      return decodedToken.uid;
    } catch (err) {
      if (DEV_TOOLS) {
        const e = err as { code?: string; message?: string; stack?: string };
        console.log("[AUTH DEBUG] verifyIdToken (session) err:", e?.code, e?.message, e?.stack);
      }
      const e = err as Error;
      const msg =
        DEV_TOOLS && decoded
          ? `UNAUTHORIZED: ${e?.message ?? "Invalid or expired session token"} (decoded aud=${decoded.aud} iss=${decoded.iss})`
          : "UNAUTHORIZED: Invalid or expired session token";
      throw new Error(msg);
    }
  }

  throw new Error("UNAUTHORIZED: No authentication token found");
}
