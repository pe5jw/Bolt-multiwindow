# Electron Multi-Window

Één Electron-app met variabel aantal vensters. Elk venster heeft:
- Een eigen URL (iframe)
- Een eigen audio-invoer en -uitvoer selector
- Een eigen MIDI-in en MIDI-uit selector (via gifted)
- Instelbaar vast of variabel formaat

---

## Snel starten

### Windows
1. Dubbelklik **`start.bat`**
   - Installeert automatisch alles bij de eerste keer
   - Daarna start de app direct

2. Optioneel: dubbelklik **`maak-snelkoppeling.bat`** voor een bureaublad-icoon

> **Vereisten**: [Node.js](https://nodejs.org) + [Visual C++ Build Tools](https://aka.ms/vs/17/release/vs_BuildTools.exe)

### Linux
```bash
chmod +x start.sh maak-snelkoppeling.sh
./start.sh
# Snelkoppeling op bureaublad + app-menu:
./maak-snelkoppeling.sh
```

> **Vereisten**: `nodejs`, `npm`, `build-essential`  
> Ubuntu/Debian: `sudo apt install nodejs npm build-essential`

---

## config.json

De config staat **naast de app** (zelfde map als `main.js`).
Positie en grootte worden automatisch opgeslagen bij het sluiten.

```jsonc
{
  "windows": [
    {
      "id": "scherm1",          // uniek ID (intern)
      "title": "Scherm 1",      // venstertitel
      "url": "https://...",     // URL geladen in het venster
      "width": 1280,            // breedte in pixels
      "height": 720,            // hoogte in pixels
      "x": 0,                   // beginpositie links  (optioneel)
      "y": 0,                   // beginpositie boven  (optioneel)
      "resizable": true         // true = vrij formaat, false = vast
    }
    // Voeg zoveel vensters toe als je wilt
  ],
  "midi": {
    "enabled": true             // false = MIDI-selectors verbergen
  },
  "toolbar": {
    "height": 36                // hoogte toolbar in pixels
  }
}
```

---

## Projectstructuur

```
electron-multiwindow/
├── config.json                 ← jouw configuratie
├── main.js                     ← main process
├── preload.js                  ← IPC-brug
├── package.json
├── start.bat                   ← Windows startscript
├── start.sh                    ← Linux startscript
├── maak-snelkoppeling.bat      ← Windows bureaublad snelkoppeling
├── maak-snelkoppeling.sh       ← Linux bureaublad + app-menu entry
├── assets/
│   ├── icon.svg                ← vervang met eigen icon
│   ├── icon.ico                ← (Windows) zelf aanmaken uit SVG
│   └── icon.png                ← (Linux)  zelf aanmaken uit SVG
└── renderer/
    ├── window-ui.html          ← toolbar-shell per venster
    └── window-ui.js            ← audio + MIDI logica
```

---

## Icon vervangen

Zet je eigen icon als:
- `assets/icon.ico` — Windows (256×256 aanbevolen)
- `assets/icon.png` — Linux  (128×128 of 256×256)

Converteren vanuit SVG:
```bash
# Linux — met Inkscape
inkscape assets/icon.svg --export-png=assets/icon.png -w 128 -h 128

# Of met ImageMagick
convert -background none assets/icon.svg -resize 128x128 assets/icon.png
```

---

## MIDI

MIDI werkt via het `gifted` pakket (native node-addon).
Elk venster heeft zijn eigen MIDI-poorten, onafhankelijk van andere vensters.

Vanuit iframe MIDI sturen naar de output van hetzelfde venster:
```js
window.electron.sendMidi({ windowId: 'scherm1', msg: [0x90, 60, 100] })
// 0x90 = Note On kanaal 1, noot 60 (middle C), velocity 100
```

---

## Probleemoplossing

| Probleem | Oplossing |
|---|---|
| `gifted` compileert niet (Windows) | Installeer Visual C++ Build Tools |
| `gifted` compileert niet (Linux) | `sudo apt install build-essential` |
| Geen audio apparaten zichtbaar | Sta microfoontoegang toe in OS-instellingen |
| Wayland: vensters openen niet | Voeg `--ozone-platform=x11` toe aan `start.sh` |
| MIDI poorten leeg | Sluit andere MIDI-software die poorten bezet |
