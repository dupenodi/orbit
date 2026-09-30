# Orbit

Menu bar extra. Hold the shortcut, flick toward an action, release.

```bash
npm start      # run from source (macOS lists it as "Electron")
npm run dist   # build dist/mac-arm64/Orbit.app and a zip
```

Builds are ad-hoc signed, so macOS treats every new build as a new app: re-allow its permissions after installing an update. A Developer ID certificate fixes that.

First launch opens a welcome guide that walks through the wheel, the permissions it needs, and a practice round. Reopen it from the menu bar icon → Welcome Guide….

Default shortcut: **Control + Option**. Change it in the menu bar icon → Settings…, or during the guide.

## Permissions

| Permission | Used for |
| --- | --- |
| Accessibility | Pressing the play/pause key for Play or Pause; reading the focused window's title |
| Screen Recording | Grab Text, Screenshot and Scan QR (applies after Orbit restarts) |
| Automation | Switching light and dark mode for Switch Theme; asking Finder for its folder |

Run from source, macOS lists Orbit as **Electron** in Privacy & Security; the built app shows as **Orbit**.

## Wheel

Slots live in `~/Library/Application Support/Orbit/wheels.json` (menu bar icon → Edit Wheels…). Commands get `ORBIT_PROJECT`, `ORBIT_SELECTION`, `ORBIT_HELPERS` and friends; see `actions.js`.
