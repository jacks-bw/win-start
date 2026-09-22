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

  // 图片选择
  selectImage: () => ipcRenderer.invoke('dialog:select-image'),
  readImageBase64: (filePath: string) => ipcRenderer.invoke('image:read-base64', filePath),
  saveImage: (base64Data: string, fileName: string) => ipcRenderer.invoke('image:save', base64Data, fileName),
  openWallpaperWindow: () => ipcRenderer.invoke('wallpaper:open'),

  // 事件监听
  onMenuOpen: (callback: () => void) => {
    ipcRenderer.on('menu:open', callback)
  },
  onMenuClose: (callback: () => void) => {
    ipcRenderer.on('menu:close', callback)
  }
})
