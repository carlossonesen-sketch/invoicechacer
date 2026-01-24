/**
 * Migrate invoices from top-level collection "invoices" to
 * businessProfiles/{uid}/invoices (canonical scoped path).
 *
 * Usage:
 *   MIGRATE_UID=<firebase-uid> npx tsx scripts/migrate-invoices-to-scoped.ts
 *   # or with .env.local: MIGRATE_UID=xxx
 *
 * - Reads: invoices where userId == MIGRATE_UID
 * - Writes: businessProfiles/{MIGRATE_UID}/invoices/{sameDocId} (set to preserve id)
 * - Idempotent: skips if destination doc already exists
 * - Prints migrated and skipped counts
 */

import fs from "fs";
import path from "path";

// Load MIGRATE_UID from .env.local if present
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^MIGRATE_UID=(.*)$/);
    if (m) {
      const v = m[1].trim().replace(/^["']|["']$/g, "");
      if (v) process.env.MIGRATE_UID = v;
      break;
    }
  }
}

async function main() {
  const uid = process.env.MIGRATE_UID?.trim();
  if (!uid) {
    console.error("ERROR: MIGRATE_UID is not set.");
    console.error("Set it before running, e.g.:");
    console.error('  $env:MIGRATE_UID="your-firebase-uid"; npm run migrate:invoices');
    console.error("Or add MIGRATE_UID=... to .env.local");
    process.exit(1);
  }

  // Dynamic import to ensure init runs in right order (firebase-admin first)
  const { initFirebaseAdmin, getAdminFirestore } = await import("../src/lib/firebase-admin");
  const { getInvoiceRef } = await import("../src/lib/invoicePaths");

  initFirebaseAdmin();
  const db = getAdminFirestore();

  const snap = await db.collection("invoices").where("userId", "==", uid).get();
  let migrated = 0;
  let skipped = 0;

  for (const d of snap.docs) {
    const destRef = getInvoiceRef(db, uid, d.id);
    const exists = await destRef.get();
    if (exists.exists) {
      skipped++;
      continue;
    }
    const data = d.data();
    await destRef.set({ ...data, userId: uid });
    migrated++;
  }

  console.log(`Migrated: ${migrated}, Skipped (already exist): ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
