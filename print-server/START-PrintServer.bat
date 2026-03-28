@echo off
title Deposit Print Server v2.0

echo ==========================================
echo   DEPOSIT PRINT SERVER v2.0
echo ==========================================
echo.

set INSTALL_DIR=C:\print-server

if not exist "%INSTALL_DIR%\config.json" (
    echo [ERROR] Not installed! Please run INSTALL.bat first.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found! Please run INSTALL.bat first.
    pause
    exit /b 1
)

if not exist "%INSTALL_DIR%\node_modules\@supabase" (
    echo [*] Installing npm packages ...
    cd /d "%INSTALL_DIR%"
    call npm install --production 2>nul
)

echo [OK] config.json: Found
echo [OK] Node.js: Ready
echo [OK] npm packages: Ready
echo.
echo ==========================================
echo   Starting Print Server ...
echo   Press Ctrl+C to stop
echo ==========================================
echo.

cd /d "%INSTALL_DIR%"
node print-server.js

echo.
echo ==========================================
echo   Print Server stopped.
echo ==========================================
pause
