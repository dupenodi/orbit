# Simulated input for the Windows end-to-end tests. Coordinates are real pixels.
#   win-input.ps1 drag x1 y1 x2 y2    press, move, release the left button
#   win-input.ps1 click x y
#   win-input.ps1 hold ms              hold Ctrl+Alt (Orbit's default shortcut) for ms
#   win-input.ps1 hold-move ms x y     hold Ctrl+Alt, move the pointer to x y, release
#   win-input.ps1 esc
param([string]$Command)
$Numbers = @($args | ForEach-Object { [int]$_ })

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Input {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
}
'@
[Input]::SetProcessDPIAware() | Out-Null

# A real (injected) absolute move, so apps see mouse movement, not just a warped cursor.
function Set-Pointer($x, $y) {
  $w = [Input]::GetSystemMetrics(0) - 1
  $h = [Input]::GetSystemMetrics(1) - 1
  [Input]::mouse_event(0x8001, [int]($x * 65535 / $w), [int]($y * 65535 / $h), 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 30
}
function Key($vk, $up) { [Input]::keybd_event($vk, 0, $(if ($up) { 2 } else { 0 }), [UIntPtr]::Zero) }

switch ($Command) {
  'drag' {
    $x1, $y1, $x2, $y2 = $Numbers
    Set-Pointer $x1 $y1
    [Input]::mouse_event(0x2, 0, 0, 0, [UIntPtr]::Zero)
    for ($i = 1; $i -le 20; $i++) { Set-Pointer ($x1 + ($x2 - $x1) * $i / 20) ($y1 + ($y2 - $y1) * $i / 20) }
    [Input]::mouse_event(0x4, 0, 0, 0, [UIntPtr]::Zero)
  }
  'click' {
    Set-Pointer $Numbers[0] $Numbers[1]
    [Input]::mouse_event(0x2, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 30
    [Input]::mouse_event(0x4, 0, 0, 0, [UIntPtr]::Zero)
  }
  'hold' {
    Key 0x11 $false; Key 0x12 $false
    Start-Sleep -Milliseconds $Numbers[0]
    Key 0x12 $true; Key 0x11 $true
  }
  'hold-move' {
    Key 0x11 $false; Key 0x12 $false
    Start-Sleep -Milliseconds 400
    Set-Pointer $Numbers[1] $Numbers[2]
    Start-Sleep -Milliseconds $Numbers[0]
    Key 0x12 $true; Key 0x11 $true
  }
  'esc' { Key 0x1B $false; Key 0x1B $true }
}
