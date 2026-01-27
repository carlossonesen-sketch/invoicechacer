"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useParams, useSearchParams, usePathname } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, firebaseUnavailable } from "@/lib/firebase";
import { subscribeToInvoice, subscribeToChaseEvents, updateInvoice, triggerChaseNow, FirestoreInvoice, ChaseEvent } from "@/lib/invoices";
import { dateInputToTimestamp, timestampToDateInput, toJsDate } from "@/lib/dates";
import { AutoChaseDays } from "@/domain/types";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Currency } from "@/components/ui/currency";
import { DateLabel } from "@/components/ui/date-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import { MarkPaidButton } from "@/app/invoices/[invoiceId]/MarkPaidButton";
import { isValidEmail } from "@/lib/utils";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useToast } from "@/components/ui/toast";

export default function InvoiceDetailPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const invoiceId = params.invoiceId as string;

  // Check if edit mode is requested via query parameter
  const shouldStartEditing = searchParams.get("edit") === "1";

  const [invoice, setInvoice] = useState<FirestoreInvoice | null>(null);
  const [chaseEvents, setChaseEvents] = useState<ChaseEvent[]>([]);
  const [chaseEventsError, setChaseEventsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [isEditing, setIsEditing] = useState(shouldStartEditing);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalMessage, setUpgradeModalMessage] = useState<string | undefined>(undefined);
  const { isPro } = useEntitlements();
  const [user, setUser] = useState<User | null>(null);
  const [isDev, setIsDev] = useState(false);
  const [realtimePaused, setRealtimePaused] = useState(false);
  const didRedirectRef = useRef<boolean>(false);
  const mountedRef = useRef(true);
  const invoiceDetailSubsRef = useRef<{ invoice: () => void; chase: () => void } | null>(null);
  const { showToast, ToastComponent } = useToast();

  const [formData, setFormData] = useState<{
    customerName: string;
    customerEmail: string;
    amount: string;
    dueDate: string;
    status: "pending" | "overdue" | "paid";
    autoChaseEnabled: boolean;
    autoChaseDays: AutoChaseDays;
    maxChases: number;
  }>({
    customerName: "",
    customerEmail: "",
    amount: "",
    dueDate: "",
    status: "pending",
    autoChaseEnabled: false,
    autoChaseDays: 3,
    maxChases: 3,
  });

  useEffect(() => {
    if (firebaseUnavailable || !auth) {
      setLoading(false);
      return;
    }
    mountedRef.current = true;

    const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1" || process.env.NODE_ENV !== "production";
    setIsDev(devToolsEnabled);

    const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        if (!didRedirectRef.current) {
          didRedirectRef.current = true;
          if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
            console.log("[NAV DEBUG] router.push('/login')", { currentPathname: pathname, targetPathname: "/login", condition: "No authenticated user (invoice detail page)" });
          }
          router.push("/login");
        }
        return;
      }
      const prev = invoiceDetailSubsRef.current;
      invoiceDetailSubsRef.current = null;
      if (prev) {
        prev.invoice();
        prev.chase();
      }
      setUser(currentUser);
      setLoading(true);
      setError(null);
      setRealtimePaused(false);
      let chaseUnsub: (() => void) | null = null;
      let invoiceUnsub: (() => void) | null = null;

      const applyInvoice = (inv: FirestoreInvoice) => {
        const dueDate = inv.dueAt ? timestampToDateInput(inv.dueAt) : "";
        setFormData({
          customerName: inv.customerName || "",
          customerEmail: inv.customerEmail || "",
          amount: ((inv.amount || 0) / 100).toFixed(2),
          dueDate,
          status: inv.status,
          autoChaseEnabled: inv.autoChaseEnabled || false,
          autoChaseDays: (inv.autoChaseDays as AutoChaseDays) || 3,
          maxChases: inv.maxChases || 3,
        });
        if (shouldStartEditing) setIsEditing(true);
      };

      (async () => {
        try {
          const idToken = await currentUser.getIdToken();
          const res = await fetch(`/api/invoices/${invoiceId}`, { headers: { Authorization: `Bearer ${idToken}` } });
          const data = (await res.json().catch(() => ({}))) as { invoice?: FirestoreInvoice; error?: string; message?: string };
          if (!mountedRef.current) return;
          if (!res.ok) {
            if (res.status === 401) {
              router.replace("/login?redirect=" + encodeURIComponent("/invoices/" + invoiceId));
              return;
            }
            if (res.status === 404) {
              setError("Invoice not found.");
              setInvoice(null);
              setLoading(false);
              return;
            }
            setError(data.message || data.error || "Failed to load invoice.");
            setInvoice(null);
            setLoading(false);
            return;
          }
          const inv = data.invoice;
          if (!inv) {
            setError("Invalid response.");
            setLoading(false);
            return;
          }
          setInvoice(inv);
          applyInvoice(inv);
          setLoading(false);
        } catch (e) {
          if (!mountedRef.current) return;
          setError(e instanceof Error ? e.message : "Failed to load invoice.");
          setInvoice(null);
          setLoading(false);
          return;
        }
        if (!mountedRef.current) return;

        chaseUnsub = subscribeToChaseEvents(invoiceId, (events, evErr) => {
          if (evErr) {
            if (evErr.includes("permission") || evErr.includes("Permission")) {
              setChaseEventsError("Unable to load email history. You may not have permission to view this data.");
            } else {
              setChaseEventsError(null);
            }
            setChaseEvents([]);
            return;
          }
          setChaseEventsError(null);
          setChaseEvents(events);
        });

        invoiceUnsub = subscribeToInvoice(currentUser.uid, invoiceId, (invoiceData, subErr) => {
          if (subErr) {
            setRealtimePaused(true);
            return;
          }
          setRealtimePaused(false);
          if (invoiceData) {
            setInvoice(invoiceData);
            applyInvoice(invoiceData);
          }
        });
        if (invoiceUnsub && chaseUnsub) {
          invoiceDetailSubsRef.current = { invoice: invoiceUnsub, chase: chaseUnsub };
        }
      })();
    });

    return () => {
      mountedRef.current = false;
      authUnsubscribe();
      const subs = invoiceDetailSubsRef.current;
      invoiceDetailSubsRef.current = null;
      if (subs) {
        subs.invoice();
        subs.chase();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only depend on invoiceId to avoid re-subscribing
  }, [invoiceId]);

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
    if (!formData.amount || isNaN(amount) || amount < 0) {
      newErrors.amount = "Amount must be greater than or equal to 0";
    }

    if (!formData.dueDate) {
      newErrors.dueDate = "Due date is required";
    }

    if (formData.maxChases < 0) {
      newErrors.maxChases = "Max chases must be greater than or equal to 0";
    }

    if (formData.autoChaseEnabled && !isPro) {
      setUpgradeModalMessage(undefined);
      setShowUpgradeModal(true);
      return false;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !user || !validate()) return;

    setSaving(true);
    setSuccessMessage("");
    setErrors({});

    try {
      const amountCents = Math.round(parseFloat(formData.amount) * 100);
      
      const dueTimestamp = dateInputToTimestamp(formData.dueDate);
      if (!dueTimestamp) {
        setErrors({ dueDate: "Due date is required" });
        setSaving(false);
        return;
      }
      
      const dueDate = toJsDate(dueTimestamp);
      if (!dueDate) {
        setErrors({ dueDate: "Invalid due date" });
        setSaving(false);
        return;
      }
      
      await updateInvoice(user.uid, invoice.id, {
        customerName: formData.customerName.trim(),
        customerEmail: formData.customerEmail.trim(),
        amount: amountCents,
        dueAt: dueDate.toISOString(),
        status: formData.status,
        autoChaseEnabled: formData.autoChaseEnabled && isPro,
        autoChaseDays: formData.autoChaseDays,
        maxChases: formData.maxChases,
      });

      setSuccessMessage("Saved");
      setIsEditing(false);
      
      // Refresh to ensure UI updates (fallback if realtime doesn't update immediately)
      router.refresh();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error: unknown) {
      console.error("Failed to update invoice:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update invoice. Please try again.";
      setErrors({ submit: errorMessage });
    } finally {
      setSaving(false);
    }
  }


  async function handleTriggerChase() {
    if (!invoice || !user) return;

    setSaving(true);
    setSuccessMessage("");
    setErrors({});

    try {
      await triggerChaseNow(user.uid, invoice.id);
      setSuccessMessage("Chase triggered successfully! The cloud function will process it on its next run.");
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (error: unknown) {
      console.error("Failed to trigger chase:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to trigger chase. Please try again.";
      setErrors({ submit: errorMessage });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendInvoice() {
    if (!invoice || !user) return;

    if (!invoice.customerEmail) {
      showToast("Please add a customer email address first", "error");
      return;
    }

    setSendingEmail(true);
    setSuccessMessage("");
    setErrors({});

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/invoices/send-initial-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; alreadySent?: boolean };

      if (!response.ok) {
        if (data.alreadySent) {
          showToast("Initial invoice email was already sent", "info");
        } else if (response.status === 401) {
          router.replace("/login?redirect=" + encodeURIComponent("/invoices/" + invoice.id));
          showToast("Please log in again", "error");
        } else if (response.status === 429) {
          showToast("Too many requests. Please try again later.", "error");
          setErrors({ submit: "Too many requests. Please try again later." });
        } else if (response.status === 403) {
          if (data.error === "INVOICE_NOT_PENDING") {
            showToast(data.message || "This invoice can't be emailed because it's no longer pending.", "error");
            setErrors({ submit: data.message || "This invoice can't be emailed because it's no longer pending." });
          } else if (data.error && data.error.startsWith("TRIAL_")) {
            setUpgradeModalMessage("You've reached the trial limit for emails. Upgrade to send more.");
            setShowUpgradeModal(true);
            showToast(data.message || "You've reached a trial limit. Upgrade to send more emails.", "error");
            setErrors({ submit: data.message || "Trial limit reached." });
          } else {
            showToast(data.message || "Permission denied.", "error");
            setErrors({ submit: data.message || "Permission denied." });
          }
        } else {
          throw new Error(data.message || data.error || "Failed to send email");
        }
      } else {
        showToast("Invoice email sent successfully!", "success");
        setSuccessMessage("Invoice email sent");
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (error: unknown) {
      console.error("Failed to send invoice email:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to send email. Please try again.";
      showToast(errorMessage, "error");
      setErrors({ submit: errorMessage });
    } finally {
      setSendingEmail(false);
    }
  }

  // Memoize due date conversion to avoid recalculation
  // MUST be called before any conditional returns to maintain hooks order
  const dueDateForDisplay = useMemo(() => {
    if (!invoice?.dueAt) return new Date();
    const date = toJsDate(invoice.dueAt);
    return date || new Date();
  }, [invoice?.dueAt]);

  if (loading) {
    return (
      <AppLayout>
        <Header title="Invoice Details" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (error || !invoice) {
    const isPermissionError = error?.includes("Permission denied") || error?.includes("don't have access");
    return (
      <AppLayout>
        <Header title="Invoice Details" />
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl">
            <h3 className="text-lg font-semibold text-red-900 mb-2">
              {isPermissionError ? "Access Denied" : "Error Loading Invoice"}
            </h3>
            <p className="text-red-800 mb-4">
              {error || "You don't have access to this invoice (or it no longer exists)."}
            </p>
            <Button onClick={() => {
              const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
              if (pathname !== "/invoices") {
                if (devToolsEnabled) {
                  console.log("[NAV DEBUG] router.push('/invoices')", { currentPathname: pathname, targetPathname: "/invoices", condition: "Back to Invoices button click" });
                }
                router.push("/invoices");
              } else if (devToolsEnabled) {
                console.log("[NAV DEBUG] Skipped router.push('/invoices') - already on /invoices", { currentPathname: pathname });
              }
            }} variant="secondary">
              Back to Invoices
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Check if user owns this invoice
  if (user && invoice.userId && invoice.userId !== user.uid) {
    return (
      <AppLayout>
        <Header title="Invoice Details" />
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl">
            <h3 className="text-lg font-semibold text-red-900 mb-2">Access Denied</h3>
            <p className="text-red-800">You don&apos;t have permission to view this invoice.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Invoice Details" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl space-y-6">
          {realtimePaused && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
              Live updates paused. Displaying last loaded data. Reconnect or refresh to retry.
            </div>
          )}
          {/* Breadcrumb/Back Link */}
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span className="mr-1">←</span>
              Back to Dashboard
            </button>
          </div>

          {/* Summary Header */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <div className="text-sm text-gray-500 mb-2">Invoice #{invoice.id}</div>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-3xl font-bold text-gray-900">
                    <Currency cents={invoice.amount || 0} />
                  </h2>
                  <StatusBadge status={invoice.status} />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Customer</div>
                    <div className="text-lg font-semibold text-gray-900">{invoice.customerName}</div>
                    <div className="text-sm text-gray-600">{invoice.customerEmail}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Due Date</div>
                    <div className="text-lg font-semibold text-gray-900">
                      <DateLabel date={dueDateForDisplay} />
                    </div>
                    {(invoice.status === "paid" || invoice.paidAt) && (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Paid on</div>
                        <div className="text-sm font-semibold text-green-600">
                          <DateLabel 
                            date={invoice.paidAt ? (toJsDate(invoice.paidAt) || new Date()) : new Date()} 
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 ml-4">
                {!isEditing && invoice.status !== "paid" && chaseEvents.length === 0 && invoice.customerEmail && (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
                    Your customer hasn&apos;t received this yet. Send it now to get paid faster.
                  </p>
                )}
                <div className="flex gap-2">
                {!isEditing && invoice.status !== "paid" && (
                  <Button 
                    onClick={handleSendInvoice}
                    disabled={sendingEmail || !invoice.customerEmail}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {sendingEmail ? "Sending..." : "Send Invoice"}
                  </Button>
                )}
                {!isEditing && (
                  <>
                    <MarkPaidButton
                      invoiceId={invoice.id}
                      isPaid={invoice.status === "paid" || !!invoice.paidAt}
                      onSuccess={(updatedInvoice) => {
                        // Optimistically update local invoice state
                        if (invoice) {
                          setInvoice({
                            ...invoice,
                            ...updatedInvoice,
                          });
                        }
                      }}
                    />
                    <Button variant="secondary" onClick={() => setIsEditing(true)}>
                      Edit
                    </Button>
                  </>
                )}
                </div>
              </div>
            </div>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          )}

          {/* Edit Form */}
          {isEditing ? (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Edit Invoice</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setIsEditing(false);
                      setErrors({});
                      // Reset form data to invoice values
                      const dueDate = (() => {
                        const date = toJsDate(invoice.dueAt);
                        return date ? date.toISOString().split("T")[0] : "";
                      })();
                      setFormData({
                        customerName: invoice.customerName || "",
                        customerEmail: invoice.customerEmail || "",
                        amount: ((invoice.amount || 0) / 100).toFixed(2),
                        dueDate: dueDate,
                        status: invoice.status,
                        autoChaseEnabled: invoice.autoChaseEnabled || false,
                        autoChaseDays: (invoice.autoChaseDays as AutoChaseDays) || 3,
                        maxChases: invoice.maxChases || 3,
                      });
                    }}
                  >
                    Cancel
                  </Button>
                </div>

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

                {/* Auto-Chase Settings */}
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Auto-Chase Settings</h4>
                  {!isPro && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                      <p className="text-sm text-yellow-800">
                        Auto-chase is available on the Pro plan. Enable Pro in Settings to use this feature.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="autoChaseEnabled"
                        checked={formData.autoChaseEnabled && isPro}
                        disabled={!isPro}
                        onChange={(e) => {
                          if (e.target.checked && !isPro) {
                            setUpgradeModalMessage(undefined);
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

                      <FormField label="Max Chases" htmlFor="maxChases" error={errors.maxChases}>
                        <Input
                          id="maxChases"
                          type="number"
                          min="0"
                          value={formData.maxChases}
                          onChange={(e) => setFormData({ ...formData, maxChases: parseInt(e.target.value) || 0 })}
                          error={!!errors.maxChases}
                        />
                      </FormField>
                    </>
                  )}

                  {/* Dev-only trigger button in edit mode */}
                  {isDev && formData.autoChaseEnabled && isPro && invoice.status !== "paid" && (
                    <div className="pt-4 border-t border-gray-200">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleTriggerChase}
                        disabled={saving}
                      >
                        {saving ? "Triggering..." : "Trigger Chase Now (Dev)"}
                      </Button>
                      <p className="mt-2 text-xs text-gray-500">
                        Sets triggerChaseAt and chaseRequested flag. Cloud function will process on next run.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {errors.submit && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-sm text-red-800">{errors.submit}</p>
                </div>
              )}

              <div className="flex gap-4">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsEditing(false);
                    setErrors({});
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            /* View Mode */
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Invoice Details</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Customer Name</div>
                  <div className="font-medium text-gray-900">{invoice.customerName}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Customer Email</div>
                  <div className="font-medium text-gray-900">{invoice.customerEmail}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Amount</div>
                  <div className="font-medium text-gray-900">
                    <Currency cents={invoice.amount || 0} />
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Due Date</div>
                  <div className="font-medium text-gray-900">
                    <DateLabel date={dueDateForDisplay} />
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Status</div>
                  <div className="font-medium text-gray-900">
                    <StatusBadge status={invoice.status} />
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Created At</div>
                  <div className="font-medium text-gray-900">
                    <DateLabel 
                      date={toJsDate(invoice.createdAt) || new Date()} 
                      showTime 
                    />
                  </div>
                </div>
              </div>

              {invoice.notes && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">Notes</div>
                  <div className="text-gray-900">{invoice.notes}</div>
                </div>
              )}

              {invoice.paymentLink && (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => window.open(invoice.paymentLink!, "_blank")}
                  >
                    Test Payment Link
                  </Button>
                </div>
              )}

              {/* Auto-Chase Info */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-md font-semibold text-gray-900">Auto-Chase Settings</h4>
                  {isDev && invoice.autoChaseEnabled && invoice.status !== "paid" && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleTriggerChase}
                      disabled={saving}
                    >
                      {saving ? "Triggering..." : "Trigger Chase Now (Dev)"}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Enabled</div>
                    <div className="font-medium text-gray-900">
                      {invoice.autoChaseEnabled ? "Yes" : "No"}
                    </div>
                  </div>
                  {invoice.autoChaseEnabled && (
                    <>
                      <div>
                        <div className="text-sm text-gray-500">Cadence</div>
                        <div className="font-medium text-gray-900">
                          {invoice.autoChaseDays || 3} days
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Max Chases</div>
                        <div className="font-medium text-gray-900">{invoice.maxChases || 3}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Chase Count</div>
                        <div className="font-medium text-gray-900">{invoice.chaseCount || 0}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Last Chased</div>
                        <div className="text-sm font-medium text-gray-900">
                          {invoice.lastChasedAt ? (
                            <DateLabel date={toJsDate(invoice.lastChasedAt) || new Date()} showTime />
                          ) : (
                            <span className="text-gray-400">Never</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Next Chase</div>
                        <div className="text-sm font-medium text-gray-900">
                          {invoice.nextChaseAt ? (
                            <DateLabel date={toJsDate(invoice.nextChaseAt) || new Date()} showTime />
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Chase History */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Chase History</h3>
            </div>
            <div className="overflow-x-auto">
              {chaseEventsError ? (
                <div className="px-6 py-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <p className="text-sm text-yellow-800">{chaseEventsError}</p>
                  </div>
                </div>
              ) : chaseEvents.length === 0 ? (
                <div className="px-6 py-4 text-center text-gray-500">
                  No chase events yet
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sent To
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {chaseEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <DateLabel date={new Date(event.createdAt)} showTime />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {event.toEmail}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {event.type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {event.dryRun ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                              Test
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                              Sent
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

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
