import { slotAngle, TWO_PI } from './wheel-machine.js'
import { icons } from './icons.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const SIZE = 620
const CX = SIZE / 2
const CY = SIZE / 2
const OUTER = 286
const INNER = 150
const GAP = 8
const HUB = 128
const POP = 10
const MID = (INNER + OUTER) / 2
const ICON_SIZE = 40

// Edges stay parallel (constant pixel gap) instead of converging toward the hub,
// which gives the pieces their diagonal, cut-glass look.
function wedgePath(r0, r1, a0, a1, gap) {
  const off = (r) => Math.asin(Math.min(1, gap / 2 / r))
  const p = (r, a) => `${CX + r * Math.cos(a)} ${CY + r * Math.sin(a)}`
  const o0 = a0 + off(r1)
  const o1 = a1 - off(r1)
  const i0 = a0 + off(r0)
  const i1 = a1 - off(r0)
  const large = o1 - o0 > Math.PI ? 1 : 0
  return `M ${p(r1, o0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, o1)} L ${p(r0, i1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, i0)} Z`
}

function arcPath(r, a0, a1) {
  const p = (a) => `${CX + r * Math.cos(a)} ${CY + r * Math.sin(a)}`
  return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

function linear(id, stops) {
  const gradient = el('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: CX, y1: CY - OUTER, x2: CX, y2: CY + OUTER })
  for (const [offset, color, opacity] of stops) {
    gradient.append(el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }))
  }
  return gradient
}

function motionDuration(seconds) {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : seconds
}

// Accumulates rotation so the indicator always turns the short way round.
function spinner() {
  let deg = null
  return (target) => {
    if (deg == null) {
      deg = target
      return deg
    }
    deg += ((((target - deg) % 360) + 540) % 360) - 180
    return deg
  }
}

const toDeg = (rad) => (rad * 180) / Math.PI

