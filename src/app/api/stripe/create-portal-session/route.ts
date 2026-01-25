/**
 * Create a Stripe Customer Portal session for managing subscription.
 * POST /api/stripe/create-portal-session
 * Returns: { url: string }
 * Requires the user to have stripeCustomerId in businessProfiles.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function getBaseUrl(): string {
  const u = process.env.STRIPE_APP_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  const v = process.env.VERCEL_URL;
  if (v) return `https://${v}`;
  return "";
}

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
    const snap = await db.collection("businessProfiles").doc(userId).get();
    const stripeCustomerId = snap?.data()?.stripeCustomerId;
    if (typeof stripeCustomerId !== "string" || !stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing customer. Subscribe first." },
        { status: 400 }
      );
    }

    const base = getBaseUrl();
    if (!base) {
      return NextResponse.json({ error: "STRIPE_APP_URL or VERCEL_URL required" }, { status: 503 });
    }
    const returnUrl = `${base}/settings/billing`;

    const stripe = new Stripe(sk);
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 });
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const err = e as Error;
    if (err.message?.includes("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error("[STRIPE create-portal-session]", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
