import { Invoice, ChaseEvent, InvoiceListFilters } from "../types";

export interface InvoiceRepository {
  list(filters?: InvoiceListFilters): Promise<Invoice[]>;
  get(id: string): Promise<Invoice | null>;
  create(input: Omit<Invoice, "id" | "createdAt" | "updatedAt" | "chaseCount" | "lastChasedAt" | "nextChaseAt">): Promise<Invoice>;
  update(id: string, patch: Partial<Invoice>): Promise<Invoice>;
  remove(id: string): Promise<void>;
  listChaseEvents(invoiceId: string): Promise<ChaseEvent[]>;
  addChaseEvent(invoiceId: string, event: Omit<ChaseEvent, "id" | "createdAt">): Promise<void>;
}
