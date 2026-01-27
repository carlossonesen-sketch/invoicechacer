/**
 * GET /api/invoices/[invoiceId] — fetch single invoice (server-side, Admin SDK).
 * Used for initial load when Firestore client is degraded (e.g. Edge "client is offline").
 * Auth: Bearer or session cookie. Returns 404 if not found.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { resolveInvoiceRefAndBusinessId } from "@/lib/invoicePaths";
import { getAuthenticatedUserId } from "@/lib/api/auth";

export const runtime = "nodejs";

function toIso(v: unknown): string {
  if (!v) return new Date().toISOString();
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function")
    return (v as { toDate: () => Date }).toDate().toISOString();
  return new Date().toISOString();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    initFirebaseAdmin();
    const uid = await getAuthenticatedUserId(request);
    const { invoiceId } = await params;
    if (!invoiceId) {
      return NextResponse.json({ error: "INVALID_INPUT", message: "Missing invoiceId" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const { exists, data } = await resolveInvoiceRefAndBusinessId(db, invoiceId, uid);
    if (!exists || !data) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Invoice not found" }, { status: 404 });
    }

    const invoice = {
      id: invoiceId,
      customerName: data.customerName || "Unknown Customer",
      customerEmail: data.customerEmail || "",
      amount: data.amount ?? data.amountCents ?? 0,
      status: data.status || "pending",
      dueAt: toIso(data.dueAt),
      createdAt: toIso(data.createdAt),
      userId: data.userId || uid,
      notes: data.notes,
      paymentLink: data.paymentLink,
      autoChaseEnabled: !!data.autoChaseEnabled,
      autoChaseDays: data.autoChaseDays,
      maxChases: data.maxChases,
      chaseCount: data.chaseCount ?? 0,
      lastChasedAt: data.lastChasedAt ? toIso(data.lastChasedAt) : undefined,
      nextChaseAt: data.nextChaseAt ? toIso(data.nextChaseAt) : undefined,
      updatedAt: data.updatedAt ? toIso(data.updatedAt) : undefined,
      paidAt: data.paidAt ? toIso(data.paidAt) : undefined,
    };

    return NextResponse.json({ invoice });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.startsWith("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED", message: msg }, { status: 401 });
    }
    console.error("[GET /api/invoices/[invoiceId]]", msg);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Failed to load invoice" }, { status: 500 });
  }
}
