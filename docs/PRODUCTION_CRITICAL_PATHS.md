# Production-Critical Paths & Verification

Review of server-side limits, paid-tier behavior, email failure safety, and HTTP status codes.

---

## 1. Production-critical paths

| Path | Auth | Limits | Notes |
|------|------|--------|-------|
| `POST /api/invoices/create` | `getAuthenticatedUserId` (401) | `getPlanForUser` → `maxPendingInvoices` for trial | Unpaid = pending + overdue. Paid: `Infinity`. |
| `POST /api/invoices/send-initial-email` | `getAuthenticatedUserId` (401) | `sendEmailSafe` → `assertEmailLimits` | All email sends go through `sendEmailSafe`. |
| `POST /api/invoices/send-reminder-email` | `getAuthenticatedUserId` (401) | same | |
| `POST /api/invoices/send-due-email` | `getAuthenticatedUserId` (401) | same | |
| `POST /api/invoices/send-late-email` | `getAuthenticatedUserId` (401) | same; `weekNumber` 1–8 in route, 1–3 for trial in `assertEmailLimits` | |
| `POST /api/invoices/process-emails` | **None** | `sendInvoiceEmail` → `sendEmailSafe` → `assertEmailLimits` | Cron; consider `x-cron-secret` or similar. |
| `POST /api/invoices/[id]/mark-paid` | Bearer/session | N/A | |
| `GET /api/stats/summary` | Bearer/session | N/A | |

---

## 2. Trial limits enforced server-side

**Plan resolution:** `getPlanForUser(userId)` in `lib/billing/plan.ts`

- Reads `businessProfiles/{userId}.plan`, else `users/{userId}.plan`, else **`"trial"`**.
- If `getAdminFirestore()` is null: returns **`"trial"`** (no bypass when Admin fails to init).
- `isValidPlan` restricts to `trial | starter | pro | business`.

**Create (unpaid cap):** `api/invoices/create/route.ts`

- When `status` is `"pending"` or `"overdue"` and `planLimits.maxPendingInvoices !== Infinity`:
  - Counts `status in ["pending","overdue"]` in `businessProfiles/{uid}/invoices`.
  - If `unpaidCount >= maxPendingInvoices` → **403** `TRIAL_PENDING_LIMIT_REACHED`.

**Email limits:** `assertEmailLimits` in `lib/email/emailLimits.ts` (called from `sendEmailSafe`)

- `getPlanForUser` + `getPlanLimits(plan)`.
- **Trial-only block** `if (plan === "trial" && emailType)`:
  - `invoice_initial`, `invoice_reminder`, `invoice_due`: cap 1 each per invoice; **403** `TRIAL_*` when exceeded.
  - `invoice_late_weekly`: `weekNumber` must be 1–3; each week at most 1; total chase emails ≤ 3; **403** `TRIAL_CHASE_LIMIT_REACHED` when exceeded.
- **All plans:**
  - Per-user daily: `min(planLimits.dailyEmailCap, config.maxEmailsPerDayPerUser)` → **429** `MAX_EMAILS_PER_DAY_PER_USER_EXCEEDED`.
  - Global daily: `config.maxEmailsPerDayGlobal` → **429** `MAX_EMAILS_PER_DAY_GLOBAL_EXCEEDED`.
  - Per-invoice cooldown: `planLimits.cooldownMinutes` (or `EMAIL_COOLDOWN_MINUTES_OVERRIDE` only when `NODE_ENV !== "production"`) → **429** `EMAIL_COOLDOWN_ACTIVE`.

---

## 3. Paid tiers bypass trial limits correctly

- **Create:** `planLimits.maxPendingInvoices` is `Infinity` for `starter`, `pro`, `business` → unpaid cap block is skipped.
- **Email:** The trial cap block is `if (plan === "trial" && emailType)`. For `starter`/`pro`/`business` this block is skipped; only daily, global, and cooldown apply, with higher or unlimited plan caps.
- **Cooldown override:** `EMAIL_COOLDOWN_MINUTES_OVERRIDE` is applied only when `NODE_ENV !== "production"`; in production, plan cooldown is always used.

---

## 4. Email sending when limits are hit

**Flow:** Route → `sendInvoiceEmail` → `sendEmailSafe`:

1. **Step 0:** Invoice status !== `"pending"` → **403** `INVOICE_NOT_PENDING` (no send, no `assertEmailLimits`).
2. **Step 1:** `!config.emailSendingEnabled` → early return, write `dryRun` event, **no send**.
3. **Step 2:** `assertAutoChaseAllowed()` → **403** `AUTOCHASE_DISABLED` when `AUTOCHASE_ENABLED` false (and not dev+devtools).
4. **Step 3:** `assertEmailLimits()` → **429** or **403** on limit breach; **no send**.
5. **Step 4:** `applyTestRedirect` → can throw if domain not allowed and `TEST_REDIRECT_EMAIL` unset (see risks).
6. **Step 5:** Dry run → early return, write `dryRun` event, **no send**.
7. **Step 6:** `sendEmailTransport`; on failure, rethrow (no `emailEvent` for failed sends).

