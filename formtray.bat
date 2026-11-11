@echo off
setlocal
cd /d "%~dp0"

if /I "%~1"=="cli" goto cli

where cargo >nul 2>nul || (echo Rust is required: https://rustup.rs. Then run formtray_oc_install.bat & exit /b 1)
if not exist frontend\node_modules (echo Run formtray_oc_install.bat first. & exit /b 1)

where curl >nul 2>nul || goto nocurl
call :ping || start "FormTray interface" /b cmd /c "cd frontend && npm run dev"
set /a tries=0
:wait
call :ping && goto ready
set /a tries+=1
if %tries% lss 20 (timeout /t 1 /nobreak >nul & goto wait)
goto ready
:nocurl
start "FormTray interface" /b cmd /c "cd frontend && npm run dev"
timeout /t 3 /nobreak >nul
:ready
cargo run -p formtray -- %*
exit /b %errorlevel%

:cli
cargo build -q --release -p formtray-cli || exit /b 1
target\release\formtray-cli.exe %*
exit /b %errorlevel%

:ping
curl -s -o nul --max-time 1 http://localhost:5610/ >nul 2>nul
exit /b %errorlevel%
