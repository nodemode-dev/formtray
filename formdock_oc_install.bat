@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (echo Node 20.19 or newer is required: https://nodejs.org & exit /b 1)
where cargo >nul 2>nul || (echo Rust is required: https://rustup.rs & exit /b 1)

pushd frontend
call npm install || exit /b 1
popd
cargo fetch || exit /b 1

echo.
echo FormDock is ready to run from source. Start it with: formdock.bat
echo To build the installers: build_app.bat
