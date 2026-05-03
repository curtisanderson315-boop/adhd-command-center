$appDir = "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
Set-Location $appDir

# Kill expo if running
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

Write-Host "Installing react-native-worklets (required by Reanimated v4)..." -ForegroundColor Cyan
npm install react-native-worklets@~0.8.0 --legacy-peer-deps

Write-Host ""
Write-Host "Done! Double-click start.bat to launch." -ForegroundColor Green
Write-Host "Press any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
