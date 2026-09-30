import AppKit

// Renders assets/icon.svg into build/icon.icns for the packaged app.
// Usage: make-app-icon <icon.svg> <out.icns>
let args = CommandLine.arguments
guard args.count == 3, let svg = NSImage(contentsOf: URL(fileURLWithPath: args[1])) else {
  fputs("usage: make-app-icon <icon.svg> <out.icns>\n", stderr)
  exit(2)
}

let iconset = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("orbit-\(getpid()).iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

func render(_ pixels: Int, to name: String) throws {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  svg.draw(in: NSRect(x: 0, y: 0, width: pixels, height: pixels))
  NSGraphicsContext.restoreGraphicsState()
  try rep.representation(using: .png, properties: [:])!.write(to: iconset.appendingPathComponent(name))
}

for points in [16, 32, 128, 256, 512] {
  try render(points, to: "icon_\(points)x\(points).png")
  try render(points * 2, to: "icon_\(points)x\(points)@2x.png")
}

let iconutil = Process()
iconutil.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
iconutil.arguments = ["-c", "icns", iconset.path, "-o", args[2]]
try iconutil.run()
iconutil.waitUntilExit()
try? FileManager.default.removeItem(at: iconset)
exit(iconutil.terminationStatus)
