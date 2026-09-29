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
  Enter: 'Return',
  Backspace: 'Delete',
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

function formatShortcut(shortcut) {
  if (!shortcut) return 'None'
  let text = ''
  if (shortcut.control) text += '⌃'
  if (shortcut.option) text += '⌥'
  if (shortcut.shift) text += '⇧'
  if (shortcut.command) text += '⌘'
  if (shortcut.code) {
    text += KEY_LABELS[shortcut.code] || shortcut.code.replace(/^Key|^Digit/, '')
  }
  return text || 'None'
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
    watcherArgs,
    normalizeShortcut,
  }
}
