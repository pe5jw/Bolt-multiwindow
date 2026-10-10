#!/usr/bin/env bash
# ── Bolt-MultiWindow — Linux startscript ─────────────────────────────────────
set -e
cd "$(dirname "$0")"

# Controleer Node.js
if ! command -v node &>/dev/null; then
    echo "[FOUT] Node.js niet gevonden."
    echo "       Installeer via: sudo apt install nodejs npm  (Debian/Ubuntu)"
    echo "       Of via nvm:     https://github.com/nvm-sh/nvm"
    exit 1
fi

# Eerste keer: dependencies installeren
if [ ! -d "node_modules" ]; then
    echo "[INFO] Eerste keer starten - afhankelijkheden installeren..."
    echo ""
    npm install
    echo ""
    echo "[OK] Installatie klaar!"
    echo ""
fi

# App starten (Wayland of X11 automatisch)
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    exec npx electron . --enable-features=UseOzonePlatform
else
    exec npx electron .
fi
