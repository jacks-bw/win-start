import { contextBridge, ipcRenderer } from 'electron'

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 程序列表
  getAppList: () => ipcRenderer.invoke('app:list'),
  launchApp: (lnkPath: string, args?: string) => ipcRenderer.invoke('app:launch', lnkPath, args),
  showInFolder: (fullPath: string) => ipcRenderer.invoke('app:show-in-folder', fullPath),
  uninstallProgram: () => ipcRenderer.invoke('app:uninstall'),
  togglePin: (appId: string) => ipcRenderer.invoke('app:toggle-pin', appId),
  pinToTaskbar: (lnkPath: string) => ipcRenderer.invoke('app:pin-taskbar', lnkPath),

  // 磁贴布局
  saveTileLayout: (layout: unknown) => ipcRenderer.invoke('tile:layout-save', layout),
  loadTileLayout: () => ipcRenderer.invoke('tile:layout-load'),

  // 菜单控制
  hideMenu: () => ipcRenderer.invoke('menu:hide'),

  // 主题
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (theme: 'light' | 'dark') => ipcRenderer.invoke('theme:set', theme),

  // 背景透明度
  getOpacity: () => ipcRenderer.invoke('opacity:get'),
  setOpacity: (opacity: number) => ipcRenderer.invoke('opacity:set', opacity),

  // Acrylic 透明度
  setAcrylicAlpha: (alpha: number) => ipcRenderer.invoke('acrylic:set', alpha),

  // 系统电源操作
  powerAction: (action: 'shutdown' | 'restart' | 'sleep' | 'lock') => ipcRenderer.invoke('system:power', action),

  // 用户头像
  getUserAvatar: () => ipcRenderer.invoke('user:avatar-get'),
  selectUserAvatar: () => ipcRenderer.invoke('user:avatar-select'),
  saveUserAvatar: (base64Data: string) => ipcRenderer.invoke('user:avatar-save', base64Data),

  // 系统功能
  openControlPanel: () => ipcRenderer.invoke('system:open-control-panel'),
  openSystemSettings: () => ipcRenderer.invoke('system:open-settings'),

  // 悬浮启动按钮点击
  launcherClick: (displayId: number) => ipcRenderer.invoke('launcher:click', displayId),

  // 全局快捷键
  getShortcut: () => ipcRenderer.invoke('shortcuts:get'),
  setShortcut: (shortcut: string) => ipcRenderer.invoke('shortcuts:set', shortcut),

  // 图片选择
  selectImage: () => ipcRenderer.invoke('dialog:select-image'),
  selectSvg: () => ipcRenderer.invoke('dialog:select-svg'),
  readImageBase64: (filePath: string) => ipcRenderer.invoke('image:read-base64', filePath),
  saveImage: (base64Data: string, fileName: string) => ipcRenderer.invoke('image:save', base64Data, fileName),
  openWallpaperWindow: () => ipcRenderer.invoke('wallpaper:open'),
  notifyLayoutUpdated: () => ipcRenderer.invoke('layout:notify-updated'),

  // 事件监听
  onMenuOpen: (callback: () => void) => {
    ipcRenderer.on('menu:open', callback)
  },
  onMenuClose: (callback: () => void) => {
    ipcRenderer.on('menu:close', callback)
  },
  onLayoutUpdated: (callback: () => void) => {
    ipcRenderer.on('layout:updated', callback)
  },

  // 悬浮按钮编辑模式切换
  onLauncherEditMode: (callback: (editing: boolean) => void) => {
    ipcRenderer.on('launcher:edit-mode', (_event, editing: boolean) => callback(editing))
  }
})
