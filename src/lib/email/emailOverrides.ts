export type EmailOverrideKey = "initial" | "reminder" | "due" | "late" | "manual";

export type InvoiceEmailSendType =
  | "invoice_initial"
  | "invoice_updated"
  | "invoice_reminder"
  | "invoice_due"
  | "invoice_late_weekly";

export interface EmailOverrideEntry {
  subject: string;
  body: string;
}

/** Per-invoice custom subject/body (still tokenized until send time). */
export type EmailOverrides = Partial<Record<EmailOverrideKey, EmailOverrideEntry>>;

export const EMAIL_OVERRIDE_KEYS: EmailOverrideKey[] = ["initial", "reminder", "due", "late", "manual"];

export function invoiceEmailTypeToOverrideKey(type: InvoiceEmailSendType): EmailOverrideKey {
  switch (type) {
    case "invoice_initial":
      return "initial";
    case "invoice_updated":
      return "manual";
    case "invoice_reminder":
      return "reminder";
    case "invoice_due":
      return "due";
    case "invoice_late_weekly":
      return "late";
  }
}

/** Parse Firestore / JSON into a safe overrides object. */
export function parseEmailOverrides(raw: unknown): EmailOverrides | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const out: EmailOverrides = {};
  for (const k of EMAIL_OVERRIDE_KEYS) {
    const v = obj[k];
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const rec = v as Record<string, unknown>;
    const subject = typeof rec.subject === "string" ? rec.subject.slice(0, 2000) : "";
    const body = typeof rec.body === "string" ? rec.body.slice(0, 50000) : "";
    out[k] = { subject, body };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
