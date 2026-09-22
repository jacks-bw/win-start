import { execFile } from 'child_process'
import type { BrowserWindow } from 'electron'

/**
 * 为窗口设置 Windows Acrylic 毛玻璃效果
 * 通过 PowerShell + Add-Type 调用 user32.dll 的 SetWindowCompositionAttribute
 * 无需编译原生模块，无需额外依赖
 * @param window Electron BrowserWindow 实例
 * @param alpha 背景透明度 0-255，默认 120
 * @param color 背景色 RGB（0xRRGGBB），默认黑色
 */
export function setAcrylicEffect(window: BrowserWindow, alpha = 120, color = 0x000000): void {
  try {
    const hwndBuffer = window.getNativeWindowHandle()
    const hwnd = hwndBuffer.length === 8
      ? hwndBuffer.readBigUInt64LE().toString()
      : hwndBuffer.readUInt32LE().toString()

    const gradientColor = ((alpha << 24) | (color & 0xffffff)) >>> 0

    // PowerShell 脚本：通过 Add-Type 调用 SetWindowCompositionAttribute
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
$accent.AccentFlags = 2
$accent.GradientColor = ${gradientColor}
$accent.AnimationId = 0

$size = [System.Runtime.InteropServices.Marshal]::SizeOf($accent)
$ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($size)
[System.Runtime.InteropServices.Marshal]::StructureToPtr($accent, $ptr, $false)

$data = New-Object AcrylicHelper+WINDOWCOMPOSITIONATTRIBDATA
$data.Attrib = 19
$data.pvData = $ptr
$data.cbData = $size

[AcrylicHelper]::SetWindowCompositionAttribute($hwnd, [ref]$data)
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
Write-Output "OK"
`

    console.log('[Acrylic] Applying effect, hwnd:', hwnd, 'alpha:', alpha)

    execFile('powershell.exe', ['-NoProfile', '-Command', psScript], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[Acrylic] PowerShell error:', error.message)
        if (stderr) console.error('[Acrylic] stderr:', stderr)
      } else {
        console.log('[Acrylic] Effect applied successfully:', stdout.trim())
      }
    })
  } catch (error) {
    console.error('[Acrylic] Failed to apply acrylic effect:', error)
  }
}
