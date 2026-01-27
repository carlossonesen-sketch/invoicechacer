"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, firebaseUnavailable } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { isValidEmail } from "@/lib/utils";

const painPoints = [
  "Manual follow-ups eat hours every week",
  "Unpaid invoices stall cash flow",
  "Awkward reminders strain client relationships",
];

const howItWorks = [
  { step: 1, title: "Add invoice", description: "Add a customer and amount." },
  { step: 2, title: "Turn on auto-chase", description: "We send polite reminders on your schedule." },
  { step: 3, title: "Get paid", description: "We stop as soon as they pay or reply." },
];

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (firebaseUnavailable || !auth) {
      setError("Firebase configuration is missing. Please check your environment variables.");
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (firebaseUnavailable || !auth) {
      setError("Firebase configuration is missing. Please check your environment variables.");
      return;
    }

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!password.trim()) {
      setError("Password is required");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      let userCredential;

      if (isCreating) {
        userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      }

      const idToken = await userCredential.user.getIdToken();

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session");
      }

      try {
        await fetch("/api/trial/start", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } catch {
        /* non-blocking */
      }

      if (pathname === "/login") {
        const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
        try {
          const profileRes = await fetch("/api/business-profile", {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          const profileData = (await profileRes.json().catch(() => ({}))) as { exists?: boolean; error?: string; message?: string };
          if (!profileRes.ok) {
            if (devToolsEnabled) console.log("[redirect->dashboard]", { pathname, reason: "Profile API error" });
            router.replace("/dashboard");
            router.refresh();
            return;
          }
          if (!profileData.exists) {
            if (devToolsEnabled) console.log("[redirect->onboarding]", { pathname, reason: "No profile" });
            router.replace("/onboarding/company");
          } else {
            if (devToolsEnabled) console.log("[redirect->dashboard]", { pathname, reason: "Profile exists" });
            router.replace("/dashboard");
          }
        } catch (profileError) {
          console.error("Failed to check business profile:", profileError);
          if (devToolsEnabled) console.log("[redirect->dashboard]", { pathname, reason: "Profile check failed" });
          router.replace("/dashboard");
        }
        router.refresh();
      }
    } catch (err: unknown) {
      console.error("Auth error:", err);
      const errorCode = err && typeof err === "object" && "code" in err ? String(err.code) : undefined;
      if (errorCode === "auth/user-not-found") {
        setError("No account found with this email. Toggle \"Create account\" to sign up.");
      } else if (errorCode === "auth/wrong-password") {
        setError("Incorrect password");
      } else if (errorCode === "auth/email-already-in-use") {
        setError("Email already in use. Sign in instead.");
        setIsCreating(false);
      } else if (errorCode === "auth/weak-password") {
        setError("Password is too weak");
      } else {
        setError(err instanceof Error ? err.message : "Failed to authenticate. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero — blue gradient, headline, subhead */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-16 sm:pb-20">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-center">
            Get Paid Faster — Without Awkward Follow-Ups
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-blue-100 text-center max-w-2xl mx-auto">
            Invoice Chaser automatically follows up on unpaid invoices so you don&apos;t have to.
          </p>
          {/* Auth card in hero */}
          <div className="mt-10 max-w-md mx-auto">
            <div className="bg-white rounded-xl shadow-xl p-6 sm:p-8 text-gray-900">
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Email" htmlFor="email" required error={error}>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    disabled={loading}
                    error={!!error}
                    autoFocus
                  />
                </FormField>
                <FormField label="Password" htmlFor="password" required>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    disabled={loading}
                    error={!!error}
                  />
                </FormField>
                {isCreating ? (
                  <button
                    type="button"
                    onClick={() => { setIsCreating(false); setError(""); }}
                    disabled={loading}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Already have an account? Sign in instead.
                  </button>
                ) : (
                  <div className="space-y-1">
                    <Button
                      type="button"
                      onClick={() => { setIsCreating(true); setError(""); }}
                      disabled={loading}
                      className="w-full"
                    >
                      Start Free Trial
                    </Button>
                    <p className="text-xs text-gray-500 text-center">Create an account</p>
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? (isCreating ? "Creating account..." : "Signing in...") : (isCreating ? "Create account" : "Log in")}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Chasing invoices wastes time */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 text-center">
          Chasing invoices wastes time and kills cash flow
        </h2>
        <ul className="mt-6 space-y-3 max-w-xl mx-auto">
          {painPoints.map((text, i) => (
            <li key={i} className="flex items-center gap-3 text-gray-700">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>

      {/* Section: How it works */}
      <div className="bg-white border-t border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 text-center mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {howItWorks.map(({ step, title, description }) => (
              <div key={step} className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-semibold text-lg">
                  {step}
                </div>
                <h3 className="mt-3 font-semibold text-gray-900">{title}</h3>
                <p className="mt-1 text-sm text-gray-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
