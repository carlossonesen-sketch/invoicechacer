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
import { getEmailConfig } from "./emailConfig";
import { assertEmailSendingAllowed, assertAutoChaseAllowed, applyTestRedirect } from "./emailGuards";
import { assertEmailLimits } from "./emailLimits";
import { Timestamp } from "firebase-admin/firestore";

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
    [key: string]: any;
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
  metadata?: Record<string, any>;
}

/**
 * Placeholder email sending function
 * Replace this with your actual email provider (SendGrid, SES, etc.)
 */
async function fakeEmailSend(params: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<void> {
  // TODO: Replace with actual email provider integration
  console.log("[EMAIL SEND]", {
    to: params.to,
    subject: params.subject,
    html: params.html ? "[HTML content]" : undefined,
    text: params.text ? "[Text content]" : undefined,
  });
}

/**
 * Remove undefined values from an object (shallow)
 * Firestore cannot accept undefined values, so we must exclude them
 */
function compactUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key as keyof T] = value;
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
  const cleanEvent = compactUndefined(event);

  const emailEventsRef = db.collection("emailEvents");
  await emailEventsRef.add(cleanEvent);
}

/**
 * Send email safely with all guards and limits enforced
 */
export async function sendEmailSafe(params: SendEmailParams): Promise<void> {
  const config = getEmailConfig();
  const { userId, invoiceId, to, subject, html, text, type, metadata } = params;

  // Step 1: Enforce kill switches
  assertEmailSendingAllowed();
  assertAutoChaseAllowed();

  // Step 2: Enforce rate limits
  await assertEmailLimits({ userId, invoiceId });

  // Step 3: Apply domain allowlist redirect
  const { finalEmail, redirected } = applyTestRedirect(to);

  // Step 4: Handle DRY RUN mode
  if (config.autoChaseDryRun) {
    console.log("[EMAIL DRY RUN]", {
      userId,
      invoiceId,
      type,
      originalTo: to,
      finalTo: finalEmail,
      redirected,
      subject,
    });

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

  // Step 5: Real send (not dry run)
  try {
    await fakeEmailSend({
      to: finalEmail,
      subject,
      html,
      text,
    });

    // Write event for successful send
    // Note: weekNumber and metadata are optional and may be undefined
    // writeEmailEvent will strip undefined values before writing to Firestore
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
    };

    await writeEmailEvent(event);
  } catch (error) {
    // Log error but don't write event for failed sends
    console.error("[EMAIL SEND ERROR]", {
      userId,
      invoiceId,
      to: finalEmail,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
