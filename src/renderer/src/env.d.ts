/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

type Api = typeof import('./tauri-bridge').desktopApi

interface ScannedApp {
  firstSeenAt?: number | null
  id: string
  name: string
  path: string
  type: 'win32' | 'packaged' | 'shell'
  icon: string
}
interface AppSettings {
  tileBridgeEnabled: boolean
  toolbarItems: string[]
  hotkey: string
  tileOpacity: number
  includeWallpaperOpacity: boolean
  themeColor: string | null
  highlightColor: string | null
  wallpaperPath: string | null
  wallpaperDarken: number
  panelAlpha: number
  tileBlur: number
}
interface AvatarCrop {
  x: number
  y: number
  scale: number
  imgW: number
  imgH: number
  cropSize: number
}
interface AvatarInfo {
  path: string
  url?: string
  cropX?: number | null
  cropY?: number | null
  scale?: number | null
  imgW?: number | null
  imgH?: number | null
  cropSize?: number | null
}
interface TileBridgeStatus {
  enabled: boolean
  running: boolean
  address: string
  error: string | null
}
interface TileBridgeSnapshot {
  revision: number
  entries: Record<string, TileBridgeData>
}
interface TileBridgeData {
  appId: string
  title?: string | null
  body?: string | null
  icon?: string | null
  count?: number | null
  timestamp?: number
}

interface AppScanResult {
  apps: AppItem[]
  complete: boolean
  warnings: string[]
}

interface AppItem {
  id: string
  name: string
  lnkPath: string
  targetPath: string
  icon: string
  path?: string
  type?: 'win32' | 'packaged' | 'shell'
  pinyin?: string
  pinyinInitials?: string
  args?: string
  group: string
  pinned: boolean
  firstSeenAt?: number | null
  recentlyAdded: boolean
  folderId?: string // 所属文件夹ID
  launchTarget?: { kind: 'path' | 'shell'; value: string }
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
  groupId?: string // Derived by allTiles; not part of a tile's stored identity.
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
  api: Api
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
