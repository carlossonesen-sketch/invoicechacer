"use client";

import { useEffect, useState } from "react";
import { invoiceRepo } from "@/data/repositories";
import { Invoice } from "@/domain/types";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Currency } from "@/components/ui/currency";
import { DateLabel } from "@/components/ui/date-label";
import { formatCurrency } from "@/lib/utils";

export default function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const all = await invoiceRepo.list();
      setInvoices(all);
    } catch (error) {
      console.error("Failed to load invoices:", error);
    } finally {
      setLoading(false);
    }
  }

  // Calculate KPIs
  const today = new Date();
  const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const outstanding = invoices
    .filter((inv) => inv.status === "pending")
    .reduce((sum, inv) => sum + inv.amountCents, 0);

  const overdue = invoices
    .filter((inv) => inv.status === "overdue" || (inv.status === "pending" && new Date(inv.dueAt) < today))
    .reduce((sum, inv) => sum + inv.amountCents, 0);

  const paidLast30Days = invoices
    .filter((inv) => inv.status === "paid" && new Date(inv.updatedAt) >= last30Days)
    .reduce((sum, inv) => sum + inv.amountCents, 0);

  const totalInvoices = invoices.length;

  // Get recently updated invoices (last 10)
  const recentInvoices = invoices
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  if (loading) {
    return (
      <>
        <Header title="Dashboard" />
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </>
    );
  }

  return (
    <AppLayout>
      <Header title="Dashboard" />
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                        No invoices yet
                      </td>
                    </tr>
                  ) : (
                    recentInvoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => (window.location.href = `/invoices/${invoice.id}`)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{invoice.customerName}</div>
                          <div className="text-sm text-gray-500">{invoice.customerEmail}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <Currency cents={invoice.amountCents} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={invoice.status} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <DateLabel date={invoice.dueAt} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <DateLabel date={invoice.updatedAt} showTime />
                        </td>
                      </tr>
                    ))
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
