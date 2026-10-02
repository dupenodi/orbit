import { slotAngle, TWO_PI } from './wheel-machine.js'
import { appendIcon } from './icons.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const SIZE = 620
const CX = SIZE / 2
const CY = SIZE / 2
const OUTER = 262
const INNER = 146
const GAP = 6
const HUB = 120
const MID = (INNER + OUTER) / 2
const ICON_SIZE = 30
// The selection plate is a little larger than a slice, and rides out a few px when it lands.
const PLATE_OUT = 5
const PLATE_IN = 2
const PLATE_POP = 3

let instances = 0

// Edges stay parallel (constant pixel gap) instead of converging toward the hub,
// which gives the pieces their cut-glass look.
function wedgePath(r0, r1, a0, a1, gap) {
  if (a1 - a0 >= TWO_PI - 1e-6) {
    const ring = (r, sweep) => `M ${CX + r} ${CY} A ${r} ${r} 0 1 ${sweep} ${CX - r} ${CY} A ${r} ${r} 0 1 ${sweep} ${CX + r} ${CY} Z`
    return `${ring(r1, 1)} ${ring(r0, 0)}`
  }
  const off = (r) => Math.asin(Math.min(1, gap / 2 / r))
  const p = (r, a) => `${(CX + r * Math.cos(a)).toFixed(2)} ${(CY + r * Math.sin(a)).toFixed(2)}`
  const o0 = a0 + off(r1)
  const o1 = a1 - off(r1)
  const i0 = a0 + off(r0)
  const i1 = a1 - off(r0)
  const large = o1 - o0 > Math.PI ? 1 : 0
  return `M ${p(r1, o0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, o1)} L ${p(r0, i1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, i0)} Z`
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

function linear(id, stops, vertical = true) {
  const gradient = el('linearGradient', {
    id,
    gradientUnits: 'userSpaceOnUse',
    x1: CX,
    y1: vertical ? CY - OUTER : CY,
    x2: CX,
    y2: vertical ? CY + OUTER : CY,
  })
  for (const [offset, color, opacity] of stops) {
    gradient.append(el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }))
  }
  return gradient
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function motion(seconds) {
  return reducedMotion() ? 0 : seconds
}

// Accumulates rotation so a turn always takes the short way round.
function unwrap(from, target) {
  return from + ((((target - from) % 360) + 540) % 360) - 180
}

const toDeg = (rad) => (rad * 180) / Math.PI
const clamp01 = (value) => Math.min(1, Math.max(0, value))

