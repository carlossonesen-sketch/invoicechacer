"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markInvoicePaid, FirestoreInvoice } from "@/lib/invoices";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface MarkPaidButtonProps {
  invoiceId: string;
  isPaid: boolean;
  onSuccess?: (updatedInvoice: Partial<FirestoreInvoice>) => void;
}

/**
 * Fetch stats summary from API
 */
async function refreshStatsSummary(): Promise<void> {
  try {
    const response = await fetch("/api/stats/summary", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.warn("[MarkPaidButton] Failed to refresh stats summary:", response.status);
    }
    // Stats refreshed - the Cloud Function will have updated them automatically
  } catch (error) {
    console.warn("[MarkPaidButton] Error refreshing stats summary:", error);
    // Non-fatal - stats will update eventually via Cloud Function
  }
}

export function MarkPaidButton({ invoiceId, isPaid, onSuccess }: MarkPaidButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  // Return null if already paid
  if (isPaid) {
    return null;
  }

  const handleMarkPaid = async () => {
    setLoading(true);

    await markInvoicePaid(
      invoiceId,
      async () => {
        // Success - update local state optimistically
        const now = new Date();
        const updatedInvoice: Partial<FirestoreInvoice> = {
          status: "paid" as const,
          paidAt: now.toISOString(),
        };

        // Call onSuccess callback to update parent component state
        if (onSuccess) {
          onSuccess(updatedInvoice);
        }

        // Refresh stats summary
        await refreshStatsSummary();

        // Show success toast
        showToast("Invoice marked as paid", "success");

        // Refresh router to ensure UI is in sync
        router.refresh();
      },
      (errorMessage) => {
        showToast(errorMessage || "Failed to mark invoice as paid", "error");
      }
    );

    setLoading(false);
  };

  return (
    <Button
      onClick={handleMarkPaid}
      disabled={loading}
      className="bg-green-600 hover:bg-green-700 text-white"
    >
      {loading ? "Marking…" : "Mark Paid"}
    </Button>
  );
}
