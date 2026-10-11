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
// Zweefpaneel rechtsboven, BoltSDR-stijl. Klapt open/dicht.
// Audio: setSinkId() op alle audio/video-elementen in de pagina +
//        bolt-audio-config CustomEvent voor BoltSDR-compatible apps.
function buildToolbarScript(winConfig, appConfig) {
  const midiEnabled  = appConfig.midi?.enabled ?? false
  const windowId     = winConfig.id
  const savedAudioIn  = JSON.stringify(winConfig.audioIn  || '')
  const savedAudioOut = JSON.stringify(winConfig.audioOut || '')
  const savedMidiIn   = winConfig.midiIn  != null ? winConfig.midiIn  : -1
  const savedMidiOut  = winConfig.midiOut != null ? winConfig.midiOut : -1

  return `
(async () => {
  try {
    const WNDID = ${JSON.stringify(windowId)}

    // Verwijder vorige injectie bij page-reload
    document.getElementById('bmw-panel')?.remove()

    // ── Paneel aanmaken (BoltSDR-stijl: rechtsboven, inklapbaar) ──────────
    const panel = document.createElement('div')
    panel.id = 'bmw-panel'
    panel.style.cssText = 'position:fixed;top:0;right:0;cursor:move;background:#1a1a2e;border:1px solid #444;border-bottom-left-radius:6px;z-index:2147483647;font-family:monospace;font-size:10px;color:#888;min-width:220px;user-select:none;'

    const mkSel = (id) => '<select id="'+id+'" style="width:100%;background:#111;border:1px solid #333;color:#ccc;padding:2px;font-size:9px;margin-top:2px"><option value="">standaard</option></select>'
    const mkRow = (id, label) =>
      '<div style="margin-bottom:6px"><span style="color:#555;font-size:9px">'+label+'</span>'+mkSel(id)+'</div>'

    panel.innerHTML =
      '<div id="bmw-hdr" style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;cursor:pointer;background:#111;border-bottom:1px solid #333;">' +
        '<span style="color:#f0a500;font-size:9px;letter-spacing:2px">&#x1F50A; AUDIO</span>' +
        '<span id="bmw-arr" style="color:#555;font-size:10px;margin-left:8px">&#x25BC;</span>' +
      '</div>' +
      '<div id="bmw-body" style="display:none;padding:8px;">' +
        mkRow('bmw-aout', 'RX UIT (speaker/VAC)') +
        mkRow('bmw-ain',  'TX IN  (microfoon/VAC)') +
        ${midiEnabled ? `
        '<div style="border-top:1px solid #333;margin:6px 0"></div>' +
        '<div style="margin-bottom:6px"><span style="color:#555;font-size:9px">MIDI IN</span><select id="bmw-min" style="width:100%;background:#111;border:1px solid #333;color:#ccc;padding:2px;font-size:9px;margin-top:2px"><option value="-1">— geen —</option></select></div>' +
        '<div style="margin-bottom:6px"><span style="color:#555;font-size:9px">MIDI UIT</span><select id="bmw-mout" style="width:100%;background:#111;border:1px solid #333;color:#ccc;padding:2px;font-size:9px;margin-top:2px"><option value="-1">— geen —</option></select></div>' +
        '<div id="bmw-mst" style="font-size:9px;color:#555;margin-top:2px">geen MIDI</div>' +
        ` : `''`} +
        '<button id="bmw-apply" style="width:100%;background:#f0a500;border:none;color:#111;padding:4px;font-size:9px;border-radius:3px;cursor:pointer;margin-top:4px">TOEPASSEN</button>' +
      '</div>'

    document.body.appendChild(panel)

    // Slepen
    let dragging=false, dx=0, dy=0
    panel.addEventListener('mousedown', e => {
      if (['SELECT','BUTTON','INPUT'].includes(e.target.tagName)) return
      dragging=true; dx=e.clientX-panel.getBoundingClientRect().left; dy=e.clientY-panel.getBoundingClientRect().top; e.preventDefault()
    })
    document.addEventListener('mousemove', e => {
      if (!dragging) return
      panel.style.left=(e.clientX-dx)+'px'; panel.style.top=(e.clientY-dy)+'px'; panel.style.right='auto'
    })
    document.addEventListener('mouseup', () => dragging=false)

    // Inklappen
    let open = false
    document.getElementById('bmw-hdr').onclick = () => {
      open = !open
      document.getElementById('bmw-body').style.display = open ? 'block' : 'none'
      document.getElementById('bmw-arr').textContent = open ? '\\u25B2' : '\\u25BC'
    }

    const ainSel  = document.getElementById('bmw-ain')
    const aoutSel = document.getElementById('bmw-aout')

    // ── Audio apparaten laden ──────────────────────────────────────────────
    async function loadAudioDevices() {
      try { const t = await navigator.mediaDevices.getUserMedia({audio:true}); t.getTracks().forEach(t=>t.stop()) } catch {}
      const devs = await navigator.mediaDevices.enumerateDevices()
      const ins  = devs.filter(d=>d.kind==='audioinput')
      const outs = devs.filter(d=>d.kind==='audiooutput')
      const mkOpts = list => '<option value="">standaard</option>' +
        list.map(d=>'<option value="'+d.deviceId+'">'+(d.label||d.deviceId.slice(0,18))+'</option>').join('')
      ainSel.innerHTML  = mkOpts(ins)
      aoutSel.innerHTML = mkOpts(outs)
    }
    await loadAudioDevices()
    navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices)

    // Herstel opgeslagen waarden
    const sIn  = ${savedAudioIn}
    const sOut = ${savedAudioOut}
    if (sIn  && [...ainSel.options].find(o=>o.value===sIn))   ainSel.value  = sIn
    if (sOut && [...aoutSel.options].find(o=>o.value===sOut)) aoutSel.value = sOut

    // ── Audio toepassen ────────────────────────────────────────────────────
    // 1) setSinkId op alle bestaande en toekomstige audio/video-elementen
    // 2) bolt-audio-config CustomEvent voor BoltSDR-compatible apps
    async function applyAudio() {
      const outId = aoutSel.value || ''
      const inId  = ainSel.value  || ''

      // setSinkId op alle audio/video elementen in de pagina
      if (outId) {
        document.querySelectorAll('audio, video').forEach(async el => {
          try { await el.setSinkId(outId) } catch {}
        })
        // Observer voor nieuw toegevoegde elementen
        if (!window._bmwObserver) {
          window._bmwObserver = new MutationObserver(muts => {
            muts.forEach(m => m.addedNodes.forEach(n => {
              if (n.nodeType !== 1) return
              const els = n.matches?.('audio,video') ? [n] : [...(n.querySelectorAll?.('audio,video')||[])]
              els.forEach(async el => { try { await el.setSinkId(window._bmwSinkId||'') } catch {} })
            }))
          })
          window._bmwObserver.observe(document.body, {childList:true, subtree:true})
        }
        window._bmwSinkId = outId
      }

      // bolt-audio-config event (voor BoltSDR server-apps)
      window.dispatchEvent(new CustomEvent('bolt-audio-config', { detail: {
        rx1: { deviceId: outId, active: !!outId },
        rx2: { deviceId: '',    active: false   },
        tx1: { deviceId: inId,  active: !!inId  },
        tx2: { deviceId: '',    active: false   },
      }}))

      // Opslaan
      window.electron?.saveDeviceSettings?.({ windowId: WNDID, audioIn: inId, audioOut: outId })

      // Knop feedback
      const btn = document.getElementById('bmw-apply')
      if (btn) { btn.style.background='#2ecc71'; btn.textContent='OK ✓'; setTimeout(()=>{ btn.style.background='#f0a500'; btn.textContent='TOEPASSEN'; open=false; document.getElementById('bmw-body').style.display='none'; document.getElementById('bmw-arr').textContent='\\u25BC' },1500) }
    }

    document.getElementById('bmw-apply').onclick = applyAudio

    // Direct toepassen bij start (opgeslagen waarden)
    if (sIn || sOut) setTimeout(applyAudio, 300)

    ${midiEnabled ? `
    // ── MIDI ──────────────────────────────────────────────────────────────
    const minSel  = document.getElementById('bmw-min')
    const moutSel = document.getElementById('bmw-mout')
    const mst     = document.getElementById('bmw-mst')
    const { inputs: mIns, outputs: mOuts } = await window.electron.getMidiPorts()
    minSel.innerHTML  = '<option value="-1">— geen —</option>' + mIns.map((n,i)=>'<option value="'+i+'">'+n+'</option>').join('')
    moutSel.innerHTML = '<option value="-1">— geen —</option>' + mOuts.map((n,i)=>'<option value="'+i+'">'+n+'</option>').join('')
    const sMiIn=${savedMidiIn}, sMiOut=${savedMidiOut}
    if (sMiIn!==-1) { const o=[...minSel.options].find(o=>o.value===String(sMiIn)); if(o){minSel.value=String(sMiIn);window.electron.openMidiInput({windowId:WNDID,port:sMiIn});mst.textContent='in: '+o.text} }
    if (sMiOut!==-1) { const o=[...moutSel.options].find(o=>o.value===String(sMiOut)); if(o){moutSel.value=String(sMiOut);window.electron.openMidiOutput({windowId:WNDID,port:sMiOut})} }
    minSel.onchange  = () => { const p=parseInt(minSel.value); window.electron.openMidiInput({windowId:WNDID,port:p}); window.electron.saveDeviceSettings({windowId:WNDID,midiIn:p}); mst.textContent=p===-1?'geen MIDI':'in: '+minSel.options[minSel.selectedIndex].text }
    moutSel.onchange = () => { const p=parseInt(moutSel.value); window.electron.openMidiOutput({windowId:WNDID,port:p}); window.electron.saveDeviceSettings({windowId:WNDID,midiOut:p}) }
    window.electron.onMidi(({msg})=>{ const [s,n,v]=msg,t=s>>4; let l=t===9&&v>0?'▶ N'+n+' v'+v:(t===8||(t===9&&v===0))?'■ N'+n:t===11?'CC'+n+'='+v:'0x'+s.toString(16); mst.textContent=l; clearTimeout(window._bmwMt); window._bmwMt=setTimeout(()=>mst.textContent=minSel.selectedIndex>0?'in: '+minSel.options[minSel.selectedIndex].text:'geen MIDI',1500) })
    ` : ''}

  } catch(e) { console.error('[BMW]', e) }
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
