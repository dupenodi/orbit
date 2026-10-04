const { app, shell } = require('electron')
const { execFile, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const { runBuiltin } = require('./builtins')
const { pickFromScreen } = require('./capture')
const { timeLeft, toggleTimer } = require('./timer')

const DEFAULT_WHEELS = path.join(__dirname, 'default-wheels.json')
const IS_WIN = process.platform === 'win32'
const HELPERS = path.join(__dirname, IS_WIN ? 'win' : 'helpers')
const OSASCRIPT_TIMEOUT_MS = 3_000
const SHELL_TIMEOUT_MS = 60_000
// Apps launched from a login item get a bare PATH; add the usual tool dirs.
const EXTRA_PATH = IS_WIN ? [] : ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local/bin')]

function wheelsFile() {
  return path.join(app.getPath('userData'), 'wheels.json')
}

function ensureWheelsFile() {
  const file = wheelsFile()
  if (fs.existsSync(file)) return file
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.copyFileSync(DEFAULT_WHEELS, file)
  return file
}

function loadWheels() {
  try {
    return { wheels: JSON.parse(fs.readFileSync(ensureWheelsFile(), 'utf8')), error: null }
  } catch (error) {
    return { wheels: JSON.parse(fs.readFileSync(DEFAULT_WHEELS, 'utf8')), error }
  }
}

// VS Code-family editors record their open folders in storage.json. Match the
// focused window's title ("file — folder" on macOS, "file - folder" on Windows)
// against them; without a title, use the editor's last active window.
function resolveVSCodeProject(appDir, title) {
  const storage = path.join(app.getPath('appData'), appDir, 'User', 'globalStorage', 'storage.json')
  let state
  try {
    state = JSON.parse(fs.readFileSync(storage, 'utf8')).windowsState ?? {}
  } catch {
    return null
  }
  const toPath = (win) => (win?.folder?.startsWith('file://') ? fileURLToPath(win.folder) : null)
  const folders = (state.openedWindows ?? []).map(toPath).filter(Boolean)
  if (title) {
    const parts = title.split(/ [—-] /).map((part) => part.trim())
    const match = folders.find((folder) => parts.includes(path.basename(folder)))
    if (match) return match
  }
  return toPath(state.lastActiveWindow)
}

// Front apps whose working folder Orbit knows how to find, so your own slots
// can work where you are. Editors are read from disk when the wheel
// opens; Finder is asked over Apple Events only when a slot runs, so the wheel
// never waits on it.
// Keyed by bundle id on macOS and by exe name on Windows.
const EDITORS = {
  'com.todesktop.230313mzl4w4u92': 'Cursor',
  'com.microsoft.VSCode': 'Code',
  'cursor.exe': 'Cursor',
  'code.exe': 'Code',
}
const FINDER = 'com.apple.finder'

function resolveProject(front) {
  const appDir = EDITORS[front.bundleId]
  return appDir ? resolveVSCodeProject(appDir, front.title) : null
}

function osascript(source) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e', source], { timeout: OSASCRIPT_TIMEOUT_MS }, (error, stdout) => {
      resolve(error ? null : stdout.replace(/\n$/, ''))
    })
  })
}

// Finder: the front window's folder (Desktop when none is open) and the
// selected items, one path per line.
async function readFinder() {
  const out = await osascript(`tell application "Finder"
  try
    set folderPath to POSIX path of (target of front Finder window as alias)
  on error
    set folderPath to POSIX path of (desktop as alias)
  end try
  set picked to ""
  repeat with item_ in (get selection as alias list)
    set picked to picked & linefeed & POSIX path of item_
  end repeat
  return folderPath & picked
end tell`)
  if (out == null) return {}
  const [folder, ...selection] = out.split('\n')
  return { project: folder.replace(/(.)\/$/, '$1'), selection: selection.join('\n') }
}

async function withLiveContext(context) {
  return context.bundleId === FINDER ? { ...context, ...(await readFinder()) } : context
}

// A running timer turns its slot into the way to stop it, showing what's left.
function withLiveState(slot) {
  const left = timeLeft()
  const isTimer = slot.run?.type === 'timer' || (slot.run?.type === 'builtin' && slot.run.action === 'timer')
  if (!isTimer || !left) return slot
  return { ...slot, label: 'Stop Timer', caption: `${left} left` }
}

function wheelFor(front) {
  const { wheels, error } = loadWheels()
  const wheel = wheels.apps?.[front.bundleId] ?? wheels.global ?? { slots: [] }
  return {
    slots: (wheel.slots ?? []).map(withLiveState),
    context: { ...front, project: resolveProject(front) },
    error,
  }
}

