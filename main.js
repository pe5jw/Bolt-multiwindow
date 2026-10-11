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
const APP_DIR = process.env.PORTABLE_EXECUTABLE_DIR
  ?? (app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath())

function findConfigs() {
  const files = fs.readdirSync(APP_DIR)
  return files.filter(f => /^config.*\.json$/i.test(f)).sort()
}

async function pickConfig() {
  const configs = findConfigs()
  if (configs.length === 0) {
    dialog.showErrorBox('Geen config gevonden', `Geen config*.json gevonden in:\n${APP_DIR}`)
    app.quit()
    return null
  }
  if (configs.length === 1) return path.join(APP_DIR, configs[0])
  const buttons = [...configs, 'Annuleren']
  const result = await dialog.showMessageBox({
    type: 'question', title: 'Bolt-MultiWindow',
    message: 'Kies een configuratie', detail: `Gevonden in: ${APP_DIR}`,
    buttons, defaultId: 0, cancelId: buttons.length - 1,
  })
  const chosen = result.response
  if (chosen === configs.length) return null
  return path.join(APP_DIR, configs[chosen])
}

let ACTIVE_CONFIG_PATH = null

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(ACTIVE_CONFIG_PATH, 'utf8'))
  } catch (err) {
    dialog.showErrorBox('Config fout', `Kan config niet lezen:\n${ACTIVE_CONFIG_PATH}\n\n${err.message}`)
    app.quit()
    return null
  }
}

