import { initialState, reduce } from './wheel-machine.js'
import { createWheelView } from './wheel-view.js'

const config = { slots: [], deadzone: 44 }
let state = initialState()
let view = null
let slotsKey = ''
const wheel = document.querySelector('#wheel')

// Main sends the wheel for the frontmost app on every open; rebuild only when it changes.
function setSlots(slots) {
  const key = JSON.stringify(slots)
  if (key === slotsKey) return
  slotsKey = key
  config.slots = slots
  document.querySelector('#ring').replaceChildren()
  view = createWheelView(document, slots)
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

function fadeOut() {
  window.gsap.to(wheel, {
    scale: 0.97,
    autoAlpha: 0,
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.1,
    ease: 'power2.in',
    overwrite: 'auto',
  })
}

window.orbit?.onStart((_event, payload) => {
  setSlots(payload.slots)
  pending = null
  // Origin is the wheel's centre; main moves the pointer there as the wheel opens.
  dispatch({ type: 'open', origin: payload.origin })
})

window.orbit?.onPointer((_event, point) => {
  if (!state.open) return
  pending = point
  if (!frame) frame = requestAnimationFrame(flushPointer)
})

window.orbit?.onRelease(() => {
  flushPointer()
  dispatch({ type: 'close' })
  if (state.confirmedIndex != null) window.orbit.choose(state.confirmedIndex)
  fadeOut()
})

window.orbit?.onCancel(() => {
  pending = null
  dispatch({ type: 'cancel' })
  fadeOut()
})