export function createWheelView(root, slots) {
  const overlay = root.querySelector('#overlay')
  const wheel = root.querySelector('#wheel')
  const svg = root.querySelector('#ring')
  const hubName = root.querySelector('#hub-name')
  const hubCaption = root.querySelector('#hub-caption')
  const hubIndex = root.querySelector('#hub-index')
  const gsap = window.gsap

  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`)
  svg.setAttribute('width', String(SIZE))
  svg.setAttribute('height', String(SIZE))

  const defs = el('defs')
  defs.append(
    linear('glass', [
      [0, '#ffffff', 0.2],
      [0.5, '#ffffff', 0.1],
      [1, '#ffffff', 0.06],
    ]),
    linear('glass-hot', [
      [0, '#ffffff', 0.98],
      [1, '#e6ebf4', 0.95],
    ]),
  )
  svg.append(defs)

  const count = slots.length
  const sector = TWO_PI / count
  const wedges = []

  slots.forEach((slot, index) => {
    const center = slotAngle(index, count)
    const a0 = center - sector / 2
    const a1 = center + sector / 2
    // Outer group is gsap's (entrance); inner group is CSS's (selection pop).
    const group = el('g', { class: 'slot' })
    const pop = el('g', { class: 'pop' })
    pop.style.setProperty('--dx', `${Math.cos(center) * POP}px`)
    pop.style.setProperty('--dy', `${Math.sin(center) * POP}px`)
    pop.append(el('path', { class: 'piece', d: wedgePath(INNER, OUTER, a0, a1, GAP) }))

    const mx = CX + Math.cos(center) * MID
    const my = CY + Math.sin(center) * MID
    const iy = my - 12
    const icon = icons[slot.icon]
    if (icon) {
      const scale = ICON_SIZE / 24
      const offset = ICON_SIZE / 2
      pop.append(
        el('path', {
          class: 'icon',
          d: icon,
          'fill-rule': 'evenodd',
          transform: `translate(${mx - offset} ${iy - offset}) scale(${scale})`,
        }),
      )
    } else {
      const glyph = el('text', { class: 'icon-text', x: mx, y: iy, 'text-anchor': 'middle', 'dominant-baseline': 'central' })
      glyph.textContent = slot.glyph ?? slot.label.slice(0, 1)
      pop.append(glyph)
    }

    const name = el('text', { class: 'caption', x: mx, y: my + 28, 'text-anchor': 'middle', 'dominant-baseline': 'central' })
    name.textContent = slot.label
    pop.append(name)

    group.append(pop)
    svg.append(group)
    wedges.push(group)
  })

  svg.append(el('circle', { class: 'hub-glass', cx: CX, cy: CY, r: HUB }))

  // Snapped arc on the hub rim marks the chosen sector; the notch tracks the raw pointer.
  const arc = el('path', { class: 'hub-arc', d: arcPath(HUB + 7, -Math.PI / 2 - sector / 2 + 0.08, -Math.PI / 2 + sector / 2 - 0.08) })
  const notch = el('path', { class: 'notch', d: `M ${CX - 7} ${CY - HUB + 17} L ${CX} ${CY - HUB + 6} L ${CX + 7} ${CY - HUB + 17} Z` })
  svg.append(arc, notch)

  gsap.set(wheel, { scale: 1, autoAlpha: 1 })

  const spinArc = spinner()
  const spinNotch = spinner()
  spinArc(0)
  spinNotch(0)
  let wasOpen = false
  let shownIndex = null
  let arcDeg = null

  // The notch follows the pointer through a short exponential ease, stepped once
  // per display frame, so it glides instead of jumping between pointer samples.
  let notchDeg = 0
  let notchTarget = 0
  let frame = 0
  let lastTime = 0

  function glide(now) {
    const dt = lastTime ? Math.min(now - lastTime, 64) : 16
    lastTime = now
    notchDeg += (notchTarget - notchDeg) * (1 - Math.exp(-dt / 40))
    const settled = Math.abs(notchTarget - notchDeg) < 0.05
    if (settled) notchDeg = notchTarget
    notch.style.transform = `rotate(${notchDeg}deg)`
    frame = settled ? 0 : requestAnimationFrame(glide)
    if (settled) lastTime = 0
  }

  function aimNotch(deg, jump) {
    notchTarget = deg
    if (jump || !motionDuration(1)) {
      cancelAnimationFrame(frame)
      frame = 0
      lastTime = 0
      notchDeg = deg
      notch.style.transform = `rotate(${deg}deg)`
      return
    }
    if (!frame) frame = requestAnimationFrame(glide)
  }

  function sync(state) {
    overlay.classList.toggle('is-open', state.open)
    if (state.open && !wasOpen) {
      const duration = motionDuration(0.18)
      gsap.fromTo(
        wheel,
        { scale: 0.94, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, duration, ease: 'power3.out', overwrite: 'auto' },
      )
      gsap.fromTo(
        wedges,
        { scale: 0.86, autoAlpha: 0, svgOrigin: `${CX} ${CY}` },
        { scale: 1, autoAlpha: 1, duration, ease: 'back.out(1.6)', stagger: duration ? 0.012 : 0, overwrite: 'auto' },
      )
    }
    wasOpen = state.open

    if (state.selectedIndex !== shownIndex) {
      shownIndex = state.selectedIndex
      const slot = slots[shownIndex]
      hubName.textContent = slot ? slot.label : ''
      hubCaption.textContent = slot?.caption ?? ''
      hubIndex.textContent = slot ? `${shownIndex + 1} / ${count}` : ''
      wedges.forEach((group, index) => {
        group.classList.toggle('is-selected', index === shownIndex)
      })
      arcDeg = spinArc(toDeg(slotAngle(shownIndex, count) + Math.PI / 2))
      arc.style.transform = `rotate(${arcDeg}deg)`
    }

    const aiming = state.open && !state.inDeadzone && state.angle != null
    // While idle the notch rests on the selected slice; it only glides once aiming.
    const target = spinNotch(aiming ? toDeg(state.angle + Math.PI / 2) : arcDeg)
    aimNotch(target, !aiming)
    notch.classList.toggle('is-idle', !aiming)
  }

  return { sync }
}
