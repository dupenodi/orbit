// macOS UI check, run by CI: `npx electron test/mac-ui.js`. Opens Orbit's real pages
// in windows set up the way main.js sets them up (vibrancy, panels, title bars), drives
// the wheel, toast, Settings and onboarding in dark and light appearance, photographs
// the actual screen into test-output/mac/, and measures frame pacing while the wheel
// animates. Fails if a page errors or the wheel drops frames.
const { app, BrowserWindow, ipcMain, nativeTheme, screen } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'test-output', 'mac')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const problems = []
// Panels only exist on macOS; elsewhere (trying the script locally) they fail to load.
const PANEL = process.platform === 'darwin' ? { type: 'panel' } : {}

const wheels = JSON.parse(fs.readFileSync(path.join(ROOT, 'default-wheels.json'), 'utf8'))
const slots = wheels.global.slots
const prefs = { openAtLogin: true, shortcut: { control: true, option: true, shift: false, command: false, code: null }, shortcutLabel: '⌃⌥' }

ipcMain.handle('prefs:get', () => prefs)
ipcMain.handle('app:info', () => ({
  version: require(path.join(ROOT, 'package.json')).version,
  platform: process.platform,
  accent: '#0a84ff',
  settingsName: 'Electron',
  permissions: [
    { id: 'accessibility', title: 'Accessibility', why: 'Press the play/pause key for Play or Pause, and see which window you’re in.' },
    { id: 'screen', title: 'Screen Recording', why: 'Capture the area you drag for Grab Text, Screenshot and Scan QR.' },
    { id: 'automation', title: 'Automation', why: 'Switch light and dark mode for Switch Theme, and ask Finder for its folder.' },
  ],
  slots: slots.map(({ label, caption, icon, about }) => ({ label, caption, icon, about })),
  steps: ['welcome', 'wheel', 'permissions', 'shortcut', 'ready'],
}))
ipcMain.handle('permissions:status', () => ({ accessibility: 'granted', screen: 'needed', automation: 'denied' }))
for (const channel of ['practice:set', 'practice:tick', 'wheel:tick', 'wheel:choose']) ipcMain.on(channel, () => {})

const webPreferences = (preload) => ({
  preload: path.join(ROOT, preload),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  backgroundThrottling: false,
})

function watch(win, name) {
  win.webContents.on('console-message', (event) => {
    const { level, message } = event
    if (level === 'error' || level === 3) problems.push(`${name}: ${message}`)
  })
  win.webContents.on('render-process-gone', () => problems.push(`${name}: renderer crashed`))
  win.webContents.on('did-fail-load', (_event, _code, description) => problems.push(`${name}: failed to load (${description})`))
  return win
}

// The real screen, vibrancy and all; falls back to the page alone if capture is refused.
async function shoot(name, rect, win) {
  const file = path.join(OUT, `${name}.png`)
  try {
    const args = ['-x', '-t', 'png']
    if (rect) args.push(`-R${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`)
    execFileSync('/usr/sbin/screencapture', [...args, file])
    if (fs.statSync(file).size > 0) return
  } catch {}
  if (win) fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG())
}

function center(bounds) {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
}

// Samples requestAnimationFrame in the page for `ms` and reports the gaps between frames.
function framePacing(win, ms) {
  return win.webContents.executeJavaScript(`new Promise((resolve) => {
    const gaps = []
    let last = performance.now()
    const end = last + ${ms}
    const step = (now) => {
      gaps.push(now - last)
      last = now
      if (now < end) requestAnimationFrame(step)
      else {
        gaps.sort((a, b) => a - b)
        const typical = gaps[Math.floor(gaps.length / 2)]
        resolve({
          frames: gaps.length,
          median: +typical.toFixed(2),
          p95: +gaps[Math.floor(gaps.length * 0.95)].toFixed(2),
          worst: +gaps[gaps.length - 1].toFixed(2),
          dropped: gaps.filter((gap) => gap > typical * 1.7).length,
        })
      }
    }
    requestAnimationFrame(step)
  })`)
}

// Every window is made once and reused for both appearances, like the app's own.
const windows = {}

async function makeWindows() {
  windows.overlay = watch(
    new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      roundedCorners: false,
      ...PANEL,
      hiddenInMissionControl: true,
      backgroundColor: '#00000000',
      vibrancy: 'fullscreen-ui',
      visualEffectState: 'active',
      webPreferences: webPreferences('preload.js'),
    }),
    'wheel',
  )
  windows.overlay.setAlwaysOnTop(true, 'screen-saver')
  await windows.overlay.loadFile(path.join(ROOT, 'index.html'))

  windows.toast = watch(
    new BrowserWindow({
      width: 480,
      height: 104,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      ...PANEL,
      backgroundColor: '#00000000',
      webPreferences: webPreferences('toast-preload.js'),
    }),
    'toast',
  )
  windows.toast.setAlwaysOnTop(true, 'screen-saver')
  await windows.toast.loadFile(path.join(ROOT, 'toast.html'))

  windows.settings = watch(
    new BrowserWindow({
      width: 460,
      height: 474,
      useContentSize: true,
      resizable: false,
      title: 'Orbit Settings',
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e20' : '#f2f2f4',
      show: false,
      webPreferences: webPreferences('window-preload.js'),
    }),
    'settings',
  )

  windows.onboarding = watch(
    new BrowserWindow({
      width: 920,
      height: 620,
      resizable: false,
      title: 'Welcome to Orbit',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 18 },
      backgroundColor: '#111113',
      show: false,
      webPreferences: webPreferences('window-preload.js'),
    }),
    'onboarding',
  )
}

