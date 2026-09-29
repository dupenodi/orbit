import AppKit

func makeIcon(size: CGFloat) -> NSImage {
  NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
    let inset = size * 0.2
    let ring = NSBezierPath(ovalIn: rect.insetBy(dx: inset, dy: inset))
    ring.lineWidth = max(1.5, size * 0.08)
    NSColor.black.setStroke()
    ring.stroke()

    let r = size * 0.12
    let dotRect = NSRect(
      x: rect.midX - r / 2,
      y: rect.maxY - inset - r * 0.35,
      width: r,
      height: r
    )
    NSColor.black.setFill()
    NSBezierPath(ovalIn: dotRect).fill()
    return true
  }
}

func writePNG(_ image: NSImage, to url: URL) {
  guard
    let tiff = image.tiffRepresentation,
    let rep = NSBitmapImageRep(data: tiff),
    let png = rep.representation(using: .png, properties: [:])
  else { return }
  try? png.write(to: url)
}

let dir = URL(fileURLWithPath: CommandLine.arguments[1])
try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
writePNG(makeIcon(size: 22), to: dir.appendingPathComponent("TrayIconTemplate.png"))
writePNG(makeIcon(size: 44), to: dir.appendingPathComponent("TrayIconTemplate@2x.png"))
