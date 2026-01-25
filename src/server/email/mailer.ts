/**
 * Mail abstraction: sendEmail() delegates to the provider selected by EMAIL_PROVIDER.
 * Default: "sesv2". Server-only. Validates required env for the chosen provider.
 */

import { sendSesEmail } from "./providers/sesv2Mailer";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type { MailerError } from "./providers/sesv2Mailer";

function fail(code: string, message: string, status?: number): never {
  throw { code, message, status };
}

const SES_REQUIRED_ENV = ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "EMAIL_FROM"] as const;

function validateSesEnv(): void {
  for (const name of SES_REQUIRED_ENV) {
    const v = process.env[name]?.trim();
    if (!v) fail("MISSING_ENV", `Missing required env: ${name}`, 500);
  }
}

/**
 * Send email via the configured provider (EMAIL_PROVIDER, default "sesv2").
 * Validates provider and required env; throws { code, message, status } on error.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ messageId?: string }> {
  const provider = (process.env.EMAIL_PROVIDER ?? "sesv2").trim().toLowerCase();
  if (provider !== "sesv2") {
    fail("UNSUPPORTED_PROVIDER", `Unsupported EMAIL_PROVIDER: ${provider}`, 500);
  }
  validateSesEnv();
  return sendSesEmail(input);
}
