const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('orbit', {
  onStart: (fn) => ipcRenderer.on('wheel:start', fn),
  onPointer: (fn) => ipcRenderer.on('wheel:pointer', fn),
  onRelease: (fn) => ipcRenderer.on('wheel:release', fn),
  onCancel: (fn) => ipcRenderer.on('wheel:cancel', fn),
  onWarm: (fn) => ipcRenderer.on('wheel:warm', fn),
  choose: (index) => ipcRenderer.send('wheel:choose', index),
  tick: () => ipcRenderer.send('wheel:tick'),
  report: (message) => ipcRenderer.send('wheel:report', message),
})
