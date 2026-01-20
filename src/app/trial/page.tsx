"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { startTrial } from "@/lib/billing";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";

type PlanId = "starter" | "pro" | "business";

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

export default function TrialPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("starter");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!auth) {
      router.push("/login?redirect=/trial");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (!currentUser) {
        const redirect = searchParams.get("redirect") || "/trial";
        router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
      }
    });

    return () => unsubscribe();
  }, [router, searchParams]);

  async function handleStartTrial() {
    if (!user) {
      router.push("/login?redirect=/trial");
      return;
    }

    setStarting(true);
    setError("");

    try {
      // Store in localStorage (stub for now)
      const trialStart = new Date();
      const trialEnd = new Date(trialStart);
      trialEnd.setDate(trialEnd.getDate() + 14); // 14-day trial

      localStorage.setItem("invoicechaser_selectedPlan", selectedPlan);
      localStorage.setItem("invoicechaser_trialStartedAt", trialStart.toISOString());
      localStorage.setItem("invoicechaser_trialEndsAt", trialEnd.toISOString());

      // Call Firestore-ready stub function
      await startTrial(user.uid, selectedPlan);

      // PATHNAME GUARD: Only redirect to dashboard if we're on the trial page
      if (pathname !== "/trial") {
        const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
        if (devToolsEnabled) {
          console.warn(`[Trial] BLOCKED redirect to /dashboard - pathname is ${pathname}, not /trial`);
          console.trace("Redirect blocked");
        }
        return;
      }

      // Redirect to dashboard
      const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
      if (devToolsEnabled) {
        console.log(`[Trial] Redirecting to /dashboard from pathname: ${pathname}`);
        console.trace("Trial -> Dashboard redirect");
      }
      router.push("/dashboard");
    } catch (err: any) {
      console.error("Failed to start trial:", err);
      setError(err.message || "Failed to start trial. Please try again.");
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <Header title="Start Free Trial" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-center text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <AppLayout>
      <Header title="Start Free Trial" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Choose Your Plan
            </h1>
            <p className="text-gray-600">
              Start with a 14-day free trial. No credit card required.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {tiers.map((tier) => (
              <div
                key={tier.id}
                onClick={() => setSelectedPlan(tier.id as PlanId)}
                className={`bg-white rounded-lg border-2 p-6 cursor-pointer transition-all ${
                  selectedPlan === tier.id
                    ? "border-blue-500 shadow-lg"
                    : tier.popular
                    ? "border-blue-200"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {tier.popular && (
                  <div className="text-center mb-3">
                    <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="text-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    {tier.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {tier.description}
                  </p>
                  <div>
                    <span className="text-3xl font-bold text-gray-900">
                      ${tier.price}
                    </span>
                    <span className="text-gray-600">/mo</span>
                  </div>
                </div>
                <ul className="space-y-2 mb-4 text-sm text-gray-600">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-blue-500 mr-2">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="text-center">
                  <div
                    className={`w-5 h-5 rounded-full border-2 mx-auto ${
                      selectedPlan === tier.id
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300"
                    }`}
                  >
                    {selectedPlan === tier.id && (
                      <div className="w-full h-full rounded-full bg-blue-500 flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Button
              onClick={handleStartTrial}
              disabled={starting}
              size="lg"
            >
              {starting ? "Starting trial..." : "Start free trial"}
            </Button>
            <p className="text-sm text-gray-600 mt-4">
              Your trial will start immediately. We'll remind you before it ends.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
