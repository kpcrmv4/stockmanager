@echo off
chcp 65001 >nul
title Print Server - One-Click Installer

echo.
echo ==========================================
echo   PRINT SERVER - ONE-CLICK INSTALLER
echo   StockManager v2.0
echo ==========================================
echo.
echo   สคริปต์นี้จะทำทุกอย่างให้อัตโนมัติ:
echo     1. คัดลอกไฟล์ไปที่ C:\print-server
echo     2. ติดตั้ง Node.js (ถ้ายังไม่มี)
echo     3. ติดตั้ง npm packages
echo     4. ติดตั้ง SumatraPDF (สำหรับพิมพ์)
echo     5. สร้าง Shortcut เปิดอัตโนมัติตอนเปิดเครื่อง
echo     6. เริ่มต้น Print Server
echo.
echo ==========================================
echo.

:: ============================================
:: CHECK: config.json ต้องอยู่ในโฟลเดอร์เดียวกัน
:: ============================================
if not exist "%~dp0config.json" (
    echo [ERROR] ไม่พบ config.json!
    echo.
    echo   ไฟล์ config.json ต้องอยู่ในโฟลเดอร์เดียวกับ INSTALL.bat
    echo   ดาวน์โหลดได้จากหน้า Settings ในแอป
    echo.
    pause
    exit /b 1
)

:: ============================================
:: CHECK: ต้องรันในฐานะ Administrator
:: ============================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] ต้องรันในฐานะ Administrator
    echo     กรุณาคลิกขวาที่ INSTALL.bat แล้วเลือก "Run as administrator"
    echo.
    pause
    exit /b 1
)

set "INSTALL_DIR=C:\print-server"

:: ============================================
:: STEP 1: คัดลอกไฟล์ทั้งหมดไปที่ C:\print-server
:: ============================================
echo [1/6] คัดลอกไฟล์ไปที่ %INSTALL_DIR% ...

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\lib" mkdir "%INSTALL_DIR%\lib"
if not exist "%INSTALL_DIR%\temp" mkdir "%INSTALL_DIR%\temp"

:: คัดลอกไฟล์หลัก
copy /Y "%~dp0config.json" "%INSTALL_DIR%\config.json" >nul
copy /Y "%~dp0print-server.js" "%INSTALL_DIR%\print-server.js" >nul
copy /Y "%~dp0package.json" "%INSTALL_DIR%\package.json" >nul
copy /Y "%~dp0RawPrint.ps1" "%INSTALL_DIR%\RawPrint.ps1" >nul 2>&1
copy /Y "%~dp0config.json.example" "%INSTALL_DIR%\config.json.example" >nul 2>&1

:: คัดลอก lib/
copy /Y "%~dp0lib\*.js" "%INSTALL_DIR%\lib\" >nul

:: คัดลอก bat files (สำหรับรันทีหลัง)
copy /Y "%~dp0START-PrintServer.bat" "%INSTALL_DIR%\START-PrintServer.bat" >nul
copy /Y "%~dpnx0" "%INSTALL_DIR%\INSTALL.bat" >nul

echo       [OK] คัดลอกไฟล์ไปที่ %INSTALL_DIR% เรียบร้อย

:: เปลี่ยน working directory ไปที่ install dir
cd /d "%INSTALL_DIR%"

:: ============================================
:: STEP 2: ติดตั้ง Node.js (ถ้ายังไม่มี)
:: ============================================
echo.
echo [2/6] ตรวจสอบ Node.js ...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo       Node.js ไม่พบ กำลังติดตั้ง...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %errorLevel% neq 0 (
        echo.
        echo [!] ติดตั้ง Node.js อัตโนมัติไม่สำเร็จ
        echo     กรุณาติดตั้งเองที่ https://nodejs.org/
        echo     แล้วรัน INSTALL.bat อีกครั้ง
        echo.
        pause
        exit /b 1
    )
    echo       Node.js ติดตั้งสำเร็จ!
    echo.
    echo [!] กรุณาปิดหน้าต่างนี้ แล้วรัน INSTALL.bat อีกครั้ง
    echo     (เพื่อให้ระบบรู้จัก Node.js)
    pause
    exit /b 0
) else (
    for /f "tokens=*" %%i in ('node -v') do echo       Node.js %%i [OK]
)

