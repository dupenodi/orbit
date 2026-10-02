import { initialState, reduce } from './wheel-machine.js'
import { createWheelView } from './wheel-view.js'

const config = { slots: [], deadzone: 44 }
let state = initialState()
let view = null
let slotsKey = ''

// Main sends the wheel for the frontmost app on every open; rebuild only when it changes.
function setSlots(slots) {
  const key = JSON.stringify(slots)
  if (key === slotsKey) return
  slotsKey = key
  config.slots = slots
  document.querySelector('#ring').replaceChildren()
  view = createWheelView(document, slots, { deadzone: config.deadzone, onSelect: () => window.orbit?.tick?.() })
}

function dispatch(action) {
  state = reduce(state, action, config)
  view?.sync(state)
}

// Main samples the pointer faster than the screen refreshes; apply only the
// latest sample, once per frame.
let pending = null
let frame = 0

function flushPointer() {
  cancelAnimationFrame(frame)
  frame = 0
  if (!pending) return
  const point = pending
  pending = null
  dispatch({ type: 'pointer', x: point.x, y: point.y })
}

// With ORBIT_TRACE on, main asks how many frames the wheel actually drew while
// opening, which shows whether it animated or stalled.
function measureOpening() {
  let frames = 0
  const started = performance.now()
  const count = (now) => {
    frames += 1
    if (now - started < 400) {
      requestAnimationFrame(count)
      return
    }
    const opacity = getComputedStyle(document.querySelector('#wheel')).opacity
    window.orbit.report(`frames=${frames} opacity=${opacity}`)
  }
  requestAnimationFrame(count)
}

let warming = 0

window.orbit?.onStart((_event, payload) => {
  clearTimeout(warming)
  setSlots(payload.slots)
  pending = null
  // Origin is the wheel's centre; main moves the pointer there as the wheel opens.
  dispatch({ type: 'open', origin: payload.origin })
  if (payload.trace) measureOpening()
})

// At launch, main shows this window once, invisibly: build and open the wheel so
// its layers exist and are painted before the first real hold.
window.orbit?.onWarm((_event, payload) => {
  setSlots(payload.slots)
  dispatch({ type: 'open', origin: { x: innerWidth / 2, y: innerHeight / 2 } })
  warming = setTimeout(() => {
    dispatch({ type: 'cancel' })
    view?.dismiss(false)
  }, 600)
})

window.orbit?.onPointer((_event, point) => {
  if (!state.open) return
  pending = point
  if (!frame) frame = requestAnimationFrame(flushPointer)
})

window.orbit?.onRelease(() => {
  flushPointer()
  dispatch({ type: 'close' })
  const picked = state.confirmedIndex
  if (picked != null) window.orbit.choose(picked)
  view?.dismiss(picked != null)
})

window.orbit?.onCancel(() => {
  pending = null
  dispatch({ type: 'cancel' })
  view?.dismiss(false)
})
