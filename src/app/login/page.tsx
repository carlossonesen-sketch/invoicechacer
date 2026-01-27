"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, firebaseUnavailable } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { isValidEmail } from "@/lib/utils";

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
        // Create new account
        userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        // Sign in existing user
        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      }

      // Get ID token and send to session endpoint
      const idToken = await userCredential.user.getIdToken();
      
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session");
      }

      // Check if user has completed company profile onboarding via server API (no client Firestore)
      if (pathname === "/login") {
        const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
        try {
          const profileRes = await fetch("/api/business-profile", {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          const profileData = (await profileRes.json().catch(() => ({}))) as { exists?: boolean; error?: string; message?: string };
          if (!profileRes.ok) {
            console.error("Failed to check business profile:", profileRes.status, profileData.message ?? profileData.error);
            if (devToolsEnabled) {
              console.log("[redirect->dashboard]", { pathname, reason: "Profile API error, defaulting to dashboard" });
            }
            router.replace("/dashboard");
            router.refresh();
            return;
          }
          if (!profileData.exists) {
            if (devToolsEnabled) {
              console.log("[redirect->onboarding]", { pathname, reason: "No profile, redirecting to onboarding" });
            }
            router.replace("/onboarding/company");
          } else {
            if (devToolsEnabled) {
              console.log("[redirect->dashboard]", { pathname, reason: "Post-login redirect, profile exists" });
            }
            router.replace("/dashboard");
          }
        } catch (profileError) {
          console.error("Failed to check business profile:", profileError);
          if (devToolsEnabled) {
            console.log("[redirect->dashboard]", { pathname, reason: "Profile check failed, defaulting to dashboard" });
          }
          router.replace("/dashboard");
        }
        router.refresh();
      }
    } catch (err: unknown) {
      console.error("Auth error:", err);
      const errorCode = err && typeof err === "object" && "code" in err ? String(err.code) : undefined;
      if (errorCode === "auth/user-not-found") {
        setError("No account found with this email. Toggle 'Create account' to sign up.");
      } else if (errorCode === "auth/wrong-password") {
        setError("Incorrect password");
      } else if (errorCode === "auth/email-already-in-use") {
        setError("Email already in use. Sign in instead.");
        setIsCreating(false);
      } else if (errorCode === "auth/weak-password") {
        setError("Password is too weak");
      } else {
        const errorMessage = err instanceof Error ? err.message : "Failed to authenticate. Please try again.";
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Invoice Chaser</h1>
          <p className="text-sm text-gray-500 mb-1">Sign in to your account</p>
          <p className="text-xs text-gray-400 mb-6">Get paid faster with gentle, automatic invoice reminders.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Email" htmlFor="email" required error={error}>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
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
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                disabled={loading}
                error={!!error}
              />
            </FormField>

            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
              <button
                type="button"
                onClick={() => { setIsCreating(!isCreating); setError(""); }}
                disabled={loading}
                className="text-sm text-gray-700 hover:text-gray-900"
              >
                {isCreating ? "Already have an account? Sign in instead." : "Don't have an account? Create one."}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (isCreating ? "Creating account..." : "Signing in...") : (isCreating ? "Create Account" : "Sign In")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
