/* window-ui.js — renderer logic per venster */
;(async () => {

  // ── Wacht op init-bericht van main process ──────────────────────────────────
  const config = await new Promise(resolve => {
    window.electron.onInit(resolve)
  })

  const { id: windowId, url, toolbarHeight = 36, midiEnabled = false } = config

  // Toolbar hoogte instellen
  document.documentElement.style.setProperty('--toolbar-height', toolbarHeight + 'px')

  // URL laden in iframe
  document.getElementById('frame').src = url

  // MIDI-paneel verbergen als MIDI uitgeschakeld is
  if (!midiEnabled) {
    document.getElementById('midi-in-group').style.display  = 'none'
    document.getElementById('midi-out-group').style.display = 'none'
  }

  // ── Audio apparaten ─────────────────────────────────────────────────────────
  const audioInSel  = document.getElementById('audio-in')
  const audioOutSel = document.getElementById('audio-out')

  let audioCtx    = null
  let audioStream = null

  async function loadAudioDevices() {
    // Vraag permissie — nodig om labels te zien
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      tmp.getTracks().forEach(t => t.stop())
    } catch { /* geen permissie, toon device-IDs */ }

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

  async function applyAudio() {
    // Sluit vorig context
    if (audioStream) audioStream.getTracks().forEach(t => t.stop())
    if (audioCtx)    await audioCtx.close().catch(() => {})
    audioCtx    = null
    audioStream = null

    const inId  = audioInSel.value
    const outId = audioOutSel.value

    if (!inId) return   // niets geselecteerd

    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: inId ? { deviceId: { exact: inId } } : true,
        video: false,
      })

      // sinkId API (Chromium 110+) voor uitvoer-selectie
      const ctxOptions = {}
      if (outId && typeof AudioContext !== 'undefined') {
        try { ctxOptions.sinkId = outId } catch {}
      }

      audioCtx = new AudioContext(ctxOptions)

      // Als setSinkId beschikbaar is (nieuwere Electron)
      if (outId && audioCtx.setSinkId) {
        await audioCtx.setSinkId(outId).catch(() => {})
      }

      const source = audioCtx.createMediaStreamSource(audioStream)
      source.connect(audioCtx.destination)

    } catch (err) {
      console.warn('[audio] fout:', err.message)
    }
  }

  audioInSel.addEventListener('change',  applyAudio)
  audioOutSel.addEventListener('change', applyAudio)

  await loadAudioDevices()

  // Apparaten herladen als ze wijzigen (USB in/uitstekken)
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

    // Poorten ophalen en selects vullen
    async function loadMidiPorts() {
      const { inputs, outputs } = await window.electron.getMidiPorts()

      midiInSel.innerHTML = '<option value="-1">— geen —</option>' +
        inputs.map((name, i) =>
          `<option value="${i}">${name}</option>`
        ).join('')

      midiOutSel.innerHTML = '<option value="-1">— geen —</option>' +
        outputs.map((name, i) =>
          `<option value="${i}">${name}</option>`
        ).join('')

      if (inputs.length === 0 && outputs.length === 0) {
        setMidiStatus('geen MIDI apparaten')
      } else {
        setMidiStatus(`${inputs.length} in · ${outputs.length} uit`)
      }
    }

    // MIDI input wissel
    midiInSel.addEventListener('change', () => {
      const port = parseInt(midiInSel.value, 10)
      window.electron.openMidiInput({ windowId, port })
      if (port === -1) {
        setMidiStatus(
          midiOutSel.value !== '-1' ? `uit: ${midiOutSel.options[midiOutSel.selectedIndex].text}` : 'geen MIDI',
          midiOutSel.value !== '-1'
        )
      } else {
        setMidiStatus(`in: ${midiInSel.options[midiInSel.selectedIndex].text}`, true)
      }
    })

    // MIDI output wissel
    midiOutSel.addEventListener('change', () => {
      const port = parseInt(midiOutSel.value, 10)
      window.electron.openMidiOutput({ windowId, port })
    })

    // MIDI berichten ontvangen — toon in statuspil
    let midiTimeout = null
    window.electron.onMidi(({ msg }) => {
      const [status, note, velocity] = msg
      const type    = status >> 4
      const channel = (status & 0xf) + 1

      let label = ''
      if      (type === 9 && velocity > 0) label = `▶ N${note} v${velocity} ch${channel}`
      else if (type === 8 || (type === 9 && velocity === 0)) label = `■ N${note} ch${channel}`
      else if (type === 11) label = `CC${note}=${velocity} ch${channel}`
      else label = `0x${status.toString(16)} ${note} ${velocity}`

      setMidiStatus(label, true)

      clearTimeout(midiTimeout)
      midiTimeout = setTimeout(() => {
        const selText = midiInSel.selectedIndex > 0
          ? `in: ${midiInSel.options[midiInSel.selectedIndex].text}`
          : 'geen MIDI'
        setMidiStatus(selText, midiInSel.selectedIndex > 0)
      }, 1500)
    })

    await loadMidiPorts()
  }

})()
