import { InvoiceStatus } from "@/domain/types";

interface StatusBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const styles = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    overdue: "bg-red-100 text-red-800 border-red-200",
    paid: "bg-green-100 text-green-800 border-green-200",
  };

  const labels = {
    pending: "Pending",
    overdue: "Overdue",
    paid: "Paid",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]} ${className}`}
    >
      {labels[status]}
    </span>
  );
}
