const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('capture', {
  load: () => ipcRenderer.invoke('capture:load'),
  done: (result) => ipcRenderer.send('capture:done', result),
})
