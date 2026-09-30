# Orbit

Hold a shortcut, flick toward an action, release. Runs on macOS and Windows.

```bash
npm start          # run from source (macOS lists it as "Electron")
npm run dist       # macOS: build dist/mac-arm64/Orbit.app, a zip and a DMG
npm run dist:win   # Windows: build dist/Orbit-Setup-<version>.exe
```

First launch opens a welcome guide that walks through the wheel, any permissions it needs, and a practice round. Reopen it from Orbit's icon (menu bar on macOS, system tray on Windows) → Welcome Guide….

Default shortcut: **Control + Option** on macOS, **Ctrl + Alt** on Windows. Change it from Orbit's icon → Settings…, or during the guide.

## Platforms

| | macOS | Windows |
| --- | --- | --- |
| Shortcut watcher | `mod-watch.swift` | `win/orbit-win.cs` (`orbit-win watch`, same protocol) |
| Grab Text | Vision (`grab-text.swift`) | Orbit's screen picker + Windows OCR (`win/ocr.ps1`) |
| Screenshot | `screencapture` | Orbit's screen picker |
| Scan QR | Vision (`grab-text.swift codes`) | Orbit's screen picker + jsQR |
| Pick Color | System eyedropper (`pick-color.swift`) | Orbit's screen picker |
| Switch Theme | System Events | Registry (`orbit-win theme`) |
| Play or Pause | Media key (`media-key.swift`) | Media key (`orbit-win media`) |
| Toggle Mic | Input volume | Default microphone mute (`orbit-win mic`) |

The native helpers build automatically on `npm start`: Swift needs Xcode's command line tools; the C# helper uses the `csc.exe` that ships with Windows, so no SDK is needed.

macOS builds are ad-hoc signed, so macOS treats every new build as a new app: re-allow its permissions after installing an update. A Developer ID certificate fixes that. The Windows installer is unsigned, so SmartScreen warns on first run (More info → Run anyway).

## Permissions (macOS)

| Permission | Used for |
| --- | --- |
| Accessibility | Pressing the play/pause key for Play or Pause; reading the focused window's title |
| Screen Recording | Grab Text, Screenshot and Scan QR (applies after Orbit restarts) |
| Automation | Switching light and dark mode for Switch Theme; asking Finder for its folder |

Run from source, macOS lists Orbit as **Electron** in Privacy & Security; the built app shows as **Orbit**. Windows needs no permissions.

## Wheel

Slots live in `wheels.json` in Orbit's data folder (`~/Library/Application Support/Orbit` on macOS, `%APPDATA%\Orbit` on Windows; open it from Orbit's icon → Edit Wheels…). The default slots are built-ins (`{ "type": "builtin", "action": "grab-text" }`) that work on both platforms. Your own `shell` slots run in zsh on macOS and PowerShell on Windows, and get `ORBIT_PROJECT`, `ORBIT_SELECTION`, `ORBIT_HELPERS` and friends; see `actions.js`. On Windows, per-app wheels are keyed by exe name, e.g. `code.exe`.

## Tests

`.github/workflows/windows.yml` runs on every push: it builds the C# helper, runs `test/windows-e2e.js` (every slot, driven by simulated input), opens the real wheel, then builds, installs and launches the installer.
