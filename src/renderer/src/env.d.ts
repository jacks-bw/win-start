/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ElectronAPI {
  getAppList: () => Promise<AppItem[]>
  launchApp: (lnkPath: string, args?: string) => Promise<{ success: boolean; error?: string }>
  launchUwpApp: (appId: string) => Promise<{ success: boolean; error?: string }>
  showInFolder: (fullPath: string) => void
  uninstallProgram: () => void
  togglePin: (appId: string) => Promise<string[]>
  pinToTaskbar: (lnkPath: string) => Promise<{ success: boolean; error?: string }>
  saveTileLayout: (layout: unknown) => Promise<void>
  loadTileLayout: () => Promise<TileLayout>
  hideMenu: () => void
  setResizeBlocked: (blocked: boolean) => Promise<void>
  setMenuBusy: (busy: boolean) => void
  getTheme: () => Promise<'light' | 'dark'>
  setTheme: (theme: 'light' | 'dark') => Promise<'light' | 'dark'>
  selectImage: () => Promise<string | null>
  selectSvg: () => Promise<string | null>
  readImageBase64: (filePath: string) => Promise<string | null>
  saveImage: (base64Data: string, fileName: string) => Promise<string | null>
  openTileStyleWindow: (tileId: string) => Promise<void>
  getTileStyleTarget: () => Promise<string | null>
  onTileStyleSelect: (callback: (tileId: string) => void) => void
  onMenuBlocked: (callback: (blocked: boolean) => void) => void
  closeTileStyleWindow: () => Promise<void>
  openGroupStyleWindow: (groupId: string) => Promise<void>
  getGroupStyleTarget: () => Promise<string | null>
  closeGroupStyleWindow: () => Promise<void>
  notifyLayoutUpdated: () => Promise<void>
  onMenuOpen: (callback: () => void) => void
  onMenuClose: (callback: () => void) => void
  onLayoutUpdated: (callback: () => void) => void
  onAppsChanged: (callback: () => void) => void
  getToolbarItems: () => Promise<string[]>
  setToolbarItems: (items: string[]) => Promise<string[]>
  openToolbarItem: (key: string) => Promise<void>
  // 通用设置
  getSettings: () => Promise<{
    hotkey?: string
    tileOpacity?: number
    includeWallpaperOpacity?: boolean
    themeColor?: string | null
    highlightColor?: string | null
    wallpaperPath?: string | null
    wallpaperDarken?: number
    panelAlpha?: number
  }>
  setHotkey: (hotkey: string) => Promise<void>
  getTileOpacity: () => Promise<number>
  setTileOpacity: (opacity: number) => Promise<number>
  setIncludeWallpaperOpacity: (enable: boolean) => Promise<void>
  onTileOpacityChanged: (callback: (opacity: number) => void) => void
  onIncludeWallpaperChanged: (callback: (include: boolean) => void) => void
  setThemeColor: (color: string | null) => Promise<void>
  setHighlightColor: (color: string | null) => Promise<void>
  getAccentColor: () => Promise<string>
  onAccentColorChanged: (callback: (color: string) => void) => void
  getAutostart: () => Promise<boolean>
  setAutostart: (enable: boolean) => Promise<boolean>
  openSettingsWindow: () => Promise<void>
  closeSettingsWindow: () => Promise<void>
  setWallpaper: (path: string) => Promise<string>
  clearWallpaper: () => Promise<void>
  setWallpaperDarken: (v: number) => Promise<number>
  onWallpaperChanged: (callback: (path: string | null) => void) => void
  onWallpaperDarkenChanged: (callback: (v: number) => void) => void
  setPanelAlpha: (v: number) => Promise<number>
  onPanelAlphaChanged: (callback: (v: number) => void) => void
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
  folderId?: string // 所属文件夹ID
  uwp?: boolean
  uwpAppId?: string
}

interface AppFolder {
  id: string
  name: string
  appIds: string[] // 文件夹里的应用ID
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
  backgroundTiles?: string[] // 设置组背景时已存在的磁贴 id 快照；之后新增的磁贴不自动继承组背景
}

interface TileItem {
  id: string
  appId: string
  size: 'small' | 'medium' | 'wide'
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
  openGroupContextMenu: (x: number, y: number, groupId: string) => void
  openImageCrop: (
    imageUrl: string,
    targetRatio: number,
    callback: (dataUrl: string) => void
  ) => void
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
