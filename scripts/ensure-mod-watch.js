const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function rebuild(src, out, args) {
  if (fs.existsSync(out) && fs.statSync(src).mtimeMs <= fs.statSync(out).mtimeMs) return
  fs.mkdirSync(path.dirname(out), { recursive: true })
  execFileSync('swiftc', args, { stdio: 'inherit' })
}

const root = path.join(__dirname, '..')
rebuild(
  path.join(root, 'mod-watch.swift'),
  path.join(root, 'bin', 'mod-watch'),
  ['-O', '-o', path.join(root, 'bin', 'mod-watch'), path.join(root, 'mod-watch.swift')],
)
rebuild(
  path.join(root, 'grab-text.swift'),
  path.join(root, 'bin', 'grab-text'),
  ['-O', '-o', path.join(root, 'bin', 'grab-text'), path.join(root, 'grab-text.swift')],
)
for (const name of ['pick-color', 'media-key']) {
  rebuild(
    path.join(root, `${name}.swift`),
    path.join(root, 'bin', name),
    ['-O', '-o', path.join(root, 'bin', name), path.join(root, `${name}.swift`)],
  )
}
rebuild(
  path.join(root, 'permissions.swift'),
  path.join(root, 'bin', 'permissions'),
  ['-O', '-o', path.join(root, 'bin', 'permissions'), path.join(root, 'permissions.swift')],
)

const traySrc = path.join(__dirname, 'make-tray-icon.swift')
const trayOut = path.join(root, 'assets', 'TrayIconTemplate.png')
if (!fs.existsSync(trayOut) || fs.statSync(traySrc).mtimeMs > fs.statSync(trayOut).mtimeMs) {
  fs.mkdirSync(path.dirname(trayOut), { recursive: true })
  const bin = path.join(root, 'bin', 'make-tray-icon')
  execFileSync('swiftc', ['-O', '-o', bin, traySrc], { stdio: 'inherit' })
  execFileSync(bin, [path.join(root, 'assets')], { stdio: 'inherit' })
}
