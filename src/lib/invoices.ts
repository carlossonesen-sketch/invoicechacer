"use client";

import { collection, query, where, orderBy, limit, getDocs, onSnapshot, doc, onSnapshot as onDocSnapshot, updateDoc, Timestamp, serverTimestamp, addDoc, writeBatch, QuerySnapshot, DocumentData, QueryDocumentSnapshot, startAfter } from "firebase/firestore";
import { db } from "./firebase";
import { User } from "firebase/auth";

export interface FirestoreInvoice {
  id: string;
  customerName: string;
  customerEmail: string;
  amount: number; // in cents
  status: "pending" | "overdue" | "paid";
  dueAt: Timestamp | string;
  createdAt: Timestamp | string;
  userId?: string;
  // Optional fields that might exist
  notes?: string;
  paymentLink?: string;
  autoChaseEnabled?: boolean;
  autoChaseDays?: number;
  maxChases?: number;
  chaseCount?: number;
  lastChasedAt?: Timestamp | string;
  nextChaseAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface InvoiceQueryResult {
  invoices: FirestoreInvoice[];
  error?: string;
  indexError?: {
    message: string;
    consoleLink?: string;
  };
  hasMissingCreatedAt?: boolean;
}

function convertSnapshotToInvoices(snapshot: QuerySnapshot<DocumentData>, user: User): FirestoreInvoice[] {
  const invoices: FirestoreInvoice[] = [];
  let hasMissingCreatedAt = false;

  snapshot.forEach((doc) => {
    // Use serverTimestamps: "estimate" to get estimated timestamps during pending window
    const data = doc.data({ serverTimestamps: "estimate" });
    
    // Check if createdAt is missing (dev-only log)
    if (!data.createdAt && process.env.NODE_ENV !== "production") {
      console.warn(`[Dev] Invoice ${doc.id} missing createdAt timestamp`);
      hasMissingCreatedAt = true;
    }
    
    // Convert Firestore invoice to our type with safe fallbacks
    const invoice: FirestoreInvoice = {
      id: doc.id,
      customerName: data.customerName || "Unknown Customer",
      customerEmail: data.customerEmail || "",
      amount: data.amount || data.amountCents || 0,
      status: data.status || "pending",
      dueAt: data.dueAt,
      createdAt: data.createdAt || new Date().toISOString(),
      userId: data.userId || user.uid,
      notes: data.notes,
      paymentLink: data.paymentLink,
      autoChaseEnabled: data.autoChaseEnabled || false,
      autoChaseDays: data.autoChaseDays,
      maxChases: data.maxChases,
      chaseCount: data.chaseCount || 0,
      lastChasedAt: data.lastChasedAt?.toDate?.() || data.lastChasedAt,
      nextChaseAt: data.nextChaseAt?.toDate?.() || data.nextChaseAt,
      updatedAt: data.updatedAt,
    };

    // Convert Timestamp to ISO string if needed
    if (invoice.dueAt instanceof Timestamp) {
      invoice.dueAt = invoice.dueAt.toDate().toISOString();
    } else if (!invoice.dueAt) {
      invoice.dueAt = new Date().toISOString();
    }
    if (invoice.createdAt instanceof Timestamp) {
      invoice.createdAt = invoice.createdAt.toDate().toISOString();
    } else if (!invoice.createdAt || typeof invoice.createdAt !== "string") {
      // Ensure createdAt is always a string, use current time as fallback
      invoice.createdAt = new Date().toISOString();
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[Dev] Invoice ${doc.id} had invalid createdAt, using fallback`);
      }
    }
    if (invoice.lastChasedAt instanceof Timestamp) {
      invoice.lastChasedAt = invoice.lastChasedAt.toDate().toISOString();
    }
    if (invoice.nextChaseAt instanceof Timestamp) {
      invoice.nextChaseAt = invoice.nextChaseAt.toDate().toISOString();
    }
    if (invoice.updatedAt instanceof Timestamp) {
      invoice.updatedAt = invoice.updatedAt.toDate().toISOString();
    } else if (!invoice.updatedAt) {
      invoice.updatedAt = new Date().toISOString();
    }

    invoices.push(invoice);
  });

  return invoices;
}

export interface InvoiceSubscriptionResult extends InvoiceQueryResult {
  lastDoc?: QueryDocumentSnapshot;
  hasMore?: boolean;
}

export function subscribeToUserInvoices(
  user: User,
  callback: (result: InvoiceSubscriptionResult) => void,
  pageLimit: number = 25
): () => void {
  if (!db) {
    callback({
      invoices: [],
      error: "Firebase not initialized. Please check your environment variables.",
    });
    return () => {}; // Return empty unsubscribe function
  }

  try {
    const invoicesRef = collection(db, "invoices");
    const q = query(
      invoicesRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(pageLimit)
    );

    // Use onSnapshot for real-time updates
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const invoices = convertSnapshotToInvoices(snapshot, user);
        const hasMissingCreatedAt = invoices.some(inv => !inv.createdAt || inv.createdAt === new Date().toISOString());
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        const hasMore = snapshot.docs.length === pageLimit;
        
        callback({
          invoices,
          hasMissingCreatedAt,
          lastDoc,
          hasMore,
        });
      },
      (error: any) => {
        console.error("Error subscribing to invoices:", error);

        // Check if this is a Firestore index error
        if (error.code === "failed-precondition" || error.message?.includes("index")) {
          // Try to extract the index link from the error
          const indexLinkMatch = error.message?.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
          const consoleLink = indexLinkMatch ? indexLinkMatch[0] : undefined;

          callback({
            invoices: [],
            error: "Firestore index required",
            indexError: {
              message: "A Firestore index is required for this query. Please create the composite index.",
              consoleLink,
            },
          });
        } else {
          callback({
            invoices: [],
            error: error.message || "Failed to fetch invoices",
          });
        }
      }
    );

    return unsubscribe;
  } catch (error: any) {
    console.error("Error setting up invoice subscription:", error);
    callback({
      invoices: [],
      error: error.message || "Failed to set up invoice subscription",
    });
    return () => {}; // Return empty unsubscribe function
  }
}

/**
 * Fetch next page of invoices for pagination
 */
export async function fetchNextPageOfInvoices(
  user: User,
  lastDoc: QueryDocumentSnapshot,
  pageLimit: number = 25
): Promise<InvoiceSubscriptionResult> {
  if (!db) {
    return {
      invoices: [],
      error: "Firebase not initialized. Please check your environment variables.",
    };
  }

  try {
    const invoicesRef = collection(db, "invoices");
    const q = query(
      invoicesRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      startAfter(lastDoc),
      limit(pageLimit)
    );

    const snapshot = await getDocs(q);
    const invoices = convertSnapshotToInvoices(snapshot, user);
    const nextLastDoc = snapshot.docs[snapshot.docs.length - 1];
    const hasMore = snapshot.docs.length === pageLimit;

    return {
      invoices,
      lastDoc: nextLastDoc,
      hasMore,
    };
  } catch (error: any) {
    console.error("Error fetching next page of invoices:", error);
    return {
      invoices: [],
      error: error.message || "Failed to fetch invoices",
    };
  }
}

// Keep legacy function for backward compatibility, but it uses one-time fetch
export async function getUserInvoices(user: User): Promise<InvoiceQueryResult> {
  try {
    if (!db) {
      return {
        invoices: [],
        error: "Firebase not initialized. Please check your environment variables.",
      };
    }

    const invoicesRef = collection(db, "invoices");
    const q = query(
      invoicesRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const querySnapshot = await getDocs(q);
    const invoices = convertSnapshotToInvoices(querySnapshot, user);
    const hasMissingCreatedAt = invoices.some(inv => !inv.createdAt || inv.createdAt === new Date().toISOString());

    return { invoices, hasMissingCreatedAt };
  } catch (error: any) {
    console.error("Error fetching invoices:", error);

    // Check if this is a Firestore index error
    if (error.code === "failed-precondition" || error.message?.includes("index")) {
      // Try to extract the index link from the error
      const indexLinkMatch = error.message?.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
      const consoleLink = indexLinkMatch ? indexLinkMatch[0] : undefined;

      return {
        invoices: [],
        error: "Firestore index required",
        indexError: {
          message: "A Firestore index is required for this query. Please create the composite index.",
          consoleLink,
        },
      };
    }

    return {
      invoices: [],
      error: error.message || "Failed to fetch invoices",
    };
  }
}

export async function createInvoice(
  user: User,
  invoiceData: {
    customerName: string;
    customerEmail: string;
    amount: number; // in cents
    dueAt: string; // ISO string
    status: "pending" | "overdue" | "paid";
    notes?: string;
    paymentLink?: string;
    autoChaseEnabled?: boolean;
    autoChaseDays?: number;
    maxChases?: number;
  }
): Promise<string> {
  if (!db) {
    throw new Error("Firebase not initialized. Please check your environment variables.");
  }

  const invoicesRef = collection(db, "invoices");

  const newInvoice = {
    userId: user.uid,
    customerName: invoiceData.customerName,
    customerEmail: invoiceData.customerEmail,
    amount: invoiceData.amount,
    dueAt: Timestamp.fromDate(new Date(invoiceData.dueAt)),
    status: invoiceData.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    notes: invoiceData.notes || null,
    paymentLink: invoiceData.paymentLink || null,
    autoChaseEnabled: invoiceData.autoChaseEnabled || false,
    autoChaseDays: invoiceData.autoChaseDays || null,
    maxChases: invoiceData.maxChases || null,
    chaseCount: 0,
    lastChasedAt: null,
    nextChaseAt: invoiceData.autoChaseEnabled
      ? Timestamp.fromDate(new Date(Date.now() + 60000)) // 1 minute from now
      : null,
  };

  const docRef = await addDoc(invoicesRef, newInvoice);
  return docRef.id;
}

export interface BulkInvoiceInput {
  customerName: string;
  customerEmail?: string;
  amount: number; // in cents
  dueAt: string; // ISO string
  status?: "pending" | "overdue" | "paid";
}

export async function createInvoicesBulk(
  user: User,
  invoices: BulkInvoiceInput[]
): Promise<{ success: number; failed: number; errors: string[] }> {
  if (!db) {
    throw new Error("Firebase not initialized. Please check your environment variables.");
  }

  const invoicesRef = collection(db, "invoices");
  const errors: string[] = [];
  let success = 0;
  let failed = 0;

  // Process in batches of 400 (Firestore limit is 500, but we'll use 400 to be safe)
  const batchSize = 400;
  
  for (let i = 0; i < invoices.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = invoices.slice(i, i + batchSize);
    let chunkSuccessCount = 0;

    for (let j = 0; j < chunk.length; j++) {
      const invoiceData = chunk[j];
      const invoiceIndex = i + j;

      try {
        const newInvoice = {
          userId: user.uid,
          customerName: invoiceData.customerName,
          customerEmail: invoiceData.customerEmail || null,
          amount: invoiceData.amount,
          dueAt: Timestamp.fromDate(new Date(invoiceData.dueAt)),
          status: invoiceData.status || "pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          autoChaseEnabled: false,
          chaseCount: 0,
          lastChasedAt: null,
          nextChaseAt: null,
        };

        const docRef = doc(invoicesRef);
        batch.set(docRef, newInvoice);
        chunkSuccessCount++;
      } catch (error: any) {
        failed++;
        errors.push(`Row ${invoiceIndex + 1}: ${error.message || "Failed to create invoice"}`);
      }
    }

    try {
      if (chunkSuccessCount > 0) {
        await batch.commit();
        success += chunkSuccessCount;
      }
    } catch (error: any) {
      // If batch fails, mark all in chunk as failed
      failed += chunkSuccessCount;
      success -= chunkSuccessCount; // Remove from success count
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message || "Batch write failed"}`);
    }
  }

  return { success, failed, errors };
}

function convertDocToInvoice(docData: DocumentData, docId: string, useServerTimestampEstimate: boolean = false): FirestoreInvoice {
  // If docData is a DocumentSnapshot, extract data with server timestamp estimate
  let data = docData;
  if (useServerTimestampEstimate && typeof (docData as any).data === "function") {
    data = (docData as any).data({ serverTimestamps: "estimate" });
  }
  
  const invoice: FirestoreInvoice = {
    id: docId,
    customerName: data.customerName || "Unknown Customer",
    customerEmail: data.customerEmail || "",
    amount: data.amount || data.amountCents || 0,
    status: data.status || "pending",
    dueAt: data.dueAt,
    createdAt: data.createdAt,
    userId: data.userId,
    notes: data.notes,
    paymentLink: data.paymentLink,
    autoChaseEnabled: data.autoChaseEnabled || false,
    autoChaseDays: data.autoChaseDays,
    maxChases: data.maxChases,
    chaseCount: data.chaseCount || 0,
    lastChasedAt: data.lastChasedAt,
    nextChaseAt: data.nextChaseAt,
    updatedAt: data.updatedAt,
  };

  // Convert Timestamp to ISO string if needed
  if (invoice.dueAt instanceof Timestamp) {
    invoice.dueAt = invoice.dueAt.toDate().toISOString();
  } else if (!invoice.dueAt) {
    invoice.dueAt = new Date().toISOString();
  }
  if (invoice.createdAt instanceof Timestamp) {
    invoice.createdAt = invoice.createdAt.toDate().toISOString();
  } else if (!invoice.createdAt || typeof invoice.createdAt !== "string") {
    // Ensure createdAt is always a string, use current time as fallback
    invoice.createdAt = new Date().toISOString();
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[Dev] Invoice ${docId} had invalid createdAt, using fallback`);
    }
  }
  if (invoice.lastChasedAt instanceof Timestamp) {
    invoice.lastChasedAt = invoice.lastChasedAt.toDate().toISOString();
  }
  if (invoice.nextChaseAt instanceof Timestamp) {
    invoice.nextChaseAt = invoice.nextChaseAt.toDate().toISOString();
  }
  if (invoice.updatedAt instanceof Timestamp) {
    invoice.updatedAt = invoice.updatedAt.toDate().toISOString();
  } else if (!invoice.updatedAt) {
    invoice.updatedAt = new Date().toISOString();
  }

  return invoice;
}

export function subscribeToInvoice(
  invoiceId: string,
  callback: (invoice: FirestoreInvoice | null, error?: string) => void
): () => void {
  if (!db) {
    callback(null, "Firebase not initialized. Please check your environment variables.");
    return () => {};
  }

  try {
    const invoiceRef = doc(db, "invoices", invoiceId);

    const unsubscribe = onDocSnapshot(
      invoiceRef,
      (snapshot: any) => {
        if (!snapshot.exists()) {
          callback(null, "Invoice not found");
          return;
        }
        const invoice = convertDocToInvoice(snapshot, snapshot.id, true);
        callback(invoice);
      },
      (error: any) => {
        console.error("Error subscribing to invoice:", error);
        callback(null, error.message || "Failed to load invoice");
      }
    );

    return unsubscribe;
  } catch (error: any) {
    console.error("Error setting up invoice subscription:", error);
    callback(null, error.message || "Failed to set up invoice subscription");
    return () => {};
  }
}

export async function updateInvoice(
  invoiceId: string,
  updates: {
    customerName?: string;
    customerEmail?: string;
    amount?: number;
    dueAt?: string; // ISO string
    status?: "pending" | "overdue" | "paid";
    autoChaseEnabled?: boolean;
    autoChaseDays?: number;
    maxChases?: number;
  }
): Promise<void> {
  if (!db) {
    throw new Error("Firebase not initialized. Please check your environment variables.");
  }

  const invoiceRef = doc(db, "invoices", invoiceId);

  const updateData: any = {
    updatedAt: serverTimestamp(),
  };

  if (updates.customerName !== undefined) {
    updateData.customerName = updates.customerName;
  }
  if (updates.customerEmail !== undefined) {
    updateData.customerEmail = updates.customerEmail;
  }
  if (updates.amount !== undefined) {
    updateData.amount = updates.amount;
  }
  if (updates.dueAt !== undefined) {
    updateData.dueAt = Timestamp.fromDate(new Date(updates.dueAt));
  }
  if (updates.status !== undefined) {
    updateData.status = updates.status;
  }
  if (updates.autoChaseEnabled !== undefined) {
    updateData.autoChaseEnabled = updates.autoChaseEnabled;
  }
  if (updates.autoChaseDays !== undefined) {
    updateData.autoChaseDays = updates.autoChaseDays;
  }
  if (updates.maxChases !== undefined) {
    updateData.maxChases = updates.maxChases;
  }

  // If enabling auto-chase and nextChaseAt is not set, set it
  if (updates.autoChaseEnabled && !updateData.nextChaseAt) {
    const days = updates.autoChaseDays || 3;
    const nextChaseDate = new Date();
    nextChaseDate.setMinutes(nextChaseDate.getMinutes() + 1); // 1 minute from now for first chase
    updateData.nextChaseAt = Timestamp.fromDate(nextChaseDate);
  }

  await updateDoc(invoiceRef, updateData);
}

/**
 * Mark an invoice as paid
 */
export async function markInvoicePaid(invoiceId: string): Promise<void> {
  if (!db) {
    throw new Error("Firebase not initialized. Please check your environment variables.");
  }

  const invoiceRef = doc(db, "invoices", invoiceId);

  await updateDoc(invoiceRef, {
    status: "paid",
    updatedAt: serverTimestamp(),
  });
}

export async function triggerChaseNow(invoiceId: string): Promise<void> {
  if (!db) {
    throw new Error("Firebase not initialized. Please check your environment variables.");
  }

  const invoiceRef = doc(db, "invoices", invoiceId);

  const updateData = {
    triggerChaseAt: serverTimestamp(),
    nextChaseAt: serverTimestamp(),
    chaseRequested: true,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(invoiceRef, updateData);
}

export interface ChaseEvent {
  id: string;
  invoiceId: string;
  createdAt: string; // ISO string
  toEmail: string;
  type: "reminder";
  dryRun: boolean;
}

export function subscribeToChaseEvents(
  invoiceId: string,
  callback: (events: ChaseEvent[], error?: string) => void
): () => void {
  if (!db) {
    callback([], "Firebase not initialized. Please check your environment variables.");
    return () => {};
  }

  try {
    const eventsRef = collection(db, "invoices", invoiceId, "chaseEvents");
    const q = query(eventsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const events: ChaseEvent[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          events.push({
            id: doc.id,
            invoiceId: invoiceId,
            createdAt: data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || new Date().toISOString(),
            toEmail: data.toEmail || "",
            type: data.type || "reminder",
            dryRun: data.dryRun || false,
          });
        });
        callback(events);
      },
      (error: any) => {
        console.error("Error subscribing to chase events:", error);
        callback([], error.message || "Failed to load chase events");
      }
    );

    return unsubscribe;
  } catch (error: any) {
    console.error("Error setting up chase events subscription:", error);
    callback([], error.message || "Failed to set up chase events subscription");
    return () => {};
  }
}
