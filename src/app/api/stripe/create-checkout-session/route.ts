/**
 * Create a Stripe Checkout Session for subscription (Starter/Pro/Business).
 * POST /api/stripe/create-checkout-session
 * Body: { tier: "starter" | "pro" | "business" } (or plan for backwards compat)
 * Auth: Bearer token.
 * Uses STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS.
 * Returns: { url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { getAdminFirestore, getAdminApp, initFirebaseAdmin } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";

const PLANS = ["starter", "pro", "business"] as const;
type Plan = (typeof PLANS)[number];

function getPriceId(plan: Plan): string | null {
  const id = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

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

    let body: { plan?: string; tier?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const tier = body?.tier || body?.plan;
    if (!tier || !PLANS.includes(tier as Plan)) {
      return NextResponse.json({ error: "tier must be starter, pro, or business" }, { status: 400 });
    }
    const priceId = getPriceId(tier as Plan);
    if (!priceId) {
      return NextResponse.json({ error: `Stripe price not configured for ${tier} (STRIPE_PRICE_${tier.toUpperCase()})` }, { status: 503 });
    }

    const base = getBaseUrl();
    if (!base) {
      return NextResponse.json({ error: "STRIPE_APP_URL or VERCEL_URL required" }, { status: 503 });
    }
    const successUrl = `${base}/settings/billing?checkout=success`;
    const cancelUrl = `${base}/settings/billing?checkout=cancelled`;

    let customerId: string | undefined;
    let customerEmail: string | undefined;
    const db = getAdminFirestore();
    if (db) {
      const snap = await db.collection("businessProfiles").doc(userId).get();
      const data = snap?.data();
      if (typeof data?.stripeCustomerId === "string" && data.stripeCustomerId) {
        customerId = data.stripeCustomerId;
      }
    }
    if (!customerId) {
      try {
        const auth = getAuth(getAdminApp());
        const u = await auth.getUser(userId);
        if (u?.email) customerEmail = u.email;
      } catch {
        // ignore
      }
    }

    const stripe = new Stripe(sk);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      metadata: { userId, tier },
      success_url: successUrl,
      cancel_url: cancelUrl,
      ...(customerId ? { customer: customerId } : customerEmail ? { customer_email: customerEmail } : {}),
    });

    const url = session.url;
    if (!url) {
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }
    return NextResponse.json({ url });
  } catch (e) {
    const err = e as Error & { statusCode?: number };
    if (err.message?.includes("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error("[STRIPE create-checkout-session]", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
