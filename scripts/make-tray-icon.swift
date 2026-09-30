import AppKit

// The app icon in miniature: eight ring slices, the top one selected.
func makeIcon(size: CGFloat) -> NSImage {
  NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
    let center = NSPoint(x: rect.midX, y: rect.midY)
    let outer = size * 0.46
    let inner = size * 0.25
    let gap = 3.0 * (size / 22) * 0.55
    let sector = 360.0 / 8
    for index in 0..<8 {
      // AppKit angles run counter-clockwise from 3 o'clock; slice 0 sits at 12.
      let mid = 90.0 - Double(index) * sector
      let trimOuter = Double(gap / 2 / outer) * 180 / .pi
      let trimInner = Double(gap / 2 / inner) * 180 / .pi
      let slice = NSBezierPath()
      slice.appendArc(withCenter: center, radius: outer, startAngle: mid - sector / 2 + trimOuter, endAngle: mid + sector / 2 - trimOuter)
      slice.appendArc(withCenter: center, radius: inner, startAngle: mid + sector / 2 - trimInner, endAngle: mid - sector / 2 + trimInner, clockwise: true)
      slice.close()
      NSColor.black.withAlphaComponent(index == 0 ? 1 : 0.42).setFill()
      slice.fill()
    }
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
