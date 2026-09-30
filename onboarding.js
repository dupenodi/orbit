import { initialState, reduce, slotAngle } from './wheel-machine.js'
import { createWheelView } from './wheel-view.js'
import { icons } from './icons.js'

const gsap = window.gsap
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (selector) => document.querySelector(selector)

const PERMISSION_ICONS = {
  accessibility:
    'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 5.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM6.5 9.5l5.5 1.2 5.5-1.2.4 1.8-4.4 1v2.4l1.8 4.6-1.8.7-1.5-4-1.5 4-1.8-.7 1.8-4.6v-2.4l-4.4-1z',
  screen: 'M2 3h20v14H2zM4 5v10h16V5zM8 19h8v2H8zM7 7h4v1.5H8.5V10H7zM17 13h-4v-1.5h2.5V10H17z',
  automation:
    'M3 19.6 15.6 7l1.4 1.4L4.4 21zM17 2l.9 2.1L20 5l-2.1.9L17 8l-.9-2.1L14 5l2.1-.9zM20.5 9l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6zM9 3l.6 1.4L11 5l-1.4.6L9 7l-.6-1.4L7 5l1.4-.6z',
}
const CHECK = 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.2 13.6 6.3-6.3-1.4-1.4-4.9 4.9-2.4-2.4-1.4 1.4z'
const MODIFIER_NAMES = { '⌃': 'control', '⌥': 'option', '⇧': 'shift', '⌘': 'command' }

const info = await window.orbitApp.info()
let prefs = await window.prefs.get()
const steps = info.steps
let stepIndex = Math.max(0, steps.indexOf(new URLSearchParams(location.search).get('step')))
let permissionStatus = {}
let permissionTimer = null
let askedForScreen = false

function svgIcon(path, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  if (className) svg.setAttribute('class', className)
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  shape.setAttribute('d', path)
  shape.setAttribute('fill-rule', 'evenodd')
  svg.append(shape)
  return svg
}

