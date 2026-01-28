/**
 * Mail abstraction: sendEmail() delegates to the provider selected by EMAIL_PROVIDER.
 *
 * Default provider is a Firebase Functions/Cloud Run HTTP endpoint (\"firebase_http\"),
 * so Vercel never talks to SES directly. SESv2 is only used when
 * EMAIL_PROVIDER=\"sesv2\" is explicitly configured.
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

const getSendEmailUrl = (): string =>
  process.env.SEND_EMAIL_URL?.trim() || "https://sendemail-mloq42cfoa-uc.a.run.app";

/**
 * Send email via the configured provider.
 *
 * Providers:
 * - firebase_http (default): POST to SEND_EMAIL_URL (Cloud Run/Firebase sendEmail endpoint)
 * - sesv2: direct SESv2 SDK (only when explicitly enabled)
 */
export async function sendEmail(input: SendEmailInput): Promise<{ messageId?: string }> {
  const provider = (process.env.EMAIL_PROVIDER ?? "firebase_http").trim().toLowerCase();

  if (provider === "sesv2") {
    validateSesEnv();
    return sendSesEmail(input);
  }

  if (provider === "firebase_http") {
    const url = getSendEmailUrl();
    const body = {
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      meta: {
        source: "dev-test",
      },
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      fail("EMAIL_HTTP_REQUEST_FAILED", `Failed to call sendEmail endpoint: ${msg}`, 502);
    }

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // Non-JSON response; keep as null and surface generic error if not ok
    }

    const okFlag = data?.ok;
    if (!response.ok || okFlag === false) {
      const errorCode =
        (typeof data?.error?.code === "string" && data.error.code) || "EMAIL_HTTP_ERROR";
      const errorMessage =
        (typeof data?.error?.message === "string" && data.error.message) ||
        `sendEmail HTTP ${response.status}`;
      fail(errorCode, errorMessage, response.status || 502);
    }

    const messageId: string | undefined =
      typeof data?.messageId === "string" ? data.messageId : undefined;

    console.log("[EMAIL PROVIDER] firebase_sendEmail", {
      provider: "firebase_http",
      to: input.to,
      url,
      messageId: messageId ?? undefined,
      context: "dev-test",
    });

    return { messageId };
  }

  fail("UNSUPPORTED_PROVIDER", `Unsupported EMAIL_PROVIDER: ${provider}`, 500);
}
