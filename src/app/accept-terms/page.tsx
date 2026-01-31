"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, firebaseUnavailable } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

export default function AcceptTermsPage() {
  const router = useRouter();
  const [user, setUser] = useState(auth?.currentUser ?? null);
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const redirectIfUnauthenticated = useCallback(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?redirect=" + encodeURIComponent("/accept-terms"));
    }
  }, [loading, user, router]);

  useEffect(() => {
    redirectIfUnauthenticated();
  }, [redirectIfUnauthenticated]);

  async function handleContinue() {
    if (!agreed || !user) return;

    if (firebaseUnavailable) {
      setError("Service unavailable. Please try again later.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/auth/accept-terms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string };
      if (!res.ok) {
        setError(data.message || data.error || "Failed to save. Please try again.");
        setSubmitting(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Accept Terms to Continue</h1>
        <p className="text-sm text-gray-600 mb-6">
          Please read and accept our Terms of Service and Privacy Policy to use Invoice Chaser.
        </p>

        <label className="flex items-start gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={submitting}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            I agree to the{" "}
            <Link href="/terms" className="text-blue-600 hover:text-blue-800 font-medium" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-blue-600 hover:text-blue-800 font-medium" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <Button
          onClick={handleContinue}
          disabled={!agreed || submitting}
          className="w-full"
        >
          {submitting ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
