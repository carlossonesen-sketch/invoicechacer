/**
 * POST /api/stripe/cancel-subscription
 * Cancels the current subscription at the end of the billing period.
 * Requires active subscription (subscriptionStatus === "active").
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    initFirebaseAdmin();
    const userId = await getAuthenticatedUserId(request);

    const sk = process.env.STRIPE_SECRET_KEY?.trim();
    if (!sk) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
    }

    const profileSnap = await db.collection("businessProfiles").doc(userId).get();
    const data = profileSnap.data();
    const subscriptionStatus = data?.subscriptionStatus;
    const stripeSubscriptionId = data?.stripeSubscriptionId;

    if (subscriptionStatus !== "active") {
      return NextResponse.json(
        { error: "NO_ACTIVE_SUBSCRIPTION", message: "No active subscription to cancel." },
        { status: 400 }
      );
    }
    if (typeof stripeSubscriptionId !== "string" || !stripeSubscriptionId) {
      return NextResponse.json(
        { error: "NO_SUBSCRIPTION_ID", message: "Subscription record not found." },
        { status: 400 }
      );
    }

    const stripe = new Stripe(sk);
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({ ok: true, message: "Subscription will cancel at the end of the billing period." });
  } catch (e) {
    const err = e as Error;
    if (err.message?.startsWith("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED", message: err.message }, { status: 401 });
    }
    console.error("[STRIPE cancel-subscription]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: err.message || "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
