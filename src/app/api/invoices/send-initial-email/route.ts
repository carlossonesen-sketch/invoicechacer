/**
 * API route to send initial invoice email
 * Called when user clicks "Send invoice" button
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";
import { getRequestId } from "@/lib/api/requestId";
import { mapErrorToHttp } from "@/lib/api/httpError";
import { isApiError } from "@/lib/api/ApiError";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { requireActiveTrialOrPaid } from "@/lib/api/trial";
import { resolveInvoiceRefAndBusinessId } from "@/lib/invoicePaths";

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
  const requestId = getRequestId(request);
  try {
    initFirebaseAdmin();

    let body: { invoiceId?: unknown };
    try {
      body = await request.json();
    } catch {
      console.warn("[SEND INITIAL EMAIL] MISSING_INVOICE_ID — invalid or missing JSON body");
      return NextResponse.json(
        { error: "BAD_REQUEST", code: "MISSING_INVOICE_ID", message: "invoiceId is required" },
        { status: 400 }
      );
    }
    const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : undefined;
    if (!invoiceId || invoiceId.trim() === "") {
      console.warn("[SEND INITIAL EMAIL] MISSING_INVOICE_ID — received body (not in response):", JSON.stringify(body));
      return NextResponse.json(
        { error: "BAD_REQUEST", code: "MISSING_INVOICE_ID", message: "invoiceId is required" },
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

    // Gate: require active trial or paid subscription
    const trialGate = await requireActiveTrialOrPaid(userId);
    if (trialGate) {
      return trialGate;
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
        userId: businessId || "",
        customerName: (data.customerName as string) || "Customer",
        customerEmail: (data.customerEmail as string) ?? "",
        amount: (data.amount as number) ?? 0,
        dueAt: data.dueAt instanceof Timestamp ? data.dueAt.toDate() : new Date(String(data.dueAt ?? "")),
        paymentLink: (data.paymentLink as string | null) ?? null,
        invoiceNumber: (data.invoiceNumber as string) || invoiceId.slice(0, 8),
      },
      type: "invoice_initial",
    });

    return NextResponse.json({
      success: true,
      message: "Initial invoice email sent",
    });
  } catch (error) {
    console.error("[SEND INITIAL EMAIL] Error:", error, "requestId:", requestId);

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
