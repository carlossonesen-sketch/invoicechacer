/**
 * Reusable business footer for invoice emails (HTML + plain text).
 * Used to append company contact at the bottom of every invoice email.
 */

export interface EmailFooterParams {
  /** Company/sender name (required if available; fallback to "the sender" elsewhere) */
  companyName: string;
  /** Contact email (preferred from business profile; fallback to user or support) */
  companyEmail: string;
  /** Contact phone (optional; omit cleanly if missing) */
  companyPhone: string;
}

/**
 * Build plain-text footer. Returns "" if no meaningful info.
 * No dangling "or" when phone is missing.
 */
export function buildEmailFooterText(params: EmailFooterParams): string {
  const { companyName, companyEmail, companyPhone } = params;
  const name = (companyName || "").trim() || "the sender";
  const email = (companyEmail || "").trim();
  if (!email) return "";

  const questionsLine = companyPhone
    ? `Questions? Contact ${name} at ${email} or ${companyPhone.trim()}.`
    : `Questions? Contact ${name} at ${email}.`;

  const lines = [questionsLine, name, email];
  if (companyPhone && companyPhone.trim()) {
    lines.push(companyPhone.trim());
  }
  return "\n\n" + lines.join("\n");
}

/**
 * Build HTML footer. Returns "" if no meaningful info.
 * Minimal inline styles; no external scripts or large images.
 */
export function buildEmailFooterHtml(params: EmailFooterParams): string {
  const { companyName, companyEmail, companyPhone } = params;
  const name = (companyName || "").trim() || "the sender";
  const email = (companyEmail || "").trim();
  if (!email) return "";

  const questionsPart = companyPhone
    ? `Contact ${name} at <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a> or ${escapeHtml(companyPhone.trim())}.`
    : `Contact ${name} at <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>.`;

  const blockLines = [`<strong>${escapeHtml(name)}</strong><br />`, `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`];
  if (companyPhone && companyPhone.trim()) {
    blockLines.push(`<br />${escapeHtml(companyPhone.trim())}`);
  }

  return `
<hr style="margin-top:24px; border:none; border-top:1px solid #e5e7eb;" />
<p style="margin:12px 0 0; font-size:14px; color:#374151;">
  <strong>Questions?</strong> ${questionsPart}
</p>
<p style="margin:8px 0 0; font-size:13px; color:#6b7280;">
  ${blockLines.join("")}
</p>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
