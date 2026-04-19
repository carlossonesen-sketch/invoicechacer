import type { EmailOverrideKey } from "../emailOverrides";

export interface DefaultTemplatePair {
  subject: string;
  body: string;
}

/** Default tokenized copy — polite, short, small-business friendly. */
export const DEFAULT_EMAIL_TEMPLATES: Record<EmailOverrideKey, DefaultTemplatePair> = {
  initial: {
    subject: "Invoice {{invoiceNumber}} — {{amountDue}}",
    body: `Hi {{customerName}},

I hope you're doing well. I'm sending invoice {{invoiceNumber}} for {{amountDue}}, due on {{dueDate}}.

If anything needs to change, just reply to this email.

Thank you,
{{companyName}}`,
  },
  reminder: {
    subject: "Reminder: Invoice {{invoiceNumber}} due soon",
    body: `Hi {{customerName}},

Just a friendly reminder that invoice {{invoiceNumber}} for {{amountDue}} is coming up, with a due date of {{dueDate}}.

{{paymentLink}}

If you've already paid, thank you—no further action needed.

Thank you,
{{companyName}}`,
  },
  due: {
    subject: "Invoice {{invoiceNumber}} — due today",
    body: `Hi {{customerName}},

This is a quick note that invoice {{invoiceNumber}} for {{amountDue}} is due today ({{dueDate}}).

{{paymentLink}}

If payment is already on the way, thank you.

Thank you,
{{companyName}}`,
  },
  late: {
    subject: "Follow-up: Invoice {{invoiceNumber}} (week {{weekNumber}})",
    body: `Hi {{customerName}},

I'm following up on invoice {{invoiceNumber}} for {{amountDue}}, which was due on {{dueDate}}. This is week {{weekNumber}} of our payment reminders.

{{paymentLink}}

If you have a question or need to arrange payment, please reply—happy to help.

Thank you,
{{companyName}}`,
  },
  manual: {
    subject: "Updated: Invoice {{invoiceNumber}} — {{amountDue}}",
    body: `Hi {{customerName}},

I've updated the details for invoice {{invoiceNumber}} for {{amountDue}}, due on {{dueDate}}. Please use this version as the source of truth.

{{paymentLink}}

If anything looks off, reply and we'll fix it quickly.

Thank you,
{{companyName}}`,
  },
};

export function cloneDefaultTemplates(): Record<EmailOverrideKey, DefaultTemplatePair> {
  const out = {} as Record<EmailOverrideKey, DefaultTemplatePair>;
  for (const k of Object.keys(DEFAULT_EMAIL_TEMPLATES) as EmailOverrideKey[]) {
    out[k] = { ...DEFAULT_EMAIL_TEMPLATES[k] };
  }
  return out;
}
