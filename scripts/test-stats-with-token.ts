/**
 * DEV-ONLY: Call GET /api/stats/summary with a Firebase ID token.
 * Set TEST_FIREBASE_ID_TOKEN before running (or in .env.local). Do not commit the token.
 */

import fs from "fs";
import path from "path";

// Load .env.local into process.env (avoids dotenv dependency)
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^TEST_FIREBASE_ID_TOKEN=(.*)$/);
    if (m) {
      const v = m[1].trim().replace(/^["']|["']$/g, "");
      if (v) process.env.TEST_FIREBASE_ID_TOKEN = v;
      break;
    }
  }
}

async function main() {
  const token = process.env.TEST_FIREBASE_ID_TOKEN;
  if (!token || typeof token !== "string" || token.trim() === "") {
    console.error("ERROR: TEST_FIREBASE_ID_TOKEN is not set.");
    console.error("Set it before running, e.g.:");
    console.error('  $env:TEST_FIREBASE_ID_TOKEN="<your-token>"; npm run test:stats');
    process.exit(1);
  }

  const url = "http://localhost:3000/api/stats/summary";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  const text = await res.text();

  if (!res.ok) {
    console.error("Request failed:", res.status, res.statusText);
    console.error("Body:", text);
    process.exit(1);
  }

  try {
    const json = JSON.parse(text) as unknown;
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(text);
  }
}

main().catch(() => process.exit(1));
