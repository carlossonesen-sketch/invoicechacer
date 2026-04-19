export type TemplateVarKey =
  | "customerName"
  | "invoiceNumber"
  | "dueDate"
  | "amountDue"
  | "companyName"
  | "paymentLink"
  | "weekNumber";

export type TemplateVarRecord = Record<TemplateVarKey, string>;

const KNOWN_KEYS: readonly TemplateVarKey[] = [
  "customerName",
  "invoiceNumber",
  "dueDate",
  "amountDue",
  "companyName",
  "paymentLink",
  "weekNumber",
];

function isTemplateVarKey(k: string): k is TemplateVarKey {
  return (KNOWN_KEYS as readonly string[]).includes(k);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatAmountDue(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

export function formatDueDateFriendly(dueAt: string | Date): string {
  const date = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export interface BuildTemplateVarsInput {
  customerName: string;
  invoiceNumber: string;
  dueAt: string | Date;
  amountCents: number;
  companyName: string;
  paymentLink: string;
  weekNumber?: number;
}

export function buildTemplateVars(input: BuildTemplateVarsInput): TemplateVarRecord {
  const payment = (input.paymentLink || "").trim();
  return {
    customerName: (input.customerName || "").trim() || "Customer",
    invoiceNumber: (input.invoiceNumber || "").trim() || "—",
    dueDate: formatDueDateFriendly(input.dueAt),
    amountDue: formatAmountDue(Number.isFinite(input.amountCents) ? input.amountCents : 0),
    companyName: (input.companyName || "").trim() || "Your business",
    paymentLink: payment,
    weekNumber:
      input.weekNumber !== undefined && input.weekNumber !== null
        ? String(input.weekNumber)
        : "",
  };
}

/** Replace {{token}}; unknown tokens become empty string. */
export function renderTemplateString(template: string, vars: TemplateVarRecord): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (isTemplateVarKey(key)) return vars[key] ?? "";
    return "";
  });
}

/** Plain text with newlines → safe HTML body paragraphs. */
export function plainTextToEmailBodyHtml(text: string): string {
  const trimmed = text.trimEnd();
  if (!trimmed) return "";
  const paragraphs = trimmed.split(/\n\n+/);
  return paragraphs
    .map((p) => {
      const escaped = escapeHtml(p).replace(/\n/g, "<br/>");
      return `<p style="margin: 0 0 16px 0; font-size: 16px;">${escaped}</p>`;
    })
    .join("");
}