function make(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

// ---- The live wheel --------------------------------------------------------

const wheelHost = make('div', 'wheel-host')
wheelHost.append($('#wheel-template').content.cloneNode(true))
const config = { slots: info.slots, deadzone: 40 }
let wheelState = initialState()
const wheelView = createWheelView(wheelHost, info.slots)

function dispatch(action) {
  wheelState = reduce(wheelState, action, config)
  wheelView.sync(wheelState)
}

function dockWheel(name) {
  const dock = document.querySelector(`[data-dock="${name}"]`)
  if (wheelHost.parentElement !== dock) dock.append(wheelHost)
  dispatch({ type: 'cancel' })
}

// ---- Welcome: the wheel demos itself ---------------------------------------

const cursor = $('.ghost-cursor')
let demo = null

function placeCursor(x, y) {
  const dock = $('[data-dock="welcome"]')
  const scale = dock.offsetWidth / 620
  cursor.style.transform = `translate(${dock.offsetLeft + x * scale - 4}px, ${dock.offsetTop + y * scale - 2}px)`
}

function startDemo() {
  stopDemo()
  dockWheel('welcome')
  const center = { x: 310, y: 310 }
  dispatch({ type: 'open', origin: center })
  const count = info.slots.length
  if (!count) return
  const probe = { angle: slotAngle(0, count), radius: 0 }
  const place = () => {
    const x = center.x + Math.cos(probe.angle) * probe.radius
    const y = center.y + Math.sin(probe.angle) * probe.radius
    dispatch({ type: 'pointer', x, y })
    placeCursor(x, y)
  }
  if (reducedMotion) {
    probe.radius = 150
    place()
    return
  }
  // Visit slices the short way round, pausing on each like a person deciding.
  const order = [0, 2, 5, 3, 7, 1, 4].filter((index) => index < count)
  demo = gsap.timeline({ repeat: -1, onUpdate: place, delay: 0.5 })
  demo.set(probe, { radius: 0, angle: slotAngle(order[0], count) })
  demo.to(probe, { radius: 150, duration: 0.6, ease: 'power2.out' })
  let angle = slotAngle(order[0], count)
  for (const index of order.slice(1)) {
    const target = slotAngle(index, count)
    angle += ((((target - angle) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
    demo.to(probe, { angle, duration: 0.75, ease: 'power2.inOut' }, '+=0.55')
  }
  demo.to(probe, { radius: 0, duration: 0.5, ease: 'power2.in' }, '+=0.55')
  demo.set(probe, { angle: slotAngle(order[0], count) }, '+=0.3')
}

function stopDemo() {
  demo?.kill()
  demo = null
}

// ---- Meet the wheel ---------------------------------------------------------

function renderSlots() {
  $('#slot-grid').replaceChildren(
    ...info.slots.map((slot) => {
      const card = make('li', 'slot-card')
      const icon = make('div', 'slot-icon')
      if (icons[slot.icon]) icon.append(svgIcon(icons[slot.icon]))
      const text = make('div')
      text.append(make('h3', null, slot.label), make('p', null, slot.about ?? slot.caption ?? ''))
      card.append(icon, text)
      return card
    }),
  )
}

// ---- Permissions ------------------------------------------------------------

function permissionButton(permission, state) {
  if (state === 'granted') {
    const done = make('span', 'status')
    done.append(svgIcon(CHECK), document.createTextNode('Allowed'))
    return done
  }
  const button = make('button', `button small ${state === 'needed' ? 'accent' : 'ghost'}`)
  button.type = 'button'
  button.textContent = state === 'needed' ? 'Allow' : 'Open Settings'
  button.addEventListener('click', async () => {
    if (permission.id === 'screen') askedForScreen = true
    button.disabled = true
    renderPermissions(await window.orbitApp.requestPermission(permission.id))
  })
  return button
}

function renderPermissions(status) {
  permissionStatus = status
  $('#permission-list').replaceChildren(
    ...info.permissions.map((permission) => {
      const state = status[permission.id] ?? 'unknown'
      const row = make('li', `permission is-${state}`)
      const icon = make('div', 'permission-icon')
      icon.append(svgIcon(PERMISSION_ICONS[permission.id]))
      const text = make('div')
      text.append(make('h3', null, permission.title), make('p', null, permission.why))
      row.append(icon, text, permissionButton(permission, state))
      return row
    }),
  )
  $('#restart').hidden = !(askedForScreen && status.screen !== 'granted')
  if (steps[stepIndex] === 'permissions') updateFooter()
}

async function refreshPermissions() {
  renderPermissions(await window.orbitApp.permissions())
}

function watchPermissions(on) {
  clearInterval(permissionTimer)
  permissionTimer = null
  if (!on) return
  refreshPermissions()
  permissionTimer = setInterval(refreshPermissions, 1500)
}

$('#restart-button').addEventListener('click', () => window.orbitApp.relaunch('permissions'))
$('#permission-hint').textContent = `You’ll find Orbit as “${info.settingsName}” in System Settings → Privacy & Security.`

// ---- Shortcut & practice ----------------------------------------------------

const keycaps = $('#keycaps')
const practicePrompt = $('#practice-prompt')
const changeButton = $('#change-shortcut')

function renderKeycaps(label) {
  const recording = changeButton.classList.contains('is-recording')
  keycaps.classList.toggle('is-recording', recording)
  changeButton.textContent = recording ? 'Press your keys…' : 'Change shortcut'
  const caps = []
  if (label === 'Recording…') {
    caps.push(['…', 'press keys'])
  } else {
    const chars = [...label]
    while (chars.length && MODIFIER_NAMES[chars[0]]) {
      const symbol = chars.shift()
      caps.push([symbol, MODIFIER_NAMES[symbol]])
    }
    if (chars.length) caps.push([chars.join(''), ''])
  }
  keycaps.replaceChildren(
    ...caps.map(([symbol, name]) => {
      const cap = make('div', 'keycap')
      cap.append(make('b', null, symbol))
      if (name) cap.append(make('small', null, name))
      return cap
    }),
  )
}

function idlePrompt() {
  practicePrompt.classList.remove('is-success')
  practicePrompt.textContent = `Hold ${prefs.shortcutLabel} now to try it. Practice mode: nothing actually runs.`
}

const recorder = createShortcutRecorder({
  button: changeButton,
  help: $('#shortcut-help'),
  idleHelp: '',
  render: renderKeycaps,
  onChange: (next) => {
    prefs = next
    idlePrompt()
    renderReady()
    syncPractice()
  },
})

function syncPractice() {
  const on = steps[stepIndex] === 'shortcut' && document.hasFocus() && !recorder.isRecording()
  window.orbitApp.setPractice(on)
}

window.orbitApp.onPractice((event, payload) => {
  if (steps[stepIndex] !== 'shortcut') return
  const dock = $('[data-dock="practice"]')
  if (event === 'start') {
    keycaps.classList.add('is-held')
    dock.classList.remove('is-idle')
    dispatch({ type: 'cancel' })
    dispatch({ type: 'open', origin: payload.origin })
    practicePrompt.classList.remove('is-success')
    practicePrompt.textContent = 'Now flick toward a slice, then let go.'
    return
  }
  if (event === 'pointer') {
    dispatch({ type: 'pointer', x: payload.x, y: payload.y })
    return
  }
  keycaps.classList.remove('is-held')
  dock.classList.add('is-idle')
  if (event === 'cancel') {
    dispatch({ type: 'cancel' })
    idlePrompt()
    return
  }
  dispatch({ type: 'close' })
  const picked = info.slots[wheelState.confirmedIndex]
  if (picked) {
    practicePrompt.classList.add('is-success')
    practicePrompt.textContent = `Nice! That would run ${picked.label}. You’ve got it.`
  } else {
    practicePrompt.classList.remove('is-success')
    practicePrompt.textContent = 'You let go in the middle, which cancels. Flick a little further.'
  }
})

window.addEventListener('focus', () => {
  syncPractice()
  if (steps[stepIndex] === 'permissions') refreshPermissions()
})
window.addEventListener('blur', syncPractice)

// ---- Ready ------------------------------------------------------------------

function renderReady() {
  $('#ready-lede').textContent = `It stays out of sight until you hold ${prefs.shortcutLabel}. Click its icon anytime for settings, permissions, and this guide.`
  $('#menu-hold').textContent = `Hold ${prefs.shortcutLabel} to open the wheel`
  $('#clock').textContent = new Date().toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

// ---- Navigation -------------------------------------------------------------

const scenes = [...document.querySelectorAll('.scene')]
const nextButton = $('#next')
const backButton = $('#back')
const dots = $('#dots')

function missingCount() {
  return info.permissions.filter(({ id }) => permissionStatus[id] && permissionStatus[id] !== 'granted').length
}

function updateFooter() {
  const step = steps[stepIndex]
  const labels = {
    welcome: 'Get started',
    permissions: missingCount() ? 'Skip for now' : 'Continue',
    ready: 'Start using Orbit',
  }
  nextButton.textContent = labels[step] ?? 'Continue'
  nextButton.classList.toggle('primary', step !== 'permissions' || !missingCount())
  nextButton.classList.toggle('ghost', step === 'permissions' && missingCount() > 0)
  backButton.classList.toggle('is-hidden', stepIndex === 0)
  ;[...dots.children].forEach((dot, index) => {
    dot.classList.toggle('is-active', index === stepIndex)
    dot.classList.toggle('is-done', index < stepIndex)
    dot.setAttribute('aria-current', index === stepIndex ? 'step' : 'false')
  })
}

function enter(step) {
  if (step === 'welcome') startDemo()
  if (step === 'shortcut') {
    dockWheel('practice')
    $('[data-dock="practice"]').classList.add('is-idle')
    idlePrompt()
  }
  watchPermissions(step === 'permissions')
  if (step === 'ready') renderReady()
  syncPractice()
}

function leave(step) {
  if (step === 'welcome') stopDemo()
}

function sceneFor(step) {
  return scenes.find((scene) => scene.dataset.step === step)
}

function animateIn(scene, direction) {
  const duration = reducedMotion ? 0 : 0.45
  gsap.fromTo(scene, { autoAlpha: 0, x: 28 * direction }, { autoAlpha: 1, x: 0, duration, ease: 'power3.out' })
  // Explicit end values: from() would read them off elements still mid-fade.
  gsap.fromTo(
    scene.querySelectorAll('.copy > *'),
    { autoAlpha: 0, y: 10 },
    { autoAlpha: 1, y: 0, duration, stagger: reducedMotion ? 0 : 0.045, ease: 'power2.out', overwrite: true },
  )
  const pieces = scene.querySelectorAll('.slot-card, .permission, .menu p, .menu hr')
  if (pieces.length) {
    gsap.fromTo(
      pieces,
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration, stagger: reducedMotion ? 0 : 0.04, delay: 0.1, ease: 'power2.out', overwrite: true },
    )
  }
}

function go(target) {
  const nextIndex = typeof target === 'number' ? target : steps.indexOf(target)
  if (nextIndex < 0 || nextIndex >= steps.length || nextIndex === stepIndex) return
  const from = sceneFor(steps[stepIndex])
  const to = sceneFor(steps[nextIndex])
  const direction = nextIndex > stepIndex ? 1 : -1
  leave(steps[stepIndex])
  gsap.to(from, { autoAlpha: 0, x: -28 * direction, duration: reducedMotion ? 0 : 0.22, ease: 'power2.in' })
  stepIndex = nextIndex
  animateIn(to, direction)
  enter(steps[stepIndex])
  updateFooter()
}

nextButton.addEventListener('click', () => {
  if (steps[stepIndex] === 'ready') {
    window.orbitApp.finishOnboarding({ openAtLogin: $('#open-at-login').checked })
    return
  }
  go(stepIndex + 1)
})
backButton.addEventListener('click', () => go(stepIndex - 1))

window.addEventListener('keydown', (event) => {
  if (recorder.isRecording() || event.target.closest?.('button, input')) return
  if (event.key === 'Enter' || event.key === 'ArrowRight') nextButton.click()
  if (event.key === 'ArrowLeft' && stepIndex > 0) go(stepIndex - 1)
})

window.orbitApp.onGoto((step) => go(step))

// ---- Start ------------------------------------------------------------------

steps.forEach((step, index) => {
  const dot = make('button', 'dot')
  dot.type = 'button'
  dot.setAttribute('aria-label', `Step ${index + 1}: ${step}`)
  dot.addEventListener('click', () => go(index))
  dots.append(dot)
})

renderSlots()
recorder.show(prefs)
renderReady()
gsap.set(scenes, { autoAlpha: 0 })
animateIn(sceneFor(steps[stepIndex]), 1)
enter(steps[stepIndex])
updateFooter()
