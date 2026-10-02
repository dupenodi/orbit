// Reads the trace from the macOS end-to-end run (ORBIT_TRACE=1) and checks that each
// real hold did what it should, then prints how quickly the wheel came and went.
const fs = require('node:fs')

const lines = fs.readFileSync(process.argv[2], 'utf8').split('\n')
const events = lines
  .map((line) => line.match(/^\[orbit (\d+)\] (\w+) ?(.*)$/))
  .filter(Boolean)
  .map(([, at, name, detail]) => ({ at: Number(at), name, detail }))

// Split into holds: everything from one "hold" to the next.
const holds = []
for (const event of events) {
  if (event.name === 'hold') holds.push([])
  holds.at(-1)?.push(event)
}

const failures = []
const expect = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`)
  if (!ok) failures.push(message)
}
const find = (hold, name) => hold?.find((event) => event.name === name)
const since = (hold, from, to) => (find(hold, from) && find(hold, to) ? find(hold, to).at - find(hold, from).at : null)

expect(holds.length === 4, `four holds seen (saw ${holds.length})`)
const [start, back, tap, stop] = holds
expect(find(start, 'chose')?.detail === 'Start Timer', 'a flick up-left runs Start Timer')
expect(/Start Timer · Ends at/.test(find(start, 'toast')?.detail ?? ''), 'its toast says when the timer ends')
expect(start?.some((event) => event.name === 'tick'), 'aiming crosses into a slice (haptic tick sent)')
expect(!find(back, 'chose') && !find(back, 'toast'), 'flicking out and back to the middle cancels')
expect(!find(tap, 'chose') && !find(tap, 'toast'), 'holding without moving cancels')
expect(find(stop, 'chose')?.detail === 'Stop Timer', 'the timer slice turns into Stop Timer while it runs')

for (const [index, hold] of holds.entries()) {
  const parts = [
    ['hold → warped', since(hold, 'hold', 'warped')],
    ['hold → shown', since(hold, 'hold', 'shown')],
    ['release → hidden', since(hold, 'release', 'hidden')],
  ].map(([label, ms]) => `${label} ${ms == null ? '—' : `${ms}ms`}`)
  console.log(`hold ${index + 1}: ${parts.join(', ')}`)
}

const shown = holds.map((hold) => since(hold, 'hold', 'shown')).filter((ms) => ms != null)
expect(shown.length === holds.length && Math.max(...shown) < 400, 'the wheel is fully shown within 400ms of the hold')
process.exit(failures.length ? 1 : 0)
