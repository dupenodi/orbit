import AppKit
import ApplicationServices
import CoreGraphics

struct Config {
  var control = false
  var option = false
  var shift = false
  var command = false
  var keyCode: CGKeyCode?
}

func parseConfig() -> Config {
  var config = Config()
  for arg in CommandLine.arguments.dropFirst() {
    switch arg {
    case "--control": config.control = true
    case "--option": config.option = true
    case "--shift": config.shift = true
    case "--command": config.command = true
    default:
      if arg.hasPrefix("--key=") {
        config.keyCode = virtualKeyCode(for: String(arg.dropFirst(6)))
      }
    }
  }
  return config
}

func virtualKeyCode(for code: String) -> CGKeyCode? {
  let keys: [String: CGKeyCode] = [
    "KeyA": 0x00, "KeyS": 0x01, "KeyD": 0x02, "KeyF": 0x03, "KeyH": 0x04,
    "KeyG": 0x05, "KeyZ": 0x06, "KeyX": 0x07, "KeyC": 0x08, "KeyV": 0x09,
    "KeyB": 0x0B, "KeyQ": 0x0C, "KeyW": 0x0D, "KeyE": 0x0E, "KeyR": 0x0F,
    "KeyY": 0x10, "KeyT": 0x11, "KeyO": 0x1F, "KeyU": 0x20, "KeyI": 0x22,
    "KeyP": 0x23, "KeyL": 0x25, "KeyJ": 0x26, "KeyK": 0x28, "KeyN": 0x2D,
    "KeyM": 0x2E,
    "Digit1": 0x12, "Digit2": 0x13, "Digit3": 0x14, "Digit4": 0x15,
    "Digit5": 0x17, "Digit6": 0x16, "Digit7": 0x1A, "Digit8": 0x1C,
    "Digit9": 0x19, "Digit0": 0x1D,
    "Equal": 0x18, "Minus": 0x1B, "BracketRight": 0x1E, "BracketLeft": 0x21,
    "Quote": 0x27, "Semicolon": 0x29, "Backslash": 0x2A, "Comma": 0x2B,
    "Slash": 0x2C, "Period": 0x2F, "Backquote": 0x32, "Space": 0x31,
    "Tab": 0x30, "Enter": 0x24, "Backspace": 0x33,
    "F1": 0x7A, "F2": 0x78, "F3": 0x63, "F4": 0x76, "F5": 0x60, "F6": 0x61,
    "F7": 0x62, "F8": 0x64, "F9": 0x65, "F10": 0x6D, "F11": 0x67, "F12": 0x6F,
    "ArrowLeft": 0x7B, "ArrowRight": 0x7C, "ArrowDown": 0x7D, "ArrowUp": 0x7E,
  ]
  return keys[code]
}

func isHeld(_ config: Config) -> Bool {
  let hasMod = config.control || config.option || config.shift || config.command
  if !hasMod && config.keyCode == nil { return false }
  let flags = NSEvent.modifierFlags.intersection(.deviceIndependentFlagsMask)
  if flags.contains(.control) != config.control { return false }
  if flags.contains(.option) != config.option { return false }
  if flags.contains(.shift) != config.shift { return false }
  if flags.contains(.command) != config.command { return false }
  if let keyCode = config.keyCode {
    return CGEventSource.keyState(.hidSystemState, key: keyCode)
  }
  return true
}

final class Watcher: NSObject {
  private let config: Config
  private var last = false
  private var heldTicks = 0

  init(config: Config) {
    self.config = config
  }

  @objc func tick() {
    // Orphaned (Orbit crashed or was force-quit): don't linger in the background.
    if getppid() == 1 { exit(0) }
    let held = isHeld(config)
    if held {
      heldTicks += 1
      if !last && heldTicks >= 4 {
        last = true
        write(frontContext())
      }
      return
    }
    heldTicks = 0
    if last {
      last = false
      write("up")
    }
  }

}

func write(_ line: String) {
  FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

// "down<TAB>bundle id<TAB>focused window title". The title needs Accessibility
// permission; without it the field is empty and Orbit falls back to app state.
func frontContext() -> String {
  guard let app = NSWorkspace.shared.frontmostApplication else { return "down" }
  let bundle = app.bundleIdentifier ?? ""
  var title = ""
  if AXIsProcessTrusted() {
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    var window: CFTypeRef?
    if AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &window) == .success,
      let window
    {
      var value: CFTypeRef?
      if AXUIElementCopyAttributeValue(window as! AXUIElement, kAXTitleAttribute as CFString, &value) == .success,
        let text = value as? String
      {
        title = text.components(separatedBy: .newlines).joined(separator: " ").replacingOccurrences(of: "\t", with: " ")
      }
    }
  }
  return "down\t\(bundle)\t\(title)"
}

// Orbit writes "warp x y" (global points, top-left origin) when the wheel had to be
// nudged away from a screen edge, so the cursor starts in the middle of the hub.
func listenForCommands() {
  var pending = ""
  FileHandle.standardInput.readabilityHandler = { handle in
    let data = handle.availableData
    if data.isEmpty { exit(0) }
    pending += String(decoding: data, as: UTF8.self)
    var lines = pending.components(separatedBy: "\n")
    pending = lines.removeLast()
    DispatchQueue.main.async {
      for line in lines {
        let parts = line.split(separator: " ")
        guard parts.count == 3, parts[0] == "warp", let x = Double(parts[1]), let y = Double(parts[2]) else { continue }
        CGWarpMouseCursorPosition(CGPoint(x: x, y: y))
        // Without this, macOS freezes the pointer for ~250ms after a warp.
        CGAssociateMouseAndMouseCursorPosition(1)
        write("warped")
      }
    }
  }
}

listenForCommands()
let watcher = Watcher(config: parseConfig())
Timer.scheduledTimer(timeInterval: 0.008, target: watcher, selector: #selector(Watcher.tick), userInfo: nil, repeats: true)
RunLoop.main.run()
