/**
 * Canonical invoice collection path and business/tenant resolution.
 *
 * Path pattern: businessProfiles/{uid}/invoices/{invoiceId}
 * - Collection: businessProfiles/{uid}/invoices. Doc: businessProfiles/{uid}/invoices/{invoiceId}.
 * - Tenant: uid (parent of subcollection); businessId === uid.
 * - Stats: businessProfiles/{uid}/stats/summary (updated by onInvoiceWrite).
 */

import type { DocumentReference, Firestore } from "firebase-admin/firestore";

/** Subcollection name under businessProfiles/{uid} */
export const INVOICE_SUBCOLLECTION_ID = "invoices";

/**
 * Returns a reference to the invoice document.
 * Path: businessProfiles/{uid}/invoices/{invoiceId}
 */
export function getInvoiceRef(db: Firestore, uid: string, invoiceId: string): DocumentReference {
  return db.collection("businessProfiles").doc(uid).collection(INVOICE_SUBCOLLECTION_ID).doc(invoiceId);
}

/**
 * Returns a reference to the invoices subcollection for a user.
 * Path: businessProfiles/{uid}/invoices
 */
export function getInvoicesRef(db: Firestore, uid: string) {
  return db.collection("businessProfiles").doc(uid).collection(INVOICE_SUBCOLLECTION_ID);
}

export interface ResolvedInvoiceRef {
  businessId: string;
  invoiceRef: DocumentReference;
  exists: boolean;
  data: Record<string, unknown> | null;
}

/**
 * Load invoice by id in the scoped path and resolve businessId (= uid).
 * Returns { businessId: uid, invoiceRef, exists, data }.
 */
export async function resolveInvoiceRefAndBusinessId(
  db: Firestore,
  invoiceId: string,
  uid: string
): Promise<ResolvedInvoiceRef> {
  const invoiceRef = getInvoiceRef(db, uid, invoiceId);
  const snap = await invoiceRef.get();
  const data = snap.exists ? (snap.data() ?? null) : null;
  return { businessId: uid, invoiceRef, exists: snap.exists, data };
}
