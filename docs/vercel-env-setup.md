# Vercel Environment Variables Setup

This guide explains how to configure Firebase environment variables in Vercel for deployments.

## Required Environment Variables

The application requires **7 environment variables** to function:

### Public Variables (Client-side, safe to expose)
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### Private Variable (Server-side, must not be exposed)
- `FIREBASE_SERVICE_ACCOUNT_KEY` - Full service account JSON as a single-line string

## Where to Get Values

### Public Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the **gear icon** (⚙️) → **Project settings**
4. Scroll to **"Your apps"** section
5. Click on your web app (or create one if needed)
6. Copy the config values:
   - `apiKey` → `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `authDomain` → `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `projectId` → `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `storageBucket` → `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `messagingSenderId` → `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `appId` → `NEXT_PUBLIC_FIREBASE_APP_ID`

### Service Account Key

1. In Firebase Console → **Project Settings** → **Service Accounts** tab
2. Click **"Generate new private key"**
3. Confirm and download the JSON file
4. Convert the JSON to a single-line string:
   - **Option A:** Use a JSON minifier (remove all newlines and spaces)
   - **Option B:** Use the PowerShell script: `scripts/service-account-to-env.ps1`
5. Copy the entire single-line JSON as the value for `FIREBASE_SERVICE_ACCOUNT_KEY`

## Setting Variables in Vercel

1. **Go to Vercel Dashboard:**
   - Navigate to your project
   - Click **Settings** → **Environment Variables**

2. **Add Each Variable:**
   - Click **"Add New"**
   - Enter the **Key** (e.g., `NEXT_PUBLIC_FIREBASE_API_KEY`)
   - Paste the **Value**
   - Select environments: **Preview** + **Production** (and **Development** if needed)
   - Click **"Save"**

3. **Repeat for All 7 Variables:**
   - Add all `NEXT_PUBLIC_FIREBASE_*` variables
   - Add `FIREBASE_SERVICE_ACCOUNT_KEY`

4. **Verify Settings:**
   - Ensure all variables are enabled for **Preview** and **Production**
   - Ensure no typos in variable names

## After Adding Variables

**⚠️ Important:** Environment variable changes require a new deployment to take effect.

1. **Redeploy:**
   - Go to **Deployments** tab
   - Click the **"⋯"** menu on the latest deployment
   - Select **"Redeploy"** OR
   - Push a new commit to trigger automatic deployment

2. **Verify Deployment:**
   - Wait for deployment to complete
   - Open the preview/production URL
   - If env vars are missing, you'll see the `EnvMissing` error screen
   - If env vars are correct, the app should load normally

## Troubleshooting

- **Missing Env Vars:** If you see the "Configuration Error" screen, check that all 7 variables are set and enabled for the correct environments
- **Preview Not Working:** Ensure variables are enabled for **Preview** environment, not just Production
- **Build Succeeds But App Fails:** Check browser console for `[ENV] Missing Firebase env vars` errors
- **Service Account Format:** Ensure `FIREBASE_SERVICE_ACCOUNT_KEY` is a single-line JSON string (no newlines)

## Quick Checklist

- [ ] All 7 env vars added in Vercel Settings → Environment Variables
- [ ] All vars enabled for **Preview** + **Production** environments
- [ ] Values copied correctly from Firebase Console (no typos)
- [ ] `FIREBASE_SERVICE_ACCOUNT_KEY` is a single-line JSON string
- [ ] Redeployed the latest deployment after adding vars
- [ ] Verified app loads correctly on preview/production URL
