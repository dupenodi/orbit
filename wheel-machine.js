// Question: does hold-open → angle-select → release-confirm feel right
// as the primitive for switching work actions? (GTA weapon wheel)

export const TWO_PI = Math.PI * 2
export const TOP = -Math.PI / 2

export function wrapAngle(angle) {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI
}

export function polarFromOrigin(origin, point) {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  const distance = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx)
  return { dx, dy, distance, angle }
}

export function indexFromAngle(angle, count, zeroAngle = TOP) {
  if (count <= 0) return 0
  const sector = TWO_PI / count
  const rotated = wrapAngle(angle - zeroAngle)
  return Math.round(rotated / sector) % count
}

export function slotAngle(index, count, zeroAngle = TOP) {
  if (count <= 0) return zeroAngle
  return zeroAngle + index * (TWO_PI / count)
}

export function initialState() {
  return {
    open: false,
    selectedIndex: 0,
    confirmedId: null,
    origin: { x: 0, y: 0 },
    pointer: null,
    angle: null,
    distance: 0,
    inDeadzone: true,
  }
}

export function reduce(state, action, config) {
  const slots = config.slots ?? []

  switch (action.type) {
    case 'open': {
      if (state.open) return state
      return {
        ...state,
        open: true,
        origin: action.origin,
        pointer: action.origin,
        distance: 0,
        inDeadzone: true,
        angle: null,
      }
    }

    case 'pointer': {
      if (!state.open) return state
      const polar = polarFromOrigin(state.origin, { x: action.x, y: action.y })
      const inDeadzone = polar.distance < config.deadzone
      const selectedIndex = inDeadzone
        ? state.selectedIndex
        : indexFromAngle(polar.angle, slots.length)
      return {
        ...state,
        pointer: { x: action.x, y: action.y },
        angle: polar.angle,
        distance: polar.distance,
        inDeadzone,
        selectedIndex,
      }
    }

    case 'close': {
      if (!state.open) return state
      const slot = slots[state.selectedIndex]
      return {
        ...state,
        open: false,
        confirmedId: slot ? slot.id : null,
        pointer: null,
        angle: null,
        distance: 0,
        inDeadzone: true,
      }
    }

    case 'cancel': {
      if (!state.open) return state
      return {
        ...state,
        open: false,
        pointer: null,
        angle: null,
        distance: 0,
        inDeadzone: true,
      }
    }

    default:
      return state
  }
}
