/**
 * Scheduled chase runner: every 5 minutes, processes invoices eligible to chase
 * (nextChaseAt <= now, autoChaseEnabled, status pending/overdue).
 * Uses per-invoice lock (processingAt), idempotency (chaseEvents, lastChasedAt),
 * and writes chaseEvents with messageId/error. Supports DRY_RUN.
 */

import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as functions from "firebase-functions";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { sendEmailSes } from "../email/ses";
import { renderChaseEmail } from "../email/chaseTemplate";

const BATCH_LIMIT = 50;
const PROCESSING_LOCK_MS = 10 * 60 * 1000;   // 10 min
const LAST_CHASED_COOLDOWN_MS = 60 * 60 * 1000; // 1 hr
const IDEMPOTENCY_WINDOW_MS = 90 * 60 * 1000;   // 90 min

type ChaseType = "invoice_reminder" | "invoice_due" | "invoice_late_weekly";

function toDate(v: admin.firestore.Timestamp | Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function setChicago9AM(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 15, 0, 0, 0));
}

interface NextChase {
  type: ChaseType;
  scheduledFor: Date;
  weekNumber?: number;
}

const EPOCH = new Date(0);

async function computeNextChase(
  chaseEventsRef: admin.firestore.CollectionReference,
  dueAt: Date,
  status: string,
  now: Date
): Promise<NextChase | null> {
  if (status !== "pending" && status !== "overdue") return null;
  const dueOnly = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
  const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilDue = Math.floor((dueOnly.getTime() - nowOnly.getTime()) / 86400000);

  // Reminder: 3 days before
  if (daysUntilDue >= 3) {
    const rem = new Date(dueAt);
    rem.setDate(rem.getDate() - 3);
    const at = setChicago9AM(rem);
    if (!(await hasChaseInWindow(chaseEventsRef, "invoice_reminder", undefined, EPOCH))) {
      return { type: "invoice_reminder", scheduledFor: at };
    }
  } else if (daysUntilDue > 0 && daysUntilDue < 3) {
    if (!(await hasChaseInWindow(chaseEventsRef, "invoice_reminder", undefined, EPOCH))) {
      return { type: "invoice_reminder", scheduledFor: now };
    }
  }

  // Due today
  if (daysUntilDue === 0) {
    const at = setChicago9AM(dueAt);
    if (!(await hasChaseInWindow(chaseEventsRef, "invoice_due", undefined, EPOCH))) {
      return { type: "invoice_due", scheduledFor: at };
    }
  } else if (daysUntilDue < 0) {
    if (!(await hasChaseInWindow(chaseEventsRef, "invoice_due", undefined, EPOCH))) {
      return { type: "invoice_due", scheduledFor: now };
    }
  }

  // Late weekly
  if (daysUntilDue < 0) {
    const daysPast = Math.abs(daysUntilDue);
    for (let w = 1; w <= 8; w++) {
      const start = 7 * w;
      const end = 7 * (w + 1);
      if (daysPast >= start && daysPast < end) {
        if (!(await hasChaseInWindow(chaseEventsRef, "invoice_late_weekly", w, EPOCH))) {
          const d = new Date(dueAt);
          d.setDate(d.getDate() + start);
          return { type: "invoice_late_weekly", scheduledFor: setChicago9AM(d), weekNumber: w };
        }
      }
    }
  }

  return null;
}

async function hasChaseInWindow(
  chaseRef: admin.firestore.CollectionReference,
  type: string,
  weekNumber: number | undefined,
  since: Date
): Promise<boolean> {
  // Query matches composite index (type ASC, createdAt ASC). No extra where clauses.
  const q = chaseRef
    .where("type", "==", type)
    .where("createdAt", ">=", Timestamp.fromDate(since))
    .orderBy("createdAt", "asc")
    .limit(100);
  const snap = await q.get();
  if (type === "invoice_late_weekly" && weekNumber != null) {
    const match = snap.docs.find((d) => d.data().weekNumber === weekNumber);
    return !!match;
  }
  return !snap.empty;
}

