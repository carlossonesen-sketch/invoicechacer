/**
 * API route to send initial invoice email
 * Called when user clicks "Send invoice" button
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";
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
    console.warn("[SEND INITIAL EMAIL] Firebase Admin init failed at module load (will retry at runtime):", error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Send initial invoice email
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure Admin is initialized (should already be done at module load, but double-check)
    initFirebaseAdmin();

    const body = await request.json();
    const { invoiceId } = body;

    if (!invoiceId || typeof invoiceId !== "string") {
      return NextResponse.json(
        { error: "invoiceId is required" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();

    // Fetch invoice
    const invoiceRef = db.collection("invoices").doc(invoiceId);
    const invoiceDoc = await invoiceRef.get();

    if (!invoiceDoc.exists) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const data = invoiceDoc.data();
    if (!data) {
      return NextResponse.json(
        { error: "Invoice data not found" },
        { status: 404 }
      );
    }

    // Check if initial email already sent (idempotency check)
    // Note: assertEmailLimits in sendEmailSafe will also check trial limits
    const emailEventsRef = db.collection("emailEvents");
    const existingEvent = await emailEventsRef
      .where("invoiceId", "==", invoiceId)
      .where("type", "==", "invoice_initial")
      .limit(1)
      .get();

    if (!existingEvent.empty) {
      return NextResponse.json(
        { error: "Initial invoice email already sent", alreadySent: true },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!data.customerEmail || !data.dueAt) {
      return NextResponse.json(
        { error: "Invoice missing required fields (customerEmail, dueAt)" },
        { status: 400 }
      );
    }

    // Send initial email
    await sendInvoiceEmail({
      invoice: {
        id: invoiceId,
        userId: data.userId || "",
        customerName: data.customerName || "Customer",
        customerEmail: data.customerEmail,
        amount: data.amount || 0,
        dueAt: data.dueAt instanceof Timestamp ? data.dueAt.toDate() : new Date(data.dueAt),
        paymentLink: data.paymentLink || null,
        invoiceNumber: data.invoiceNumber || invoiceId.slice(0, 8),
      },
      type: "invoice_initial",
    });

    return NextResponse.json({
      success: true,
      message: "Initial invoice email sent",
    });
  } catch (error) {
    console.error("[SEND INITIAL EMAIL] Error:", error);
    
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
