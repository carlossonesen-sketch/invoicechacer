/**
 * POST /api/auth/accept-terms
 * Records terms acceptance on businessProfiles/{uid}: termsAccepted, termsAcceptedAt, termsVersion.
 * Auth: Bearer or session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    initFirebaseAdmin();
    const uid = await getAuthenticatedUserId(request);

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
        { status: 500 }
      );
    }

    const profileRef = db.collection("businessProfiles").doc(uid);
    await profileRef.set(
      {
        termsAccepted: true,
        termsAcceptedAt: FieldValue.serverTimestamp(),
        termsVersion: CURRENT_TERMS_VERSION,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.startsWith("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED", message: msg }, { status: 401 });
    }
    console.error("[POST /api/auth/accept-terms]", e);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to record terms acceptance" },
      { status: 500 }
    );
  }
}
