// End-to-end checks for Orbit on Windows, run by CI: `npx electron test/windows-e2e.js`.
// Drives the real helpers and actions with simulated input, and saves screenshots
// to test-output/ so a human can eyeball the picker and the wheel.
const { app, BrowserWindow, clipboard, desktopCapturer, nativeImage, screen } = require('electron')
const { execFile, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'test-output')
const TOOL = path.join(ROOT, 'bin', 'orbit-win.exe')
const INPUT = path.join(__dirname, 'win-input.ps1')
const PERSONALIZE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'

app.setName('Orbit-e2e')
const { runAction } = require(path.join(ROOT, 'actions.js'))
const { readText } = require(path.join(ROOT, 'builtins.js'))

const results = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

function run(file, args, timeout = 30_000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true }, (error, stdout, stderr) =>
      resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout).trim(), stderr: String(stderr).trim() }),
    )
  })
}

const input = (...args) => run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', INPUT, ...args.map(String)])

async function screenshot(name) {
  const display = screen.getPrimaryDisplay()
  const size = { width: display.size.width * display.scaleFactor, height: display.size.height * display.scaleFactor }
  const [source] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
  if (source) fs.writeFileSync(path.join(OUT, `${name}.png`), source.thumbnail.toPNG())
}

async function clipboardImageSize() {
  const [item] = await clipboard.read()
  if (!item?.types.includes('image/png')) return { width: 0, height: 0 }
  const blob = await item.getType('image/png')
  return nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())).getSize()
}

// Echo the mouse events the picker page receives, to debug input on CI.
app.on('web-contents-created', (_event, contents) => {
  contents.on('did-finish-load', () => {
    if (!contents.getURL().endsWith('capture.html')) return
    contents.executeJavaScript(`for (const type of ['mousedown', 'mouseup']) addEventListener(type, (e) => console.log('picker', type, e.clientX, e.clientY), true)`)
  })
  contents.on('console-message', (event) => {
    if (String(event.message).startsWith('picker')) console.log('      ', event.message)
  })
})

const slot = (label, action, extra = {}) => ({ label, run: { type: 'builtin', action, ...extra } })

// Runs a picker slot while `drive` plays the user's part once the picker is up.
async function withInput(action, drive, shotName) {
  const pending = runAction(action, {})
  await sleep(2500)
  if (shotName) await screenshot(shotName)
  await drive()
  return pending
}

async function registryLight() {
  const { stdout } = await run('reg.exe', ['query', PERSONALIZE, '/v', 'AppsUseLightTheme'])
  const match = stdout.match(/0x([0-9a-f]+)/i)
  return match ? parseInt(match[1], 16) : 1
}

async function testTools() {
  const before = await registryLight()
  const first = await run(TOOL, ['theme'])
  const flipped = await registryLight()
  const second = await run(TOOL, ['theme'])
  const restored = await registryLight()
  check('theme switches and switches back', first.code === 0 && second.code === 0 && flipped !== before && restored === before, `${first.stdout} / ${second.stdout}`)

  const media = await run(TOOL, ['media'])
  check('media key sends', media.code === 0 && media.stdout === 'Toggled playback', media.stdout || media.stderr)

  // CI machines usually have no microphone; that must fail cleanly, not crash.
  const mic = await run(TOOL, ['mic'])
  if (mic.code === 0) {
    const back = await run(TOOL, ['mic'])
    check('mic mutes and unmutes', back.code === 0 && mic.stdout !== back.stdout, `${mic.stdout} / ${back.stdout}`)
  } else {
    check('mic without a device fails cleanly', mic.stderr === 'No microphone found', mic.stderr)
  }
}

async function testWatcher() {
  const child = spawn(TOOL, ['watch', '--control', '--option', `--parent=${process.pid}`], { stdio: ['pipe', 'pipe', 'pipe'] })
  const lines = []
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    const parts = buffer.split('\n')
    buffer = parts.pop()
    lines.push(...parts.map((line) => line.replace(/\r$/, '')))
  })
  await sleep(800)

  child.stdin.write('warp 321 234\n')
  await sleep(300)
  const cursor = await run(TOOL, ['cursor'])
  check('watcher warps the pointer', lines.includes('warped') && cursor.stdout === '321 234', `cursor at ${cursor.stdout}`)

  await input('hold', 600)
  await sleep(300)
  const down = lines.find((line) => line.startsWith('down'))
  check('watcher sees Ctrl+Alt held', Boolean(down), JSON.stringify(down))
  check('watcher sees it released', lines.includes('up'))
  const app = down?.split('\t')[1] ?? ''
  check('watcher names the front app', /\.exe$/.test(app), app)

  child.stdin.end()
  await sleep(500)
  check('watcher exits when Orbit closes its stdin', child.exitCode !== null)
  if (child.exitCode === null) child.kill()
}

