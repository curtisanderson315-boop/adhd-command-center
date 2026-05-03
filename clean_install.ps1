$appDir = "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
$localModules = "C:\Dev\adhd-app-node-modules"
Set-Location $appDir

Write-Host "Stopping any running node processes..." -ForegroundColor DarkYellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# ---- Step 1: Nuke existing node_modules completely ----
Write-Host "Nuking node_modules (using robocopy trick for reliability)..." -ForegroundColor Cyan

# Create a guaranteed-empty temp dir
$emptyDir = "$env:TEMP\empty_for_robocopy_$PID"
New-Item -ItemType Directory -Force -Path $emptyDir | Out-Null

if (Test-Path "node_modules") {
    # Use robocopy /MIR to mirror an empty dir into node_modules, which empties it
    Write-Host "  Emptying node_modules via robocopy..." -ForegroundColor DarkGray
    robocopy "$emptyDir" "node_modules" /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    # Now rmdir the empty directory
    cmd /c "rmdir /s /q node_modules" 2>$null
    Start-Sleep -Seconds 1
}

Remove-Item -Force -Recurse $emptyDir -ErrorAction SilentlyContinue

# Verify it's gone
if (Test-Path "node_modules") {
    Write-Host "  WARNING: Could not fully remove node_modules. Trying force delete..." -ForegroundColor Yellow
    [System.IO.Directory]::Delete((Resolve-Path "node_modules").Path, $true)
    Start-Sleep -Seconds 1
}

if (Test-Path "node_modules") {
    Write-Host "  FAILED to remove node_modules. Aborting." -ForegroundColor Red
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "  node_modules removed OK." -ForegroundColor DarkGreen

# ---- Step 2: Set up C:\Dev target dir ----
Write-Host "Setting up local modules dir at: $localModules" -ForegroundColor Cyan
if (Test-Path $localModules) {
    Write-Host "  Cleaning up previous local modules..." -ForegroundColor DarkGray
    $emptyDir2 = "$env:TEMP\empty_for_robocopy2_$PID"
    New-Item -ItemType Directory -Force -Path $emptyDir2 | Out-Null
    robocopy "$emptyDir2" "$localModules" /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    Remove-Item -Force -Recurse $emptyDir2 -ErrorAction SilentlyContinue
    cmd /c "rmdir /s /q `"$localModules`"" 2>$null
    Start-Sleep -Seconds 1
}
New-Item -ItemType Directory -Force -Path $localModules | Out-Null

# ---- Step 3: Create junction ----
Write-Host "Creating junction: node_modules -> $localModules" -ForegroundColor Cyan
$junctionResult = cmd /c "mklink /J `"node_modules`" `"$localModules`"" 2>&1
Write-Host "  $junctionResult" -ForegroundColor DarkGray

if (-not (Test-Path "node_modules")) {
    Write-Host "  FAILED to create junction!" -ForegroundColor Red
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
Write-Host "  Junction created OK." -ForegroundColor DarkGreen

# ---- Step 4: Remove lockfile ----
if (Test-Path "package-lock.json") { Remove-Item -Force "package-lock.json" }

# ---- Step 5: npm install (goes to C:\Dev, never touches OneDrive) ----
Write-Host ""
Write-Host "Running npm install (packages stored at C:\Dev, NOT in OneDrive)..." -ForegroundColor Cyan
npm install --legacy-peer-deps

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS! Double-click start.bat to launch Expo." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "npm install had errors. Check output above." -ForegroundColor Red
}

Write-Host "Press any key to close..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
