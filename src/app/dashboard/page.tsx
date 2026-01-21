"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribeToUserInvoices, fetchNextPageOfInvoices, FirestoreInvoice, InvoiceSubscriptionResult, markInvoicePaid } from "@/lib/invoices";
import { QueryDocumentSnapshot } from "firebase/firestore";
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
import { getBusinessProfile } from "@/lib/businessProfile";
import { User } from "firebase/auth";

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isPro } = useEntitlements();
  const [user, setUser] = useState<User | null>(null);
  const [result, setResult] = useState<InvoiceSubscriptionResult>({ invoices: [] });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allInvoices, setAllInvoices] = useState<FirestoreInvoice[]>([]);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const pageMountTime = useRef<number>(Date.now());
  const firstRenderTime = useRef<number | null>(null);
  const invoiceUnsubscribeRef = useRef<(() => void) | null>(null);
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    if (!auth) {
      router.push("/login");
      return;
    }

    pageMountTime.current = Date.now();

    const authUnsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }
      setUser(currentUser);
      
      // Onboarding gate: Check if business profile exists
      // Only enforce on dashboard entry, not globally
      try {
        const profile = await getBusinessProfile(currentUser.uid);
        if (!profile) {
          // Redirect to onboarding if profile is missing
          // Only redirect if we're on the dashboard page
          const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
          if (pathname === "/dashboard") {
            if (devToolsEnabled) {
              console.log("[redirect->dashboard]", { pathname, reason: "Onboarding gate: no profile, redirecting to onboarding" });
            }
            router.replace("/onboarding/company");
            return;
          }
        }
      } catch (profileError) {
        console.error("Failed to check business profile on dashboard:", profileError);
        // Continue to dashboard even if profile check fails
      }
      setCheckingProfile(false);
      
      // Clean up previous subscription if any
      if (invoiceUnsubscribeRef.current) {
        invoiceUnsubscribeRef.current();
        invoiceUnsubscribeRef.current = null;
      }

      // Set up real-time subscription with limit
      setLoading(true);
      setAllInvoices([]);
      invoiceUnsubscribeRef.current = subscribeToUserInvoices(currentUser, (invoiceResult) => {
        setResult(invoiceResult);
        setAllInvoices(invoiceResult.invoices);
        setLoading(false);
        
        // Performance logging (dev-only)
        if (firstRenderTime.current === null && invoiceResult.invoices.length > 0) {
          firstRenderTime.current = Date.now();
          const timeToFirstRender = firstRenderTime.current - pageMountTime.current;
          if (process.env.NODE_ENV !== "production") {
            console.log(`[Perf] Dashboard: ${timeToFirstRender}ms to first invoice render`);
          }
        }
      }, 25); // Limit to 25 invoices initially
    });

    return () => {
      authUnsubscribe();
      if (invoiceUnsubscribeRef.current) {
        invoiceUnsubscribeRef.current();
        invoiceUnsubscribeRef.current = null;
      }
    };
  }, [router]);

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
        const dueDate = typeof inv.dueAt === "string" 
          ? new Date(inv.dueAt) 
          : inv.dueAt?.toDate?.() || new Date();
        return inv.status === "overdue" || (inv.status === "pending" && dueDate < today);
      })
      .reduce((sum, inv) => sum + (inv.amount || 0), 0);

    const paidLast30Days = invoices
      .filter((inv) => {
        const updatedDate = typeof inv.updatedAt === "string" 
          ? new Date(inv.updatedAt) 
          : inv.updatedAt?.toDate?.() || new Date(inv.createdAt as string);
        return inv.status === "paid" && updatedDate >= last30Days;
      })
      .reduce((sum, inv) => sum + (inv.amount || 0), 0);

    const totalInvoices = invoices.length;

    return { outstanding, overdue, paidLast30Days, totalInvoices };
  }, [allInvoices]);

  // Memoize recent invoices list
  const recentInvoices = useMemo(() => {
    return [...allInvoices]
      .sort((a, b) => {
        const dateA = typeof a.updatedAt === "string" 
          ? new Date(a.updatedAt) 
          : a.updatedAt?.toDate?.() || new Date(a.createdAt as string);
        const dateB = typeof b.updatedAt === "string" 
          ? new Date(b.updatedAt) 
          : b.updatedAt?.toDate?.() || new Date(b.createdAt as string);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 10);
  }, [allInvoices]);

  const handleLoadMore = useCallback(async () => {
    if (!user || !result.lastDoc || loadingMore) return;

    setLoadingMore(true);
    try {
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
    } finally {
      setLoadingMore(false);
    }
  }, [user, result.lastDoc, loadingMore]);

  const handleMarkPaid = useCallback(async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await markInvoicePaid(invoiceId);
      showToast("Marked paid");
    } catch (error: any) {
      console.error("Failed to mark invoice as paid:", error);
      showToast(error.message || "Failed to mark as paid", "error");
    }
  }, [showToast]);

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

  if (result.indexError) {
    return (
      <AppLayout>
        <Header title="Dashboard" />
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-2xl">
            <h3 className="text-lg font-semibold text-yellow-900 mb-2">Firestore Index Required</h3>
            <p className="text-yellow-800 mb-4">{result.indexError.message}</p>
            {result.indexError.consoleLink && (
              <div className="space-y-2">
                <p className="text-sm text-yellow-700">Click the link below to create the required index:</p>
                <a
                  href={result.indexError.consoleLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  {result.indexError.consoleLink}
                </a>
              </div>
            )}
            <p className="text-sm text-yellow-700 mt-4">
              The index should be created on the <code className="bg-yellow-100 px-1 rounded">invoices</code> collection
              with fields: <code className="bg-yellow-100 px-1 rounded">userId (Ascending)</code> and{" "}
              <code className="bg-yellow-100 px-1 rounded">createdAt (Descending)</code>
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (result.error && !result.indexError) {
    return (
      <AppLayout>
        <Header title="Dashboard" />
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl">
            <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Invoices</h3>
            <p className="text-red-800">{result.error}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Dashboard" />
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* Upgrade Banner */}
          {!isPro && (
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-blue-900">Unlock Pro Features</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Get auto-chase emails, custom cadence, and priority support.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => router.push("/trial")} size="sm">
                    Start free trial
                  </Button>
                  <Button onClick={() => router.push("/settings/billing")} variant="secondary" size="sm">
                    View plans
                  </Button>
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


          {/* Recently Updated Invoices */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Recently Updated Invoices</h3>
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
                      <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                        No invoices yet
                      </td>
                    </tr>
                  ) : (
                    recentInvoices.map((invoice) => {
                      const dueDate = typeof invoice.dueAt === "string" 
                        ? new Date(invoice.dueAt) 
                        : invoice.dueAt?.toDate?.() || new Date();
                      const updatedDate = typeof invoice.updatedAt === "string" 
                        ? new Date(invoice.updatedAt) 
                        : invoice.updatedAt?.toDate?.() || new Date(invoice.createdAt as string);
                      const isPaid = invoice.status === "paid";
                      
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
                            <StatusBadge status={invoice.status} />
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
