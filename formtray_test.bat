@echo off
setlocal
cd /d "%~dp0"

if /I "%~1"=="test" shift
set "which=%~1"
if "%which%"=="" set "which=all"
set "rest="
:rest
shift
if "%~1"=="" goto check
set "rest=%rest% %1"
goto rest

:check
if /I "%which%"=="all" goto start
if /I "%which%"=="unit" goto start
if /I "%which%"=="native" goto start
echo unknown test layer: %which% (use unit, native or nothing for all)
exit /b 2

:start
set fail=0
if /I "%which%"=="native" goto native

if not exist frontend\node_modules (echo The interface is not installed. Run formtray_oc_install.bat first. & exit /b 1)
echo interface logic (vitest)
pushd frontend
call npx vitest run%rest%
if errorlevel 1 set fail=1
popd
if /I "%which%"=="unit" exit /b %fail%

:native
where cargo >nul 2>nul || (echo Rust is required: https://rustup.rs. Then run formtray_oc_install.bat & exit /b 1)
echo engine and command line (cargo test)
cargo test --locked -p formtray-core -p formtray-cli%rest%
if errorlevel 1 set fail=1
exit /b %fail%
