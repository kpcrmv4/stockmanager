@echo off
title Print Server - One-Click Installer

echo.
echo ==========================================
echo   PRINT SERVER - ONE-CLICK INSTALLER
echo   StockManager v2.0
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
    echo   Download from Store Settings in the web app.
    echo.
    pause
    exit /b 1
)
echo [OK] config.json found

:: ============================================
:: STEP 1: Clean old + Copy files to C:\print-server
:: ============================================
echo.
echo [1/6] Copying files to C:\print-server ...
if exist "C:\print-server\node_modules" (
    echo      Removing old installation...
    rmdir /S /Q "C:\print-server\lib" >nul 2>&1
    del /Q "C:\print-server\print-server.js" >nul 2>&1
    del /Q "C:\print-server\package.json" >nul 2>&1
    del /Q "C:\print-server\RawPrint.ps1" >nul 2>&1
    del /Q "C:\print-server\INSTALL.bat" >nul 2>&1
    del /Q "C:\print-server\START-PrintServer.bat" >nul 2>&1
    del /Q "C:\print-server\config.json.example" >nul 2>&1
    echo      Old files removed (kept config.json + node_modules)
)
if not exist "C:\print-server" mkdir "C:\print-server"
if not exist "C:\print-server\lib" mkdir "C:\print-server\lib"
if not exist "C:\print-server\temp" mkdir "C:\print-server\temp"
copy /Y "%~dp0config.json" "C:\print-server\" >nul
copy /Y "%~dp0print-server.js" "C:\print-server\" >nul
copy /Y "%~dp0package.json" "C:\print-server\" >nul
copy /Y "%~dp0RawPrint.ps1" "C:\print-server\" >nul 2>&1
copy /Y "%~dp0config.json.example" "C:\print-server\" >nul 2>&1
copy /Y "%~dp0START-PrintServer.bat" "C:\print-server\" >nul
copy /Y "%~dpnx0" "C:\print-server\INSTALL.bat" >nul
if exist "%~dp0lib\*.js" copy /Y "%~dp0lib\*.js" "C:\print-server\lib\" >nul
echo      [OK] Files copied

:: ============================================
:: STEP 2: Check/Install Node.js
:: ============================================
echo.
echo [2/6] Checking Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 goto :NEED_NODE
for /f "tokens=*" %%i in ('node -v') do echo      Found: %%i
goto :STEP3

:NEED_NODE
echo      Node.js not found. Installing...
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if %errorLevel% neq 0 (
    echo [!] Failed to install Node.js
    echo     Please install manually from https://nodejs.org/
    pause
    exit /b 1
)
echo      Node.js installed successfully!
echo      [!] Please RESTART this script after Node.js installation
pause
exit /b 0

:: ============================================
:: STEP 3: Install npm packages
:: ============================================
:STEP3
echo.
echo [3/6] Installing npm packages...
cd /d "C:\print-server"
if exist "C:\print-server\node_modules\@supabase" goto :NPM_OK
call npm install --production
if %errorLevel% neq 0 (
    echo [!] Failed to install npm packages
    pause
    exit /b 1
)
echo      npm packages installed!
goto :STEP4

:NPM_OK
echo      npm packages already installed

:: ============================================
:: STEP 4: Check/Install SumatraPDF
:: ============================================
:STEP4
echo.
echo [4/6] Checking SumatraPDF...
if exist "C:\Program Files\SumatraPDF\SumatraPDF.exe" goto :SUMATRA_OK
if exist "C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe" goto :SUMATRA_OK
if exist "%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe" goto :SUMATRA_OK

echo      SumatraPDF not found. Installing...
winget install SumatraPDF.SumatraPDF --accept-package-agreements --accept-source-agreements
if %errorLevel% neq 0 (
    echo [!] Failed to auto-install SumatraPDF
    echo     Please install manually from https://www.sumatrapdfreader.org/
) else (
    echo      SumatraPDF installed!
)
goto :STEP5

:SUMATRA_OK
echo      SumatraPDF already installed

:: ============================================
:: STEP 5: Create startup shortcut
:: ============================================
:STEP5
echo.
echo [5/6] Creating startup shortcut...
powershell -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut($ws.SpecialFolders('Startup') + '\PrintServer.lnk'); $s.TargetPath = 'C:\print-server\START-PrintServer.bat'; $s.WorkingDirectory = 'C:\print-server'; $s.WindowStyle = 7; $s.Save()"
echo      Startup shortcut created!

:: ============================================
:: STEP 6: Start Print Server
:: ============================================
echo.
echo [6/6] Starting Print Server...
echo.
echo ==========================================
echo   INSTALLATION COMPLETE!
echo ==========================================
echo.
echo   Location:   C:\print-server
echo   Auto-start: ON (runs on Windows boot)
echo.
echo   Print Server is starting now...
echo   Press Ctrl+C to stop.
echo.
echo ==========================================
echo.

cd /d "C:\print-server"
node print-server.js

echo.
echo ==========================================
echo   Print Server stopped.
echo   Double-click C:\print-server\START-PrintServer.bat to restart.
echo ==========================================
pause
