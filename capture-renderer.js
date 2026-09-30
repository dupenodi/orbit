// The frozen screen: drag a region (mode "region") or click a pixel (mode "point").
// Esc or a right-click cancels.
const shot = document.getElementById('shot')
const shade = document.getElementById('shade')
const hint = document.getElementById('hint')
const loupe = document.getElementById('loupe')
const zoom = document.getElementById('zoom')
const hex = document.getElementById('hex')
const ctx = shade.getContext('2d')
const zoomCtx = zoom.getContext('2d')

const LOUPE_PIXELS = 11
let mode = 'region'
let pixels = null // full-resolution copy of the shot, for reading colours
let start = null
let pointer = null
let finished = false

function done(result) {
  if (finished) return
  finished = true
  window.capture.done(result)
}

function resize() {
  shade.width = Math.round(innerWidth * devicePixelRatio)
  shade.height = Math.round(innerHeight * devicePixelRatio)
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
  draw()
}

function selection() {
  if (!start || !pointer) return null
  return {
    x: Math.min(start.x, pointer.x),
    y: Math.min(start.y, pointer.y),
    width: Math.abs(pointer.x - start.x),
    height: Math.abs(pointer.y - start.y),
  }
}

// Shot pixel under a page point.
function shotPoint(point) {
  return {
    x: Math.min(pixels.width - 1, Math.floor((point.x / innerWidth) * pixels.width)),
    y: Math.min(pixels.height - 1, Math.floor((point.y / innerHeight) * pixels.height)),
  }
}

function colorAt(point) {
  const { x, y } = shotPoint(point)
  const [r, g, b] = pixels.getContext('2d').getImageData(x, y, 1, 1).data
  return '#' + [r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function drawLoupe() {
  if (!pointer || !pixels) return
  const { x, y } = shotPoint(pointer)
  const half = Math.floor(LOUPE_PIXELS / 2)
  zoomCtx.imageSmoothingEnabled = false
  zoomCtx.fillStyle = '#000'
  zoomCtx.fillRect(0, 0, zoom.width, zoom.height)
  zoomCtx.drawImage(pixels, x - half, y - half, LOUPE_PIXELS, LOUPE_PIXELS, 0, 0, zoom.width, zoom.height)
  const cell = zoom.width / LOUPE_PIXELS
  zoomCtx.strokeStyle = '#fff'
  zoomCtx.lineWidth = 2
  zoomCtx.strokeRect(half * cell, half * cell, cell, cell)
  hex.textContent = colorAt(pointer)
  // Sit below-right of the pointer, flipping near the screen's edges.
  const left = pointer.x + 24 + 132 > innerWidth ? pointer.x - 24 - 132 : pointer.x + 24
  const top = pointer.y + 24 + 160 > innerHeight ? pointer.y - 24 - 160 : pointer.y + 24
  loupe.style.transform = `translate(${left}px, ${top}px)`
  loupe.hidden = false
}

function draw() {
  ctx.clearRect(0, 0, innerWidth, innerHeight)
  if (mode === 'point') {
    drawLoupe()
    return
  }
  ctx.fillStyle = 'rgba(8, 10, 16, 0.45)'
  ctx.fillRect(0, 0, innerWidth, innerHeight)
  const rect = selection()
  if (!rect) return
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5
  ctx.strokeRect(rect.x + 0.75, rect.y + 0.75, Math.max(0, rect.width - 1.5), Math.max(0, rect.height - 1.5))
}

window.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return
  pointer = { x: event.clientX, y: event.clientY }
  if (mode === 'point') {
    done({ color: colorAt(pointer) })
    return
  }
  start = pointer
  draw()
})

window.addEventListener('mousemove', (event) => {
  pointer = { x: event.clientX, y: event.clientY }
  draw()
})

window.addEventListener('mouseup', (event) => {
  if (event.button !== 0 || mode !== 'region' || !start) return
  pointer = { x: event.clientX, y: event.clientY }
  const rect = selection()
  done(rect.width > 2 && rect.height > 2 ? rect : null)
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') done(null)
})

window.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  done(null)
})

window.addEventListener('resize', resize)

async function load() {
  const data = await window.capture.load()
  if (!data) return done(null)
  mode = data.mode
  hint.textContent = mode === 'point' ? 'Click a pixel to copy its color · Esc to cancel' : 'Drag over an area · Esc to cancel'
  shot.src = data.image
  await shot.decode()
  pixels = document.createElement('canvas')
  pixels.width = shot.naturalWidth
  pixels.height = shot.naturalHeight
  pixels.getContext('2d', { willReadFrequently: true }).drawImage(shot, 0, 0)
  resize()
}

load()
