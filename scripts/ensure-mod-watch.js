// Builds Orbit's native helpers for this platform when their sources are newer:
// Swift on macOS, C# (with the compiler that ships in Windows) on Windows.
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

function stale(src, out) {
  return !fs.existsSync(out) || fs.statSync(src).mtimeMs > fs.statSync(out).mtimeMs
}

function rebuild(src, out, file, args) {
  if (!stale(src, out)) return
  fs.mkdirSync(path.dirname(out), { recursive: true })
  execFileSync(file, args, { stdio: 'inherit' })
}

function buildMac() {
  for (const name of ['mod-watch', 'grab-text', 'pick-color', 'media-key', 'permissions']) {
    const src = path.join(root, `${name}.swift`)
    const out = path.join(root, 'bin', name)
    rebuild(src, out, 'swiftc', ['-O', '-o', out, src])
  }

  const traySrc = path.join(__dirname, 'make-tray-icon.swift')
  const trayOut = path.join(root, 'assets', 'TrayIconTemplate.png')
  if (stale(traySrc, trayOut)) {
    const bin = path.join(root, 'bin', 'make-tray-icon')
    execFileSync('swiftc', ['-O', '-o', bin, traySrc], { stdio: 'inherit' })
    execFileSync(bin, [path.join(root, 'assets')], { stdio: 'inherit' })
  }
}

// Every Windows 10/11 install has .NET Framework 4's csc.exe (C# 5).
function windowsCompiler() {
  const windir = process.env.WINDIR || 'C:\\Windows'
  const candidates = ['Framework64', 'Framework'].map((dir) => path.join(windir, 'Microsoft.NET', dir, 'v4.0.30319', 'csc.exe'))
  const csc = candidates.find((file) => fs.existsSync(file))
  if (!csc) throw new Error('Could not find csc.exe from .NET Framework 4')
  return csc
}

function buildWindows() {
  const src = path.join(root, 'win', 'orbit-win.cs')
  const out = path.join(root, 'bin', 'orbit-win.exe')
  rebuild(src, out, windowsCompiler(), ['/nologo', '/optimize+', '/platform:anycpu', '/target:exe', `/out:${out}`, src])
}

if (process.platform === 'darwin') buildMac()
else if (process.platform === 'win32') buildWindows()
