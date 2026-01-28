/**
 * API route to send the next chase email now (manual resend).
 * Trial + paid. Chooses reminder, due, or late_week_N from schedule logic.
 * Requires initial email to have been sent (no duplicate initial send).
 * Returns 403/429 with structured payload when trial limit or cooldown hit.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";
import { computeNextInvoiceEmailToSend } from "@/lib/email/scheduler/invoiceEmailSchedule";
import { mapErrorToHttp } from "@/lib/api/httpError";
import { isApiError } from "@/lib/api/ApiError";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { requireActiveTrialOrPaid } from "@/lib/api/trial";
import { resolveInvoiceRefAndBusinessId } from "@/lib/invoicePaths";
import { getRequestId } from "@/lib/api/requestId";

export const runtime = "nodejs";

try {
  initFirebaseAdmin();
} catch (error) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[SEND CHASE NOW] Firebase Admin init failed at module load:", error instanceof Error ? error.message : "Unknown error");
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    initFirebaseAdmin();

    let body: { invoiceId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "BAD_REQUEST", code: "MISSING_INVOICE_ID", message: "invoiceId is required" },
        { status: 400 }
      );
    }
    const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId.trim() : undefined;
    if (!invoiceId) {
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

    const trialGate = await requireActiveTrialOrPaid(userId);
    if (trialGate) return trialGate;

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
        { status: 500 }
      );
    }

    const { businessId, exists, data } = await resolveInvoiceRefAndBusinessId(db, invoiceId, userId);
    if (!exists || !data) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (data.status !== "pending") {
      return NextResponse.json(
        { error: "INVOICE_NOT_PENDING", message: "Cannot send chase emails for non-pending invoices." },
        { status: 403 }
      );
    }

    const emailEventsRef = db.collection("emailEvents");
    const initialSent = await emailEventsRef
      .where("invoiceId", "==", invoiceId)
      .where("type", "==", "invoice_initial")
      .limit(1)
      .get();
    if (initialSent.empty) {
      return NextResponse.json(
        { error: "INITIAL_REQUIRED", message: "Initial invoice email must be sent first." },
        { status: 400 }
      );
    }

    if (!data.customerEmail || !data.dueAt) {
      return NextResponse.json(
        { error: "Invoice missing required fields (customerEmail, dueAt)" },
        { status: 400 }
      );
    }

    const invoiceForSchedule = {
      id: invoiceId,
      userId: businessId || "",
      customerEmail: (data.customerEmail as string) ?? "",
      dueAt: data.dueAt,
      status: (data.status as "pending" | "overdue" | "paid") || "pending",
      paymentLink: (data.paymentLink as string | null) ?? null,
    };

    const next = await computeNextInvoiceEmailToSend(invoiceForSchedule, new Date());
    if (!next) {
      return NextResponse.json(
        { success: true, message: "No chase email to send right now.", skipped: true },
        { status: 200 }
      );
    }

    const invoicePayload = {
      id: invoiceId,
      userId: businessId || "",
      customerName: (data.customerName as string) || "Customer",
      customerEmail: (data.customerEmail as string) ?? "",
      amount: (data.amount as number) ?? 0,
      dueAt: data.dueAt instanceof Timestamp ? data.dueAt.toDate() : new Date(String(data.dueAt ?? "")),
      paymentLink: (data.paymentLink as string | null) ?? null,
      invoiceNumber: (data.invoiceNumber as string) || invoiceId.slice(0, 8),
    };

    if (next.type === "invoice_reminder") {
      await sendInvoiceEmail({ invoice: invoicePayload, type: "invoice_reminder" });
      return NextResponse.json({ success: true, message: "Reminder email sent.", type: "invoice_reminder" });
    }
    if (next.type === "invoice_due") {
      await sendInvoiceEmail({ invoice: invoicePayload, type: "invoice_due" });
      return NextResponse.json({ success: true, message: "Due date email sent.", type: "invoice_due" });
    }
    if (next.type === "invoice_late_weekly" && next.weekNumber != null) {
      await sendInvoiceEmail({ invoice: invoicePayload, type: "invoice_late_weekly", weekNumber: next.weekNumber });
      return NextResponse.json({
        success: true,
        message: `Week ${next.weekNumber} follow-up sent.`,
        type: "invoice_late_weekly",
        weekNumber: next.weekNumber,
      });
    }

    return NextResponse.json(
      { success: true, message: "No chase email to send right now.", skipped: true },
      { status: 200 }
    );
  } catch (error) {
    console.error("[SEND CHASE NOW] Error:", error, "requestId:", requestId);
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
