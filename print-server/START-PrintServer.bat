@echo off
chcp 65001 >nul
title Deposit Print Server v2.0

echo ==========================================
echo   DEPOSIT PRINT SERVER v2.0
echo ==========================================
echo.

set "INSTALL_DIR=C:\print-server"

:: ตรวจว่าติดตั้งแล้ว
if not exist "%INSTALL_DIR%\config.json" (
    echo [ERROR] ยังไม่ได้ติดตั้ง!
    echo         กรุณารัน INSTALL.bat ก่อน
    pause
    exit /b 1
)

:: ตรวจ Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ไม่พบ Node.js กรุณารัน INSTALL.bat ก่อน
    pause
    exit /b 1
)

:: ตรวจ npm packages
if not exist "%INSTALL_DIR%\node_modules\@supabase" (
    echo [*] ติดตั้ง npm packages ...
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
echo   Print Server stopped
echo ==========================================
pause
