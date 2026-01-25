/**
 * API route to process scheduled invoice emails
 * Call this from a cron job or scheduled function.
 *
 * Auth: Requires CRON_SECRET when set. Send x-cron-secret or Authorization: Bearer <CRON_SECRET>.
 * - If CRON_SECRET is set: request must include a matching header; otherwise 401.
 * - If CRON_SECRET is not set in production: 503 (cron not configured).
 * - If CRON_SECRET is not set in development: allowed for local testing.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { computeNextInvoiceEmailToSend, InvoiceForSchedule } from "@/lib/email/scheduler/invoiceEmailSchedule";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";
import { getRequestId } from "@/lib/api/requestId";
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
    console.warn("[PROCESS EMAILS] Firebase Admin init failed at module load (will retry at runtime):", error instanceof Error ? error.message : "Unknown error");
  }
}

function checkCronSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "CRON_NOT_CONFIGURED", message: "Set CRON_SECRET to enable this endpoint." },
        { status: 503 }
      );
    }
    return null;
  }
  const fromHeader = request.headers.get("x-cron-secret")?.trim();
  const auth = request.headers.get("authorization");
  const fromBearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const raw = fromHeader || fromBearer;
  if (!raw || raw !== secret) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Invalid or missing cron secret. Send x-cron-secret or Authorization: Bearer <CRON_SECRET>." },
      { status: 401 }
    );
  }
  return null;
}

/**
 * Process scheduled emails for all eligible invoices
 */
export async function POST(request: NextRequest) {
  const runId = getRequestId(request);
  const authErr = checkCronSecret(request);
  if (authErr) return authErr;

  try {
    initFirebaseAdmin();
    const db = getAdminFirestore();

    const now = new Date();
    const rawLimit = parseInt(process.env.PROCESS_EMAILS_BATCH_LIMIT || "50", 10);
    const batchLimit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit, 100);

    // Query all businessProfiles/{uid}/invoices via collectionGroup
    // Requires composite index: collectionGroup "invoices", (status Ascending, dueAt Ascending)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const snapshot = await db
      .collectionGroup("invoices")
      .where("status", "in", ["pending", "overdue"])
      .where("dueAt", ">=", Timestamp.fromDate(cutoffDate))
      .where("dueAt", "<=", Timestamp.fromDate(futureDate))
      .limit(batchLimit)
      .get();
    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const doc of snapshot.docs) {
      try {
        results.processed++;
        const data = doc.data();

        // Skip if missing required fields
        if (!data.customerEmail || !data.dueAt) {
          results.skipped++;
          continue;
        }

        // Hard guard: Skip if invoice status is not "pending"
        // This prevents emails from being sent even if nextChaseAt is set
        if (data.status !== "pending") {
          results.skipped++;
          continue;
        }

        // uid from path: businessProfiles/{uid}/invoices/{invoiceId}
        const uid = doc.ref.parent.parent?.id ?? (data.userId as string) ?? "";
        // Convert to schedule format
        const invoice: InvoiceForSchedule = {
          id: doc.id,
          userId: uid,
          customerEmail: data.customerEmail,
          dueAt: data.dueAt instanceof Timestamp ? data.dueAt : Timestamp.fromDate(new Date(data.dueAt)),
          status: data.status || "pending",
          paymentLink: data.paymentLink || null,
        };

        // Compute next email to send
        const nextEmail = await computeNextInvoiceEmailToSend(invoice, now);

        if (!nextEmail) {
          results.skipped++;
          continue;
        }

        // Check if scheduled time has passed
        if (nextEmail.scheduledFor > now) {
          results.skipped++;
          continue;
        }

        // Send the email
        await sendInvoiceEmail({
          invoice: {
            id: invoice.id,
            userId: invoice.userId,
            customerName: data.customerName || "Customer",
            customerEmail: invoice.customerEmail,
            amount: data.amount || 0,
            dueAt: invoice.dueAt instanceof Timestamp ? invoice.dueAt.toDate() : new Date(invoice.dueAt),
            paymentLink: invoice.paymentLink,
            invoiceNumber: data.invoiceNumber || doc.id.slice(0, 8),
          },
          type: nextEmail.type,
          weekNumber: nextEmail.weekNumber,
        });

        results.sent++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Invoice ${doc.id}: ${errorMsg}`);
        console.error("[PROCESS EMAILS] Error processing invoice", doc.id, errorMsg, "runId:", runId);
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[PROCESS EMAILS] Fatal error:", errMsg, "runId:", runId);

    if (isApiError(error)) {
      const isDev = process.env.NODE_ENV !== "production";
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          runId,
          ...(isDev && error.stack ? { stack: error.stack } : {}),
        },
        { status: error.status }
      );
    }

    const { status, body } = mapErrorToHttp(error);
    return NextResponse.json({ ...body, runId }, { status });
  }
}

/**
 * GET endpoint for manual testing
 */
export async function GET() {
  return NextResponse.json({
    message: "Use POST to process scheduled emails",
    endpoint: "/api/invoices/process-emails",
  });
}
