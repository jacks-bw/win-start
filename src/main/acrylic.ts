import koffi from 'koffi'
import type { BrowserWindow } from 'electron'

// 加载 user32.dll
const user32 = koffi.load('user32.dll')

// 定义 SetWindowCompositionAttribute
// BOOL SetWindowCompositionAttribute(HWND hWnd, const WINDOWCOMPOSITIONATTRIBDATA *pAttrData)
const SetWindowCompositionAttribute = user32.func(
  'SetWindowCompositionAttribute',
  'int',
  ['void*', 'void*']
)

// 定义 ACCENT_POLICY 结构
const ACCENT_POLICY = koffi.struct('ACCENT_POLICY', {
  AccentState: 'uint32_t',
  AccentFlags: 'uint32_t',
  GradientColor: 'uint32_t',
  AnimationId: 'uint32_t'
})

// 定义 WINDOWCOMPOSITIONATTRIBDATA 结构
const WINDOWCOMPOSITIONATTRIBDATA = koffi.struct('WINDOWCOMPOSITIONATTRIBDATA', {
  Attrib: 'uint32_t',
  pvData: 'void*',
  cbData: 'size_t'
})

// 常量
const ACCENT_ENABLE_ACRYLICBLURBEHIND = 4 // 启用 Acrylic 模糊
const WCA_ACCENT_POLICY = 19

/**
 * 为窗口设置 Windows Acrylic 毛玻璃效果
 * 通过 SetWindowCompositionAttribute 原生 API 实现，无需编译原生模块
 * @param window Electron BrowserWindow 实例
 * @param alpha 背景透明度 0-255，默认 120（约 47% 不透明）
 * @param color 背景色 RGB（0xRRGGBB），默认黑色
 */
export function setAcrylicEffect(window: BrowserWindow, alpha = 120, color = 0x000000): void {
  try {
    const hwndBuffer = window.getNativeWindowHandle()
    // x64 系统 HWND 是 8 字节，x86 是 4 字节
    const hwnd = hwndBuffer.length === 8
      ? hwndBuffer.readBigUInt64LE()
      : hwndBuffer.readUInt32LE()

    // ARGB 格式: 0xAARRGGBB
    const gradientColor = (alpha << 24) | (color & 0xffffff)

    const accent = {
      AccentState: ACCENT_ENABLE_ACRYLICBLURBEHIND,
      AccentFlags: 2,
      GradientColor: gradientColor >>> 0, // 转为无符号 32 位
      AnimationId: 0
    }

    const data = {
      Attrib: WCA_ACCENT_POLICY,
      pvData: accent,
      cbData: koffi.sizeof(ACCENT_POLICY)
    }

    SetWindowCompositionAttribute(hwnd, data)
    console.log('[Acrylic] Acrylic effect applied, alpha:', alpha)
  } catch (error) {
    console.error('[Acrylic] Failed to apply acrylic effect:', error)
  }
}
