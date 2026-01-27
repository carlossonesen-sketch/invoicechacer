/**
 * API route to create an invoice
 * Enforces plan-based limits (e.g., max pending invoices for trial)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { getPlanForUser, getPlanLimits } from "@/lib/billing/plan";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { requireActiveTrialOrPaid } from "@/lib/api/trial";
import { getRequestId } from "@/lib/api/requestId";
import { mapErrorToHttp } from "@/lib/api/httpError";
import { ApiError, isApiError } from "@/lib/api/ApiError";
import { getInvoicesRef } from "@/lib/invoicePaths";

// Force Node.js runtime for Vercel
export const runtime = "nodejs";

// Initialize Firebase Admin at module load (silently fail during build if env vars not set)
try {
  initFirebaseAdmin();
} catch (error) {
  // Ignore during build - will be initialized at runtime
  if (process.env.NODE_ENV !== "production") {
    console.warn("[CREATE INVOICE] Firebase Admin init failed at module load (will retry at runtime):", error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Create a new invoice
 * POST /api/invoices/create
 * Auth: Bearer token or session cookie. userId is taken only from getAuthenticatedUserId (never from body).
 * Body: {
 *   customerName: string;
 *   customerEmail: string;
 *   amount: number; // in cents
 *   dueAt: string; // ISO string
 *   status: "pending" | "overdue" | "paid";
 *   notes?: string;
 *   paymentLink?: string;
 *   autoChaseEnabled?: boolean;
 *   autoChaseDays?: number;
 *   maxChases?: number;
 * }
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  try {
    initFirebaseAdmin();

    // User identity from auth only; never use body.userId
    let userId: string;
    try {
      userId = await getAuthenticatedUserId(request);
    } catch (authError) {
      const msg = authError instanceof Error ? authError.message : "Authentication required";
      return NextResponse.json({ error: "UNAUTHORIZED", message: msg }, { status: 401 });
    }

    // Gate: require active trial or paid subscription (dashboard is read-only when expired)
    const trialGate = await requireActiveTrialOrPaid(userId);
    if (trialGate) {
      return trialGate;
    }

    const body = await request.json();
    const { customerName, customerEmail, amount, dueAt, status, notes, paymentLink, autoChaseEnabled, autoChaseDays, maxChases } = body;

    // Validate required fields

    if (!customerName || !customerEmail || amount === undefined || !dueAt || !status) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Missing required fields: customerName, customerEmail, amount, dueAt, status" },
        { status: 400 }
      );
    }

    // Validate status
    if (!["pending", "overdue", "paid"].includes(status)) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "status must be 'pending', 'overdue', or 'paid'" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
        { status: 500 }
      );
    }

    // Enforce maxPendingInvoices for all plans: when the plan has a finite cap (trial: 10)
    // we count unpaid (pending + overdue) and block; starter/pro/business use Infinity so the block is skipped.
    if (status === "pending" || status === "overdue") {
      const plan = await getPlanForUser(userId);
      const planLimits = getPlanLimits(plan);

      if (planLimits.maxPendingInvoices !== Infinity) {
        const invoicesRef = getInvoicesRef(db, userId);
        const unpaidSnapshot = await invoicesRef
          .where("status", "in", ["pending", "overdue"])
          .count()
          .get();

        const unpaidCount = unpaidSnapshot.data().count;

        if (unpaidCount >= planLimits.maxPendingInvoices) {
          throw new ApiError(
            "TRIAL_PENDING_LIMIT_REACHED",
            `Trial plan allows maximum ${planLimits.maxPendingInvoices} unpaid invoices. You have ${unpaidCount}. Please upgrade to create more invoices.`,
            403
          );
        }
      }
    }

    // Create invoice in businessProfiles/{userId}/invoices
    const invoicesRef = getInvoicesRef(db, userId);
    const newInvoice = {
      userId,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      amount: typeof amount === "number" ? amount : parseInt(amount, 10),
      dueAt: Timestamp.fromDate(new Date(dueAt)),
      status,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      notes: notes?.trim() || null,
      paymentLink: paymentLink?.trim() || null,
      autoChaseEnabled: autoChaseEnabled || false,
      autoChaseDays: autoChaseDays || null,
      maxChases: maxChases || null,
      chaseCount: 0,
      lastChasedAt: null,
      nextChaseAt: autoChaseEnabled
        ? Timestamp.fromDate(new Date(Date.now() + 60000)) // 1 minute from now
        : null,
    };

    const docRef = await invoicesRef.add(newInvoice);

    return NextResponse.json({
      success: true,
      invoiceId: docRef.id,
      message: "Invoice created successfully",
    });
  } catch (error) {
    console.error("[CREATE INVOICE] Error:", error, "requestId:", requestId);

    if (isApiError(error)) {
      const isDev = process.env.NODE_ENV !== "production";
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          requestId,
          ...(isDev && error.stack ? { stack: error.stack } : {}),
        },
        { status: error.status }
      );
    }

    const { status, body } = mapErrorToHttp(error);
    return NextResponse.json({ ...body, requestId }, { status });
  }
}
