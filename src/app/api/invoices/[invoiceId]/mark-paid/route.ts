/**
 * API route to mark an invoice as paid
 * POST /api/invoices/[invoiceId]/mark-paid
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { mapErrorToHttp } from "@/lib/api/httpError";
import { isApiError } from "@/lib/api/ApiError";
import { resolveInvoiceRefAndBusinessId } from "@/lib/invoicePaths";

// Force Node.js runtime for Vercel
export const runtime = "nodejs";

// Initialize Firebase Admin at module load (silently fail during build if env vars not set)
try {
  initFirebaseAdmin();
} catch (error) {
  // Ignore during build - will be initialized at runtime
  if (process.env.NODE_ENV !== "production") {
    console.warn("[MARK PAID] Firebase Admin init failed at module load (will retry at runtime):", error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Mark an invoice as paid
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> | { invoiceId: string } }
) {
  try {
    // Ensure Admin is initialized
    initFirebaseAdmin();

    // Handle both Promise and direct params (Next.js version compatibility)
    const params = await Promise.resolve(context.params);
    const invoiceId = params.invoiceId;

    // Validate invoiceId
    if (!invoiceId || typeof invoiceId !== "string") {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Invoice ID is required" },
        { status: 400 }
      );
    }

    // Parse request body (optional paidAmountCents)
    let bodyPaidAmountCents: number | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      if (body.paidAmountCents !== undefined) {
        if (typeof body.paidAmountCents !== "number" || body.paidAmountCents < 0) {
          return NextResponse.json(
            { error: "INVALID_INPUT", message: "paidAmountCents must be a non-negative number" },
            { status: 400 }
          );
        }
        bodyPaidAmountCents = body.paidAmountCents;
      }
    } catch {
      // If JSON parse fails, continue with empty body (paidAmountCents will be undefined)
    }

    // Authenticate user
    let userId: string;
    try {
      userId = await getAuthenticatedUserId(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Authentication required";
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: errorMessage },
        { status: 401 }
      );
    }

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
        { status: 500 }
      );
    }

    const { invoiceRef, businessId, exists, data: invoiceData } = await resolveInvoiceRefAndBusinessId(db, invoiceId);

    if (!exists || !invoiceData) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Invoice not found" },
        { status: 404 }
      );
    }

    // Verify invoice belongs to user (businessId === userId)
    if (businessId !== userId) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Invoice does not belong to you" },
        { status: 403 }
      );
    }

    type TxResult =
      | { notFound: true }
      | { idempotent: true; status: "paid"; paidAt: string | null; paidAmountCents: number }
      | { idempotent: false; status: "paid"; paidAt: string; paidAmountCents: number };

    const txResult = await db.runTransaction(async (tx): Promise<TxResult> => {
      const snap = await tx.get(invoiceRef);
      if (!snap.exists) {
        return { notFound: true };
      }
      const data = snap.data()!;

      // Idempotent: if already paid, return 200 with invoice unchanged
      if (data.status === "paid") {
        const pa = data.paidAt;
        const paidAtStr =
          pa && typeof pa === "object" && "toDate" in pa
            ? (pa as Timestamp).toDate().toISOString()
            : pa != null
              ? String(pa)
              : null;
        return {
          idempotent: true,
          status: "paid",
          paidAt: paidAtStr,
          paidAmountCents: (data.paidAmountCents ?? data.amount ?? 0) as number,
        };
      }

      const now = new Date();
      const finalPaidAmountCents =
        bodyPaidAmountCents !== undefined ? bodyPaidAmountCents : ((data.amount as number) || 0);
      const paidMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      tx.update(invoiceRef, {
        paidAt: Timestamp.fromDate(now),
        paidMonthKey,
        status: "paid",
        paidAmountCents: finalPaidAmountCents,
        updatedAt: FieldValue.serverTimestamp(),
        nextChaseAt: null,
        processingAt: null,
        ...(data.autoChaseEnabled !== undefined && { autoChaseEnabled: false }),
      });

      tx.set(invoiceRef.collection("chaseEvents").doc(), {
        type: "MARK_PAID",
        createdAt: FieldValue.serverTimestamp(),
        actor: "user",
      });

      return {
        idempotent: false,
        status: "paid",
        paidAt: now.toISOString(),
        paidAmountCents: finalPaidAmountCents,
      };
    });

    if ("notFound" in txResult && txResult.notFound) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Invoice not found" }, { status: 404 });
    }

    const res = txResult as Exclude<TxResult, { notFound: true }>;
    return NextResponse.json({
      ok: true,
      invoiceId,
      status: res.status,
      paidAt: res.paidAt,
      paidAmountCents: res.paidAmountCents,
    });
  } catch (error) {
    console.error("[MARK PAID] Error:", error);
    
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
