/* window-ui.js — renderer logic per venster */
;(async () => {

  // ── Wacht op init-bericht van main process ──────────────────────────────────
  const config = await new Promise(resolve => {
    window.electron.onInit(resolve)
  })

  const { id: windowId, url, toolbarHeight = 36, midiEnabled = false, toolbarVisible = true,
          audioIn: savedAudioIn, audioOut: savedAudioOut,
          midiIn: savedMidiIn, midiOut: savedMidiOut } = config

  // ── Toolbar zichtbaarheid ────────────────────────────────────────────────────
  // true   → altijd zichtbaar (standaard)
  // "hide" → verdwijnt na 2 seconden, verschijnt bij hover bovenaan
  // false  → helemaal weg, iframe vult het hele venster
  const toolbar = document.getElementById('toolbar')

  if (toolbarVisible === false || toolbarVisible === 'false') {
    // Helemaal weg
    toolbar.style.display = 'none'
  } else {
    // Zichtbaar (true of "hide")
    document.documentElement.style.setProperty('--toolbar-height', toolbarHeight + 'px')

    if (toolbarVisible === 'hide') {
      let hideTimer = setTimeout(() => { toolbar.style.opacity = '0'; toolbar.style.pointerEvents = 'none' }, 2000)

      // Hotzone: muis bovenaan venster
      const hotzone = document.createElement('div')
      hotzone.style.cssText = 'position:fixed;top:0;left:0;right:0;height:8px;z-index:200;'
      document.body.appendChild(hotzone)

      function showToolbar() {
        toolbar.style.opacity = '1'
        toolbar.style.pointerEvents = 'auto'
        clearTimeout(hideTimer)
      }
      function scheduleHide() {
        clearTimeout(hideTimer)
        hideTimer = setTimeout(() => { toolbar.style.opacity = '0'; toolbar.style.pointerEvents = 'none' }, 2000)
      }

      toolbar.style.transition = 'opacity 0.25s ease'
      hotzone.addEventListener('mouseenter', showToolbar)
      toolbar.addEventListener('mouseenter', showToolbar)
      toolbar.addEventListener('mouseleave', scheduleHide)
    }
  }

  // URL laden in iframe
  document.getElementById('frame').src = url

  // MIDI-paneel verbergen als MIDI uitgeschakeld is
  if (!midiEnabled) {
    const ig = document.getElementById('midi-in-group')
    const og = document.getElementById('midi-out-group')
    if (ig) ig.style.display = 'none'
    if (og) og.style.display = 'none'
  }

  // ── Audio apparaten ─────────────────────────────────────────────────────────
  // De audio-selectoren sturen de gekozen apparaten via bolt-audio-config
  // als CustomEvent naar de iframe-pagina (BoltSDR-protocol).
  // Er wordt GEEN AudioContext loopback aangemaakt — dat zou microfoon
  // rechtstreeks naar de speakers sturen, wat niet de bedoeling is.

  const audioInSel  = document.getElementById('audio-in')
  const audioOutSel = document.getElementById('audio-out')
  const frame       = document.getElementById('frame')

  async function loadAudioDevices() {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      tmp.getTracks().forEach(t => t.stop())
    } catch { /* geen permissie */ }

    const devices = await navigator.mediaDevices.enumerateDevices()
    const inputs  = devices.filter(d => d.kind === 'audioinput')
    const outputs = devices.filter(d => d.kind === 'audiooutput')

    audioInSel.innerHTML = '<option value="">— geen —</option>' +
      inputs.map(d =>
        `<option value="${d.deviceId}">${d.label || d.deviceId.slice(0,20)}</option>`
      ).join('')

    audioOutSel.innerHTML = '<option value="">— geen —</option>' +
      outputs.map(d =>
        `<option value="${d.deviceId}">${d.label || d.deviceId.slice(0,20)}</option>`
      ).join('')
  }

  // Stuur bolt-audio-config event naar de iframe via postMessage
  function sendAudioConfig() {
    const inId  = audioInSel.value
    const outId = audioOutSel.value
    const detail = {
      tx1: { deviceId: inId,  active: !!inId  },
      rx1: { deviceId: outId, active: !!outId },
    }
    // postMessage naar iframe (werkt als pagina luistert naar dit event)
    frame?.contentWindow?.postMessage({ type: 'bolt-audio-config', detail }, '*')
  }

  if (audioInSel) audioInSel.addEventListener('change', () => {
    window.electron.saveDeviceSettings({ windowId, audioIn: audioInSel.value })
    sendAudioConfig()
  })
  if (audioOutSel) audioOutSel.addEventListener('change', () => {
    window.electron.saveDeviceSettings({ windowId, audioOut: audioOutSel.value })
    sendAudioConfig()
  })

  await loadAudioDevices()

  // Opgeslagen audio-apparaten herstellen — pas ná loadAudioDevices zodat de opties bestaan
  if (savedAudioIn && audioInSel) {
    const match = [...audioInSel.options].find(o => o.value === savedAudioIn)
    if (match) audioInSel.value = savedAudioIn
  }
  if (savedAudioOut && audioOutSel) {
    const match = [...audioOutSel.options].find(o => o.value === savedAudioOut)
    if (match) audioOutSel.value = savedAudioOut
  }
  // Stuur config door zodra iframe geladen is
  frame?.addEventListener('load', sendAudioConfig)

  navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices)

  // ── MIDI ────────────────────────────────────────────────────────────────────
  if (midiEnabled) {
    const midiInSel  = document.getElementById('midi-in')
    const midiOutSel = document.getElementById('midi-out')
    const midiDot    = document.getElementById('midi-dot')
    const midiText   = document.getElementById('midi-text')
    const midiStatus = document.getElementById('midi-status')

    function setMidiStatus(text, active = false) {
      midiText.textContent = text
      midiDot.classList.toggle('active', active)
      midiStatus.classList.toggle('active', active)
    }

    async function loadMidiPorts() {
      const { inputs, outputs } = await window.electron.getMidiPorts()

      midiInSel.innerHTML = '<option value="-1">— geen —</option>' +
        inputs.map((name, i) => `<option value="${i}">${name}</option>`).join('')

      midiOutSel.innerHTML = '<option value="-1">— geen —</option>' +
        outputs.map((name, i) => `<option value="${i}">${name}</option>`).join('')

      setMidiStatus(
        inputs.length === 0 && outputs.length === 0
          ? 'geen MIDI apparaten'
          : `${inputs.length} in · ${outputs.length} uit`
      )
    }

    midiInSel.addEventListener('change', () => {
      const port = parseInt(midiInSel.value, 10)
      window.electron.openMidiInput({ windowId, port })
      window.electron.saveDeviceSettings({ windowId, midiIn: port })
      if (port === -1) {
        setMidiStatus(midiOutSel.value !== '-1' ? `uit: ${midiOutSel.options[midiOutSel.selectedIndex].text}` : 'geen MIDI', midiOutSel.value !== '-1')
      } else {
        setMidiStatus(`in: ${midiInSel.options[midiInSel.selectedIndex].text}`, true)
      }
    })

    midiOutSel.addEventListener('change', () => {
      const port = parseInt(midiOutSel.value, 10)
      window.electron.openMidiOutput({ windowId, port })
      window.electron.saveDeviceSettings({ windowId, midiOut: port })
    })

    let midiTimeout = null
    window.electron.onMidi(({ msg }) => {
      const [status, note, velocity] = msg
      const type = status >> 4
      const channel = (status & 0xf) + 1
      let label = ''
      if      (type === 9 && velocity > 0) label = `▶ N${note} v${velocity} ch${channel}`
      else if (type === 8 || (type === 9 && velocity === 0)) label = `■ N${note} ch${channel}`
      else if (type === 11) label = `CC${note}=${velocity} ch${channel}`
      else label = `0x${status.toString(16)} ${note} ${velocity}`

      setMidiStatus(label, true)
      clearTimeout(midiTimeout)
      midiTimeout = setTimeout(() => {
        const selText = midiInSel.selectedIndex > 0 ? `in: ${midiInSel.options[midiInSel.selectedIndex].text}` : 'geen MIDI'
        setMidiStatus(selText, midiInSel.selectedIndex > 0)
      }, 1500)
    })

    await loadMidiPorts()

    // Opgeslagen MIDI poorten herstellen — pas ná loadMidiPorts zodat de opties bestaan
    if (savedMidiIn !== undefined && savedMidiIn !== -1) {
      const match = [...midiInSel.options].find(o => o.value === String(savedMidiIn))
      if (match) {
        midiInSel.value = String(savedMidiIn)
        window.electron.openMidiInput({ windowId, port: savedMidiIn })
        setMidiStatus(`in: ${match.text}`, true)
      }
    }
    if (savedMidiOut !== undefined && savedMidiOut !== -1) {
      const match = [...midiOutSel.options].find(o => o.value === String(savedMidiOut))
      if (match) {
        midiOutSel.value = String(savedMidiOut)
        window.electron.openMidiOutput({ windowId, port: savedMidiOut })
      }
    }
  }

})()

