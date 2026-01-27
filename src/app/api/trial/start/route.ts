/**
 * POST /api/trial/start — ensure a free trial exists (7 days). Idempotent.
 * Auth required. Sets trialStartedAt, trialEndsAt, trialStatus on businessProfiles/{uid}
 * only when no active trial or paid subscription exists.
 * If subscriptionStatus === "active", returns 200 { ok: true, reason: "already_paid" }.
 * If trialEndsAt is in the future, returns 200 { ok: true, reason: "trial_exists" } (do not overwrite).
 * Otherwise sets trial fields and returns { ok: true, trialEndsAt }.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

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
    const now = new Date();

    if (!snap.exists) {
      return NextResponse.json({ ok: true });
    }
    const data = snap.data();
    if (data?.subscriptionStatus === "active") {
      return NextResponse.json({ ok: true, reason: "already_paid" });
    }
    const existingTrialEnd = toDate(data?.trialEndsAt);
    if (existingTrialEnd && !isNaN(existingTrialEnd.getTime()) && existingTrialEnd > now) {
      return NextResponse.json({ ok: true, reason: "trial_exists", trialEndsAt: existingTrialEnd.toISOString() });
    }
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
