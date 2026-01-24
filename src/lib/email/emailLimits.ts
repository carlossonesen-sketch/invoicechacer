/**
 * Email rate limiting using Firestore
 * Enforces per-user, global daily limits, per-invoice cooldown, and plan-based limits
 * 
 * Cooldown Override (non-production only):
 * - Set EMAIL_COOLDOWN_MINUTES_OVERRIDE=0 to fully bypass cooldown checks
 * - Only works when NODE_ENV !== "production"
 * - Trial plan limits (including weekNumber 1-3 restriction) are ALWAYS enforced,
 *   even when cooldown is disabled
 * 
 * Error Status Codes:
 * - 429 (Too Many Requests): EMAIL_COOLDOWN_ACTIVE, MAX_EMAILS_PER_DAY_*
 * - 403 (Forbidden): TRIAL_* limit errors
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import { getEmailConfig } from "./emailConfig";
import { Timestamp } from "firebase-admin/firestore";
import { getPlanForUser, getPlanLimits } from "@/lib/billing/plan";
import { ApiError } from "@/lib/api/ApiError";

export interface EmailLimitParams {
  userId: string;
  invoiceId: string;
  emailType?: "invoice_initial" | "invoice_reminder" | "invoice_due" | "invoice_late_weekly";
  weekNumber?: number;
}

/**
 * Get start of day in local timezone (UTC for simplicity)
 * Returns a Timestamp representing today at 00:00:00 UTC
 */
function getStartOfDay(): Timestamp {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  return Timestamp.fromDate(startOfDay);
}

/**
 * Count email events for a user since start of day
 */
async function countUserEmailsToday(userId: string): Promise<number> {
  const db = getAdminFirestore();
  if (!db) {
    throw new Error("Firebase Admin not initialized");
  }

  const startOfDay = getStartOfDay();
  const emailEventsRef = db.collection("emailEvents");
  
  try {
    // Use count() aggregation if available (Firestore v9+)
    const snapshot = await emailEventsRef
      .where("userId", "==", userId)
      .where("createdAt", ">=", startOfDay)
      .count()
      .get();
    
    return snapshot.data().count;
  } catch {
    // Fallback: fetch limited docs and count
    // This is safe because we're only counting, not reading all data
    const snapshot = await emailEventsRef
      .where("userId", "==", userId)
      .where("createdAt", ">=", startOfDay)
      .limit(1000) // Safety limit
      .get();
    
    return snapshot.size;
  }
}

/**
 * Count global email events since start of day
 */
async function countGlobalEmailsToday(): Promise<number> {
  const db = getAdminFirestore();
  if (!db) {
    throw new Error("Firebase Admin not initialized");
  }

  const startOfDay = getStartOfDay();
  const emailEventsRef = db.collection("emailEvents");
  
  try {
    const snapshot = await emailEventsRef
      .where("createdAt", ">=", startOfDay)
      .count()
      .get();
    
    return snapshot.data().count;
  } catch {
    // Fallback: fetch limited docs and count
    const snapshot = await emailEventsRef
      .where("createdAt", ">=", startOfDay)
      .limit(10000) // Safety limit for global
      .get();
    
    return snapshot.size;
  }
}

/**
 * Get most recent email event for an invoice
 */
async function getLastEmailForInvoice(invoiceId: string): Promise<Timestamp | null> {
  const db = getAdminFirestore();
  if (!db) {
    throw new Error("Firebase Admin not initialized");
  }

  const emailEventsRef = db.collection("emailEvents");
  
  const snapshot = await emailEventsRef
    .where("invoiceId", "==", invoiceId)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  const lastEvent = snapshot.docs[0].data();
  return lastEvent.createdAt as Timestamp;
}

/**
 * Count email events for a specific invoice and type
 * Used for per-invoice type caps (e.g., trial limits)
 */
export async function countInvoiceEmailEvents(
  invoiceId: string,
  type: "invoice_initial" | "invoice_reminder" | "invoice_due" | "invoice_late_weekly",
  weekNumber?: number
): Promise<number> {
  const db = getAdminFirestore();
  if (!db) {
    throw new Error("Firebase Admin not initialized");
  }

  const emailEventsRef = db.collection("emailEvents");
  let query = emailEventsRef
    .where("invoiceId", "==", invoiceId)
    .where("type", "==", type);

  // For late weekly emails, also filter by weekNumber
  if (type === "invoice_late_weekly" && weekNumber !== undefined) {
    query = query.where("weekNumber", "==", weekNumber);
  }

  try {
    const snapshot = await query.count().get();
    return snapshot.data().count;
  } catch {
    // Fallback: fetch and count
    const snapshot = await query.limit(100).get();
    return snapshot.size;
  }
}

/**
 * Count total chase emails (invoice_late_weekly) for an invoice
 * Used to enforce trial limit of 3 total chase emails
 */
async function countInvoiceChaseEmails(invoiceId: string): Promise<number> {
  const db = getAdminFirestore();
  if (!db) {
    throw new Error("Firebase Admin not initialized");
  }

  const emailEventsRef = db.collection("emailEvents");
  
  try {
    const snapshot = await emailEventsRef
      .where("invoiceId", "==", invoiceId)
      .where("type", "==", "invoice_late_weekly")
      .count()
      .get();
    
    return snapshot.data().count;
  } catch {
    // Fallback: fetch and count
    const snapshot = await emailEventsRef
      .where("invoiceId", "==", invoiceId)
      .where("type", "==", "invoice_late_weekly")
      .limit(100)
      .get();
    
    return snapshot.size;
  }
}

