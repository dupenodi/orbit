import AppKit

// Presses the keyboard's play/pause media key, so whichever player is active responds.
let playPause = 16  // NX_KEYTYPE_PLAY
for (flags, state) in [(0xa00, 0xa), (0xb00, 0xb)] {
  let event = NSEvent.otherEvent(
    with: .systemDefined, location: .zero, modifierFlags: NSEvent.ModifierFlags(rawValue: UInt(flags)),
    timestamp: 0, windowNumber: 0, context: nil, subtype: 8, data1: (playPause << 16) | (state << 8), data2: -1)
  event?.cgEvent?.post(tap: .cghidEventTap)
  usleep(50_000)
}
print("Toggled playback")
