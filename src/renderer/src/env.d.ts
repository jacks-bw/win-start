/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ElectronAPI {
  getAppList: () => Promise<AppItem[]>
  launchApp: (lnkPath: string, args?: string) => Promise<{ success: boolean; error?: string }>
  showInFolder: (fullPath: string) => void
  uninstallProgram: () => void
  togglePin: (appId: string) => Promise<string[]>
  pinToTaskbar: (lnkPath: string) => Promise<{ success: boolean; error?: string }>
  saveTileLayout: (layout: unknown) => Promise<void>
  loadTileLayout: () => Promise<TileLayout>
  hideMenu: () => void
  getTheme: () => Promise<'light' | 'dark'>
  setTheme: (theme: 'light' | 'dark') => Promise<'light' | 'dark'>
  selectImage: () => Promise<string | null>
  readImageBase64: (filePath: string) => Promise<string | null>
  saveImage: (base64Data: string, fileName: string) => Promise<string | null>
  openWallpaperWindow: () => Promise<void>
  notifyLayoutUpdated: () => Promise<void>
  onMenuOpen: (callback: () => void) => void
  onMenuClose: (callback: () => void) => void
  onLayoutUpdated: (callback: () => void) => void
}

interface AppItem {
  id: string
  name: string
  lnkPath: string
  targetPath: string
  icon: string
  args?: string
  group: string
  pinned: boolean
  recentlyAdded: boolean
}

interface TileLayout {
  groups: TileGroup[]
}

interface TileGroup {
  id: string
  name: string
  tiles: TileItem[]
  background?: string
  backgroundCrop?: { x: number; y: number; width: number; height: number }
}

interface TileItem {
  id: string
  appId: string
  size: 'small' | 'medium' | 'wide' | 'large'
  liveEnabled: boolean
  position: number
  row: number
  col: number
  background?: string
  backgroundCrop?: { x: number; y: number; width: number; height: number }
  showIcon?: boolean
  showName?: boolean
  customIcon?: string // lucide icon 名称
  customIconImage?: string // 外部图标图片路径
  iconColor?: string // icon 颜色
  iconBgColor?: string // icon 圆角背景颜色
  iconOpacity?: number // icon 透明度 0-1
  nameColor?: string // 应用名称颜色
  contentAlign?: string // 内容对齐方式：top-left/top-center/top-right/center-left/center/center-right/bottom-left/bottom-center/bottom-right
}

interface Window {
  electronAPI: ElectronAPI
  openTileContextMenu: (x: number, y: number, tileId: string) => void
  openAppContextMenu: (x: number, y: number, app: AppItem) => void
  showInputDialog: (
    title: string,
    defaultValue: string,
    callback: (value: string) => void
  ) => void
  showConfirmDialog: (options: {
    title: string
    message?: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
    onConfirm: () => void
  }) => void
}
