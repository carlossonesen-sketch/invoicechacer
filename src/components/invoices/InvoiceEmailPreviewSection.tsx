"use client";

import { useMemo } from "react";
import type { EmailOverrideKey } from "@/lib/email/emailOverrides";
import { buildTemplateVars, renderTemplateString } from "@/lib/email/templateVariables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

export type EmailDraftKey = EmailOverrideKey;

const KIND_OPTIONS: { value: EmailOverrideKey; label: string }[] = [
  { value: "initial", label: "Initial invoice email" },
  { value: "reminder", label: "Reminder (before due)" },
  { value: "due", label: "Due date" },
  { value: "late", label: "Late / weekly follow-up" },
  { value: "manual", label: "Manual resend / updated invoice" },
];

const VARIABLE_HELPER =
  "{{customerName}} · {{invoiceNumber}} · {{dueDate}} · {{amountDue}} · {{companyName}} · {{paymentLink}} · {{weekNumber}} (late only)";

export interface InvoiceEmailPreviewSectionProps {
  selectedKind: EmailOverrideKey;
  onKindChange: (k: EmailOverrideKey) => void;
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onResetToDefaults: () => void;
  /** For live preview */
  previewContext: {
    customerName: string;
    invoiceNumber: string;
    dueAt: string | Date;
    amountCents: number;
    companyName: string;
    paymentLink: string;
    /** Used when previewing "late" */
    weekNumberPreview?: number;
  };
  disabled?: boolean;
}

export function InvoiceEmailPreviewSection({
  selectedKind,
  onKindChange,
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  onResetToDefaults,
  previewContext,
  disabled,
}: InvoiceEmailPreviewSectionProps) {
  const vars = useMemo(
    () =>
      buildTemplateVars({
        customerName: previewContext.customerName,
        invoiceNumber: previewContext.invoiceNumber,
        dueAt: previewContext.dueAt,
        amountCents: previewContext.amountCents,
        companyName: previewContext.companyName,
        paymentLink: previewContext.paymentLink,
        weekNumber:
          selectedKind === "late"
            ? previewContext.weekNumberPreview ?? 1
            : previewContext.weekNumberPreview,
      }),
    [previewContext, selectedKind]
  );

  const renderedSubject = useMemo(() => renderTemplateString(subject, vars), [subject, vars]);
  const renderedBody = useMemo(() => renderTemplateString(body, vars), [body, vars]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900">Email preview</h3>
        <Button type="button" variant="secondary" size="sm" onClick={onResetToDefaults} disabled={disabled}>
          Reset to default template
        </Button>
      </div>
      <p className="text-sm text-gray-600">
        Choose which email you are editing. Variables are filled in automatically when we send (and in the preview
        below).
      </p>
      <FormField label="Email type" htmlFor="email-preview-kind">
        <Select
          id="email-preview-kind"
          value={selectedKind}
          onChange={(e) => onKindChange(e.target.value as EmailOverrideKey)}
          disabled={disabled}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Subject" htmlFor="email-preview-subject">
        <Input
          id="email-preview-subject"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          disabled={disabled}
          placeholder="Reminder: Invoice {{invoiceNumber}}"
        />
      </FormField>
      <FormField label="Body" htmlFor="email-preview-body">
        <Textarea
          id="email-preview-body"
          rows={10}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          disabled={disabled}
          className="font-mono text-sm"
        />
      </FormField>
      <p className="text-xs text-gray-500">Available variables: {VARIABLE_HELPER}</p>
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Rendered preview</p>
        <div>
          <span className="text-xs text-gray-500">Subject: </span>
          <span className="text-sm font-medium text-gray-900 break-words">{renderedSubject || "—"}</span>
        </div>
        <div className="text-sm text-gray-800 whitespace-pre-wrap break-words border-t border-gray-200 pt-3">
          {renderedBody || "—"}
        </div>
      </div>
    </div>
  );
}
