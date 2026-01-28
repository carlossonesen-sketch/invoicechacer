/**
 * API route to send a manual invoice email that does NOT touch auto-chase fields.
 * Used from the invoice edit screen for manual resend.
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
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[SEND MANUAL EMAIL] Firebase Admin init failed at module load (will retry at runtime):",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

/**
 * Send manual invoice email (no auto-chase updates)
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    initFirebaseAdmin();

    let body: { invoiceId?: unknown };
    try {
      body = await request.json();
    } catch {
      console.warn("[SEND MANUAL EMAIL] MISSING_INVOICE_ID — invalid or missing JSON body");
      return NextResponse.json(
        { ok: false, error: "BAD_REQUEST", code: "MISSING_INVOICE_ID", message: "invoiceId is required" },
        { status: 400 }
      );
    }
    const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : undefined;
    if (!invoiceId || invoiceId.trim() === "") {
      console.warn(
        "[SEND MANUAL EMAIL] MISSING_INVOICE_ID — received body (not in response):",
        JSON.stringify(body)
      );
      return NextResponse.json(
        { ok: false, error: "BAD_REQUEST", code: "MISSING_INVOICE_ID", message: "invoiceId is required" },
        { status: 400 }
      );
    }

    let userId: string;
    try {
      userId = await getAuthenticatedUserId(request);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Authentication required";
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED", message: msg }, { status: 401 });
    }

    // Gate: require active trial or paid subscription
    const trialGate = await requireActiveTrialOrPaid(userId);
    if (trialGate) {
      return trialGate;
    }

    const db = getAdminFirestore();

    const { businessId, exists, data } = await resolveInvoiceRefAndBusinessId(db, invoiceId, userId);

    if (!exists || !data) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }

    // Hard guard: Only allow emails for pending invoices
    if (data.status !== "pending") {
      return NextResponse.json(
        {
          ok: false,
          error: "INVOICE_NOT_PENDING",
          message: `Invoice status is "${data.status}", not "pending". Cannot send emails for non-pending invoices.`,
        },
        { status: 403 }
      );
    }

    // Validate required fields
    if (!data.customerEmail || !data.dueAt) {
      return NextResponse.json(
        { ok: false, error: "MISSING_FIELDS", message: "Invoice missing required fields (customerEmail, dueAt)" },
        { status: 400 }
      );
    }

    const dueAtDate =
      data.dueAt instanceof Timestamp ? data.dueAt.toDate() : new Date(String(data.dueAt ?? ""));

    const invoicePayload = {
      id: invoiceId,
      userId: businessId || "",
      customerName: (data.customerName as string) || "Customer",
      customerEmail: (data.customerEmail as string) ?? "",
      amount: (data.amount as number) ?? 0,
      dueAt: dueAtDate,
      paymentLink: (data.paymentLink as string | null) ?? null,
      invoiceNumber: (data.invoiceNumber as string) || invoiceId.slice(0, 8),
    };

    // Manual send: invoice_initial template, but DO NOT touch auto-chase fields
    await sendInvoiceEmail({
      invoice: invoicePayload,
      type: "invoice_initial",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SEND MANUAL EMAIL] Error:", error, "requestId:", requestId);

    if (isApiError(error)) {
      const isDev = process.env.NODE_ENV !== "production";
      return NextResponse.json(
        {
          ok: false,
          error: error.code,
          message: error.message,
          requestId,
          ...(isDev && error.stack ? { stack: error.stack } : {}),
        },
        { status: error.status }
      );
    }

    const { status, body } = mapErrorToHttp(error);
    return NextResponse.json({ ok: false, ...body, requestId }, { status });
  }
}

