const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {

  // MIDI
  getMidiPorts:  ()       => ipcRenderer.invoke('midi-get-ports'),
  openMidiInput: (params) => ipcRenderer.send('midi-open-input',  params),
  openMidiOutput:(params) => ipcRenderer.send('midi-open-output', params),
  sendMidi:      (params) => ipcRenderer.send('midi-send',        params),
  onMidi:        (cb)     => ipcRenderer.on('midi-message', (_, d) => cb(d)),

  // Apparaat-instellingen opslaan in config
  saveDeviceSettings: (params) => ipcRenderer.send('save-device-settings', params),
})
