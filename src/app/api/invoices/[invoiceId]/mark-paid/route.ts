/**
 * API route to mark an invoice as paid
 * POST /api/invoices/[invoiceId]/mark-paid
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { mapErrorToHttp } from "@/lib/api/httpError";
import { isApiError } from "@/lib/api/ApiError";

// Force Node.js runtime for Vercel
export const runtime = "nodejs";

// Initialize Firebase Admin at module load (silently fail during build if env vars not set)
try {
  initFirebaseAdmin();
} catch (error) {
  // Ignore during build - will be initialized at runtime
  if (process.env.NODE_ENV !== "production") {
    console.warn("[MARK PAID] Firebase Admin init failed at module load (will retry at runtime):", error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Mark an invoice as paid
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> | { invoiceId: string } }
) {
  try {
    // Ensure Admin is initialized
    initFirebaseAdmin();

    // Handle both Promise and direct params (Next.js version compatibility)
    const params = await Promise.resolve(context.params);
    const invoiceId = params.invoiceId;

    if (!invoiceId || typeof invoiceId !== "string") {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Invoice ID is required" },
        { status: 400 }
      );
    }

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

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
        { status: 500 }
      );
    }

    // Fetch invoice
    const invoiceRef = db.collection("invoices").doc(invoiceId);
    const invoiceDoc = await invoiceRef.get();

    if (!invoiceDoc.exists) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoiceData = invoiceDoc.data();
    if (!invoiceData) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Invoice data not found" },
        { status: 404 }
      );
    }

    // Verify invoice belongs to user
    if (invoiceData.userId !== userId) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Invoice does not belong to you" },
        { status: 403 }
      );
    }

    // Idempotent: if already paid, return success
    if (invoiceData.status === "paid") {
      return NextResponse.json({ ok: true });
    }

    // Prepare update data
    const updateData: any = {
      status: "paid",
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      nextChaseAt: null,
      processingAt: null,
    };

    // Set autoChaseEnabled to false if it exists
    if (invoiceData.autoChaseEnabled !== undefined) {
      updateData.autoChaseEnabled = false;
    }

    // Update invoice
    await invoiceRef.update(updateData);

    // Append chaseEvent to chaseEvents subcollection
    const chaseEventsRef = invoiceRef.collection("chaseEvents");
    await chaseEventsRef.add({
      type: "MARK_PAID",
      createdAt: FieldValue.serverTimestamp(),
      actor: "user",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[MARK PAID] Error:", error);
    
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
