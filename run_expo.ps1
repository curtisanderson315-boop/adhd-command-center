$appDir = "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
Set-Location $appDir

# Kill any leftover node/expo processes so port 8081 is free
$nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcs) {
    Write-Host "Killing $($nodeProcs.Count) leftover node process(es)..." -ForegroundColor DarkYellow
    $nodeProcs | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# Auto-detect WiFi IP (skip loopback and link-local)
$wifiIP = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254' } |
    Sort-Object -Property PrefixLength -Descending |
    Select-Object -First 1).IPAddress

if ($wifiIP) {
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $wifiIP
    Write-Host "Using IP: $wifiIP" -ForegroundColor Green
} else {
    Write-Host "Could not detect WiFi IP - QR code may show 127.0.0.1" -ForegroundColor Yellow
}

Write-Host "Starting ADHD Command Center..." -ForegroundColor Cyan
Write-Host "- Scan the QR code with Expo Go on your iPhone" -ForegroundColor Yellow
Write-Host "- Your phone and computer must be on the same WiFi" -ForegroundColor Yellow
Write-Host ""

# Run expo directly so the QR code and interactive UI render correctly
npx expo start --clear
