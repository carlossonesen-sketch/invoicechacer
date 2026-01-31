/**
 * SESv2 email sender for Firebase Functions.
 * Uses @aws-sdk/client-sesv2. Credentials from process.env at runtime (Firebase Secrets).
 *
 * Required env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_FROM_EMAIL.
 * Optional: AWS_SESSION_TOKEN.
 * Do not log secrets.
 */

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

let _client: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (_client) return _client;

  const region = process.env.AWS_REGION?.trim();
  if (!region) throw new Error("SES: AWS_REGION is required");

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();

  if (!accessKeyId) throw new Error("SES: AWS_ACCESS_KEY_ID is required");
  if (!secretAccessKey) throw new Error("SES: AWS_SECRET_ACCESS_KEY is required");

  _client = new SESv2Client({
    region,
    credentials: sessionToken
      ? { accessKeyId, secretAccessKey, sessionToken }
      : { accessKeyId, secretAccessKey },
  });

  return _client;
}

const DEFAULT_FROM_NAME = "Invoice Chaser";
const SUPPORT_EMAIL = "support@invoicechaser.online";

/**
 * Sanitize fromName to prevent header injection: remove CR/LF and trim.
 */
function sanitizeFromName(name: string | undefined): string {
  if (name == null || typeof name !== "string") return DEFAULT_FROM_NAME;
  const trimmed = name.replace(/\r|\n/g, "").trim();
  return trimmed || DEFAULT_FROM_NAME;
}

/**
 * Send email via Amazon SESv2.
 * Requires in process.env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_FROM_EMAIL.
 * Optional: AWS_SESSION_TOKEN (for temporary credentials).
 * Optional fromName: display name for From (default "Invoice Chaser"). From address remains SES_FROM_EMAIL or support@invoicechaser.online.
 * Optional replyTo: Reply-To header.
 */
export async function sendEmailSes(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  replyTo?: string;
}): Promise<{ messageId?: string }> {
  const fromName = sanitizeFromName(input.fromName);
  const envFrom = process.env.SES_FROM_EMAIL?.trim();
  const fromEmail = envFrom && envFrom.length > 3 ? envFrom : SUPPORT_EMAIL;
  const from = `"${fromName}" <${fromEmail}>`;

  const text = input.text ?? stripHtml(input.html);
  const replyTo = input.replyTo?.trim() ? [input.replyTo.trim()] : undefined;

  const client = getClient();
  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [input.to] },
    ReplyToAddresses: replyTo,
    Content: {
      Simple: {
        Subject: { Data: input.subject },
        Body: {
          Html: { Data: input.html },
          Text: { Data: text },
        },
      },
    },
  });

  try {
    const out = await client.send(command);
    const messageId = out.MessageId ?? undefined;
    const { logger } = await import("firebase-functions");
    logger.info("[SES] sent", { recipient: input.to, messageId });
    return { messageId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const errCode = err && typeof err === "object" && "name" in err ? String((err as { name?: string }).name) : "";
    const { logger } = await import("firebase-functions");
    if (msg.toLowerCase().includes("suppress") || errCode.includes("Suppression")) {
      logger.warn("[SES] suppressed", { recipient: input.to, error: msg });
    } else {
      logger.warn("[SES] send failed", { recipient: input.to, error: msg });
    }
    throw new Error(`SES send failed: ${msg}`);
  }
}
