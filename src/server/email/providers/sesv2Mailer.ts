/**
 * Amazon SESv2 (AWS SDK v3) email provider.
 * For SES Sandbox: From and To addresses must be verified in the AWS SES console.
 * Server-only. Never log secrets.
 */

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface MailerError {
  code: string;
  message: string;
  status?: number;
}

function fail(code: string, message: string, status?: number): never {
  throw { code, message, status } satisfies MailerError;
}

function ensureEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) fail("MISSING_ENV", `Missing required env: ${name}`, 500);
  return v;
}

/** Extract email from "Display Name <email@example.com>" or return as-is if no angle brackets. */
function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return m ? m[1].trim() : from.trim();
}

/** Minimal strip of HTML tags for plain-text fallback. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

let _client: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (_client) return _client;
  const region = ensureEnv("AWS_REGION");
  ensureEnv("AWS_ACCESS_KEY_ID");
  ensureEnv("AWS_SECRET_ACCESS_KEY");
  _client = new SESv2Client({ region });
  return _client;
}

/**
 * Send email via Amazon SESv2. Required env: AWS_REGION, AWS_ACCESS_KEY_ID,
 * AWS_SECRET_ACCESS_KEY, EMAIL_FROM. Optional: AWS_SESSION_TOKEN, EMAIL_REPLY_TO.
 */
export async function sendSesEmail(input: SendEmailInput): Promise<{ messageId?: string }> {
  const from = ensureEnv("EMAIL_FROM");
  const fromEmail = extractEmail(from);
  const textData = input.text ?? stripHtml(input.html);

  const replyTo = input.replyTo ?? process.env.EMAIL_REPLY_TO?.trim();
  const replyToAddresses = replyTo ? [replyTo] : undefined;

  const client = getClient();
  const command = new SendEmailCommand({
    FromEmailAddress: fromEmail,
    Destination: { ToAddresses: [input.to] },
    ReplyToAddresses: replyToAddresses,
    Content: {
      Simple: {
        Subject: { Data: input.subject },
        Body: {
          Html: { Data: input.html },
          Text: { Data: textData },
        },
      },
    },
  });

  try {
    const out = await client.send(command);
    return { messageId: out.MessageId };
  } catch (err) {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    const code = e.name ?? "AWS_SES_ERROR";
    const message = e.message ?? String(err);
    const status = e.$metadata?.httpStatusCode ?? 502;
    throw { code, message, status } satisfies MailerError;
  }
}
