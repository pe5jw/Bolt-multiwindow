const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')

// ── Platform detectie ─────────────────────────────────────────────────────────
const IS_WIN   = process.platform === 'win32'
const IS_LINUX = process.platform === 'linux'

// Wayland / Ozone fix voor Linux (bijv. GNOME op Wayland)
if (IS_LINUX) {
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform')
  // Forceer X11 als Wayland problemen geeft — verwijder deze regel bij voorkeur
  // app.commandLine.appendSwitch('ozone-platform', 'x11')
}

// Sta zelf-ondertekende certificaten toe voor lokale adressen (routers, NAS, etc.)
// Alleen voor vensters waarvan de URL in config als "allowInsecure": true staat,
// of wanneer het een privé IP-adres betreft (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  const isLocal = /^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/
    .test(url)
  if (isLocal) {
    event.preventDefault()   // fout onderdrukken
    callback(true)           // certificaat accepteren
  } else {
    callback(false)          // externe sites: normaal weigeren
  }
})

// ── Config laden uit dezelfde map als de app ──────────────────────────────────
// app.getAppPath() werkt zowel in dev (map met package.json) als in gebouwde app
const CONFIG_PATH = path.join(app.getAppPath(), 'config.json')

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    dialog.showErrorBox(
      'Config niet gevonden',
      `Kan config.json niet lezen:\n${CONFIG_PATH}\n\n${err.message}`
    )
    app.quit()
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

// ── MIDI setup ────────────────────────────────────────────────────────────────
// @julusian/midi heeft prebuilds voor Windows/Linux/macOS — geen compileren nodig
let midi
try {
  midi = require('@julusian/midi')
} catch {
  console.warn('⚠️  @julusian/midi niet gevonden — MIDI uitgeschakeld. Voer "npm install" uit.')
}

// Per venster: open MIDI-inputs bijhouden zodat we ze kunnen sluiten
const midiInputs  = {}   // windowId → midi.Input instantie
const midiOutputs = {}   // windowId → midi.Output instantie

function getMidiPortNames() {
  if (!midi) return { inputs: [], outputs: [] }
  const inp = new midi.Input()
  const out = new midi.Output()
  const inputs  = Array.from({ length: inp.getPortCount()  }, (_, i) => inp.getPortName(i))
  const outputs = Array.from({ length: out.getPortCount()  }, (_, i) => out.getPortName(i))
  inp.closePort()
  out.closePort()
  return { inputs, outputs }
}

// ── Vensters ──────────────────────────────────────────────────────────────────
const windows = {}   // windowId (string uit config) → BrowserWindow

function createWindow(winConfig, appConfig) {
  const { id, url, width = 800, height = 600, title = id, x, y } = winConfig
  const toolbarHeight = appConfig.toolbar?.height ?? 36

  const win = new BrowserWindow({
    width,
    height,
    x: x ?? undefined,
    y: y ?? undefined,
    title,
    resizable: winConfig.resizable ?? true,   // false = vast formaat
    // Windows: toon in taakbalk per venster
    ...(IS_WIN ? { skipTaskbar: false } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Staat beveiligde media toe op beide platformen
      allowRunningInsecureContent: false,
    }
  })

  win.loadFile(path.join(__dirname, 'renderer', 'window-ui.html'))

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('window-init', {
      id,
      url,
      title,
      toolbarHeight,
      midiEnabled: appConfig.midi?.enabled ?? false,
    })
  })

  // Venstergrootte opslaan bij sluiten
  win.on('close', () => {
    const [w, h] = win.getSize()
    const [px, py] = win.getPosition()
    const config = loadConfig()
    const entry = config.windows.find(c => c.id === id)
    if (entry) {
      entry.width = w
      entry.height = h
      entry.x = px
      entry.y = py
      saveConfig(config)
    }
    // MIDI opruimen
    closeMidiForWindow(id)
    delete windows[id]
  })

  windows[id] = win
  return win
}

function closeMidiForWindow(windowId) {
  if (midiInputs[windowId]) {
    try { midiInputs[windowId].closePort() } catch {}
    delete midiInputs[windowId]
  }
  if (midiOutputs[windowId]) {
    try { midiOutputs[windowId].closePort() } catch {}
    delete midiOutputs[windowId]
  }
}

// ── App start ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const config = loadConfig()
  for (const winCfg of config.windows) {
    createWindow(winCfg, config)
  }
})

app.on('window-all-closed', () => app.quit())

// ── IPC handlers ──────────────────────────────────────────────────────────────

// Beschikbare MIDI-poorten opvragen
ipcMain.handle('midi-get-ports', () => getMidiPortNames())

// MIDI-input openen voor een specifiek venster
ipcMain.on('midi-open-input', (_, { windowId, port }) => {
  if (!midi) return
  closeMidiForWindow(windowId)   // sluit eventuele vorige poort

  if (port === -1) return        // "geen" geselecteerd

  const input = new midi.Input()
  input.openPort(port)
  input.on('message', (dt, msg) => {
    const win = windows[windowId]
    win?.webContents.send('midi-message', { dt, msg: Array.from(msg) })
  })
  midiInputs[windowId] = input
})

// MIDI-output openen voor een specifiek venster
ipcMain.on('midi-open-output', (_, { windowId, port }) => {
  if (!midi) return
  if (midiOutputs[windowId]) {
    try { midiOutputs[windowId].closePort() } catch {}
    delete midiOutputs[windowId]
  }
  if (port === -1) return

  const output = new midi.Output()
  output.openPort(port)
  midiOutputs[windowId] = output
})

// MIDI-bericht sturen vanuit renderer
ipcMain.on('midi-send', (_, { windowId, msg }) => {
  const out = midiOutputs[windowId]
  if (out) out.sendMessage(msg)
})

// Nieuw venster aanmaken vanuit renderer
ipcMain.on('create-window', (_, winConfig) => {
  const config = loadConfig()
  // Voeg toe aan config zodat het bij herstart ook bestaat
  const defaults = { id: `scherm${Date.now()}`, url: 'about:blank', width: 800, height: 600 }
  const entry = { ...defaults, ...winConfig }
  config.windows.push(entry)
  saveConfig(config)
  createWindow(entry, config)
})

// Venster sluiten vanuit renderer
ipcMain.on('close-window', (_, { windowId }) => {
  windows[windowId]?.close()
})
