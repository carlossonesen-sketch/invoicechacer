"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { EntitlementsService } from "@/lib/entitlements";
import Link from "next/link";

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
  const [upgrading, setUpgrading] = useState(false);
  
  // Determine current plan
  const currentPlan = useMemo<PlanId>(() => {
    if (typeof window === "undefined") return "free";
    
    // Check localStorage for selected plan (from trial)
    const selectedPlan = localStorage.getItem("invoicechaser_selectedPlan") as PlanId | null;
    if (selectedPlan && (selectedPlan === "starter" || selectedPlan === "pro" || selectedPlan === "business")) {
      return selectedPlan;
    }
    
    // Legacy: check isPro flag
    if (isPro) {
      return "pro"; // Default pro if isPro is true but no selectedPlan
    }
    
    return "free";
  }, [isPro]);
  
  const planLimitsData = planLimits[currentPlan];
  const planPrice = planPrices[currentPlan];

  useEffect(() => {
    const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1" || process.env.NODE_ENV !== "production";
    setIsDev(devToolsEnabled);
  }, []);

  function handleUpgrade() {
    const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1" || process.env.NODE_ENV !== "production";
    
    if (!devToolsEnabled) {
      // In production, show "Coming soon / join waitlist" message
      alert("Real billing integration is coming soon! Please join our waitlist or contact support for early access.");
      return;
    }

    // Only allow upgrade in dev mode
    setUpgrading(true);
    setTimeout(() => {
      EntitlementsService.setPro(true);
      setUpgrading(false);
    }, 500);
  }

  function handleDowngrade() {
    if (!confirm("Are you sure you want to downgrade to Free plan? You'll lose access to Pro features.")) {
      return;
    }
    EntitlementsService.setPro(false);
  }

  if (loading) {
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
            
            {/* Usage This Month (Placeholder) */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage This Month</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Auto emails sent:</span>
                  <span className="font-medium text-gray-900">— / {planLimitsData.emailsPerMonth}</span>
                </div>
                {/* TODO: Wire usage from server counters */}
                <p className="text-xs text-gray-500 mt-2">Usage tracking will be available soon</p>
              </div>
            </div>
          </div>

          {/* Upgrade/Manage Actions */}
          {currentPlan === "free" && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
              <p className="text-gray-600 mb-4">
                Ready to unlock auto-chase emails and more?
              </p>
              <div className="flex gap-4 justify-center">
                <Button onClick={() => router.push("/trial")}>
                  Start Free Trial
                </Button>
                <Button onClick={() => router.push("/pricing")} variant="secondary">
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