function contextEnv(context) {
  return {
    ORBIT_APP: context.bundleId ?? '',
    ORBIT_WINDOW_TITLE: context.title ?? '',
    ORBIT_PROJECT: context.project ?? '',
    ORBIT_PROJECT_NAME: context.project ? path.basename(context.project) : '',
    ORBIT_SELECTION: context.selection ?? '',
    ORBIT_HELPERS: HELPERS,
  }
}

function expand(text, env) {
  return text.replace(/\$(ORBIT_[A-Z_]+)/g, (whole, name) => env[name] ?? whole)
}

function firstLine(text) {
  return text.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
}

function lastLine(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).at(-1) ?? ''
}

// Commands run in a login zsh on macOS and in PowerShell on Windows.
function shellCommand(cmd) {
  if (IS_WIN) return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd]]
  return ['/bin/zsh', ['-lc', cmd]]
}

// Stops a command and whatever it started (zsh → screencapture), which shares
// its process group; anything that shrugs off SIGTERM gets SIGKILL a second later.
function stopGroup(child) {
  const kill = (signal) => {
    try {
      process.kill(IS_WIN ? child.pid : -child.pid, signal)
    } catch {}
  }
  kill('SIGTERM')
  const force = setTimeout(() => kill('SIGKILL'), 1_000)
  child.once('close', () => clearTimeout(force))
}

// `signal` (an AbortSignal) stops the command early; it then reports "Cancelled".
function runShell(run, context, { signal: abort } = {}) {
  const vars = contextEnv(context)
  const env = { ...process.env, ...vars, PATH: [...EXTRA_PATH, process.env.PATH].join(path.delimiter) }
  const cwd = context.project && fs.existsSync(context.project) ? context.project : os.homedir()
  const [file, args] = shellCommand(run.cmd)
  return new Promise((resolve) => {
    // A stoppable command leads its own process group, so stopping it reaches its children.
    const child = spawn(file, args, { cwd, env, timeout: SHELL_TIMEOUT_MS, windowsHide: true, detached: Boolean(abort) && !IS_WIN })
    const stop = () => stopGroup(child)
    abort?.addEventListener('abort', stop, { once: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => resolve({ ok: false, message: error.message }))
    child.on('close', (code, signal) => {
      abort?.removeEventListener('abort', stop)
      if (abort?.aborted) {
        resolve({ ok: false, message: 'Cancelled' })
        return
      }
      if (code === 0) {
        resolve({ ok: true, message: expand(run.toast ?? '', vars) || lastLine(stdout) || 'Done' })
        return
      }
      const reason = signal ? `Stopped (${signal})` : `Exited with code ${code}`
      resolve({ ok: false, message: firstLine(stderr) || lastLine(stdout) || reason })
    })
  })
}

function runShortcut(run) {
  return new Promise((resolve) => {
    const child = spawn('/usr/bin/shortcuts', ['run', run.name])
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => resolve({ ok: false, message: error.message }))
    child.on('close', (code) => {
      resolve(code === 0 ? { ok: true, message: run.toast ?? `Ran ${run.name}` } : { ok: false, message: firstLine(stderr) || `Shortcut “${run.name}” failed` })
    })
  })
}

async function runUrl(run, context) {
  const vars = contextEnv(context)
  const url = expand(run.url, vars)
  try {
    await shell.openExternal(url)
    return { ok: true, message: expand(run.toast ?? '', vars) || `Opened ${url}` }
  } catch (error) {
    return { ok: false, message: error.message }
  }
}

async function runAction(slot, frontContext) {
  const run = slot.run
  if (!run) return { ok: false, message: 'Nothing assigned yet. Add it in wheels.json.' }
  // Only commands see Finder's folder and selection; asking Finder costs a round trip.
  const context = run.type === 'shell' || run.type === 'url' ? await withLiveContext(frontContext) : frontContext
  switch (run.type) {
    case 'shell':
      return runShell(run, context)
    case 'url':
      return runUrl(run, context)
    case 'shortcut':
      return runShortcut(run)
    case 'builtin':
      return runBuiltin(run, context, { runShell, pick: pickFromScreen })
    case 'timer':
      return toggleTimer(run.minutes ?? 25)
    default:
      return { ok: false, message: `Unknown action type “${run.type}”` }
  }
}

module.exports = { ensureWheelsFile, runAction, wheelFor, wheelsFile }
