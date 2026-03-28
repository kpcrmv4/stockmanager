@echo off
chcp 65001 >nul
title Deposit Print Server v2.0

echo ==========================================
echo   DEPOSIT PRINT SERVER v2.0
echo ==========================================
echo.

:: Check config.json
if not exist "%~dp0config.json" (
    echo [ERROR] config.json not found!
    echo         Download from Store Settings in the web app
    pause
    exit /b 1
)
echo [OK] config.json: Found

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found!
    echo         Please run SETUP.bat first
    pause
    exit /b 1
)
echo [OK] Node.js: Ready

:: Check npm packages
if not exist "%~dp0node_modules\@supabase" (
    echo [ERROR] npm packages not installed!
    echo         Please run SETUP.bat or: npm install
    pause
    exit /b 1
)
echo [OK] npm packages: Ready

echo.
echo ==========================================
echo   Starting Print Server...
echo   Press Ctrl+C to stop
echo ==========================================
echo.

:: Run Print Server
cd /d "%~dp0"
node print-server.js

:: If stopped
echo.
echo ==========================================
echo   Print Server stopped
echo ==========================================
pause