/**
 * Shared logic for the chase scheduler. Used by both the scheduled run and the
 * dev-only force-run HTTP endpoint. Do not call from outside scheduler.
 */
export async function runChaseSchedulerLogic(): Promise<void> {
  const db = admin.firestore();
    const dryRun = ["DRY_RUN", "CHASE_DRY_RUN"].some((k) => process.env[k] === "true");
    if (dryRun) {
      functions.logger.info("[runChaseScheduler] DRY_RUN: no emails will be sent");
    }

    const now = new Date();
    const limit = Math.min(parseInt(process.env.CHASE_BATCH_LIMIT || String(BATCH_LIMIT), 10) || BATCH_LIMIT, 100);

    const snap = await db
      .collectionGroup("invoices")
      .where("status", "in", ["pending", "overdue"])
      .where("autoChaseEnabled", "==", true)
      .where("nextChaseAt", "<=", Timestamp.fromDate(now))
      .limit(limit)
      .get();

    let processed = 0;
    let sent = 0;
    let skipped = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const invoiceRef = doc.ref;
      const chaseEventsRef = invoiceRef.collection("chaseEvents");
      const uid = invoiceRef.parent?.parent?.id ?? data.userId ?? "";

      if (!data.customerEmail?.trim() || !data.dueAt) {
        skipped++;
        continue;
      }

      const dueAt = toDate(data.dueAt);
      if (!dueAt) {
        skipped++;
        continue;
      }

      try {
        const result = await db.runTransaction(async (tx) => {
          const inv = await tx.get(invoiceRef);
          if (!inv.exists) return { action: "skip" as const };
          const d = inv.data()!;

          // Lock: skip if processingAt is recent
          const pa = toDate(d.processingAt);
          if (pa && now.getTime() - pa.getTime() < PROCESSING_LOCK_MS) {
            return { action: "skip" as const, reason: "locked" };
          }

          // Set/refresh lock
          tx.update(invoiceRef, { processingAt: Timestamp.fromDate(now) });

          // Idempotency: lastChasedAt
          const lc = toDate(d.lastChasedAt);
          if (lc && now.getTime() - lc.getTime() < LAST_CHASED_COOLDOWN_MS) {
            tx.update(invoiceRef, { processingAt: FieldValue.delete() });
            return { action: "skip" as const, reason: "lastChasedAt" };
          }

          const next = await computeNextChase(chaseEventsRef, dueAt, d.status || "pending", now);
          if (!next || next.scheduledFor > now) {
            // Update nextChaseAt to avoid tight loop; clear lock
            const autoDays = typeof d.autoChaseDays === "number" ? d.autoChaseDays : 1;
            const nextRun = new Date(now.getTime() + autoDays * 86400000);
            tx.update(invoiceRef, {
              nextChaseAt: Timestamp.fromDate(nextRun),
              processingAt: FieldValue.delete(),
            });
            return { action: "skip" as const, reason: "no_next" };
          }

          // Idempotency: chaseEvent same type+window
          const windowStart = new Date(now.getTime() - IDEMPOTENCY_WINDOW_MS);
          const exists = await hasChaseInWindow(chaseEventsRef, next.type, next.weekNumber, windowStart);
          if (exists) {
            tx.update(invoiceRef, { processingAt: FieldValue.delete() });
            return { action: "skip" as const, reason: "idempotent" };
          }

          return {
            action: "send" as const,
            next,
            customerName: d.customerName || "Customer",
            customerEmail: String(d.customerEmail).trim(),
            amount: typeof d.amount === "number" ? d.amount : Number(d.amount) || 0,
            paymentLink: d.paymentLink ?? null,
            invoiceNumber: d.invoiceNumber || doc.id.slice(0, 8),
            maxChases: typeof d.maxChases === "number" ? d.maxChases : 3,
            chaseCount: typeof d.chaseCount === "number" ? d.chaseCount : 0,
          };
        });

        if (result.action === "skip") {
          skipped++;
          continue;
        }

        processed++;
        const { next, customerName, customerEmail, amount, paymentLink, invoiceNumber, maxChases, chaseCount } = result;

        if (chaseCount >= maxChases) {
          await invoiceRef.update({
            nextChaseAt: FieldValue.delete(),
            processingAt: FieldValue.delete(),
          });
          skipped++;
          continue;
        }

        const template = renderChaseEmail(next.type, {
          customerName,
          customerEmail,
          amount,
          dueAt,
          paymentLink,
          invoiceNumber,
        }, next.weekNumber);

        if (dryRun) {
          functions.logger.info(
            `[runChaseScheduler] DRY_RUN would send ${next.type} to ${customerEmail} invoice=${doc.id}`
          );
          await chaseEventsRef.add({
            type: next.type,
            toEmail: customerEmail,
            dryRun: true,
            createdAt: FieldValue.serverTimestamp(),
            ...(next.weekNumber != null && { weekNumber: next.weekNumber }),
          });
          await invoiceRef.update({ processingAt: FieldValue.delete() });
          continue;
        }

        let messageId: string | undefined;
        let errMsg: string | undefined;

        try {
          const sent = await sendEmailSes({
            to: customerEmail,
            subject: template.subject,
            html: template.html,
            text: template.text,
          });
          messageId = sent.messageId;
        } catch (e) {
          errMsg = e instanceof Error ? e.message : String(e);
          functions.logger.warn(`[runChaseScheduler] sendEmailSes failed invoice=${doc.id}`, e);
        }

        const autoDays = typeof data.autoChaseDays === "number" ? data.autoChaseDays : 1;
        const nextRun = new Date(now.getTime() + autoDays * 86400000);

        await db.runTransaction(async (tx) => {
          const ev: Record<string, unknown> = {
            type: next.type,
            toEmail: customerEmail,
            createdAt: FieldValue.serverTimestamp(),
            ...(next.weekNumber != null && { weekNumber: next.weekNumber }),
            ...(messageId != null && { messageId }),
            ...(errMsg != null && { error: errMsg }),
          };
          tx.set(chaseEventsRef.doc(), ev);

          tx.update(invoiceRef, {
            lastChasedAt: Timestamp.fromDate(now),
            chaseCount: FieldValue.increment(1),
            nextChaseAt: errMsg ? Timestamp.fromDate(new Date(now.getTime() + 30 * 60 * 1000)) : Timestamp.fromDate(nextRun),
            processingAt: FieldValue.delete(),
          });
        });

        // Optional secondary log; send-history checks use chaseEvents (invoice subcollection).
        await db.collection("emailEvents").add({
          userId: uid,
          invoiceId: doc.id,
          type: next.type,
          to: customerEmail,
          originalTo: customerEmail,
          subject: template.subject,
          dryRun: false,
          createdAt: FieldValue.serverTimestamp(),
          ...(next.weekNumber != null && { weekNumber: next.weekNumber }),
          ...(messageId != null && { messageId }),
          ...(errMsg != null && { error: errMsg }),
        });

        if (messageId) sent++;
      } catch (e) {
        functions.logger.error(`[runChaseScheduler] invoice=${doc.id}`, e);
        try {
          await invoiceRef.update({ processingAt: FieldValue.delete() });
        } catch (_) {
          // best effort
        }
      }
    }

    functions.logger.info(
      `[runChaseScheduler] processed=${processed} sent=${sent} skipped=${snap.size - processed} dryRun=${dryRun}`
    );
}

/**
 * Scheduled job: runs chase logic every 5 minutes. Do not change;
 * shared logic lives in runChaseSchedulerLogic.
 */
export const runChaseScheduler = onSchedule(
  {
    schedule: "every 5 minutes",
    timeoutSeconds: 540,
    secrets: ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "SES_FROM_EMAIL"],
  },
  async () => {
    await runChaseSchedulerLogic();
  }
);
