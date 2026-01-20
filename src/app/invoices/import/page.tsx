"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createInvoicesBulk } from "@/lib/invoices";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { isValidEmail } from "@/lib/utils";
import Papa from "papaparse";
import { User } from "firebase/auth";

interface CSVRow {
  [key: string]: string;
}

interface ColumnMapping {
  customerName?: string;
  customerEmail?: string;
  amount?: string;
  dueAt?: string;
  status?: string;
}

interface ParsedInvoice {
  customerName: string;
  customerEmail?: string;
  amount: number; // in cents
  dueAt: string; // ISO string
  status: "pending" | "overdue" | "paid";
  rowIndex: number;
  errors: string[];
}

export default function ImportInvoicesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [parsedInvoices, setParsedInvoices] = useState<ParsedInvoice[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

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

  function autoDetectMappings(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};

    headers.forEach((header) => {
      const lower = header.toLowerCase().trim();
      
      if (!mapping.customerName && (lower.includes("customer") || lower.includes("name") || lower === "client")) {
        mapping.customerName = header;
      }
      if (!mapping.customerEmail && (lower.includes("email") || lower.includes("e-mail"))) {
        mapping.customerEmail = header;
      }
      if (!mapping.amount && (lower.includes("amount") || lower.includes("total") || lower.includes("price") || lower.includes("cost"))) {
        mapping.amount = header;
      }
      if (!mapping.dueAt && (lower.includes("due") || lower.includes("date") || lower.includes("deadline"))) {
        mapping.dueAt = header;
      }
      if (!mapping.status && lower === "status") {
        mapping.status = header;
      }
    });

    return mapping;
  }

  function parseCurrency(value: string): number {
    // Remove currency symbols, commas, and whitespace
    const cleaned = value.replace(/[$,\s]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100); // Convert to cents
  }

  function parseDate(value: string): string {
    // Try common date formats
    const formats = [
      /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
      /^\d{2}-\d{2}-\d{4}$/, // MM-DD-YYYY
    ];

    let date: Date | null = null;

    // Try ISO format first
    if (formats[0].test(value)) {
      date = new Date(value);
    } else if (formats[1].test(value) || formats[2].test(value)) {
      // Try MM/DD/YYYY or MM-DD-YYYY
      const parts = value.split(/[\/\-]/);
      if (parts.length === 3) {
        date = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
      }
    } else {
      // Try Date.parse as fallback
      date = new Date(value);
    }

    if (!date || isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${value}`);
    }

    return date.toISOString();
  }

  function parseStatus(value: string): "pending" | "overdue" | "paid" {
    const lower = value.toLowerCase().trim();
    if (lower === "paid" || lower === "complete") return "paid";
    if (lower === "overdue" || lower === "late") return "overdue";
    return "pending";
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
        }

        const data = results.data as CSVRow[];
        const headers = results.meta.fields || [];

        setCsvData(data);
        setCsvHeaders(headers);

        // Auto-detect column mappings
        const mappings = autoDetectMappings(headers);
        setColumnMapping(mappings);

        // Parse preview
        parseInvoices(data, mappings);
      },
      error: (error) => {
        console.error("CSV parsing error:", error);
        alert("Failed to parse CSV file. Please check the file format.");
      },
    });
  }

  function parseInvoices(data: CSVRow[], mapping: ColumnMapping) {
    const parsed: ParsedInvoice[] = [];
    const errors: string[] = [];

    data.forEach((row, index) => {
      const invoice: ParsedInvoice = {
        customerName: "",
        amount: 0,
        dueAt: new Date().toISOString(),
        status: "pending",
        rowIndex: index + 2, // +2 because CSV is 1-indexed and has header
        errors: [],
      };

      // Parse customerName (required)
      if (mapping.customerName && row[mapping.customerName]) {
        invoice.customerName = row[mapping.customerName].trim();
      } else {
        invoice.errors.push("Customer name is required");
      }

      // Parse customerEmail (optional)
      if (mapping.customerEmail && row[mapping.customerEmail]) {
        const email = row[mapping.customerEmail].trim();
        if (email && !isValidEmail(email)) {
          invoice.errors.push("Invalid email format");
        } else {
          invoice.customerEmail = email || undefined;
        }
      }

      // Parse amount (required)
      if (mapping.amount && row[mapping.amount]) {
        try {
          invoice.amount = parseCurrency(row[mapping.amount]);
          if (invoice.amount <= 0) {
            invoice.errors.push("Amount must be greater than 0");
          }
        } catch (error) {
          invoice.errors.push("Invalid amount format");
        }
      } else {
        invoice.errors.push("Amount is required");
      }

      // Parse dueAt (optional)
      if (mapping.dueAt && row[mapping.dueAt]) {
        try {
          invoice.dueAt = parseDate(row[mapping.dueAt]);
        } catch (error: any) {
          invoice.errors.push(`Invalid date: ${error.message}`);
        }
      }

      // Parse status (optional)
      if (mapping.status && row[mapping.status]) {
        invoice.status = parseStatus(row[mapping.status]);
      }

      parsed.push(invoice);
    });

    setParsedInvoices(parsed);
  }

  function handleMappingChange(field: keyof ColumnMapping, value: string) {
    const newMapping = {
      ...columnMapping,
      [field]: value || undefined,
    };
    
    setColumnMapping(newMapping);

    // Re-parse with new mapping
    if (csvData.length > 0) {
      parseInvoices(csvData, newMapping);
    }
  }

  async function handleImport() {
    if (!user) {
      alert("You must be logged in to import invoices.");
      return;
    }

    // Filter valid invoices
    const validInvoices = parsedInvoices.filter((inv) => inv.errors.length === 0);
    const invalidCount = parsedInvoices.length - validInvoices.length;

    if (validInvoices.length === 0) {
      alert("No valid invoices to import. Please fix the errors first.");
      return;
    }

    if (!confirm(`Import ${validInvoices.length} valid invoice(s)? ${invalidCount > 0 ? `${invalidCount} will be skipped.` : ""}`)) {
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const invoicesToImport = validInvoices.map((inv) => ({
        customerName: inv.customerName,
        customerEmail: inv.customerEmail,
        amount: inv.amount,
        dueAt: inv.dueAt,
        status: inv.status,
      }));

      const result = await createInvoicesBulk(user, invoicesToImport);
      setImportResult(result);

      if (result.success > 0) {
        // Navigate to dashboard after a short delay
        setTimeout(() => {
          // PATHNAME GUARD: Only redirect to dashboard if we're still on the import page
          if (pathname !== "/invoices/import") {
            const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
            if (devToolsEnabled) {
              console.warn(`[Import] BLOCKED redirect to /dashboard - pathname is ${pathname}, not /invoices/import`);
              console.trace("Redirect blocked");
            }
            return;
          }

          const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
          if (devToolsEnabled) {
            console.log(`[Import] Redirecting to /dashboard from pathname: ${pathname}`);
            console.trace("Import -> Dashboard redirect");
          }
          router.push("/dashboard");
        }, 2000);
      }
    } catch (error: any) {
      console.error("Import error:", error);
      alert(`Failed to import invoices: ${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  const previewRows = parsedInvoices.slice(0, 20);
  const validCount = parsedInvoices.filter((inv) => inv.errors.length === 0).length;
  const invalidCount = parsedInvoices.length - validCount;

  return (
    <AppLayout>
      <Header title="Import Invoices" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl space-y-6">
          {/* Back Link */}
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span className="mr-1">←</span>
              Back to Dashboard
            </button>
          </div>

          {/* Sample CSV Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Sample CSV Format</h3>
            <pre className="text-xs text-blue-800 bg-blue-100 p-2 rounded overflow-x-auto">
{`customerName,customerEmail,amount,dueAt,status
Acme Corp,billing@acme.com,500.00,2024-12-31,pending
Tech Solutions,payments@techsol.com,1250.00,2024-11-15,pending
Global Ventures,finance@global.com,2500.00,2024-10-20,paid`}
            </pre>
            <p className="text-xs text-blue-700 mt-2">
              Required columns: customerName, amount. Optional: customerEmail, dueAt, status
            </p>
          </div>

          {/* File Upload */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload CSV File</h3>
            <div className="space-y-4">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose CSV File
                </Button>
                {csvData.length > 0 && (
                  <span className="ml-4 text-sm text-gray-600">
                    {csvData.length} row(s) loaded
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Column Mapping */}
          {csvHeaders.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Map CSV Columns</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Customer Name (required)" htmlFor="map-customerName">
                  <Select
                    id="map-customerName"
                    value={columnMapping.customerName || ""}
                    onChange={(e) => handleMappingChange("customerName", e.target.value)}
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="Customer Email (optional)" htmlFor="map-customerEmail">
                  <Select
                    id="map-customerEmail"
                    value={columnMapping.customerEmail || ""}
                    onChange={(e) => handleMappingChange("customerEmail", e.target.value)}
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="Amount (required)" htmlFor="map-amount">
                  <Select
                    id="map-amount"
                    value={columnMapping.amount || ""}
                    onChange={(e) => handleMappingChange("amount", e.target.value)}
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="Due Date (optional)" htmlFor="map-dueAt">
                  <Select
                    id="map-dueAt"
                    value={columnMapping.dueAt || ""}
                    onChange={(e) => handleMappingChange("dueAt", e.target.value)}
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="Status (optional)" htmlFor="map-status">
                  <Select
                    id="map-status"
                    value={columnMapping.status || ""}
                    onChange={(e) => handleMappingChange("status", e.target.value)}
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            </div>
          )}

          {/* Preview & Validation */}
          {parsedInvoices.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Preview (First 20 Rows)</h3>
                  <div className="text-sm">
                    <span className="text-green-600 font-medium">{validCount} valid</span>
                    {invalidCount > 0 && (
                      <span className="text-red-600 font-medium ml-4">{invalidCount} with errors</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {previewRows.map((invoice, idx) => (
                      <tr
                        key={idx}
                        className={invoice.errors.length > 0 ? "bg-red-50" : ""}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900">{invoice.rowIndex}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{invoice.customerName || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{invoice.customerEmail || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          ${((invoice.amount || 0) / 100).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {new Date(invoice.dueAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{invoice.status}</td>
                        <td className="px-4 py-3 text-sm">
                          {invoice.errors.length > 0 ? (
                            <div className="text-red-600">
                              {invoice.errors.map((err, i) => (
                                <div key={i} className="text-xs">{err}</div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-green-600">✓</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedInvoices.length > 20 && (
                <div className="px-6 py-4 border-t border-gray-200 text-sm text-gray-500 text-center">
                  Showing first 20 of {parsedInvoices.length} rows
                </div>
              )}
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className={`rounded-lg p-4 ${
              importResult.success > 0
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}>
              <h3 className={`text-lg font-semibold mb-2 ${
                importResult.success > 0 ? "text-green-900" : "text-red-900"
              }`}>
                Import Complete
              </h3>
              <p className={importResult.success > 0 ? "text-green-800" : "text-red-800"}>
                Imported {importResult.success} invoice(s)
                {importResult.failed > 0 && ` (${importResult.failed} failed)`}
              </p>
              {importResult.errors.length > 0 && (
                <div className="mt-2 text-sm text-red-700">
                  <strong>Errors:</strong>
                  <ul className="list-disc list-inside mt-1">
                    {importResult.errors.slice(0, 10).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>... and {importResult.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Import Button */}
          {parsedInvoices.length > 0 && (
            <div className="flex gap-4">
              <Button
                onClick={handleImport}
                disabled={importing || validCount === 0}
              >
                {importing ? "Importing..." : `Import ${validCount} Valid Invoice(s)`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setCsvData([]);
                  setCsvHeaders([]);
                  setColumnMapping({});
                  setParsedInvoices([]);
                  setImportResult(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                disabled={importing}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
