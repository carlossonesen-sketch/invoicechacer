import "../src/lib/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function main() {
  const db = getFirestore();
  const snap = await db.collection("invoices").limit(10).get();
  console.log("Latest invoices:");
  snap.forEach(d => console.log(d.id));
}

main().catch(e => { console.error(e); process.exit(1); });
