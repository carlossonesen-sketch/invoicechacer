"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, firebaseUnavailable } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { isValidEmail } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const emailValue = String(fd.get("email") ?? "").trim();

    if (firebaseUnavailable || !auth) {
      setError("Firebase configuration is missing. Please check your environment variables.");
      return;
    }

    if (!emailValue) {
      setError("Email is required");
      return;
    }

    if (!isValidEmail(emailValue)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    const devLog = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
    try {
      await sendPasswordResetEmail(auth, emailValue);
      if (devLog) console.log("[AUTH DEV] sendPasswordResetEmail resolved");
      setSubmitted(true);
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
      if (devLog) console.log("[AUTH DEV] sendPasswordResetEmail error", { code });
      if (code === "auth/user-not-found") {
        setSubmitted(true);
        return;
      }
      if (code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
        return;
      }
      if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
        return;
      }
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h1>
          <p className="text-sm text-gray-600 mb-6">
            Check your email for a reset link. If you don&apos;t see it, check spam or try again.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Forgot password?</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Email" htmlFor="email" required error={error}>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              disabled={loading}
              error={!!error}
              autoFocus
            />
          </FormField>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        <p className="mt-6 text-center">
          <Link
            href="/login"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
