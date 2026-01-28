"use client";

import { collection, query, where, orderBy, limit, getDocs, onSnapshot, doc, onSnapshot as onDocSnapshot, updateDoc, Timestamp, serverTimestamp, addDoc, writeBatch, QuerySnapshot, DocumentData, QueryDocumentSnapshot, startAfter } from "firebase/firestore";
import { db, auth } from "./firebase";
import { logFirestoreInstrumentation } from "./firestoreInstrumentation";
import { toJsDate } from "./dates";
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

/** Single rule for "paid": status === "paid" OR paidAt exists */
export function invoiceIsPaid(inv: FirestoreInvoice): boolean {
  return inv.status === "paid" || !!inv.paidAt;
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

    // Convert Timestamp to ISO string if needed (handles Timestamp, string, number, {seconds} objects)
    const dueDate = toJsDate(invoice.dueAt);
    if (dueDate) invoice.dueAt = dueDate.toISOString();
    const createdDate = toJsDate(invoice.createdAt);
    if (createdDate) invoice.createdAt = createdDate.toISOString();
    const lastChasedDate = toJsDate(invoice.lastChasedAt);
    if (lastChasedDate) invoice.lastChasedAt = lastChasedDate.toISOString();
    const nextChaseDate = toJsDate(invoice.nextChaseAt);
    if (nextChaseDate) invoice.nextChaseAt = nextChaseDate.toISOString();
    const updatedDate = toJsDate(invoice.updatedAt);
    if (updatedDate) invoice.updatedAt = updatedDate.toISOString();

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
    const invoicesRef = collection(db, "businessProfiles", user.uid, "invoices");
    const q = query(
      invoicesRef,
      orderBy("createdAt", "desc"),
      limit(pageLimit)
    );

    if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
      const queryPath = `businessProfiles/${user?.uid ?? "?"}/invoices`;
      console.log("[DEV invoices sub] function: subscribeToUserInvoices user?.uid:", user?.uid, "!!user:", !!user, "auth?.currentUser?.uid:", auth?.currentUser?.uid, "queryPath:", queryPath);
    }

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
        logFirestoreInstrumentation("invoices:subscribeToUserInvoices", error, {
          queryPath: `businessProfiles/${user?.uid ?? "?"}/invoices`,
        });

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
    logFirestoreInstrumentation("invoices:subscribeToUserInvoices setup", error, {
      queryPath: `businessProfiles/${user?.uid ?? "?"}/invoices`,
    });
    callback({
      invoices: [],
      error: error instanceof Error ? error.message : "Failed to set up invoice subscription",
    });
    return () => {};
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

  if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
    console.log("[DEV fetchNextPageOfInvoices] function: fetchNextPageOfInvoices uid:", user.uid);
  }

  try {
    const invoicesRef = collection(db, "businessProfiles", user.uid, "invoices");
    const q = query(
      invoicesRef,
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
    logFirestoreInstrumentation("invoices:fetchNextPageOfInvoices", error, {
      queryPath: `businessProfiles/${user?.uid ?? "?"}/invoices`,
    });
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

    const invoicesRef = collection(db, "businessProfiles", user.uid, "invoices");
    const q = query(
      invoicesRef,
      orderBy("createdAt", "desc")
    );

    const querySnapshot = await getDocs(q);
    const invoices = convertSnapshotToInvoices(querySnapshot, user);
    const hasMissingCreatedAt = invoices.some(inv => !inv.createdAt || inv.createdAt === new Date().toISOString());

    return { invoices, hasMissingCreatedAt };
  } catch (error: unknown) {
    logFirestoreInstrumentation("invoices:getUserInvoices", error, {
      queryPath: `businessProfiles/${user?.uid ?? "?"}/invoices`,
    });
    const err = error instanceof Error ? error : new Error(String(error));
    const errMsg = err.message;
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
    invoiceNumber?: string;
    autoChaseEnabled?: boolean;
    autoChaseDays?: number;
    maxChases?: number;
  }
): Promise<string> {
  const idToken = await user.getIdToken();
  const res = await fetch("/api/invoices/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      customerName: invoiceData.customerName,
      customerEmail: invoiceData.customerEmail,
      amount: invoiceData.amount,
      dueAt: invoiceData.dueAt,
      status: invoiceData.status,
      notes: invoiceData.notes || undefined,
      paymentLink: invoiceData.paymentLink || undefined,
      invoiceNumber: invoiceData.invoiceNumber || undefined,
      autoChaseEnabled: invoiceData.autoChaseEnabled ?? false,
      autoChaseDays: invoiceData.autoChaseDays ?? null,
      maxChases: invoiceData.maxChases ?? null,
    }),
  });

  /** Typed response: success has invoiceId; error has error + message (e.g. TRIAL_PENDING_LIMIT_REACHED). */
  const data = (await res.json().catch(() => ({}))) as { invoiceId?: string; error?: string; message?: string; redirectTo?: string };

  if (!res.ok) {
    const err = new Error(data.message || "Failed to create invoice.") as Error & { code?: string; status?: number; redirectTo?: string };
    if (data.error) err.code = data.error;
    if (data.redirectTo) err.redirectTo = data.redirectTo;
    err.status = res.status; // 401 auth, 403 plan/permission, 429 rate limit
    throw err;
  }

  if (!data.invoiceId || typeof data.invoiceId !== "string") {
    throw new Error("Invalid response: missing invoiceId");
  }

  return data.invoiceId;
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

  const invoicesRef = collection(db, "businessProfiles", user.uid, "invoices");
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

  // Convert Timestamp to ISO string if needed (handles Timestamp, string, number, {seconds} objects)
  const dueDate = toJsDate(invoice.dueAt);
  if (dueDate) invoice.dueAt = dueDate.toISOString();
  const createdDate = toJsDate(invoice.createdAt);
  if (createdDate) invoice.createdAt = createdDate.toISOString();
  const lastChasedDate = toJsDate(invoice.lastChasedAt);
  if (lastChasedDate) invoice.lastChasedAt = lastChasedDate.toISOString();
  const nextChaseDate = toJsDate(invoice.nextChaseAt);
  if (nextChaseDate) invoice.nextChaseAt = nextChaseDate.toISOString();
  const updatedDate = toJsDate(invoice.updatedAt);
  if (updatedDate) invoice.updatedAt = updatedDate.toISOString();

  return invoice;
}

