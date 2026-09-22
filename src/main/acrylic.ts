import { execFile } from 'child_process'
import type { BrowserWindow } from 'electron'

/**
 * 为窗口设置 Windows Acrylic 毛玻璃效果
 * 通过 PowerShell + Add-Type 调用 user32.dll 的 SetWindowCompositionAttribute
 * @param window Electron BrowserWindow 实例
 * @param alpha 背景透明度 0-255，默认 20
 */
export function setAcrylicEffect(window: BrowserWindow, alpha = 20): void {
  try {
    const hwndBuffer = window.getNativeWindowHandle()
    const hwnd = hwndBuffer.length === 8
      ? hwndBuffer.readBigUInt64LE().toString()
      : hwndBuffer.readUInt32LE().toString()

    // GradientColor 格式 0xAABBGGRR，黑色 RGB 都是 0
    const gradientColor = (alpha << 24) >>> 0

    const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class AcrylicHelper {
    [DllImport("user32.dll")]
    public static extern int SetWindowCompositionAttribute(IntPtr hwnd, ref WINDOWCOMPOSITIONATTRIBDATA data);

    [StructLayout(LayoutKind.Sequential)]
    public struct WINDOWCOMPOSITIONATTRIBDATA {
        public int Attrib;
        public IntPtr pvData;
        public int cbData;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct ACCENT_POLICY {
        public int AccentState;
        public int AccentFlags;
        public uint GradientColor;
        public int AnimationId;
    }
}
"@

$hwnd = [IntPtr]::new(${hwnd})
$accent = New-Object AcrylicHelper+ACCENT_POLICY
$accent.AccentState = 4
$accent.AccentFlags = 0
$accent.GradientColor = ${gradientColor}
$accent.AnimationId = 0

Write-Output "Debug: AccentState=$($accent.AccentState) AccentFlags=$($accent.AccentFlags) GradientColor=$($accent.GradientColor) Size=$([System.Runtime.InteropServices.Marshal]::SizeOf($accent))"

$size = [System.Runtime.InteropServices.Marshal]::SizeOf($accent)
$ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($size)
[System.Runtime.InteropServices.Marshal]::StructureToPtr($accent, $ptr, $false)

$data = New-Object AcrylicHelper+WINDOWCOMPOSITIONATTRIBDATA
$data.Attrib = 19
$data.pvData = $ptr
$data.cbData = $size

$result = [AcrylicHelper]::SetWindowCompositionAttribute($hwnd, [ref]$data)
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
Write-Output "Result=$result"
`

    console.log('[Acrylic] Applying, hwnd:', hwnd, 'alpha:', alpha, 'gradientColor:', gradientColor)

    execFile('powershell.exe', ['-NoProfile', '-Command', psScript], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[Acrylic] PowerShell error:', error.message)
        if (stderr) console.error('[Acrylic] stderr:', stderr)
      } else {
        console.log('[Acrylic] Output:', stdout.trim())
      }
    })
  } catch (error) {
    console.error('[Acrylic] Failed:', error)
  }
}
