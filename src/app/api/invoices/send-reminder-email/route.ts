/**
 * API route to send reminder invoice email
 * Dev-only endpoint for production testing
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";
import { mapErrorToHttp } from "@/lib/api/httpError";
import { isApiError } from "@/lib/api/ApiError";
import { resolveInvoiceRefAndBusinessId } from "@/lib/invoicePaths";

// Force Node.js runtime for Vercel
export const runtime = "nodejs";

// Initialize Firebase Admin at module load (silently fail during build if env vars not set)
try {
  initFirebaseAdmin();
} catch (error) {
  // Ignore during build - will be initialized at runtime
  if (process.env.NODE_ENV !== "production") {
    console.warn("[SEND REMINDER EMAIL] Firebase Admin init failed at module load (will retry at runtime):", error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Send reminder invoice email
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

    const { businessId, exists, data } = await resolveInvoiceRefAndBusinessId(db, invoiceId);

    if (!exists || !data) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Hard guard: Only allow emails for pending invoices
    if (data.status !== "pending") {
      return NextResponse.json(
        { error: "INVOICE_NOT_PENDING", message: `Invoice status is "${data.status}", not "pending". Cannot send emails for non-pending invoices.` },
        { status: 403 }
      );
    }

    // Check if reminder email already sent (idempotency check)
    // Note: assertEmailLimits in sendEmailSafe will also check trial limits
    const emailEventsRef = db.collection("emailEvents");
    const existingEvent = await emailEventsRef
      .where("invoiceId", "==", invoiceId)
      .where("type", "==", "invoice_reminder")
      .limit(1)
      .get();

    if (!existingEvent.empty) {
      return NextResponse.json(
        { error: "Reminder invoice email already sent", alreadySent: true },
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

    // Send reminder email
    await sendInvoiceEmail({
      invoice: {
        id: invoiceId,
        userId: businessId || "",
        customerName: (data.customerName as string) || "Customer",
        customerEmail: (data.customerEmail as string) ?? "",
        amount: (data.amount as number) ?? 0,
        dueAt: data.dueAt instanceof Timestamp ? data.dueAt.toDate() : new Date(String(data.dueAt ?? "")),
        paymentLink: (data.paymentLink as string | null) ?? null,
        invoiceNumber: (data.invoiceNumber as string) || invoiceId.slice(0, 8),
      },
      type: "invoice_reminder",
    });

    return NextResponse.json({
      success: true,
      message: "Reminder invoice email sent",
    });
  } catch (error) {
    console.error("[SEND REMINDER EMAIL] Error:", error);
    
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
