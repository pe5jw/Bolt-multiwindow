# Bolt-MultiWindow

Één Electron-app met variabel aantal vensters. Elk venster heeft:
- Een eigen URL (iframe)
- Een eigen audio-invoer en -uitvoer selector
- Een eigen MIDI-in en MIDI-uit selector (via `@julusian/midi`)
- Instelbaar vast of variabel formaat (`resizable`)

---

## Snel starten

### Windows (PowerShell of cmd)
```powershell
# Uitpakken (ingebouwd in Windows 10+)
Expand-Archive electron-multiwindow.zip -DestinationPath .

cd electron-multiwindow
.\start.bat
```

Of dubbelklik gewoon **`start.bat`** — installeert alles automatisch de eerste keer.

Snelkoppeling op bureaublad: dubbelklik **`maak-snelkoppeling.bat`**

> **Vereiste**: [Node.js LTS](https://nodejs.org) — geen build tools nodig

### Linux
```bash
chmod +x start.sh maak-snelkoppeling.sh
./start.sh

# Snelkoppeling bureaublad + app-menu:
./maak-snelkoppeling.sh
```

> **Vereiste**: `sudo apt install nodejs npm` (Debian/Ubuntu)

---

## config.json

Staat **naast de app** (zelfde map als `main.js`).  
Positie en grootte worden automatisch opgeslagen bij het sluiten.

```jsonc
{
  "windows": [
    {
      "id": "scherm1",       // uniek ID
      "title": "Scherm 1",   // venstertitel
      "url": "https://...",  // URL geladen in het venster
      "width": 1280,
      "height": 720,
      "x": 0,                // beginpositie (optioneel)
      "y": 0,
      "resizable": true      // true = vrij formaat, false = vast
    }
    // voeg zoveel vensters toe als je wilt
  ],
  "midi": {
    "enabled": true          // false = MIDI-selectors verbergen
  },
  "toolbar": {
    "height": 36             // hoogte toolbar in pixels
  }
}
```

---

## Projectstructuur

```
bolt-multiwindow/
├── config.json
├── main.js
├── preload.js
├── package.json
├── start.bat                   ← Windows
├── start.sh                    ← Linux
├── maak-snelkoppeling.bat      ← Windows bureaublad
├── maak-snelkoppeling.sh       ← Linux bureaublad + app-menu
├── assets/
│   └── icon.svg
└── renderer/
    ├── window-ui.html
    └── window-ui.js
```

---

## MIDI

Werkt via [`@julusian/midi`](https://www.npmjs.com/package/@julusian/midi) —
heeft prebuilds voor Windows en Linux, geen compileren nodig.

Elk venster heeft eigen onafhankelijke MIDI-poorten.

---

## Probleemoplossing

| Probleem | Oplossing |
|---|---|
| `node` niet gevonden | Installeer [Node.js LTS](https://nodejs.org) |
| Geen audio apparaten | Sta microfoontoegang toe in OS-instellingen |
| MIDI poorten leeg | Sluit andere MIDI-software die poorten bezet houdt |
| Wayland: vensters openen niet | Voeg `--ozone-platform=x11` toe aan `start.sh` |
