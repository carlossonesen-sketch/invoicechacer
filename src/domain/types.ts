export type InvoiceStatus = "pending" | "overdue" | "paid";
export type AutoChaseDays = 3 | 5 | 7;

export interface Invoice {
  id: string;
  userId: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  customerName: string;
  customerEmail: string;
  amountCents: number;
  dueAt: string; // ISO string
  status: InvoiceStatus;
  notes?: string;
  paymentLink?: string;
  autoChaseEnabled: boolean;
  autoChaseDays: AutoChaseDays;
  maxChases: number;
  chaseCount: number;
  lastChasedAt?: string; // ISO string
  nextChaseAt?: string; // ISO string
}

export interface ChaseEvent {
  id: string;
  invoiceId: string;
  createdAt: string; // ISO string
  toEmail: string;
  type: "reminder";
  dryRun: boolean;
}

export interface BusinessProfile {
  companyName: string;
  email: string;
  phone?: string;
  logoUrl?: string;
  defaultPaymentLink?: string;
}

export interface InvoiceListFilters {
  search?: string;
  status?: InvoiceStatus | "all";
}
