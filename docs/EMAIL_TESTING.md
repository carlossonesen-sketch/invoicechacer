# Email Testing Setup Guide

This guide explains how to set up Firebase Admin credentials for testing email functionality in the Invoice Chaser web app.

## Prerequisites

- Firebase project with Firestore enabled
- Service account key JSON file from Firebase Console
- PowerShell (for Windows) or ability to run PowerShell scripts

## Step 1: Generate Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the **gear icon** (⚙️) next to "Project Overview" → **"Project settings"**
4. Click the **"Service accounts"** tab
5. Click **"Generate new private key"** button
6. Review the warning dialog and click **"Generate key"**
7. A JSON file will be downloaded (e.g., `your-project-firebase-adminsdk-xxxxx.json`)
8. **Save this file securely** - it contains sensitive credentials

## Step 2: Set Up Environment Variable

### Option A: Using the Automated Script (Recommended)

1. Open PowerShell in the project root directory
2. Run the setup script:
   ```powershell
   .\scripts\setup-admin-env.ps1 -Path "path\to\your\serviceAccountKey.json"
   ```
   
   Example:
   ```powershell
   .\scripts\setup-admin-env.ps1 -Path "C:\Users\YourName\Downloads\invoicechaser-crsac-firebase-adminsdk-xxxxx.json"
   ```

3. The script will:
   - Create a backup of `.env.local` (if it exists) to `.env.local.bak`
   - Add or update `FIREBASE_SERVICE_ACCOUNT_KEY` in `.env.local`
   - Print a preview of the key (first 80 characters)

### Option B: Manual Setup

1. Use the conversion script to generate the key:
   ```powershell
   .\scripts\service-account-to-env.ps1 -Path "path\to\your\serviceAccountKey.json"
   ```

2. Copy the output line that starts with `FIREBASE_SERVICE_ACCOUNT_KEY=`

3. Open `.env.local` in a text editor

4. If `FIREBASE_SERVICE_ACCOUNT_KEY` already exists, replace it. Otherwise, add it:
   ```env
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project",...}
   ```

## Step 3: Configure Email Settings

Add these email configuration variables to `.env.local`:

```env
# Enable email sending (set to true for testing)
EMAIL_SENDING_ENABLED=true
AUTOCHASE_ENABLED=true

# DRY RUN mode (set to true to log emails without sending)
AUTOCHASE_DRY_RUN=true

# Rate limiting
MAX_EMAILS_PER_DAY_PER_USER=25
MAX_EMAILS_PER_DAY_GLOBAL=200
EMAIL_COOLDOWN_MINUTES=60

# Domain allowlist (comma-separated)
ALLOWED_RECIPIENT_DOMAINS=gmail.com,yourdomain.com

# Test redirect email (for non-allowlisted domains)
TEST_REDIRECT_EMAIL=test-inbox@yourdomain.com
```

**Quick Testing (Development Only):**
If you have `NEXT_PUBLIC_DEV_TOOLS=1` set, you can skip setting `EMAIL_SENDING_ENABLED` and `AUTOCHASE_ENABLED` - they will be automatically enabled in development mode.

## Step 4: Restart Dev Server

After updating `.env.local`, restart your development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## Step 5: Test Endpoints

### 1. List Recent Invoices (Dev Only)

Get a list of recent invoice IDs for testing:

```bash
curl http://localhost:3000/api/dev/list-invoices
```

**Expected Response:**
```json
{
  "ids": ["invoice-id-1", "invoice-id-2", ...],
  "invoices": [
    {
      "id": "invoice-id-1",
      "invoiceNumber": "INV-1234",
      "customerName": "John Doe",
      "amount": 50000,
      "status": "pending",
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    ...
  ],
  "count": 20
}
```

**Note:** This endpoint is only available in development mode. In production, it returns 403.

### 2. Send Initial Invoice Email

Send an initial invoice email for a specific invoice:

```bash
curl -X POST http://localhost:3000/api/invoices/send-initial-email \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"YOUR_INVOICE_ID"}'
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Initial invoice email sent"
}
```

**Expected Response (Already Sent):**
```json
{
  "error": "Initial invoice email already sent",
  "alreadySent": true
}
```

**Expected Response (Error):**
```json
{
  "error": "Invoice not found"
}
```

### 3. Process Scheduled Emails

Process all scheduled invoice emails (reminders, due date, late payment):

```bash
curl -X POST http://localhost:3000/api/invoices/process-emails
```

**Expected Response:**
```json
{
  "success": true,
  "processed": 10,
  "sent": 3,
  "skipped": 7,
  "errors": []
}
```

## Troubleshooting

### "Firebase Admin not initialized" Error

- **Check:** Ensure `FIREBASE_SERVICE_ACCOUNT_KEY` is set in `.env.local`
- **Check:** Verify the JSON is valid (use the setup script to regenerate)
- **Check:** Restart the dev server after updating `.env.local`

### "Missing or insufficient permissions" Error

- **Check:** Ensure the service account has Firestore read/write permissions
- **Check:** Verify Firestore security rules allow the service account to access `invoices` and `emailEvents` collections

### "Invalid JSON" Error

- **Check:** Ensure the service account key is a single-line JSON string
- **Fix:** Re-run `setup-admin-env.ps1` to regenerate the key

### Email Not Sending

- **Check:** `EMAIL_SENDING_ENABLED=true` and `AUTOCHASE_ENABLED=true` in `.env.local`
- **OR:** Set `NEXT_PUBLIC_DEV_TOOLS=1` in development mode (auto-enables email sending)
- **Check:** `AUTOCHASE_DRY_RUN=true` will log emails but not send them
- **Check:** Console logs for `[EMAIL DRY RUN]` or `[EMAIL SEND]` messages
- **Check:** Error message will tell you exactly which env var to set

### "Query requires an index" Error

- **Fix:** Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
- **OR:** Click the link in the error message to create the index in Firebase Console
- **Note:** The index definition is already in `firestore.indexes.json`

## Security Notes

- **Never commit** `.env.local` or service account JSON files to version control
- The service account key has full access to your Firestore database
- Keep the service account key secure and rotate it periodically
- In production, set environment variables in Vercel (or your hosting platform) instead of `.env.local`

## Firestore Index Setup

The `/api/invoices/process-emails` endpoint requires a composite Firestore index. Deploy it with:

```bash
firebase deploy --only firestore:indexes
```

The index definition is in `firestore.indexes.json` and includes:
- Collection: `invoices`
- Fields: `status` (ASC), `dueAt` (ASC)

**Note:** If you see a "query requires an index" error, click the link in the error message to create it in the Firebase Console, or deploy the committed index file.

## Next Steps

- Set up a cron job to call `/api/invoices/process-emails` every 15-30 minutes
- Replace `fakeEmailSend()` in `src/lib/email/sendEmailSafe.ts` with your actual email provider (SendGrid, SES, etc.)
- Configure production email settings in Vercel environment variables