// Icon and caption for one slice, drawn twice: light on glass, dark on the plate.
function slotContent(slot, center) {
  const group = el('g', { class: 'content' })
  const mx = CX + Math.cos(center) * MID
  const my = CY + Math.sin(center) * MID
  const iy = my - 10
  const icon = el('g', {
    class: 'icon',
    transform: `translate(${mx - ICON_SIZE / 2} ${iy - ICON_SIZE / 2}) scale(${ICON_SIZE / 24})`,
  })
  if (!appendIcon(document, icon, slot.icon)) {
    const glyph = el('text', { class: 'glyph', x: 12, y: 12.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' })
    glyph.textContent = slot.glyph ?? slot.label.slice(0, 1)
    icon.append(glyph)
  }
  const label = el('text', { class: 'label', x: mx, y: my + 22, 'text-anchor': 'middle', 'dominant-baseline': 'central' })
  label.textContent = slot.label
  group.append(icon, label)
  // Scales about its own middle when its slice is picked.
  group.style.transformOrigin = `${mx}px ${my + 4}px`
  return group
}

// Shortens a caption with an ellipsis until it fits; needs the SVG on the page.
function fitLabel(pair, width) {
  const [first, second] = pair.map((group) => group.querySelector('.label'))
  const full = first.textContent
  if (!first.getComputedTextLength || first.getComputedTextLength() <= width) return
  let end = full.length
  while (end > 1) {
    end -= 1
    first.textContent = `${full.slice(0, end).trimEnd()}…`
    if (first.getComputedTextLength() <= width) break
  }
  second.textContent = first.textContent
}

export function createWheelView(root, slots, options = {}) {
  const deadzone = options.deadzone ?? 44
  const wheel = root.querySelector('#wheel')
  const svg = root.querySelector('#ring')
  const hub = root.querySelector('.hub')
  const hubText = root.querySelector('.hub-text')
  const hubName = root.querySelector('#hub-name')
  const hubCaption = root.querySelector('#hub-caption')
  const aim = root.querySelector('.aim')
  const gsap = window.gsap
  const id = `w${++instances}`

  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`)
  svg.setAttribute('width', String(SIZE))
  svg.setAttribute('height', String(SIZE))

  const count = slots.length
  const sector = count ? TWO_PI / count : TWO_PI
  const platePath = wedgePath(INNER - PLATE_IN, OUTER + PLATE_OUT, -Math.PI / 2 - sector / 2, -Math.PI / 2 + sector / 2, GAP)

  const defs = el('defs')
  const clipPath = el('path', { d: platePath })
  const clip = el('clipPath', { id: `${id}-plate` })
  clip.append(clipPath)
  defs.append(
    linear(`${id}-sheen`, [
      [0, '#ffffff', 0.17],
      [0.5, '#ffffff', 0.09],
      [1, '#ffffff', 0.05],
    ]),
    linear(`${id}-plate-fill`, [
      [0, '#ffffff', 1],
      [1, '#eceff5', 1],
    ]),
    clip,
  )
  svg.append(defs)

  // Everything that spins in on open; the hub stays put.
  const ring = el('g', { class: 'ring' })
  const pieces = el('g', { class: 'pieces' })
  const light = el('g', { class: 'layer layer-light' })
  const dark = el('g', { class: 'layer layer-dark', 'clip-path': `url(#${id}-plate)` })
  const plate = el('path', { class: 'plate', d: platePath, fill: `url(#${id}-plate-fill)` })
  const contents = []

  slots.forEach((slot, index) => {
    const center = slotAngle(index, count)
    const d = wedgePath(INNER, OUTER, center - sector / 2, center + sector / 2, GAP)
    const piece = el('g', { class: 'piece' })
    piece.append(el('path', { class: 'piece-base', d }), el('path', { class: 'piece-sheen', d, fill: `url(#${id}-sheen)` }))
    pieces.append(piece)
    const pair = [slotContent(slot, center), slotContent(slot, center)]
    light.append(pair[0])
    dark.append(pair[1])
    contents.push({ piece, pair })
  })

  ring.append(pieces, plate, light, dark)
  // Captions have to fit their slice; the hub always shows the full name.
  const labelWidth = Math.max(40, 2 * (MID + 22) * Math.sin(Math.min(Math.PI / 2, sector / 2)) - 2 * GAP - 18)
  const hubDisc = el('g', { class: 'hub-disc' })
  hubDisc.append(
    el('circle', { class: 'hub-base', cx: CX, cy: CY, r: HUB }),
    el('circle', { class: 'hub-sheen', cx: CX, cy: CY, r: HUB, fill: `url(#${id}-sheen)` }),
  )
  svg.append(ring, hubDisc)
  for (const { pair } of contents) fitLabel(pair, labelWidth)

  // ---- Selection plate: one white piece that glides to whichever slice is aimed at.
  const plateState = { deg: 0, scale: 0.94, pop: 0, alpha: 0 }

  function drawPlate() {
    const { deg, scale, pop, alpha } = plateState
    const transform = `translate(${CX} ${CY}) rotate(${deg.toFixed(3)}) translate(0 ${(-pop).toFixed(3)}) scale(${scale.toFixed(4)}) translate(${-CX} ${-CY})`
    plate.setAttribute('transform', transform)
    clipPath.setAttribute('transform', transform)
    plate.style.opacity = alpha
    dark.style.opacity = alpha
  }
  drawPlate()

  // ---- Aim indicator: a soft arc on the hub rim that follows the raw pointer.
  // It eases toward the pointer once per frame, so it glides between samples.
  const aimState = { deg: 0, target: 0, alpha: 0, alphaTarget: 0 }
  let aimFrame = 0
  let aimLast = 0

  function drawAim() {
    if (!aim) return
    aim.style.transform = `translate(-50%, -50%) rotate(${aimState.deg.toFixed(2)}deg)`
    aim.style.opacity = aimState.alpha.toFixed(3)
  }

  function stepAim(now) {
    const dt = aimLast ? Math.min(now - aimLast, 64) : 16
    aimLast = now
    const k = 1 - Math.exp(-dt / 34)
    aimState.deg += (aimState.target - aimState.deg) * k
    aimState.alpha += (aimState.alphaTarget - aimState.alpha) * (1 - Math.exp(-dt / 60))
    const settled = Math.abs(aimState.target - aimState.deg) < 0.05 && Math.abs(aimState.alphaTarget - aimState.alpha) < 0.005
    if (settled) {
      aimState.deg = aimState.target
      aimState.alpha = aimState.alphaTarget
    }
    drawAim()
    aimFrame = settled ? 0 : requestAnimationFrame(stepAim)
    if (settled) aimLast = 0
  }

  function moveAim(deg, alpha, jump) {
    aimState.target = jump ? deg : unwrap(aimState.deg, deg)
    aimState.alphaTarget = alpha
    if (jump || reducedMotion()) {
      cancelAnimationFrame(aimFrame)
      aimFrame = 0
      aimLast = 0
      aimState.deg = aimState.target
      aimState.alpha = alpha
      drawAim()
      return
    }
    if (!aimFrame) aimFrame = requestAnimationFrame(stepAim)
  }

  // ---- Hub text.
  let hubKey = null

  function showHub(name, caption, muted) {
    const key = `${name}\u0000${caption}\u0000${muted}`
    if (key === hubKey) return
    hubKey = key
    hubName.textContent = name
    hubCaption.textContent = caption
    hub.classList.toggle('is-muted', Boolean(muted))
    if (!name) return
    gsap.fromTo(hubText, { opacity: 0.35, y: 3 }, { opacity: 1, y: 0, duration: motion(0.16), ease: 'power2.out', overwrite: 'auto' })
  }

  // ---- Sync with the state machine.
  let wasOpen = false
  let shownIndex = null
  let plateShown = false
  let aimedThisHold = false

  function select(index) {
    contents.forEach(({ piece, pair }, i) => {
      const on = i === index
      piece.classList.toggle('is-selected', on)
      pair[0].classList.toggle('is-selected', on)
      pair[1].classList.toggle('is-selected', on)
    })
  }

  function opening() {
    aimedThisHold = false
    plateShown = false
    shownIndex = null
    select(null)
    gsap.killTweensOf(plateState)
    Object.assign(plateState, { scale: 0.94, pop: 0, alpha: 0 })
    drawPlate()
    moveAim(-90, 0, true)
    showHub('', '', false)
    const duration = motion(0.3)
    gsap.killTweensOf([wheel, ring, hubDisc, pieces])
    gsap.set(wheel, { scale: 1 })
    gsap.set(pieces, { opacity: 1 })
    gsap.fromTo(wheel, { autoAlpha: 0 }, { autoAlpha: 1, duration: motion(0.12), ease: 'none' })
    // The ring spins up into place around a steady hub.
    gsap.fromTo(
      ring,
      { scale: 0.9, rotation: -14, svgOrigin: `${CX} ${CY}` },
      { scale: 1, rotation: 0, duration, ease: 'expo.out' },
    )
    gsap.fromTo(hubDisc, { scale: 0.86, svgOrigin: `${CX} ${CY}` }, { scale: 1, duration, ease: 'expo.out' })
  }

  function sync(state) {
    // Once closed, the last frame stays put for dismiss() to animate away.
    if (!state.open) {
      wasOpen = false
      return
    }
    if (!wasOpen) opening()
    wasOpen = true

    const aiming = !state.inDeadzone && state.angle != null && count > 0
    if (aiming) aimedThisHold = true
    const index = aiming ? state.selectedIndex : null

    if (index !== shownIndex) {
      shownIndex = index
      select(index)
      if (index != null) {
        const deg = toDeg(slotAngle(index, count) + Math.PI / 2)
        if (!plateShown) {
          // Appears where you aimed; no sweep in from the last spot.
          plateShown = true
          gsap.killTweensOf(plateState)
          plateState.deg = deg
          gsap.fromTo(
            plateState,
            { scale: 0.94, alpha: 0, pop: 0 },
            { scale: 1, alpha: 1, pop: PLATE_POP, duration: motion(0.16), ease: 'power3.out', onUpdate: drawPlate },
          )
          drawPlate()
        } else {
          gsap.to(plateState, { deg: unwrap(plateState.deg, deg), duration: motion(0.2), ease: 'power3.out', overwrite: 'auto', onUpdate: drawPlate })
        }
        const slot = slots[index]
        showHub(slot.label, slot.caption ?? '', false)
      } else {
        if (plateShown) {
          plateShown = false
          gsap.to(plateState, { scale: 0.96, alpha: 0, pop: 0, duration: motion(0.12), ease: 'power2.out', overwrite: 'auto', onUpdate: drawPlate })
        }
        // Back in the middle after aiming: letting go now does nothing, so say so.
        showHub(aimedThisHold ? 'Cancel' : '', aimedThisHold ? 'Release to dismiss' : '', true)
      }
    }

    if (state.angle != null) {
      const reach = clamp01((state.distance - deadzone * 0.5) / (deadzone * 1.2))
      moveAim(toDeg(state.angle + Math.PI / 2), reach, false)
    }
  }

  // Exit: a picked slice holds for a beat and brightens while the rest falls away.
  function dismiss(confirmed) {
    const duration = motion(confirmed ? 0.16 : 0.12)
    moveAim(aimState.deg, 0, false)
    gsap.killTweensOf([wheel, ring])
    if (confirmed) {
      gsap.to(plateState, { pop: PLATE_POP + 4, scale: 1.02, duration: motion(0.1), ease: 'power2.out', overwrite: 'auto', onUpdate: drawPlate })
      gsap.to(pieces, { opacity: 0.35, duration: motion(0.08) })
    }
    gsap.to(wheel, {
      autoAlpha: 0,
      scale: confirmed ? 1 : 0.97,
      duration,
      delay: confirmed ? motion(0.04) : 0,
      ease: 'power2.in',
      onComplete: () => {
        gsap.set(wheel, { scale: 1 })
        gsap.set(pieces, { opacity: 1 })
      },
    })
  }

  // Shown at rest (onboarding keeps a wheel on screen between holds).
  function rest() {
    wasOpen = false
    shownIndex = null
    plateShown = false
    select(null)
    gsap.killTweensOf([wheel, pieces, plateState])
    plateState.alpha = 0
    drawPlate()
    moveAim(aimState.deg, 0, true)
    showHub('', '', false)
    gsap.set(wheel, { autoAlpha: 1, scale: 1 })
    gsap.set(pieces, { opacity: 1 })
  }

  gsap.set(wheel, { autoAlpha: 0 })
  return { sync, dismiss, rest }
}
