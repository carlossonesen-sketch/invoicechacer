# PowerShell script to automatically set FIREBASE_SERVICE_ACCOUNT_KEY in .env.local
# Usage: .\scripts\setup-admin-env.ps1 -InputPath "path\to\serviceAccountKey.json"

param(
    [Parameter(Mandatory = $true)]
    [string] $InputPath
)

# Get the project root directory (parent of scripts/)
$projectRoot = if ($PSScriptRoot) {
    Split-Path -Parent $PSScriptRoot
} else {
    # Fallback: assume script is in scripts/ and we're in project root
    (Get-Location).Path
}

$envLocalPath = Join-Path $projectRoot ".env.local"
$envLocalBakPath = Join-Path $projectRoot ".env.local.bak"

# Validate input file exists
if (-not (Test-Path $InputPath)) {
    Write-Host "Error: File not found at '$InputPath'" -ForegroundColor Red
    exit 1
}

# Validate input file is valid JSON
try {
    $jsonContent = Get-Content -Path $InputPath -Raw
    $null = $jsonContent | ConvertFrom-Json
} catch {
    Write-Host "Error: Invalid JSON file. Please ensure '$InputPath' is a valid service account JSON file." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Call the existing service-account-to-env.ps1 script to generate the key line
# We use the same conversion logic (minify JSON) as that script
try {
    $jsonObject = $jsonContent | ConvertFrom-Json
    $minifiedJson = ($jsonObject | ConvertTo-Json -Compress -Depth 100)
    $keyLine = "FIREBASE_SERVICE_ACCOUNT_KEY=$minifiedJson"
    
    if (-not $keyLine) {
        Write-Host "Error: Failed to generate FIREBASE_SERVICE_ACCOUNT_KEY line." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error: Failed to generate environment variable line." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Backup existing .env.local if it exists
if (Test-Path $envLocalPath) {
    Write-Host "Backing up existing .env.local to .env.local.bak..." -ForegroundColor Yellow
    try {
        Copy-Item -Path $envLocalPath -Destination $envLocalBakPath -Force
        Write-Host "Backup created." -ForegroundColor Green
    } catch {
        Write-Host "Warning: Failed to create backup: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host ".env.local not found. Creating new file..." -ForegroundColor Yellow
}

# Read existing .env.local or create empty content
$envContent = ""
if (Test-Path $envLocalPath) {
    try {
        $envContent = Get-Content -Path $envLocalPath -Raw
    } catch {
        Write-Host "Error: Failed to read .env.local: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Check if FIREBASE_SERVICE_ACCOUNT_KEY already exists and replace/append
$keyPattern = "^FIREBASE_SERVICE_ACCOUNT_KEY=.*$"
$lines = if ($envContent) { $envContent -split "`r?`n" } else { @() }
$newLines = @()
$keyFound = $false

foreach ($line in $lines) {
    if ($line -match $keyPattern) {
        # Replace existing key
        $newLines += $keyLine
        $keyFound = $true
    } else {
        $newLines += $line
    }
}

# Append if not found
if (-not $keyFound) {
    if ($envContent -and -not $envContent.EndsWith("`n") -and -not $envContent.EndsWith("`r")) {
        $newLines += ""
    }
    $newLines += $keyLine
}

# Write the updated content
try {
    $newContent = $newLines -join "`n"
    if (-not $newContent.EndsWith("`n")) {
        $newContent += "`n"
    }
    Set-Content -Path $envLocalPath -Value $newContent -NoNewline -ErrorAction Stop
} catch {
    Write-Host "Error: Failed to write .env.local: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Print success message
Write-Host "`nFIREBASE_SERVICE_ACCOUNT_KEY updated" -ForegroundColor Green
Write-Host "Preview (first 60 characters):" -ForegroundColor Cyan
$preview = if ($keyLine.Length -gt 60) { $keyLine.Substring(0, 60) + "..." } else { $keyLine }
Write-Host $preview -ForegroundColor Yellow
Write-Host "`nRemember to restart your dev server for changes to take effect." -ForegroundColor Yellow
