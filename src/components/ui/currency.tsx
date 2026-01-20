import { formatCurrency } from "@/lib/utils";

interface CurrencyProps {
  cents: number;
  className?: string;
}

export function Currency({ cents, className = "" }: CurrencyProps) {
  return <span className={className}>{formatCurrency(cents)}</span>;
}
