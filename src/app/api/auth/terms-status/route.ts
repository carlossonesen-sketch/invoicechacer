/**
 * GET /api/auth/terms-status
 * Returns { accepted: boolean } from Firestore (businessProfiles/{uid}).
 * Uses session cookie or Bearer token. If not authenticated, returns { accepted: false }.
 * Used by middleware to redirect unaccepted users to /accept-terms.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    initFirebaseAdmin();
    let uid: string;
    try {
      uid = await getAuthenticatedUserId(request);
    } catch {
      return NextResponse.json({ accepted: false });
    }

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json({ accepted: false });
    }

    const snap = await db.collection("businessProfiles").doc(uid).get();
    const data = snap.data();
    const termsAccepted = data?.termsAccepted === true;
    const termsVersion = (data?.termsVersion as string) ?? "";

    const accepted = termsAccepted && termsVersion === CURRENT_TERMS_VERSION;

    return NextResponse.json({ accepted });
  } catch (e) {
    console.error("[GET /api/auth/terms-status]", e);
    return NextResponse.json({ accepted: false });
  }
}
