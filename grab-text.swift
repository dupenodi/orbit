import AppKit
import Vision

// Lets the user drag a screen region, then copies the text Vision reads in it.
// With `codes`, reads QR codes and barcodes instead: a link opens, anything else is copied.
let readCodes = CommandLine.arguments.dropFirst().first == "codes"
let shot = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("orbit-grab-\(getpid()).png")

let capture = Process()
capture.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
capture.arguments = ["-i", "-x", shot.path]
try capture.run()
capture.waitUntilExit()

guard let image = NSImage(contentsOf: shot),
  let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  fputs("Cancelled\n", stderr)
  exit(1)
}
try? FileManager.default.removeItem(at: shot)

func copy(_ text: String) {
  NSPasteboard.general.clearContents()
  NSPasteboard.general.setString(text, forType: .string)
}

if readCodes {
  let request = VNDetectBarcodesRequest()
  try VNImageRequestHandler(cgImage: cgImage).perform([request])
  guard let payload = (request.results ?? []).compactMap(\.payloadStringValue).first else {
    fputs("No code found\n", stderr)
    exit(1)
  }
  if let url = URL(string: payload), let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme) {
    NSWorkspace.shared.open(url)
    print("Opened \(url.host ?? payload)")
  } else {
    copy(payload)
    print("Copied \(payload.count > 40 ? payload.prefix(40) + "…" : payload)")
  }
  exit(0)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
try VNImageRequestHandler(cgImage: cgImage).perform([request])

let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
guard !lines.isEmpty else {
  fputs("No text found\n", stderr)
  exit(1)
}

let text = lines.joined(separator: "\n")
copy(text)
let words = text.split(whereSeparator: \.isWhitespace).count
print("Copied \(words) word\(words == 1 ? "" : "s")")
