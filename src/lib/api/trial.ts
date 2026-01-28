/**
 * Server-side trial gating: fetch profile + isTrialActiveOrPaid.
 * requirePaid: only allows subscriptionStatus === "active".
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { isTrialActiveOrPaid, isPaid } from "../access";

/**
 * Require active trial or paid. Fetches profile, uses isTrialActiveOrPaid(profile, now).
 * Returns null if allowed; 403 with TRIAL_EXPIRED + redirectTo if not.
 */
export async function requireActiveTrialOrPaid(userId: string): Promise<NextResponse | null> {
  const db = getAdminFirestore();
  if (!db) {
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
      { status: 500 }
    );
  }

  const snap = await db.collection("businessProfiles").doc(userId).get();
  const profile = snap.exists ? (snap.data() as Record<string, unknown>) : null;

  if (isTrialActiveOrPaid(profile, new Date())) {
    return null;
  }

  return NextResponse.json(
    { error: "TRIAL_EXPIRED", redirectTo: "/pricing?reason=trial_expired", message: "Your trial has expired. Please subscribe to continue." },
    { status: 403 }
  );
}

/**
 * Require paid subscription (subscriptionStatus === "active").
 * Returns null if allowed; 403 with PAYMENT_REQUIRED + redirectTo /pricing if not.
 */
export async function requirePaid(userId: string): Promise<NextResponse | null> {
  const db = getAdminFirestore();
  if (!db) {
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
      { status: 500 }
    );
  }
  const snap = await db.collection("businessProfiles").doc(userId).get();
  const profile = snap.exists ? (snap.data() as Record<string, unknown>) : null;
  if (isPaid(profile)) return null;
  return NextResponse.json(
    { error: "PAYMENT_REQUIRED", redirectTo: "/pricing", message: "This feature requires a paid plan. Upgrade to continue." },
    { status: 403 }
  );
}
