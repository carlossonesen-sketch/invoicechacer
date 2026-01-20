/**
 * Billing service - Firestore-ready stubs for trial and subscription management
 * 
 * TODO (Tomorrow): Integrate with Stripe for:
 * - Creating checkout sessions
 * - Webhook handling for subscription events
 * - Trial auto-conversion to paid subscription
 * - Subscription cancellation
 * - Plan upgrades/downgrades
 */

/**
 * Start a free trial for a user
 * 
 * @param uid - User ID
 * @param plan - Selected plan: "starter" | "pro" | "business"
 * 
 * TODO (Tomorrow):
 * - Create Firestore document: users/{uid}/subscription with:
 *   - plan: string
 *   - status: "trial" | "active" | "cancelled"
 *   - trialStartedAt: serverTimestamp()
 *   - trialEndsAt: serverTimestamp() + 14 days
 *   - currentPeriodStart: serverTimestamp()
 *   - currentPeriodEnd: serverTimestamp() + 14 days
 * - Call Stripe API to create a trial subscription
 * - Set up webhook listener for trial_end event to auto-convert
 * 
 * @returns Promise that resolves when trial is started
 */
export async function startTrial(uid: string, plan: "starter" | "pro" | "business"): Promise<void> {
  // Stub implementation - just return success for now
  // TODO: Implement Firestore write and Stripe integration
  
  if (!uid || !plan) {
    throw new Error("User ID and plan are required");
  }

  if (!["starter", "pro", "business"].includes(plan)) {
    throw new Error("Invalid plan selected");
  }

  // Placeholder: In production, this would:
  // 1. Write to Firestore: users/{uid}/subscription
  // 2. Create Stripe subscription with trial period
  // 3. Set up webhook handlers
  
  return Promise.resolve();
}

/**
 * Get current subscription status for a user
 * 
 * TODO (Tomorrow):
 * - Read from Firestore: users/{uid}/subscription
 * - Return subscription details including:
 *   - plan name
 *   - status (trial, active, cancelled)
 *   - trial end date if in trial
 *   - current period end
 *   - cancel_at_period_end flag
 * 
 * @param uid - User ID
 * @returns Subscription info or null if no subscription
 */
export async function getSubscription(uid: string): Promise<any | null> {
  // Stub implementation
  // TODO: Read from Firestore and return subscription data
  
  return null;
}

/**
 * Cancel subscription (at period end)
 * 
 * TODO (Tomorrow):
 * - Update Firestore: set cancel_at_period_end: true
 * - Call Stripe API to schedule cancellation
 * - User keeps access until period end
 * 
 * @param uid - User ID
 */
export async function cancelSubscription(uid: string): Promise<void> {
  // Stub implementation
  // TODO: Update Firestore and call Stripe API
  
  throw new Error("Not implemented yet");
}

/**
 * Upgrade or downgrade plan
 * 
 * TODO (Tomorrow):
 * - Validate plan change rules (e.g., can't downgrade mid-period without proration)
 * - Update Firestore subscription document
 * - Call Stripe API to update subscription
 * - Handle proration if upgrading mid-period
 * 
 * @param uid - User ID
 * @param newPlan - New plan: "starter" | "pro" | "business"
 */
export async function changePlan(
  uid: string,
  newPlan: "starter" | "pro" | "business"
): Promise<void> {
  // Stub implementation
  // TODO: Implement plan change logic with Stripe
  
  throw new Error("Not implemented yet");
}
