const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')

// ── Platform detectie ─────────────────────────────────────────────────────────
const IS_WIN   = process.platform === 'win32'
const IS_LINUX = process.platform === 'linux'

if (IS_LINUX) {
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform')
}

// Sta zelf-ondertekende certificaten toe voor lokale adressen
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  const isLocal = /^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/
    .test(url)
  if (isLocal) {
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})

app.on('ready', () => {
  const { session } = require('electron')
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    const isLocal = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/
      .test(request.hostname)
    callback(isLocal ? 0 : -3)
  })
})

// ── Config ────────────────────────────────────────────────────────────────────
// Bij een portable .exe: zoek configs naast de exe (niet in de ASAR)
// Bij development (electron .): zoek in de projectmap
const APP_DIR = app.isPackaged
  ? path.dirname(app.getPath('exe'))
  : app.getAppPath()

// Zoek alle config*.json bestanden in de app-map
function findConfigs() {
  const files = fs.readdirSync(APP_DIR)
  return files
    .filter(f => /^config.*\.json$/i.test(f))
    .sort()
}

// Laat de gebruiker kiezen welke config te gebruiken
// Geeft het gekozen pad terug, of null als geannuleerd
async function pickConfig() {
  const configs = findConfigs()

  if (configs.length === 0) {
    dialog.showErrorBox('Geen config gevonden', `Geen config*.json gevonden in:\n${APP_DIR}`)
    app.quit()
    return null
  }

  // Slechts één config → direct gebruiken, niet vragen
  if (configs.length === 1) {
    return path.join(APP_DIR, configs[0])
  }

  // Meerdere configs → keuzevenster tonen
  const buttons = [...configs, 'Annuleren']
  const result = await dialog.showMessageBox({
    type: 'question',
    title: 'Bolt-MultiWindow',
    message: 'Kies een configuratie',
    detail: `Gevonden in: ${APP_DIR}`,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
  })

  const chosen = result.response
  if (chosen === configs.length) return null   // Annuleren
  return path.join(APP_DIR, configs[chosen])
}

let ACTIVE_CONFIG_PATH = null

