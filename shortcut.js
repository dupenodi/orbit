// Runs in main (Node) and in pages (as a plain script), so sniff the platform either way.
const IS_MAC =
  typeof process !== 'undefined' && process.platform
    ? process.platform === 'darwin'
    : /Mac/.test(navigator.platform)

const DEFAULT_SHORTCUT = {
  control: true,
  option: true,
  shift: false,
  command: false,
  code: null,
}

const MOD_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
])

const KEY_LABELS = {
  Space: 'Space',
  Tab: 'Tab',
  Enter: IS_MAC ? 'Return' : 'Enter',
  Backspace: IS_MAC ? 'Delete' : 'Backspace',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
}

const WATCHED_CODES = new Set([
  ...Object.keys(KEY_LABELS),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Key${letter}`),
  ...'0123456789'.split('').map((digit) => `Digit${digit}`),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
])

function shortcutFromEvent(event) {
  return {
    control: event.ctrlKey,
    option: event.altKey,
    shift: event.shiftKey,
    command: event.metaKey,
    code: MOD_CODES.has(event.code) ? null : event.code,
  }
}

function isValidShortcut(shortcut) {
  if (!shortcut) return false
  const mods = [shortcut.control, shortcut.option, shortcut.shift, shortcut.command].filter(Boolean).length
  if (shortcut.code) return WATCHED_CODES.has(shortcut.code)
  return mods >= 1
}

// Each modifier as [mac symbol, mac name, Windows name]. On Windows, option is Alt
// and command is the Windows key.
const MODIFIERS = [
  ['control', '⌃', 'control', 'Ctrl'],
  ['option', '⌥', 'option', 'Alt'],
  ['shift', '⇧', 'shift', 'Shift'],
  ['command', '⌘', 'command', 'Win'],
]

// The shortcut as keycaps: [label, small caption] pairs, e.g. ['⌃', 'control'] or ['Ctrl', ''].
function shortcutParts(shortcut) {
  if (!shortcut) return []
  const parts = MODIFIERS.filter(([key]) => shortcut[key]).map(([, symbol, name, win]) =>
    IS_MAC ? [symbol, name] : [win, ''],
  )
  if (shortcut.code) parts.push([KEY_LABELS[shortcut.code] || shortcut.code.replace(/^Key|^Digit/, ''), ''])
  return parts
}

function formatShortcut(shortcut) {
  const parts = shortcutParts(shortcut).map(([label]) => label)
  if (!parts.length) return 'None'
  return parts.join(IS_MAC ? '' : '+')
}

function watcherArgs(shortcut) {
  const args = []
  if (shortcut.control) args.push('--control')
  if (shortcut.option) args.push('--option')
  if (shortcut.shift) args.push('--shift')
  if (shortcut.command) args.push('--command')
  if (shortcut.code) args.push(`--key=${shortcut.code}`)
  return args
}

function normalizeShortcut(raw) {
  const shortcut = {
    control: Boolean(raw?.control),
    option: Boolean(raw?.option),
    shift: Boolean(raw?.shift),
    command: Boolean(raw?.command),
    code: raw?.code || null,
  }
  return isValidShortcut(shortcut) ? shortcut : { ...DEFAULT_SHORTCUT }
}

if (typeof module !== 'undefined') {
  module.exports = {
    DEFAULT_SHORTCUT,
    MOD_CODES,
    shortcutFromEvent,
    isValidShortcut,
    formatShortcut,
    shortcutParts,
    watcherArgs,
    normalizeShortcut,
  }
}
