/**
 * Build invoice payload for sendInvoiceEmail from Firestore Admin document data.
 * Server-only (firebase-admin Timestamp).
 */

import { Timestamp } from "firebase-admin/firestore";
import type { InvoiceForEmailSend } from "./sendInvoiceEmail";
import { parseEmailOverrides } from "./emailOverrides";

export function invoiceForEmailSendFromFirestore(
  data: Record<string, unknown>,
  invoiceId: string,
  businessId: string
): InvoiceForEmailSend {
  const dueRaw = data.dueAt;
  const dueAt =
    dueRaw instanceof Timestamp ? dueRaw.toDate() : new Date(String(dueRaw ?? ""));

  return {
    id: invoiceId,
    userId: businessId || "",
    customerName: (data.customerName as string) || "Customer",
    customerEmail: (data.customerEmail as string) ?? "",
    amount: (data.amount as number) ?? 0,
    dueAt,
    paymentLink: (data.paymentLink as string | null) ?? null,
    invoiceNumber: (data.invoiceNumber as string) || invoiceId.slice(0, 8),
    emailOverrides: parseEmailOverrides(data.emailOverrides),
  };
}
