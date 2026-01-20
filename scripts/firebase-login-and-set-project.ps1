# PowerShell script to login to Firebase CLI and set the default project
# Usage: .\scripts\firebase-login-and-set-project.ps1

Write-Host "Firebase CLI Setup Script" -ForegroundColor Cyan
Write-Host "========================`n" -ForegroundColor Cyan

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

# Login to Firebase
Write-Host "Logging in to Firebase..." -ForegroundColor Yellow
firebase login

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nError: Failed to login to Firebase." -ForegroundColor Red
    exit 1
}

Write-Host "`nSetting default project to 'invoicechaser-crsac'..." -ForegroundColor Yellow
firebase use invoicechaser-crsac

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nError: Failed to set Firebase project." -ForegroundColor Red
    exit 1
}

Write-Host "`n✓ Successfully logged in and set project!" -ForegroundColor Green
Write-Host "`nYou can now deploy using:" -ForegroundColor Cyan
Write-Host "  .\scripts\firebase-hosting-deploy.ps1" -ForegroundColor White
Write-Host ""
