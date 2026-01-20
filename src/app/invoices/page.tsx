"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { invoiceRepo } from "@/data/repositories";
import { Invoice, InvoiceStatus } from "@/domain/types";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Currency } from "@/components/ui/currency";
import { DateLabel } from "@/components/ui/date-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  async function loadInvoices() {
    try {
      setLoading(true);
      const results = await invoiceRepo.list({
        search: search || undefined,
        status: statusFilter,
      });
      setInvoices(results);
    } catch (error) {
      console.error("Failed to load invoices:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <Header title="Invoices">
        <Button onClick={() => router.push("/invoices/new")}>New Invoice</Button>
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
                  onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "all")}
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                        Loading...
                      </td>
                    </tr>
                  ) : invoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                        No invoices found
                      </td>
                    </tr>
                  ) : (
                    invoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/invoices/${invoice.id}`)}
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
                            <DateLabel date={invoice.nextChaseAt} />
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
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
