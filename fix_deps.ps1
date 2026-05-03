$appDir = "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
Set-Location $appDir

Write-Host "Re-running npm install --legacy-peer-deps with updated versions..." -ForegroundColor Cyan
npm install --legacy-peer-deps

Write-Host ""
Write-Host "Done! Now double-click start.bat to launch." -ForegroundColor Green
Write-Host "Press any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
