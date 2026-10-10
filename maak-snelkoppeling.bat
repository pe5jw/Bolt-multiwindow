@echo off
:: Maakt een snelkoppeling aan op het bureaublad die start.bat aanroept
cd /d "%~dp0"
set APP_DIR=%~dp0
set SHORTCUT=%USERPROFILE%\Desktop\Electron MultiWindow.lnk
set START_BAT=%APP_DIR%start.bat

:: Schrijf tijdelijk VBScript
set VBS=%TEMP%\maak_snelkoppeling.vbs
(
echo Set oWS = WScript.CreateObject("WScript.Shell"^)
echo sLinkFile = "%SHORTCUT%"
echo Set oLink = oWS.CreateShortcut(sLinkFile^)
echo oLink.TargetPath = "%START_BAT%"
echo oLink.WorkingDirectory = "%APP_DIR%"
echo oLink.Description = "Electron Multi-Window App"
echo oLink.IconLocation = "%APP_DIR%assets\icon.ico,0"
echo oLink.Save
) > "%VBS%"

cscript //nologo "%VBS%"
del "%VBS%"

if exist "%SHORTCUT%" (
    echo [OK] Snelkoppeling aangemaakt op bureaublad:
    echo      %SHORTCUT%
) else (
    echo [FOUT] Snelkoppeling kon niet worden aangemaakt.
)
pause
