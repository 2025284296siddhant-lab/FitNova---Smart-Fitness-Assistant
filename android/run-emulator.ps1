# FitNova: boot an Android 14 emulator, install the APK, launch it and smoke-test the on-device server.
# Requires "Windows Hypervisor Platform" (Windows Features) so the x86_64 emulator can use hardware acceleration.
# Usage (PowerShell):  powershell -ExecutionPolicy Bypass -File android\run-emulator.ps1  [-Apk path\to.apk]
param([string]$Apk = "$PSScriptRoot\..\dist\FitNova-1.1.apk")

$ErrorActionPreference = "Stop"
$sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:ANDROID_SDK_ROOT = $sdk; $env:ANDROID_HOME = $sdk
$emu = "$sdk\emulator\emulator.exe"; $adb = "$sdk\platform-tools\adb.exe"
$avdmanager = "$sdk\cmdline-tools\latest\bin\avdmanager.bat"
$image = "system-images;android-34;google_apis;x86_64"
$avd = "fitnova_x64"

foreach ($p in @($emu, $adb, $avdmanager, $Apk)) { if (-not (Test-Path $p)) { throw "Missing: $p" } }

Write-Host "Checking hardware acceleration..."
$accel = & $emu -accel-check 2>&1 | Out-String
if ($accel -notmatch "is installed and usable") {
    Write-Host $accel
    Write-Warning "Hardware acceleration is not available. Enable 'Windows Hypervisor Platform' in 'Turn Windows features on or off', reboot, then run this script again."
    exit 1
}

$avds = & $emu -list-avds
if ($avds -notcontains $avd) {
    Write-Host "Creating AVD $avd..."
    "no" | & $avdmanager create avd -n $avd -k $image -d "pixel_6" --force | Out-Null
}

Write-Host "Booting emulator (window will open)..."
Start-Process -FilePath $emu -ArgumentList "-avd $avd -no-snapshot-save -gpu auto"
& $adb wait-for-device
do { Start-Sleep -Seconds 3; $done = (& $adb shell getprop sys.boot_completed 2>$null) -replace "\s", "" } until ($done -eq "1")
Write-Host "Booted. Installing $Apk ..."
& $adb install -r -t $Apk
& $adb shell am start -n app.fitnova/.MainActivity | Out-Null

Write-Host "Waiting for the on-device FitNova server..."
& $adb forward tcp:47616 tcp:47615 | Out-Null
$ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
    Start-Sleep -Seconds 2
    try { $h = Invoke-RestMethod -Uri "http://127.0.0.1:47616/api/health" -TimeoutSec 3; $ok = $h.status -eq "ok" } catch { }
}
if ($ok) {
    Write-Host "SUCCESS: on-device server is up (schema v$($h.schema_version), $($h.exercises) exercises). FitNova is running in the emulator." -ForegroundColor Green
} else {
    Write-Warning "Server did not respond. Recent app logs:"
    & $adb logcat -d -s FitNova python.stdout python.stderr AndroidRuntime | Select-Object -Last 60
    exit 1
}
