/**
 * Delete specific test users from Firebase Auth and Firestore.
 *
 * Run locally with GOOGLE_APPLICATION_CREDENTIALS pointing to a service account JSON.
 * Requires ALLOW_DELETE_TEST_USERS=YES in the environment.
 *
 * Usage (PowerShell):
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\serviceAccountKey.json"
 *   $env:ALLOW_DELETE_TEST_USERS="YES"
 *   npm run delete:test-users
 */

import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, type Firestore, type DocumentReference, type CollectionReference } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const TEST_UIDS = [
  "OBBlPCpfNfcrIkBxNvMDMKr6gvj1",
  "QnsDtGijSxfdqLnUSq4qj1DseB12",
  "U8fuT9vzWXT84Xun7myE0TPxQG22",
  "JvFadmBRC0TXgfLOpwT4V54HqNN2",
  "cnzRdehmuEhu9HUH9ln57qkAtdN2",
  "dcT1y984Q4arySAE50gcEZeAb4M2",
];

function initFirebaseWithADC(): { db: Firestore; auth: ReturnType<typeof getAuth> } {
  if (getApps().length > 0) {
    const app = getApps()[0];
    return {
      db: getFirestore(app),
      auth: getAuth(app),
    };
  }
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: "invoicechaser-crsac",
  });
  return {
    db: getFirestore(app),
    auth: getAuth(app),
  };
}

/** Recursively delete all documents in a collection and their subcollections. */
async function deleteCollection(db: Firestore, ref: CollectionReference): Promise<number> {
  const snapshot = await ref.limit(500).get();
  if (snapshot.empty) return 0;
  let deleted = 0;
  for (const doc of snapshot.docs) {
    deleted += await deleteDocumentRecursive(db, doc.ref);
  }
  deleted += await deleteCollection(db, ref);
  return deleted;
}

/** Delete a document and all of its subcollections recursively. Returns total docs deleted (subcollections + this doc). */
async function deleteDocumentRecursive(db: Firestore, docRef: DocumentReference): Promise<number> {
  const docSnap = await docRef.get();
  if (!docSnap.exists) return 0;
  let count = 0;
  const subcollections = await docRef.listCollections();
  for (const sub of subcollections) {
    count += await deleteCollection(db, sub);
  }
  await docRef.delete();
  return count + 1;
}

/** Delete user-related Firestore data: businessProfiles/{uid} and users/{uid} (and subcollections). */
async function deleteUserFirestore(db: Firestore, uid: string): Promise<{ businessProfiles: number; users: number }> {
  let businessProfilesDeleted = 0;
  let usersDeleted = 0;

  const bpRef = db.collection("businessProfiles").doc(uid);
  const bpSnap = await bpRef.get();
  if (bpSnap.exists) {
    businessProfilesDeleted = await deleteDocumentRecursive(db, bpRef);
  }

  const usersRef = db.collection("users").doc(uid);
  const usersSnap = await usersRef.get();
  if (usersSnap.exists) {
    usersDeleted = await deleteDocumentRecursive(db, usersRef);
  }

  return { businessProfiles: businessProfilesDeleted, users: usersDeleted };
}

async function main(): Promise<void> {
  if (process.env.ALLOW_DELETE_TEST_USERS !== "YES") {
    console.error("ERROR: ALLOW_DELETE_TEST_USERS is not set to YES. Refusing to run.");
    console.error("Set it before running, e.g.:");
    console.error('  $env:ALLOW_DELETE_TEST_USERS="YES"');
    console.error("  npm run delete:test-users");
    process.exit(1);
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set.");
    console.error("Point it to your service account JSON, e.g.:");
    console.error('  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\serviceAccountKey.json"');
    process.exit(1);
  }

  const { db, auth } = initFirebaseWithADC();
  const results: { uid: string; firestore: { businessProfiles: number; users: number }; auth: "deleted" | "skipped" | "error"; error?: string }[] = [];

  console.log(`Deleting ${TEST_UIDS.length} test user(s)...\n`);

  for (const uid of TEST_UIDS) {
    console.log(`--- ${uid} ---`);
    const firestoreResult = { businessProfiles: 0, users: 0 };
    let authResult: "deleted" | "skipped" | "error" = "skipped";
    let authError: string | undefined;

    try {
      const fs = await deleteUserFirestore(db, uid);
      firestoreResult.businessProfiles = fs.businessProfiles;
      firestoreResult.users = fs.users;
      console.log(`  Firestore: businessProfiles=${fs.businessProfiles}, users=${fs.users}`);
    } catch (e) {
      console.error(`  Firestore error:`, e);
      results.push({ uid, firestore: firestoreResult, auth: "error", error: e instanceof Error ? e.message : String(e) });
      continue;
    }

    try {
      await auth.deleteUser(uid);
      authResult = "deleted";
      console.log(`  Auth: deleted`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("not found") || (e as { code?: string })?.code === "auth/user-not-found") {
        authResult = "skipped";
        console.log(`  Auth: user not found (skipped)`);
      } else {
        authResult = "error";
        authError = msg;
        console.error(`  Auth error:`, e);
      }
    }

    results.push({ uid, firestore: firestoreResult, auth: authResult, error: authError });
    console.log("");
  }

  // Summary
  const authDeleted = results.filter((r) => r.auth === "deleted").length;
  const authSkipped = results.filter((r) => r.auth === "skipped").length;
  const authErrors = results.filter((r) => r.auth === "error").length;
  const totalFs = results.reduce((acc, r) => acc + r.firestore.businessProfiles + r.firestore.users, 0);

  console.log("--- Summary ---");
  console.log(`Firestore docs deleted: ${totalFs}`);
  console.log(`Auth users deleted: ${authDeleted}, skipped (not found): ${authSkipped}, errors: ${authErrors}`);
  if (authErrors > 0) {
    results.filter((r) => r.auth === "error").forEach((r) => console.log(`  ${r.uid}: ${r.error ?? "unknown"}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
