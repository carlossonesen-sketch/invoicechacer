/**
 * API route to get stats summary
 * GET /api/stats/summary
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { mapErrorToHttp } from "@/lib/api/httpError";
import { isApiError } from "@/lib/api/ApiError";
import { getRequestId } from "@/lib/api/requestId";
import { Timestamp, Firestore } from "firebase-admin/firestore";

// Force Node.js runtime for Vercel
export const runtime = "nodejs";

// Initialize Firebase Admin at module load (silently fail during build if env vars not set)
try {
  initFirebaseAdmin();
} catch (error) {
  // Ignore during build - will be initialized at runtime
  if (process.env.NODE_ENV !== "production") {
    console.warn("[STATS SUMMARY] Firebase Admin init failed at module load (will retry at runtime):", error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Stats summary response shape
 */
export interface StatsSummary {
  collectedTotalCents: number;
  collectedThisMonthCents: number;
  outstandingTotalCents: number;
  paidCountTotal: number;
  paidCountThisMonth: number;
  pendingCount: number;
  lastUpdatedAt: string | null;
  createdCountTotal: number;
  createdCountThisMonth: number;
  emailsSentThisMonth: number;
}

/**
 * Get stats summary for authenticated user's business
 */
function getFirstDayOfThisMonth(): Timestamp {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  return Timestamp.fromDate(first);
}

async function countEmailsSentThisMonth(db: Firestore, userId: string): Promise<number> {
  const first = getFirstDayOfThisMonth();
  const ref = db.collection("emailEvents");
  try {
    const snap = await ref
      .where("userId", "==", userId)
      .where("dryRun", "==", false)
      .where("createdAt", ">=", first)
      .count()
      .get();
    return snap.data().count;
  } catch {
    const snap = await ref
      .where("userId", "==", userId)
      .where("dryRun", "==", false)
      .where("createdAt", ">=", first)
      .limit(10000)
      .get();
    return snap.size;
  }
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    initFirebaseAdmin();

    let userId: string;
    try {
      userId = await getAuthenticatedUserId(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Authentication required";
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: errorMessage },
        { status: 401 }
      );
    }

    const businessId = userId;

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
        { status: 500 }
      );
    }

    const statsRef = db
      .collection("businessProfiles")
      .doc(businessId)
      .collection("stats")
      .doc("summary");

    const [statsDoc, emailsSentThisMonth] = await Promise.all([
      statsRef.get(),
      countEmailsSentThisMonth(db, businessId),
    ]);

    const defaultStats: StatsSummary = {
      collectedTotalCents: 0,
      collectedThisMonthCents: 0,
      outstandingTotalCents: 0,
      paidCountTotal: 0,
      paidCountThisMonth: 0,
      pendingCount: 0,
      lastUpdatedAt: null,
      createdCountTotal: 0,
      createdCountThisMonth: 0,
      emailsSentThisMonth: 0,
    };

    if (!statsDoc.exists) {
      return NextResponse.json({ ...defaultStats, emailsSentThisMonth });
    }

    const statsData = statsDoc.data();
    if (!statsData) {
      return NextResponse.json({ ...defaultStats, emailsSentThisMonth });
    }

    let lastUpdatedAt: string | null = null;
    if (statsData.lastUpdatedAt) {
      if (statsData.lastUpdatedAt instanceof Timestamp) {
        lastUpdatedAt = statsData.lastUpdatedAt.toDate().toISOString();
      } else if (statsData.lastUpdatedAt.toDate) {
        lastUpdatedAt = statsData.lastUpdatedAt.toDate().toISOString();
      } else if (typeof statsData.lastUpdatedAt === "string") {
        lastUpdatedAt = statsData.lastUpdatedAt;
      }
    }

    const stats: StatsSummary = {
      collectedTotalCents: typeof statsData.collectedTotalCents === "number" ? statsData.collectedTotalCents : 0,
      collectedThisMonthCents: typeof statsData.collectedThisMonthCents === "number" ? statsData.collectedThisMonthCents : 0,
      outstandingTotalCents: typeof statsData.outstandingTotalCents === "number" ? statsData.outstandingTotalCents : 0,
      paidCountTotal: typeof statsData.paidCountTotal === "number" ? statsData.paidCountTotal : 0,
      paidCountThisMonth: typeof statsData.paidCountThisMonth === "number" ? statsData.paidCountThisMonth : 0,
      pendingCount: typeof statsData.pendingCount === "number" ? statsData.pendingCount : 0,
      lastUpdatedAt,
      createdCountTotal: typeof statsData.createdCountTotal === "number" ? statsData.createdCountTotal : 0,
      createdCountThisMonth: typeof statsData.createdCountThisMonth === "number" ? statsData.createdCountThisMonth : 0,
      emailsSentThisMonth,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("[STATS SUMMARY] Error:", error, "requestId:", requestId);

    if (isApiError(error)) {
      const isDev = process.env.NODE_ENV !== "production";
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          requestId,
          ...(isDev && error.stack ? { stack: error.stack } : {}),
        },
        { status: error.status }
      );
    }

    const { status, body } = mapErrorToHttp(error);
    return NextResponse.json({ ...body, requestId }, { status });
  }
}
