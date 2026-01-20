# PowerShell script to deploy to Firebase Hosting
# Usage: .\scripts\firebase-hosting-deploy.ps1

Write-Host "Firebase Hosting Deploy Script" -ForegroundColor Cyan
Write-Host "============================`n" -ForegroundColor Cyan

# Check if Firebase CLI is installed
try {
    $firebaseVersion = firebase --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Firebase CLI not found"
    }
    Write-Host "Firebase CLI found: $firebaseVersion`n" -ForegroundColor Green
} catch {
    Write-Host "Error: Firebase CLI is not installed." -ForegroundColor Red
    Write-Host "`nPlease install Firebase CLI first:" -ForegroundColor Yellow
    Write-Host "  npm install -g firebase-tools" -ForegroundColor White
    Write-Host "`nOr visit: https://firebase.google.com/docs/cli#install_the_firebase_cli" -ForegroundColor White
    exit 1
}

# Check if user is logged in
Write-Host "Checking Firebase authentication..." -ForegroundColor Yellow
firebase projects:list > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nNot logged in. Please run first:" -ForegroundColor Yellow
    Write-Host "  .\scripts\firebase-login-and-set-project.ps1" -ForegroundColor White
    exit 1
}

Write-Host "✓ Authenticated`n" -ForegroundColor Green

# Check if project is set
Write-Host "Checking Firebase project..." -ForegroundColor Yellow
$currentProject = firebase use 2>&1 | Select-String -Pattern "Using (.+) \(" | ForEach-Object { $_.Matches.Groups[1].Value }
if (-not $currentProject -or $currentProject -ne "invoicechaser-crsac") {
    Write-Host "Project not set correctly. Setting to 'invoicechaser-crsac'..." -ForegroundColor Yellow
    firebase use invoicechaser-crsac
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nError: Failed to set Firebase project." -ForegroundColor Red
        exit 1
    }
}

Write-Host "✓ Project: invoicechaser-crsac`n" -ForegroundColor Green

# Deploy
Write-Host "Deploying to Firebase Hosting (site: invoicechaser-crsac-923ff)..." -ForegroundColor Yellow
Write-Host ""

firebase deploy --only hosting

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nError: Deployment failed." -ForegroundColor Red
    exit 1
}

Write-Host "`n✓ Deployment successful!" -ForegroundColor Green
Write-Host ""
