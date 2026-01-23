/**
 * API route to process scheduled invoice emails
 * Call this from a cron job or scheduled function
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { computeNextInvoiceEmailToSend, InvoiceForSchedule } from "@/lib/email/scheduler/invoiceEmailSchedule";
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
    console.warn("[PROCESS EMAILS] Firebase Admin init failed at module load (will retry at runtime):", error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Process scheduled emails for all eligible invoices
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure Admin is initialized (should already be done at module load, but double-check)
    initFirebaseAdmin();

    // Optional: Add authentication/authorization here
    // For now, allow any POST request (you may want to add a secret token check)

    const db = getAdminFirestore();

    const now = new Date();
    const invoicesRef = db.collection("invoices");

    // Fetch invoices that might need emails:
    // - Status is "pending" or "overdue" (not "paid")
    // - Has customerEmail
    // - Has dueAt
    // - dueAt is within reasonable range (past 60 days to future 30 days)
    // Note: This query requires a composite index on (status, dueAt)
    // Deploy indexes with: firebase deploy --only firestore:indexes
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const query = invoicesRef
      .where("status", "in", ["pending", "overdue"])
      .where("dueAt", ">=", Timestamp.fromDate(cutoffDate))
      .where("dueAt", "<=", Timestamp.fromDate(futureDate))
      .limit(100); // Process in batches

    const snapshot = await query.get();
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

        // Convert to schedule format
        const invoice: InvoiceForSchedule = {
          id: doc.id,
          userId: data.userId || "",
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
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        results.errors.push(`Invoice ${doc.id}: ${errorMsg}`);
        console.error(`[PROCESS EMAILS] Error processing invoice ${doc.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("[PROCESS EMAILS] Fatal error:", error);
    
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

/**
 * GET endpoint for manual testing
 */
export async function GET() {
  return NextResponse.json({
    message: "Use POST to process scheduled emails",
    endpoint: "/api/invoices/process-emails",
  });
}
