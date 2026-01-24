/**
 * Canonical invoice collection path and business/tenant resolution.
 *
 * Final path pattern: invoices/{invoiceId}
 * - Collection: invoices (root). Doc: invoices/{invoiceId}.
 * - Tenant: userId on document; businessId === userId.
 * - Stats: businessProfiles/{businessId}/stats/summary (updated by onInvoiceWrite).
 */

import type { DocumentReference, Firestore } from "firebase-admin/firestore";

export const INVOICE_COLLECTION_ID = "invoices";

/**
 * Returns a reference to the invoice document.
 * Path: invoices/{invoiceId}
 */
export function getInvoiceRef(db: Firestore, invoiceId: string): DocumentReference {
  return db.collection(INVOICE_COLLECTION_ID).doc(invoiceId);
}

/**
 * Returns a reference to the invoices collection (for queries and add).
 * Path: invoices
 */
export function getInvoicesRef(db: Firestore) {
  return db.collection(INVOICE_COLLECTION_ID);
}

export interface ResolvedInvoiceRef {
  businessId: string | null;
  invoiceRef: DocumentReference;
  exists: boolean;
  data: Record<string, unknown> | null;
}

/**
 * Load invoice by id and resolve businessId (userId from document).
 * Returns { businessId, invoiceRef, exists, data }.
 */
export async function resolveInvoiceRefAndBusinessId(
  db: Firestore,
  invoiceId: string
): Promise<ResolvedInvoiceRef> {
  const invoiceRef = getInvoiceRef(db, invoiceId);
  const snap = await invoiceRef.get();
  const data = snap.exists ? (snap.data() ?? null) : null;
  const businessId = (data?.userId as string | undefined) ?? null;
  return { businessId, invoiceRef, exists: snap.exists, data };
}
