@echo off
:: ── Electron Multi-Window — Windows startscript ───────────────────────────────
cd /d "%~dp0"

:: Controleer of Node.js beschikbaar is
where node >nul 2>&1
if errorlevel 1 (
    echo [FOUT] Node.js niet gevonden.
    echo Download het van https://nodejs.org en installeer het.
    pause
    exit /b 1
)

:: Eerste keer: installeer dependencies als node_modules ontbreekt
if not exist "node_modules" (
    echo [INFO] Eerste keer starten — afhankelijkheden installeren...
    echo        Dit kan een paar minuten duren.
    echo.
    call npm install
    if errorlevel 1 (
        echo [FOUT] npm install mislukt.
        pause
        exit /b 1
    )
    call npm run rebuild:win
    if errorlevel 1 (
        echo [FOUT] electron-rebuild mislukt.
        echo        Zorg dat Visual C++ Build Tools geinstalleerd zijn.
        echo        Download: https://aka.ms/vs/17/release/vs_BuildTools.exe
        pause
        exit /b 1
    )
    echo.
    echo [OK] Installatie klaar!
    echo.
)

:: App starten
call npx electron .
