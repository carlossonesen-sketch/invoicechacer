/**
 * DEV-ONLY endpoint to list recent invoice IDs for testing
 * Blocked in production
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// Force Node.js runtime for Vercel
export const runtime = "nodejs";

/**
 * List recent invoice IDs (dev only)
 */
export async function GET(request: NextRequest) {
  // Block in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "This endpoint is only available in development" },
      { status: 403 }
    );
  }

  try {
    // Initialize Firebase Admin
    initFirebaseAdmin();
    const db = getAdminFirestore();

    const invoicesRef = db.collection("invoices");
    
    // Try to order by createdAt if it exists, otherwise just limit
    let query;
    try {
      query = invoicesRef.orderBy("createdAt", "desc").limit(20);
    } catch (error) {
      // If createdAt index doesn't exist, fallback to simple limit
      query = invoicesRef.limit(20);
    }

    const snapshot = await query.get();
    
    const invoices = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        invoiceNumber: data.invoiceNumber || doc.id.slice(0, 8),
        customerName: data.customerName || "Unknown",
        amount: data.amount || 0,
        status: data.status || "pending",
        createdAt: data.createdAt instanceof Timestamp 
          ? data.createdAt.toDate().toISOString() 
          : data.createdAt || null,
      };
    });

    return NextResponse.json({
      ids: invoices.map((inv) => inv.id),
      invoices, // Include full data for convenience
      count: invoices.length,
    });
  } catch (error) {
    console.error("[DEV LIST INVOICES] Error:", error);
    // We're already in dev mode (checked at top), so always include stack
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      },
      { status: 500 }
    );
  }
}
