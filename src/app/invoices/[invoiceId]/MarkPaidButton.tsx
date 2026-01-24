"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markInvoicePaid } from "@/lib/invoices";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface MarkPaidButtonProps {
  invoiceId: string;
  isPaid: boolean;
}

export function MarkPaidButton({ invoiceId, isPaid }: MarkPaidButtonProps) {
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
      () => {
        // Success
        showToast("Marked paid", "success");
        router.refresh();
      },
      (errorMessage) => {
        showToast(errorMessage, "error");
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
