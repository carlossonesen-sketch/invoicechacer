/**
 * POST /api/account/delete
 * Deletes the authenticated user's account: Firestore docs (business profile, invoices, chaseEvents, stats, emailEvents) and Firebase Auth user.
 * If user has active subscription (subscriptionStatus === "active"), returns 400 and asks to cancel first.
 * Body: { confirm: "DELETE" } to prevent accidents.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import type { Firestore, CollectionReference } from "firebase-admin/firestore";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { getAdminFirestore, getAdminApp, initFirebaseAdmin } from "@/lib/firebase-admin";
import { getInvoicesRef } from "@/lib/invoicePaths";

export const runtime = "nodejs";

const BATCH_SIZE = 400;

async function deleteCollection(
  db: Firestore,
  collectionRef: CollectionReference,
  batchSize: number
): Promise<void> {
  const query = collectionRef.limit(batchSize);
  const snapshot = await query.get();
  if (snapshot.empty) return;
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  if (snapshot.size === batchSize) {
    await deleteCollection(db, collectionRef, batchSize);
  }
}

export async function POST(request: NextRequest) {
  try {
    initFirebaseAdmin();
    const uid = await getAuthenticatedUserId(request);

    let body: { confirm?: string };
    try {
      body = (await request.json()) as { confirm?: string };
    } catch {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Body must be JSON with confirm: 'DELETE'" },
        { status: 400 }
      );
    }
    if (body?.confirm !== "DELETE") {
      return NextResponse.json(
        { error: "CONFIRM_REQUIRED", message: "Type DELETE in the confirmation field to delete your account." },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json({ error: "SERVER_ERROR", message: "Database not initialized" }, { status: 500 });
    }

    const profileRef = db.collection("businessProfiles").doc(uid);
    const profileSnap = await profileRef.get();
    const subscriptionStatus = profileSnap.data()?.subscriptionStatus;

    if (subscriptionStatus === "active") {
      return NextResponse.json(
        { error: "SUBSCRIPTION_ACTIVE", message: "Please cancel your subscription first, then delete your account." },
        { status: 400 }
      );
    }

    // Delete invoices subcollection (and chaseEvents under each invoice)
    const invoicesRef = getInvoicesRef(db, uid);
    const invoicesSnap = await invoicesRef.get();
    for (const invoiceDoc of invoicesSnap.docs) {
      const chaseRef = invoiceDoc.ref.collection("chaseEvents");
      await deleteCollection(db, chaseRef, BATCH_SIZE);
    }
    await deleteCollection(db, invoicesRef, BATCH_SIZE);

    // Delete stats subcollection
    const statsRef = profileRef.collection("stats");
    const statsSnap = await statsRef.get();
    const statsBatch = db.batch();
    statsSnap.docs.forEach((d) => statsBatch.delete(d.ref));
    if (!statsSnap.empty) await statsBatch.commit();

    // Delete business profile doc
    await profileRef.delete();

    // Delete emailEvents where userId == uid
    const emailEventsRef = db.collection("emailEvents");
    let done = false;
    while (!done) {
      const q = emailEventsRef.where("userId", "==", uid).limit(BATCH_SIZE);
      const snap = await q.get();
      if (snap.empty) {
        done = true;
        break;
      }
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (snap.size < BATCH_SIZE) done = true;
    }

    // Delete Firebase Auth user
    const adminAuth = getAuth(getAdminApp());
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ ok: true, message: "Account deleted." });
  } catch (e) {
    const err = e as Error;
    if (err.message?.startsWith("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED", message: err.message }, { status: 401 });
    }
    console.error("[account/delete]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: err.message || "Failed to delete account" },
      { status: 500 }
    );
  }
}
