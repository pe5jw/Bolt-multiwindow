#!/usr/bin/env bash
# Maakt een .desktop snelkoppeling aan op het bureaublad en in het app-menu
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_FILE="$HOME/Desktop/electron-multiwindow.desktop"
APPS_DIR="$HOME/.local/share/applications"
APP_FILE="$APPS_DIR/electron-multiwindow.desktop"
ICON="$SCRIPT_DIR/assets/icon.png"

# Fallback icon als eigen icon ontbreekt
if [ ! -f "$ICON" ]; then
    ICON="electron"
fi

CONTENT="[Desktop Entry]
Name=Electron MultiWindow
Comment=Multi-venster app met audio en MIDI
Exec=bash $SCRIPT_DIR/start.sh
Icon=$ICON
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Video;
StartupNotify=true
"

# Bureaublad snelkoppeling
if [ -d "$HOME/Desktop" ]; then
    echo "$CONTENT" > "$DESKTOP_FILE"
    chmod +x "$DESKTOP_FILE"
    # Vertrouwen geven in Nautilus/GNOME (negeer fout als niet beschikbaar)
    gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true
    echo "[OK] Bureaublad snelkoppeling: $DESKTOP_FILE"
fi

# App-menu entry
mkdir -p "$APPS_DIR"
echo "$CONTENT" > "$APP_FILE"
chmod +x "$APP_FILE"
update-desktop-database "$APPS_DIR" 2>/dev/null || true
echo "[OK] App-menu entry: $APP_FILE"

echo ""
echo "Klaar! Je kunt de app nu starten vanuit het bureaublad of app-menu."
