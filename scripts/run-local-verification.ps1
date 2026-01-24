# Local Verification runner: README "Local Verification" steps 2-5.
# Requires: .env.local with NEXT_PUBLIC_FIREBASE_API_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD
# Dev server must be running (npm run dev). Emulators: started separately if used.

$ErrorActionPreference = "Stop"
$base = "http://localhost:3000"

# --- Parse .env.local
$script:apiKey = ""
$script:testEmail = ""
$script:testPassword = ""
$envPath = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $PSScriptRoot "..") ".env.local"))
if (-not (Test-Path $envPath)) {
  Write-Output "ERROR: .env.local not found at $envPath"
  exit 1
}
Get-Content $envPath -ErrorAction SilentlyContinue | ForEach-Object {
  $line = $_
  if ($line -match '^NEXT_PUBLIC_FIREBASE_API_KEY=(.+)$') { $script:apiKey = $matches[1].Trim().Trim('"').Trim("'") }
  if ($line -match '^TEST_USER_EMAIL=(.+)$')       { $script:testEmail = $matches[1].Trim().Trim('"').Trim("'") }
  if ($line -match '^TEST_USER_PASSWORD=(.+)$')     { $script:testPassword = $matches[1].Trim().Trim('"').Trim("'") }
}
# Allow env var override for test user (avoids storing password in .env.local)
if ($env:TEST_USER_EMAIL) { $script:testEmail = $env:TEST_USER_EMAIL }
if ($env:TEST_USER_PASSWORD) { $script:testPassword = $env:TEST_USER_PASSWORD }
if (-not $script:apiKey) {
  Write-Output "ERROR: NEXT_PUBLIC_FIREBASE_API_KEY not found in .env.local"
  exit 1
}
if (-not $script:testEmail -or -not $script:testPassword) {
  Write-Output "ERROR: TEST_USER_EMAIL and TEST_USER_PASSWORD required. Set in .env.local or env: `$env:TEST_USER_EMAIL='...'; `$env:TEST_USER_PASSWORD='...'"
  exit 1
}

# --- 1) Get id token and uid (Firebase Auth REST)
$authUri = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$($script:apiKey)"
$authBody = @{ email = $script:testEmail; password = $script:testPassword; returnSecureToken = $true } | ConvertTo-Json
try {
  $authResp = Invoke-RestMethod -Uri $authUri -Method POST -Body $authBody -ContentType "application/json"
} catch {
  $errBody = $_.ErrorDetails.Message
  if (-not $errBody) { $errBody = $_.Exception.Message }
  $safeUri = $authUri -replace '\?key=.+$', '?key=...'
  Write-Output "ERROR: Firebase Auth sign-in failed. Request: POST $safeUri. Error: $errBody"
  exit 1
}
$idToken = $authResp.idToken
$uid = $authResp.localId

# --- 2) Wait for dev server
$max = 30
$n = 0
while ($n -lt $max) {
  try {
    $r = Invoke-WebRequest -Uri $base -Method GET -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { break }
  } catch { }
  $n++; Start-Sleep -Seconds 2
}
if ($n -ge $max) {
  Write-Output "ERROR: Dev server not responding at $base after ${max} attempts. Run: npm run dev"
  exit 1
}

# --- 3) Create invoice (README step 3, API)
$createBody = '{"userId":"'+$uid+'","customerName":"Test","customerEmail":"test@example.com","amount":10000,"dueAt":"2025-12-31T23:59:59.000Z","status":"pending"}'
try {
  $cr = Invoke-WebRequest -Uri "$base/api/invoices/create" -Method POST -Body $createBody -ContentType "application/json" -UseBasicParsing
  $crj = $cr.Content | ConvertFrom-Json
  $invoiceId = $crj.invoiceId
  if (-not $invoiceId) { throw "create response missing invoiceId: $($cr.Content)" }
} catch {
  $status = ""
  $body = $_.ErrorDetails.Message
  try { $status = $_.Exception.Response.StatusCode.value__ } catch { }
  try {
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) { $rd = New-Object System.IO.StreamReader($stream); $body = $rd.ReadToEnd(); $rd.Close() }
  } catch { }
  Write-Output "FAILED: POST /api/invoices/create"
  Write-Output "Request payload: $createBody"
  Write-Output "Response status: $status"
  Write-Output "Response body: $body"
  exit 1
}

# --- 4) Mark paid (README step 4) — LOG status + JSON
Write-Output ""
Write-Output "=== POST /api/invoices/$invoiceId/mark-paid (status + JSON) ==="
try {
  $mp = Invoke-WebRequest -Uri "$base/api/invoices/$invoiceId/mark-paid" -Method POST `
    -Headers @{ "Authorization" = "Bearer $idToken"; "Content-Type" = "application/json" } `
    -Body '{}' -UseBasicParsing
  Write-Output "Status: $($mp.StatusCode)"
  Write-Output "JSON: $($mp.Content)"
} catch {
  $status = ""; $body = $_.ErrorDetails.Message
  try { $status = $_.Exception.Response.StatusCode.value__ } catch { }
  try {
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) { $rd = New-Object System.IO.StreamReader($stream); $body = $rd.ReadToEnd(); $rd.Close() }
  } catch { }
  Write-Output "FAILED: POST /api/invoices/$invoiceId/mark-paid"
  Write-Output "Request: POST $base/api/invoices/$invoiceId/mark-paid with Authorization Bearer and body {}"
  Write-Output "Response status: $status"
  Write-Output "Response body: $body"
  exit 1
}

# --- 5) GET /api/stats/summary — LOG response
Write-Output ""
Write-Output "=== GET /api/stats/summary ==="
try {
  $st = Invoke-WebRequest -Uri "$base/api/stats/summary" -Headers @{ "Authorization" = "Bearer $idToken" } -UseBasicParsing
  Write-Output $st.Content
} catch {
  $status = ""; $body = $_.ErrorDetails.Message
  try { $status = $_.Exception.Response.StatusCode.value__ } catch { }
  try {
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) { $rd = New-Object System.IO.StreamReader($stream); $body = $rd.ReadToEnd(); $rd.Close() }
  } catch { }
  Write-Output "FAILED: GET /api/stats/summary"
  Write-Output "Response status: $status"
  Write-Output "Response body: $body"
  exit 1
}

# --- Firestore doc path actually used for stats/summary (from onInvoiceWrite)
Write-Output ""
Write-Output "=== Firestore doc path for stats/summary ==="
Write-Output "businessProfiles/$uid/stats/summary"

Write-Output ""
Write-Output "Local Verification steps 3-5 completed."
