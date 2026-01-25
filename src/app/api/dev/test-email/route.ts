/**
 * Dev-only: POST { "to": "verified@example.com" } to send a test email via sendEmail().
 * Allowed if NODE_ENV !== "production" OR header x-dev-token matches DEV_TEST_TOKEN.
 * Error causes are kept distinct (e.g. invalid JSON vs missing to vs send failure).
 */

import { NextResponse } from "next/server";
import { sendEmail } from "@/server/email/mailer";

interface AppError {
  code: string;
  message: string;
  status?: number;
}

function isAppError(v: unknown): v is AppError {
  return (
    typeof v === "object" &&
    v !== null &&
    "code" in v &&
    "message" in v &&
    typeof (v as AppError).code === "string" &&
    typeof (v as AppError).message === "string"
  );
}

function err(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    const token = request.headers.get("x-dev-token") ?? undefined;
    const expected = process.env.DEV_TEST_TOKEN ?? undefined;
    if (expected === undefined || token !== expected) {
      return err("FORBIDDEN", "Forbidden", 403);
    }
  }

  let body: { to?: string };
  try {
    body = (await request.json()) as { to?: string };
  } catch {
    return err("INVALID_JSON", "Invalid JSON body", 400);
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to) {
    return err("MISSING_TO", "Missing or empty 'to'", 400);
  }

  try {
    const { messageId } = await sendEmail({
      to,
      subject: "Test email",
      html: "<p>Test email from Invoice Chaser.</p>",
      text: "Test email from Invoice Chaser.",
    });
    return NextResponse.json({ ok: true, messageId });
  } catch (e) {
    if (isAppError(e)) {
      return err(e.code, e.message, e.status ?? 500);
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return err("SEND_FAILED", msg, 500);
  }
}
