// Tauri 渲染层 IPC 适配：把 window.electronAPI 映射到 Tauri invoke
// 在 main.ts 里 import 这个文件即可，Vue 组件无需改动

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

const electronAPI = {
  // 扫描程序
  scanApps: () => invoke('scan_apps'),

  // 窗口控制（占位，后续按需补）
  showStartMenu: () => invoke('show_start_menu'),
  hideStartMenu: () => invoke('hide_start_menu'),

  // 事件监听
  onAppsChanged: (cb: () => void) => {
    listen('apps-changed', () => cb())
  },
  onMenuOpen: (cb: () => void) => {
    listen('menu:open', () => cb())
  },
}

// @ts-expect-error 挂载到全局
window.electronAPI = electronAPI

export {}
