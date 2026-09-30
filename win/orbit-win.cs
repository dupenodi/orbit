// Orbit's Windows helper. Built with the C# 5 compiler that ships with Windows
// (.NET Framework 4), so no SDK is needed:
//
//   orbit-win watch [--control] [--option] [--shift] [--command] [--key=KeyA] [--parent=PID]
//       The Windows twin of mod-watch.swift, speaking the same protocol: prints
//       "down<TAB>app<TAB>window title" when the shortcut is held and "up" when it's
//       released; reads "warp x y" (physical pixels) on stdin and answers "warped".
//   orbit-win theme      Switches between light and dark mode.
//   orbit-win media      Presses the play/pause media key.
//   orbit-win mic        Mutes or unmutes the default microphone.
//   orbit-win cursor     Prints the pointer position (for tests).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32;

static class Native {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  public static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref uint size);

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
}

static class Program {
  static readonly object OutLock = new object();

  static void Write(string line) {
    lock (OutLock) {
      Console.Out.Write(line + "\n");
      Console.Out.Flush();
    }
  }

  static int Main(string[] args) {
    Console.OutputEncoding = new UTF8Encoding(false);
    string command = args.Length > 0 ? args[0] : "";
    try {
      switch (command) {
        case "watch": return Watch(args);
        case "theme": return Theme();
        case "media": return Media();
        case "mic": return Mic.Toggle();
        case "cursor": return Cursor();
      }
    } catch (Exception error) {
      Console.Error.WriteLine(error.Message);
      return 1;
    }
    Console.Error.WriteLine("Usage: orbit-win watch|theme|media|mic|cursor");
    return 2;
  }

  // ---- watch -------------------------------------------------------------

  const int VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12, VK_LWIN = 0x5B, VK_RWIN = 0x5C;

  static bool Down(int vk) {
    return (Native.GetAsyncKeyState(vk) & 0x8000) != 0;
  }

  static Dictionary<string, int> KeyCodes() {
    var keys = new Dictionary<string, int>();
    for (char letter = 'A'; letter <= 'Z'; letter++) keys["Key" + letter] = letter;
    for (char digit = '0'; digit <= '9'; digit++) keys["Digit" + digit] = digit;
    for (int n = 1; n <= 12; n++) keys["F" + n] = 0x6F + n;
    keys["Space"] = 0x20; keys["Tab"] = 0x09; keys["Enter"] = 0x0D; keys["Backspace"] = 0x08;
    keys["ArrowLeft"] = 0x25; keys["ArrowUp"] = 0x26; keys["ArrowRight"] = 0x27; keys["ArrowDown"] = 0x28;
    keys["Semicolon"] = 0xBA; keys["Equal"] = 0xBB; keys["Comma"] = 0xBC; keys["Minus"] = 0xBD;
    keys["Period"] = 0xBE; keys["Slash"] = 0xBF; keys["Backquote"] = 0xC0; keys["BracketLeft"] = 0xDB;
    keys["Backslash"] = 0xDC; keys["BracketRight"] = 0xDD; keys["Quote"] = 0xDE;
    return keys;
  }

  static int Watch(string[] args) {
    bool control = false, option = false, shift = false, win = false;
    int key = 0, parent = 0;
    var keyCodes = KeyCodes();
    foreach (string arg in args) {
      if (arg == "--control") control = true;
      else if (arg == "--option") option = true;
      else if (arg == "--shift") shift = true;
      else if (arg == "--command") win = true;
      else if (arg.StartsWith("--key=")) keyCodes.TryGetValue(arg.Substring(6), out key);
      else if (arg.StartsWith("--parent=")) int.TryParse(arg.Substring(9), out parent);
    }
    if (!control && !option && !shift && !win && key == 0) {
      Console.Error.WriteLine("No shortcut given");
      return 2;
    }

    // Per-monitor DPI awareness, so warp coordinates are real pixels on every display.
    try { Native.SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) { Native.SetProcessDPIAware(); }

    var reader = new Thread(ReadCommands);
    reader.IsBackground = true;
    reader.Start();

    bool last = false;
    int heldTicks = 0;
    var parentCheck = Stopwatch.StartNew();
    while (true) {
      // Orphaned (Orbit crashed or was killed): don't linger in the background.
      if (parent != 0 && parentCheck.ElapsedMilliseconds > 1000) {
        parentCheck.Restart();
        if (!IsAlive(parent)) return 0;
      }
      bool held = Down(VK_CONTROL) == control && Down(VK_MENU) == option && Down(VK_SHIFT) == shift
        && (Down(VK_LWIN) || Down(VK_RWIN)) == win && (key == 0 || Down(key));
      if (held) {
        heldTicks++;
        if (!last && heldTicks >= 4) {
          last = true;
          Write(FrontContext());
        }
      } else {
        heldTicks = 0;
        if (last) {
          last = false;
          Write("up");
        }
      }
      Thread.Sleep(8);
    }
  }

