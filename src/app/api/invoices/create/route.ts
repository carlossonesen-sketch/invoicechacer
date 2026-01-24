/**
 * API route to create an invoice
 * Enforces plan-based limits (e.g., max pending invoices for trial)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { getPlanForUser, getPlanLimits } from "@/lib/billing/plan";
import { mapErrorToHttp } from "@/lib/api/httpError";
import { isApiError } from "@/lib/api/ApiError";
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
 * Body: {
 *   userId: string;
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
  try {
    // Ensure Admin is initialized
    initFirebaseAdmin();

    const body = await request.json();
    const { userId, customerName, customerEmail, amount, dueAt, status, notes, paymentLink, autoChaseEnabled, autoChaseDays, maxChases } = body;

    // Validate required fields
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "TRIAL_PENDING_LIMIT_REACHED", message: "userId is required" },
        { status: 400 }
      );
    }

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

    // Check plan-based limits for pending invoices (trial only)
    if (status === "pending") {
      const plan = await getPlanForUser(userId);
      const planLimits = getPlanLimits(plan);

      if (planLimits.maxPendingInvoices !== Infinity) {
        // Count pending invoices for this user
        const pendingInvoicesRef = getInvoicesRef(db);
        const pendingSnapshot = await pendingInvoicesRef
          .where("userId", "==", userId)
          .where("status", "==", "pending")
          .count()
          .get();

        const pendingCount = pendingSnapshot.data().count;

        if (pendingCount >= planLimits.maxPendingInvoices) {
          return NextResponse.json(
            {
              error: "TRIAL_PENDING_LIMIT_REACHED",
              message: `Trial plan allows maximum ${planLimits.maxPendingInvoices} pending invoices. You have ${pendingCount}. Please upgrade to create more invoices.`,
              details: {
                currentCount: pendingCount,
                maxAllowed: planLimits.maxPendingInvoices,
                plan,
              },
            },
            { status: 403 }
          );
        }
      }
    }

    // Create invoice
    const invoicesRef = getInvoicesRef(db);
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
    console.error("[CREATE INVOICE] Error:", error);
    
    // Use ApiError status if present, otherwise fall back to mapErrorToHttp
    if (isApiError(error)) {
      const isDev = process.env.NODE_ENV !== "production";
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          ...(isDev && error.stack ? { stack: error.stack } : {}),
        },
        { status: error.status }
      );
    }
    
    const { status, body } = mapErrorToHttp(error);
    return NextResponse.json(body, { status });
  }
}
