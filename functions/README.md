# Invoice Chaser Cloud Functions

This directory contains Firebase Cloud Functions for Invoice Chaser.

## Functions

### `onInvoiceWrite`

Triggers on any write (create, update, delete) to documents in the `invoices` collection.

**Path:** `invoices/{invoiceId}`

**Purpose:** Automatically updates the stats summary document at `businessProfiles/{userId}/stats/summary` using atomic increments.

**Handles:**
- **Invoice Creation:** Increments pending/outstanding or paid/collected counts based on initial status
- **Invoice Deletion:** Decrements all relevant counters
- **Status Changes:**
  - `pending` → `paid`: Decrements pending/outstanding, increments paid/collected (and "this month" if paidAt is in current month)
  - `paid` → `pending`: Reverses the above
- **Amount Changes:** Adjusts outstanding (if pending) or collected (if paid) amounts
- **paidAt Changes:** Updates "this month" stats when paidAt moves into/out of current month

**Stats Fields Updated:**
- `collectedTotalCents`: Total amount collected (all time)
- `collectedThisMonthCents`: Amount collected in current month (YYYY-MM)
- `outstandingTotalCents`: Total amount outstanding (pending invoices)
- `paidCountTotal`: Total number of paid invoices (all time)
- `paidCountThisMonth`: Number of invoices paid in current month
- `pendingCount`: Number of pending/overdue invoices
- `lastUpdatedAt`: Server timestamp of last update

## Development

### Prerequisites

- Node.js 20+
- Firebase CLI installed globally: `npm install -g firebase-tools`
- Firebase project configured

### Setup

1. Install dependencies:
```bash
cd functions
npm install
```

2. Build TypeScript:
```bash
npm run build
```

### Local Testing

Run the Firebase emulator:
```bash
npm run serve
```

This will start the emulator with functions enabled.

### Deployment

Deploy all functions:
```bash
npm run deploy
```

Or deploy from the project root:
```bash
firebase deploy --only functions
```

Deploy a specific function:
```bash
firebase deploy --only functions:onInvoiceWrite
```

### Viewing Logs

```bash
npm run logs
```

Or:
```bash
firebase functions:log
```

## Notes

- The function uses atomic increments (`FieldValue.increment()`) to ensure thread-safe updates
- All operations are idempotent (safe to retry)
- The function uses before/after snapshots to determine what changed
- "This month" is calculated based on the `paidAt` timestamp using YYYY-MM format
- The function handles edge cases like missing data, null values, and status transitions
