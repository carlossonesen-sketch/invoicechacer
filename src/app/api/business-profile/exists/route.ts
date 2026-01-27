/**
 * GET /api/business-profile/exists
 * Auth required (Bearer or session cookie). Returns { exists: boolean } for businessProfiles/{uid}.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { getAuthenticatedUserId } from "@/lib/api/auth";

export const runtime = "nodejs";

try {
  initFirebaseAdmin();
} catch {
  /* ignore at module load */
}

export async function GET(request: NextRequest) {
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
    const snap = await profileRef.get();

    return NextResponse.json({ exists: snap.exists });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg.startsWith("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED", message: msg }, { status: 401 });
    }
    console.error("[business-profile/exists] Error:", msg);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to check business profile" },
      { status: 500 }
    );
  }
}
