/**
 * Stripe webhook: verify signature, handle checkout.session.completed,
 * customer.subscription.updated, customer.subscription.deleted.
 * Updates businessProfiles/{userId}: plan, subscriptionStatus, stripeCustomerId, stripeSubscriptionId.
 *
 * POST /api/stripe/webhook
 * Raw body required for Stripe-Signature verification. Do not parse body before this route.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

const PLANS = ["starter", "pro", "business"] as const;
type Plan = (typeof PLANS)[number];

function priceIdToPlan(priceId: string): Plan | null {
  const s = process.env.STRIPE_PRICE_STARTER?.trim();
  const p = process.env.STRIPE_PRICE_PRO?.trim();
  const b = process.env.STRIPE_PRICE_BUSINESS?.trim();
  if (priceId === s) return "starter";
  if (priceId === p) return "pro";
  if (priceId === b) return "business";
  return null;
}

async function updateFirestore(
  userId: string,
  update: Record<string, unknown>
): Promise<void> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firebase Admin not initialized");
  const ref = db.collection("businessProfiles").doc(userId);
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(update)) {
    if (v !== undefined) clean[k] = v;
  }
  clean.updatedAt = FieldValue.serverTimestamp();
  await ref.set(clean, { merge: true });
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch (e) {
    console.error("[STRIPE webhook] Failed to read body", e);
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, sig, secret) as Stripe.Event;
  } catch (e) {
    const err = e as Error;
    console.error("[STRIPE webhook] Signature verification failed", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    initFirebaseAdmin();
  } catch (e) {
    console.error("[STRIPE webhook] Firebase init failed", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return NextResponse.json({ received: true });

      const userId =
        (session.metadata?.userId as string) || (session.client_reference_id as string) || "";
      if (!userId) {
        console.warn("[STRIPE webhook] checkout.session.completed: no userId in metadata or client_reference_id");
        return NextResponse.json({ received: true });
      }

      const plan = ((session.metadata?.tier || session.metadata?.plan) as Plan) || "starter";
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

      if (!customerId || !subId) {
        console.warn("[STRIPE webhook] checkout.session.completed: missing customer or subscription");
      }

      await updateFirestore(userId, {
        plan: PLANS.includes(plan) ? plan : "starter",
        subscriptionStatus: "active",
        ...(customerId && { stripeCustomerId: customerId }),
        ...(subId && { stripeSubscriptionId: subId }),
      });

      // Store userId on subscription metadata for subscription.updated/deleted
      if (subId && process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
          await stripe.subscriptions.update(subId, { metadata: { userId } });
        } catch (e) {
          console.warn("[STRIPE webhook] Failed to set subscription metadata", e);
        }
      }
      return NextResponse.json({ received: true });
    }

    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const userId = (sub.metadata?.userId as string) || "";
      if (!userId) {
        const custId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        console.warn("[STRIPE webhook] customer.subscription.updated: no userId in metadata, customer=", custId);
        return NextResponse.json({ received: true });
      }

      const priceId = sub.items?.data?.[0]?.price?.id;
      const plan = priceId ? priceIdToPlan(priceId) : null;
      const status = sub.status;

      const update: Record<string, unknown> = {
        subscriptionStatus: status,
        stripeSubscriptionId: sub.id,
      };
      if (plan) update.plan = plan;
      await updateFirestore(userId, update);
      return NextResponse.json({ received: true });
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const userId = (sub.metadata?.userId as string) || "";
      if (!userId) {
        const custId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        console.warn("[STRIPE webhook] customer.subscription.deleted: no userId in metadata, customer=", custId);
        return NextResponse.json({ received: true });
      }

      await updateFirestore(userId, {
        plan: "trial",
        subscriptionStatus: "canceled",
        stripeSubscriptionId: FieldValue.delete(),
      });
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[STRIPE webhook] Handler error", e);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
}
