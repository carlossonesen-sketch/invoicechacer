/**
 * Minimal invoice chase email templates for Firebase Functions.
 * Types: invoice_reminder, invoice_due, invoice_late_weekly.
 */

export interface ChaseInvoice {
  customerName: string;
  customerEmail: string;
  amount: number; // cents
  dueAt: Date;
  paymentLink?: string | null;
  invoiceNumber?: string;
}

export interface ChaseTemplateResult {
  subject: string;
  html: string;
  text: string;
}

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDueDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function paymentLinkHtml(link: string | null | undefined): string {
  if (!link?.trim()) return "";
  return `
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #6b7280;">Payment Link:</p>
      <a href="${link}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px;">Pay Invoice</a>
    </div>`;
}

function paymentLinkText(link: string | null | undefined): string {
  if (!link?.trim()) return "";
  return `\n\nPayment Link: ${link}`;
}

function buildCompanyFooterText(companyName?: string, companyEmail?: string, companyPhone?: string): string {
  const name = (companyName ?? "").trim() || "the business";
  const email = (companyEmail ?? "").trim();
  if (!email) return "";

  const optionalPhonePart = companyPhone?.trim() ? ` or ${companyPhone.trim()}` : "";
  const questionsLine = `Questions? Contact ${name} at ${email}${optionalPhonePart}.`;
  const lines = ["---", questionsLine, name, email];
  if (companyPhone?.trim()) lines.push(companyPhone.trim());
  return "\n\n" + lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildCompanyFooterHtml(companyName?: string, companyEmail?: string, companyPhone?: string): string {
  const name = (companyName ?? "").trim() || "the business";
  const email = (companyEmail ?? "").trim();
  if (!email) return "";

  const optionalPhonePart = companyPhone?.trim() ? ` or ${escapeHtml(companyPhone.trim())}` : "";
  const questionsPart = `Contact ${name} at <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>${optionalPhonePart}.`;
  const blockParts = [`<strong>${escapeHtml(name)}</strong><br />`, `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`];
  if (companyPhone?.trim()) blockParts.push(`<br />${escapeHtml(companyPhone.trim())}`);

  return `
<hr style="margin-top:24px; border:none; border-top:1px solid #e5e7eb;" />
<p style="margin:12px 0 0; font-size:14px; color:#374151;">
  <strong>Questions?</strong> ${questionsPart}
</p>
<p style="margin:8px 0 0; font-size:13px; color:#6b7280;">
  ${blockParts.join("")}
</p>`.trim();
}

export function renderChaseEmail(
  type: "invoice_reminder" | "invoice_due" | "invoice_late_weekly",
  invoice: ChaseInvoice,
  weekNumber?: number,
  companyName?: string,
  companyEmail?: string,
  companyPhone?: string
): ChaseTemplateResult {
  const amount = formatAmount(invoice.amount);
  const dueDate = formatDueDate(invoice.dueAt);
  const name = invoice.customerName || "Valued Customer";
  const num = invoice.invoiceNumber || "";

  let subject: string;
  let greeting: string;
  let body: string;
  let closing: string;

  switch (type) {
    case "invoice_reminder":
      subject = `Friendly Reminder: Invoice #${num} Due Soon`;
      greeting = `Hi ${name},`;
      body = `I wanted to send a quick reminder that your invoice #${num} for ${amount} is coming up soon. The due date is ${dueDate}.`;
      closing = `If you've already sent payment, thank you! If you have any questions, please reply to this email.`;
      break;
    case "invoice_due":
      subject = `Invoice #${num} - Due Today`;
      greeting = `Hi ${name},`;
      body = `I wanted to remind you that your invoice #${num} for ${amount} is due today (${dueDate}).`;
      closing = `If you've already sent payment, thank you! If you need assistance, please reply.`;
      break;
    case "invoice_late_weekly":
      if (weekNumber == null) throw new Error("weekNumber required for invoice_late_weekly");
      const w = weekNumber === 1 ? "first" : weekNumber === 2 ? "second" : weekNumber === 3 ? "third" : `${weekNumber}th`;
      subject = `Week ${weekNumber} Follow-up: Invoice #${num} - ${amount}`;
      greeting = `Hi ${name},`;
      body = `I wanted to follow up on invoice #${num} for ${amount}, which was due on ${dueDate}. This is our Week ${weekNumber} follow-up (${w} week).`;
      closing = `If you have any questions or would like to discuss, please reply to this email.`;
      break;
    default:
      throw new Error(`Unknown chase type: ${type}`);
  }

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px;">
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 16px 0;">${body}</p>
    <div style="background: #f9fafb; padding: 20px; margin: 24px 0; border-radius: 6px;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Invoice Details:</p>
      <p style="margin: 4px 0;"><strong>Invoice #${num}</strong></p>
      <p style="margin: 4px 0;"><strong>Amount:</strong> ${amount}</p>
      <p style="margin: 4px 0;"><strong>Due Date:</strong> ${dueDate}</p>
    </div>
    <p style="margin: 16px 0 0 0;">${closing}</p>
    ${paymentLinkHtml(invoice.paymentLink)}
    <p style="margin: 32px 0 0 0; font-size: 14px; color: #6b7280;">Best regards,<br>${companyName?.trim() || "Invoice Chaser"}</p>
    ${companyEmail ? buildCompanyFooterHtml(companyName, companyEmail, companyPhone) : ""}
  </div>
</body></html>`.trim();

  const footerText = companyEmail ? buildCompanyFooterText(companyName, companyEmail, companyPhone) : "";
  const text = [
    greeting,
    "",
    body,
    "",
    "Invoice Details:",
    `- Invoice #${num}`,
    `- Amount: ${amount}`,
    `- Due Date: ${dueDate}`,
    "",
    closing + paymentLinkText(invoice.paymentLink),
    "",
    "Best regards,",
    companyName?.trim() || "Invoice Chaser",
    footerText,
  ].join("\n");

  return { subject, html, text };
}
