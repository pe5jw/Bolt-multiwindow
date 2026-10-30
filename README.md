# Bolt-MultiWindow

Electron-app die meerdere vensters opent, elk met een eigen URL. Per venster is een zwevend audio/MIDI-paneel beschikbaar voor het instellen van audio-routing en MIDI-poorten. Ideaal als multi-scherm dashboard of radiostation-opstelling.

---

## Functionaliteiten

- **Meerdere vensters** — elk venster laadt een eigen URL, met eigen titel, grootte en positie
- **Floating audio/MIDI-paneel** — BoltSDR-stijl zweefpaneel per venster (rechtsboven, inklapbaar)
- **Audio-routing per venster** — kies RX-uitgang (speaker/VAC) en TX-ingang (microfoon/VAC) via `setSinkId()`
- **MIDI per venster** — eigen MIDI-in en MIDI-uit poort per venster (via `@julusian/midi`)
- **Toolbar per venster aan/uit** — vensters zonder audio/MIDI-behoefte kunnen het paneel uitzetten
- **Positie onthouden** — grootte en positie worden automatisch opgeslagen bij het sluiten
- **Meerdere configs** — meerdere `config*.json` bestanden naast de exe; bij opstarten een keuzevenster
- **Lokale SSL** — zelf-ondertekende certificaten worden geaccepteerd voor privé IP-adressen
- **BoltSDR-compatible** — stuurt `bolt-audio-config` CustomEvent naar geladen pagina's

---

## Installatie en gebruik

### Windows (portable exe)

1. Download `Bolt-MultiWindow x.x.x.exe` uit de [Releases](../../releases)
2. Zet de exe in een map naar keuze
3. Maak een `config.json` in dezelfde map (zie hieronder)
4. Dubbelklik de exe

### Vanuit broncode

```powershell
git clone https://github.com/pe5jw/Bolt-multiwindow
cd Bolt-multiwindow
npm install
npm start
```

Bouwen:
```powershell
npm run dist:win    # Windows portable exe
npm run dist:linux  # Linux tar.gz
```

---

## config.json

Staat **naast de exe** (of naast `main.js` bij ontwikkeling).  
Grootte en positie worden automatisch opgeslagen bij sluiten.

```jsonc
{
  "windows": [
    {
      "id": "sdr",
      "title": "SDR Ontvanger",
      "url": "http://192.168.1.10:8073",
      "width": 1280,
      "height": 800,
      "x": 0,
      "y": 0,
      "resizable": true,
      "toolbar": true,
      "audioIn": "",
      "audioOut": "",
      "midiIn": -1,
      "midiOut": -1
    },
    {
      "id": "kaart",
      "title": "Kaart",
      "url": "http://192.168.1.10:8080/map",
      "width": 800,
      "height": 600,
      "toolbar": false
    }
  ],
  "midi": {
    "enabled": true
  }
}
```

---

## Venster-opties

### `id` — uniek venster-ID
Verplicht. Wordt gebruikt als sleutel voor opgeslagen instellingen. Geen spaties.

### `title` — venstertitel
Tekst in de titelbalk. Standaard gelijk aan `id`.

### `url` — te laden URL
De webpagina die in het venster wordt geladen. Lokale en externe URLs werken. Privé IP-adressen (192.168.x.x, 10.x.x.x, 172.16-31.x.x) accepteren automatisch zelf-ondertekende SSL-certificaten.

### `width` / `height` — venstergrootte
Begingrootte in pixels. Wordt automatisch bijgewerkt bij sluiten.

### `x` / `y` — beginpositie
Positie van het venster op het scherm. Weglaten = automatisch bepaald door het OS. Wordt automatisch bijgewerkt bij sluiten.

### `resizable` — venster vergroot-/verkleinen

| Waarde | Gedrag |
|--------|--------|
| `true` | Vrij te vergroten/verkleinen *(standaard)* |
| `false` | Vast formaat |

### `toolbar` — audio/MIDI-paneel

| Waarde | Gedrag |
|--------|--------|
| `true` | Zwevend paneel rechtsboven zichtbaar *(standaard)* |
| `false` | Geen paneel — pagina blijft volledig ongewijzigd |

