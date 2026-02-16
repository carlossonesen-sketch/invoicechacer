"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useToast } from "@/components/ui/toast";

export default function SettingsPage() {
  const router = useRouter();
  const { isPro, loading } = useEntitlements();
  const { showToast, ToastComponent } = useToast();
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSubscriptionStatus(null);
        return;
      }
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/business-profile", { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json().catch(() => ({}))) as { subscriptionStatus?: string | null };
        setSubscriptionStatus(data.subscriptionStatus ?? null);
      } catch {
        setSubscriptionStatus(null);
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <Header title="Settings" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Settings" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Plan Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Plan</h3>
              <Button onClick={() => router.push("/settings/billing")}>
                {isPro ? "Manage Billing" : "Upgrade to Pro"}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {isPro ? "Pro Plan" : "Free Plan"}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {isPro
                    ? "Full access to all features including auto-chase"
                    : "Limited features. Upgrade to Pro for auto-chase."}
                </div>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isPro
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : "bg-gray-100 text-gray-800 border border-gray-200"
                }`}
              >
                {isPro ? "Pro" : "Free"}
              </div>
            </div>
          </div>

          {/* Account / Security */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Account</h3>
            <p className="text-sm text-gray-500 mb-4">
              Change your password. You will need to enter your current password.
            </p>
            <Button variant="secondary" onClick={() => router.push("/settings/account")}>
              Change password
            </Button>
          </div>

          {/* Billing Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Billing</h3>
            <p className="text-sm text-gray-500 mb-4">
              Manage your subscription, view invoices, and update payment methods.
            </p>
            <Button onClick={() => router.push("/settings/billing")}>
              Go to Billing
            </Button>
            {subscriptionStatus === "active" && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Button
                  variant="secondary"
                  className="text-amber-700 border-amber-200 hover:bg-amber-50"
                  onClick={() => setShowCancelModal(true)}
                >
                  Cancel subscription
                </Button>
              </div>
            )}
          </div>

          {/* Danger zone: Delete account */}
          <div className="bg-white rounded-lg border border-red-200 p-6">
            <h3 className="text-lg font-semibold text-red-900 mb-2">Delete account</h3>
            <p className="text-sm text-gray-600 mb-4">
              Permanently delete your account and all data. This cannot be undone.
            </p>
            <Button
              variant="secondary"
              className="text-red-700 border-red-200 hover:bg-red-50"
              onClick={() => setShowDeleteModal(true)}
            >
              Delete account
            </Button>
          </div>
        </div>
      </div>
      {ToastComponent}

      {/* Cancel subscription modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={() => !cancelLoading && setShowCancelModal(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel subscription</h3>
              <p className="text-sm text-gray-600 mb-4">
                Your subscription will end at the end of the current billing period. You can keep using the app until then.
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowCancelModal(false)} disabled={cancelLoading}>
                  Keep subscription
                </Button>
                <Button
                  className="text-amber-700 border-amber-200 hover:bg-amber-50"
                  disabled={cancelLoading}
                  onClick={async () => {
                    setCancelLoading(true);
                    try {
                      const token = await auth?.currentUser?.getIdToken();
                      if (!token) {
                        showToast("Please sign in again", "error");
                        return;
                      }
                      const res = await fetch("/api/stripe/cancel-subscription", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: "{}",
                      });
                      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
                      if (!res.ok) {
                        showToast(data.message || data.error || "Failed to cancel", "error");
                        return;
                      }
                      showToast("Subscription will cancel at the end of the billing period.", "success");
                      setSubscriptionStatus(null);
                      setShowCancelModal(false);
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : "Failed to cancel subscription", "error");
                    } finally {
                      setCancelLoading(false);
                    }
                  }}
                >
                  {cancelLoading ? "Canceling…" : "Cancel at period end"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete account modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={() => !deleteLoading && setShowDeleteModal(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-red-900 mb-2">Delete account</h3>
              <p className="text-sm text-gray-600 mb-4">
                This will permanently delete your account, invoices, and all data. Type <strong>DELETE</strong> to confirm.
              </p>
              <Input
                placeholder="Type DELETE"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                disabled={deleteLoading}
                className="mb-4 font-mono"
                error={deleteConfirm.length > 0 && deleteConfirm !== "DELETE"}
              />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }} disabled={deleteLoading}>
                  Cancel
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={deleteLoading || deleteConfirm !== "DELETE"}
                  onClick={async () => {
                    setDeleteLoading(true);
                    try {
                      const token = await auth?.currentUser?.getIdToken();
                      if (!token) {
                        showToast("Please sign in again", "error");
                        return;
                      }
                      const res = await fetch("/api/account/delete", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ confirm: "DELETE" }),
                      });
                      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
                      if (!res.ok) {
                        showToast(data.message || data.error || "Failed to delete account", "error");
                        setDeleteLoading(false);
                        return;
                      }
                      await signOut(auth!);
                      await fetch("/api/auth/logout", { method: "POST" });
                      router.replace("/login");
                      router.refresh();
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : "Failed to delete account", "error");
                      setDeleteLoading(false);
                    }
                  }}
                >
                  {deleteLoading ? "Deleting…" : "Delete my account"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