function loadConfig() {
  try {
    const raw = fs.readFileSync(ACTIVE_CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    dialog.showErrorBox(
      'Config fout',
      `Kan config niet lezen:\n${ACTIVE_CONFIG_PATH}\n\n${err.message}`
    )
    app.quit()
    return null
  }
}

function saveConfig(config) {
  fs.writeFileSync(ACTIVE_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

// ── MIDI setup ────────────────────────────────────────────────────────────────
let midi
try {
  midi = require('@julusian/midi')
} catch {
  console.warn('⚠️  @julusian/midi niet gevonden — MIDI uitgeschakeld.')
}

const midiInputs  = {}
const midiOutputs = {}

function getMidiPortNames() {
  if (!midi) return { inputs: [], outputs: [] }
  const inp = new midi.Input()
  const out = new midi.Output()
  const inputs  = Array.from({ length: inp.getPortCount() }, (_, i) => inp.getPortName(i))
  const outputs = Array.from({ length: out.getPortCount() }, (_, i) => out.getPortName(i))
  inp.closePort()
  out.closePort()
  return { inputs, outputs }
}

// ── Vensters ──────────────────────────────────────────────────────────────────
const windows = {}

function createWindow(winConfig, appConfig) {
  const { id, url, width = 800, height = 600, title = id, x, y } = winConfig
  const toolbarHeight  = appConfig.toolbar?.height ?? 36
  const toolbarVisible = appConfig.toolbar?.alwaysVisible ?? true

  const win = new BrowserWindow({
    width,
    height,
    x: x ?? undefined,
    y: y ?? undefined,
    title,
    resizable: winConfig.resizable ?? true,
    ...(IS_WIN ? { skipTaskbar: false } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      allowRunningInsecureContent: false,
    }
  })

  win.loadFile(path.join(__dirname, 'renderer', 'window-ui.html'))

  // Native menubalk instellen op basis van toolbarVisible
  if (toolbarVisible === false || toolbarVisible === 'false') {
    win.setMenuBarVisibility(false)
    win.setAutoHideMenuBar(true)
  } else if (toolbarVisible === 'hide') {
    win.setAutoHideMenuBar(true)
    win.setMenuBarVisibility(false)
  } else {
    win.setMenuBarVisibility(true)
    win.setAutoHideMenuBar(false)
  }

  win.webContents.once('did-finish-load', () => {
    win.setTitle(title)
    win.webContents.send('window-init', {
      id,
      url,
      title,
      toolbarHeight,
      midiEnabled: appConfig.midi?.enabled ?? false,
      toolbarVisible,
      audioIn:  winConfig.audioIn,
      audioOut: winConfig.audioOut,
      midiIn:   winConfig.midiIn,
      midiOut:  winConfig.midiOut,
    })
  })

  // Grootte en positie opslaan bij sluiten
  win.on('close', () => {
    const [w, h] = win.getSize()
    const [px, py] = win.getPosition()
    const config = loadConfig()
    if (config) {
      const entry = config.windows.find(c => c.id === id)
      if (entry) {
        entry.width = w; entry.height = h; entry.x = px; entry.y = py
        saveConfig(config)
      }
    }
    closeMidiForWindow(id)
    delete windows[id]
  })

  windows[id] = win
  return win
}

function closeMidiForWindow(windowId) {
  if (midiInputs[windowId])  { try { midiInputs[windowId].closePort()  } catch {} delete midiInputs[windowId]  }
  if (midiOutputs[windowId]) { try { midiOutputs[windowId].closePort() } catch {} delete midiOutputs[windowId] }
}

// ── App start ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  ACTIVE_CONFIG_PATH = await pickConfig()
  if (!ACTIVE_CONFIG_PATH) { app.quit(); return }

  const config = loadConfig()
  if (!config) return

  for (const winCfg of config.windows) {
    createWindow(winCfg, config)
  }
})

app.on('window-all-closed', () => app.quit())

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('midi-get-ports', () => getMidiPortNames())

ipcMain.on('midi-open-input', (_, { windowId, port }) => {
  if (!midi) return
  closeMidiForWindow(windowId)
  if (port === -1) return
  const input = new midi.Input()
  input.openPort(port)
  input.on('message', (dt, msg) => {
    windows[windowId]?.webContents.send('midi-message', { dt, msg: Array.from(msg) })
  })
  midiInputs[windowId] = input
})

ipcMain.on('midi-open-output', (_, { windowId, port }) => {
  if (!midi) return
  if (midiOutputs[windowId]) { try { midiOutputs[windowId].closePort() } catch {} delete midiOutputs[windowId] }
  if (port === -1) return
  const output = new midi.Output()
  output.openPort(port)
  midiOutputs[windowId] = output
})

ipcMain.on('midi-send', (_, { windowId, msg }) => {
  midiOutputs[windowId]?.sendMessage(msg)
})

ipcMain.on('create-window', (_, winConfig) => {
  const config = loadConfig()
  if (!config) return
  const entry = { id: `scherm${Date.now()}`, url: 'about:blank', width: 800, height: 600, ...winConfig }
  config.windows.push(entry)
  saveConfig(config)
  createWindow(entry, config)
})

ipcMain.on('close-window', (_, { windowId }) => {
  windows[windowId]?.close()
})

// Audio/MIDI apparaat-instellingen opslaan per venster in de actieve config
ipcMain.on('save-device-settings', (_, { windowId, audioIn, audioOut, midiIn, midiOut }) => {
  const config = loadConfig()
  if (!config) return
  const entry = config.windows.find(c => c.id === windowId)
  if (entry) {
    if (audioIn  !== undefined) entry.audioIn  = audioIn
    if (audioOut !== undefined) entry.audioOut = audioOut
    if (midiIn   !== undefined) entry.midiIn   = midiIn
    if (midiOut  !== undefined) entry.midiOut  = midiOut
    saveConfig(config)
  }
})
