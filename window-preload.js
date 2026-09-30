const { contextBridge, ipcRenderer } = require('electron')

// Shared by the Settings and onboarding windows.
contextBridge.exposeInMainWorld('prefs', {
  get: () => ipcRenderer.invoke('prefs:get'),
  beginRecord: () => ipcRenderer.invoke('prefs:beginRecord'),
  setShortcut: (shortcut) => ipcRenderer.invoke('prefs:setShortcut', shortcut),
  cancelRecord: () => ipcRenderer.invoke('prefs:cancelRecord'),
  setOpenAtLogin: (value) => ipcRenderer.invoke('prefs:setOpenAtLogin', value),
})

contextBridge.exposeInMainWorld('orbitApp', {
  info: () => ipcRenderer.invoke('app:info'),
  permissions: () => ipcRenderer.invoke('permissions:status'),
  requestPermission: (id) => ipcRenderer.invoke('permissions:request', id),
  openPermissionPane: (id) => ipcRenderer.invoke('permissions:open', id),
  relaunch: (resumeStep) => ipcRenderer.invoke('app:relaunch', resumeStep),
  openOnboarding: () => ipcRenderer.invoke('onboarding:open'),
  finishOnboarding: (options) => ipcRenderer.invoke('onboarding:finish', options),
  setPractice: (on) => ipcRenderer.send('practice:set', on),
  onPractice: (fn) => {
    for (const name of ['start', 'pointer', 'release', 'cancel']) {
      ipcRenderer.on(`practice:${name}`, (_event, payload) => fn(name, payload))
    }
  },
  onGoto: (fn) => ipcRenderer.on('onboarding:goto', (_event, step) => fn(step)),
})
