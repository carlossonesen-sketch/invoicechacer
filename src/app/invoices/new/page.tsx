"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, firebaseUnavailable } from "@/lib/firebase";
import { createInvoice } from "@/lib/invoices";
import { dateInputToTimestamp, toJsDate } from "@/lib/dates";
import { AutoChaseDays } from "@/domain/types";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { useToast } from "@/components/ui/toast";
import { isValidEmail, isValidUrl } from "@/lib/utils";
import { useEntitlements } from "@/hooks/useEntitlements";
import { User } from "firebase/auth";

export default function NewInvoicePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isPro } = useEntitlements();
  const { showToast, ToastComponent } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalMessage, setUpgradeModalMessage] = useState<string | undefined>(undefined);
  const [user, setUser] = useState<User | null>(null);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const didRedirectRef = useRef<boolean>(false);

  const [formData, setFormData] = useState<{
    customerName: string;
    customerEmail: string;
    amount: string;
    dueDate: string;
    notes: string;
    paymentLink: string;
    invoiceNumber: string;
    status: "pending" | "overdue" | "paid";
    autoChaseEnabled: boolean;
    autoChaseDays: AutoChaseDays;
    maxChases: number;
  }>({
    customerName: "",
    customerEmail: "",
    amount: "",
    dueDate: "",
    notes: "",
    paymentLink: "",
    invoiceNumber: "",
    status: "pending",
    autoChaseEnabled: false,
    autoChaseDays: 3,
    maxChases: 3,
  });

  useEffect(() => {
    // Check Firebase availability first
    if (firebaseUnavailable || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        // Only redirect once
        if (!didRedirectRef.current) {
          didRedirectRef.current = true;
          const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
          if (devToolsEnabled) {
            console.log("[NAV DEBUG] router.push('/login')", { currentPathname: pathname, targetPathname: "/login", condition: "No authenticated user (new invoice page)" });
          }
          router.push("/login");
        }
        return;
      }
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, [router, pathname]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!formData.customerName.trim()) {
      newErrors.customerName = "Customer name is required";
    }

    if (!formData.customerEmail.trim()) {
      newErrors.customerEmail = "Customer email is required";
    } else if (!isValidEmail(formData.customerEmail)) {
      newErrors.customerEmail = "Invalid email address";
    }

    const amount = parseFloat(formData.amount);
    if (!formData.amount || isNaN(amount) || amount <= 0) {
      newErrors.amount = "Amount must be greater than 0";
    }

    if (!formData.dueDate) {
      newErrors.dueDate = "Due date is required";
    }

    if (formData.paymentLink && !isValidUrl(formData.paymentLink)) {
      newErrors.paymentLink = "Payment link must be a valid HTTP/HTTPS URL";
    }

    if (formData.autoChaseEnabled && !isPro) {
      setUpgradeModalMessage(undefined);
      setShowUpgradeModal(true);
      return false;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    if (!user) {
      setErrors({ submit: "You must be logged in to create an invoice." });
      return;
    }

    setLoading(true);
    setErrors({});
    setSuccessMessage("");
    
    try {
      const amountCents = Math.round(parseFloat(formData.amount) * 100);
      const dueTimestamp = dateInputToTimestamp(formData.dueDate);
      if (!dueTimestamp) {
        setErrors({ dueDate: "Due date is required" });
        setLoading(false);
        return;
      }
      
      const dueDate = toJsDate(dueTimestamp);
      if (!dueDate) {
        setErrors({ dueDate: "Invalid due date" });
        setLoading(false);
        return;
      }
      
      const invoiceId = await createInvoice(user, {
        customerName: formData.customerName.trim(),
        customerEmail: formData.customerEmail.trim(),
        amount: amountCents,
        dueAt: dueDate.toISOString(),
        status: formData.status,
        notes: formData.notes.trim() || undefined,
        paymentLink: formData.paymentLink.trim() || undefined,
        invoiceNumber: formData.invoiceNumber.trim() || undefined,
        autoChaseEnabled: formData.autoChaseEnabled && isPro,
        autoChaseDays: formData.autoChaseDays,
        maxChases: formData.maxChases,
      });

      setCreatedInvoiceId(invoiceId);
      setEmailSent(false);
      setSendError(null);
      setSuccessMessage("Invoice created! Send it to your customer to get paid faster.");

      // Reset form to allow adding another invoice
      setFormData({
        customerName: "",
        customerEmail: "",
        amount: "",
        dueDate: "",
        notes: "",
        paymentLink: "",
        invoiceNumber: "",
        status: "pending",
        autoChaseEnabled: false,
        autoChaseDays: 3,
        maxChases: 3,
      });
      setLoading(false);
    } catch (error: unknown) {
      console.error("Failed to create invoice:", error);
      const err = error as { message?: string; code?: string; status?: number };
      const errorMessage = err?.message || "Failed to create invoice. Please try again.";
      const code = err?.code;
      const status = err?.status;
      setLoading(false);

      if (status === 401) {
        router.replace("/login?redirect=" + encodeURIComponent("/invoices/new"));
        return;
      }
      if (status === 429) {
        setErrors({ submit: "Too many requests. Please try again later." });
        return;
      }
      if (status === 403 && typeof code === "string") {
        if (code === "TRIAL_EXPIRED") {
          const redirectTo = (error as { redirectTo?: string }).redirectTo || "/pricing?reason=trial_expired";
          router.push(redirectTo);
          return;
        }
        if (code.startsWith("TRIAL_")) {
          setUpgradeModalMessage("You've reached the trial limit for pending invoices. Upgrade to create more.");
          setShowUpgradeModal(true);
        }
      }
      setErrors({ submit: errorMessage });
    }
  }

  async function handleSendInvoiceNow() {
    if (!createdInvoiceId || !user) return;
    setSendingEmail(true);
    setSendError(null);
    try {
      const idToken = await user.getIdToken();
      if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
        console.log("create-send -> send-initial-email", { invoiceId: createdInvoiceId });
      }
      const res = await fetch("/api/invoices/send-initial-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ invoiceId: createdInvoiceId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        message?: string;
        alreadySent?: boolean;
        redirectTo?: string;
      };
      if (!res.ok) {
        if (res.status === 503 && data.error === "EMAIL_SENDING_DISABLED") {
          const msg = data.message || "Email sending is temporarily disabled. Please try again later.";
          setSendError(msg);
          showToast(msg, "error");
          return;
        }
        if (res.status === 400 && data.alreadySent) {
          showToast("Email already sent", "info");
          setEmailSent(true);
          setSendError(null);
          return;
        }
        const msg = [data.message, data.error, data.code].filter(Boolean).join(" — ") || "Failed to send email.";
        setSendError(msg);
        showToast(msg, "error");
        if (res.status === 401) {
          router.replace("/login?redirect=" + encodeURIComponent("/invoices/new"));
          return;
        }
        if (res.status === 403 && data.error === "TRIAL_EXPIRED" && data.redirectTo) {
          router.push(data.redirectTo);
          return;
        }
        if (res.status === 403 && data.error && data.error.startsWith("TRIAL_")) {
          setUpgradeModalMessage(data.message ?? "You've reached the trial limit for emails. Upgrade to send more.");
          setShowUpgradeModal(true);
        }
        return;
      }
      showToast("Email sent successfully", "success");
      setEmailSent(true);
      setSendError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send email. Please try again.";
      setSendError(msg);
      showToast(msg, "error");
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <AppLayout>
      <Header title="Create Invoice" />
      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">Invoice Details</h3>

            <FormField label="Customer Name" htmlFor="customerName" required error={errors.customerName}>
              <Input
                id="customerName"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                error={!!errors.customerName}
              />
            </FormField>

            <FormField label="Customer Email" htmlFor="customerEmail" required error={errors.customerEmail}>
              <Input
                id="customerEmail"
                type="email"
                value={formData.customerEmail}
                onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                error={!!errors.customerEmail}
              />
            </FormField>

            <FormField label="Invoice Number (optional)" htmlFor="invoiceNumber">
              <Input
                id="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Amount (USD)" htmlFor="amount" required error={errors.amount}>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  error={!!errors.amount}
                />
              </FormField>

              <FormField label="Due Date" htmlFor="dueDate" required error={errors.dueDate}>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  error={!!errors.dueDate}
                />
              </FormField>
            </div>

            <FormField label="Status" htmlFor="status">
              <Select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as "pending" | "overdue" | "paid" })}
              >
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
              </Select>
            </FormField>

            <FormField label="Payment Link (optional)" htmlFor="paymentLink" error={errors.paymentLink}>
              <Input
                id="paymentLink"
                type="url"
                placeholder="https://..."
                value={formData.paymentLink}
                onChange={(e) => setFormData({ ...formData, paymentLink: e.target.value })}
                error={!!errors.paymentLink}
              />
            </FormField>

            <FormField label="Notes (optional)" htmlFor="notes">
              <Textarea
                id="notes"
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </FormField>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">Auto-Chase Settings</h3>
            {!isPro && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <p className="text-sm text-yellow-800">
                  Auto-chase is available on the Pro plan. Enable Pro in Settings to use this feature.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="autoChaseEnabled"
                  checked={formData.autoChaseEnabled && isPro}
                  disabled={!isPro}
                  onChange={(e) => {
                    if (e.target.checked && !isPro) {
                      setShowUpgradeModal(true);
                      return;
                    }
                    setFormData({ ...formData, autoChaseEnabled: e.target.checked });
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="autoChaseEnabled" className="ml-2 block text-sm text-gray-900">
                  Enable auto-chase {!isPro && "(Pro)"}
                </label>
              </div>
              {!isPro && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setUpgradeModalMessage(undefined);
                    setShowUpgradeModal(true);
                  }}
                >
                  Upgrade
                </Button>
              )}
            </div>

            {formData.autoChaseEnabled && isPro && (
              <>
                <FormField label="Chase Cadence (days)" htmlFor="autoChaseDays">
                  <Select
                    id="autoChaseDays"
                    value={formData.autoChaseDays}
                    onChange={(e) => setFormData({ ...formData, autoChaseDays: parseInt(e.target.value) as AutoChaseDays })}
                  >
                    <option value="3">3 days</option>
                    <option value="5">5 days</option>
                    <option value="7">7 days</option>
                  </Select>
                </FormField>

                <FormField label="Max Chases" htmlFor="maxChases">
                  <Input
                    id="maxChases"
                    type="number"
                    min="1"
                    value={formData.maxChases}
                    onChange={(e) => setFormData({ ...formData, maxChases: parseInt(e.target.value) || 3 })}
                  />
                </FormField>
              </>
            )}
          </div>

          {successMessage && createdInvoiceId && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex flex-col gap-3">
                <p className="text-sm text-green-800 font-medium">{successMessage}</p>
                {sendError && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {sendError}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {!emailSent ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSendInvoiceNow}
                      disabled={sendingEmail}
                    >
                      {sendingEmail ? "Sending…" : "Send invoice email now"}
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-100 text-green-800 text-sm font-medium border border-green-200">
                      <span aria-hidden>✅</span>
                      Email sent
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/invoices/${createdInvoiceId}`)}
                  >
                    View invoice
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSuccessMessage("");
                      setCreatedInvoiceId(null);
                      setEmailSent(false);
                      setSendError(null);
                      if (pathname !== "/invoices/new") {
                        router.replace("/invoices/new");
                        router.refresh();
                      } else {
                        router.refresh();
                      }
                    }}
                  >
                    Add another
                  </Button>
                </div>
              </div>
            </div>
          )}

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{errors.submit}</p>
            </div>
          )}

          <div className="flex gap-4">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Invoice"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </form>

        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          message={upgradeModalMessage ?? "Auto-chase is a Pro feature. Upgrade now to automatically send reminder emails to your customers."}
        />
      </div>
      {ToastComponent}
    </AppLayout>
  );
}
