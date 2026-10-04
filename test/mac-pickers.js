// Checks, with the real macOS helpers, that screen pickers take turns: opening one
// closes the one already open, and the closed one quietly reports "Cancelled".
// Run by CI: `npx electron test/mac-pickers.js`.
const { app } = require('electron')
const { execFileSync } = require('node:child_process')
const path = require('node:path')

app.setName('Orbit-pickers')
const { runAction } = require(path.join(__dirname, '..', 'actions.js'))

const results = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

function running(pattern) {
  try {
    return execFileSync('/usr/bin/pgrep', ['-f', pattern]).toString().trim().length > 0
  } catch {
    return false
  }
}

async function waitFor(test, ms = 4000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (test()) return true
  return test()
}

const slot = (label, action) => ({ label, run: { type: 'builtin', action } })
const SCREENCAPTURE = 'screencapture -i'
const SAMPLER = 'bin/pick-color$'
const GRABBER = 'bin/grab-text$'

app.whenReady().then(async () => {
  try {
    const shot = runAction(slot('Screenshot', 'screenshot'), {})
    check('Screenshot opens the screen picker', await waitFor(() => running(SCREENCAPTURE)))

    const color = runAction(slot('Pick Color', 'pick-color'), {})
    const shotResult = await shot
    check('opening Pick Color cancels Screenshot quietly', !shotResult.ok && shotResult.message === 'Cancelled', shotResult.message)
    check('…and closes its picker', await waitFor(() => !running(SCREENCAPTURE)))
    check('the eyedropper opens', await waitFor(() => running(SAMPLER)))

    const grab = runAction(slot('Grab Text', 'grab-text'), {})
    const colorResult = await color
    check('opening Grab Text cancels Pick Color quietly', !colorResult.ok && colorResult.message === 'Cancelled', colorResult.message)
    check('…and closes the eyedropper', await waitFor(() => !running(SAMPLER)))
    check('Grab Text opens its picker', await waitFor(() => running(GRABBER) && running(SCREENCAPTURE)))

    // Esc in the picker, as the user would.
    execFileSync('/usr/bin/pkill', ['-f', SCREENCAPTURE])
    const grabResult = await grab
    check('backing out of the last picker cancels it', !grabResult.ok && grabResult.message === 'Cancelled', grabResult.message)
    check('nothing is left running', await waitFor(() => !running(SCREENCAPTURE) && !running(SAMPLER) && !running(GRABBER)))
  } catch (error) {
    check('no unexpected errors', false, error.stack)
  }
  for (const pattern of [SCREENCAPTURE, SAMPLER, GRABBER]) {
    try {
      execFileSync('/usr/bin/pkill', ['-f', pattern])
    } catch {}
  }
  const failed = results.filter((result) => !result.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  app.exit(failed.length ? 1 : 0)
})
