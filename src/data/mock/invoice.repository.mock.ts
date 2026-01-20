"use client";

import { Invoice, ChaseEvent, InvoiceListFilters } from "@/domain/types";
import { InvoiceRepository } from "@/domain/repos/invoice.repository";
import { storage } from "./local-storage-utils";

const USER_ID = "dev-user";

function seedInvoices(): Invoice[] {
  const now = new Date();
  const invoices: Invoice[] = [
    {
      id: "inv-1",
      userId: USER_ID,
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      customerName: "Acme Corp",
      customerEmail: "billing@acme.com",
      amountCents: 50000,
      dueAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      status: "overdue",
      notes: "Q1 consulting services",
      paymentLink: "https://pay.acme.com/inv-1",
      autoChaseEnabled: true,
      autoChaseDays: 5,
      maxChases: 3,
      chaseCount: 1,
      lastChasedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      nextChaseAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "inv-2",
      userId: USER_ID,
      createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      customerName: "Tech Solutions Inc",
      customerEmail: "payments@techsol.com",
      amountCents: 125000,
      dueAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
      autoChaseEnabled: false,
      autoChaseDays: 7,
      maxChases: 3,
      chaseCount: 0,
    },
    {
      id: "inv-3",
      userId: USER_ID,
      createdAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      customerName: "Global Ventures",
      customerEmail: "finance@globalventures.com",
      amountCents: 250000,
      dueAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      status: "paid",
      paymentLink: "https://pay.example.com/inv-3",
      autoChaseEnabled: false,
      autoChaseDays: 3,
      maxChases: 3,
      chaseCount: 0,
      lastChasedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "inv-4",
      userId: USER_ID,
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      customerName: "StartupXYZ",
      customerEmail: "billing@startupxyz.io",
      amountCents: 75000,
      dueAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: "overdue",
      notes: "Website redesign project",
      autoChaseEnabled: true,
      autoChaseDays: 3,
      maxChases: 5,
      chaseCount: 2,
      lastChasedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      nextChaseAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "inv-5",
      userId: USER_ID,
      createdAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000).toISOString(),
      customerName: "Design Studio",
      customerEmail: "accounts@designstudio.com",
      amountCents: 95000,
      dueAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      status: "paid",
      autoChaseEnabled: false,
      autoChaseDays: 5,
      maxChases: 3,
      chaseCount: 0,
    },
    {
      id: "inv-6",
      userId: USER_ID,
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      customerName: "Media Group",
      customerEmail: "finance@media.com",
      amountCents: 180000,
      dueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
      paymentLink: "https://pay.example.com/inv-6",
      autoChaseEnabled: true,
      autoChaseDays: 7,
      maxChases: 3,
      chaseCount: 0,
      nextChaseAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "inv-7",
      userId: USER_ID,
      createdAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      customerName: "E-commerce Plus",
      customerEmail: "billing@ecommerceplus.net",
      amountCents: 320000,
      dueAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      status: "overdue",
      notes: "Q2 services",
      autoChaseEnabled: true,
      autoChaseDays: 5,
      maxChases: 4,
      chaseCount: 3,
      lastChasedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      nextChaseAt: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "inv-8",
      userId: USER_ID,
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      customerName: "Fitness Club",
      customerEmail: "admin@fitnessclub.com",
      amountCents: 45000,
      dueAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
      autoChaseEnabled: false,
      autoChaseDays: 7,
      maxChases: 3,
      chaseCount: 0,
    },
    {
      id: "inv-9",
      userId: USER_ID,
      createdAt: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 22 * 24 * 60 * 60 * 1000).toISOString(),
      customerName: "Restaurant Group",
      customerEmail: "payments@restaurantgroup.com",
      amountCents: 67000,
      dueAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      status: "paid",
      autoChaseEnabled: false,
      autoChaseDays: 3,
      maxChases: 3,
      chaseCount: 0,
    },
    {
      id: "inv-10",
      userId: USER_ID,
      createdAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      customerName: "Consulting Partners",
      customerEmail: "billing@consultpartners.com",
      amountCents: 156000,
      dueAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
      notes: "Strategic planning services",
      paymentLink: "https://pay.example.com/inv-10",
      autoChaseEnabled: true,
      autoChaseDays: 3,
      maxChases: 3,
      chaseCount: 0,
      nextChaseAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
  return invoices;
}

