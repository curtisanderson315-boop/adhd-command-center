$appDir = "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
Set-Location $appDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EAS Login (run this once)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Logging you into your Expo account..." -ForegroundColor Yellow
Write-Host "(If prompted to install eas-cli, press Y and Enter)" -ForegroundColor DarkGray
Write-Host ""

npx --yes eas-cli login

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Logged in! Now run eas_build.bat to build your app." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Login failed. Try again or check https://expo.dev" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
