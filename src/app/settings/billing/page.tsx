"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { EntitlementsService } from "@/lib/entitlements";

export default function BillingPage() {
  const router = useRouter();
  const { isPro, loading } = useEntitlements();
  const [isDev, setIsDev] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

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

          {/* Plan Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Free Plan */}
            <div className={`bg-white rounded-lg border-2 p-6 ${!isPro ? "border-blue-500" : "border-gray-200"}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">Free</h3>
                {!isPro && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    Current Plan
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-2">$0</div>
              <div className="text-sm text-gray-500 mb-6">per month</div>
              
              <ul className="space-y-3 mb-6">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-600">Unlimited invoices</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-600">CSV import</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-gray-300 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-400">Auto-chase emails</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-gray-300 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-400">Priority support</span>
                </li>
              </ul>

              {!isPro && (
                <Button onClick={handleUpgrade} disabled={upgrading} className="w-full">
                  {upgrading ? "Upgrading..." : "Upgrade to Pro"}
                </Button>
              )}
              {isPro && (
                <Button variant="secondary" disabled className="w-full">
                  Current Plan
                </Button>
              )}
            </div>

            {/* Pro Plan */}
            <div className={`bg-white rounded-lg border-2 p-6 ${isPro ? "border-blue-500" : "border-gray-200"}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">Pro</h3>
                {isPro && (
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                    Current Plan
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-2">$29</div>
              <div className="text-sm text-gray-500 mb-6">per month</div>
              
              <ul className="space-y-3 mb-6">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-600">Everything in Free</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-600">Auto-chase emails</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-600">Custom chase cadence</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-600">Priority support</span>
                </li>
              </ul>

              {!isPro && (
                <Button onClick={handleUpgrade} disabled={upgrading} className="w-full">
                  {upgrading ? "Upgrading..." : "Upgrade to Pro"}
                </Button>
              )}
              {isPro && (
                <Button variant="secondary" onClick={handleDowngrade} className="w-full">
                  Downgrade to Free
                </Button>
              )}
            </div>
          </div>

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

          {/* Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Real billing integration is coming soon. For now, Pro status is managed via localStorage for development and testing purposes.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
