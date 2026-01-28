/**
 * Safe email sending wrapper with production test mode support
 * 
 * Use this for all outbound invoice and chase emails.
 * 
 * This function enforces:
 * - Kill switches (EMAIL_SENDING_ENABLED, AUTOCHASE_ENABLED)
 * - DRY RUN mode (logs but doesn't send)
 * - Domain allowlist with redirect
 * - Rate limiting (per-user, global, cooldown)
 * - Event logging to Firestore
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import { getInvoiceRef } from "@/lib/invoicePaths";
import { getEmailConfig } from "./emailConfig";
import { assertAutoChaseAllowed, applyTestRedirect } from "./emailGuards";
import { assertEmailLimits } from "./emailLimits";
import { Timestamp } from "firebase-admin/firestore";
import { ApiError, isApiError } from "@/lib/api/ApiError";

export interface SendEmailParams {
  userId: string;
  invoiceId: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  type: "invoice" | "chase" | "reminder" | "invoice_initial" | "invoice_reminder" | "invoice_due" | "invoice_late_weekly";
  metadata?: {
    weekNumber?: number;
    [key: string]: unknown;
  };
}

export interface EmailEvent {
  userId: string;
  invoiceId: string;
  type: string;
  to: string; // Final recipient (after redirect)
  originalTo: string; // Original recipient
  subject: string;
  dryRun: boolean;
  createdAt: Timestamp;
  weekNumber?: number;
  metadata?: Record<string, unknown>;
  /** Resend message ID when send succeeded */
  messageId?: string;
  /** Error message when send or write failed */
  error?: string;
}

const isProd = () => process.env.NODE_ENV === "production";

/**
 * Send email via Resend when RESEND_API_KEY is set; otherwise log only.
 * Uses RESEND_FROM or "Invoice Chaser <onboarding@resend.dev>" for testing.
 * When using Resend, both html and text are required (multipart for deliverability).
 * In production, logs avoid PII (no email addresses, userId).
 * Returns Resend message ID on successful send when available.
 */
async function sendEmailTransport(
  params: { to: string; subject: string; html?: string; text?: string },
  logContext?: { invoiceId: string; type: string }
): Promise<string | undefined> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() || "Invoice Chaser <onboarding@resend.dev>";

  if (apiKey) {
    if (!params.html || !params.text) {
      throw new ApiError(
        "EMAIL_MISSING_HTML_OR_TEXT",
        "Both html and text parts are required for sending. Check that the template returns both.",
        500
      );
    }
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    if (error) {
      throw new ApiError("RESEND_SEND_FAILED", `Resend: ${error.message}`, 502);
    }
    return data?.id;
  }

  if (isProd() && logContext) {
    console.log("[EMAIL SEND] No RESEND_API_KEY; logging only", logContext);
  } else {
    console.log("[EMAIL SEND] No RESEND_API_KEY; logging only", {
      to: params.to,
      subject: params.subject,
      html: params.html ? "[HTML content]" : undefined,
      text: params.text ? "[Text content]" : undefined,
    });
  }
  return undefined;
}

/**
 * Remove undefined values from an object (shallow)
 * Firestore cannot accept undefined values, so we must exclude them
 */
function compactUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  return result;
}

/**
 * Write email event to Firestore
 * Ensures undefined values are never written (Firestore rejects them)
 */
async function writeEmailEvent(event: EmailEvent): Promise<void> {
  const db = getAdminFirestore();
  if (!db) {
    throw new Error("Firebase Admin not initialized");
  }

  // Remove undefined fields before writing to Firestore
  // Firestore throws "Cannot use undefined as a Firestore value" if undefined is present
  const cleanEvent = compactUndefined(event as unknown as Record<string, unknown>);

  const emailEventsRef = db.collection("emailEvents");
  await emailEventsRef.add(cleanEvent);
}

/**
 * Send email safely with all guards and limits enforced
 */
