"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { startTrial } from "@/lib/billing";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";

const tiers = [
  {
    id: "starter",
    name: "Starter",
    price: 10,
    description: "Perfect for solo owners",
    features: [
      "50 unpaid invoices",
      "25 active auto-chases",
      "500 auto-emails per month",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 25,
    description: "Best for growing teams",
    popular: true,
    features: [
      "200 unpaid invoices",
      "100 active auto-chases",
      "2,000 auto-emails per month",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: 79,
    description: "For high-volume operations",
    features: [
      "Unlimited unpaid invoices",
      "Unlimited active auto-chases",
      "10,000 auto-emails per month",
    ],
  },
];

const VALID_PLANS = ["starter", "pro", "business"] as const;
type ValidPlan = typeof VALID_PLANS[number];

export default function TrialPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!auth) {
      router.push("/login?redirect=/trial");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (!currentUser) {
        const plan = searchParams.get("plan") || "pro";
        const redirect = `/trial?plan=${plan}`;
        router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
        return;
      }

      // User is logged in, process the plan
      processPlan();
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const processPlan = async () => {
    if (processing) return;
    
    setProcessing(true);
    setError("");

    try {
      // Read plan from query param
      const planParam = searchParams.get("plan") || "pro";
      
      // Validate plan
      if (!VALID_PLANS.includes(planParam as ValidPlan)) {
        setError(`Invalid plan: "${planParam}". Please choose starter, pro, or business.`);
        setProcessing(false);
        return;
      }

      const validPlan = planParam as ValidPlan;

      // Save to localStorage
      localStorage.setItem("invoicechaser_selectedPlan", validPlan);

      // Store trial dates
      const trialStart = new Date();
      const trialEnd = new Date(trialStart);
      trialEnd.setDate(trialEnd.getDate() + 14); // 14-day trial
      localStorage.setItem("invoicechaser_trialStartedAt", trialStart.toISOString());
      localStorage.setItem("invoicechaser_trialEndsAt", trialEnd.toISOString());

      // Call Firestore-ready stub function
      if (user) {
        await startTrial(user.uid, validPlan);
      }

      // Redirect to dashboard
      router.push("/dashboard");
    } catch (err: any) {
      console.error("Failed to start trial:", err);
      setError(err.message || "Failed to start trial. Please try again.");
      setProcessing(false);
    }
  };

  if (loading || processing) {
    return (
      <AppLayout>
        <Header title="Start Free Trial" />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="text-gray-500 mb-4">
              {processing ? "Setting up your trial..." : "Loading..."}
            </div>
            {processing && (
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  // Show error state if plan validation failed
  if (error) {
    return (
      <AppLayout>
        <Header title="Start Free Trial" />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-4">
              <h2 className="text-lg font-semibold text-red-900 mb-2">
                Invalid Plan
              </h2>
              <p className="text-sm text-red-800 mb-4">{error}</p>
              <Button onClick={() => router.push("/pricing")} variant="secondary">
                Go to Pricing
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // This should not be reached if plan processing succeeds (redirects to dashboard)
  return (
    <AppLayout>
      <Header title="Start Free Trial" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-gray-500">Redirecting...</div>
        </div>
      </div>
    </AppLayout>
  );
}
