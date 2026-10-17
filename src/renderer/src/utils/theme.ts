// 统一的主题色管理工具
// 两套颜色相互独立：
//   1. 软件主题色（--accent-color）：按钮、磁贴底色等实色元素
//   2. 高亮颜色（--highlight-color-rgb）：悬停/聚焦/拖拽等半透明高亮
// 二者均可自定义，也可各自恢复为跟随系统主题色。

let systemAccent = '#0078d7'

function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const dr = Math.round(r * (1 - amount))
  const dg = Math.round(g * (1 - amount))
  const db = Math.round(b * (1 - amount))
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

/** 应用软件主题色：custom 为 null 时跟随系统 */
export function applyThemeColor(custom: string | null) {
  const color = custom || systemAccent
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return
  const root = document.documentElement
  root.style.setProperty('--accent-color', color)
  root.style.setProperty('--accent-color-rgb', hexToRgb(color))
  root.style.setProperty('--accent-hover', darkenColor(color, 0.15))
}

/** 应用高亮颜色：custom 为 null 时跟随系统 */
export function applyHighlightColor(custom: string | null) {
  const color = custom || systemAccent
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return
  document.documentElement.style.setProperty('--highlight-color-rgb', hexToRgb(color))
}

/** 窗口启动时：读取系统色 + 已保存的自定义颜色并应用 */
export async function initTheme() {
  try {
    const c = await window.api.getAccentColor()
    if (c && /^#[0-9a-fA-F]{6}$/.test(c)) systemAccent = c
  } catch (e) {
    console.warn('读取系统强调色失败:', e)
  }
  // 先按系统色铺底
  applyThemeColor(null)
  applyHighlightColor(null)
  try {
    const s = await window.api.getSettings()
    applyThemeColor(s?.themeColor ?? null)
    applyHighlightColor(s?.highlightColor ?? null)
  } catch (e) {
    console.warn('读取主题设置失败:', e)
  }
}

/** 监听设置窗口的颜色变更（所有窗口通用） */
export function bindThemeEvents() {
  const stopTheme = window.api.onThemeColorChanged(color => applyThemeColor(color ?? null))
  const stopHighlight = window.api.onHighlightColorChanged(color => applyHighlightColor(color ?? null))
  return () => { stopTheme(); stopHighlight() }
}
