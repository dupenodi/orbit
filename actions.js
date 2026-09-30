const { app, shell } = require('electron')
const { execFile, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const { timeLeft, toggleTimer } = require('./timer')

const DEFAULT_WHEELS = path.join(__dirname, 'default-wheels.json')
const HELPERS = path.join(__dirname, 'helpers')
const OSASCRIPT_TIMEOUT_MS = 3_000
const SHELL_TIMEOUT_MS = 60_000
// Apps launched from a login item get a bare PATH; add the usual tool dirs.
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local/bin')]

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
// focused window's title ("file — folder") against them; without a title, use
// the editor's last active window.
function resolveVSCodeProject(appDir, title) {
  const storage = path.join(os.homedir(), 'Library', 'Application Support', appDir, 'User', 'globalStorage', 'storage.json')
  let state
  try {
    state = JSON.parse(fs.readFileSync(storage, 'utf8')).windowsState ?? {}
  } catch {
    return null
  }
  const toPath = (win) => (win?.folder?.startsWith('file://') ? fileURLToPath(win.folder) : null)
  const folders = (state.openedWindows ?? []).map(toPath).filter(Boolean)
  if (title) {
    const parts = title.split(' — ').map((part) => part.trim())
    const match = folders.find((folder) => parts.includes(path.basename(folder)))
    if (match) return match
  }
  return toPath(state.lastActiveWindow)
}

// Front apps whose working folder Orbit knows how to find, so your own slots
// can work where you are. Editors are read from disk when the wheel
// opens; Finder is asked over Apple Events only when a slot runs, so the wheel
// never waits on it.
const EDITORS = {
  'com.todesktop.230313mzl4w4u92': 'Cursor',
  'com.microsoft.VSCode': 'Code',
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
  if (slot.run?.type !== 'timer' || !left) return slot
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

function runShell(run, context) {
  const vars = contextEnv(context)
  const env = { ...process.env, ...vars, PATH: [...EXTRA_PATH, process.env.PATH].join(':') }
  const cwd = context.project && fs.existsSync(context.project) ? context.project : os.homedir()
  return new Promise((resolve) => {
    const child = spawn('/bin/zsh', ['-lc', run.cmd], { cwd, env, timeout: SHELL_TIMEOUT_MS })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => resolve({ ok: false, message: error.message }))
    child.on('close', (code, signal) => {
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
  const context = await withLiveContext(frontContext)
  switch (run.type) {
    case 'shell':
      return runShell(run, context)
    case 'url':
      return runUrl(run, context)
    case 'shortcut':
      return runShortcut(run)
    case 'timer':
      return toggleTimer(run.minutes ?? 25)
    default:
      return { ok: false, message: `Unknown action type “${run.type}”` }
  }
}

module.exports = { ensureWheelsFile, runAction, wheelFor, wheelsFile }
