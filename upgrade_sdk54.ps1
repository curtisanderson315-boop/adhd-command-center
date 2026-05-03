$appDir = "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
Set-Location $appDir

Write-Host "Upgrading to Expo SDK 54..." -ForegroundColor Cyan

# Kill any running expo/node
$nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcs) {
    Write-Host "Killing $($nodeProcs.Count) leftover node process(es)..." -ForegroundColor DarkYellow
    $nodeProcs | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# Remove old node_modules and lock file
Write-Host "Removing node_modules and package-lock.json..." -ForegroundColor Yellow
if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
if (Test-Path "package-lock.json") { Remove-Item -Force "package-lock.json" }
Write-Host "Removed." -ForegroundColor Green

# Fresh install
Write-Host "Running npm install (this takes a few minutes)..." -ForegroundColor Yellow
npm install --legacy-peer-deps

# Fix expo package versions to match SDK 54
Write-Host "Running expo install --fix..." -ForegroundColor Yellow
npx expo install --fix

Write-Host ""
Write-Host "SDK 54 upgrade complete! Double-click start.bat to launch." -ForegroundColor Green
Write-Host "Press any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