export function subscribeToInvoice(
  uid: string,
  invoiceId: string,
  callback: (invoice: FirestoreInvoice | null, error?: string) => void
): () => void {
  if (!db) {
    callback(null, "Firebase not initialized. Please check your environment variables.");
    return () => {};
  }

  try {
    const invoiceRef = doc(db, "businessProfiles", uid, "invoices", invoiceId);

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
        logFirestoreInstrumentation("invoices:subscribeToInvoice", error, {
          docPath: `businessProfiles/${uid}/invoices/${invoiceId}`,
        });
        const errorCode = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorCode === "permission-denied" || errorMessage?.includes("permission") || errorMessage?.includes("insufficient")) {
          callback(null, "Permission denied: You don't have access to this invoice (or it no longer exists).");
        } else {
          callback(null, errorMessage || "Failed to load invoice");
        }
      }
    );

    return unsubscribe;
  } catch (error: unknown) {
    logFirestoreInstrumentation("invoices:subscribeToInvoice setup", error, {
      docPath: `businessProfiles/${uid}/invoices/${invoiceId}`,
    });
    callback(null, error instanceof Error ? error.message : "Failed to set up invoice subscription");
    return () => {};
  }
}


export async function updateInvoice(
  uid: string,
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

  const invoiceRef = doc(db, "businessProfiles", uid, "invoices", invoiceId);

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
      // If JSON parse fails, still handle standard status codes
      if (response.status === 401) {
        onError?.("Authentication failed. Please try logging in again.");
        return false;
      }
      if (response.status === 429) {
        onError?.("Too many requests. Please try again later.");
        return false;
      }
      if (response.status === 403) {
        onError?.("You don't have permission to update this invoice.");
        return false;
      }
      if (!response.ok) {
        onError?.("Failed to mark invoice as paid");
        return false;
      }
      onSuccess?.();
      return true;
    }

    if (!response.ok) {
      if (response.status === 401) {
        const errorMsg = data.message || data.error || "Authentication failed. Please try logging in again.";
        console.error("[markInvoicePaid] 401 Unauthorized:", errorMsg);
        onError?.(errorMsg);
        return false;
      }
      if (response.status === 429) {
        onError?.("Too many requests. Please try again later.");
        return false;
      }
      if (response.status === 403) {
        onError?.(data.message || data.error || "You don't have permission to update this invoice.");
        return false;
      }
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

export async function triggerChaseNow(uid: string, invoiceId: string): Promise<void> {
  if (!db) {
    throw new Error("Firebase not initialized. Please check your environment variables.");
  }

  const invoiceRef = doc(db, "businessProfiles", uid, "invoices", invoiceId);

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
            createdAt: (() => {
              const date = toJsDate(data.createdAt);
              return date ? date.toISOString() : new Date().toISOString();
            })(),
            toEmail: data.originalTo || data.to || "",
            type: data.type === "invoice_initial" || data.type === "invoice_updated" || data.type === "invoice_reminder" || data.type === "invoice_due" || data.type === "invoice_late_weekly"
              ? "reminder"
              : (data.type || "reminder"),
            dryRun: data.dryRun || false,
          });
        });
        callback(events);
      },
      (error: unknown) => {
        const errorCode = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isPermissionOrAuth =
          errorCode === "permission-denied" ||
          errorCode === "unauthenticated" ||
          errorMessage?.includes("Missing or insufficient permissions");

        if (isPermissionOrAuth) {
          unsubscribe();
          callback([]);
          if (process.env.NODE_ENV !== "production") {
            console.log("[chaseEvents] permission-denied or unauthenticated, unsubscribed (silent)");
          }
          return;
        }
        logFirestoreInstrumentation("invoices:subscribeToChaseEvents", error, { queryPath: "emailEvents" });
        callback([], errorMessage || "Failed to load chase events");
      }
    );

    return unsubscribe;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCode = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
    const isPermissionOrAuth =
      errCode === "permission-denied" ||
      errCode === "unauthenticated" ||
      errMsg?.includes("Missing or insufficient permissions");
    if (isPermissionOrAuth) {
      callback([]);
      if (process.env.NODE_ENV !== "production") {
        console.log("[chaseEvents] setup permission-denied or unauthenticated (silent)");
      }
    } else {
      logFirestoreInstrumentation("invoices:subscribeToChaseEvents setup", error, { queryPath: "emailEvents" });
      callback([], errMsg || "Failed to set up chase events subscription");
    }
    return () => {};
  }
}
