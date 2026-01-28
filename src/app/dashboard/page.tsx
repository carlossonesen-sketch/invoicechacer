"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribeToUserInvoices, fetchNextPageOfInvoices, markInvoicePaid, FirestoreInvoice, InvoiceSubscriptionResult, invoiceIsPaid } from "@/lib/invoices";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Currency } from "@/components/ui/currency";
import { DateLabel } from "@/components/ui/date-label";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { useEntitlements } from "@/hooks/useEntitlements";
import { toJsDate } from "@/lib/dates";
import { User } from "firebase/auth";

function formatTrialCountdown(end: Date): string {
  const now = new Date();
  const ms = end.getTime() - now.getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) {
    return hours <= 0 ? "today" : `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isPro } = useEntitlements();
  const [user, setUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [result, setResult] = useState<InvoiceSubscriptionResult>({ invoices: [] });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allInvoices, setAllInvoices] = useState<FirestoreInvoice[]>([]);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [, setProfileResolved] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [profileRetryCount, setProfileRetryCount] = useState(0);
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [invoiceLoadError, setInvoiceLoadError] = useState<string | null>(null);
  const [realtimePaused, setRealtimePaused] = useState(false);
  const pageMountTime = useRef<number>(Date.now());
  const firstRenderTime = useRef<number | null>(null);
  const invoiceUnsubscribeRef = useRef<(() => void) | null>(null);
  const didRedirectRef = useRef<boolean>(false);
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    // Check Firebase availability first
    if (typeof window !== "undefined" && !auth) {
      // Firebase unavailable - don't redirect, let EnvMissing component show
      setLoading(false);
      setCheckingProfile(false);
      setAuthInitialized(true);
      setProfileResolved(true);
      return;
    }

    pageMountTime.current = Date.now();

    const authUnsubscribe = onAuthStateChanged(auth!, async (currentUser) => {
      setAuthInitialized(true);

      if (!currentUser) {
        setUser(null);
        if (!didRedirectRef.current) {
          didRedirectRef.current = true;
          const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
          if (devToolsEnabled) {
            console.log("[NAV DEBUG] router.push('/login')", { currentPathname: pathname, targetPathname: "/login", condition: "No authenticated user" });
          }
          router.push("/login");
        }
        return;
      }
      setUser(currentUser);

      // Onboarding gate: Check if business profile exists via server API (no client Firestore)
      setProfileLoadError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/business-profile", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          exists?: boolean;
          profile?: unknown;
          trialEndsAt?: string | null;
          subscriptionStatus?: string | null;
          error?: string;
          message?: string;
        };

        if (!res.ok) {
          if (res.status === 401) {
            router.replace("/login?redirect=" + encodeURIComponent("/dashboard"));
            return;
          }
          console.error("[dashboard] business-profile check failed:", res.status, data.message ?? data.error ?? "unknown");
          setProfileLoadError("Could not load company profile. Please retry.");
          setProfileResolved(true);
          setCheckingProfile(false);
          setLoading(false);
          return;
        }

        if (!data.exists) {
          setProfileResolved(true);
          setCheckingProfile(false);
          if (pathname === "/dashboard" && !didRedirectRef.current) {
            didRedirectRef.current = true;
            if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
              console.log("[NAV DEBUG] router.replace('/onboarding/company')", { currentPathname: pathname, targetPathname: "/onboarding/company", condition: "Onboarding gate: no profile" });
            }
            router.replace("/onboarding/company");
            return;
          }
        } else {
          setProfileResolved(true);
          const te = data.trialEndsAt;
          setTrialEndsAt(te ? (() => { const d = new Date(te); return isNaN(d.getTime()) ? null : d; })() : null);
          setSubscriptionStatus(data.subscriptionStatus ?? null);
        }
      } catch (profileError) {
        const err = profileError instanceof Error ? profileError : new Error(String(profileError));
        console.error("[dashboard] business-profile check failed: no response, error.message:", err.message);
        setProfileLoadError("Could not load company profile. Please retry.");
        setProfileResolved(true);
        setCheckingProfile(false);
        setLoading(false);
        return;
      }
      setCheckingProfile(false);

      // Initial load via server API (works when Firestore client is degraded, e.g. Edge "client is offline")
      setLoading(true);
      setAllInvoices([]);
      setInvoiceLoadError(null);
      setRealtimePaused(false);
      try {
        const idToken = await currentUser.getIdToken();
        const listRes = await fetch("/api/invoices", { headers: { Authorization: `Bearer ${idToken}` } });
        const listData = (await listRes.json().catch(() => ({}))) as { invoices?: FirestoreInvoice[]; error?: string; message?: string };
        if (!listRes.ok) {
          if (listRes.status === 401) {
            router.replace("/login?redirect=" + encodeURIComponent("/dashboard"));
            return;
          }
          setInvoiceLoadError(listData.message || listData.error || "Could not load invoices.");
          setLoading(false);
          setResult({ invoices: [] });
          return;
        }
        const initialInvoices = Array.isArray(listData.invoices) ? listData.invoices : [];
        setResult({ invoices: initialInvoices });
        setAllInvoices(initialInvoices);
        setLoading(false);
        if (firstRenderTime.current === null && initialInvoices.length > 0) {
          firstRenderTime.current = Date.now();
          if (process.env.NODE_ENV !== "production") {
            console.log(`[Perf] Dashboard: ${firstRenderTime.current - pageMountTime.current}ms to first invoice render (API)`);
          }
        }
      } catch (apiErr) {
        setInvoiceLoadError(apiErr instanceof Error ? apiErr.message : "Could not load invoices.");
        setLoading(false);
        setResult({ invoices: [] });
        return;
      }

      // Optional realtime listener: non-blocking. On failure, keep showing API data; no redirect.
      if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
        console.log("[DEV dashboard invoices] subscribeToUserInvoices uid:", currentUser.uid);
      }
      invoiceUnsubscribeRef.current = subscribeToUserInvoices(currentUser, (invoiceResult) => {
        if (invoiceResult.error || invoiceResult.indexError) {
          setRealtimePaused(true);
          return;
        }
        setRealtimePaused(false);
        setResult(invoiceResult);
        setAllInvoices(invoiceResult.invoices);
        if (firstRenderTime.current === null && invoiceResult.invoices.length > 0) {
          firstRenderTime.current = Date.now();
          if (process.env.NODE_ENV !== "production") {
            console.log(`[Perf] Dashboard: ${firstRenderTime.current - pageMountTime.current}ms to first invoice render (listener)`);
          }
        }
      }, 25);
    });

    return () => {
      authUnsubscribe();
      if (invoiceUnsubscribeRef.current) {
        invoiceUnsubscribeRef.current();
        invoiceUnsubscribeRef.current = null;
      }
    };
  }, [router, pathname, profileRetryCount]);

  // Memoize KPI calculations to avoid recalculation on every render
  const kpis = useMemo(() => {
    const invoices = allInvoices;
    const today = new Date();
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const outstanding = invoices
      .filter((inv) => inv.status === "pending")
      .reduce((sum, inv) => sum + (inv.amount || 0), 0);

    const overdue = invoices
      .filter((inv) => {
        const dueDate = toJsDate(inv.dueAt) || new Date();
        return inv.status === "overdue" || (inv.status === "pending" && dueDate < today);
      })
      .reduce((sum, inv) => sum + (inv.amount || 0), 0);

    const paidLast30Days = invoices
      .filter((inv) => {
        const updatedDate = toJsDate(inv.updatedAt) || toJsDate(inv.createdAt) || new Date();
        return inv.status === "paid" && updatedDate >= last30Days;
      })
      .reduce((sum, inv) => sum + (inv.amount || 0), 0);

    const totalInvoices = invoices.length;

    return { outstanding, overdue, paidLast30Days, totalInvoices };
  }, [allInvoices]);

  const [showPaid, setShowPaid] = useState(false);

  // Payments stats from GET /api/stats/summary (zeros until loaded or on error)
  const [paymentsStats, setPaymentsStats] = useState({
    collectedThisMonthCents: 0,
    collectedTotalCents: 0,
    outstandingTotalCents: 0,
    paidCountThisMonth: 0,
  });

  useEffect(() => {
    if (!authInitialized || !user?.uid) return;
    let mounted = true;
    (async () => {
      try {
        if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
          console.log("[DEV dashboard getStatsSummary] function: fetch /api/stats/summary uid:", user.uid);
        }
        const idToken = await user.getIdToken();
        const res = await fetch("/api/stats/summary", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!mounted) return;
        if (!res.ok) {
          if (res.status === 401) router.replace("/login?redirect=" + encodeURIComponent("/dashboard"));
          return;
        }
        const d = await res.json();
        setPaymentsStats({
          collectedThisMonthCents: typeof d.collectedThisMonthCents === "number" ? d.collectedThisMonthCents : 0,
          collectedTotalCents: typeof d.collectedTotalCents === "number" ? d.collectedTotalCents : 0,
          outstandingTotalCents: typeof d.outstandingTotalCents === "number" ? d.outstandingTotalCents : 0,
          paidCountThisMonth: typeof d.paidCountThisMonth === "number" ? d.paidCountThisMonth : 0,
        });
      } catch (statsErr) {
        if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
          const c = statsErr && typeof statsErr === "object" && "code" in statsErr ? (statsErr as { code?: string }).code : undefined;
          const m = statsErr instanceof Error ? statsErr.message : String(statsErr);
          console.log("[DEV dashboard getStatsSummary catch] code:", c, "message:", m);
        }
        // Keep zeros on error (show $0 / 0 without errors)
      }
    })();
    return () => { mounted = false; };
  }, [authInitialized, user, router]);

  // Memoize recent invoices list (exclude paid by default unless showPaid is enabled)
  const recentInvoices = useMemo(() => {
    let filtered = [...allInvoices];
    
    // Exclude paid invoices by default; use invoiceIsPaid for consistency
    if (!showPaid) {
      filtered = filtered.filter(inv => !invoiceIsPaid(inv));
    }
    
    return filtered
      .sort((a, b) => {
        const dateA = toJsDate(a.updatedAt) || toJsDate(a.createdAt) || new Date();
        const dateB = toJsDate(b.updatedAt) || toJsDate(b.createdAt) || new Date();
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 10);
  }, [allInvoices, showPaid]);

  const handleLoadMore = useCallback(async () => {
    if (!user || !result.lastDoc || loadingMore) return;

    setLoadingMore(true);
    try {
      if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
        console.log("[DEV dashboard fetchNextPageOfInvoices] function: fetchNextPageOfInvoices uid:", user.uid);
      }
      const nextPageResult = await fetchNextPageOfInvoices(user, result.lastDoc, 25);
      if (nextPageResult.invoices.length > 0) {
        setAllInvoices((prev) => [...prev, ...nextPageResult.invoices]);
        setResult((prev) => ({
          ...prev,
          lastDoc: nextPageResult.lastDoc,
          hasMore: nextPageResult.hasMore,
        }));
      } else {
        setResult((prev) => ({ ...prev, hasMore: false }));
      }
    } catch (error) {
      console.error("Failed to load more invoices:", error);
      if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
        const c = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
        const m = error instanceof Error ? error.message : String(error);
        console.log("[DEV dashboard fetchNextPageOfInvoices catch] code:", c, "message:", m);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [user, result.lastDoc, loadingMore]);

  const handleMarkPaid = useCallback(async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Store original invoice for potential revert
    const originalInvoice = allInvoices.find((inv) => inv.id === invoiceId);
    
    // Optimistically update the invoice status
    const now = new Date().toISOString();
    setAllInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              status: "paid" as const,
              paidAt: now,
            }
          : inv
      )
    );
    
    await markInvoicePaid(
      invoiceId,
      () => {
        // Success - invoices will update automatically via real-time subscription
        // Optimistic update already applied above
        showToast("Invoice marked as paid", "success");
      },
      (errorMessage) => {
        // Revert optimistic update on error
        setAllInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoiceId
              ? {
                  ...inv,
                  status: originalInvoice?.status || "pending",
                  paidAt: originalInvoice?.paidAt,
                }
              : inv
          )
        );
        showToast(errorMessage, "error");
      }
    );
  }, [showToast, allInvoices]);

  if (!authInitialized) {
    return (
      <AppLayout>
        <Header title="Dashboard" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (auth && authInitialized && !user) {
    return (
      <AppLayout>
        <Header title="Dashboard" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (loading || checkingProfile) {
    return (
      <AppLayout>
        <Header title="Dashboard" />
        <div className="flex-1 overflow-auto p-6">
          <DashboardSkeleton />
        </div>
      </AppLayout>
    );
  }

  if (profileLoadError) {
    return (
      <AppLayout>
        <Header title="Dashboard" />
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl">
            <h3 className="text-lg font-semibold text-red-900 mb-2">Could not load company profile</h3>
            <p className="text-red-800 mb-4">{profileLoadError}</p>
            <Button
              onClick={() => {
                setProfileLoadError(null);
                setCheckingProfile(true);
                setProfileRetryCount((c) => c + 1);
              }}
              variant="secondary"
            >
              Retry
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (invoiceLoadError) {
    return (
      <AppLayout>
        <Header title="Dashboard" />
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl">
            <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Invoices</h3>
            <p className="text-red-800 mb-4">{invoiceLoadError}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setInvoiceLoadError(null);
                setLoading(true);
                setProfileRetryCount((c) => c + 1);
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const hasInvoices = allInvoices.length > 0;

  return (
    <AppLayout>
      <Header title="Dashboard">
        <Button onClick={() => router.push("/invoices/new")}>
          Create invoice
        </Button>
      </Header>
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {realtimePaused && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
              Live updates paused. Displaying last loaded data. Reconnect or refresh to retry.
            </div>
          )}
          {/* Get started: empty state when no invoices */}
          {!hasInvoices && (
            <div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
              <p className="text-lg font-semibold text-gray-900 mb-1">Create your first invoice</p>
              <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
                Add a customer and amount, then send the invoice by email in one click. It only takes a minute.
              </p>
              <Button onClick={() => router.push("/invoices/new")} size="lg">
                Create your first invoice
              </Button>
            </div>
          )}

          {/* Upgrade + trial countdown: shown when not paid; trial timer hidden when expired or paid */}
          {!isPro && hasInvoices && (
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={() => router.push("/pricing")} size="sm">
                    Upgrade
                  </Button>
                  {trialEndsAt && subscriptionStatus === "trial" && trialEndsAt > new Date() && (
                    <span
                      className="text-sm text-blue-800"
                      title={trialEndsAt ? `Ends ${trialEndsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : undefined}
                    >
                      Trial ends in {formatTrialCountdown(trialEndsAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-sm font-medium text-gray-500">Outstanding</div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">
                {formatCurrency(kpis.outstanding)}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-sm font-medium text-gray-500">Overdue</div>
              <div className="mt-2 text-2xl font-semibold text-red-600">
                {formatCurrency(kpis.overdue)}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-sm font-medium text-gray-500">Paid (Last 30 days)</div>
              <div className="mt-2 text-2xl font-semibold text-green-600">
                {formatCurrency(kpis.paidLast30Days)}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-sm font-medium text-gray-500">Total Invoices</div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">{kpis.totalInvoices}</div>
            </div>
          </div>

          {/* Payments (from GET /api/stats/summary) */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Payments</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-sm font-medium text-gray-500">Collected this month</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">
                  {formatCurrency(paymentsStats.collectedThisMonthCents)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Collected all-time</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">
                  {formatCurrency(paymentsStats.collectedTotalCents)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Outstanding (pending total)</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">
                  {formatCurrency(paymentsStats.outstandingTotalCents)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500">Paid invoices this month</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">
                  {paymentsStats.paidCountThisMonth}
                </div>
              </div>
            </div>
          </div>

          {/* Recently Updated Invoices */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Recently Updated Invoices</h3>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="showPaid"
                  checked={showPaid}
                  onChange={(e) => setShowPaid(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="showPaid" className="ml-2 block text-sm text-gray-700">
                  Show paid
                </label>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Updated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        {hasInvoices ? "No pending invoices. Enable &quot;Show paid&quot; to see paid ones." : "Create your first invoice above."}
                      </td>
                    </tr>
                  ) : (
                    recentInvoices.map((invoice) => {
                      const dueDate = toJsDate(invoice.dueAt) || new Date();
                      const updatedDate = toJsDate(invoice.updatedAt) || toJsDate(invoice.createdAt) || new Date();
                      const isPaid = invoice.status === "paid" || !!invoice.paidAt;
                      const paidDate = invoice.paidAt ? toJsDate(invoice.paidAt) : null;
                      
                      return (
                        <tr
                          key={invoice.id}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => router.push(`/invoices/${invoice.id}`)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{invoice.customerName}</div>
                            <div className="text-sm text-gray-500">{invoice.customerEmail}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <Currency cents={invoice.amount || 0} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <StatusBadge status={invoice.status} />
                              {isPaid && paidDate && (
                                <div className="text-xs text-gray-500">
                                  Paid on <DateLabel date={paidDate} />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <DateLabel date={dueDate} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <DateLabel date={updatedDate} showTime />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center gap-2">
                              {!isPaid && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e) => handleMarkPaid(invoice.id, e)}
                                  className="h-7 text-xs"
                                >
                                  Mark Paid
                                </Button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/invoices/${invoice.id}?edit=1`);
                                }}
                                className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                              >
                                Edit
                              </button>
                              <a
                                href={`/invoices/${invoice.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/invoices/${invoice.id}`);
                                }}
                                className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                              >
                                View
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {result.hasMore && (
              <div className="px-6 py-4 border-t border-gray-200 text-center">
                <Button
                  variant="secondary"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      {ToastComponent}
    </AppLayout>
  );
}