function ensureInvoicesInitialized(): Invoice[] {
  const existing = storage.getItem<Invoice[]>(storage.keys.INVOICES, []);
  if (existing.length === 0) {
    const seeded = seedInvoices();
    storage.setItem(storage.keys.INVOICES, seeded);
    return seeded;
  }
  return existing;
}

export class MockInvoiceRepository implements InvoiceRepository {
  list(filters?: InvoiceListFilters): Promise<Invoice[]> {
    const invoices = ensureInvoicesInitialized();
    let filtered = [...invoices];

    // Filter by status
    if (filters?.status && filters.status !== "all") {
      filtered = filtered.filter((inv) => {
        if (filters.status === "overdue") {
          return inv.status === "pending" && new Date(inv.dueAt) < new Date();
        }
        return inv.status === filters.status;
      });
    } else {
      // Auto-calculate overdue status for display
      filtered = filtered.map((inv) => {
        if (inv.status === "pending" && new Date(inv.dueAt) < new Date()) {
          return { ...inv, status: "overdue" as const };
        }
        return inv;
      });
    }

    // Search filter
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.customerName.toLowerCase().includes(searchLower) ||
          inv.customerEmail.toLowerCase().includes(searchLower) ||
          inv.id.toLowerCase().includes(searchLower)
      );
    }

    // Sort by createdAt desc
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return Promise.resolve(filtered);
  }

  get(id: string): Promise<Invoice | null> {
    const invoices = ensureInvoicesInitialized();
    const invoice = invoices.find((inv) => inv.id === id);
    if (!invoice) return Promise.resolve(null);

    // Auto-calculate overdue status
    if (invoice.status === "pending" && new Date(invoice.dueAt) < new Date()) {
      return Promise.resolve({ ...invoice, status: "overdue" });
    }

    return Promise.resolve(invoice);
  }

  create(input: Omit<Invoice, "id" | "createdAt" | "updatedAt" | "chaseCount" | "lastChasedAt" | "nextChaseAt">): Promise<Invoice> {
    const invoices = ensureInvoicesInitialized();
    const now = new Date().toISOString();
    const newInvoice: Invoice = {
      ...input,
      id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      chaseCount: 0,
    };

    // Set nextChaseAt if auto-chase is enabled
    if (newInvoice.autoChaseEnabled) {
      const nextChaseDate = new Date();
      nextChaseDate.setMinutes(nextChaseDate.getMinutes() + 1); // First send in 1 minute
      newInvoice.nextChaseAt = nextChaseDate.toISOString();
    }

    invoices.push(newInvoice);
    storage.setItem(storage.keys.INVOICES, invoices);
    return Promise.resolve(newInvoice);
  }

  update(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    const invoices = ensureInvoicesInitialized();
    const index = invoices.findIndex((inv) => inv.id === id);
    if (index === -1) {
      throw new Error(`Invoice ${id} not found`);
    }

    const updated: Invoice = {
      ...invoices[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    // Handle auto-chase enablement
    if (patch.autoChaseEnabled && !invoices[index].autoChaseEnabled && !updated.nextChaseAt) {
      const nextChaseDate = new Date();
      nextChaseDate.setMinutes(nextChaseDate.getMinutes() + 1);
      updated.nextChaseAt = nextChaseDate.toISOString();
    }

    invoices[index] = updated;
    storage.setItem(storage.keys.INVOICES, invoices);
    return Promise.resolve(updated);
  }

  remove(id: string): Promise<void> {
    const invoices = ensureInvoicesInitialized();
    const filtered = invoices.filter((inv) => inv.id !== id);
    storage.setItem(storage.keys.INVOICES, filtered);
    return Promise.resolve();
  }

  listChaseEvents(invoiceId: string): Promise<ChaseEvent[]> {
    const events = storage.getItem<ChaseEvent[]>(storage.keys.CHASE_EVENTS, []);
    const filtered = events.filter((e) => e.invoiceId === invoiceId);
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return Promise.resolve(filtered);
  }

  addChaseEvent(invoiceId: string, event: Omit<ChaseEvent, "id" | "createdAt">): Promise<void> {
    const events = storage.getItem<ChaseEvent[]>(storage.keys.CHASE_EVENTS, []);
    const newEvent: ChaseEvent = {
      ...event,
      id: `chase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    events.push(newEvent);
    storage.setItem(storage.keys.CHASE_EVENTS, events);
    return Promise.resolve();
  }
}
