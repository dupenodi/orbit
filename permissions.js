const { shell, systemPreferences } = require('electron')
const { execFile } = require('node:child_process')
const path = require('node:path')

const PROBE = path.join(__dirname, 'bin', 'permissions')
// Switch Theme drives System Events; slots that use ORBIT_PROJECT ask Finder for its folder.
const AUTOMATION_TARGETS = ['com.apple.systemevents', 'com.apple.finder']
const PANE = 'x-apple.systempreferences:com.apple.preference.security?'

// What each permission unlocks, shown wherever Orbit asks for one.
const PERMISSIONS = [
  {
    id: 'accessibility',
    title: 'Accessibility',
    why: 'Press the play/pause key for Play or Pause, and see which window you’re in.',
    pane: 'Privacy_Accessibility',
  },
  {
    id: 'screen',
    title: 'Screen Recording',
    why: 'Capture the area you drag for Grab Text, Screenshot and Scan QR. Nothing is recorded otherwise.',
    pane: 'Privacy_ScreenCapture',
  },
  {
    id: 'automation',
    title: 'Automation',
    why: 'Switch light and dark mode for Switch Theme, and ask Finder for its folder.',
    pane: 'Privacy_Automation',
  },
]

let lastStatus = {}

function run(file, args, timeout) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout }, (error, stdout) => resolve({ error, stdout }))
  })
}

async function automationStatus() {
  const { error, stdout } = await run(PROBE, ['automation', ...AUTOMATION_TARGETS], 5_000)
  if (error) return 'unknown'
  const states = stdout.trim().split('\n').map((line) => line.split('\t')[1])
  if (states.includes('denied')) return 'denied'
  if (states.every((state) => state === 'granted')) return 'granted'
  return states.includes('needed') ? 'needed' : 'unknown'
}

function screenStatus() {
  const status = systemPreferences.getMediaAccessStatus('screen')
  if (status === 'granted') return 'granted'
  return status === 'not-determined' ? 'needed' : 'denied'
}

// Each value is "granted", "needed" (macOS hasn't asked yet), "denied", or "unknown".
async function permissionStatus() {
  lastStatus = {
    accessibility: systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'needed',
    screen: screenStatus(),
    automation: await automationStatus(),
  }
  return lastStatus
}

function missingPermissions() {
  return PERMISSIONS.filter(({ id }) => lastStatus[id] && lastStatus[id] !== 'granted')
}

function openPane(id) {
  const permission = PERMISSIONS.find((item) => item.id === id)
  if (permission) shell.openExternal(PANE + permission.pane)
}

// Shows the macOS prompt when it can; once macOS has asked (or been refused),
// only System Settings can change the answer, so open it there.
async function requestPermission(id) {
  const status = lastStatus[id] ?? (await permissionStatus())[id]
  if (id === 'accessibility') {
    systemPreferences.isTrustedAccessibilityClient(true)
  } else if (id === 'screen' && status === 'needed') {
    await run(PROBE, ['request-screen'], 60_000)
  } else if (id === 'automation' && status !== 'denied') {
    await run('/usr/bin/osascript', ['-e', 'tell application "System Events" to count processes'], 60_000)
    await run('/usr/bin/osascript', ['-e', 'tell application "Finder" to count windows'], 60_000)
  } else {
    openPane(id)
  }
  return permissionStatus()
}

// Windows has no per-app privacy switches for any of this, so there's nothing to ask for.
if (process.platform === 'darwin') {
  module.exports = { PERMISSIONS, missingPermissions, openPane, permissionStatus, requestPermission }
} else {
  module.exports = {
    PERMISSIONS: [],
    missingPermissions: () => [],
    openPane: () => {},
    permissionStatus: async () => ({}),
    requestPermission: async () => ({}),
  }
}