async function wheelScenes(theme) {
  const display = screen.getPrimaryDisplay()
  const { overlay } = windows
  overlay.setBounds(display.bounds)
  overlay.setOpacity(1)
  overlay.showInactive()
  await sleep(300)

  const bounds = overlay.getContentBounds()
  const origin = { x: bounds.width / 2, y: bounds.height / 2 }
  const at = (deg, radius) => ({ x: origin.x + Math.cos((deg * Math.PI) / 180) * radius, y: origin.y + Math.sin((deg * Math.PI) / 180) * radius })
  const crop = { x: bounds.x + origin.x - 340, y: bounds.y + origin.y - 340, width: 680, height: 680 }
  const send = (channel, payload) => overlay.webContents.send(channel, payload)

  const start = () => send('wheel:start', { origin, slots: slots.map(({ label, caption, icon, glyph }) => ({ label, caption, icon, glyph })) })

  // The first open after launch pays one-off costs (layers, glyphs); measure it,
  // but judge the warm one, which is every open after that.
  let pacing = framePacing(overlay, 450)
  start()
  const cold = await pacing
  send('wheel:cancel')
  await sleep(400)
  pacing = framePacing(overlay, 450)
  start()
  const opening = await pacing
  await shoot(`${theme}-wheel-idle`, crop, overlay)

  send('wheel:pointer', at(-45, 210))
  await sleep(450)
  await shoot(`${theme}-wheel-aim`, crop, overlay)
  // Let the window server finish with the capture before timing anything.
  await sleep(500)

  // A full sweep around the ring at the rate main samples the pointer.
  const sweep = framePacing(overlay, 1300)
  for (let i = 0; i <= 150; i++) {
    send('wheel:pointer', at(-45 + (i / 150) * 360, 210))
    await sleep(8)
  }
  const sweeping = await sweep
  send('wheel:pointer', at(135, 210))
  await sleep(450)
  await shoot(`${theme}-wheel-aim-2`, crop, overlay)

  // Back to the middle: the hub offers to cancel.
  send('wheel:pointer', at(0, 10))
  await sleep(350)
  await shoot(`${theme}-wheel-cancel`, crop, overlay)

  send('wheel:pointer', at(90, 210))
  await sleep(300)
  send('wheel:release')
  await sleep(70)
  await shoot(`${theme}-wheel-release`, crop, overlay)
  await sleep(400)

  overlay.hide()
  console.log(`${theme} wheel first open`, JSON.stringify(cold))
  console.log(`${theme} wheel opening`, JSON.stringify(opening))
  console.log(`${theme} wheel sweep  `, JSON.stringify(sweeping))
  for (const [label, stats] of [['opening', opening], ['sweep', sweeping]]) {
    if (stats.dropped > Math.max(2, stats.frames * 0.05)) problems.push(`${theme} wheel ${label}: ${stats.dropped} dropped frames of ${stats.frames}`)
  }
}

async function toastScenes(theme) {
  const { toast } = windows
  const area = screen.getPrimaryDisplay().workArea
  toast.setPosition(Math.round(area.x + (area.width - 480) / 2), Math.round(area.y + area.height - 104 - 28))
  toast.showInactive()
  const toasts = [
    ['success', { ok: true, title: 'Screenshot', message: 'Copied to clipboard', icon: 'screenshot' }],
    ['color', { ok: true, title: 'Pick Color', message: 'Copied #3A63F0', icon: 'picker' }],
    ['error', { ok: false, title: 'Grab Text', message: 'No text found', icon: 'scan' }],
  ]
  for (const [name, data] of toasts) {
    toast.webContents.send('toast:show', data)
    await sleep(700)
    await shoot(`${theme}-toast-${name}`, toast.getBounds(), toast)
  }
  toast.webContents.send('toast:hide')
  await sleep(250)
  toast.hide()
}

async function windowScenes(theme) {
  const { settings, onboarding } = windows
  settings.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1e1e20' : '#f2f2f4')
  await settings.loadFile(path.join(ROOT, 'settings.html'))
  settings.center()
  settings.show()
  await sleep(900)
  await shoot(`${theme}-settings`, settings.getBounds(), settings)
  settings.hide()

  for (const step of ['welcome', 'wheel', 'permissions', 'shortcut', 'ready']) {
    await onboarding.loadFile(path.join(ROOT, 'onboarding.html'), { query: { step } })
    if (!onboarding.isVisible()) {
      onboarding.center()
      onboarding.show()
    }
    await sleep(step === 'welcome' ? 2600 : 1200)
    if (step === 'shortcut') {
      onboarding.webContents.send('practice:start', { origin: { x: 310, y: 310 } })
      onboarding.webContents.send('practice:pointer', { x: 470, y: 250 })
      await sleep(500)
    }
    await shoot(`${theme}-onboarding-${step}`, onboarding.getBounds(), onboarding)
  }
  onboarding.hide()
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  app.dock?.hide()
  try {
    await makeWindows()
    for (const theme of ['dark', 'light']) {
      nativeTheme.themeSource = theme
      await sleep(300)
      await wheelScenes(theme)
      await toastScenes(theme)
      await windowScenes(theme)
    }
  } catch (error) {
    problems.push(error.stack || String(error))
  }
  for (const problem of problems) console.log(`FAIL  ${problem}`)
  console.log(problems.length ? `${problems.length} problem(s)` : 'All UI scenes rendered cleanly')
  app.exit(problems.length ? 1 : 0)
})
