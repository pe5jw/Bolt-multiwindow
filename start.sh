#!/usr/bin/env bash
# ── Electron Multi-Window — Linux startscript ─────────────────────────────────
set -e
cd "$(dirname "$0")"

# Controleer Node.js
if ! command -v node &>/dev/null; then
    echo "[FOUT] Node.js niet gevonden."
    echo "       Installeer via: sudo apt install nodejs npm  (Debian/Ubuntu)"
    echo "       Of via nvm:     https://github.com/nvm-sh/nvm"
    exit 1
fi

# Controleer npm
if ! command -v npm &>/dev/null; then
    echo "[FOUT] npm niet gevonden. Installeer: sudo apt install npm"
    exit 1
fi

# Eerste keer: dependencies installeren
if [ ! -d "node_modules" ]; then
    echo "[INFO] Eerste keer starten — afhankelijkheden installeren..."
    echo "       Dit kan een paar minuten duren."
    echo ""

    # Build tools controleren
    if ! command -v make &>/dev/null || ! command -v g++ &>/dev/null; then
        echo "[WAARSCHUWING] Build tools ontbreken mogelijk."
        echo "               Installeer: sudo apt install build-essential"
        echo ""
    fi

    npm install
    npm run rebuild:linux
    echo ""
    echo "[OK] Installatie klaar!"
    echo ""
fi

# Audio: ALSA / PulseAudio / PipeWire hints
if command -v pipewire &>/dev/null; then
    echo "[INFO] PipeWire gevonden — audio werkt via PipeWire."
elif command -v pulseaudio &>/dev/null; then
    echo "[INFO] PulseAudio gevonden."
fi

# App starten (Wayland of X11 automatisch)
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    echo "[INFO] Wayland sessie gevonden."
    exec npx electron . --enable-features=UseOzonePlatform
else
    exec npx electron .
fi
