"use client";

import { collection, query, where, orderBy, limit, getDocs, onSnapshot, doc, onSnapshot as onDocSnapshot, updateDoc, Timestamp, serverTimestamp, addDoc, writeBatch, QuerySnapshot, DocumentData, QueryDocumentSnapshot, startAfter } from "firebase/firestore";
import { db, auth } from "./firebase";
import { User, onAuthStateChanged } from "firebase/auth";

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
  paidAt?: Timestamp | string;
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

  snapshot.forEach((doc) => {
    // Use serverTimestamps: "estimate" to get estimated timestamps during pending window
    const data = doc.data({ serverTimestamps: "estimate" });
    
    // Check if createdAt is missing (dev-only log)
    if (!data.createdAt && process.env.NODE_ENV !== "production") {
      console.warn(`[Dev] Invoice ${doc.id} missing createdAt timestamp`);
    }
    
    // Convert Firestore invoice to our type with safe fallbacks
    const invoice: FirestoreInvoice = {
      id: doc.id,
      customerName: data.customerName || "Unknown Customer",
      customerEmail: data.customerEmail || "",
      amount: data.amount || data.amountCents || 0,
      status: data.status || "pending",
      dueAt: data.dueAt || data.dueAt?.toDate?.() || new Date().toISOString(),
      createdAt: data.createdAt || data.createdAt?.toDate?.() || new Date().toISOString(),
      userId: data.userId || user.uid,
      notes: data.notes,
      paymentLink: data.paymentLink,
      autoChaseEnabled: data.autoChaseEnabled || false,
      autoChaseDays: data.autoChaseDays,
      maxChases: data.maxChases,
      chaseCount: data.chaseCount || 0,
      lastChasedAt: data.lastChasedAt?.toDate?.() || data.lastChasedAt,
      nextChaseAt: data.nextChaseAt?.toDate?.() || data.nextChaseAt,
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
    };

    // Convert Timestamp to ISO string if needed
    if (invoice.dueAt instanceof Timestamp) {
      invoice.dueAt = invoice.dueAt.toDate().toISOString();
    }
    if (invoice.createdAt instanceof Timestamp) {
      invoice.createdAt = invoice.createdAt.toDate().toISOString();
    }
    if (invoice.lastChasedAt instanceof Timestamp) {
      invoice.lastChasedAt = invoice.lastChasedAt.toDate().toISOString();
    }
    if (invoice.nextChaseAt instanceof Timestamp) {
      invoice.nextChaseAt = invoice.nextChaseAt.toDate().toISOString();
    }
    if (invoice.updatedAt instanceof Timestamp) {
      invoice.updatedAt = invoice.updatedAt.toDate().toISOString();
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
      (error: unknown) => {
        console.error("Error subscribing to invoices:", error);

        // Check if this is a Firestore index error
        const errorCode = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorCode === "failed-precondition" || errorMessage?.includes("index")) {
          // Try to extract the index link from the error
          const indexLinkMatch = errorMessage?.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
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
            error: errorMessage || "Failed to fetch invoices",
          });
        }
      }
    );

    return unsubscribe;
  } catch (error: unknown) {
    console.error("Error setting up invoice subscription:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to set up invoice subscription";
    callback({
      invoices: [],
      error: errorMessage,
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
  } catch (error: unknown) {
    console.error("Error fetching next page of invoices:", error);
    return {
      invoices: [],
      error: error instanceof Error ? error.message : "Failed to fetch invoices",
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
  } catch (error: unknown) {
    console.error("Error fetching invoices:", error);

    const err = error instanceof Error ? error : new Error(String(error));
    const errMsg = err.message;
    // Check if this is a Firestore index error
    const errObj = error && typeof error === "object" && "code" in error ? error as { code?: string; message?: string } : null;
    if (errObj?.code === "failed-precondition" || errMsg?.includes("index")) {
      // Try to extract the index link from the error
      const indexLinkMatch = errMsg?.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
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
      error: errMsg || "Failed to fetch invoices",
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
      } catch (error: unknown) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : "Failed to create invoice";
        errors.push(`Row ${invoiceIndex + 1}: ${errorMessage}`);
      }
    }

    try {
      if (chunkSuccessCount > 0) {
        await batch.commit();
        success += chunkSuccessCount;
      }
    } catch (error: unknown) {
      // If batch fails, mark all in chunk as failed
      failed += chunkSuccessCount;
      success -= chunkSuccessCount; // Remove from success count
      const errorMessage = error instanceof Error ? error.message : "Batch write failed";
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${errorMessage}`);
    }
  }

  return { success, failed, errors };
}

function convertDocToInvoice(docData: DocumentData, docId: string, useServerTimestampEstimate: boolean = false): FirestoreInvoice {
  // If docData is a DocumentSnapshot, extract data with server timestamp estimate
  let data = docData;
  // Type guard for DocumentSnapshot
  interface DocumentSnapshotLike {
    data: (options?: { serverTimestamps?: "estimate" | "previous" | "none" }) => DocumentData;
  }
  if (useServerTimestampEstimate && typeof docData === "object" && docData !== null && "data" in docData && typeof (docData as DocumentSnapshotLike).data === "function") {
    data = (docData as DocumentSnapshotLike).data({ serverTimestamps: "estimate" });
  }
  
  const invoice: FirestoreInvoice = {
    id: docId,
    customerName: data.customerName || "Unknown Customer",
    customerEmail: data.customerEmail || "",
    amount: data.amount || data.amountCents || 0,
    status: data.status || "pending",
    dueAt: data.dueAt || new Date().toISOString(),
    createdAt: data.createdAt || new Date().toISOString(),
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
  }
  if (invoice.createdAt instanceof Timestamp) {
    invoice.createdAt = invoice.createdAt.toDate().toISOString();
  }
  if (invoice.lastChasedAt instanceof Timestamp) {
    invoice.lastChasedAt = invoice.lastChasedAt.toDate().toISOString();
  }
  if (invoice.nextChaseAt instanceof Timestamp) {
    invoice.nextChaseAt = invoice.nextChaseAt.toDate().toISOString();
  }
  if (invoice.updatedAt instanceof Timestamp) {
    invoice.updatedAt = invoice.updatedAt.toDate().toISOString();
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
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null, "Invoice not found");
          return;
        }
        // Use serverTimestamp estimate for pending timestamps
        const invoice = convertDocToInvoice(snapshot, snapshot.id, true);
        callback(invoice);
      },
      (error: unknown) => {
        console.error("Error subscribing to invoice:", error);
        
        const errorCode = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Dev-only logging for permission errors
        const devToolsEnabled = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
        if (devToolsEnabled && (errorCode === "permission-denied" || errorMessage?.includes("permission"))) {
          console.log(`[Invoice Detail] Permission denied for invoiceId: ${invoiceId}, error code: ${errorCode}`);
        }
        
        // Check for permission denied error
        if (errorCode === "permission-denied" || errorMessage?.includes("permission") || errorMessage?.includes("insufficient")) {
          callback(null, "Permission denied: You don't have access to this invoice (or it no longer exists).");
        } else {
          callback(null, errorMessage || "Failed to load invoice");
        }
      }
    );

    return unsubscribe;
  } catch (error: unknown) {
    console.error("Error setting up invoice subscription:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to set up invoice subscription";
    callback(null, errorMessage);
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

  const updateData: Record<string, unknown> = {
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
    const nextChaseDate = new Date();
    nextChaseDate.setMinutes(nextChaseDate.getMinutes() + 1); // 1 minute from now for first chase
    updateData.nextChaseAt = Timestamp.fromDate(nextChaseDate);
  }

  await updateDoc(invoiceRef, updateData);
}

/**
 * Mark an invoice as paid
 */
/**
 * Wait for Firebase auth to be ready and get current user
 * Returns null if auth is not available or user is not authenticated
 */
function waitForAuth(): Promise<User | null> {
  return new Promise((resolve) => {
    if (!auth) {
      resolve(null);
      return;
    }

    // If user is already available, return immediately
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    // Otherwise wait for auth state change
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Shared helper to mark an invoice as paid via API
 * Shows confirmation prompt, gets Firebase ID token, and calls the API
 * 
 * @param invoiceId - The invoice ID to mark as paid
 * @param onSuccess - Optional callback on success
 * @param onError - Optional callback on error
 * @returns Promise that resolves to true on success, false on cancellation/error
 */
export async function markInvoicePaid(
  invoiceId: string,
  onSuccess?: () => void,
  onError?: (error: string) => void
): Promise<boolean> {
  // Show confirmation prompt
  if (!window.confirm("Mark this invoice as paid? This stops all future reminders.")) {
    return false;
  }

  try {
    // Wait for auth if needed
    const user = await waitForAuth();
    
    if (!user) {
      const errorMsg = "You must be logged in to mark invoices as paid.";
      console.error("[markInvoicePaid] No authenticated user found");
      onError?.(errorMsg);
      return false;
    }

    // Get Firebase ID token
    let idToken: string;
    try {
      idToken = await user.getIdToken();
    } catch (tokenError) {
      const errorMsg = "Authentication error. Please try logging in again.";
      console.error("[markInvoicePaid] Failed to get ID token:", tokenError);
      onError?.(errorMsg);
      return false;
    }

    if (!idToken) {
      const errorMsg = "Failed to get authentication token. Please try logging in again.";
      console.error("[markInvoicePaid] ID token is missing");
      onError?.(errorMsg);
      return false;
    }

    // Call API with Authorization header
    const response = await fetch(`/api/invoices/${invoiceId}/mark-paid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
    });

    // Parse response
    let data: { ok?: boolean; error?: string; message?: string };
    try {
      data = await response.json() as { ok?: boolean; error?: string; message?: string };
    } catch {
      // If JSON parse fails, check status
      if (response.status === 401) {
        const errorMsg = "Authentication failed. Please try logging in again.";
        console.error("[markInvoicePaid] 401 Unauthorized - token may be invalid");
        onError?.(errorMsg);
        return false;
      }
      if (!response.ok) {
        const errorMsg = "Failed to mark invoice as paid";
        onError?.(errorMsg);
        return false;
      }
      // Success but no JSON body
      onSuccess?.();
      return true;
    }

    if (!response.ok) {
      // Handle 401 specifically
      if (response.status === 401) {
        const errorMsg = data.message || data.error || "Authentication failed. Please try logging in again.";
        console.error("[markInvoicePaid] 401 Unauthorized:", errorMsg);
        onError?.(errorMsg);
        return false;
      }
      
      // Other errors
      const errorMessage = data.message || data.error || "Failed to mark invoice as paid";
      onError?.(errorMessage);
      return false;
    }

    // Success
    onSuccess?.();
    return true;
  } catch (error) {
    // Network or other error
    const errorMessage = error instanceof Error ? error.message : "Failed to mark as paid. Please try again.";
    console.error("[markInvoicePaid] Error:", error);
    onError?.(errorMessage);
    return false;
  }
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
    // Use emailEvents collection instead of subcollection to avoid permission issues
    // emailEvents has invoiceId field, so we can query by that
    const eventsRef = collection(db, "emailEvents");
    const q = query(
      eventsRef,
      where("invoiceId", "==", invoiceId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const events: ChaseEvent[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          // Map emailEvents to ChaseEvent format for compatibility
          events.push({
            id: doc.id,
            invoiceId: invoiceId,
            createdAt: data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || new Date().toISOString(),
            toEmail: data.originalTo || data.to || "",
            type: data.type === "invoice_initial" || data.type === "invoice_reminder" || data.type === "invoice_due" || data.type === "invoice_late_weekly"
              ? "reminder"
              : (data.type || "reminder"),
            dryRun: data.dryRun || false,
          });
        });
        callback(events);
      },
      (error: unknown) => {
        // Handle permission errors gracefully
        const errorCode = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorCode === "permission-denied" || errorMessage?.includes("Missing or insufficient permissions")) {
          console.warn("Permission denied for chase events - showing empty list:", error);
          // Return empty array instead of error to prevent page crash
          callback([]);
        } else {
          console.error("Error subscribing to chase events:", error);
          callback([], errorMessage || "Failed to load chase events");
        }
      }
    );

    return unsubscribe;
  } catch (error: unknown) {
    console.error("Error setting up chase events subscription:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCode = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
    // Handle permission errors gracefully
    if (errCode === "permission-denied" || errMsg?.includes("Missing or insufficient permissions")) {
      console.warn("Permission denied for chase events - showing empty list");
      callback([]);
    } else {
      callback([], errMsg || "Failed to set up chase events subscription");
    }
    return () => {};
  }
}
