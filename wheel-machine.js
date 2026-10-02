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

// How far past a slice's edge the pointer must go before the next slice takes over,
// so aiming near a boundary doesn't flicker between two slices.
export const HYSTERESIS = 0.09

// Once aiming, the pointer has to come this much closer to the centre before the
// wheel counts it as back in the deadzone, so hovering at the edge can't flutter.
export const DEADZONE_RETURN = 0.7

export function angularDistance(a, b) {
  return wrapAngle(a - b + Math.PI) - Math.PI
}

export function pickIndex(angle, count, current, wasAiming) {
  const index = indexFromAngle(angle, count)
  if (!wasAiming || index === current || count <= 1) return index
  const off = Math.abs(angularDistance(angle, slotAngle(current, count)))
  return off < Math.PI / count + HYSTERESIS ? current : index
}

export function slotAngle(index, count, zeroAngle = TOP) {
  if (count <= 0) return zeroAngle
  return zeroAngle + index * (TWO_PI / count)
}

export function initialState() {
  return {
    open: false,
    selectedIndex: 0,
    confirmedIndex: null,
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
        confirmedIndex: null,
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
      const radius = state.inDeadzone ? config.deadzone : config.deadzone * DEADZONE_RETURN
      const inDeadzone = polar.distance < radius
      const selectedIndex = inDeadzone
        ? state.selectedIndex
        : pickIndex(polar.angle, slots.length, state.selectedIndex, !state.inDeadzone)
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
      // Releasing without aiming (still in the deadzone) fires nothing.
      const aimed = !state.inDeadzone && slots[state.selectedIndex] != null
      return {
        ...state,
        open: false,
        confirmedIndex: aimed ? state.selectedIndex : null,
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
        confirmedIndex: null,
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
