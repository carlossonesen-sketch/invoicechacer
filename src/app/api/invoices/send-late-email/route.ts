/**
 * API route to send late invoice email (weekly follow-up)
 * Dev-only endpoint for production testing
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";
import { mapErrorToHttp } from "@/lib/api/httpError";
import { isApiError } from "@/lib/api/ApiError";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { resolveInvoiceRefAndBusinessId } from "@/lib/invoicePaths";

// Force Node.js runtime for Vercel
export const runtime = "nodejs";

// Initialize Firebase Admin at module load (silently fail during build if env vars not set)
try {
  initFirebaseAdmin();
} catch (error) {
  // Ignore during build - will be initialized at runtime
  if (process.env.NODE_ENV !== "production") {
    console.warn("[SEND LATE EMAIL] Firebase Admin init failed at module load (will retry at runtime):", error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Send late invoice email (weekly follow-up)
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure Admin is initialized (should already be done at module load, but double-check)
    initFirebaseAdmin();

    const body = await request.json();
    const { invoiceId, weekNumber } = body;

    if (!invoiceId || typeof invoiceId !== "string") {
      return NextResponse.json(
        { error: "invoiceId is required" },
        { status: 400 }
      );
    }

    if (weekNumber === undefined || typeof weekNumber !== "number") {
      return NextResponse.json(
        { error: "weekNumber is required (1-8)" },
        { status: 400 }
      );
    }

    if (weekNumber < 1 || weekNumber > 8) {
      return NextResponse.json(
        { error: "weekNumber must be between 1 and 8" },
        { status: 400 }
      );
    }

    let userId: string;
    try {
      userId = await getAuthenticatedUserId(request);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Authentication required";
      return NextResponse.json({ error: "UNAUTHORIZED", message: msg }, { status: 401 });
    }

    const db = getAdminFirestore();

    const { businessId, exists, data } = await resolveInvoiceRefAndBusinessId(db, invoiceId, userId);

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

    // Check if this week's late email already sent (idempotency check)
    // Note: assertEmailLimits in sendEmailSafe will also check trial limits (max 3 chase emails, weeks 1-3 only)
    const emailEventsRef = db.collection("emailEvents");
    const existingEvent = await emailEventsRef
      .where("invoiceId", "==", invoiceId)
      .where("type", "==", "invoice_late_weekly")
      .where("weekNumber", "==", weekNumber)
      .limit(1)
      .get();

    if (!existingEvent.empty) {
      return NextResponse.json(
        { error: `Week ${weekNumber} late invoice email already sent`, alreadySent: true },
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

    // Send late email
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
      type: "invoice_late_weekly",
      weekNumber,
    });

    return NextResponse.json({
      success: true,
      message: `Week ${weekNumber} late invoice email sent`,
    });
  } catch (error) {
    console.error("[SEND LATE EMAIL] Error:", error);
    
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
