const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('prefs', {
  get: () => ipcRenderer.invoke('prefs:get'),
  beginRecord: () => ipcRenderer.invoke('prefs:beginRecord'),
  setShortcut: (shortcut) => ipcRenderer.invoke('prefs:setShortcut', shortcut),
  cancelRecord: () => ipcRenderer.invoke('prefs:cancelRecord'),
  setOpenAtLogin: (value) => ipcRenderer.invoke('prefs:setOpenAtLogin', value),
})