function saveConfig(config) {
  fs.writeFileSync(ACTIVE_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

// ── MIDI setup ────────────────────────────────────────────────────────────────
let midi
try { midi = require('@julusian/midi') } catch {
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
  inp.closePort(); out.closePort()
  return { inputs, outputs }
}

// ── Toolbar injectie ──────────────────────────────────────────────────────────
// Bouwt de JS-string die in de geladen pagina wordt geïnjecteerd.
// Werkt net als de BoltSDR client: geen iframe, direct in de pagina.
function buildToolbarScript(winConfig, appConfig) {
  const toolbarHeight  = appConfig.toolbar?.height  ?? 36
  const toolbarVisible = appConfig.toolbar?.alwaysVisible ?? true
  const midiEnabled    = appConfig.midi?.enabled ?? false
  const windowId       = winConfig.id
  const savedAudioIn   = winConfig.audioIn  ? JSON.stringify(winConfig.audioIn)  : 'null'
  const savedAudioOut  = winConfig.audioOut ? JSON.stringify(winConfig.audioOut) : 'null'
  const savedMidiIn    = winConfig.midiIn   != null ? winConfig.midiIn  : -1
  const savedMidiOut   = winConfig.midiOut  != null ? winConfig.midiOut : -1

  // Toolbar HTML en CSS als string
  const html = `
    <div id="bmw-toolbar" style="
      position:fixed;top:0;left:0;right:0;
      height:${toolbarHeight}px;
      background:#111;border-bottom:1px solid #333;
      display:flex;align-items:center;gap:6px;padding:0 8px;
      font-family:monospace;font-size:11px;color:#ccc;
      z-index:2147483647;
      box-sizing:border-box;
      -webkit-app-region:drag;
    ">
      <div style="display:flex;align-items:center;gap:4px;padding:0 6px;border-right:1px solid #333;height:100%;-webkit-app-region:no-drag">
        <span style="color:#888;font-size:10px">🎙 In</span>
        <select id="bmw-ain" title="Audio invoer" style="background:#222;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;max-width:130px;cursor:pointer">
          <option value="">— geen —</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:4px;padding:0 6px;border-right:1px solid #333;height:100%;-webkit-app-region:no-drag">
        <span style="color:#888;font-size:10px">🔊 Uit</span>
        <select id="bmw-aout" title="Audio uitvoer" style="background:#222;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;max-width:130px;cursor:pointer">
          <option value="">— geen —</option>
        </select>
      </div>
      ${midiEnabled ? `
      <div style="display:flex;align-items:center;gap:4px;padding:0 6px;border-right:1px solid #333;height:100%;-webkit-app-region:no-drag">
        <span style="color:#888;font-size:10px">🎹 In</span>
        <select id="bmw-min" style="background:#222;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;max-width:130px;cursor:pointer">
          <option value="-1">— geen —</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:4px;padding:0 6px;border-right:1px solid #333;height:100%;-webkit-app-region:no-drag">
        <span style="color:#888;font-size:10px">🎹 Uit</span>
        <select id="bmw-mout" style="background:#222;color:#ccc;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:10px;max-width:130px;cursor:pointer">
          <option value="-1">— geen —</option>
        </select>
      </div>
      <div id="bmw-mstatus" style="padding:2px 8px;border:1px solid #333;border-radius:12px;font-size:10px;color:#888;-webkit-app-region:no-drag">geen MIDI</div>
      ` : ''}
    </div>
    <div id="bmw-spacer" style="position:fixed;top:${toolbarHeight}px;left:0;right:0;bottom:0;pointer-events:none;z-index:-1"></div>
  `

  return `
(async () => {
  try {
    // Verwijder bestaande toolbar indien aanwezig (bij page reload)
    const existing = document.getElementById('bmw-toolbar')
    if (existing) existing.remove()
    const existingSpacer = document.getElementById('bmw-spacer')
    if (existingSpacer) existingSpacer.remove()

    // Injecteer toolbar HTML
    const tmp = document.createElement('div')
    tmp.innerHTML = \`${html.replace(/`/g, '\\`')}\`
    while (tmp.firstChild) document.body.appendChild(tmp.firstChild)

    // Verschuif body-inhoud zodat toolbar er niet overheen valt
    document.body.style.marginTop = '${toolbarHeight}px'

    const toolbarEl = document.getElementById('bmw-toolbar')
    const ainSel    = document.getElementById('bmw-ain')
    const aoutSel   = document.getElementById('bmw-aout')

    // ── Toolbar zichtbaarheid ──────────────────────────────────────────────
    const VISIBLE = ${JSON.stringify(toolbarVisible)}
    if (VISIBLE === false || VISIBLE === 'false') {
      toolbarEl.style.display = 'none'
      document.body.style.marginTop = '0'
    } else if (VISIBLE === 'hide') {
      toolbarEl.style.transition = 'opacity 0.25s ease'
      toolbarEl.style.opacity = '0'
      toolbarEl.style.pointerEvents = 'none'
      const hotzone = document.createElement('div')
      hotzone.style.cssText = 'position:fixed;top:0;left:0;right:0;height:8px;z-index:2147483647;'
      document.body.appendChild(hotzone)
      let hideTimer = null
      function showBar() {
        toolbarEl.style.opacity = '1'; toolbarEl.style.pointerEvents = 'auto'
        clearTimeout(hideTimer)
      }
      function hideBar() {
        hideTimer = setTimeout(() => { toolbarEl.style.opacity = '0'; toolbarEl.style.pointerEvents = 'none' }, 2000)
      }
      hotzone.addEventListener('mouseenter', showBar)
      toolbarEl.addEventListener('mouseenter', showBar)
      toolbarEl.addEventListener('mouseleave', hideBar)
    }

    // ── Audio apparaten laden ──────────────────────────────────────────────
    async function loadAudioDevices() {
      try {
        const tmp2 = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        tmp2.getTracks().forEach(t => t.stop())
      } catch {}
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputs  = devices.filter(d => d.kind === 'audioinput')
      const outputs = devices.filter(d => d.kind === 'audiooutput')
      const mkOpts = (list) => '<option value="">— geen —</option>' +
        list.map(d => '<option value="' + d.deviceId + '">' + (d.label || d.deviceId.slice(0,20)) + '</option>').join('')
      if (ainSel)  ainSel.innerHTML  = mkOpts(inputs)
      if (aoutSel) aoutSel.innerHTML = mkOpts(outputs)
    }

    await loadAudioDevices()

    // Herstel opgeslagen waarden
    const savedIn  = ${savedAudioIn}
    const savedOut = ${savedAudioOut}
    if (savedIn  && ainSel)  { const o = [...ainSel.options].find(o => o.value === savedIn);   if (o) ainSel.value  = savedIn  }
    if (savedOut && aoutSel) { const o = [...aoutSel.options].find(o => o.value === savedOut); if (o) aoutSel.value = savedOut }

    // Stuur audio-config event naar de pagina (bolt-audio-config protocol)
    function dispatchAudioConfig() {
      window.dispatchEvent(new CustomEvent('bolt-audio-config', { detail: {
        tx1: { deviceId: ainSel?.value  || '', active: !!(ainSel?.value)  },
        rx1: { deviceId: aoutSel?.value || '', active: !!(aoutSel?.value) },
      }}))
    }
    dispatchAudioConfig()

    // Sla op + dispatch bij wijziging
    if (ainSel) ainSel.addEventListener('change', () => {
      window.electron?.saveDeviceSettings?.({ windowId: '${windowId}', audioIn: ainSel.value })
      dispatchAudioConfig()
    })
    if (aoutSel) aoutSel.addEventListener('change', () => {
      window.electron?.saveDeviceSettings?.({ windowId: '${windowId}', audioOut: aoutSel.value })
      dispatchAudioConfig()
    })

    navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices)

    ${midiEnabled ? `
    // ── MIDI ──────────────────────────────────────────────────────────────
    const minSel   = document.getElementById('bmw-min')
    const moutSel  = document.getElementById('bmw-mout')
    const mstatus  = document.getElementById('bmw-mstatus')

    const { inputs: midiIns, outputs: midiOuts } = await window.electron.getMidiPorts()
    if (minSel) minSel.innerHTML = '<option value="-1">— geen —</option>' +
      midiIns.map((n,i) => '<option value="'+i+'">'+n+'</option>').join('')
    if (moutSel) moutSel.innerHTML = '<option value="-1">— geen —</option>' +
      midiOuts.map((n,i) => '<option value="'+i+'">'+n+'</option>').join('')

    const savedMidiIn  = ${savedMidiIn}
    const savedMidiOut = ${savedMidiOut}
    if (savedMidiIn !== -1 && minSel) {
      const o = [...minSel.options].find(o => o.value === String(savedMidiIn))
      if (o) { minSel.value = String(savedMidiIn); window.electron.openMidiInput({ windowId: '${windowId}', port: savedMidiIn }); mstatus && (mstatus.textContent = 'in: '+o.text) }
    }
    if (savedMidiOut !== -1 && moutSel) {
      const o = [...moutSel.options].find(o => o.value === String(savedMidiOut))
      if (o) { moutSel.value = String(savedMidiOut); window.electron.openMidiOutput({ windowId: '${windowId}', port: savedMidiOut }) }
    }

    if (minSel) minSel.addEventListener('change', () => {
      const p = parseInt(minSel.value)
      window.electron.openMidiInput({ windowId: '${windowId}', port: p })
      window.electron.saveDeviceSettings({ windowId: '${windowId}', midiIn: p })
      mstatus && (mstatus.textContent = p === -1 ? 'geen MIDI' : 'in: '+minSel.options[minSel.selectedIndex].text)
    })
    if (moutSel) moutSel.addEventListener('change', () => {
      const p = parseInt(moutSel.value)
      window.electron.openMidiOutput({ windowId: '${windowId}', port: p })
      window.electron.saveDeviceSettings({ windowId: '${windowId}', midiOut: p })
    })

    window.electron.onMidi(({ msg }) => {
      if (!mstatus) return
      const [status, note, velocity] = msg
      const type = status >> 4
      let label = type === 9 && velocity > 0 ? '▶ N'+note+' v'+velocity
        : (type === 8 || (type === 9 && velocity === 0)) ? '■ N'+note
        : type === 11 ? 'CC'+note+'='+velocity : '0x'+status.toString(16)
      mstatus.textContent = label
      clearTimeout(window._bmwMidiTimer)
      window._bmwMidiTimer = setTimeout(() => {
        mstatus.textContent = minSel?.selectedIndex > 0 ? 'in: '+minSel.options[minSel.selectedIndex].text : 'geen MIDI'
      }, 1500)
    })
    ` : ''}

  } catch(e) { console.error('[BMW toolbar]', e) }
})()
`
}

