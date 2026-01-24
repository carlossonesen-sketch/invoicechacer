# Production Verification Checklist – Invoice Chaser Web

Use this before and after deploying to Vercel Production. Focus: **stats/paid tracking**, **Firestore rules/indexes**, and **email dry-run**.

---

## 1. Stats / paid tracking

- [ ] **`onInvoiceWrite` Cloud Function**  
  - Trigger path: `businessProfiles/{uid}/invoices/{invoiceId}`  
  - Deployed: `firebase deploy --only functions`  
  - On create/update/delete of an invoice, it updates `businessProfiles/{uid}/stats/summary`.

- [ ] **Stats/summary doc**  
  - Path: `businessProfiles/{uid}/stats/summary`  
  - Expected fields (or zeros): `pendingCount`, `outstandingTotalCents`, `paidCountTotal`, `collectedTotalCents`, `paidCountThisMonth`, `collectedThisMonthCents`, `lastUpdatedAt`.

- [ ] **Mark paid flow**  
  - `POST /api/invoices/[invoiceId]/mark-paid` writes `status=paid`, `paidAt`, `paidAmountCents`, `paidMonthKey` and a `chaseEvents` subcollection event.  
  - After mark-paid, `onInvoiceWrite` runs and updates stats (decrement pending/outstanding, increment paid/collected).

- [ ] **Dashboard Payments section**  
  - `GET /api/stats/summary` returns the stats; dashboard shows Collected this month, Collected all-time, Outstanding, Paid count this month.  
  - Create invoice → mark paid → confirm numbers update and match expectations.

- [ ] **Invoice path**  
  - New/updated invoices live under `businessProfiles/{uid}/invoices/{invoiceId}`.  
  - If you still have top-level `invoices`, run `npm run migrate:invoices` with `MIGRATE_UID` set; confirm no double-counting in stats after migration.

---

## 2. Firestore rules

- [ ] **Deploy rules**  
  - `firebase deploy --only firestore:rules`

- [ ] **`businessProfiles/{uid}`**  
  - `read, write`: `request.auth != null && request.auth.uid == uid`

- [ ] **`businessProfiles/{uid}/invoices/{invoiceId}`**  
  - `read, write`: `request.auth != null && request.auth.uid == uid`

- [ ] **`businessProfiles/{uid}/stats/{docId}`**  
  - `read`: `request.auth != null && request.auth.uid == uid`  
  - `write`: same (client); server/Admin SDK bypasses rules.

- [ ] **Legacy `invoices/{invoiceId}`** (if still used)  
  - `read` / `update` / `delete`: `isOwner` (resource.data.userId == request.auth.uid)  
  - `create`: `isOwnerCreate` (request.resource.data.userId == request.auth.uid)

- [ ] **Smoke test**  
  - Logged-in user can read/write own `businessProfiles/{uid}`, `businessProfiles/{uid}/invoices`, `businessProfiles/{uid}/stats`.  
  - Logged-out or wrong-uid requests are denied.

---

## 3. Firestore indexes

- [ ] **Deploy indexes**  
  - `firebase deploy --only firestore:indexes`

- [ ] **Required for app**  
  - `businessProfiles/{uid}/invoices`: `createdAt` (desc) for list/pagination.  
  - `collectionGroup` `invoices`: `(status, dueAt)` for `process-emails` (if used).  
  - `emailEvents`: `(userId, createdAt)`, `(invoiceId, createdAt desc)`, etc. per `firestore.indexes.json`.

- [ ] **No index errors in Production**  
  - In browser console and in Vercel logs, no `failed-precondition` or “index required” for the above queries.

---

## 4. Email dry-run and toggles

- [ ] **Before going live with real email**  
  - `EMAIL_SENDING_ENABLED=false` or `EMAIL_DRY_RUN=true` and/or `AUTOCHASE_DRY_RUN=true` so no real mail is sent.

- [ ] **`emailEvents` in dry-run**  
  - Sends are logged with `dryRun: true`; `emailEvents` documents are created.  
  - Confirm in Firestore that `emailEvents` has entries and `dryRun` is set when dry-run is on.

- [ ] **When enabling real email**  
  - Set `EMAIL_SENDING_ENABLED=true`, `EMAIL_DRY_RUN=false`, `AUTOCHASE_DRY_RUN=false` only after reviewing allowlists and rate limits.  
  - Set `ALLOWED_RECIPIENT_DOMAINS` and `TEST_REDIRECT_EMAIL` as needed for staging/test.

- [ ] **Cron / process-emails**  
  - If you call `POST /api/invoices/process-emails` from a cron, ensure the same dry-run and email toggles apply there.

---

## 5. Vercel Production

- [ ] **Env vars**  
  - All required Production env vars set in Vercel (see “Required Vercel Production env vars” in the repo).  
  - `FIREBASE_SERVICE_ACCOUNT_KEY` is the full JSON (or equivalent) for the same project as `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.

- [ ] **`NEXT_PUBLIC_DEV_TOOLS`**  
  - `0` or unset in Production (dev-only logging off).

- [ ] **Post-deploy smoke test**  
  - Create invoice → mark paid → check Dashboard Payments and `businessProfiles/{uid}/stats/summary`.  
  - Trigger one send (with dry-run on) and confirm `emailEvents` and no real outbound mail.

---

## Quick reference

| Area           | Command / action |
|----------------|------------------|
| Rules          | `firebase deploy --only firestore:rules` |
| Indexes        | `firebase deploy --only firestore:indexes` |
| Functions      | `firebase deploy --only functions` |
| Migrate invoices | `MIGRATE_UID=<uid> npm run migrate:invoices` |
