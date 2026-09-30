import AppKit

// Shows the system eyedropper, then copies the picked colour as hex.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
NSColorSampler().show { picked in
  guard let color = picked?.usingColorSpace(.sRGB) else {
    fputs("Cancelled\n", stderr)
    exit(1)
  }
  let hex = String(format: "#%02X%02X%02X", Int(round(color.redComponent * 255)), Int(round(color.greenComponent * 255)), Int(round(color.blueComponent * 255)))
  NSPasteboard.general.clearContents()
  NSPasteboard.general.setString(hex, forType: .string)
  print("Copied \(hex)")
  exit(0)
}
app.run()
