"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { toJsDate } from "@/lib/dates";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { EntitlementsService } from "@/lib/entitlements";

type PlanId = "starter" | "pro" | "business" | "free";

const planLimits: Record<PlanId, {
  invoices: string;
  activeChases: string;
  emailsPerMonth: string;
  maxReminders: string;
  autoStopDays: number;
}> = {
  free: {
    invoices: "Unlimited",
    activeChases: "0",
    emailsPerMonth: "0",
    maxReminders: "0",
    autoStopDays: 60,
  },
  starter: {
    invoices: "50",
    activeChases: "25",
    emailsPerMonth: "500",
    maxReminders: "5",
    autoStopDays: 60,
  },
  pro: {
    invoices: "200",
    activeChases: "100",
    emailsPerMonth: "2,000",
    maxReminders: "10",
    autoStopDays: 60,
  },
  business: {
    invoices: "Unlimited",
    activeChases: "Unlimited",
    emailsPerMonth: "10,000",
    maxReminders: "15",
    autoStopDays: 60,
  },
};

const planPrices: Record<PlanId, number> = {
  free: 0,
  starter: 10,
  pro: 25,
  business: 79,
};

export default function BillingPage() {
  const router = useRouter();
  const { isPro, loading } = useEntitlements();
  const [isDev, setIsDev] = useState(false);
  const [planFromFirestore, setPlanFromFirestore] = useState<PlanId | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [emailsSentThisMonth, setEmailsSentThisMonth] = useState<number | null>(null);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (user === null && !loadingPlan) {
      router.replace("/login?redirect=" + encodeURIComponent("/settings/billing"));
    }
  }, [user, loadingPlan, router]);

  // Load plan and trial info from Firestore
  useEffect(() => {
    if (!auth || !db) {
      setLoadingPlan(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser ?? null);
      if (!authUser) {
        setLoadingPlan(false);
        return;
      }

      if (!db) {
        setLoadingPlan(false);
        return;
      }

      (async () => {
        try {
          const profileRef = doc(db, "businessProfiles", authUser.uid);
          const profileSnap = await getDoc(profileRef);

          if (profileSnap.exists()) {
            const data = profileSnap.data();
            const plan = data?.plan || data?.trialTier;
            if (plan && (plan === "starter" || plan === "pro" || plan === "business")) {
              setPlanFromFirestore(plan as PlanId);
              localStorage.setItem("invoicechaser_selectedPlan", plan);
            }
            setSubscriptionStatus(typeof data?.subscriptionStatus === "string" ? data.subscriptionStatus : null);
            setStripeCustomerId(typeof data?.stripeCustomerId === "string" ? data.stripeCustomerId : null);
            const te = data?.trialEndsAt;
            const parsed = toJsDate(te);
            setTrialEndsAt(parsed && !isNaN(parsed.getTime()) ? parsed : null);
          }
        } catch (error) {
          console.error("Failed to load plan from Firestore:", error);
        } finally {
          setLoadingPlan(false);
        }
      })();
    });

    return () => unsubscribe();
  }, []);

  // Fetch stats summary for usage (emails sent this month)
  useEffect(() => {
    if (!user) {
      setEmailsSentThisMonth(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/stats/summary", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (typeof data.emailsSentThisMonth === "number" && !cancelled) {
          setEmailsSentThisMonth(data.emailsSentThisMonth);
        }
      } catch {
        if (!cancelled) setEmailsSentThisMonth(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Determine current plan (Firestore first, then localStorage cache, then legacy)
  const currentPlan = useMemo<PlanId>(() => {
    if (typeof window === "undefined") return "free";
    
    // First priority: plan from Firestore
    if (planFromFirestore) {
      return planFromFirestore;
    }
    
    // Second priority: localStorage cache (from trial or previous Firestore read)
    const selectedPlan = localStorage.getItem("invoicechaser_selectedPlan") as PlanId | null;
    if (selectedPlan && (selectedPlan === "starter" || selectedPlan === "pro" || selectedPlan === "business")) {
      return selectedPlan;
    }
    
    // Legacy: check isPro flag
    if (isPro) {
      return "pro"; // Default pro if isPro is true but no selectedPlan
    }
    
    return "free";
  }, [planFromFirestore, isPro]);
  
  const planLimitsData = planLimits[currentPlan];
  const planPrice = planPrices[currentPlan];

  useEffect(() => {
    const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1" || process.env.NODE_ENV !== "production";
    setIsDev(devToolsEnabled);
  }, []);

  if (!user && !loadingPlan) {
    return (
      <AppLayout>
        <Header title="Billing" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Redirecting to login...</div>
        </div>
      </AppLayout>
    );
  }

  if (loading || loadingPlan) {
    return (
      <AppLayout>
        <Header title="Billing" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Billing & Plan" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl space-y-6">
          {/* Back Link */}
          <div>
            <button
              onClick={() => router.push("/settings")}
              className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span className="mr-1">←</span>
              Back to Settings
            </button>
          </div>

          {/* Current Plan */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Plan</h2>
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-2xl font-bold text-gray-900">{currentPlan === "free" ? "Free" : currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {currentPlan === "free" ? "No charge" : `$${planPrice}/month`}
                </div>
              </div>
              {stripeCustomerId && (
                <Button
                  variant="secondary"
                  disabled={portalLoading}
                  onClick={async () => {
                    if (!user) return;
                    setBillingError(null);
                    setPortalLoading(true);
                    try {
                      const token = await user.getIdToken();
                      const res = await fetch("/api/stripe/create-portal-session", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: "{}",
                      });
                      const d = await res.json().catch(() => ({}));
                      if (d.url) {
                        window.location.href = d.url;
                        return;
                      }
                      setBillingError(d.error || "Failed to open billing portal");
                    } catch (e) {
                      setBillingError(e instanceof Error ? e.message : "Failed to open billing portal");
                    } finally {
                      setPortalLoading(false);
                    }
                  }}
                >
                  {portalLoading ? "Opening…" : "Manage billing"}
                </Button>
              )}
            </div>
            
            {/* Plan Limits */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Plan Limits</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Unpaid Invoices</div>
                  <div className="text-lg font-semibold text-gray-900">{planLimitsData.invoices}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Active Auto-Chases</div>
                  <div className="text-lg font-semibold text-gray-900">{planLimitsData.activeChases}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Auto-Emails per Month</div>
                  <div className="text-lg font-semibold text-gray-900">{planLimitsData.emailsPerMonth}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Max Reminders per Invoice</div>
                  <div className="text-lg font-semibold text-gray-900">{planLimitsData.maxReminders}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-gray-500">Auto-Stop Window</div>
                  <div className="text-lg font-semibold text-gray-900">After {planLimitsData.autoStopDays} days overdue</div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage This Month</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Auto emails sent:</span>
                  <span className="font-medium text-gray-900">
                    {emailsSentThisMonth !== null ? emailsSentThisMonth : "—"} / {planLimitsData.emailsPerMonth}
                  </span>
                </div>
              </div>
            </div>
            {billingError && (
              <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                {billingError}
              </div>
            )}
          </div>

          {/* Trial — upgrade CTA (only when subscriptionStatus is "trial"; paid users never see this) */}
          {subscriptionStatus === "trial" && currentPlan !== "free" && (() => {
            const hasValidEndDate = trialEndsAt != null && !isNaN(trialEndsAt.getTime());
            const isTrialExpired = hasValidEndDate && trialEndsAt! < new Date();
            const planLabel = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
            let heading: string;
            let body: string;
            if (hasValidEndDate && isTrialExpired) {
              heading = "Your trial has ended";
              body = `Your trial ended on ${trialEndsAt!.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. Add a payment method to continue using ${planLabel}.`;
            } else if (hasValidEndDate) {
              heading = "You're on a free trial";
              body = `Your trial ends on ${trialEndsAt!.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. Add a payment method to keep your plan after the trial.`;
            } else {
              heading = "You're on a free trial";
              body = "Add a payment method to continue your plan after the trial.";
            }
            const isExpired = hasValidEndDate && isTrialExpired;
            return (
              <div className={`rounded-lg border p-6 ${isExpired ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                <h3 className={`text-lg font-semibold mb-2 ${isExpired ? "text-red-900" : "text-amber-900"}`}>{heading}</h3>
                <p className={`mb-4 ${isExpired ? "text-red-800" : "text-amber-800"}`}>{body}</p>
                <div className="flex gap-3">
                  <Button
                    disabled={checkoutLoading}
                    onClick={async () => {
                      if (!user) return;
                      setBillingError(null);
                      setCheckoutLoading(true);
                      try {
                        const token = await user.getIdToken();
                        const res = await fetch("/api/stripe/create-checkout-session", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ plan: currentPlan }),
                        });
                        const d = await res.json().catch(() => ({}));
                        if (d.url) {
                          window.location.href = d.url;
                          return;
                        }
                        setBillingError(d.error || "Failed to start checkout");
                      } catch (e) {
                        setBillingError(e instanceof Error ? e.message : "Failed to start checkout");
                      } finally {
                        setCheckoutLoading(false);
                      }
                    }}
                  >
                    {checkoutLoading ? "Opening…" : "Add payment method"}
                  </Button>
                  <Button onClick={() => router.push("/pricing")} variant="secondary">
                    View plans
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* Upgrade/Manage Actions */}
          {currentPlan === "free" && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
              <p className="text-gray-600 mb-4">
                Ready to unlock auto-chase emails and more?
              </p>
              <div className="flex gap-4 justify-center">
                <Button onClick={() => router.push("/pricing")}>
                  View Pricing
                </Button>
              </div>
            </div>
          )}

          {/* Dev Toggle */}
          {isDev && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-yellow-900 mb-2">Development Tools</h3>
              <p className="text-sm text-yellow-800 mb-4">
                In development mode, you can toggle Pro status directly. This will be replaced with real billing integration.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-yellow-900">
                  Pro Status: {isPro ? "Enabled" : "Disabled"}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPro}
                    onChange={(e) => EntitlementsService.setPro(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
      </AppLayout>
    );
}