// A window with things to pick: text, a QR code, and a colour block, at known spots.
async function showTarget() {
  const qr = fs.readFileSync(path.join(__dirname, 'fixtures', 'qr-text.png')).toString('base64')
  const html = `<body style="margin:0;background:#fff;font-family:Segoe UI,sans-serif">
    <div style="position:absolute;left:20px;top:20px;width:420px;font-size:44px;font-weight:600;color:#111">Orbit reads this text</div>
    <img src="data:image/png;base64,${qr}" style="position:absolute;left:460px;top:20px;width:260px;height:260px;image-rendering:pixelated">
    <div style="position:absolute;left:740px;top:20px;width:180px;height:260px;background:#3A7BD5"></div></body>`
  const win = new BrowserWindow({ x: 20, y: 20, width: 960, height: 320, frame: false, show: false, alwaysOnTop: true })
  await win.loadURL(`data:text/html,${encodeURIComponent(html)}`)
  win.showInactive()
  await sleep(800)
  return win
}

async function testOcr(target) {
  const image = await target.webContents.capturePage({ x: 0, y: 0, width: 460, height: 160 })
  try {
    const text = await readText(image)
    check('Windows OCR reads text', /orbit/i.test(text) && /text/i.test(text), JSON.stringify(text))
  } catch (error) {
    check('Windows OCR reads text', false, error.message)
  }
}

async function testSlots() {
  // Screen coordinates: the target window sits at (20, 20).
  const grab = await withInput(slot('Grab Text', 'grab-text'), () => input('drag', 30, 30, 470, 190), 'picker-region')
  const grabbed = await clipboard.readText()
  check('Grab Text copies text from the screen', grab.ok && /orbit/i.test(grabbed), `${grab.message} · ${JSON.stringify(grabbed)}`)

  const scan = await withInput(slot('Scan QR', 'scan-qr'), () => input('drag', 470, 30, 750, 310))
  check('Scan QR reads a code', scan.ok && (await clipboard.readText()) === 'orbit test payload 123', scan.message)

  const color = await withInput(slot('Pick Color', 'pick-color'), () => input('click', 850, 150), 'picker-point')
  check('Pick Color copies the pixel', color.ok && (await clipboard.readText()) === '#3A7BD5', color.message)

  const shot = await withInput(slot('Screenshot', 'screenshot'), () => input('drag', 100, 100, 500, 300))
  const size = await clipboardImageSize()
  check('Screenshot copies the region', shot.ok && size.width >= 390 && size.height >= 190, `${shot.message} · ${size.width}×${size.height}`)

  const cancelled = await withInput(slot('Screenshot', 'screenshot'), () => input('esc'))
  check('Esc cancels the picker', !cancelled.ok && cancelled.message === 'Cancelled', cancelled.message)

  const themeA = await runAction(slot('Switch Theme', 'switch-theme'), {})
  const themeB = await runAction(slot('Switch Theme', 'switch-theme'), {})
  check('Switch Theme slot', themeA.ok && themeB.ok && themeA.message !== themeB.message, `${themeA.message} / ${themeB.message}`)

  const play = await runAction(slot('Play or Pause', 'play-pause'), {})
  check('Play or Pause slot', play.ok, play.message)

  const mic = await runAction(slot('Toggle Mic', 'toggle-mic'), {})
  if (mic.ok) await runAction(slot('Toggle Mic', 'toggle-mic'), {})
  check('Toggle Mic slot answers', mic.ok || mic.message === 'No microphone found', mic.message)

  const start = await runAction(slot('Start Timer', 'timer', { minutes: 25 }), {})
  const stop = await runAction(slot('Start Timer', 'timer', { minutes: 25 }), {})
  check('Start Timer slot starts and stops', start.ok && /^Ends at/.test(start.message) && stop.message === 'Stopped', `${start.message} / ${stop.message}`)
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  try {
    check('orbit-win.exe was built', fs.existsSync(TOOL))
    await testTools()
    await testWatcher()
    const target = await showTarget()
    await testOcr(target)
    await testSlots()
    target.destroy()
  } catch (error) {
    check('no unexpected errors', false, error.stack)
  }
  const failed = results.filter((result) => !result.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  app.exit(failed.length ? 1 : 0)
})
