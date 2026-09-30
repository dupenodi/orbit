// Turns a button into a hold-shortcut recorder: click, hold the combo, release.
// Shared by Settings and onboarding; needs shortcut.js and window.prefs.
// `render` gets the label and, when there is one, the shortcut it describes.
function createShortcutRecorder({ button, help, idleHelp, render = (label) => (button.textContent = label), onChange }) {
  let recording = false
  let peak = null
  let savedLabel = button.textContent
  let savedShortcut = null

  function show(prefs) {
    savedLabel = prefs.shortcutLabel
    savedShortcut = prefs.shortcut
    if (recording) return
    render(prefs.shortcutLabel, prefs.shortcut)
    if (help) help.textContent = idleHelp
  }

  function setRecording(next) {
    recording = next
    peak = null
    button.classList.toggle('is-recording', next)
  }

  async function stop(restore) {
    setRecording(false)
    if (restore) {
      show(await window.prefs.cancelRecord())
      return
    }
    if (help) help.textContent = idleHelp
  }

  async function commit(shortcut) {
    setRecording(false)
    const result = await window.prefs.setShortcut(shortcut)
    if (result.ok) {
      show(result)
      onChange?.(result)
      return
    }
    if (help) help.textContent = 'Choose at least one modifier, or a key.'
    render(savedLabel, savedShortcut)
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

  const modifiersUp = (event) => !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey

  button.addEventListener('click', async () => {
    if (recording) {
      await stop(true)
      return
    }
    setRecording(true)
    render('Recording…')
    if (help) help.textContent = 'Hold the combo, then release. Esc cancels.'
    await window.prefs.beginRecord()
    button.focus()
  })

  window.addEventListener('keydown', async (event) => {
    if (!recording || event.repeat) return
    event.preventDefault()
    event.stopPropagation()
    if (event.code === 'Escape') {
      await stop(true)
      return
    }
    const shortcut = shortcutFromEvent(event)
    peak = mergePeak(shortcut)
    render(formatShortcut(peak), peak)
    if (shortcut.code && isValidShortcut(shortcut)) await commit(shortcut)
  })

  window.addEventListener('keyup', async (event) => {
    if (!recording || !peak) return
    event.preventDefault()
    if (!modifiersUp(event) || peak.code || !isValidShortcut(peak)) return
    await commit(peak)
  })

  window.addEventListener('blur', () => {
    if (recording) stop(true)
  })

  return { show, isRecording: () => recording }
}