Gebruik `toolbar: false` voor vensters die geen audio- of MIDI-beheer nodig hebben, zoals kaarten, statuspagina's of dashboards.

### `audioOut` — audio-uitgang (RX)
DeviceId van het gewenste audio-uitvoerapparaat (speaker of VAC). Wordt automatisch opgeslagen na het klikken op **TOEPASSEN** in het paneel. Leeg laten = standaard systeemapparaat.

### `audioIn` — audio-ingang (TX)
DeviceId van het gewenste audio-invoerapparaat (microfoon of VAC). Wordt automatisch opgeslagen na **TOEPASSEN**.

### `midiIn` — MIDI-ingang
Poortnummer (0-gebaseerd) van de gewenste MIDI-ingang. `-1` = geen. Wordt automatisch opgeslagen bij selectie.

### `midiOut` — MIDI-uitgang
Poortnummer (0-gebaseerd) van de gewenste MIDI-uitgang. `-1` = geen.

---

## Globale opties

### `midi.enabled` — MIDI-selectors tonen

| Waarde | Gedrag |
|--------|--------|
| `true` | MIDI in/uit selectors zichtbaar in het paneel |
| `false` | MIDI volledig verborgen *(standaard)* |

---

## Het audio/MIDI-paneel

Het paneel verschijnt rechtsboven in elk venster met `toolbar: true`. Klik op de header om het in/uit te klappen.

| Element | Functie |
|---------|---------|
| **RX UIT** | Audio-uitgang — kies speaker of VAC voor ontvangstgeluid |
| **TX IN** | Audio-ingang — kies microfoon of VAC voor zenden |
| **MIDI IN** | MIDI-ingang voor dit venster |
| **MIDI UIT** | MIDI-uitgang voor dit venster |
| **TOEPASSEN** | Past instellingen toe en slaat op in config.json |

Na **TOEPASSEN** worden de instellingen opgeslagen en bij de volgende start automatisch hersteld.

Het paneel is versleepbaar (klik en sleep op de header).

### Audio-routing

Audio wordt gerouteerd via `setSinkId()` op alle `<audio>` en `<video>` elementen in de pagina. Voor pagina's die Web Audio API gebruiken (zoals BoltSDR) wordt bovendien een `bolt-audio-config` CustomEvent verstuurd. Een MutationObserver zorgt dat ook dynamisch toegevoegde media-elementen het juiste apparaat krijgen.

---

## Meerdere configuraties

Alle bestanden naast de exe die overeenkomen met `config*.json` worden automatisch opgepikt:

```
config.json           ← standaard opstelling
config-radio.json     ← radio opstelling
config-contest.json   ← contest opstelling
```

Bij **één** config start de app direct. Bij **meerdere** verschijnt een keuzevenster.

---

## MIDI

Werkt via [`@julusian/midi`](https://www.npmjs.com/package/@julusian/midi) — prebuilds voor Windows en Linux, geen compileren nodig.

Elk venster heeft volledig onafhankelijke MIDI-poorten. De statusregel in het paneel toont het laatste ontvangen MIDI-bericht (noot, velocity of CC-waarde).

---

## Probleemoplossing

| Probleem | Oplossing |
|----------|-----------|
| Geen config gevonden | Zet `config.json` in dezelfde map als de exe |
| Geen audio-apparaten in lijst | Sta microfoontoegang toe in OS-instellingen |
| Audio wisselt niet | Klik op **TOEPASSEN** na selectie; sommige apps vereisen herstarten |
| MIDI-poorten leeg | Sluit andere software die de MIDI-poorten bezet houdt |
| MIDI-fout bij selectie | Sommige virtuele MIDI-apparaten zijn niet compatibel met RtMidi; kies een andere poort |
| SSL-fout op lokale pagina | Privé IP-adressen worden automatisch geaccepteerd; publieke domeinen niet |
| Wayland: vensters openen niet | Start met `--ozone-platform=x11` of stel `ELECTRON_OZONE_PLATFORM_HINT=x11` in |

---

## Licentie

GPL-2.0-or-later — zie [LICENSE](LICENSE)  
Auteur: PE5JW
