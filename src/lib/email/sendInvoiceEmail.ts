/**
 * Send invoice email using templates and safe wrapper
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import { sendEmailSafe } from "./sendEmailSafe";
import { renderInvoiceEmail } from "./templates/invoiceTemplates";

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
  type: "invoice_initial" | "invoice_reminder" | "invoice_due" | "invoice_late_weekly";
  weekNumber?: number;
}

/**
 * Send an invoice email using templates and safe wrapper
 */
export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<void> {
  const { invoice, type, weekNumber } = params;

  // Resolve business profile for personalization (company name)
  let businessName: string | undefined;
  try {
    const db = getAdminFirestore();
    if (db && invoice.userId) {
      const snap = await db.collection("businessProfiles").doc(invoice.userId).get();
      const data = snap.data() as { companyName?: string } | undefined;
      if (data && typeof data.companyName === "string" && data.companyName.trim()) {
        businessName = data.companyName.trim();
      }
    }
  } catch (error) {
    console.error("[sendInvoiceEmail] Failed to load business profile for email", {
      userId: invoice.userId,
      invoiceId: invoice.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Render email template
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
  });

  // Send via safe wrapper
  await sendEmailSafe({
    userId: invoice.userId,
    invoiceId: invoice.id,
    to: invoice.customerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    type,
    metadata: weekNumber !== undefined ? { weekNumber } : undefined,
  });
}
