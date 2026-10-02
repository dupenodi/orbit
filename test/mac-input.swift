// Real input for the macOS end-to-end check: holds Control+Option the way a
// keyboard does, flicks the pointer, and lets go.
//   mac-input flick <degrees> <radius> <hold ms> [back]   aim and release (0° = right,
//                                                  90° = down); "back" returns to the middle first
//   mac-input tap <hold ms>                        hold without moving, then release
import CoreGraphics
import Foundation

let source = CGEventSource(stateID: .hidSystemState)

func modifiers(_ keyCode: CGKeyCode, flags: CGEventFlags) {
  let event = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
  event?.type = .flagsChanged
  event?.flags = flags
  event?.post(tap: .cghidEventTap)
}

func hold() {
  modifiers(0x3B, flags: .maskControl)
  usleep(25_000)
  modifiers(0x3A, flags: [.maskControl, .maskAlternate])
}

func release() {
  modifiers(0x3A, flags: .maskControl)
  usleep(10_000)
  modifiers(0x3B, flags: [])
}

func move(to point: CGPoint) {
  CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
}

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("usage: mac-input flick <degrees> <radius> <hold ms> | tap <hold ms>\n".data(using: .utf8)!)
  exit(2)
}

hold()
// Orbit waits ~32ms to be sure it's a hold, then centres the pointer on the wheel.
usleep(300_000)

if args[1] == "flick", args.count >= 5, let degrees = Double(args[2]), let radius = Double(args[3]), let ms = UInt32(args[4]) {
  let start = CGEvent(source: nil)?.location ?? .zero
  let angle = degrees * .pi / 180
  // A quick flick: 18 samples over ~150ms, easing out like a hand does.
  for step in 1...18 {
    let t = Double(step) / 18
    let eased = 1 - pow(1 - t, 3)
    move(to: CGPoint(x: start.x + cos(angle) * radius * eased, y: start.y + sin(angle) * radius * eased))
    usleep(8_000)
  }
  usleep(ms * 1000)
  if args.count >= 6, args[5] == "back" {
    for step in 1...12 {
      let t = 1 - Double(step) / 12
      move(to: CGPoint(x: start.x + cos(angle) * radius * t, y: start.y + sin(angle) * radius * t))
      usleep(8_000)
    }
    usleep(250_000)
  }
} else if args[1] == "tap", let ms = UInt32(args[2]) {
  usleep(ms * 1000)
}

release()
