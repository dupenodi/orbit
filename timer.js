// One countdown that Orbit keeps itself, so the menu bar can show what's left.
// It tracks the end time rather than counting ticks, so it stays right across sleep.
let endsAt = null
let tick = null
let listener = () => {}

function timeLeft() {
  if (!endsAt) return null
  const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function stop() {
  clearInterval(tick)
  tick = null
  endsAt = null
}

function update() {
  if (endsAt && Date.now() >= endsAt) {
    stop()
    listener({ left: null, finished: true })
    return
  }
  listener({ left: timeLeft(), finished: false })
}

// Starts a timer, or cancels the one that's running.
function toggleTimer(minutes) {
  if (endsAt) {
    stop()
    update()
    return { ok: true, message: 'Stopped' }
  }
  endsAt = Date.now() + minutes * 60_000
  tick = setInterval(update, 1000)
  update()
  const end = new Date(endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return { ok: true, message: `Ends at ${end}` }
}

function onTimerChange(fn) {
  listener = fn
}

module.exports = { onTimerChange, timeLeft, toggleTimer }
