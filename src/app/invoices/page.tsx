"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribeToUserInvoices, fetchNextPageOfInvoices, markInvoicePaid, FirestoreInvoice, InvoiceSubscriptionResult } from "@/lib/invoices";
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
import { User } from "firebase/auth";

export default function InvoicesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "overdue" | "paid">("all");
  const [allInvoices, setAllInvoices] = useState<FirestoreInvoice[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const invoiceUnsubscribeRef = useRef<(() => void) | null>(null);
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    if (!auth) {
      router.push("/login");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setAllInvoices([]);
    
    // Clean up previous subscription
    if (invoiceUnsubscribeRef.current) {
      invoiceUnsubscribeRef.current();
    }

    // Set up real-time subscription - ALWAYS includes userId filter
    const unsubscribe = subscribeToUserInvoices(user, (result: InvoiceSubscriptionResult) => {
      if (result.error) {
        console.error("Error loading invoices:", result.error);
        setLoading(false);
        return;
      }
      
      setAllInvoices(result.invoices || []);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore || false);
      setLoading(false);
    }, 25); // Limit to 25 invoices initially

    invoiceUnsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
    };
  }, [user]);

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

    // Apply status filter (including computed overdue)
    if (statusFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter(inv => {
        if (statusFilter === "overdue") {
          // Compute overdue: dueAt < now AND status != "paid"
          const dueDate = typeof inv.dueAt === "string" ? new Date(inv.dueAt) : inv.dueAt.toDate();
          return inv.status !== "paid" && dueDate < now;
        }
        return inv.status === statusFilter;
      });
    }

    return filtered;
  }, [allInvoices, search, statusFilter]);

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
    } catch (error: any) {
      console.error("Error loading more invoices:", error);
      showToast(error.message || "Failed to load more invoices", "error");
    } finally {
      setLoadingMore(false);
    }
  }, [user, lastDoc, loadingMore, hasMore, showToast]);

  const handleMarkPaid = useCallback(async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await markInvoicePaid(invoiceId);
      showToast("Marked paid");
      // Invoices will update automatically via real-time subscription
    } catch (error: any) {
      console.error("Failed to mark invoice as paid:", error);
      showToast(error.message || "Failed to mark as paid", "error");
    }
  }, [showToast]);

  const handleNewInvoice = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push("/invoices/new");
  }, [router]);

  const handleImport = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push("/invoices/import");
  }, [router]);

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
            </div>
          </div>

          {/* Invoices Table */}
          <div className="bg-white rounded-lg border border-gray-200">
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
                        No invoices found
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((invoice) => {
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
                            <Currency cents={invoice.amount} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <StatusBadge status={invoice.status} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <DateLabel date={typeof invoice.dueAt === "string" ? invoice.dueAt : invoice.dueAt.toDate().toISOString()} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {invoice.autoChaseEnabled ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                Enabled
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">Disabled</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {invoice.nextChaseAt ? (
                              <DateLabel date={typeof invoice.nextChaseAt === "string" ? invoice.nextChaseAt : invoice.nextChaseAt.toDate().toISOString()} />
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
          </div>
        </div>
      </div>
      {ToastComponent}
    </AppLayout>
  );
}
