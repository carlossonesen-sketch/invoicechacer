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
const FALLBACK_LIMIT = 25;  // max legacy invoices missing nextChaseAt to fix per run
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

function redactEmail(email: string): string {
  if (!email || email.length < 4) return "***";
  const at = email.indexOf("@");
  if (at <= 0) return "***@***";
  return email.slice(0, 2) + "***@" + (email.slice(at + 1, at + 3) || "**") + "***";
}

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

    // Debug: log now and exact query filters
    const queryFilters = {
      collectionGroup: "invoices",
      statusIn: ["pending", "overdue"] as const,
      autoChaseEnabled: true,
      nextChaseAtLte: now.toISOString(),
      nextChaseAtLteTimestamp: now.getTime(),
      limit,
    };
    functions.logger.info("[runChaseScheduler] debug now and query", {
      now: now.toISOString(),
      nowTimestamp: now.getTime(),
      queryFilters,
    });

    // Main query: unpaid, auto-chase on, nextChaseAt <= now (canonical path: businessProfiles/{uid}/invoices)
    const snap = await db
      .collectionGroup("invoices")
      .where("status", "in", ["pending", "overdue"])
      .where("autoChaseEnabled", "==", true)
      .where("nextChaseAt", "<=", Timestamp.fromDate(now))
      .limit(limit)
      .get();

    let processed = 0;
    let sent = 0;
    let candidatesFound = snap.size;
    let candidatesMissingNextChaseAt = 0;
    let candidatesFilteredOutPaid = 0; // query already excludes paid (status in pending/overdue)
    let candidatesFilteredOutNoEmail = 0;
    let candidatesFilteredOutNoDueAt = 0;
    let candidatesFilteredOutPlanLimit = 0; // scheduler does not apply plan limit
    const skipReasons: Record<string, number> = {
      locked: 0,
      lastChasedAt: 0,
      no_next: 0,
      idempotent: 0,
      maxChasesReached: 0,
      not_found: 0,
    };

    // Build list to process: main snap + legacy invoices missing nextChaseAt (set nextChaseAt=now then process)
    const toProcess: admin.firestore.QueryDocumentSnapshot[] = [...snap.docs];

    if (snap.empty) {
      const fallbackSnap = await db
        .collectionGroup("invoices")
        .where("status", "in", ["pending", "overdue"])
        .where("autoChaseEnabled", "==", true)
        .limit(limit * 4)
        .get();
      const missingNext = fallbackSnap.docs.filter((d) => d.data().nextChaseAt == null);
      const capped = missingNext.slice(0, FALLBACK_LIMIT);
      candidatesMissingNextChaseAt = missingNext.length;
      functions.logger.info("[runChaseScheduler] zero candidates from main query; running fallback for legacy missing nextChaseAt", {
        queryParams: queryFilters,
        candidatesFound: snap.size,
        fallbackTotal: fallbackSnap.size,
        fallbackMissingNextChaseAt: missingNext.length,
        fallbackCapped: capped.length,
      });
      for (const doc of capped) {
        try {
          await doc.ref.update({ nextChaseAt: Timestamp.fromDate(now) });
          toProcess.push(doc);
        } catch (e) {
          functions.logger.warn("[runChaseScheduler] fallback set nextChaseAt failed", { invoiceId: doc.id, error: String(e) });
        }
      }
    }

    functions.logger.info("[runChaseScheduler] debug counts after query", {
      candidatesFound,
      candidatesMissingNextChaseAt,
      candidatesFilteredOutPaid,
      candidatesFilteredOutNoEmail,
      candidatesFilteredOutNoDueAt,
      candidatesFilteredOutPlanLimit,
      toProcessLength: toProcess.length,
    });

    let candidateDebugIndex = 0;
    for (const doc of toProcess) {
      const data = doc.data();
      const invoiceRef = doc.ref;
      const uid = invoiceRef.parent?.parent?.id ?? data.userId ?? "";
      const invoiceId = doc.id;
      // Path: businessProfiles/{uid}/invoices/{invoiceId}/chaseEvents (matches app)
      const chaseEventsRef = db
        .collection("businessProfiles")
        .doc(uid)
        .collection("invoices")
        .doc(invoiceId)
        .collection("chaseEvents");

      const logFirstFive = (reason: string) => {
        if (candidateDebugIndex >= 5) return;
        const d = doc.data();
        const dueAtVal = toDate(d.dueAt);
        const nextChaseVal = toDate(d.nextChaseAt);
        const lastChasedVal = toDate(d.lastChasedAt);
        functions.logger.info("[runChaseScheduler] debug candidate", {
          index: candidateDebugIndex + 1,
          invoiceId: doc.id,
          dueAt: dueAtVal ? dueAtVal.toISOString() : null,
          nextChaseAt: nextChaseVal ? nextChaseVal.toISOString() : null,
          lastChasedAt: lastChasedVal ? lastChasedVal.toISOString() : null,
          chaseCount: typeof d.chaseCount === "number" ? d.chaseCount : 0,
          status: d.status ?? null,
          paidAt: d.paidAt != null ? (typeof d.paidAt === "object" && "toDate" in d.paidAt ? (d.paidAt as admin.firestore.Timestamp).toDate().toISOString() : String(d.paidAt)) : null,
          customerEmailRedacted: d.customerEmail ? redactEmail(String(d.customerEmail)) : null,
          planTier: "not_checked",
          reason,
        });
        candidateDebugIndex++;
      };

      if (!data.customerEmail?.trim() || !data.dueAt) {
        if (!data.customerEmail?.trim()) candidatesFilteredOutNoEmail++;
        if (!data.dueAt) candidatesFilteredOutNoDueAt++;
        logFirstFive("noEmail_or_noDueAt");
        continue;
      }

      const dueAt = toDate(data.dueAt);
      if (!dueAt) {
        candidatesFilteredOutNoDueAt++;
        logFirstFive("noDueAt_invalid");
        continue;
      }

      try {
        const result = await db.runTransaction(async (tx) => {
          const inv = await tx.get(invoiceRef);
          if (!inv.exists) return { action: "skip" as const, reason: "not_found" as const };
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
          const reason = result.reason ?? "unknown";
          skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
          logFirstFive(reason);
          continue;
        }

        processed++;
        const { next, customerName, customerEmail, amount, paymentLink, invoiceNumber, maxChases, chaseCount } = result;

        if (chaseCount >= maxChases) {
          skipReasons.maxChasesReached++;
          logFirstFive("maxChasesReached");
          await invoiceRef.update({
            nextChaseAt: FieldValue.delete(),
            processingAt: FieldValue.delete(),
          });
          continue;
        }

        logFirstFive("send");

        let companyName = "Invoice Chaser";
        let companyEmail = "support@invoicechaser.online";
        let companyPhone = "";
        try {
          const profileSnap = await db.collection("businessProfiles").doc(uid).get();
          const profile = profileSnap.data() as { companyName?: string; companyEmail?: string | null; phone?: string | null } | undefined;
          if (profile) {
            if (typeof profile.companyName === "string" && profile.companyName.trim()) {
              companyName = profile.companyName.trim();
            }
            if (typeof profile.companyEmail === "string" && profile.companyEmail.trim()) {
              companyEmail = profile.companyEmail.trim();
            }
            if (typeof profile.phone === "string" && profile.phone.trim()) {
              companyPhone = profile.phone.trim();
            }
          }
        } catch {
          /* keep fallbacks */
        }

        const template = renderChaseEmail(
          next.type,
          {
            customerName,
            customerEmail,
            amount,
            dueAt,
            paymentLink,
            invoiceNumber,
          },
          next.weekNumber,
          companyName,
          companyEmail,
          companyPhone
        );

        const fromName = `${companyName} (via Invoice Chaser)`;
        const replyTo = companyEmail;

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
          const sendResult = await sendEmailSes({
            to: customerEmail,
            subject: template.subject,
            html: template.html,
            text: template.text,
            fromName,
            replyTo,
          });
          messageId = sendResult.messageId;
          functions.logger.info("[runChaseScheduler] sent", {
            invoiceId: doc.id,
            recipient: customerEmail,
            templateType: next.type,
            messageId: sendResult.messageId ?? undefined,
          });
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

    functions.logger.info("[runChaseScheduler] debug counts final", {
      now: now.toISOString(),
      queryFilters,
      candidatesFound,
      candidatesMissingNextChaseAt,
      candidatesFilteredOutPaid,
      candidatesFilteredOutNoEmail,
      candidatesFilteredOutNoDueAt: candidatesFilteredOutNoDueAt,
      candidatesFilteredOutPlanLimit,
      skipReasons,
      toProcessLength: toProcess.length,
      processed,
      sent,
      dryRun,
    });
    functions.logger.info(
      `[runChaseScheduler] processed=${processed} sent=${sent} skipped=${toProcess.length - processed} dryRun=${dryRun}`
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
