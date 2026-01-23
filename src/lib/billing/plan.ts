/**
 * Plan definitions and limits
 * Single source of truth for tier-based feature limits
 */

import { getAdminFirestore } from "@/lib/firebase-admin";

export type Plan = "trial" | "starter" | "pro" | "business";

export interface PlanLimits {
  dailyEmailCap: number;
  cooldownMinutes: number;
  maxPendingInvoices: number;
  perInvoiceTypeCaps: {
    invoice_initial: number;
    invoice_reminder: number;
    invoice_due: number;
    invoice_late_weekly: number;
  };
}

/**
 * Plan limits configuration
 * Trial has strict limits; paid tiers have higher or unlimited caps
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  trial: {
    dailyEmailCap: 50, // Lower daily cap for trial
    cooldownMinutes: 60,
    maxPendingInvoices: 10,
    perInvoiceTypeCaps: {
      invoice_initial: 1,
      invoice_reminder: 1,
      invoice_due: 1,
      invoice_late_weekly: 3, // Only weeks 1-3 allowed
    },
  },
  starter: {
    dailyEmailCap: 200,
    cooldownMinutes: 60,
    maxPendingInvoices: Infinity,
    perInvoiceTypeCaps: {
      invoice_initial: Infinity, // No cap, but idempotency still enforced
      invoice_reminder: Infinity,
      invoice_due: Infinity,
      invoice_late_weekly: Infinity, // All 8 weeks allowed
    },
  },
  pro: {
    dailyEmailCap: 500,
    cooldownMinutes: 30,
    maxPendingInvoices: Infinity,
    perInvoiceTypeCaps: {
      invoice_initial: Infinity,
      invoice_reminder: Infinity,
      invoice_due: Infinity,
      invoice_late_weekly: Infinity,
    },
  },
  business: {
    dailyEmailCap: 2000,
    cooldownMinutes: 15,
    maxPendingInvoices: Infinity,
    perInvoiceTypeCaps: {
      invoice_initial: Infinity,
      invoice_reminder: Infinity,
      invoice_due: Infinity,
      invoice_late_weekly: Infinity,
    },
  },
};

/**
 * Get plan for a user from Firestore
 * Checks businessProfiles/{userId}.plan first, then users/{userId}.plan
 * Defaults to "trial" in dev, "starter" in production
 */
export async function getPlanForUser(userId: string): Promise<Plan> {
  const db = getAdminFirestore();
  if (!db) {
    // Fallback to safe default if admin not initialized
    return process.env.NODE_ENV === "production" ? "starter" : "trial";
  }

  try {
    // Try businessProfiles first (if that's where plan is stored)
    const businessProfileRef = db.collection("businessProfiles").doc(userId);
    const businessProfileDoc = await businessProfileRef.get();
    
    if (businessProfileDoc.exists) {
      const data = businessProfileDoc.data();
      if (data?.plan && typeof data.plan === "string") {
        const plan = data.plan as Plan;
        if (isValidPlan(plan)) {
          return plan;
        }
      }
    }

    // Try users collection
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      const data = userDoc.data();
      if (data?.plan && typeof data.plan === "string") {
        const plan = data.plan as Plan;
        if (isValidPlan(plan)) {
          return plan;
        }
      }
    }

    // Default: trial in dev, starter in production
    return process.env.NODE_ENV === "production" ? "starter" : "trial";
  } catch (error) {
    console.error(`[PLAN] Error fetching plan for user ${userId}:`, error);
    // Safe fallback
    return process.env.NODE_ENV === "production" ? "starter" : "trial";
  }
}

/**
 * Validate that a plan string is a valid Plan type
 */
function isValidPlan(plan: string): plan is Plan {
  return ["trial", "starter", "pro", "business"].includes(plan);
}

/**
 * Get limits for a specific plan
 */
export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}
