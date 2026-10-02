// The frozen screen: drag a region (mode "region") or click a pixel (mode "point").
// Esc or a right-click cancels.
const shot = document.getElementById('shot')
const shade = document.getElementById('shade')
const hint = document.getElementById('hint')
const loupe = document.getElementById('loupe')
const zoom = document.getElementById('zoom')
const hex = document.getElementById('hex')
const swatch = document.getElementById('swatch')
const size = document.getElementById('size')
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
  const cell = zoom.width / LOUPE_PIXELS
  zoomCtx.imageSmoothingEnabled = false
  zoomCtx.fillStyle = '#000'
  zoomCtx.fillRect(0, 0, zoom.width, zoom.height)
  zoomCtx.drawImage(pixels, x - half, y - half, LOUPE_PIXELS, LOUPE_PIXELS, 0, 0, zoom.width, zoom.height)
  // A faint pixel grid, and the picked pixel framed in white with a dark keyline.
  zoomCtx.strokeStyle = 'rgba(0, 0, 0, 0.18)'
  zoomCtx.lineWidth = 1
  zoomCtx.beginPath()
  for (let i = 1; i < LOUPE_PIXELS; i++) {
    const at = Math.round(i * cell) + 0.5
    zoomCtx.moveTo(at, 0)
    zoomCtx.lineTo(at, zoom.height)
    zoomCtx.moveTo(0, at)
    zoomCtx.lineTo(zoom.width, at)
  }
  zoomCtx.stroke()
  zoomCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
  zoomCtx.lineWidth = 5
  zoomCtx.strokeRect(half * cell, half * cell, cell, cell)
  zoomCtx.strokeStyle = '#fff'
  zoomCtx.lineWidth = 3
  zoomCtx.strokeRect(half * cell, half * cell, cell, cell)
  const color = colorAt(pointer)
  hex.textContent = color
  swatch.style.background = color
  // Sit below-right of the pointer, flipping near the screen's edges.
  const width = 132
  const height = 168
  const left = pointer.x + 28 + width > innerWidth ? pointer.x - 28 - width : pointer.x + 28
  const top = pointer.y + 28 + height > innerHeight ? pointer.y - 28 - height : pointer.y + 28
  loupe.style.transform = `translate(${left}px, ${top}px)`
  loupe.style.width = `${width}px`
  loupe.hidden = false
}

// Live dimensions, in real pixels, tucked under the selection's corner.
function drawSize(rect) {
  if (!rect || rect.width < 1 || rect.height < 1) {
    size.hidden = true
    return
  }
  const scaleX = pixels ? pixels.width / innerWidth : devicePixelRatio
  const scaleY = pixels ? pixels.height / innerHeight : devicePixelRatio
  size.textContent = `${Math.round(rect.width * scaleX)} × ${Math.round(rect.height * scaleY)}`
  size.hidden = false
  const below = rect.y + rect.height + 8
  const top = below + 22 > innerHeight ? rect.y + rect.height - 28 : below
  const left = Math.min(innerWidth - size.offsetWidth - 8, rect.x + rect.width - size.offsetWidth)
  size.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`
}

function draw() {
  ctx.clearRect(0, 0, innerWidth, innerHeight)
  if (mode === 'point') {
    drawLoupe()
    return
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
  ctx.fillRect(0, 0, innerWidth, innerHeight)
  const rect = selection()
  drawSize(rect)
  if (!rect) return
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height)
  // White edge with a dark keyline, so it shows on light and dark content alike.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.lineWidth = 3
  ctx.strokeRect(rect.x - 0.5, rect.y - 0.5, rect.width + 1, rect.height + 1)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1
  ctx.strokeRect(rect.x - 0.5, rect.y - 0.5, rect.width + 1, rect.height + 1)
}

window.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return
  pointer = { x: event.clientX, y: event.clientY }
  if (mode === 'point') {
    done({ color: colorAt(pointer) })
    return
  }
  start = pointer
  document.body.classList.add('is-dragging')
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
  hint.replaceChildren(
    mode === 'point' ? 'Click to copy a color' : 'Drag over an area',
    document.createTextNode('  ·  '),
    Object.assign(document.createElement('kbd'), { textContent: 'Esc' }),
    ' to cancel',
  )
  shot.src = data.image
  await shot.decode()
  pixels = document.createElement('canvas')
  pixels.width = shot.naturalWidth
  pixels.height = shot.naturalHeight
  pixels.getContext('2d', { willReadFrequently: true }).drawImage(shot, 0, 0)
  resize()
}

load()
