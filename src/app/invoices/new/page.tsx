"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createInvoice } from "@/lib/invoices";
import { dateInputToTimestamp } from "@/lib/dates";
import { AutoChaseDays } from "@/domain/types";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { isValidEmail, isValidUrl } from "@/lib/utils";
import { useEntitlements } from "@/hooks/useEntitlements";
import { User } from "firebase/auth";

export default function NewInvoicePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isPro } = useEntitlements();
  
  // Dev logging: Track page mount
  useEffect(() => {
    const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
    if (devToolsEnabled) {
      console.log(`[NewInvoice] Page mounted, pathname: ${pathname}`);
    }
  }, [pathname]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    customerName: string;
    customerEmail: string;
    amount: string;
    dueDate: string;
    notes: string;
    paymentLink: string;
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
    status: "pending",
    autoChaseEnabled: false,
    autoChaseDays: 3,
    maxChases: 3,
  });

  useEffect(() => {
    if (!auth) {
      const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
      if (devToolsEnabled) {
        console.log(`[NewInvoice] No auth, redirecting to /login from: ${typeof window !== "undefined" ? window.location.pathname : "server"}`);
      }
      router.push("/login");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
        if (devToolsEnabled) {
          console.log(`[NewInvoice] No user, redirecting to /login from: ${typeof window !== "undefined" ? window.location.pathname : "server"}`);
        }
        router.push("/login");
        return;
      }
      const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
      if (devToolsEnabled) {
        console.log(`[NewInvoice] Auth state changed, user: ${currentUser.email}, pathname: ${typeof window !== "undefined" ? window.location.pathname : "server"}`);
      }
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, [router]);

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
      
      const invoiceId = await createInvoice(user, {
        customerName: formData.customerName.trim(),
        customerEmail: formData.customerEmail.trim(),
        amount: amountCents,
        dueAt: dueTimestamp.toDate().toISOString(),
        status: formData.status,
        notes: formData.notes.trim() || undefined,
        paymentLink: formData.paymentLink.trim() || undefined,
        autoChaseEnabled: formData.autoChaseEnabled && isPro,
        autoChaseDays: formData.autoChaseDays,
        maxChases: formData.maxChases,
      });

      // Store invoice ID and reset form for "Add another" flow
      setCreatedInvoiceId(invoiceId);
      setSuccessMessage("Invoice created");
      
      // Reset form to allow adding another invoice
      setFormData({
        customerName: "",
        customerEmail: "",
        amount: "",
        dueDate: "",
        notes: "",
        paymentLink: "",
        status: "pending",
        autoChaseEnabled: false,
        autoChaseDays: 3,
        maxChases: 3,
      });
      setLoading(false);
    } catch (error: any) {
      console.error("Failed to create invoice:", error);
      setErrors({ 
        submit: error.message || "Failed to create invoice. Please try again." 
      });
      setLoading(false);
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
                  onClick={() => setShowUpgradeModal(true)}
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

          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-green-800 font-medium">{successMessage}</p>
                {createdInvoiceId && (
                  <div className="flex gap-2 ml-4">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        router.push(`/invoices/${createdInvoiceId}`);
                      }}
                    >
                      View Invoice
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSuccessMessage("");
                        setCreatedInvoiceId(null);
                      }}
                    >
                      Add Another
                    </Button>
                  </div>
                )}
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
          message="Auto-chase is a Pro feature. Upgrade now to automatically send reminder emails to your customers."
        />
      </div>
    </AppLayout>
  );
}
