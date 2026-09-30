import AppKit
import ApplicationServices
import CoreGraphics

// Reports or requests the macOS permissions Orbit's slots rely on. Runs as a
// child of Orbit, so macOS attributes every check and prompt to Orbit itself.
//
//   permissions automation <bundle id>…   one "bundle id<TAB>status" line each
//   permissions request-screen             asks once for Screen Recording

func launchQuietly(_ bundleID: String) {
  let open = Process()
  open.executableURL = URL(fileURLWithPath: "/usr/bin/open")
  open.arguments = ["-gj", "-b", bundleID]
  try? open.run()
  open.waitUntilExit()
  Thread.sleep(forTimeInterval: 0.6)
}

// Never shows a prompt: "needed" means macOS would ask on first use.
func automationStatus(_ bundleID: String, retry: Bool = true) -> String {
  var target = AEAddressDesc()
  let created = bundleID.withCString { bytes in
    AECreateDesc(DescType(typeApplicationBundleID), bytes, strlen(bytes), &target)
  }
  guard created == noErr else { return "unknown" }
  defer { AEDisposeDesc(&target) }
  let status = AEDeterminePermissionToAutomateTarget(&target, AEEventClass(typeWildCard), AEEventID(typeWildCard), false)
  switch Int(status) {
  case Int(noErr): return "granted"
  case Int(errAEEventNotPermitted): return "denied"
  case Int(errAEEventWouldRequireUserConsent): return "needed"
  case Int(procNotFound) where retry:
    launchQuietly(bundleID)
    return automationStatus(bundleID, retry: false)
  default: return "unknown"
  }
}

let args = Array(CommandLine.arguments.dropFirst())
switch args.first {
case "automation":
  for bundleID in args.dropFirst() {
    print("\(bundleID)\t\(automationStatus(bundleID))")
  }
case "request-screen":
  print(CGRequestScreenCaptureAccess() ? "granted" : "needed")
default:
  fputs("usage: permissions automation <bundle id>… | request-screen\n", stderr)
  exit(2)
}