  static bool IsAlive(int pid) {
    try {
      return !Process.GetProcessById(pid).HasExited;
    } catch (ArgumentException) {
      return false;
    }
  }

  static void ReadCommands() {
    string line;
    while ((line = Console.In.ReadLine()) != null) {
      string[] parts = line.Trim().Split(' ');
      int x, y;
      if (parts.Length == 3 && parts[0] == "warp" && int.TryParse(parts[1], out x) && int.TryParse(parts[2], out y)) {
        Native.SetCursorPos(x, y);
        Write("warped");
      }
    }
    // Orbit closed our stdin: it's gone or restarting us.
    Environment.Exit(0);
  }

  // "down<TAB>app<TAB>window title". On Windows the app is its lower-cased exe
  // name (code.exe), which is also how wheels.json keys per-app wheels.
  static string FrontContext() {
    IntPtr hwnd = Native.GetForegroundWindow();
    if (hwnd == IntPtr.Zero) return "down";
    var title = new StringBuilder(512);
    Native.GetWindowText(hwnd, title, title.Capacity);
    uint pid;
    Native.GetWindowThreadProcessId(hwnd, out pid);
    string exe = "";
    IntPtr process = Native.OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (process != IntPtr.Zero) {
      var name = new StringBuilder(1024);
      uint size = (uint)name.Capacity;
      if (Native.QueryFullProcessImageName(process, 0, name, ref size)) exe = Path.GetFileName(name.ToString()).ToLowerInvariant();
      Native.CloseHandle(process);
    }
    string clean = title.ToString().Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
    return "down\t" + exe + "\t" + clean;
  }

  // ---- actions -----------------------------------------------------------

  static int Theme() {
    const string personalize = @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
    using (RegistryKey key = Registry.CurrentUser.CreateSubKey(personalize)) {
      object current = key.GetValue("AppsUseLightTheme", 1);
      int light = Convert.ToInt32(current) == 0 ? 1 : 0;
      key.SetValue("AppsUseLightTheme", light, RegistryValueKind.DWord);
      key.SetValue("SystemUsesLightTheme", light, RegistryValueKind.DWord);
      // Tell open windows (and the taskbar) to repaint in the new colours.
      UIntPtr result;
      Native.SendMessageTimeout(new IntPtr(0xFFFF), 0x001A, UIntPtr.Zero, "ImmersiveColorSet", 0x0002, 200, out result);
      Console.WriteLine(light == 1 ? "Switched to light" : "Switched to dark");
    }
    return 0;
  }

  static int Media() {
    const byte VK_MEDIA_PLAY_PAUSE = 0xB3;
    Native.keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 0x1, UIntPtr.Zero);
    Native.keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 0x1 | 0x2, UIntPtr.Zero);
    Console.WriteLine("Toggled playback");
    return 0;
  }

  static int Cursor() {
    try { Native.SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) { Native.SetProcessDPIAware(); }
    Native.POINT point;
    Native.GetCursorPos(out point);
    Console.WriteLine(point.X + " " + point.Y);
    return 0;
  }
}

// Core Audio, just enough to mute the default capture device.
static class Mic {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumerator { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid id, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object endpoint);
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr notify);
    int UnregisterControlChangeNotify(IntPtr notify);
    int GetChannelCount(out uint count);
    int SetMasterVolumeLevel(float level, ref Guid context);
    int SetMasterVolumeLevelScalar(float level, ref Guid context);
    int GetMasterVolumeLevel(out float level);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
    int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
    int GetChannelVolumeLevel(uint channel, out float level);
    int GetChannelVolumeLevelScalar(uint channel, out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  const int eCapture = 1, eConsole = 0, CLSCTX_ALL = 23;

  public static int Toggle() {
    var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice device;
    if (enumerator.GetDefaultAudioEndpoint(eCapture, eConsole, out device) != 0 || device == null) {
      Console.Error.WriteLine("No microphone found");
      return 1;
    }
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object endpoint;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out endpoint));
    var volume = (IAudioEndpointVolume)endpoint;
    bool muted;
    Marshal.ThrowExceptionForHR(volume.GetMute(out muted));
    Guid context = Guid.Empty;
    Marshal.ThrowExceptionForHR(volume.SetMute(!muted, ref context));
    Console.WriteLine(muted ? "Unmuted" : "Muted");
    return 0;
  }
}
