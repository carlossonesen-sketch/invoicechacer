/**
 * Access gating: trial vs paid.
 * Pure helpers — no I/O. Use with profile data + now.
 */

import { toJsDate } from "./dates";

export type ProfileLike = {
  subscriptionStatus?: string | null;
  stripeSubscriptionId?: string | null;
  trialStatus?: string | null;
  trialEndsAt?: unknown;
};

/**
 * True if user has active trial or paid subscription.
 * Pure: pass profile snapshot + now. No DB or network.
 */
export function isTrialActiveOrPaid(profile: ProfileLike | null | undefined, now: Date): boolean {
  if (!profile || typeof profile !== "object") return false;

  const sub = profile.subscriptionStatus;
  const stripeId = profile.stripeSubscriptionId;
  if (sub === "active") return true;
  if (typeof stripeId === "string" && stripeId.trim()) return true;

  const trialStatus = profile.trialStatus;
  const trialEndsAt = profile.trialEndsAt;
  const end = trialEndsAt ? toJsDate(trialEndsAt) : null;
  const trialValid = !!end && !isNaN(end.getTime()) && end > now;

  if (trialStatus === "active" && trialValid) return true;
  if (sub === "trial" && trialValid) return true;
  if (trialValid) return true;

  return false;
}

/**
 * True if user has paid subscription (active only; trial does not count).
 */
export function isPaid(profile: ProfileLike | null | undefined): boolean {
  if (!profile || typeof profile !== "object") return false;
  return profile.subscriptionStatus === "active";
}
