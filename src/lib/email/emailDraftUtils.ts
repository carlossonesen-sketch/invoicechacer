import type { EmailOverrideEntry, EmailOverrides, EmailOverrideKey } from "./emailOverrides";
import { EMAIL_OVERRIDE_KEYS } from "./emailOverrides";
import { cloneDefaultTemplates, DEFAULT_EMAIL_TEMPLATES } from "./templates/defaultEmailTemplates";

export type EmailDraftsState = Record<EmailOverrideKey, EmailOverrideEntry>;

export function buildEmailDraftsFromStored(stored: EmailOverrides | undefined | null): EmailDraftsState {
  const base = cloneDefaultTemplates() as EmailDraftsState;
  for (const k of EMAIL_OVERRIDE_KEYS) {
    const s = stored?.[k];
    if (s && (s.subject.trim() !== "" || s.body.trim() !== "")) {
      base[k] = { subject: s.subject, body: s.body };
    }
  }
  return base;
}

/** Only persist keys that differ from built-in defaults (keeps Firestore docs small). */
export function pickEmailOverridesToSave(drafts: EmailDraftsState): EmailOverrides | undefined {
  const out: EmailOverrides = {};
  for (const k of EMAIL_OVERRIDE_KEYS) {
    const d = drafts[k];
    const def = DEFAULT_EMAIL_TEMPLATES[k];
    if (d.subject !== def.subject || d.body !== def.body) {
      out[k] = { subject: d.subject, body: d.body };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function resetEmailDraftKind(drafts: EmailDraftsState, kind: EmailOverrideKey): EmailDraftsState {
  return { ...drafts, [kind]: { ...DEFAULT_EMAIL_TEMPLATES[kind] } };
}
