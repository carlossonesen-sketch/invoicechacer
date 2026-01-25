/**
 * Billing service: trial and subscription helpers.
 * Trial write is done by the trial page (Firestore businessProfiles). startTrial is a hook
 * for optional Stripe or other setup; it currently no-ops. Stripe integration (checkout,
 * webhooks, plan changes) can be added when needed.
 */

/**
 * Hook called after trial is written to Firestore. No-op for now; add Stripe or other
 * setup here when integrating paid billing.
 */
export async function startTrial(uid: string, plan: "starter" | "pro" | "business"): Promise<void> {
  if (!uid || !plan) {
    throw new Error("User ID and plan are required");
  }
  if (!["starter", "pro", "business"].includes(plan)) {
    throw new Error("Invalid plan selected");
  }
  // Optional: Stripe trial subscription, webhooks, etc.
  return Promise.resolve();
}
