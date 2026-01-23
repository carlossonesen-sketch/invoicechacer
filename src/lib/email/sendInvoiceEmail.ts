/**
 * Send invoice email using templates and safe wrapper
 */

import { sendEmailSafe } from "./sendEmailSafe";
import { renderInvoiceEmail, InvoiceForEmail } from "./templates/invoiceTemplates";

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
