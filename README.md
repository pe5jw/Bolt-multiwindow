# Bolt-MultiWindow

Één Electron-app met een variabel aantal vensters. Elk venster laadt een eigen URL en heeft zijn eigen audio- en MIDI-selectors. Ideaal als dashboard, mediacontroller of multi-scherm opstelling.

---

## Functionaliteiten

- **Meerdere vensters** — stel elk venster in met een eigen URL, titel, grootte en positie
- **Audio per venster** — kies een apart audio-invoer en -uitvoer apparaat per venster
- **MIDI per venster** — eigen MIDI-in en MIDI-uit poort per venster (via `@julusian/midi`)
- **Venstergrootte** — per venster instelbaar als vast of vrij formaat
- **Toolbar opties** — altijd zichtbaar, automatisch verbergen, of helemaal weg
- **Positie onthouden** — grootte en positie worden automatisch opgeslagen bij sluiten
- **Lokale SSL** — zelf-ondertekende certificaten worden geaccepteerd voor privé IP-adressen
- **Windows en Linux** — inclusief startscripts en snelkoppeling op het bureaublad

---

## Snel starten

### Windows (PowerShell of cmd)
```powershell
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
Grootte en positie worden automatisch opgeslagen bij het sluiten van een venster.
Zie `config.example.jsonc` voor een volledig becommentarieerde versie.

```jsonc
{
  "windows": [
    {
      "id": "scherm1",       // Uniek ID (geen spaties)
      "title": "Scherm 1",   // Titel in de titelbalk
      "url": "https://...",  // URL geladen in het venster
      "width": 1280,
      "height": 720,
      "x": 0,                // Beginpositie (optioneel, weglaten = automatisch)
      "y": 0,
      "resizable": true      // Zie opties hieronder
    }
    // Voeg zoveel vensters toe als je wilt
  ],
  "midi": {
    "enabled": true          // Zie opties hieronder
  },
  "toolbar": {
    "height": 36,            // Hoogte in pixels (aanbevolen: 32–48)
    "alwaysVisible": true    // Zie opties hieronder
  }
}
```

### `resizable` — venstergrootte

| Waarde | Gedrag |
|--------|--------|
| `true` | Venster vrij te vergroten/verkleinen met de muis *(standaard)* |
| `false` | Vast formaat, venster kan niet worden aangepast |

### `alwaysVisible` — toolbar gedrag

| Waarde | Gedrag |
|--------|--------|
| `true` | Toolbar altijd zichtbaar bovenaan het venster *(standaard)* |
| `"hide"` | Toolbar verdwijnt na 2 seconden; verschijnt weer als je met de muis naar de bovenkant beweegt |
| `false` | Toolbar helemaal verborgen; iframe vult het volledige venster |

### `midi.enabled` — MIDI-selectors

| Waarde | Gedrag |
|--------|--------|
| `true` | MIDI in/uit selectors zichtbaar in de toolbar per venster |
| `false` | MIDI volledig verborgen (ook als er MIDI-apparaten zijn) |

---

## Projectstructuur

```
bolt-multiwindow/
├── config.json               ← Jouw instellingen (wordt automatisch bijgewerkt)
├── config.example.jsonc      ← Voorbeeld met uitleg van alle opties
├── main.js                   ← Electron hoofdproces
├── preload.js                ← Beveiligde brug tussen main en renderer
├── package.json
├── start.bat                 ← Windows startscript
├── start.sh                  ← Linux startscript
├── maak-snelkoppeling.bat    ← Windows bureaublad snelkoppeling
├── maak-snelkoppeling.sh     ← Linux bureaublad + app-menu snelkoppeling
├── assets/
│   └── icon.svg
└── renderer/
    ├── window-ui.html        ← Toolbar lay-out en stijl
    └── window-ui.js          ← Venster logica (audio, MIDI, toolbar gedrag)
```

---

## MIDI

Werkt via [`@julusian/midi`](https://www.npmjs.com/package/@julusian/midi) —
heeft prebuilds voor Windows en Linux, geen compileren nodig.

Elk venster heeft volledig onafhankelijke MIDI-poorten. De statuspil in de toolbar
toont het laatste ontvangen MIDI-bericht (noot, velocity, kanaal of CC-waarde).

---

## Probleemoplossing

| Probleem | Oplossing |
|----------|-----------|
| `node` niet gevonden | Installeer [Node.js LTS](https://nodejs.org) |
| Geen audio apparaten | Sta microfoontoegang toe in OS-instellingen |
| MIDI poorten leeg | Sluit andere MIDI-software die de poorten bezet houdt |
| Wayland: vensters openen niet | Voeg `--ozone-platform=x11` toe aan `start.sh` |
| SSL fout op router/NAS | Privé IP-adressen (192.168.x.x, 10.x.x.x) worden automatisch geaccepteerd |
