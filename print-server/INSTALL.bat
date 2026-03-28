@echo off
title Print Server - One-Click Installer

echo.
echo ==========================================
echo   PRINT SERVER - ONE-CLICK INSTALLER
echo   StockManager v2.0
echo ==========================================
echo.
echo   This script will automatically:
echo     1. Copy files to C:\print-server
echo     2. Install Node.js (if needed)
echo     3. Install npm packages
echo     4. Install SumatraPDF (for printing)
echo     5. Create auto-start shortcut
echo     6. Start Print Server
echo.
echo ==========================================
echo.

:: ============================================
:: CHECK: config.json
:: ============================================
if not exist "%~dp0config.json" (
    echo [ERROR] config.json not found!
    echo.
    echo   config.json must be in the same folder as INSTALL.bat
    echo   Download it from Store Settings in the web app.
    echo.
    pause
    exit /b 1
)

:: ============================================
:: CHECK: Administrator
:: ============================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Administrator required!
    echo     Right-click INSTALL.bat and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

set INSTALL_DIR=C:\print-server

:: ============================================
:: STEP 1: Copy files to C:\print-server
:: ============================================
echo [1/6] Copying files to %INSTALL_DIR% ...

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\lib" mkdir "%INSTALL_DIR%\lib"
if not exist "%INSTALL_DIR%\temp" mkdir "%INSTALL_DIR%\temp"

copy /Y "%~dp0config.json" "%INSTALL_DIR%\config.json" >nul
copy /Y "%~dp0print-server.js" "%INSTALL_DIR%\print-server.js" >nul
copy /Y "%~dp0package.json" "%INSTALL_DIR%\package.json" >nul
copy /Y "%~dp0RawPrint.ps1" "%INSTALL_DIR%\RawPrint.ps1" >nul 2>&1
copy /Y "%~dp0config.json.example" "%INSTALL_DIR%\config.json.example" >nul 2>&1
copy /Y "%~dp0lib\*.js" "%INSTALL_DIR%\lib\" >nul
copy /Y "%~dp0START-PrintServer.bat" "%INSTALL_DIR%\START-PrintServer.bat" >nul
copy /Y "%~dpnx0" "%INSTALL_DIR%\INSTALL.bat" >nul

echo       [OK] Files copied to %INSTALL_DIR%

cd /d "%INSTALL_DIR%"

:: ============================================
:: STEP 2: Install Node.js
:: ============================================
echo.
echo [2/6] Checking Node.js ...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo       Node.js not found. Installing...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %errorLevel% neq 0 (
        echo.
        echo [!] Failed to install Node.js automatically.
        echo     Please install from https://nodejs.org/
        echo     Then run INSTALL.bat again.
        echo.
        pause
        exit /b 1
    )
    echo       Node.js installed!
    echo.
    echo [!] Please close this window and run INSTALL.bat again.
    echo     (So the system can find Node.js)
    pause
    exit /b 0
) else (
    for /f "tokens=*" %%i in ('node -v') do echo       Node.js %%i [OK]
)

:: ============================================
:: STEP 3: Install npm packages
:: ============================================
echo.
echo [3/6] Installing npm packages ...
if not exist "%INSTALL_DIR%\node_modules\@supabase" (
    cd /d "%INSTALL_DIR%"
    call npm install --production 2>nul
    if %errorLevel% neq 0 (
        echo [!] Failed to install npm packages.
        pause
        exit /b 1
    )
    echo       [OK] npm packages installed
) else (
    echo       [OK] npm packages already installed
)

:: ============================================
:: STEP 4: Install SumatraPDF
:: ============================================
echo.
echo [4/6] Checking SumatraPDF ...
set SUMATRA_FOUND=0
if exist "C:\Program Files\SumatraPDF\SumatraPDF.exe" set SUMATRA_FOUND=1
if exist "C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe" set SUMATRA_FOUND=1
if exist "%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe" set SUMATRA_FOUND=1

if "%SUMATRA_FOUND%"=="0" (
    echo       SumatraPDF not found. Installing...
    winget install SumatraPDF.SumatraPDF --accept-package-agreements --accept-source-agreements
    if %errorLevel% neq 0 (
        echo [!] Failed to auto-install SumatraPDF.
        echo     Please install from https://www.sumatrapdfreader.org/
    ) else (
        echo       [OK] SumatraPDF installed
    )
) else (
    echo       [OK] SumatraPDF already installed
)

:: ============================================
:: STEP 5: Create Startup Shortcut
:: ============================================
echo.
echo [5/6] Creating startup shortcut ...
powershell -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut($ws.SpecialFolders('Startup') + '\PrintServer.lnk'); $s.TargetPath = 'C:\print-server\START-PrintServer.bat'; $s.WorkingDirectory = 'C:\print-server'; $s.WindowStyle = 7; $s.Save(); Write-Host '      [OK] Startup shortcut created'"

:: ============================================
:: STEP 6: Start Print Server
:: ============================================
echo.
echo [6/6] Starting Print Server ...
echo.
echo ==========================================
echo   INSTALLATION COMPLETE!
echo ==========================================
echo.
echo   Installed to: %INSTALL_DIR%
echo   Auto-start:   ON (runs on Windows boot)
echo.
echo   Starting Print Server now ...
echo   Press Ctrl+C to stop.
echo.
echo ==========================================
echo.

cd /d "%INSTALL_DIR%"
node print-server.js

echo.
echo ==========================================
echo   Print Server stopped.
echo   Double-click C:\print-server\START-PrintServer.bat to restart.
echo ==========================================
pause
