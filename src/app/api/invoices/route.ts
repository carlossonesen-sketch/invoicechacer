/**
 * GET /api/invoices — list invoices for the authenticated user (server-side, Admin SDK).
 * Used for initial load when Firestore client is degraded (e.g. Edge "client is offline").
 * Auth: Bearer or session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { getInvoicesRef } from "@/lib/invoicePaths";
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

export async function GET(request: NextRequest) {
  try {
    initFirebaseAdmin();
    const uid = await getAuthenticatedUserId(request);
    const db = getAdminFirestore();
    const invoicesRef = getInvoicesRef(db, uid);

    let snapshot;
    try {
      snapshot = await invoicesRef.orderBy("createdAt", "desc").limit(50).get();
    } catch {
      snapshot = await invoicesRef.limit(50).get();
    }

    const invoices = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        customerName: d.customerName || "Unknown Customer",
        customerEmail: d.customerEmail || "",
        amount: d.amount ?? d.amountCents ?? 0,
        status: d.status || "pending",
        dueAt: toIso(d.dueAt),
        createdAt: toIso(d.createdAt),
        userId: d.userId || uid,
        notes: d.notes,
        paymentLink: d.paymentLink,
        autoChaseEnabled: !!d.autoChaseEnabled,
        autoChaseDays: d.autoChaseDays,
        maxChases: d.maxChases,
        chaseCount: d.chaseCount ?? 0,
        lastChasedAt: d.lastChasedAt ? toIso(d.lastChasedAt) : undefined,
        nextChaseAt: d.nextChaseAt ? toIso(d.nextChaseAt) : undefined,
        updatedAt: d.updatedAt ? toIso(d.updatedAt) : undefined,
        paidAt: d.paidAt ? toIso(d.paidAt) : undefined,
      };
    });

    return NextResponse.json({ invoices });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.startsWith("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED", message: msg }, { status: 401 });
    }
    console.error("[GET /api/invoices]", msg);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Failed to load invoices" }, { status: 500 });
  }
}
