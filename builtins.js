const { clipboard, shell } = require('electron')
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { toggleTimer } = require('./timer')

// Orbit's own actions, used as { "type": "builtin", "action": "grab-text" } in
// wheels.json so one wheel works on every platform. macOS runs the helper scripts;
// Windows uses orbit-win.exe, Orbit's screen picker, and Windows' OCR.

const IS_WIN = process.platform === 'win32'
const WIN_TOOL = path.join(__dirname, 'bin', 'orbit-win.exe')
const OCR_SCRIPT = path.join(__dirname, 'win', 'ocr.ps1')

// Built-in action → script in helpers/ (macOS).
const MAC_SCRIPTS = {
  'grab-text': 'grab-text',
  screenshot: 'screenshot',
  'scan-qr': 'scan-qr',
  'pick-color': 'pick-color',
  'switch-theme': 'theme',
  'play-pause': 'play-pause',
  'toggle-mic': 'mic',
}

function firstLine(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? ''
}

function lastLine(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? ''
}

function run(file, args, timeout = 30_000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

async function winTool(command) {
  const { error, stdout, stderr } = await run(WIN_TOOL, [command])
  if (error) return { ok: false, message: firstLine(stderr) || error.message }
  return { ok: true, message: lastLine(stdout) || 'Done' }
}

// Windows OCR reads small text poorly and refuses huge images, so size it first.
function sizeForOcr(image) {
  const { width, height } = image.getSize()
  const longest = Math.max(width, height)
  const scale = longest > 2600 ? 2600 / longest : longest < 800 ? 2 : 1
  if (scale === 1) return image
  return image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' })
}

async function readText(image) {
  const file = path.join(os.tmpdir(), `orbit-ocr-${process.pid}-${Date.now()}.png`)
  fs.writeFileSync(file, sizeForOcr(image).toPNG())
  try {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', OCR_SCRIPT, '-Path', file]
    const { error, stdout, stderr } = await run('powershell.exe', args)
    if (error) throw new Error(firstLine(stderr) || error.message)
    return stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean).join('\n')
  } finally {
    fs.rmSync(file, { force: true })
  }
}

// jsQR wants RGBA; Chromium's bitmaps are BGRA.
function readCode(image) {
  const jsQR = require('jsqr')
  const { width, height } = image.getSize()
  const pixels = Uint8ClampedArray.from(image.toBitmap())
  for (let i = 0; i < pixels.length; i += 4) {
    const blue = pixels[i]
    pixels[i] = pixels[i + 2]
    pixels[i + 2] = blue
  }
  return jsQR(pixels, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

function preview(text) {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

const WINDOWS = {
  async screenshot(pick) {
    const picked = await pick('region')
    if (!picked) return { ok: false, message: 'Cancelled' }
    clipboard.writeImage(picked.image)
    return { ok: true, message: 'Copied to clipboard' }
  },
  async 'grab-text'(pick) {
    const picked = await pick('region')
    if (!picked) return { ok: false, message: 'Cancelled' }
    const text = await readText(picked.image)
    if (!text) return { ok: false, message: 'No text found' }
    clipboard.writeText(text)
    const words = text.split(/\s+/).filter(Boolean).length
    return { ok: true, message: `Copied ${words} word${words === 1 ? '' : 's'}` }
  },
  async 'scan-qr'(pick) {
    const picked = await pick('region')
    if (!picked) return { ok: false, message: 'Cancelled' }
    const payload = readCode(picked.image)
    if (!payload) return { ok: false, message: 'No code found' }
    if (/^https?:\/\//i.test(payload)) {
      await shell.openExternal(payload)
      return { ok: true, message: `Opened ${new URL(payload).host}` }
    }
    clipboard.writeText(payload)
    return { ok: true, message: `Copied ${preview(payload)}` }
  },
  async 'pick-color'(pick) {
    const picked = await pick('point')
    if (!picked) return { ok: false, message: 'Cancelled' }
    clipboard.writeText(picked.color)
    return { ok: true, message: `Copied ${picked.color}` }
  },
  'switch-theme': () => winTool('theme'),
  'play-pause': () => winTool('media'),
  'toggle-mic': () => winTool('mic'),
}

// `runShell` and `pick` come from the caller, so this module stays free of window code.
async function runBuiltin(run, context, { runShell, pick }) {
  if (run.action === 'timer') return toggleTimer(run.minutes ?? 25)
  if (IS_WIN) {
    const action = WINDOWS[run.action]
    if (!action) return { ok: false, message: `Unknown built-in action “${run.action}”` }
    try {
      return await action(pick)
    } catch (error) {
      return { ok: false, message: firstLine(error.message) }
    }
  }
  const script = MAC_SCRIPTS[run.action]
  if (!script) return { ok: false, message: `Unknown built-in action “${run.action}”` }
  return runShell({ cmd: `"$ORBIT_HELPERS/${script}"` }, context)
}

module.exports = { readCode, readText, runBuiltin }
