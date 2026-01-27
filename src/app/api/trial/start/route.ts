/**
 * POST /api/trial/start — start a free trial (7 days).
 * Auth required. Sets trialStartedAt, trialEndsAt, trialStatus on businessProfiles/{uid}.
 * If subscriptionStatus === "active", returns 200 { ok: true, reason: "already_paid" }.
 * Otherwise sets trial fields and returns { ok: true, trialEndsAt }.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

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
    const snap = await profileRef.get();

    if (snap.exists) {
      const data = snap.data();
      if (data?.subscriptionStatus === "active") {
        return NextResponse.json({ ok: true, reason: "already_paid" });
      }
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 7);

    await profileRef.set(
      {
        trialStartedAt: FieldValue.serverTimestamp(),
        trialEndsAt: Timestamp.fromDate(trialEnd),
        trialStatus: "active",
        subscriptionStatus: "trial",
        plan: "trial",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, trialEndsAt: trialEnd.toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.startsWith("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED", message: msg }, { status: 401 });
    }
    console.error("[POST /api/trial/start]", msg);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Failed to start trial" }, { status: 500 });
  }
}
