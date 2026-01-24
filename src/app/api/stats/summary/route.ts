/**
 * API route to get stats summary
 * GET /api/stats/summary
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { mapErrorToHttp } from "@/lib/api/httpError";
import { isApiError } from "@/lib/api/ApiError";
import { Timestamp } from "firebase-admin/firestore";

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
}

/**
 * Get stats summary for authenticated user's business
 */
export async function GET(request: NextRequest) {
  try {
    // Ensure Admin is initialized
    initFirebaseAdmin();

    // Authenticate user
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

    // Resolve businessId/tenant (userId is the businessId in this system).
    // Invoice path pattern: invoices/{invoiceId}; businessId === userId on document.
    const businessId = userId;

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
        { status: 500 }
      );
    }

    // Read stats summary document
    // Path: businessProfiles/{businessId}/stats/summary
    const statsRef = db
      .collection("businessProfiles")
      .doc(businessId)
      .collection("stats")
      .doc("summary");
    
    const statsDoc = await statsRef.get();

    // If document doesn't exist, return zeros with consistent shape
    if (!statsDoc.exists) {
      const defaultStats: StatsSummary = {
        collectedTotalCents: 0,
        collectedThisMonthCents: 0,
        outstandingTotalCents: 0,
        paidCountTotal: 0,
        paidCountThisMonth: 0,
        pendingCount: 0,
        lastUpdatedAt: null,
      };
      return NextResponse.json(defaultStats);
    }

    const statsData = statsDoc.data();
    if (!statsData) {
      // If doc exists but has no data, return zeros
      const defaultStats: StatsSummary = {
        collectedTotalCents: 0,
        collectedThisMonthCents: 0,
        outstandingTotalCents: 0,
        paidCountTotal: 0,
        paidCountThisMonth: 0,
        pendingCount: 0,
        lastUpdatedAt: null,
      };
      return NextResponse.json(defaultStats);
    }

    // Convert Timestamp to ISO string if present
    let lastUpdatedAt: string | null = null;
    if (statsData.lastUpdatedAt) {
      if (statsData.lastUpdatedAt instanceof Timestamp) {
        lastUpdatedAt = statsData.lastUpdatedAt.toDate().toISOString();
      } else if (statsData.lastUpdatedAt.toDate) {
        // Handle Firestore Timestamp-like objects
        lastUpdatedAt = statsData.lastUpdatedAt.toDate().toISOString();
      } else if (typeof statsData.lastUpdatedAt === "string") {
        lastUpdatedAt = statsData.lastUpdatedAt;
      }
    }

    // Return stats with consistent shape
    const stats: StatsSummary = {
      collectedTotalCents: typeof statsData.collectedTotalCents === "number" ? statsData.collectedTotalCents : 0,
      collectedThisMonthCents: typeof statsData.collectedThisMonthCents === "number" ? statsData.collectedThisMonthCents : 0,
      outstandingTotalCents: typeof statsData.outstandingTotalCents === "number" ? statsData.outstandingTotalCents : 0,
      paidCountTotal: typeof statsData.paidCountTotal === "number" ? statsData.paidCountTotal : 0,
      paidCountThisMonth: typeof statsData.paidCountThisMonth === "number" ? statsData.paidCountThisMonth : 0,
      pendingCount: typeof statsData.pendingCount === "number" ? statsData.pendingCount : 0,
      lastUpdatedAt,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("[STATS SUMMARY] Error:", error);
    
    // Use ApiError status if present, otherwise fall back to mapErrorToHttp
    if (isApiError(error)) {
      const isDev = process.env.NODE_ENV !== "production";
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          ...(isDev && error.stack ? { stack: error.stack } : {}),
        },
        { status: error.status }
      );
    }
    
    const { status, body } = mapErrorToHttp(error);
    return NextResponse.json(body, { status });
  }
}
