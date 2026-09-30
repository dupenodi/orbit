const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('toast', {
  onShow: (fn) => ipcRenderer.on('toast:show', fn),
  onHide: (fn) => ipcRenderer.on('toast:hide', fn),
})
