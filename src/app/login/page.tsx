"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { isValidEmail } from "@/lib/utils";
import { getBusinessProfile } from "@/lib/businessProfile";

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!auth) {
      setError("Firebase not initialized. Please check your environment variables.");
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!auth) {
      setError("Firebase not initialized. Please check your environment variables.");
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

      // PATHNAME GUARD: Only redirect to dashboard if we're on the login page
      if (pathname !== "/login") {
        const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
        if (devToolsEnabled) {
          console.warn(`[Login] BLOCKED redirect to /dashboard - pathname is ${pathname}, not /login`);
          console.trace("Redirect blocked");
        }
        return;
      }

      // Get redirect target from URL params (set by middleware)
      const redirectPath = searchParams.get("redirect") || "/dashboard";
      
      // Check if user has completed company profile onboarding
      try {
        const profile = await getBusinessProfile(userCredential.user.uid);
        if (!profile) {
          // Redirect to onboarding if profile is missing
          // Only if coming from login flow, otherwise respect redirect param
          const shouldForceOnboarding = redirectPath === "/dashboard" || !redirectPath;
          if (shouldForceOnboarding) {
            const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
            if (devToolsEnabled) {
              console.log("[Login] Redirecting to onboarding (no profile found)");
              console.trace("Login -> Onboarding redirect");
            }
            router.push("/onboarding/company");
          } else {
            // User was trying to access a specific page, let them go there
            // They'll be prompted for onboarding later if needed
            const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
            if (devToolsEnabled) {
              console.log(`[Login] Redirecting to requested path: ${redirectPath}`);
              console.trace("Login -> Requested path redirect");
            }
            router.push(redirectPath);
          }
        } else {
          // Profile exists, redirect to requested path or dashboard
          const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
          if (devToolsEnabled) {
            console.log(`[Login] Redirecting to: ${redirectPath}`);
            console.trace("Login -> Post-login redirect");
          }
          if (redirectPath === "/dashboard") {
            const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
            if (devToolsEnabled) {
              console.log(`[Login] Redirecting to /dashboard from pathname: ${pathname}`);
              console.trace("Login -> Dashboard redirect");
            }
          }
          router.push(redirectPath);
        }
      } catch (profileError) {
        // If profile check fails, redirect to requested path or dashboard
        console.error("Failed to check business profile:", profileError);
        const redirectPath = searchParams.get("redirect") || "/dashboard";
        const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
        if (devToolsEnabled) {
          console.log(`[Login] Profile check failed, redirecting to: ${redirectPath}`);
          if (redirectPath === "/dashboard") {
            console.log(`[Login] Redirecting to /dashboard from pathname: ${pathname}`);
            console.trace("Login -> Dashboard redirect (profile error)");
          }
        }
        router.push(redirectPath);
      }
      router.refresh();
    } catch (err: any) {
      console.error("Auth error:", err);
      if (err.code === "auth/user-not-found") {
        setError("No account found with this email. Toggle 'Create account' to sign up.");
      } else if (err.code === "auth/wrong-password") {
        setError("Incorrect password");
      } else if (err.code === "auth/email-already-in-use") {
        setError("Email already in use. Sign in instead.");
        setIsCreating(false);
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak");
      } else {
        setError(err.message || "Failed to authenticate. Please try again.");
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
          <p className="text-sm text-gray-500 mb-6">Sign in to your account</p>

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

            <div className="flex items-center">
              <input
                type="checkbox"
                id="createAccount"
                checked={isCreating}
                onChange={(e) => {
                  setIsCreating(e.target.checked);
                  setError("");
                }}
                disabled={loading}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="createAccount" className="ml-2 block text-sm text-gray-700">
                Create account
              </label>
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
