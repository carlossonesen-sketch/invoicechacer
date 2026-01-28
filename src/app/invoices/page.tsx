"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, firebaseUnavailable } from "@/lib/firebase";
import { subscribeToUserInvoices, fetchNextPageOfInvoices, markInvoicePaid, FirestoreInvoice, InvoiceSubscriptionResult, invoiceIsPaid } from "@/lib/invoices";
import { QueryDocumentSnapshot } from "firebase/firestore";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Currency } from "@/components/ui/currency";
import { DateLabel } from "@/components/ui/date-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { toJsDate } from "@/lib/dates";
import { User } from "firebase/auth";

export default function InvoicesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "overdue" | "paid">("pending");
  const [showPaid, setShowPaid] = useState(false);
  const [allInvoices, setAllInvoices] = useState<FirestoreInvoice[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [invoiceLoadError, setInvoiceLoadError] = useState<string | null>(null);
  const [realtimePaused, setRealtimePaused] = useState(false);
  const [invoiceRetryCount, setInvoiceRetryCount] = useState(0);
  const invoiceUnsubscribeRef = useRef<(() => void) | null>(null);
  const didRedirectRef = useRef<boolean>(false);
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    // Check Firebase availability first
    if (firebaseUnavailable || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        // Only redirect once
        if (!didRedirectRef.current) {
          didRedirectRef.current = true;
          const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
          if (devToolsEnabled) {
            console.log("[NAV DEBUG] router.push('/login')", { currentPathname: pathname, targetPathname: "/login", condition: "No authenticated user (invoices page)" });
          }
          router.push("/login");
        }
        return;
      }
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, [router, pathname]);

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    setLoading(true);
    setAllInvoices([]);
    setLastDoc(undefined);
    setHasMore(false);
    setInvoiceLoadError(null);
    setRealtimePaused(false);

    if (invoiceUnsubscribeRef.current) {
      invoiceUnsubscribeRef.current();
      invoiceUnsubscribeRef.current = null;
    }

    (async () => {
      try {
        const idToken = await user.getIdToken();
        const listRes = await fetch("/api/invoices", { headers: { Authorization: `Bearer ${idToken}` } });
        const listData = (await listRes.json().catch(() => ({}))) as { invoices?: FirestoreInvoice[]; error?: string; message?: string };
        if (!mounted) return;
        if (!listRes.ok) {
          if (listRes.status === 401) {
            router.replace("/login?redirect=" + encodeURIComponent("/invoices"));
            return;
          }
          setInvoiceLoadError(listData.message || listData.error || "Could not load invoices.");
          setLoading(false);
          return;
        }
        const initialInvoices = Array.isArray(listData.invoices) ? listData.invoices : [];
        setAllInvoices(initialInvoices);
        setLoading(false);
      } catch (e) {
        if (!mounted) return;
        setInvoiceLoadError(e instanceof Error ? e.message : "Could not load invoices.");
        setLoading(false);
        return;
      }

      const unsubscribe = subscribeToUserInvoices(user, (result: InvoiceSubscriptionResult) => {
        if (result.error || result.indexError) {
          setRealtimePaused(true);
          return;
        }
        setRealtimePaused(false);
        setAllInvoices(result.invoices || []);
        setLastDoc(result.lastDoc);
        setHasMore(result.hasMore || false);
      }, 25);
      invoiceUnsubscribeRef.current = unsubscribe;
    })();

    return () => {
      mounted = false;
      if (invoiceUnsubscribeRef.current) {
        invoiceUnsubscribeRef.current();
        invoiceUnsubscribeRef.current = null;
      }
    };
    // showPaid in deps: when toggle changes, reset to first page and refetch so list updates (client filter uses same data; refetch avoids stale "load more" cursor)
  }, [user, router, invoiceRetryCount, showPaid]);

  // Filter invoices client-side (since we already have userId filter from query)
  const filteredInvoices = useMemo(() => {
    let filtered = allInvoices;

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(inv => 
        inv.customerName.toLowerCase().includes(searchLower) ||
        inv.customerEmail.toLowerCase().includes(searchLower) ||
        inv.id.toLowerCase().includes(searchLower)
      );
    }

    // Exclude paid invoices by default unless "Show paid" is enabled; use invoiceIsPaid for consistency
    if (!showPaid) {
      filtered = filtered.filter(inv => !invoiceIsPaid(inv));
    }

    // Apply status filter (including computed overdue)
    if (statusFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter(inv => {
        if (statusFilter === "overdue") {
          const dueDate = toJsDate(inv.dueAt) || new Date();
          return !invoiceIsPaid(inv) && dueDate < now;
        }
        if (statusFilter === "paid") return invoiceIsPaid(inv);
        return inv.status === statusFilter;
      });
    }

    return filtered;
  }, [allInvoices, search, statusFilter, showPaid]);

  const handleLoadMore = useCallback(async () => {
    if (!user || !lastDoc || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const result = await fetchNextPageOfInvoices(user, lastDoc, 25);
      if (result.error) {
        console.error("Error loading more invoices:", result.error);
        showToast("Failed to load more invoices", "error");
      } else {
        setAllInvoices(prev => [...prev, ...(result.invoices || [])]);
        setLastDoc(result.lastDoc);
        setHasMore(result.hasMore || false);
      }
    } catch (error: unknown) {
      console.error("Error loading more invoices:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load more invoices";
      showToast(errorMessage, "error");
    } finally {
      setLoadingMore(false);
    }
  }, [user, lastDoc, loadingMore, hasMore, showToast]);

  const handleMarkPaid = useCallback(async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
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
        showToast("Invoice marked as paid", "success");
      },
      (errorMessage) => {
        // Revert optimistic update on error
        setAllInvoices((prev) =>
          prev.map((inv) => {
            if (inv.id === invoiceId) {
              const original = allInvoices.find((i) => i.id === invoiceId);
              return {
                ...inv,
                status: original?.status || "pending",
                paidAt: original?.paidAt,
              };
            }
            return inv;
          })
        );
        showToast(errorMessage, "error");
      }
    );
  }, [showToast, allInvoices]);

  const handleNewInvoice = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
    if (devToolsEnabled) {
      console.log("[NAV DEBUG] router.push('/invoices/new')", { currentPathname: pathname, targetPathname: "/invoices/new", condition: "New Invoice button click" });
    }
    router.push("/invoices/new");
  }, [router, pathname]);

  const handleImport = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
    if (devToolsEnabled) {
      console.log("[NAV DEBUG] router.push('/invoices/import')", { currentPathname: pathname, targetPathname: "/invoices/import", condition: "Import CSV button click" });
    }
    router.push("/invoices/import");
  }, [router, pathname]);

  return (
    <AppLayout>
      <Header title="Invoices">
        <Button onClick={handleImport} variant="secondary">
          Import CSV
        </Button>
        <Button onClick={handleNewInvoice}>New Invoice</Button>
      </Header>
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-4">
          {invoiceLoadError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
              <p className="text-red-800">{invoiceLoadError}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setInvoiceLoadError(null);
                  setLoading(true);
                  setInvoiceRetryCount((c) => c + 1);
                }}
              >
                Retry
              </Button>
            </div>
          )}
          {realtimePaused && !invoiceLoadError && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
              Live updates paused. Displaying last loaded data. Reconnect or refresh to retry.
            </div>
          )}
          {!invoiceLoadError && (
          <>
          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                  Search
                </label>
                <Input
                  id="search"
                  type="text"
                  placeholder="Customer name, email, or invoice ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <Select
                  id="status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="overdue">Overdue</option>
                  <option value="paid">Paid</option>
                </Select>
              </div>
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
          </div>

          {/* Invoices Table */}
          <div className="bg-white rounded-lg border border-gray-200">
            {/* Empty state when truly no invoices */}
            {!loading && allInvoices.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-lg font-semibold text-gray-900 mb-1">No invoices yet</p>
                <p className="text-sm text-gray-600 mb-6 max-w-sm mx-auto">
                  Create your first invoice and send it to your customer in minutes.
                </p>
                <Button onClick={(e) => { e.preventDefault(); router.push("/invoices/new"); }}>
                  Create your first invoice
                </Button>
              </div>
            )}
            {(loading || allInvoices.length > 0) && (
            <>
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
                      Auto-Chase
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Next Chase
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                        No invoices match your filters
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((invoice) => {
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
                            <Currency cents={invoice.amount} />
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
                            <DateLabel date={(() => {
                              const date = toJsDate(invoice.dueAt);
                              return date ? date.toISOString() : new Date().toISOString();
                            })()} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isPaid ? (
                              <span className="text-sm text-gray-400">—</span>
                            ) : invoice.autoChaseEnabled ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                Enabled
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">Disabled</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {isPaid ? (
                              <span className="text-gray-400">—</span>
                            ) : invoice.nextChaseAt ? (
                              <DateLabel date={(() => {
                                const date = toJsDate(invoice.nextChaseAt);
                                return date ? date.toISOString() : new Date().toISOString();
                              })()} />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
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
            
            {/* Load More Button */}
            {!loading && hasMore && (
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
            </>
            )}
          </div>
          </>
          )}
        </div>
      </div>
      {ToastComponent}
    </AppLayout>
  );
}
