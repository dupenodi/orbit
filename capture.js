const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron')
const path = require('node:path')

// Orbit's own screen picker, for platforms with no scriptable one (Windows): the
// display under the pointer freezes, and you drag a region or click a pixel on it.

// The wheel fades out over ~110ms; wait so it isn't in the shot.
const SETTLE_MS = 160

let session = null

async function grabDisplay(display) {
  const size = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
  const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) throw new Error('Could not capture the screen')
  return source.thumbnail
}

function finish(result) {
  if (!session) return
  const { win, resolve } = session
  session = null
  if (!win.isDestroyed()) win.destroy()
  resolve(result)
}

ipcMain.handle('capture:load', (event) => {
  if (event.sender !== session?.win.webContents) return null
  return { mode: session.mode, image: session.shot.toDataURL() }
})

// The page reports a region in its own (DIP) pixels, or a picked colour.
ipcMain.on('capture:done', (event, result) => {
  if (event.sender !== session?.win.webContents) return
  if (!result) return finish(null)
  if (session.mode === 'point') return finish(/^#[0-9A-F]{6}$/.test(result.color) ? { color: result.color } : null)
  const { shot, bounds } = session
  const { width, height } = shot.getSize()
  const sx = width / bounds.width
  const sy = height / bounds.height
  const rect = {
    x: Math.max(0, Math.round(result.x * sx)),
    y: Math.max(0, Math.round(result.y * sy)),
    width: Math.round(result.width * sx),
    height: Math.round(result.height * sy),
  }
  rect.width = Math.min(rect.width, width - rect.x)
  rect.height = Math.min(rect.height, height - rect.y)
  finish(rect.width > 2 && rect.height > 2 ? { image: shot.crop(rect) } : null)
})

// mode 'region' resolves { image } (a NativeImage in real pixels); mode 'point'
// resolves { color: '#RRGGBB' }. Resolves null when cancelled.
async function pickFromScreen(mode) {
  if (session) return null
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const shot = await grabDisplay(display)
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      roundedCorners: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: path.join(__dirname, 'capture-preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })
    session = { win, mode, shot, bounds: display.bounds, resolve }
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setBounds(display.bounds)
    win.loadFile(path.join(__dirname, 'capture.html'))
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
    })
    win.on('closed', () => finish(null))
  })
}

module.exports = { pickFromScreen }
