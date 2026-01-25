/**
 * Cloud Functions for Invoice Chaser
 *
 * onInvoiceWrite: Updates stats/summary when invoices are created/updated/deleted
 * sendEmail: HTTP endpoint to send one email via Resend (optional; main sending is in Next.js/Vercel)
 */

import * as functions from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { Resend } from "resend";

// Initialize Firebase Admin
admin.initializeApp();

/**
 * Get month key in YYYY-MM format from a timestamp
 */
function getMonthKey(timestamp: admin.firestore.Timestamp | null | undefined): string | null {
  if (!timestamp) return null;
  const date = timestamp.toDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Check if a timestamp is in the current month
 */
function isCurrentMonth(timestamp: admin.firestore.Timestamp | null | undefined): boolean {
  if (!timestamp) return false;
  const monthKey = getMonthKey(timestamp);
  if (!monthKey) return false;
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
  const currentMonthKey = `${currentYear}-${currentMonth}`;
  
  return monthKey === currentMonthKey;
}

/**
 * Update stats summary with atomic increments
 */
async function updateStatsSummary(
  userId: string,
  updates: Record<string, admin.firestore.FieldValue>
): Promise<void> {
  const statsRef = admin
    .firestore()
    .collection("businessProfiles")
    .doc(userId)
    .collection("stats")
    .doc("summary");

  // Use update with merge to create if doesn't exist
  await statsRef.set(
    {
      ...updates,
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Handle invoice write (create, update, delete)
 * Updates stats/summary using atomic increments
 *
 * Path pattern: businessProfiles/{uid}/invoices/{invoiceId}.
 * Stats: businessProfiles/{uid}/stats/summary
 */
export const onInvoiceWrite = functions.firestore
  .document("businessProfiles/{uid}/invoices/{invoiceId}")
  .onWrite(async (change, context) => {
    const { uid: userId, invoiceId } = context.params;
    const before = change.before;
    const after = change.after;

    const beforeData = before.exists ? before.data() : null;
    const afterData = after.exists ? after.data() : null;
    if (!userId) {
      functions.logger.warn(`[onInvoiceWrite] No userId found for invoice ${invoiceId}`);
      return;
    }

    functions.logger.info(`[onInvoiceWrite] Processing invoice ${invoiceId} for user ${userId}`);

    // Handle deletion
    if (!after.exists && before.exists) {
      functions.logger.info(`[onInvoiceWrite] Invoice ${invoiceId} deleted`);
      const oldStatus = beforeData?.status;
      const oldAmount = beforeData?.amount || beforeData?.amountCents || 0;
      const oldPaidAt = beforeData?.paidAt;
      const oldCreatedAt = beforeData?.createdAt;

      const updates: Record<string, admin.firestore.FieldValue> = {};

      // Decrement created counts
      updates.createdCountTotal = admin.firestore.FieldValue.increment(-1);
      if (oldCreatedAt && isCurrentMonth(oldCreatedAt)) {
        updates.createdCountThisMonth = admin.firestore.FieldValue.increment(-1);
      }

      if (oldStatus === "pending" || oldStatus === "overdue") {
        // Decrement pending count and outstanding amount
        updates.pendingCount = admin.firestore.FieldValue.increment(-1);
        updates.outstandingTotalCents = admin.firestore.FieldValue.increment(-oldAmount);
        functions.logger.info(
          `[onInvoiceWrite] Decrementing pending count and outstanding by ${oldAmount} cents`
        );
      } else if (oldStatus === "paid" && oldPaidAt) {
        // Decrement paid count and collected amount
        updates.paidCountTotal = admin.firestore.FieldValue.increment(-1);
        updates.collectedTotalCents = admin.firestore.FieldValue.increment(-oldAmount);
        functions.logger.info(
          `[onInvoiceWrite] Decrementing paid count and collected by ${oldAmount} cents`
        );

        // If paid in current month, also decrement this month's stats
        if (isCurrentMonth(oldPaidAt)) {
          updates.paidCountThisMonth = admin.firestore.FieldValue.increment(-1);
          updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(-oldAmount);
          functions.logger.info(
            `[onInvoiceWrite] Decrementing this month's paid count and collected by ${oldAmount} cents`
          );
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateStatsSummary(userId, updates);
      }
      return;
    }

    // Handle creation
    if (!before.exists && after.exists) {
      functions.logger.info(`[onInvoiceWrite] Invoice ${invoiceId} created`);
      const newStatus = afterData?.status;
      const newAmount = afterData?.amount || afterData?.amountCents || 0;
      const newPaidAt = afterData?.paidAt;
      const newCreatedAt = afterData?.createdAt;

      const updates: Record<string, admin.firestore.FieldValue> = {};

      // Increment created counts
      updates.createdCountTotal = admin.firestore.FieldValue.increment(1);
      if (newCreatedAt && isCurrentMonth(newCreatedAt)) {
        updates.createdCountThisMonth = admin.firestore.FieldValue.increment(1);
      }

      if (newStatus === "pending" || newStatus === "overdue") {
        // Increment pending count and outstanding amount
        updates.pendingCount = admin.firestore.FieldValue.increment(1);
        updates.outstandingTotalCents = admin.firestore.FieldValue.increment(newAmount);
        functions.logger.info(
          `[onInvoiceWrite] Incrementing pending count and outstanding by ${newAmount} cents`
        );
      } else if (newStatus === "paid" && newPaidAt) {
        // Increment paid count and collected amount
        updates.paidCountTotal = admin.firestore.FieldValue.increment(1);
        updates.collectedTotalCents = admin.firestore.FieldValue.increment(newAmount);
        functions.logger.info(
          `[onInvoiceWrite] Incrementing paid count and collected by ${newAmount} cents`
        );

        // If paid in current month, also increment this month's stats
        if (isCurrentMonth(newPaidAt)) {
          updates.paidCountThisMonth = admin.firestore.FieldValue.increment(1);
          updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(newAmount);
          functions.logger.info(
            `[onInvoiceWrite] Incrementing this month's paid count and collected by ${newAmount} cents`
          );
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateStatsSummary(userId, updates);
      }
      return;
    }

    // Handle update
    if (before.exists && after.exists) {
      functions.logger.info(`[onInvoiceWrite] Invoice ${invoiceId} updated`);
      const oldStatus = beforeData?.status;
      const newStatus = afterData?.status;
      const oldAmount = beforeData?.amount || beforeData?.amountCents || 0;
      const newAmount = afterData?.amount || afterData?.amountCents || 0;
      const oldPaidAt = beforeData?.paidAt;
      const newPaidAt = afterData?.paidAt;

      const updates: Record<string, admin.firestore.FieldValue> = {};

      // Handle status changes: pending -> paid
      if ((oldStatus === "pending" || oldStatus === "overdue") && newStatus === "paid") {
        functions.logger.info(
          `[onInvoiceWrite] Status changed from ${oldStatus} to paid for invoice ${invoiceId}`
        );

        // Decrement pending/outstanding
        updates.pendingCount = admin.firestore.FieldValue.increment(-1);
        updates.outstandingTotalCents = admin.firestore.FieldValue.increment(-oldAmount);

        // Increment paid/collected
        updates.paidCountTotal = admin.firestore.FieldValue.increment(1);
        updates.collectedTotalCents = admin.firestore.FieldValue.increment(newAmount);

        // If paid in current month, also update this month's stats
        if (newPaidAt && isCurrentMonth(newPaidAt)) {
          updates.paidCountThisMonth = admin.firestore.FieldValue.increment(1);
          updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(newAmount);
          functions.logger.info(
            `[onInvoiceWrite] Incrementing this month's paid count and collected by ${newAmount} cents`
          );
        }

        // If old paidAt was in current month (shouldn't happen, but handle for idempotency)
        if (oldPaidAt && isCurrentMonth(oldPaidAt)) {
          updates.paidCountThisMonth = admin.firestore.FieldValue.increment(-1);
          updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(-oldAmount);
          functions.logger.info(
            `[onInvoiceWrite] Decrementing this month's paid count and collected by ${oldAmount} cents (old paidAt was in current month)`
          );
        }
      }
      // Handle status changes: paid -> pending
      else if (oldStatus === "paid" && (newStatus === "pending" || newStatus === "overdue")) {
        functions.logger.info(
          `[onInvoiceWrite] Status changed from paid to ${newStatus} for invoice ${invoiceId}`
        );

        // Increment pending/outstanding
        updates.pendingCount = admin.firestore.FieldValue.increment(1);
        updates.outstandingTotalCents = admin.firestore.FieldValue.increment(newAmount);

        // Decrement paid/collected
        updates.paidCountTotal = admin.firestore.FieldValue.increment(-1);
        updates.collectedTotalCents = admin.firestore.FieldValue.increment(-oldAmount);

        // If old paidAt was in current month, also update this month's stats
        if (oldPaidAt && isCurrentMonth(oldPaidAt)) {
          updates.paidCountThisMonth = admin.firestore.FieldValue.increment(-1);
          updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(-oldAmount);
          functions.logger.info(
            `[onInvoiceWrite] Decrementing this month's paid count and collected by ${oldAmount} cents`
          );
        }

        // If new paidAt is in current month (shouldn't happen, but handle for idempotency)
        if (newPaidAt && isCurrentMonth(newPaidAt)) {
          updates.paidCountThisMonth = admin.firestore.FieldValue.increment(1);
          updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(newAmount);
          functions.logger.info(
            `[onInvoiceWrite] Incrementing this month's paid count and collected by ${newAmount} cents (new paidAt is in current month)`
          );
        }
      }
      // Handle amount changes (status unchanged)
      else if (oldAmount !== newAmount && oldStatus === newStatus) {
        const amountDiff = newAmount - oldAmount;
        functions.logger.info(
          `[onInvoiceWrite] Amount changed from ${oldAmount} to ${newAmount} cents for invoice ${invoiceId} (status: ${oldStatus})`
        );

        if (oldStatus === "pending" || oldStatus === "overdue") {
          // Adjust outstanding amount
          updates.outstandingTotalCents = admin.firestore.FieldValue.increment(amountDiff);
          functions.logger.info(
            `[onInvoiceWrite] Adjusting outstanding by ${amountDiff} cents (pending invoice)`
          );
        } else if (oldStatus === "paid") {
          // Adjust collected amount
          updates.collectedTotalCents = admin.firestore.FieldValue.increment(amountDiff);
          functions.logger.info(
            `[onInvoiceWrite] Adjusting collected by ${amountDiff} cents (paid invoice)`
          );

          // Handle "this month" adjustments
          const oldWasCurrentMonth = oldPaidAt && isCurrentMonth(oldPaidAt);
          const newIsCurrentMonth = newPaidAt && isCurrentMonth(newPaidAt);

          if (oldWasCurrentMonth && newIsCurrentMonth) {
            // Both in current month - just adjust by amountDiff
            updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(amountDiff);
            functions.logger.info(
              `[onInvoiceWrite] Adjusting this month's collected by ${amountDiff} cents (both old and new in current month)`
            );
          } else if (oldWasCurrentMonth && !newIsCurrentMonth) {
            // Moved out of current month - remove old amount, don't add new
            updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(-oldAmount);
            functions.logger.info(
              `[onInvoiceWrite] Decrementing this month's collected by ${oldAmount} cents (paidAt moved out of current month)`
            );
          } else if (!oldWasCurrentMonth && newIsCurrentMonth) {
            // Moved into current month - add new amount
            updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(newAmount);
            functions.logger.info(
              `[onInvoiceWrite] Incrementing this month's collected by ${newAmount} cents (paidAt moved into current month)`
            );
          }
          // If neither old nor new is in current month, no "this month" adjustment needed
        }
      }
      // Handle paidAt changes (status is paid, amount unchanged)
      else if (
        oldStatus === "paid" &&
        newStatus === "paid" &&
        oldAmount === newAmount &&
        oldPaidAt !== newPaidAt
      ) {
        functions.logger.info(
          `[onInvoiceWrite] paidAt changed for invoice ${invoiceId} (status: paid, amount: ${newAmount})`
        );

        const oldWasCurrentMonth = oldPaidAt && isCurrentMonth(oldPaidAt);
        const newIsCurrentMonth = newPaidAt && isCurrentMonth(newPaidAt);

        if (oldWasCurrentMonth && !newIsCurrentMonth) {
          // Moved out of current month
          updates.paidCountThisMonth = admin.firestore.FieldValue.increment(-1);
          updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(-oldAmount);
          functions.logger.info(
            `[onInvoiceWrite] Decrementing this month's stats (paidAt moved out of current month)`
          );
        } else if (!oldWasCurrentMonth && newIsCurrentMonth) {
          // Moved into current month
          updates.paidCountThisMonth = admin.firestore.FieldValue.increment(1);
          updates.collectedThisMonthCents = admin.firestore.FieldValue.increment(newAmount);
          functions.logger.info(
            `[onInvoiceWrite] Incrementing this month's stats (paidAt moved into current month)`
          );
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateStatsSummary(userId, updates);
        functions.logger.info(
          `[onInvoiceWrite] Successfully updated stats for user ${userId} with ${Object.keys(updates).length} fields`
        );
      } else {
        functions.logger.info(
          `[onInvoiceWrite] No stats updates needed for invoice ${invoiceId}`
        );
      }
    }
  });

/**
 * HTTP endpoint to send one email via Resend.
 * Use when moving email sending to Firebase (e.g. from Firestore triggers or scheduler).
 * Configure RESEND_API_KEY and optionally EMAIL_FUNCTION_SECRET (x-email-secret header).
 * From address: RESEND_FROM or "Invoice Chaser <onboarding@resend.dev>".
 */
export const sendEmail = onRequest(async (req, res) => {
  // CORS for same-origin or configured origins
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, x-email-secret");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const secret = process.env.EMAIL_FUNCTION_SECRET;
  if (secret && req.get("x-email-secret") !== secret) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ error: "Resend not configured; set RESEND_API_KEY" });
    return;
  }

  let body: { to?: string; subject?: string; html?: string; text?: string };
  try {
    body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const { to, subject, html, text } = body;
  if (!to || !subject || typeof to !== "string" || typeof subject !== "string") {
    res.status(400).json({ error: "to and subject are required" });
    return;
  }

  const from = process.env.RESEND_FROM?.trim() || "Invoice Chaser <onboarding@resend.dev>";

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html: typeof html === "string" ? html : undefined,
      text: typeof text === "string" ? text : undefined,
    });
    if (error) {
      functions.logger.warn("[sendEmail] Resend error:", error);
      res.status(502).json({ error: `Resend: ${error.message}` });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    functions.logger.error("[sendEmail]", e);
    res.status(500).json({ error: "Failed to send" });
  }
});
