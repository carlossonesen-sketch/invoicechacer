# Invoice Chaser Web

A web-first Invoice Chaser MVP built with Next.js (App Router), TypeScript, and Tailwind CSS, integrated with Firebase Auth and Firestore.

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun
- Firebase project (shared with the Flutter app)

### Local Setup

1. **Copy environment template:**
   ```bash
   cp .env.example .env.local
   ```

2. **Fill in Firebase credentials:**
   - Go to [Firebase Console](https://console.firebase.google.com/) → Project Settings → Your apps
   - Copy the web app config values to `.env.local` (all `NEXT_PUBLIC_FIREBASE_*` variables)
   - Go to Project Settings → Service Accounts → Generate New Private Key
   - Copy the entire JSON and paste as a single line for `FIREBASE_SERVICE_ACCOUNT_KEY`

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

### Environment Variables

The `.env.local` file is gitignored and should never be committed. See the detailed setup steps below for obtaining Firebase credentials.

#### Step 1: Get Firebase Web App Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Click the **gear icon** (⚙️) next to "Project Overview" and select **"Project settings"**
4. Scroll down to the **"Your apps"** section
5. If you don't have a web app yet:
   - Click **"Add app"** and select the **web icon** (</>)
   - Register your app with a nickname (e.g., "Invoice Chaser Web")
   - Click **"Register app"**
6. You'll see your Firebase configuration object. Copy these values to `.env.local`:

   - `apiKey` → `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `authDomain` → `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `projectId` → `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `storageBucket` → `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `messagingSenderId` → `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `appId` → `NEXT_PUBLIC_FIREBASE_APP_ID`

   Example:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyExample1234567890
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=my-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=my-project
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=my-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
   NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abc123def456
   ```

#### Step 2: Generate Service Account Key

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Click the **"Service accounts"** tab
3. Click **"Generate new private key"** button
4. Review the warning dialog and click **"Generate key"**
5. A JSON file (e.g., `your-project-firebase-adminsdk-xxxxx.json`) will be downloaded

#### Step 3: Convert Service Account JSON to Environment Variable

**Option A: Using the Automated Setup Script (Recommended)**

1. Open PowerShell in the project root directory
2. Run the setup script (it will automatically update `.env.local`):
   ```powershell
   .\scripts\setup-admin-env.ps1 -Path "path\to\your\serviceAccountKey.json"
   ```
3. The script will:
   - Create a backup of `.env.local` (if it exists) to `.env.local.bak`
   - Add or update `FIREBASE_SERVICE_ACCOUNT_KEY` in `.env.local`
   - Show a preview of the key (first 80 characters)

**Option B: Using the Conversion Script (Manual)**

1. Open PowerShell in the project root directory
2. Run the helper script:
   ```powershell
   .\scripts\service-account-to-env.ps1 -Path "path\to\your\serviceAccountKey.json"
   ```
3. The script will output a single-line string. Copy it and paste it as the value for `FIREBASE_SERVICE_ACCOUNT_KEY` in `.env.local`

**Option C: Manual conversion**

1. Open the downloaded JSON file in a text editor
2. Remove all newlines and extra spaces to make it a single line
3. Copy the entire JSON object and paste it as the value for `FIREBASE_SERVICE_ACCOUNT_KEY` in `.env.local`

   Example:
   ```env
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"my-project","private_key_id":"abc123",...}
   ```

**Important:** Never commit `.env.local` or the service account JSON file to version control. They contain sensitive credentials.

## Email Testing Setup

For testing email functionality (invoice emails, reminders, etc.), see [docs/EMAIL_TESTING.md](docs/EMAIL_TESTING.md) for detailed instructions on:
- Setting up Firebase Admin credentials
- Configuring email environment variables
- Testing email endpoints

### Email Testing Endpoints

Dev-only endpoints for production testing of invoice emails. All endpoints require `EMAIL_SENDING_ENABLED=true` (or `NEXT_PUBLIC_DEV_TOOLS=1` in dev mode).

**PowerShell commands to test each endpoint:**

```powershell
# Send initial invoice email
$body = @{ invoiceId = "YOUR_INVOICE_ID" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/invoices/send-initial-email" -Method POST -Body $body -ContentType "application/json"

# Send reminder email (3 days before due date)
$body = @{ invoiceId = "YOUR_INVOICE_ID" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/invoices/send-reminder-email" -Method POST -Body $body -ContentType "application/json"

# Send due date email
$body = @{ invoiceId = "YOUR_INVOICE_ID" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/invoices/send-due-email" -Method POST -Body $body -ContentType "application/json"

# Send late email (weekly follow-up, weekNumber 1-8)
$body = @{ invoiceId = "YOUR_INVOICE_ID"; weekNumber = 1 } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/invoices/send-late-email" -Method POST -Body $body -ContentType "application/json"

# Example: Send Week 3 late email
$body = @{ invoiceId = "YOUR_INVOICE_ID"; weekNumber = 3 } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/invoices/send-late-email" -Method POST -Body $body -ContentType "application/json"
```

**Note:** All endpoints are idempotent - they return `400` with `alreadySent: true` if the email has already been sent for that invoice/type/weekNumber combination.

### Firestore Index Setup

The app requires composite indexes for invoice and email event queries. Index definitions are in `firestore.indexes.json`.

**Deploy indexes:**
```bash
firebase deploy --only firestore:indexes
```

**Required indexes:**
- `invoices` collection:
  - `status` (ASC), `dueAt` (ASC), `__name__` (ASC) - for email processing queries
- `emailEvents` collection:
  - `userId` (ASC), `createdAt` (ASC), `__name__` (ASC) - for user email count queries
  - `userId` (ASC), `createdAt` (DESC), `__name__` (DESC) - for user email count queries (descending)
  - `invoiceId` (ASC), `createdAt` (DESC), `__name__` (DESC) - for invoice cooldown queries

If you see a "query requires an index" error, you can:
1. Click the link in the error message to create it in Firebase Console, OR
2. Deploy the committed `firestore.indexes.json` file with the command above

### Installation

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

You'll be redirected to `/login` if not authenticated. Create an account or sign in with existing credentials.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Dashboard (/)
│   ├── invoices/          # Invoice routes
│   │   ├── page.tsx       # Invoice list
│   │   ├── new/           # Create invoice
│   │   └── [id]/          # Invoice detail/edit
│   ├── profile/           # Business Profile
│   ├── settings/          # Settings
│   ├── layout.tsx         # Root layout with sidebar
│   ├── loading.tsx        # Loading UI
│   └── error.tsx          # Error boundary
├── components/
│   ├── layout/            # Layout components
│   │   ├── sidebar.tsx    # Left navigation sidebar
│   │   └── header.tsx     # Top header
│   └── ui/                # Reusable UI components
│       ├── button.tsx
│       ├── input.tsx
│       ├── select.tsx
│       ├── textarea.tsx
│       ├── status-badge.tsx
│       ├── currency.tsx
│       ├── date-label.tsx
│       └── form-field.tsx
├── domain/                # Domain types and interfaces
│   ├── types.ts           # Invoice, ChaseEvent, BusinessProfile types
│   └── repos/             # Repository interfaces
│       ├── invoice.repository.ts
│       ├── business-profile.repository.ts
│       └── entitlements.repository.ts
├── data/                  # Data layer
│   ├── repositories.ts    # Repository exports (swap point for Firebase)
│   └── mock/              # localStorage implementations
│       ├── invoice.repository.mock.ts
│       ├── business-profile.repository.mock.ts
│       ├── entitlements.repository.mock.ts
│       └── local-storage-utils.ts
└── lib/                   # Utilities
    └── utils.ts           # Formatting, validation helpers
```

## Features

### Routes

- `/` - Main dashboard (legacy, uses localStorage mock data)
- `/dashboard` - Firebase dashboard with KPIs and invoices from Firestore
- `/invoices` - Invoice list with search and filters (legacy, uses localStorage)
- `/invoices/new` - Create invoice with Firestore
- `/invoices/import` - CSV import for bulk invoice creation
- `/invoices/[id]` - Invoice detail/edit with auto-chase settings (Firestore)
- `/profile` - Business profile management
- `/settings` - Settings with plan toggle (Free/Pro)
- `/login` - Firebase Auth sign-in and account creation

### Data Persistence

**Firebase Integration:**
- Authentication: Firebase Auth (email/password)
- Invoices: Firestore collection `invoices` filtered by `userId`
- Session management: HttpOnly cookies for server-side route protection

**Legacy Mock Data:**
The original localStorage-based mock repositories are still available but are being phased out. New features use Firebase directly.

### Authentication

- Firebase Auth handles user sign-in and account creation
- Session cookies (`invoicechaser_session`) are set server-side after successful authentication
- Middleware protects routes by checking for session cookie
- Header displays current user email from Firebase Auth state

### Auto-Chase Feature

- Pro plan required (toggle in Settings for development)
- Configurable cadence (3, 5, or 7 days)
- Max chases limit
- Chase simulation in development mode
- Tracks chase count, last chased, and next chase dates

### Validation

- Email format validation
- URL validation for payment links
- Amount must be greater than 0
- Required field validation

## Development Notes

- **Pro Plan**: Enable in Settings page when running in development mode
- **Seed Data**: On first run, 10 sample invoices are automatically created
- **Status Calculation**: Overdue status is automatically calculated when `dueAt < today` and status is `pending`
- **Mock Storage**: All data persists to `localStorage` - clear browser data to reset

## Building for Production

```bash
npm run build
npm start
```

### Deployment Strategy

This Next.js app uses **middleware** and **API routes**, which require server-side runtime. Consider the following deployment options:

#### Recommended Options

1. **Firebase App Hosting** (Recommended for Firebase projects)
   - Supports Next.js with API routes and middleware
   - Integrated with Firebase services
   - Visit: https://firebase.google.com/products/app-hosting

2. **Cloud Run** (Google Cloud)
   - Containerized deployment
   - Serverless with automatic scaling
   - Supports full Next.js runtime

3. **Vercel** (Recommended for Next.js)
   - Native Next.js support
   - Automatic deployments from Git
   - Optimized for Next.js features

#### Classic Firebase Hosting (Static Only)

⚠️ **Important:** Classic Firebase Hosting (configured in `firebase.json`) only works for **static exports** of Next.js. It does **not** support:
- API routes (`/api/*`)
- Middleware
- Server-side rendering (SSR)

If you need to use classic Firebase Hosting, you would need to:
1. Configure Next.js for static export (`output: 'export'` in `next.config.ts`)
2. Remove or replace all API routes and middleware
3. Use client-only Firebase SDK operations

**For this app, we recommend Firebase App Hosting, Cloud Run, or Vercel** to support the full Next.js runtime including API routes and middleware.

#### Firebase Hosting Configuration

The repository includes Firebase Hosting configuration for static deployment reference:
- `.firebaserc` - Project and target configuration
- `firebase.json` - Hosting settings (configured for site: `invoicechaser-crsac-923ff`)

Helper scripts are available in `scripts/`:
- `firebase-login-and-set-project.ps1` - Login and set project
- `firebase-hosting-deploy.ps1` - Deploy to Firebase Hosting (static only)

**Note:** These scripts are for reference. For production with this app's features, use one of the recommended hosting options above.

## Firebase Integration

Firebase Auth and Firestore are now integrated:

- **Authentication:** `/login` page uses Firebase Auth with email/password
- **Session Management:** `/api/auth/session` sets httpOnly cookies from Firebase ID tokens
- **Data Access:** `/dashboard` page queries Firestore for user invoices
- **Route Protection:** Middleware checks for session cookie (not full token validation for performance)

### Files Changed for Firebase Integration

- `src/lib/firebase.ts` - Firebase initialization
- `src/app/login/page.tsx` - Firebase Auth integration
- `src/app/api/auth/session/route.ts` - Session cookie creation from ID token
- `src/app/api/auth/logout/route.ts` - Session cleanup
- `src/middleware.ts` - Session cookie checking
- `src/components/layout/header.tsx` - Firebase Auth state management
- `src/lib/invoices.ts` - Firestore queries for invoices
- `src/app/dashboard/page.tsx` - Dashboard with Firestore data

## CSV Import

You can bulk import invoices from a CSV file. Navigate to **Import CSV** in the sidebar.

### Sample CSV Format

```csv
customerName,customerEmail,amount,dueAt,status
Acme Corp,billing@acme.com,500.00,2024-12-31,pending
Tech Solutions,payments@techsol.com,1250.00,2024-11-15,pending
Global Ventures,finance@global.com,2500.00,2024-10-20,paid
```

**Required columns:**
- `customerName` - Customer/company name
- `amount` - Invoice amount (supports currency symbols and commas, e.g., "$1,500.00" or "1500")

**Optional columns:**
- `customerEmail` - Customer email address (validated if provided)
- `dueAt` - Due date (supports formats: YYYY-MM-DD, MM/DD/YYYY, MM-DD-YYYY)
- `status` - Invoice status (pending, overdue, paid)

The import tool will:
- Auto-detect column mappings by header name
- Show a preview of the first 20 rows
- Validate each row and highlight errors
- Import only valid rows (skip invalid ones)
- Use batched writes for efficient Firestore operations

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Storage**: Firebase Firestore (with localStorage mock for legacy features)
- **CSV Parsing**: PapaParse
