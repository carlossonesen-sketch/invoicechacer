import { formatDate, formatDateTime } from "@/lib/utils";

interface DateLabelProps {
  date: string | Date;
  showTime?: boolean;
  className?: string;
}

export function DateLabel({ date, showTime = false, className = "" }: DateLabelProps) {
  const formatted = showTime ? formatDateTime(date) : formatDate(date);
  return <span className={className}>{formatted}</span>;
}
