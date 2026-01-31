"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  User,
} from "firebase/auth";
import { auth, firebaseUnavailable } from "@/lib/firebase";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";

const MIN_PASSWORD_LENGTH = 8;

export default function SettingsAccountPage() {
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
      router.replace("/login?redirect=" + encodeURIComponent("/settings/account"));
      return;
    }
  }, [loading, user, router]);

  useEffect(() => {
    redirectIfUnauthenticated();
  }, [redirectIfUnauthenticated]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (firebaseUnavailable || !auth || !user) {
      setError("You must be signed in to change your password.");
      return;
    }

    if (!user.email) {
      setError("Your account has no email. Change password is not available.");
      return;
    }

    if (!currentPassword.trim()) {
      setError("Current password is required.");
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSubmitLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword.trim());
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      showToast("Password updated successfully.", "success");
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
      const message = err instanceof Error ? err.message : String(err);
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Current password is incorrect.");
      } else if (code === "auth/weak-password") {
        setError("New password is too weak. Use at least 8 characters.");
      } else if (code === "auth/requires-recent-login") {
        setError("For security, please sign out and sign in again, then try changing your password.");
        showToast("Please sign in again to change your password.", "error");
      } else {
        setError(message || "Failed to update password. Please try again.");
      }
    } finally {
      setSubmitLoading(false);
    }
  }

  if (loading || !user) {
    return (
      <AppLayout>
        <Header title="Account" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Account" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-md space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Change password</h3>
            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">Your password has been updated.</p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Current password" htmlFor="current-password" required>
                <Input
                  id="current-password"
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setError(""); }}
                  disabled={submitLoading}
                  error={!!error}
                  autoComplete="current-password"
                />
              </FormField>
              <FormField label="New password" htmlFor="new-password" required>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                  disabled={submitLoading}
                  error={!!error}
                  autoComplete="new-password"
                />
              </FormField>
              <FormField label="Confirm new password" htmlFor="confirm-new-password" required>
                <Input
                  id="confirm-new-password"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmNewPassword}
                  onChange={(e) => { setConfirmNewPassword(e.target.value); setError(""); }}
                  disabled={submitLoading}
                  error={!!error}
                  autoComplete="new-password"
                />
              </FormField>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push("/settings")}
                  disabled={submitLoading}
                >
                  Back to Settings
                </Button>
                <Button type="submit" disabled={submitLoading}>
                  {submitLoading ? "Updating…" : "Update password"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
      {ToastComponent}
    </AppLayout>
  );
}