/**
 * Assert that email limits are not exceeded
 * Throws if any limit is exceeded with structured error codes
 */
export async function assertEmailLimits(params: EmailLimitParams): Promise<void> {
  const config = getEmailConfig();
  const { userId, invoiceId, emailType, weekNumber } = params;

  // Get user's plan and limits
  const plan = await getPlanForUser(userId);
  const planLimits = getPlanLimits(plan);

  // Get cooldown (allow env override for dev testing in non-production only)
  // EMAIL_COOLDOWN_MINUTES_OVERRIDE=0 fully bypasses cooldown checks
  let cooldownMinutes = planLimits.cooldownMinutes;
  if (process.env.NODE_ENV !== "production" && process.env.EMAIL_COOLDOWN_MINUTES_OVERRIDE !== undefined) {
    const overrideValue = parseInt(process.env.EMAIL_COOLDOWN_MINUTES_OVERRIDE, 10);
    if (!isNaN(overrideValue) && overrideValue >= 0) {
      cooldownMinutes = overrideValue;
    }
  }

  // Check per-user daily limit (use plan limit or config, whichever is lower)
  const userCount = await countUserEmailsToday(userId);
  const dailyCap = Math.min(planLimits.dailyEmailCap, config.maxEmailsPerDayPerUser);
  if (userCount >= dailyCap) {
    throw new ApiError(
      "MAX_EMAILS_PER_DAY_PER_USER_EXCEEDED",
      `MAX_EMAILS_PER_DAY_PER_USER_EXCEEDED: ${userCount}/${dailyCap}`,
      429
    );
  }

  // Check global daily limit
  const globalCount = await countGlobalEmailsToday();
  if (globalCount >= config.maxEmailsPerDayGlobal) {
    throw new ApiError(
      "MAX_EMAILS_PER_DAY_GLOBAL_EXCEEDED",
      `MAX_EMAILS_PER_DAY_GLOBAL_EXCEEDED: ${globalCount}/${config.maxEmailsPerDayGlobal}`,
      429
    );
  }

  // Check per-invoice cooldown (bypassed if EMAIL_COOLDOWN_MINUTES_OVERRIDE=0 in non-production)
  // Note: Trial plan limits (including weekNumber 1-3 restriction) are checked AFTER cooldown
  // to ensure they are always enforced, even when cooldown is disabled
  const lastEmailTime = await getLastEmailForInvoice(invoiceId);
  if (lastEmailTime && cooldownMinutes > 0) {
    const now = Timestamp.now();
    const cooldownSeconds = cooldownMinutes * 60;
    const secondsSinceLastEmail = now.seconds - lastEmailTime.seconds;
    
    if (secondsSinceLastEmail < cooldownSeconds) {
      const remainingMinutes = Math.ceil((cooldownSeconds - secondsSinceLastEmail) / 60);
      throw new ApiError(
        "EMAIL_COOLDOWN_ACTIVE",
        `EMAIL_COOLDOWN_ACTIVE: ${remainingMinutes} minutes remaining`,
        429
      );
    }
  }

  // For trial plan: enforce per-invoice type caps
  // These checks run AFTER cooldown, so trial limits are always enforced even when cooldown is disabled
  if (plan === "trial" && emailType) {
    const typeCap = planLimits.perInvoiceTypeCaps[emailType];
    
    if (typeCap !== Infinity) {
      if (emailType === "invoice_late_weekly") {
        // For late weekly: check total chase emails (max 3) and weekNumber (must be 1-3)
        if (weekNumber === undefined || weekNumber < 1 || weekNumber > 3) {
          throw new ApiError(
            "TRIAL_CHASE_LIMIT_REACHED",
            "TRIAL_CHASE_LIMIT_REACHED: Trial plan allows only weeks 1-3 for late emails",
            403
          );
        }

        // Check if this specific week already sent
        const weekCount = await countInvoiceEmailEvents(invoiceId, emailType, weekNumber);
        if (weekCount >= 1) {
          throw new ApiError(
            "TRIAL_CHASE_LIMIT_REACHED",
            `TRIAL_CHASE_LIMIT_REACHED: Week ${weekNumber} email already sent for this invoice`,
            403
          );
        }

        // Check total chase emails (max 3)
        const totalChaseCount = await countInvoiceChaseEmails(invoiceId);
        if (totalChaseCount >= typeCap) {
          throw new ApiError(
            "TRIAL_CHASE_LIMIT_REACHED",
            `TRIAL_CHASE_LIMIT_REACHED: Trial plan allows maximum ${typeCap} chase emails per invoice. Upgrade to send more.`,
            403
          );
        }
      } else {
        // For other types: check count for this type
        const count = await countInvoiceEmailEvents(invoiceId, emailType);
        if (count >= typeCap) {
          const errorCode = emailType === "invoice_reminder" 
            ? "TRIAL_REMINDER_LIMIT_REACHED"
            : emailType === "invoice_initial"
            ? "TRIAL_INITIAL_LIMIT_REACHED"
            : "TRIAL_EMAIL_LIMIT_REACHED";
          throw new ApiError(
            errorCode,
            `${errorCode}: Trial plan allows only ${typeCap} ${emailType} email(s) per invoice. Upgrade to send more.`,
            403
          );
        }
      }
    }
  }
}
