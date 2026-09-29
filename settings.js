const shortcutButton = document.getElementById('shortcut')
const shortcutHelp = document.getElementById('shortcut-help')
const login = document.getElementById('login')

let recording = false
let peak = null
let savedLabel = '⌃⌥'

function showPrefs(prefs) {
  savedLabel = prefs.shortcutLabel
  login.checked = prefs.openAtLogin
  if (!recording) {
    shortcutButton.textContent = prefs.shortcutLabel
    shortcutHelp.textContent = 'Click, then press the keys to hold.'
  }
}

async function load() {
  showPrefs(await window.prefs.get())
}

async function stopRecording(restore) {
  recording = false
  peak = null
  shortcutButton.classList.remove('is-recording')
  if (restore) {
    const prefs = await window.prefs.cancelRecord()
    showPrefs(prefs)
    return
  }
  shortcutHelp.textContent = 'Click, then press the keys to hold.'
}

async function commit(shortcut) {
  recording = false
  peak = null
  shortcutButton.classList.remove('is-recording')
  const result = await window.prefs.setShortcut(shortcut)
  if (result.ok) {
    showPrefs(result)
    return
  }
  shortcutHelp.textContent = 'Choose at least one modifier, or a key.'
  shortcutButton.textContent = savedLabel
  await window.prefs.cancelRecord()
}

function mergePeak(next) {
  if (!peak) return { ...next }
  return {
    control: peak.control || next.control,
    option: peak.option || next.option,
    shift: peak.shift || next.shift,
    command: peak.command || next.command,
    code: next.code || peak.code,
  }
}

function modifiersUp(event) {
  return !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
}

shortcutButton.addEventListener('click', async () => {
  if (recording) {
    await stopRecording(true)
    return
  }
  recording = true
  peak = null
  shortcutButton.classList.add('is-recording')
  shortcutButton.textContent = 'Recording'
  shortcutHelp.textContent = 'Hold the combo, then release. Esc cancels.'
  await window.prefs.beginRecord()
  shortcutButton.focus()
})

window.addEventListener('keydown', async (event) => {
  if (!recording) return
  if (event.repeat) return
  event.preventDefault()
  event.stopPropagation()

  if (event.code === 'Escape') {
    await stopRecording(true)
    return
  }

  const shortcut = shortcutFromEvent(event)
  peak = mergePeak(shortcut)
  shortcutButton.textContent = formatShortcut(peak)

  if (shortcut.code && isValidShortcut(shortcut)) {
    await commit(shortcut)
  }
})

window.addEventListener('keyup', async (event) => {
  if (!recording || !peak) return
  event.preventDefault()
  if (!modifiersUp(event)) return
  if (peak.code) return
  if (!isValidShortcut(peak)) return
  await commit(peak)
})

login.addEventListener('change', async () => {
  showPrefs(await window.prefs.setOpenAtLogin(login.checked))
})

window.addEventListener('blur', () => {
  if (recording) stopRecording(true)
})

load()
