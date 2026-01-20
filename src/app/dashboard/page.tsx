"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribeToUserInvoices, FirestoreInvoice, InvoiceQueryResult } from "@/lib/invoices";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Currency } from "@/components/ui/currency";
import { DateLabel } from "@/components/ui/date-label";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useEntitlements } from "@/hooks/useEntitlements";
import { User } from "firebase/auth";

export default function DashboardPage() {
  const router = useRouter();
  const { isPro } = useEntitlements();
  const [user, setUser] = useState<User | null>(null);
  const [result, setResult] = useState<InvoiceQueryResult>({ invoices: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      router.push("/login");
      return;
    }

    let invoiceUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }
      setUser(currentUser);
      
      // Clean up previous subscription if any
      if (invoiceUnsubscribe) {
        invoiceUnsubscribe();
      }

      // Set up real-time subscription
      setLoading(true);
      invoiceUnsubscribe = subscribeToUserInvoices(currentUser, (invoiceResult) => {
        setResult(invoiceResult);
        setLoading(false);
      });
    });

    return () => {
      authUnsubscribe();
      if (invoiceUnsubscribe) {
        invoiceUnsubscribe();
      }
    };
  }, [router]);

  // Calculate KPIs
  const invoices = result.invoices || [];
  const today = new Date();
  const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const outstanding = invoices
    .filter((inv) => inv.status === "pending")
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);

  const overdue = invoices
    .filter((inv) => {
      const dueDate = typeof inv.dueAt === "string" ? new Date(inv.dueAt) : inv.dueAt?.toDate?.() || new Date();
      return inv.status === "pending" && dueDate < today;
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

  // Get recently updated invoices (last 10)
  const recentInvoices = [...invoices]
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

  if (loading) {
    return (
      <AppLayout>
        <Header title="Dashboard" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
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
                <Button onClick={() => router.push("/settings/billing")} size="sm">
                  Upgrade to Pro
                </Button>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-sm font-medium text-gray-500">Outstanding</div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">
                {formatCurrency(outstanding)}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-sm font-medium text-gray-500">Overdue</div>
              <div className="mt-2 text-2xl font-semibold text-red-600">
                {formatCurrency(overdue)}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-sm font-medium text-gray-500">Paid (Last 30 days)</div>
              <div className="mt-2 text-2xl font-semibold text-green-600">
                {formatCurrency(paidLast30Days)}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-sm font-medium text-gray-500">Total Invoices</div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">{totalInvoices}</div>
            </div>
          </div>

          {/* Missing createdAt warning */}
          {result.hasMissingCreatedAt && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Some invoices are missing <code className="bg-yellow-100 px-1 rounded">createdAt</code> timestamps. 
                They may not appear in the correct order. This is typically caused by invoices created before serverTimestamp was implemented.
              </p>
            </div>
          )}

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
                      
                      return (
                        <tr
                          key={invoice.id}
                          className="hover:bg-gray-50"
                        >
                          <td 
                            className="px-6 py-4 whitespace-nowrap cursor-pointer"
                            onClick={() => router.push(`/invoices/${invoice.id}`)}
                          >
                            <div className="text-sm font-medium text-gray-900">{invoice.customerName}</div>
                            <div className="text-sm text-gray-500">{invoice.customerEmail}</div>
                          </td>
                          <td 
                            className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer"
                            onClick={() => router.push(`/invoices/${invoice.id}`)}
                          >
                            <Currency cents={invoice.amount || 0} />
                          </td>
                          <td 
                            className="px-6 py-4 whitespace-nowrap cursor-pointer"
                            onClick={() => router.push(`/invoices/${invoice.id}`)}
                          >
                            <StatusBadge status={invoice.status} />
                          </td>
                          <td 
                            className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer"
                            onClick={() => router.push(`/invoices/${invoice.id}`)}
                          >
                            <DateLabel date={dueDate} />
                          </td>
                          <td 
                            className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer"
                            onClick={() => router.push(`/invoices/${invoice.id}`)}
                          >
                            <DateLabel date={updatedDate} showTime />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/invoices/${invoice.id}?edit=1`);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
