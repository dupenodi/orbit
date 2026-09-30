const login = document.getElementById('login')
const permissionList = document.getElementById('permissions')
const permissionsNote = document.getElementById('permissions-note')

const recorder = createShortcutRecorder({
  button: document.getElementById('shortcut'),
  help: document.getElementById('shortcut-help'),
  idleHelp: 'Click, then press the keys to hold.',
})

const STATUS_TEXT = { granted: 'Allowed', needed: 'Not set up', denied: 'Turned off', unknown: 'Unknown' }
let permissions = []

function renderPermissions(status) {
  permissionList.replaceChildren(
    ...permissions.map(({ id, title, why }) => {
      const state = status[id] ?? 'unknown'
      const row = document.createElement('div')
      row.className = 'row'
      const text = document.createElement('div')
      const name = document.createElement('p')
      name.className = 'label'
      name.textContent = title
      const help = document.createElement('p')
      help.className = 'help'
      help.textContent = why
      text.append(name, help)

      const side = document.createElement('div')
      side.className = 'side'
      const pill = document.createElement('span')
      pill.className = `pill is-${state}`
      pill.textContent = STATUS_TEXT[state]
      side.append(pill)
      if (state !== 'granted') {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = state === 'needed' ? 'Allow…' : 'Open Settings'
        button.addEventListener('click', async () => {
          renderPermissions(await window.orbitApp.requestPermission(id))
        })
        side.append(button)
      }
      row.append(text, side)
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
  recorder.show(prefs)
  login.checked = prefs.openAtLogin
  permissions = info.permissions
  document.getElementById('permissions-section').hidden = !permissions.length
  document.getElementById('version').textContent = `Orbit ${info.version}`
  permissionsNote.textContent = `In System Settings, Orbit is listed as “${info.settingsName}”. Screen Recording needs a restart of Orbit after you allow it.`
  await refreshPermissions()
}

login.addEventListener('change', async () => {
  login.checked = (await window.prefs.setOpenAtLogin(login.checked)).openAtLogin
})

document.getElementById('guide').addEventListener('click', () => window.orbitApp.openOnboarding())

// Coming back from System Settings is the moment permissions change.
window.addEventListener('focus', refreshPermissions)

load()
