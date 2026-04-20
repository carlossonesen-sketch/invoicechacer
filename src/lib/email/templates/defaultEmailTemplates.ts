import type { EmailOverrideKey } from "../emailOverrides";

export interface DefaultTemplatePair {
  subject: string;
  body: string;
}

export type EmailTone = "friendly" | "professional" | "firm" | "final_notice" | "legal";

export const EMAIL_TONE_OPTIONS: { value: EmailTone; label: string }[] = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "firm", label: "Firm" },
  { value: "final_notice", label: "Final notice" },
  { value: "legal", label: "Formal / legal-style" },
];

/** Canonical defaults used on the server when an invoice has no overrides (must stay stable). */
export const DEFAULT_EMAIL_TEMPLATES_BY_TONE: Record<EmailTone, Record<EmailOverrideKey, DefaultTemplatePair>> = {
  friendly: {
    initial: {
      subject: "Here is invoice {{invoiceNumber}} for {{amountDue}}",
      body: `Hi {{customerName}},

Thanks again for working with us. Here is invoice {{invoiceNumber}} for {{amountDue}}, with a due date of {{dueDate}}.

{{paymentLink}}

If anything looks off, or you need a little flexibility on timing, just reply - we are glad to help sort it out.

Warm regards,
{{companyName}}`,
    },
    reminder: {
      subject: "Gentle reminder: invoice {{invoiceNumber}} is on the calendar",
      body: `Hi {{customerName}},

I wanted to give you a soft heads-up that invoice {{invoiceNumber}} for {{amountDue}} has a due date coming up: {{dueDate}}.

{{paymentLink}}

If you have already paid, thank you - please disregard this note.

Best,
{{companyName}}`,
    },
    due: {
      subject: "Today is the due date for invoice {{invoiceNumber}}",
      body: `Hi {{customerName}},

Friendly note: invoice {{invoiceNumber}} for {{amountDue}} is due today, {{dueDate}}.

{{paymentLink}}

If payment is already on the way, we really appreciate it. If not, a quick reply helps us plan.

Thanks,
{{companyName}}`,
    },
    late: {
      subject: "Still with us on invoice {{invoiceNumber}}? (follow-up {{weekNumber}})",
      body: `Hi {{customerName}},

I am reaching out again about invoice {{invoiceNumber}} for {{amountDue}}, which had a due date of {{dueDate}}. This is follow-up number {{weekNumber}} on our side.

{{paymentLink}}

I am assuming something simple got in the way. If you can reply with an update or a payment date, that goes a long way for us.

Thanks,
{{companyName}}`,
    },
    manual: {
      subject: "Fresh numbers for invoice {{invoiceNumber}}",
      body: `Hi {{customerName}},

I have updated invoice {{invoiceNumber}} - it now shows {{amountDue}}, with a due date of {{dueDate}}. Please treat this email as the latest version.

{{paymentLink}}

If something does not match what you expected, reply and we will fix it together.

Thanks,
{{companyName}}`,
    },
  },
  professional: {
    initial: {
      subject: "Invoice {{invoiceNumber}} - {{amountDue}}",
      body: `Hi {{customerName}},

I hope you are doing well. Please find invoice {{invoiceNumber}} for {{amountDue}}, due on {{dueDate}}.

{{paymentLink}}

If you need a correction or have a question about the amount or terms, reply to this email.

Thank you,
{{companyName}}`,
    },
    reminder: {
      subject: "Reminder: Invoice {{invoiceNumber}} due soon",
      body: `Hi {{customerName}},

This is a reminder that invoice {{invoiceNumber}} for {{amountDue}} has a due date of {{dueDate}}.

{{paymentLink}}

If payment has already been sent, thank you - no further action is required.

Thank you,
{{companyName}}`,
    },
    due: {
      subject: "Invoice {{invoiceNumber}} - due today",
      body: `Hi {{customerName}},

Invoice {{invoiceNumber}} for {{amountDue}} is due today, {{dueDate}}.

{{paymentLink}}

If payment is in process, thank you. Otherwise, please arrange payment or contact us about any issue.

Thank you,
{{companyName}}`,
    },
    late: {
      subject: "Follow-up: Invoice {{invoiceNumber}} (week {{weekNumber}})",
      body: `Hi {{customerName}},

We are following up on invoice {{invoiceNumber}} for {{amountDue}}, which was due on {{dueDate}}. This is week {{weekNumber}} of automated reminders.

{{paymentLink}}

Please reply if you need a copy of the invoice, a payment plan, or if you believe the balance is incorrect.

Thank you,
{{companyName}}`,
    },
    manual: {
      subject: "Updated: Invoice {{invoiceNumber}} - {{amountDue}}",
      body: `Hi {{customerName}},

The details for invoice {{invoiceNumber}} have been updated: {{amountDue}}, due on {{dueDate}}. Please use this version going forward.

{{paymentLink}}

If anything needs to be adjusted, reply and we will address it promptly.

Thank you,
{{companyName}}`,
    },
  },
  firm: {
    initial: {
      subject: "Invoice {{invoiceNumber}} - {{amountDue}} - payment due {{dueDate}}",
      body: `Hi {{customerName}},

Invoice {{invoiceNumber}} is issued for {{amountDue}}. Payment is due on {{dueDate}}.

{{paymentLink}}

Payment is expected by the due date. Reply to this email if the amount or due date needs correction.

{{companyName}}`,
    },
    reminder: {
      subject: "Payment expected: invoice {{invoiceNumber}} by {{dueDate}}",
      body: `Hi {{customerName}},

Invoice {{invoiceNumber}} for {{amountDue}} is coming due. The due date is {{dueDate}}.

{{paymentLink}}

Please schedule payment so it arrives by that date. Contact us now if you cannot meet it.

{{companyName}}`,
    },
    due: {
      subject: "Payment due today - invoice {{invoiceNumber}} ({{amountDue}})",
      body: `Hi {{customerName}},

Invoice {{invoiceNumber}} for {{amountDue}} is due today, {{dueDate}}.

{{paymentLink}}

Confirm payment today, or email us immediately if there is a problem with the invoice.

{{companyName}}`,
    },
    late: {
      subject: "Overdue balance: invoice {{invoiceNumber}} - notice {{weekNumber}}",
      body: `Hi {{customerName}},

Invoice {{invoiceNumber}} for {{amountDue}} is past due. It was due on {{dueDate}}. This is notice {{weekNumber}} in our collection sequence.

{{paymentLink}}

Payment is overdue. Reply only to dispute the balance in good faith or to request a written payment plan.

{{companyName}}`,
    },
    manual: {
      subject: "Revised invoice {{invoiceNumber}} - {{amountDue}} - use this version",
      body: `Hi {{customerName}},

Invoice {{invoiceNumber}} has been revised. The balance is {{amountDue}} and the due date is {{dueDate}}. Earlier figures no longer apply.

{{paymentLink}}

Direct all questions about this invoice to this email address only.

{{companyName}}`,
    },
  },
  final_notice: {
    initial: {
      subject: "Important: Pay invoice {{invoiceNumber}} by {{dueDate}}",
      body: `Hi {{customerName}},

This is an important notice about invoice {{invoiceNumber}} for {{amountDue}}, due on {{dueDate}}.

{{paymentLink}}

Please pay by the due date, or contact us right away if you cannot. After the due date, we will move forward with our standard follow-up process.

{{companyName}}`,
    },
    reminder: {
      subject: "Last reminder before due date: invoice {{invoiceNumber}}",
      body: `Hi {{customerName}},

Invoice {{invoiceNumber}} for {{amountDue}} will be due on {{dueDate}}. This is likely our last reminder before that date.

{{paymentLink}}

If payment has already cleared, you may ignore this message. Otherwise, please pay or contact us before the due date.

{{companyName}}`,
    },
    due: {
      subject: "Final reminder today: invoice {{invoiceNumber}}",
      body: `Hi {{customerName}},

Today is the due date for invoice {{invoiceNumber}} ({{amountDue}}).

{{paymentLink}}

We need payment today, or a written explanation today, if you cannot pay. After today we will continue with the next steps in our collections process.

{{companyName}}`,
    },
    late: {
      subject: "Final notice: overdue invoice {{invoiceNumber}} (step {{weekNumber}})",
      body: `Hi {{customerName}},

Invoice {{invoiceNumber}} for {{amountDue}} is still unpaid. It was due on {{dueDate}}. This is final-notice step {{weekNumber}} in our sequence.

{{paymentLink}}

This is our last scheduled email on this balance before we review other collection options we are allowed to use. Pay now, or contact us in writing within five business days to dispute the debt or arrange payment.

{{companyName}}`,
    },
    manual: {
      subject: "Corrected invoice {{invoiceNumber}} - please read and respond",
      body: `Hi {{customerName}},

We have corrected invoice {{invoiceNumber}}. The amount is now {{amountDue}} and the due date is {{dueDate}}. Older versions should not be used.

{{paymentLink}}

Review this version and pay by the due date, or reply in writing if you disagree with the correction.

{{companyName}}`,
    },
  },
  legal: {
    initial: {
      subject: "Billing notice: Invoice {{invoiceNumber}}, {{amountDue}}, due {{dueDate}}",
      body: `Dear {{customerName}},

Please be advised that {{companyName}} has issued invoice {{invoiceNumber}} in the amount of {{amountDue}}, with payment due on or before {{dueDate}}.

{{paymentLink}}

This is a routine billing communication. It is not legal advice and does not create an attorney-client relationship. Send questions or disputes in writing to the address or email below.

Sincerely,
{{companyName}}`,
    },
    reminder: {
      subject: "Written reminder: Invoice {{invoiceNumber}}, payment due {{dueDate}}",
      body: `Dear {{customerName}},

This letter serves as a written reminder concerning invoice {{invoiceNumber}} in the amount of {{amountDue}}, with a stated due date of {{dueDate}}.

{{paymentLink}}

If our records are in error and payment has been made, please provide documentation so we may update the account.

Sincerely,
{{companyName}}`,
    },
    due: {
      subject: "Notice: Invoice {{invoiceNumber}} due on {{dueDate}}",
      body: `Dear {{customerName}},

According to our books, invoice {{invoiceNumber}} for {{amountDue}} is due on {{dueDate}}.

{{paymentLink}}

Remit payment in accordance with the terms on the invoice. To dispute the charge, reply to this message in writing with the basis for your dispute.

Sincerely,
{{companyName}}`,
    },
    late: {
      subject: "Account status: unpaid invoice {{invoiceNumber}} (written follow-up {{weekNumber}})",
      body: `Dear {{customerName}},

We are writing about unpaid invoice {{invoiceNumber}} in the amount of {{amountDue}}, originally due {{dueDate}}. This is written follow-up number {{weekNumber}} in our records.

{{paymentLink}}

Unpaid balances may be subject to further internal collection procedures or other remedies available to {{companyName}} under law or contract. Nothing in this message is legal advice. If you need guidance on your own position, you may wish to speak with a qualified professional of your choosing.

Sincerely,
{{companyName}}`,
    },
    manual: {
      subject: "Amended billing record: Invoice {{invoiceNumber}}, {{amountDue}}",
      body: `Dear {{customerName}},

Please find an amended invoice {{invoiceNumber}} stating {{amountDue}}, with a due date of {{dueDate}}. Prior drafts are superseded except where you and {{companyName}} have a separate written agreement.

{{paymentLink}}

This notice is for accounting and billing purposes only. It is not legal advice.

Sincerely,
{{companyName}}`,
    },
  },
};

/** Server and "no tone stored" baseline - must match professional. */
export const DEFAULT_EMAIL_TEMPLATES: Record<EmailOverrideKey, DefaultTemplatePair> =
  DEFAULT_EMAIL_TEMPLATES_BY_TONE.professional;

export function getDefaultsForTone(tone: EmailTone): Record<EmailOverrideKey, DefaultTemplatePair> {
  return DEFAULT_EMAIL_TEMPLATES_BY_TONE[tone];
}

export function cloneDefaultTemplatesForTone(tone: EmailTone): Record<EmailOverrideKey, DefaultTemplatePair> {
  const src = DEFAULT_EMAIL_TEMPLATES_BY_TONE[tone];
  const out = {} as Record<EmailOverrideKey, DefaultTemplatePair>;
  for (const k of Object.keys(src) as EmailOverrideKey[]) {
    out[k] = { ...src[k] };
  }
  return out;
}

/** @deprecated Use cloneDefaultTemplatesForTone("professional") */
export function cloneDefaultTemplates(): Record<EmailOverrideKey, DefaultTemplatePair> {
  return cloneDefaultTemplatesForTone("professional");
}