So when any limit or guard hits, the send is blocked before `sendEmailTransport`.

**process-emails:** On `sendInvoiceEmail` throw, the route catches, appends to `results.errors`, and continues; batch still returns 200. The failing invoice is not sent.

---

## 5. HTTP status codes

| Code | When |
|------|------|
| **401** | `getAuthenticatedUserId` throws (`UNAUTHORIZED`), or `mapErrorToHttp` sees `UNAUTHORIZED` in message. |
| **403** | `INVOICE_NOT_PENDING`, `TRIAL_*`, `EMAIL_SENDING_DISABLED`, `AUTOCHASE_DISABLED`; create `TRIAL_PENDING_LIMIT_REACHED`; send routes’ explicit 403 for `INVOICE_NOT_PENDING` and “already sent” style 400. |
| **429** | `EMAIL_COOLDOWN_ACTIVE`, `MAX_EMAILS_PER_DAY_PER_USER_EXCEEDED`, `MAX_EMAILS_PER_DAY_GLOBAL_EXCEEDED`. |
| **400** | Validation, “already sent”, missing/invalid body. |
| **404** | “Invoice not found”, `resolveInvoiceRefAndBusinessId` no match. |
| **500** | Unhandled or `mapErrorToHttp` default. |

**ApiError:** Routes use `isApiError(error)` and `error.status`; `mapErrorToHttp` is used for non-`ApiError`. `assertEmailLimits` and `assertAutoChaseAllowed` throw `ApiError` with the correct status.

---

## 6. Fixes applied in this review

- **plan.ts:** When `getAdminFirestore()` is null, return `"trial"` in all envs (was `"starter"` in production) so limits are never bypassed when Admin is down.
- **create route:** Apply `maxPendingInvoices` when creating with `status === "pending"` **or** `status === "overdue"`; count `status in ["pending","overdue"]` toward the cap.

---

## 7. Remaining production risks and edge cases

| Risk | Severity | Notes |
|------|----------|-------|
| **process-emails has no auth** | Medium | Any caller that can reach the URL can trigger batch sends. Recommend `x-cron-secret` (or similar) and reject when missing/invalid. |
| **applyTestRedirect** | Low | If `ALLOWED_RECIPIENT_DOMAINS` is set and recipient domain is not allowed and `TEST_REDIRECT_EMAIL` is unset, throws a plain `Error`. `mapErrorToHttp` maps to **500**. Consider `ApiError(..., 403)` for a clearer “not allowed” signal. |
| **assertAutoChaseAllowed gates all sends** | Low | `AUTOCHASE_ENABLED=false` blocks every send, including manual “Send invoice” (initial). By design it acts as a kill switch; document that it affects both manual and automated sends. |
| **Bulk create** | Low | `createInvoicesBulk` in `lib/invoices.ts` writes via Firestore `addDoc` and does **not** call the create API. `maxPendingInvoices` is not enforced for bulk. |
| **send-late weekNumber 1–8** | Low | Route accepts `weekNumber` 1–8; `assertEmailLimits` only allows 1–3 for trial. Trial users get **403** when 4–8; paid users are fine. |
| **Firestore index for `status in [...]`** | Low | Create route uses `where("status", "in", ["pending","overdue"])`. If an index is required, the runtime error will point to the Firebase console. |
| **Scheduler vs trial** | Info | `invoiceEmailSchedule` can return `invoice_late_weekly` for weeks 1–8; trial is enforced at send time in `assertEmailLimits` (weeks 1–3, total ≤3). No change needed. |

---

## 8. Quick checklist

- [ ] `NEXT_PUBLIC_DEV_TOOLS` unset or `0` in production.
- [ ] `EMAIL_COOLDOWN_MINUTES_OVERRIDE` not used in production (only has effect when `NODE_ENV !== "production"`).
- [ ] `process-emails` called only by a trusted cron with a shared secret (or add `x-cron-secret` and enforce it).
- [ ] `businessProfiles/{uid}.plan` or `users/{uid}.plan` set for paid users (`starter`|`pro`|`business`); unset implies `trial`.
- [ ] `emailEvents` indexes deployed for `userId`+`createdAt`, `invoiceId`+`createdAt`, and `invoiceId`+`type`+`weekNumber` (or equivalent) as used by `emailLimits` and scheduler.
