/**
 * Friendly email templates for invoice emails
 * Returns both HTML and plain text versions
 */

export interface InvoiceForEmail {
  id: string;
  customerName: string;
  customerEmail: string;
  amount: number; // in cents
  dueAt: string | Date; // ISO string or Date
  paymentLink?: string | null;
  invoiceNumber?: string;
  businessName?: string;
}

export interface EmailTemplateResult {
  subject: string;
  html: string;
  text: string;
}

/**
 * Format amount in cents to currency string
 */
function formatAmount(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

/**
 * Format due date as friendly string
 */
function formatDueDate(dueAt: string | Date): string {
  const date = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Render payment link section (HTML)
 */
function renderPaymentLinkHTML(paymentLink: string | null | undefined): string {
  if (!paymentLink || paymentLink.trim() === "") {
    return "";
  }

  return `
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #6b7280;">Payment Link:</p>
      <a href="${paymentLink}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Pay Invoice</a>
      <p style="margin: 12px 0 0 0; font-size: 12px; color: #9ca3af;">Or copy this link: <a href="${paymentLink}" style="color: #3b82f6; word-break: break-all;">${paymentLink}</a></p>
    </div>
  `;
}

/**
 * Render payment link section (text)
 */
function renderPaymentLinkText(paymentLink: string | null | undefined): string {
  if (!paymentLink || paymentLink.trim() === "") {
    return "";
  }

  return `\n\nPayment Link: ${paymentLink}`;
}

/**
 * Render initial invoice email
 */
export function renderInvoiceEmail(params: {
  type:
    | "invoice_initial"
    | "invoice_updated"
    | "invoice_reminder"
    | "invoice_due"
    | "invoice_late_weekly";
  invoice: InvoiceForEmail;
  weekNumber?: number;
}): EmailTemplateResult {
  const { type, invoice, weekNumber } = params;
  const amount = formatAmount(invoice.amount);
  const dueDate = formatDueDate(invoice.dueAt);
  const customerName = invoice.customerName || "Customer";
  const invoiceNumber = invoice.invoiceNumber || invoice.id.slice(0, 8);
  const businessName =
    invoice.businessName && invoice.businessName.trim().length > 0
      ? invoice.businessName.trim()
      : "Invoice Chaser";

  let subject: string;
  let greeting: string;
  let body: string;
  let closing: string;

  switch (type) {
    case "invoice_initial":
      subject = `Invoice #${invoiceNumber} - ${amount}`;
      greeting = `Hi ${customerName},`;
      body = `I hope this email finds you well. I'm reaching out to share your invoice for ${amount}, which is due on ${dueDate}.`;
      closing = `If you have any questions or need to discuss payment arrangements, please don't hesitate to reach out. I'm here to help!`;
      break;

    case "invoice_updated":
      subject = `Updated Invoice #${invoiceNumber} - ${amount}`;
      greeting = `Hi ${customerName},`;
      body = `I've updated your invoice #${invoiceNumber} for ${amount}, which is due on ${dueDate}. This email includes the latest details and replaces any previous versions you may have received.`;
      closing = `If anything looks incorrect or you have questions about the changes, please reply to this email so we can get it sorted quickly.`;
      break;

    case "invoice_reminder":
      subject = `Friendly Reminder: Invoice #${invoiceNumber} Due Soon`;
      greeting = `Hi ${customerName},`;
      body = `I wanted to send a quick reminder that your invoice #${invoiceNumber} for ${amount} is coming up soon. The due date is ${dueDate}.`;
      closing = `If you've already sent payment, thank you! If you have any questions, please feel free to reply to this email.`;
      break;

    case "invoice_due":
      subject = `Invoice #${invoiceNumber} - Due Today`;
      greeting = `Hi ${customerName},`;
      body = `I wanted to remind you that your invoice #${invoiceNumber} for ${amount} is due today (${dueDate}).`;
      closing = `If you've already sent payment, thank you so much! If you need any assistance or have questions, please don't hesitate to reach out.`;
      break;

    case "invoice_late_weekly":
      if (weekNumber === undefined) {
        throw new Error("weekNumber is required for invoice_late_weekly email type");
      }
      const weekText = weekNumber === 1 ? "first" : weekNumber === 2 ? "second" : weekNumber === 3 ? "third" : `${weekNumber}th`;
      subject = `Week ${weekNumber} Follow-up: Invoice #${invoiceNumber} - ${amount}`;
      greeting = `Hi ${customerName},`;
      body = `I wanted to follow up on invoice #${invoiceNumber} for ${amount}, which was due on ${dueDate}. This is our Week ${weekNumber} follow-up (${weekText} week).`;
      closing = `I understand that sometimes things come up, and I'm happy to work with you on a payment plan if needed. Please let me know if you'd like to discuss options or if you have any questions.`;
      break;

    default:
      throw new Error(`Unknown email type: ${type}`);
  }

  const paymentLinkHTML = renderPaymentLinkHTML(invoice.paymentLink);
  const paymentLinkText = renderPaymentLinkText(invoice.paymentLink);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">${greeting}</p>
    <p style="margin: 0 0 16px 0; font-size: 16px;">${body}</p>
    <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; font-weight: 500;">Invoice Details:</p>
      <p style="margin: 4px 0; font-size: 16px;"><strong>Invoice #${invoiceNumber}</strong></p>
      <p style="margin: 4px 0; font-size: 16px;"><strong>Amount:</strong> ${amount}</p>
      <p style="margin: 4px 0; font-size: 16px;"><strong>Due Date:</strong> ${dueDate}</p>
    </div>
    <p style="margin: 16px 0 0 0; font-size: 16px;">${closing}</p>
    ${paymentLinkHTML}
    <p style="margin: 32px 0 0 0; font-size: 14px; color: #6b7280;">Best regards,<br>${businessName}</p>
  </div>
</body>
</html>
  `.trim();

const text = `
${greeting}

${body}

Invoice Details:
- Invoice #${invoiceNumber}
- Amount: ${amount}
- Due Date: ${dueDate}

${closing}${paymentLinkText}

Best regards,
${businessName}
  `.trim();

  return { subject, html, text };
}