export async function sendEmailSafe(params: SendEmailParams): Promise<void> {
  const config = getEmailConfig();
  const { userId, invoiceId, to, subject, html, text, type, metadata } = params;

  // Step 0: Hard guard - verify invoice status is "pending"
  // This prevents emails from being sent to paid or overdue invoices
  const db = getAdminFirestore();
  if (db && invoiceId) {
    const invoiceRef = getInvoiceRef(db, userId, invoiceId);
    const invoiceDoc = await invoiceRef.get();
    if (invoiceDoc.exists) {
      const invoiceData = invoiceDoc.data();
      if (invoiceData && invoiceData.status !== "pending") {
        throw new ApiError(
          "INVOICE_NOT_PENDING",
          `Invoice status is "${invoiceData.status}", not "pending". Cannot send emails for non-pending invoices.`,
          403
        );
      }
    }
  }

  // Step 1: Check EMAIL_SENDING_ENABLED - if disabled, log and return early
  if (!config.emailSendingEnabled) {
    if (isProd()) {
      console.log("[EMAIL SENDING DISABLED] Email send blocked by EMAIL_SENDING_ENABLED=false", { invoiceId, type });
    } else {
      console.log("[EMAIL SENDING DISABLED] Email send blocked by EMAIL_SENDING_ENABLED=false", {
        invoiceId,
        recipient: to,
        type,
        userId,
        subject,
      });
    }

    // Write event with dryRun flag to track attempted sends
    const event: EmailEvent = {
      userId,
      invoiceId,
      type,
      to,
      originalTo: to,
      subject,
      dryRun: true,
      createdAt: Timestamp.now(),
      weekNumber: metadata?.weekNumber,
      metadata: metadata ? { ...metadata } : undefined,
    };

    await writeEmailEvent(event);
    return;
  }

  // Step 2: Enforce auto-chase kill switch
  assertAutoChaseAllowed();

  // Step 3: Enforce rate limits (plan-aware, includes per-invoice type caps for trial)
  await assertEmailLimits({ 
    userId, 
    invoiceId,
    emailType: type as "invoice_initial" | "invoice_reminder" | "invoice_due" | "invoice_late_weekly" | undefined,
    weekNumber: metadata?.weekNumber,
  });

  // Step 4: Apply domain allowlist redirect
  const { finalEmail, redirected } = applyTestRedirect(to);

  // Step 5: Handle DRY RUN mode (EMAIL_DRY_RUN or AUTOCHASE_DRY_RUN)
  if (config.emailDryRun || config.autoChaseDryRun) {
    const dryRunReason = config.emailDryRun ? "EMAIL_DRY_RUN=true" : "AUTOCHASE_DRY_RUN=true";
    if (isProd()) {
      console.log(`[EMAIL DRY RUN] Email send blocked by ${dryRunReason}`, { invoiceId, type });
    } else {
      console.log(`[EMAIL DRY RUN] Email send blocked by ${dryRunReason}`, {
        invoiceId,
        recipient: finalEmail,
        originalRecipient: to,
        type,
        userId,
        subject,
        redirected,
      });
    }

    // Write event with dryRun flag
    // Note: weekNumber and metadata are optional and may be undefined
    // writeEmailEvent will strip undefined values before writing to Firestore
    const event: EmailEvent = {
      userId,
      invoiceId,
      type,
      to: finalEmail,
      originalTo: to,
      subject,
      dryRun: true,
      createdAt: Timestamp.now(),
      weekNumber: metadata?.weekNumber,
      metadata: metadata ? { ...metadata } : undefined,
    };

    await writeEmailEvent(event);
    return;
  }

  // Step 6: Real send (not disabled, not dry run)
  if (isProd()) {
    console.log("[EMAIL SEND] Sending email", { invoiceId, type });
  } else {
    console.log("[EMAIL SEND] Sending email", {
      invoiceId,
      recipient: finalEmail,
      originalRecipient: to,
      type,
      userId,
      subject,
      redirected,
    });
  }

  try {
    const messageId = await sendEmailTransport(
      { to: finalEmail, subject, html, text },
      { invoiceId, type }
    );

    if (isProd()) {
      console.log("[EMAIL SEND] sent", { invoiceId, type, messageId: messageId ?? undefined });
    } else {
      console.log("[EMAIL SEND] sent", {
        invoiceId,
        recipient: finalEmail,
        type,
        messageId: messageId ?? undefined,
        userId,
      });
    }

    // Write event for successful send
    const event: EmailEvent = {
      userId,
      invoiceId,
      type,
      to: finalEmail,
      originalTo: to,
      subject,
      dryRun: false,
      createdAt: Timestamp.now(),
      weekNumber: metadata?.weekNumber,
      metadata: metadata ? { ...metadata } : undefined,
      messageId,
    };

    await writeEmailEvent(event);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    const suppressed = /suppress|Suppression/i.test(errMsg);
    if (suppressed) {
      console.warn("[EMAIL SEND] suppressed", { recipient: finalEmail, type, invoiceId });
    }
    if (isProd()) {
      console.error("[EMAIL SEND ERROR] Failed to send email", { invoiceId, type, error: errMsg });
    } else {
      console.error("[EMAIL SEND ERROR] Failed to send email", {
        invoiceId,
        recipient: finalEmail,
        type,
        userId,
        error: errMsg,
      });
    }

    // Write failed-email event for diagnostics (dryRun: true = not a delivered send)
    try {
      const failedEvent: EmailEvent = {
        userId,
        invoiceId,
        type,
        to: finalEmail,
        originalTo: to,
        subject,
        dryRun: true,
        createdAt: Timestamp.now(),
        weekNumber: metadata?.weekNumber,
        metadata: metadata ? { ...metadata } : undefined,
        error: errMsg,
      };
      await writeEmailEvent(failedEvent);
    } catch (writeErr) {
      console.error("[EMAIL SEND ERROR] Failed to write failed-email event", {
        invoiceId,
        type,
        writeError: writeErr instanceof Error ? writeErr.message : "Unknown error",
      });
    }

    if (isApiError(error)) {
      throw error;
    }
    throw error;
  }
}