:: ============================================
:: STEP 3: ติดตั้ง npm packages
:: ============================================
echo.
echo [3/6] ติดตั้ง npm packages ...
if not exist "%INSTALL_DIR%\node_modules\@supabase" (
    cd /d "%INSTALL_DIR%"
    call npm install --production 2>nul
    if %errorLevel% neq 0 (
        echo [!] ติดตั้ง npm packages ไม่สำเร็จ
        pause
        exit /b 1
    )
    echo       [OK] npm packages ติดตั้งเรียบร้อย
) else (
    echo       [OK] npm packages ติดตั้งแล้ว
)

:: ============================================
:: STEP 4: ติดตั้ง SumatraPDF (สำหรับสั่งพิมพ์ PDF)
:: ============================================
echo.
echo [4/6] ตรวจสอบ SumatraPDF ...
set "SUMATRA_FOUND=0"
if exist "C:\Program Files\SumatraPDF\SumatraPDF.exe" set "SUMATRA_FOUND=1"
if exist "C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe" set "SUMATRA_FOUND=1"
if exist "%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe" set "SUMATRA_FOUND=1"

if "%SUMATRA_FOUND%"=="0" (
    echo       SumatraPDF ไม่พบ กำลังติดตั้ง...
    winget install SumatraPDF.SumatraPDF --accept-package-agreements --accept-source-agreements
    if %errorLevel% neq 0 (
        echo [!] ติดตั้ง SumatraPDF อัตโนมัติไม่สำเร็จ
        echo     กรุณาติดตั้งเองที่ https://www.sumatrapdfreader.org/
    ) else (
        echo       [OK] SumatraPDF ติดตั้งสำเร็จ
    )
) else (
    echo       [OK] SumatraPDF ติดตั้งแล้ว
)

:: ============================================
:: STEP 5: สร้าง Startup Shortcut (เปิดอัตโนมัติ)
:: ============================================
echo.
echo [5/6] สร้าง Startup Shortcut ...
powershell -ExecutionPolicy Bypass -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; ^
   $Startup = $WshShell.SpecialFolders('Startup'); ^
   $Shortcut = $WshShell.CreateShortcut(\"$Startup\PrintServer.lnk\"); ^
   $Shortcut.TargetPath = 'C:\print-server\START-PrintServer.bat'; ^
   $Shortcut.WorkingDirectory = 'C:\print-server'; ^
   $Shortcut.WindowStyle = 7; ^
   $Shortcut.Save(); ^
   Write-Host '      [OK] Startup Shortcut created'"

:: ============================================
:: STEP 6: เริ่มต้น Print Server
:: ============================================
echo.
echo [6/6] เริ่มต้น Print Server ...
echo.
echo ==========================================
echo   ติดตั้งเสร็จสมบูรณ์!
echo ==========================================
echo.
echo   ไฟล์ติดตั้งที่: %INSTALL_DIR%
echo   Print Server จะเปิดอัตโนมัติทุกครั้งที่เปิดเครื่อง
echo.
echo   กำลังเริ่ม Print Server ...
echo   (กด Ctrl+C เพื่อหยุด)
echo.
echo ==========================================
echo.

cd /d "%INSTALL_DIR%"
node print-server.js

:: ถ้าหยุดทำงาน
echo.
echo ==========================================
echo   Print Server หยุดทำงาน
echo   ดับเบิลคลิก C:\print-server\START-PrintServer.bat เพื่อเริ่มใหม่
echo ==========================================
pause
