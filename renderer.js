import { initialState, reduce } from './wheel-machine.js'
import { slots } from './slots.js'
import { createWheelView } from './wheel-view.js'

const config = { slots, deadzone: 56 }
let state = initialState()
const view = createWheelView(document, slots)

function viewportCenter() {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
}

function dispatch(action) {
  state = reduce(state, action, config)
  view.sync(state)
}

window.addEventListener('pointermove', (event) => {
  if (!state.open) return
  dispatch({ type: 'pointer', x: event.clientX, y: event.clientY })
})

window.orbit?.onStart(() => {
  dispatch({ type: 'open', origin: viewportCenter() })
})

window.orbit?.onPointer((_event, point) => {
  if (!state.open) return
  dispatch({ type: 'pointer', x: point.x, y: point.y })
})

window.orbit?.onRelease(() => {
  dispatch({ type: 'close' })
})

window.orbit?.onCancel(() => {
  dispatch({ type: 'cancel' })
})

view.sync(state)
