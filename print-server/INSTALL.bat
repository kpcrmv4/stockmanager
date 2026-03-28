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

:: CHECK: config.json
if not exist "%~dp0config.json" goto :NO_CONFIG

:: CHECK: Administrator
net session >nul 2>&1
if %errorLevel% neq 0 goto :NO_ADMIN

set INSTALL_DIR=C:\print-server

:: ============================================
:: STEP 1: Copy files
:: ============================================
echo [1/6] Copying files to %INSTALL_DIR% ...

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\lib" mkdir "%INSTALL_DIR%\lib"
if not exist "%INSTALL_DIR%\temp" mkdir "%INSTALL_DIR%\temp"

copy /Y "%~dp0config.json" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0print-server.js" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0package.json" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0RawPrint.ps1" "%INSTALL_DIR%\" >nul 2>&1
copy /Y "%~dp0config.json.example" "%INSTALL_DIR%\" >nul 2>&1
copy /Y "%~dp0START-PrintServer.bat" "%INSTALL_DIR%\" >nul
copy /Y "%~dpnx0" "%INSTALL_DIR%\INSTALL.bat" >nul
if exist "%~dp0lib\*.js" copy /Y "%~dp0lib\*.js" "%INSTALL_DIR%\lib\" >nul

echo       [OK] Files copied

:: ============================================
:: STEP 2: Check Node.js
:: ============================================
echo.
echo [2/6] Checking Node.js ...
where node >nul 2>&1
if %errorLevel% neq 0 goto :INSTALL_NODE

for /f "tokens=*" %%i in ('node -v') do echo       Node.js %%i [OK]
goto :STEP3

:INSTALL_NODE
echo       Node.js not found.
echo.
echo       Opening Node.js download page ...
echo       Please install Node.js, then run INSTALL.bat again.
echo.
start https://nodejs.org/
pause
exit /b 1

:: ============================================
:: STEP 3: npm packages
:: ============================================
:STEP3
echo.
echo [3/6] Installing npm packages ...
cd /d "%INSTALL_DIR%"
if exist "%INSTALL_DIR%\node_modules\@supabase" goto :NPM_DONE
call npm install --production 2>nul
if %errorLevel% neq 0 goto :NPM_FAIL
:NPM_DONE
echo       [OK] npm packages ready
goto :STEP4

:NPM_FAIL
echo [!] Failed to install npm packages.
pause
exit /b 1

:: ============================================
:: STEP 4: SumatraPDF
:: ============================================
:STEP4
echo.
echo [4/6] Checking SumatraPDF ...
if exist "C:\Program Files\SumatraPDF\SumatraPDF.exe" goto :SUMATRA_OK
if exist "C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe" goto :SUMATRA_OK
if exist "%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe" goto :SUMATRA_OK

echo       SumatraPDF not found.
echo       Opening download page ...
start https://www.sumatrapdfreader.org/download-free-pdf-viewer
echo       Please install SumatraPDF, then press any key to continue.
pause >nul
goto :STEP5

:SUMATRA_OK
echo       [OK] SumatraPDF installed
goto :STEP5

:: ============================================
:: STEP 5: Startup shortcut
:: ============================================
:STEP5
echo.
echo [5/6] Creating startup shortcut ...
powershell -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut($ws.SpecialFolders('Startup') + '\PrintServer.lnk'); $s.TargetPath = 'C:\print-server\START-PrintServer.bat'; $s.WorkingDirectory = 'C:\print-server'; $s.WindowStyle = 7; $s.Save()"
echo       [OK] Shortcut created (auto-start on boot)

:: ============================================
:: STEP 6: Start
:: ============================================
echo.
echo [6/6] Starting Print Server ...
echo.
echo ==========================================
echo   INSTALLATION COMPLETE!
echo ==========================================
echo.
echo   Location:   %INSTALL_DIR%
echo   Auto-start: ON (runs on Windows boot)
echo.
echo   Press Ctrl+C to stop Print Server.
echo ==========================================
echo.

cd /d "%INSTALL_DIR%"
node print-server.js

echo.
echo   Print Server stopped.
echo   Run C:\print-server\START-PrintServer.bat to restart.
pause
exit /b 0

:: ============================================
:: ERROR HANDLERS
:: ============================================
:NO_CONFIG
echo [ERROR] config.json not found!
echo.
echo   config.json must be in the same folder as INSTALL.bat
echo   Download from Store Settings in the web app.
echo.
pause
exit /b 1

:NO_ADMIN
echo [!] Administrator required!
echo     Right-click INSTALL.bat - Run as administrator
echo.
pause
exit /b 1
