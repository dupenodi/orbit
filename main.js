const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  nativeImage,
  ipcMain,
  screen,
  shell,
  systemPreferences,
} = require('electron')
const { execFile, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
  DEFAULT_SHORTCUT,
  formatShortcut,
  isValidShortcut,
  normalizeShortcut,
  watcherArgs,
} = require('./shortcut')
const { ensureWheelsFile, runAction, wheelFor } = require('./actions')
const { onTimerChange, timeLeft, toggleTimer } = require('./timer')
const { PERMISSIONS, missingPermissions, openPane, permissionStatus, requestPermission } = require('./permissions')

// Windows has no permissions to walk through.
const ONBOARDING_STEPS = ['welcome', 'wheel', 'permissions', 'shortcut', 'ready'].filter(
  (step) => step !== 'permissions' || PERMISSIONS.length,
)

let overlay
let settings
let onboarding
let toast
let toastTimer
let current = null
let tray
// The window a held shortcut is driving: the real wheel, or onboarding's practice one.
let holding = null
let practicing = false
let watcher
let pointerTimer

function isMac() {
  return process.platform === 'darwin'
}

function isWindows() {
  return process.platform === 'win32'
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

// The wheel always sits in the middle of the pointer's display, and aim is measured
// from its centre: the pointer jumps there when the wheel opens and goes back to
// where it was when the wheel closes. Returns the centre in screen coordinates.
function coverPointerDisplay() {
  const { bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  overlay.setBounds(bounds)
  return { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) }
}

// Pointer updates wait until a warp has landed, so aim never sees the old position.
let warpPending = null
let pointerHome = null

function warpPointer(point) {
  if (!watcher?.stdin?.writable) return
  clearTimeout(warpPending)
  warpPending = setTimeout(() => (warpPending = null), 80)
  // The Windows watcher moves the pointer in real pixels; Electron works in DIPs.
  const target = isWindows() ? screen.dipToScreenPoint(point) : point
  watcher.stdin.write(`warp ${Math.round(target.x)} ${Math.round(target.y)}\n`)
}

function relativeTo(win, point) {
  const bounds = win.getContentBounds()
  return { x: point.x - bounds.x, y: point.y - bounds.y }
}

function pointerIn(win) {
  return relativeTo(win, screen.getCursorScreenPoint())
}

// The frosted backdrop can't be animated from the page, so the window itself fades.
let fadeTimer

function fadeOverlay(to, duration, done) {
  clearInterval(fadeTimer)
  const from = overlay.getOpacity()
  const length = systemPreferences.getAnimationSettings().prefersReducedMotion ? 0 : duration
  const started = Date.now()
  const step = () => {
    const t = length ? Math.min(1, (Date.now() - started) / length) : 1
    overlay.setOpacity(from + (to - from) * (1 - (1 - t) ** 3))
    if (t < 1) return
    clearInterval(fadeTimer)
    done?.()
  }
  fadeTimer = setInterval(step, 8)
  step()
}

function isShown(win) {
  return Boolean(win && !win.isDestroyed() && win.isVisible())
}

function beginHold(win, channel, payload) {
  holding = { win, channel }
  win.webContents.send(`${channel}:start`, payload)
  clearInterval(pointerTimer)
  // Sampled faster than the display refreshes; the renderer draws once per frame.
  pointerTimer = setInterval(() => {
    if (warpPending || holding?.win !== win || win.isDestroyed()) return
    win.webContents.send(`${channel}:pointer`, pointerIn(win))
  }, 8)
}

function startHold(front) {
  if (holding) return
  // While onboarding's practice round is up, the shortcut drives its wheel and nothing runs.
  if (practicing && isShown(onboarding)) {
    beginHold(onboarding, 'practice', { origin: pointerIn(onboarding) })
    return
  }
  if (!overlay) return
  current = wheelFor(front)
  if (current.error) showToast({ ok: false, title: 'wheels.json', message: 'Could not read it, using the defaults' })
  pointerHome = screen.getCursorScreenPoint()
  const center = coverPointerDisplay()
  warpPointer(center)
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (!overlay.isVisible()) overlay.setOpacity(0)
  overlay.showInactive()
  fadeOverlay(1, 140)
  beginHold(overlay, 'wheel', {
    origin: relativeTo(overlay, center),
    slots: current.slots.map(({ label, caption, icon, glyph }) => ({ label, caption, icon, glyph })),
  })
}

function finishHold(mode) {
  if (!holding) return
  const { win, channel } = holding
  holding = null
  clearInterval(pointerTimer)
  if (win.isDestroyed()) return
  win.webContents.send(mode === 'cancel' ? `${channel}:cancel` : `${channel}:release`)
  if (win === overlay && pointerHome) {
    warpPointer(pointerHome)
    pointerHome = null
  }
  // The page fades the wheel out over the same stretch; hide once both are gone.
  if (win === overlay) fadeOverlay(0, 110, () => overlay.hide())
}

function stopWatcher() {
  if (!watcher) return
  watcher.kill()
  watcher = null
}

function startWatcher() {
  stopWatcher()
  const args = watcherArgs(currentShortcut())
  const [bin, argv] = isWindows()
    ? [path.join(__dirname, 'bin', 'orbit-win.exe'), ['watch', ...args, `--parent=${process.pid}`]]
    : [path.join(__dirname, 'bin', 'mod-watch'), args]
  const child = spawn(bin, argv, { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true })
  watcher = child
  // If the watcher dies on its own, bring it back so the shortcut keeps working.
  child.on('exit', () => {
    if (watcher !== child || app.isQuitting) return
    watcher = null
    setTimeout(() => {
      if (!watcher && !app.isQuitting) startWatcher()
    }, 1000)
  })
  let leftover = ''
  let ready = false
  setTimeout(() => {
    ready = true
  }, 400)
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    leftover += chunk.replace(/\r/g, '')
    const lines = leftover.split('\n')
    leftover = lines.pop() ?? ''
    if (!ready) return
    for (const line of lines) {
      if (line.startsWith('down')) {
        const [, bundleId = '', title = ''] = line.split('\t')
        startHold({ bundleId, title })
      }
      if (line === 'up') finishHold('release')
      if (line === 'warped') {
        clearTimeout(warpPending)
        warpPending = null
      }
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
  if (isMac()) overlay.setHiddenInMissionControl(true)
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

function createToast() {
  toast = new BrowserWindow({
    width: 440,
    height: 72,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    type: isMac() ? 'panel' : undefined,
    hiddenInMissionControl: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'toast-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  toast.setAlwaysOnTop(true, 'screen-saver')
  toast.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  toast.setIgnoreMouseEvents(true)
  toast.loadFile(path.join(__dirname, 'toast.html'))
}

function showToast(result) {
  if (!toast || toast.isDestroyed()) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { width, height } = toast.getBounds()
  const area = display.workArea
  toast.setPosition(Math.round(area.x + (area.width - width) / 2), Math.round(area.y + area.height - height - 48))
  toast.showInactive()
  toast.webContents.send('toast:show', result)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.webContents.send('toast:hide')
    toastTimer = setTimeout(() => toast.hide(), 200)
  }, result.duration ?? (result.ok ? 1800 : 3200))
}

// Orbit has no Dock icon, so its windows must pull the app forward themselves.
function bringForward(win) {
  app.focus({ steal: true })
  win.show()
  win.focus()
}

function openSettings() {
  if (settings && !settings.isDestroyed()) {
    bringForward(settings)
    return
  }

  settings = new BrowserWindow({
    width: 460,
    // Without the permissions section (Windows), Settings is much shorter.
    height: PERMISSIONS.length ? 520 : 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    title: 'Orbit Settings',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'window-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  settings.setMenuBarVisibility(false)
  settings.loadFile(path.join(__dirname, 'settings.html'))
  settings.once('ready-to-show', () => bringForward(settings))
  settings.on('closed', () => {
    settings = null
  })
}

function openOnboarding(step = 'welcome') {
  if (onboarding && !onboarding.isDestroyed()) {
    onboarding.webContents.send('onboarding:goto', step)
    bringForward(onboarding)
    return
  }

  onboarding = new BrowserWindow({
    width: 920,
    height: 620,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Welcome to Orbit',
    titleBarStyle: isMac() ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 18, y: 18 },
    // Windows draws its own caption buttons over the page's dark titlebar strip.
    ...(isMac() ? {} : { titleBarOverlay: { color: '#080a12', symbolColor: '#ffffff', height: 40 } }),
    backgroundColor: '#080a12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'window-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  onboarding.loadFile(path.join(__dirname, 'onboarding.html'), { query: { step } })
  onboarding.once('ready-to-show', () => bringForward(onboarding))
  onboarding.on('blur', () => {
    if (holding?.win === onboarding) finishHold('cancel')
  })
  onboarding.on('closed', () => {
    onboarding = null
    practicing = false
    // Quitting mid-guide (e.g. macOS's "Quit & Reopen" after Screen Recording)
    // resumes it next launch. Closing it counts as seen; the tray offers it
    // again, plus "Finish Setting Up" while permissions are missing.
    if (app.isQuitting) return
    writePrefs({ ...readPrefs(), onboarded: true, resumeStep: undefined })
  })
}

function globalSlots() {
  return wheelFor({ bundleId: '' }).slots.map(({ label, caption, icon, about }) => ({ label, caption, icon, about }))
}

function showAbout() {
  app.focus({ steal: true })
  app.showAboutPanel()
}

function buildTrayMenu() {
  const login = app.getLoginItemSettings().openAtLogin
  const missing = missingPermissions()
  return Menu.buildFromTemplate([
    ...(missing.length
      ? [
          {
            label: `Finish Setting Up (${missing.length} permission${missing.length === 1 ? '' : 's'})…`,
            click: () => openOnboarding('permissions'),
          },
          { type: 'separator' },
        ]
      : []),
    ...(timeLeft()
      ? [
          { label: `Timer: ${timeLeft()} left`, enabled: false },
          { label: 'Stop Timer', click: () => toggleTimer() },
          { type: 'separator' },
        ]
      : []),
    { label: `Hold ${formatShortcut(currentShortcut())} to open the wheel`, enabled: false },
    { type: 'separator' },
    { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => openSettings() },
    { label: 'Edit Wheels…', click: () => shell.openPath(ensureWheelsFile()) },
    { label: 'Welcome Guide…', click: () => openOnboarding() },
    {
      label: 'Open at Login',
      type: 'checkbox',
      checked: login,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked })
      },
    },
    { type: 'separator' },
    { label: 'About Orbit', click: () => showAbout() },
    { role: 'quit', label: 'Quit Orbit' },
  ])
}

// macOS wants a black template glyph for the menu bar; Windows' tray shows the app icon.
function trayIcon() {
  if (isMac()) return path.join(__dirname, 'assets', 'TrayIconTemplate.png')
  return nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 32, height: 32, quality: 'best' })
}

function trayToolTip() {
  const left = timeLeft()
  return `Orbit · ${formatShortcut(currentShortcut())}${left ? ` · Timer ${left}` : ''}`
}

function announceTimerDone() {
  if (isMac()) {
    // Electron's own notifications need a signed app on macOS; osascript's always arrive.
    execFile('/usr/bin/osascript', ['-e', 'display notification "Your timer has finished." with title "Time’s up" sound name "Glass"'])
  } else if (Notification.isSupported()) {
    new Notification({ title: 'Time’s up', body: 'Your timer has finished.' }).show()
  }
  showToast({ ok: true, title: 'Timer', message: 'Time’s up', duration: 8000 })
}

function createTray() {
  tray = new Tray(trayIcon())
  tray.setToolTip(trayToolTip())
  const refresh = () => tray.setContextMenu(buildTrayMenu())
  refresh()
  tray.on('mouse-down', refresh)
  // The menu reads cached permission state; keep it fresh for the next click.
  tray.on('mouse-up', () => permissionStatus().then(refresh))
  // Windows only opens a tray menu on right-click; open it on a left-click too.
  tray.on('click', () => {
    if (!isWindows()) return
    tray.popUpContextMenu(buildTrayMenu())
  })
  tray.on('right-click', refresh)
  // A running timer counts down beside the icon (macOS) or in its tooltip, and says so when it's done.
  onTimerChange(({ left, finished }) => {
    if (isMac()) tray.setTitle(left ? ` ${left}` : '', { fontType: 'monospacedDigit' })
    else tray.setToolTip(trayToolTip())
    if (finished) announceTimerDone()
  })
}

function createAppMenu() {
  const template = [
    ...(isMac()
      ? [
          {
            label: app.name,
            submenu: [
              { label: 'About Orbit', click: () => showAbout() },
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => openSettings() },
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

ipcMain.on('wheel:choose', async (event, index) => {
  if (event.sender !== overlay?.webContents || !current) return
  const slot = current.slots[index]
  if (!slot) return
  const result = await runAction(slot, current.context)
  showToast({ ...result, title: slot.label })
})

ipcMain.handle('prefs:get', () => publicPrefs())

ipcMain.handle('prefs:beginRecord', () => {
  finishHold('cancel')
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
  tray?.setToolTip(trayToolTip())
  tray?.setContextMenu(buildTrayMenu())
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

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  // Unpackaged, macOS lists Orbit as "Electron" in Privacy & Security.
  settingsName: app.isPackaged ? 'Orbit' : 'Electron',
  permissions: PERMISSIONS.map(({ id, title, why }) => ({ id, title, why })),
  slots: globalSlots(),
  steps: ONBOARDING_STEPS,
}))

ipcMain.handle('permissions:status', async () => {
  const status = await permissionStatus()
  tray?.setContextMenu(buildTrayMenu())
  return status
})

ipcMain.handle('permissions:request', async (_event, id) => {
  if (isShown(onboarding)) writePrefs({ ...readPrefs(), resumeStep: 'permissions' })
  const status = await requestPermission(id)
  tray?.setContextMenu(buildTrayMenu())
  return status
})

ipcMain.handle('permissions:open', (_event, id) => openPane(id))

// Screen Recording only takes effect after a restart; reopen where the user was.
ipcMain.handle('app:relaunch', (_event, resumeStep) => {
  if (ONBOARDING_STEPS.includes(resumeStep)) writePrefs({ ...readPrefs(), resumeStep })
  app.relaunch()
  app.exit(0)
})

ipcMain.handle('onboarding:open', () => openOnboarding())

ipcMain.handle('onboarding:finish', (_event, options) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(options?.openAtLogin) })
  writePrefs({ ...readPrefs(), onboarded: true })
  onboarding?.close()
  tray?.setContextMenu(buildTrayMenu())
  showToast({ ok: true, title: 'Orbit is ready', message: `Hold ${formatShortcut(currentShortcut())} anywhere` })
})

ipcMain.on('practice:set', (event, on) => {
  if (event.sender !== onboarding?.webContents) return
  practicing = Boolean(on)
  if (!practicing && holding?.win === onboarding) finishHold('cancel')
})

app.setName('Orbit')
// Windows ties notifications and taskbar identity to this; it matches the installer's.
if (isWindows()) app.setAppUserModelId('com.dupenodi.orbit')
app.setAboutPanelOptions({
  applicationName: 'Orbit',
  applicationVersion: app.getVersion(),
  version: '',
  copyright: '© 2026 dupenodi',
  credits: 'Hold. Flick. Release.',
})

const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.quit()

// Launching Orbit again (from Finder or Spotlight) opens Settings instead.
app.on('second-instance', () => openSettings())

app.whenReady().then(async () => {
  if (!primaryInstance) return
  if (isMac()) {
    app.setActivationPolicy('accessory')
    app.dock?.hide()
  }
  createAppMenu()
  createTray()
  createToast()
  createOverlay()

  const prefs = readPrefs()
  if (prefs.resumeStep) {
    writePrefs({ ...prefs, resumeStep: undefined })
    openOnboarding(prefs.resumeStep)
  } else if (!prefs.onboarded) {
    openOnboarding()
  }
  await permissionStatus()
  tray.setContextMenu(buildTrayMenu())
})

app.on('activate', () => {})

app.on('before-quit', () => {
  app.isQuitting = true
  watcher?.kill()
})

app.on('window-all-closed', () => {})
