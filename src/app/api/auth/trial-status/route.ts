/**
 * GET /api/auth/trial-status
 * Returns { trialExpired: boolean, isPaid: boolean } from Firestore (businessProfiles/{uid}).
 * Uses session cookie or Bearer token. If not authenticated, returns { trialExpired: false, isPaid: false }.
 * Used by middleware for trial-expired paywall redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    initFirebaseAdmin();
    let uid: string;
    try {
      uid = await getAuthenticatedUserId(request);
    } catch {
      return NextResponse.json({ trialExpired: false, isPaid: false });
    }

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json({ trialExpired: false, isPaid: false });
    }

    const snap = await db.collection("businessProfiles").doc(uid).get();
    const data = snap.data();
    const subscriptionStatus = data?.subscriptionStatus;
    const isPaid = subscriptionStatus === "active";
    const trialEnd = toDate(data?.trialEndsAt);
    const now = new Date();
    const trialExpired =
      subscriptionStatus === "trial" && !!trialEnd && trialEnd <= now;

    return NextResponse.json({ trialExpired, isPaid });
  } catch (e) {
    console.error("[GET /api/auth/trial-status]", e);
    return NextResponse.json({ trialExpired: false, isPaid: false });
  }
}
