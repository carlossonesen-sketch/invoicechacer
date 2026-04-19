/**
 * Invoice email HTML + text from tokenized templates, with optional per-invoice overrides.
 */

import type { EmailOverrides, InvoiceEmailSendType } from "../emailOverrides";
import { invoiceEmailTypeToOverrideKey } from "../emailOverrides";
import {
  buildTemplateVars,
  escapeHtml,
  formatAmountDue,
  formatDueDateFriendly,
  plainTextToEmailBodyHtml,
  renderTemplateString,
} from "../templateVariables";
import { DEFAULT_EMAIL_TEMPLATES } from "./defaultEmailTemplates";

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

type CompanyContact = { companyName?: string; companyEmail?: string; companyPhone?: string };

function renderPaymentLinkHTML(paymentLink: string | null | undefined): string {
  if (!paymentLink || paymentLink.trim() === "") {
    return "";
  }

  return `
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #6b7280;">Payment link</p>
      <a href="${escapeHtml(paymentLink)}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">Pay invoice</a>
      <p style="margin: 12px 0 0 0; font-size: 12px; color: #9ca3af;">Or copy: <a href="${escapeHtml(paymentLink)}" style="color: #3b82f6; word-break: break-all;">${escapeHtml(paymentLink)}</a></p>
    </div>
  `;
}

function renderPaymentLinkText(paymentLink: string | null | undefined): string {
  if (!paymentLink || paymentLink.trim() === "") {
    return "";
  }
  return `\n\nPayment link: ${paymentLink}`;
}

function buildCompanyFooterText(c: CompanyContact): string {
  const companyName = (c.companyName ?? "").trim() || "the business";
  const companyEmail = (c.companyEmail ?? "").trim();
  if (!companyEmail) return "";

  const optionalPhonePart = c.companyPhone?.trim() ? ` or ${c.companyPhone.trim()}` : "";
  const questionsLine = `Questions? Contact ${companyName} at ${companyEmail}${optionalPhonePart}.`;

  const lines = ["---", questionsLine, companyName, companyEmail];
  if (c.companyPhone?.trim()) lines.push(c.companyPhone.trim());
  return "\n\n" + lines.join("\n");
}

function buildCompanyFooterHtml(c: CompanyContact): string {
  const companyName = (c.companyName ?? "").trim() || "the business";
  const companyEmail = (c.companyEmail ?? "").trim();
  if (!companyEmail) return "";

  const optionalPhonePart = c.companyPhone?.trim() ? ` or ${escapeHtml(c.companyPhone.trim())}` : "";
  const questionsPart = `Contact ${escapeHtml(companyName)} at <a href="mailto:${escapeHtml(companyEmail)}">${escapeHtml(companyEmail)}</a>${optionalPhonePart}.`;

  const blockParts = [`<strong>${escapeHtml(companyName)}</strong><br/>`, `<a href="mailto:${escapeHtml(companyEmail)}">${escapeHtml(companyEmail)}</a><br/>`];
  if (c.companyPhone?.trim()) blockParts.push(escapeHtml(c.companyPhone.trim()));

  return `
<hr style="margin-top:24px;border:none;border-top:1px solid #e5e7eb;" />
<p style="margin:12px 0 0;font-size:14px;color:#374151;">
  <strong>Questions?</strong> ${questionsPart}
</p>
<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">
  ${blockParts.join("")}
</p>`.trim();
}

function resolveSubjectBodyTemplates(
  type: InvoiceEmailSendType,
  emailOverrides: EmailOverrides | null | undefined
): { subjectTpl: string; bodyTpl: string } {
  const key = invoiceEmailTypeToOverrideKey(type);
  const defaults = DEFAULT_EMAIL_TEMPLATES[key];
  const ov = emailOverrides?.[key];
  const subjectTpl = ov && ov.subject.trim() !== "" ? ov.subject : defaults.subject;
  const bodyTpl = ov && ov.body.trim() !== "" ? ov.body : defaults.body;
  return { subjectTpl, bodyTpl };
}

/**
 * Render invoice email (HTML + plain text) using defaults or per-invoice overrides.
 */
export function renderInvoiceEmail(params: {
  type: InvoiceEmailSendType;
  invoice: InvoiceForEmail;
  weekNumber?: number;
  companyName?: string;
  companyEmail?: string;
  companyPhone?: string;
  emailOverrides?: EmailOverrides | null;
}): EmailTemplateResult {
  const { type, invoice, weekNumber, companyName, companyEmail, companyPhone, emailOverrides } = params;
  const contact: CompanyContact = { companyName, companyEmail, companyPhone };
  const footerHtml = companyEmail ? buildCompanyFooterHtml(contact) : "";
  const footerText = companyEmail ? buildCompanyFooterText(contact) : "";

  const invoiceNumber = invoice.invoiceNumber || invoice.id.slice(0, 8);
  const customerName = invoice.customerName || "Customer";
  const amount = invoice.amount;
  const dueDate = formatDueDateFriendly(invoice.dueAt);
  const amountStr = formatAmountDue(amount);
  const paymentRaw = (invoice.paymentLink || "").trim();

  const companyDisplay =
    (invoice.businessName && invoice.businessName.trim()) ||
    (companyName && companyName.trim()) ||
    "Your business";

  const vars = buildTemplateVars({
    customerName,
    invoiceNumber,
    dueAt: invoice.dueAt,
    amountCents: amount,
    companyName: companyDisplay,
    paymentLink: paymentRaw,
    weekNumber,
  });

  const { subjectTpl, bodyTpl } = resolveSubjectBodyTemplates(type, emailOverrides);
  const subject = renderTemplateString(subjectTpl, vars).trim() || `Invoice ${invoiceNumber}`;
  const mainBodyRendered = renderTemplateString(bodyTpl, vars).trim();
  const mainBodyHtml = plainTextToEmailBodyHtml(mainBodyRendered);

  const paymentLinkHTML = renderPaymentLinkHTML(invoice.paymentLink);
  const paymentLinkText = renderPaymentLinkText(invoice.paymentLink);

  const signatureName =
    (invoice.businessName && invoice.businessName.trim()) ||
    (companyName && companyName.trim()) ||
    "Invoice Chaser";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb;">
    ${mainBodyHtml}
    <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; font-weight: 500;">Invoice details</p>
      <p style="margin: 4px 0; font-size: 16px;"><strong>Invoice #${escapeHtml(invoiceNumber)}</strong></p>
      <p style="margin: 4px 0; font-size: 16px;"><strong>Amount:</strong> ${escapeHtml(amountStr)}</p>
      <p style="margin: 4px 0; font-size: 16px;"><strong>Due date:</strong> ${escapeHtml(dueDate)}</p>
    </div>
    ${paymentLinkHTML}
    <p style="margin: 32px 0 0 0; font-size: 14px; color: #6b7280;">Best regards,<br>${escapeHtml(signatureName)}</p>
    ${footerHtml}
  </div>
</body>
</html>
  `.trim();

  const text = `
${mainBodyRendered}

Invoice details:
- Invoice #${invoiceNumber}
- Amount: ${amountStr}
- Due date: ${dueDate}
${paymentLinkText}

Best regards,
${signatureName}${footerText}
  `.trim();

  return { subject, html, text };
}