// ── Vensters ──────────────────────────────────────────────────────────────────
const windows = {}

function createWindow(winConfig, appConfig) {
  const { id, url, width = 800, height = 600, title = id, x, y } = winConfig
  const toolbarVisible = appConfig.toolbar?.alwaysVisible ?? true

  const win = new BrowserWindow({
    width, height,
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

  // Laad de URL direct — geen iframe
  win.loadURL(url)
  win.setMenuBarVisibility(false)
  win.setAutoHideMenuBar(true)

  // Injecteer toolbar na elke paginalading
  win.webContents.on('did-finish-load', () => {
    win.setTitle(title)

    // Pas audio output toe op het venster (stuurt hele pagina mee)
    if (winConfig.audioOut) {
      try { win.webContents.setAudioOutputDevice(winConfig.audioOut) } catch {}
    }

    // Injecteer toolbar als overlay in de pagina
    const script = buildToolbarScript(winConfig, appConfig)
    win.webContents.executeJavaScript(script).catch(e => console.error('[BMW inject]', e))
  })

  // Grootte en positie opslaan bij sluiten
  win.on('close', () => {
    const [w, h] = win.getSize()
    const [px, py] = win.getPosition()
    const config = loadConfig()
    if (config) {
      const entry = config.windows.find(c => c.id === id)
      if (entry) { entry.width = w; entry.height = h; entry.x = px; entry.y = py; saveConfig(config) }
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
    // Update winConfig in-memory zodat herlaad ook werkt
    if (audioOut !== undefined) {
      entry.audioOut = audioOut
      const win = windows[windowId]
      if (win && !win.isDestroyed()) {
        try { win.webContents.setAudioOutputDevice(audioOut || 'default') } catch {}
      }
    }
  }
})
