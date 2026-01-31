/**
 * Send invoice email using templates and safe wrapper
 */

import { getAuth } from "firebase-admin/auth";
import { getAdminApp, getAdminFirestore } from "@/lib/firebase-admin";
import { sendEmailSafe } from "./sendEmailSafe";
import { renderInvoiceEmail } from "./templates/invoiceTemplates";

const SUPPORT_EMAIL = "support@invoicechaser.online";

export interface InvoiceForEmailSend {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  amount: number; // in cents
  dueAt: string | Date; // ISO string or Date
  paymentLink?: string | null;
  invoiceNumber?: string;
}

export interface SendInvoiceEmailParams {
  invoice: InvoiceForEmailSend;
  type: "invoice_initial" | "invoice_updated" | "invoice_reminder" | "invoice_due" | "invoice_late_weekly";
  weekNumber?: number;
}

/**
 * Send an invoice email using templates and safe wrapper
 */
export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<void> {
  const { invoice, type, weekNumber } = params;

  // Business profile: businessProfiles/{uid}, fields companyName, companyEmail, phone
  let businessName: string | undefined;
  let companyName = "";
  let companyEmail = "";
  let companyPhone = "";
  try {
    const db = getAdminFirestore();
    if (db && invoice.userId) {
      const snap = await db.collection("businessProfiles").doc(invoice.userId).get();
      const data = snap.data() as { companyName?: string; companyEmail?: string | null; phone?: string | null } | undefined;
      if (data) {
        if (typeof data.companyName === "string" && data.companyName.trim()) {
          businessName = data.companyName.trim();
          companyName = businessName;
        }
        if (typeof data.companyEmail === "string" && data.companyEmail.trim()) {
          companyEmail = data.companyEmail.trim();
        }
        if (typeof data.phone === "string" && data.phone.trim()) {
          companyPhone = data.phone.trim();
        }
      }
    }
  } catch (error) {
    console.error("[sendInvoiceEmail] Failed to load business profile for email", {
      userId: invoice.userId,
      invoiceId: invoice.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let userEmail = "";
  if (invoice.userId) {
    try {
      const userRecord = await getAuth(getAdminApp()).getUser(invoice.userId);
      if (userRecord.email?.trim()) userEmail = userRecord.email.trim();
    } catch {
      /* ignore */
    }
  }
  companyEmail = companyEmail || userEmail || SUPPORT_EMAIL;
  if (!companyName) companyName = "the business";

  const fromName = `${companyName} (via Invoice Chaser)`;
  const replyTo = companyEmail;

  // Render email template (footer built inside from companyName, companyEmail, companyPhone)
  const template = renderInvoiceEmail({
    type,
    invoice: {
      id: invoice.id,
      customerName: invoice.customerName,
      customerEmail: invoice.customerEmail,
      amount: invoice.amount,
      dueAt: invoice.dueAt,
      paymentLink: invoice.paymentLink,
      invoiceNumber: invoice.invoiceNumber,
      businessName,
    },
    weekNumber,
    companyName,
    companyEmail,
    companyPhone,
  });

  await sendEmailSafe({
    userId: invoice.userId,
    invoiceId: invoice.id,
    to: invoice.customerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    type,
    metadata: weekNumber !== undefined ? { weekNumber } : undefined,
    fromName,
    replyTo,
  });
}
