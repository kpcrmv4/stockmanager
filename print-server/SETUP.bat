@echo off
chcp 65001 >nul
title Print Server Setup v2.0

echo ==========================================
echo   PRINT SERVER v2.0 - AUTO SETUP
echo   Supabase Realtime Edition
echo ==========================================
echo.

:: Check Admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Please right-click and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

:: Check config.json
if not exist "%~dp0config.json" (
    echo [ERROR] config.json not found!
    echo.
    echo   1. Go to Store Settings in the web app
    echo   2. Click "Download Print Server" button
    echo   3. Extract the ZIP file to this folder
    echo   4. Run this SETUP.bat again
    echo.
    pause
    exit /b 1
)
echo [OK] config.json found

echo.
echo [1/5] Checking Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo      Node.js not found. Installing...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %errorLevel% neq 0 (
        echo [!] Failed to install Node.js
        echo     Please install manually from https://nodejs.org/
        pause
        exit /b 1
    )
    echo      Node.js installed successfully!
    echo      [!] Please RESTART this setup script after Node.js installation
    pause
    exit /b 0
) else (
    for /f "tokens=*" %%i in ('node -v') do echo      Found: %%i
)

echo.
echo [2/5] Installing npm packages...
cd /d "%~dp0"
if not exist "node_modules\@supabase" (
    call npm install
    if %errorLevel% neq 0 (
        echo [!] Failed to install npm packages
        pause
        exit /b 1
    )
    echo      npm packages installed!
) else (
    echo      npm packages already installed
)

echo.
echo [3/5] Checking SumatraPDF...
set "SUMATRA_FOUND=0"
if exist "C:\Program Files\SumatraPDF\SumatraPDF.exe" set "SUMATRA_FOUND=1"
if exist "C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe" set "SUMATRA_FOUND=1"
if exist "%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe" set "SUMATRA_FOUND=1"

if "%SUMATRA_FOUND%"=="0" (
    echo      SumatraPDF not found. Installing...
    winget install SumatraPDF.SumatraPDF --accept-package-agreements --accept-source-agreements
    if %errorLevel% neq 0 (
        echo [!] Failed to auto-install SumatraPDF
        echo     Please install manually from https://www.sumatrapdfreader.org/
    ) else (
        echo      SumatraPDF installed!
    )
) else (
    echo      SumatraPDF already installed
)

echo.
echo [4/5] Creating startup shortcut...
powershell -ExecutionPolicy Bypass -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; ^
   $Startup = $WshShell.SpecialFolders('Startup'); ^
   $Shortcut = $WshShell.CreateShortcut(\"$Startup\PrintServer.lnk\"); ^
   $Shortcut.TargetPath = '%~dp0START-PrintServer.bat'; ^
   $Shortcut.WorkingDirectory = '%~dp0'; ^
   $Shortcut.WindowStyle = 7; ^
   $Shortcut.Save(); ^
   Write-Host '     Startup shortcut created!'"

echo.
echo [5/5] Creating temp folder...
if not exist "%~dp0temp" mkdir "%~dp0temp"
echo      Temp folder ready

echo.
echo ==========================================
echo   SETUP COMPLETE!
echo ==========================================
echo.
echo   Run START-PrintServer.bat to start
echo   Print Server will auto-start on Windows boot.
echo.
pause
