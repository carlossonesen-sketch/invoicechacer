# PowerShell script to convert Firebase service account JSON to single-line environment variable format
# Usage: .\scripts\service-account-to-env.ps1 -Path "path\to\serviceAccountKey.json"

param(
    [Parameter(Mandatory=$true)]
    [string]$Path
)

# Check if file exists
if (-not (Test-Path $Path)) {
    Write-Host "Error: File not found at '$Path'" -ForegroundColor Red
    exit 1
}

# Read the JSON file
try {
    $jsonContent = Get-Content -Path $Path -Raw
    
    # Parse JSON to validate it's valid JSON
    $jsonObject = $jsonContent | ConvertFrom-Json
    
    # Minify the JSON by parsing and re-encoding (removes newlines and extra spaces)
    $minifiedJson = ($jsonObject | ConvertTo-Json -Compress -Depth 100)
    
    # Output the result
    Write-Host "`nCopy this value to FIREBASE_SERVICE_ACCOUNT_KEY in your .env.local file:`n" -ForegroundColor Green
    Write-Host $minifiedJson -ForegroundColor Yellow
    Write-Host "`nOr use this format directly (copy the entire line):`n" -ForegroundColor Green
    Write-Host "FIREBASE_SERVICE_ACCOUNT_KEY=$minifiedJson" -ForegroundColor Cyan
    Write-Host ""
    
} catch {
    Write-Host "Error: Failed to parse JSON file. Please ensure the file is a valid JSON file." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
