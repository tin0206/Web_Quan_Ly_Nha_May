param(
    [string]$ProjectRoot = "",
    [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Join-Path $PSScriptRoot ".."
}

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $ProjectRoot "dist"
}

$projectRoot = (Resolve-Path $ProjectRoot).Path
$backendDir = Join-Path $projectRoot "backend"
$envFile = Join-Path $projectRoot ".env"

if (-not (Test-Path $backendDir)) {
    throw "Khong tim thay thu muc backend: $backendDir"
}

if (-not (Test-Path $envFile)) {
    throw "Khong tim thay file .env: $envFile"
}

$nodeCommand = Get-Command node -ErrorAction Stop
$npmCommand = Get-Command npm.cmd -ErrorAction Stop

$nodeExe = $nodeCommand.Source
$nodeDir = Split-Path $nodeExe -Parent

Write-Host "Node runtime: $nodeExe"
Write-Host "NPM command : $($npmCommand.Source)"

Write-Host "Cai dependencies backend..."
Push-Location $backendDir
try {
    $npmCacheDir = Join-Path $backendDir ".npm-cache"
    & $npmCommand.Source ci --omit=dev --cache $npmCacheDir --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci that bai voi ma loi $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$packageName = "OTWebApp-portable"
$stagingDir = Join-Path $OutputRoot $packageName
$runtimeDir = Join-Path $stagingDir "runtime\\nodejs"
$appDir = Join-Path $stagingDir "app"
$zipPath = Join-Path $OutputRoot "$packageName.zip"

if (Test-Path $stagingDir) {
    Remove-Item -Path $stagingDir -Recurse -Force
}

if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

Write-Host "Copy source app..."
Copy-Item -Path (Join-Path $projectRoot "backend") -Destination (Join-Path $appDir "backend") -Recurse -Force
Copy-Item -Path $envFile -Destination (Join-Path $appDir ".env") -Force

Write-Host "Copy Node runtime..."
Copy-Item -Path (Join-Path $nodeDir "*") -Destination $runtimeDir -Recurse -Force

$startBat = @"
@echo off
setlocal

set "BASE_DIR=%~dp0"
set "NODE_EXE=%BASE_DIR%runtime\nodejs\node.exe"
set "APP_ROOT=%BASE_DIR%app"
set "BACKEND_DIR=%APP_ROOT%\backend"
set "ENV_FILE=%APP_ROOT%\.env"

if not exist "%NODE_EXE%" (
  echo [ERROR] Khong tim thay Node runtime: "%NODE_EXE%"
  exit /b 1
)

if not exist "%ENV_FILE%" (
  echo [ERROR] Khong tim thay file .env: "%ENV_FILE%"
  exit /b 1
)

cd /d "%BACKEND_DIR%"
echo OTWebApp is starting on port 8000...
"%NODE_EXE%" server.js

endlocal
"@

$installTaskPs1 = @'
param(
    [string]$TaskName = "OTWebApp-Autostart",
    [switch]$AtStartup,
    [switch]$RunNow,
    [switch]$AsSystem
)

$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$startBat = Join-Path $baseDir "start.bat"

if (-not (Test-Path $startBat)) {
    throw "Khong tim thay start.bat tai: $startBat"
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$startBat`""
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

if ($AsSystem) {
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw "Can mo PowerShell voi quyen Administrator de tao task chay duoi tai khoan SYSTEM."
    }

    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $triggerName = "AtStartup (SYSTEM)"
}
else {
    $userId = "$env:USERDOMAIN\$env:USERNAME"
    $trigger = if ($AtStartup) { New-ScheduledTaskTrigger -AtStartup } else { New-ScheduledTaskTrigger -AtLogOn -User $userId }
    $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
    $triggerName = if ($AtStartup) { "AtStartup" } else { "AtLogOn" }
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Da tao task: $TaskName"
Write-Host "Trigger: $triggerName"

if ($RunNow) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Da yeu cau chay task ngay."
}
'@

$uninstallTaskPs1 = @'
param(
    [string]$TaskName = "OTWebApp-Autostart"
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
    Write-Host "Khong tim thay task: $TaskName"
    exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Da xoa task: $TaskName"
'@

$installBat = @"
@echo off
setlocal

set "BASE_DIR=%~dp0"
set "PS1=%BASE_DIR%install-autostart-task.ps1"

if not exist "%PS1%" (
  echo [ERROR] Khong tim thay file: "%PS1%"
  pause
  exit /b 1
)

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Dang yeu cau quyen Administrator...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%PS1%"" -AsSystem'"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -AsSystem
if %errorlevel% neq 0 (
  echo [ERROR] Cai dat auto-start that bai.
  pause
  exit /b %errorlevel%
)

echo Cai dat thanh cong. Ung dung se tu chay sau moi lan mo may.
pause
endlocal
"@

$uninstallBat = @"
@echo off
setlocal

set "BASE_DIR=%~dp0"
set "PS1=%BASE_DIR%uninstall-autostart-task.ps1"

if not exist "%PS1%" (
  echo [ERROR] Khong tim thay file: "%PS1%"
  pause
  exit /b 1
)

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Dang yeu cau quyen Administrator...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%PS1%""'"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
if %errorlevel% neq 0 (
  echo [ERROR] Go auto-start that bai.
  pause
  exit /b %errorlevel%
)

echo Da go auto-start thanh cong.
pause
endlocal
"@

$readme = @'
# OTWebApp Portable

## Chay tren may Windows khac (khong can cai Node.js)
1. Giai nen file `OTWebApp-portable.zip`.
2. Mo thu muc `OTWebApp-portable`.
3. Chay `start.bat`.
4. Mo trinh duyet vao `http://localhost:8000`.

## Dieu kien
- May do truy cap duoc SQL Server trong file `.env`.
- Port `8000` khong bi chiem.

## Tu dong chay cung Windows (Task Scheduler)
- Mo PowerShell tai thu muc `OTWebApp-portable`.
- Chay: `powershell -ExecutionPolicy Bypass -File .\install-autostart-task.ps1`
- Khong can user dang nhap (chay bang SYSTEM, can Administrator): `powershell -ExecutionPolicy Bypass -File .\install-autostart-task.ps1 -AsSystem`
- Xoa task: `powershell -ExecutionPolicy Bypass -File .\uninstall-autostart-task.ps1`
- Cach don gian: double-click `install-autostart.bat` de cai, double-click `uninstall-autostart.bat` de go.
'@

Set-Content -Path (Join-Path $stagingDir "start.bat") -Value $startBat -Encoding Ascii
Set-Content -Path (Join-Path $stagingDir "install-autostart-task.ps1") -Value $installTaskPs1 -Encoding Ascii
Set-Content -Path (Join-Path $stagingDir "uninstall-autostart-task.ps1") -Value $uninstallTaskPs1 -Encoding Ascii
Set-Content -Path (Join-Path $stagingDir "install-autostart.bat") -Value $installBat -Encoding Ascii
Set-Content -Path (Join-Path $stagingDir "uninstall-autostart.bat") -Value $uninstallBat -Encoding Ascii
Set-Content -Path (Join-Path $stagingDir "README-PORTABLE.md") -Value $readme -Encoding Ascii

Write-Host "Tao file zip..."
Compress-Archive -Path $stagingDir -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Hoan tat."
Write-Host "Thu muc: $stagingDir"
Write-Host "File zip: $zipPath"
