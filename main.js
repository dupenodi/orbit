const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  screen,
} = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
  DEFAULT_SHORTCUT,
  formatShortcut,
  isValidShortcut,
  normalizeShortcut,
  watcherArgs,
} = require('./shortcut')

let overlay
let settings
let tray
let open = false
let watcher
let pointerTimer

function isMac() {
  return process.platform === 'darwin'
}

function prefsFile() {
  return path.join(app.getPath('userData'), 'prefs.json')
}

function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsFile(), 'utf8'))
  } catch {
    return {}
  }
}

function writePrefs(next) {
  fs.mkdirSync(path.dirname(prefsFile()), { recursive: true })
  fs.writeFileSync(prefsFile(), JSON.stringify(next, null, 2))
}

function currentShortcut() {
  return normalizeShortcut(readPrefs().shortcut || DEFAULT_SHORTCUT)
}

function publicPrefs() {
  const shortcut = currentShortcut()
  return {
    openAtLogin: app.getLoginItemSettings().openAtLogin,
    shortcut,
    shortcutLabel: formatShortcut(shortcut),
  }
}

function coverPointerDisplay() {
  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  overlay.setBounds(display.bounds)
}

function startHold() {
  if (open || !overlay) return
  open = true
  coverPointerDisplay()
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlay.showInactive()
  overlay.webContents.send('wheel:start')
  clearInterval(pointerTimer)
  pointerTimer = setInterval(() => {
    if (!open) return
    const point = screen.getCursorScreenPoint()
    const bounds = overlay.getBounds()
    overlay.webContents.send('wheel:pointer', {
      x: point.x - bounds.x,
      y: point.y - bounds.y,
    })
  }, 16)
}

function finishHold(mode) {
  if (!open) return
  open = false
  clearInterval(pointerTimer)
  overlay.webContents.send(mode === 'cancel' ? 'wheel:cancel' : 'wheel:release')
  overlay.hide()
}

function stopWatcher() {
  if (!watcher) return
  watcher.kill()
  watcher = null
}

function startWatcher() {
  stopWatcher()
  const bin = path.join(__dirname, 'bin', 'mod-watch')
  watcher = spawn(bin, watcherArgs(currentShortcut()), { stdio: ['ignore', 'pipe', 'inherit'] })
  let leftover = ''
  let ready = false
  setTimeout(() => {
    ready = true
  }, 400)
  watcher.stdout.setEncoding('utf8')
  watcher.stdout.on('data', (chunk) => {
    leftover += chunk
    const lines = leftover.split('\n')
    leftover = lines.pop() ?? ''
    if (!ready) return
    for (const line of lines) {
      if (line === 'down') startHold()
      if (line === 'up') finishHold('release')
    }
  })
}

function createOverlay() {
  overlay = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    roundedCorners: false,
    type: isMac() ? 'panel' : undefined,
    hiddenInMissionControl: true,
    backgroundColor: '#00000000',
    // Frosts the whole desktop behind the wheel, like GTA's slow-mo blur.
    ...(isMac() ? { vibrancy: 'fullscreen-ui', visualEffectState: 'active' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlay.setHiddenInMissionControl(true)
  overlay.setMenuBarVisibility(false)
  overlay.loadFile(path.join(__dirname, 'index.html'))
  overlay.webContents.on('did-finish-load', () => {
    startWatcher()
  })

  overlay.on('close', (event) => {
    if (app.isQuitting) return
    event.preventDefault()
    finishHold('cancel')
  })
}

function openSettings() {
  if (settings && !settings.isDestroyed()) {
    settings.show()
    settings.focus()
    return
  }

  settings = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    title: 'Orbit Settings',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  settings.setMenuBarVisibility(false)
  settings.loadFile(path.join(__dirname, 'settings.html'))
  settings.once('ready-to-show', () => settings.show())
  settings.on('closed', () => {
    settings = null
  })
}

function buildTrayMenu() {
  const login = app.getLoginItemSettings().openAtLogin
  return Menu.buildFromTemplate([
    { label: 'Settings…', accelerator: 'Command+,', click: () => openSettings() },
    {
      label: 'Open at Login',
      type: 'checkbox',
      checked: login,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked })
      },
    },
    { type: 'separator' },
    { role: 'quit', label: 'Quit Orbit' },
  ])
}

function createTray() {
  const icon = path.join(__dirname, 'assets', 'TrayIconTemplate.png')
  tray = new Tray(icon)
  tray.setToolTip(`Orbit · ${formatShortcut(currentShortcut())}`)
  const refresh = () => tray.setContextMenu(buildTrayMenu())
  refresh()
  tray.on('mouse-down', refresh)
}

function createAppMenu() {
  const template = [
    ...(isMac()
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'Command+,', click: () => openSettings() },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : [{ role: 'fileMenu' }]),
    { role: 'editMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle('prefs:get', () => publicPrefs())

ipcMain.handle('prefs:beginRecord', () => {
  if (open) finishHold('cancel')
  stopWatcher()
})

ipcMain.handle('prefs:setShortcut', (_event, raw) => {
  if (!isValidShortcut(raw)) {
    startWatcher()
    return { ok: false, ...publicPrefs() }
  }
  const shortcut = normalizeShortcut(raw)
  writePrefs({ ...readPrefs(), shortcut })
  startWatcher()
  tray?.setToolTip(`Orbit · ${formatShortcut(shortcut)}`)
  return { ok: true, ...publicPrefs() }
})

ipcMain.handle('prefs:cancelRecord', () => {
  startWatcher()
  return publicPrefs()
})

ipcMain.handle('prefs:setOpenAtLogin', (_event, openAtLogin) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin) })
  tray?.setContextMenu(buildTrayMenu())
  return publicPrefs()
})

app.setName('Orbit')

app.whenReady().then(() => {
  if (isMac()) {
    app.setActivationPolicy('accessory')
    app.dock?.hide()
  }
  createAppMenu()
  createTray()
  createOverlay()
})

app.on('activate', () => {})

app.on('before-quit', () => {
  app.isQuitting = true
  watcher?.kill()
})

app.on('window-all-closed', () => {})
