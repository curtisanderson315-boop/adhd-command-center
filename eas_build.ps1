$appDir = "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
Set-Location $appDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EAS Build - iOS Development Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will:" -ForegroundColor Yellow
Write-Host "  1. Upload your project to Expo build servers" -ForegroundColor Yellow
Write-Host "  2. Compile a native iOS app with Siri support" -ForegroundColor Yellow
Write-Host "  3. Give you an install link when done (~15-20 min)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Requirements:" -ForegroundColor Cyan
Write-Host "  - Expo account (expo.dev - free)" -ForegroundColor White
Write-Host "  - Apple Developer account (developer.apple.com - $99/year)" -ForegroundColor White
Write-Host "    EAS will prompt for your Apple ID and handle signing." -ForegroundColor DarkGray
Write-Host ""

# Run npm install first to pull in new packages
Write-Host "Running npm install to pull in new packages..." -ForegroundColor Cyan
npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed. Run clean_install.bat first." -ForegroundColor Red
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host ""
Write-Host "Starting EAS build (development profile)..." -ForegroundColor Cyan
Write-Host "EAS will ask for your Apple credentials. Enter them when prompted." -ForegroundColor Yellow
Write-Host ""

npx eas-cli build --platform ios --profile development

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Build submitted! Check https://expo.dev for status." -ForegroundColor Green
    Write-Host "Install the .ipa on your iPhone via the link EAS sends you." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Build submission failed. Check output above." -ForegroundColor Red
    Write-Host "Common fix: run eas_login.bat first if not yet logged in." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
