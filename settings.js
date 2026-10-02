import { iconSvg } from './icons.js'

const login = document.getElementById('login')
const permissionList = document.getElementById('permissions')
const permissionsNote = document.getElementById('permissions-note')
const shortcutButton = document.getElementById('shortcut')
const IDLE_HELP = 'Hold it anywhere to open the wheel.'

// The shortcut as keycaps; while recording with nothing held, a prompt instead.
function renderShortcut(label, shortcut) {
  const recording = shortcutButton.classList.contains('is-recording')
  const parts = shortcut ? shortcutParts(shortcut) : []
  if (!parts.length) {
    const placeholder = document.createElement('span')
    placeholder.className = 'placeholder'
    placeholder.textContent = recording ? 'Press keys…' : label
    shortcutButton.replaceChildren(placeholder)
  } else {
    shortcutButton.replaceChildren(
      ...parts.map(([symbol]) => {
        const cap = document.createElement('kbd')
        cap.textContent = symbol
        return cap
      }),
    )
  }
  shortcutButton.setAttribute('aria-label', recording ? 'Recording shortcut' : `Shortcut: ${label}. Click to change.`)
}

const recorder = createShortcutRecorder({
  button: shortcutButton,
  help: document.getElementById('shortcut-help'),
  idleHelp: IDLE_HELP,
  render: renderShortcut,
})

const STATUS_TEXT = { granted: 'Allowed', needed: 'Not allowed', denied: 'Turned off', unknown: 'Checking…' }
let permissions = []

function renderPermissions(status) {
  permissionList.replaceChildren(
    ...permissions.map(({ id, title, why }) => {
      const state = status[id] ?? 'unknown'
      const row = document.createElement('div')
      row.className = `row permission is-${state}`

      const icon = document.createElement('div')
      icon.className = 'permission-icon'
      icon.append(iconSvg(document, id))

      const text = document.createElement('div')
      text.className = 'row-text'
      const name = document.createElement('p')
      name.className = 'label'
      name.textContent = title
      const help = document.createElement('p')
      help.className = 'help'
      help.textContent = why
      text.append(name, help)

      const side = document.createElement('div')
      side.className = 'side'
      if (state === 'granted' || state === 'unknown') {
        const badge = document.createElement('span')
        badge.className = `state is-${state}`
        badge.textContent = STATUS_TEXT[state]
        side.append(badge)
      } else {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'push'
        button.textContent = state === 'needed' ? 'Allow…' : 'Open Settings…'
        button.title = STATUS_TEXT[state]
        button.addEventListener('click', async () => {
          button.disabled = true
          renderPermissions(await window.orbitApp.requestPermission(id))
        })
        side.append(button)
      }
      row.append(icon, text, side)
      return row
    }),
  )
}

async function refreshPermissions() {
  if (!permissions.length) return
  renderPermissions(await window.orbitApp.permissions())
}

async function load() {
  const [prefs, info] = await Promise.all([window.prefs.get(), window.orbitApp.info()])
  document.documentElement.dataset.platform = info.platform
  if (info.accent) document.documentElement.style.setProperty('--accent', info.accent)
  recorder.show(prefs)
  login.checked = prefs.openAtLogin
  permissions = info.permissions
  document.getElementById('permissions-section').hidden = !permissions.length
  document.getElementById('version').textContent = `Orbit ${info.version}`
  permissionsNote.textContent = `Orbit appears as “${info.settingsName}” in System Settings. Screen Recording takes effect after Orbit restarts.`
  renderPermissions({})
  await refreshPermissions()
}

login.addEventListener('change', async () => {
  login.checked = (await window.prefs.setOpenAtLogin(login.checked)).openAtLogin
})

document.getElementById('guide').addEventListener('click', () => window.orbitApp.openOnboarding())

// Coming back from System Settings is the moment permissions change.
window.addEventListener('focus', refreshPermissions)

load()
