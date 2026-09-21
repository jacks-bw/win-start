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
  saveTileLayout: (layout: unknown) => Promise<void>
  loadTileLayout: () => Promise<TileLayout>
  hideMenu: () => void
  getTheme: () => Promise<'light' | 'dark'>
  setTheme: (theme: 'light' | 'dark') => Promise<'light' | 'dark'>
  onMenuOpen: (callback: () => void) => void
  onMenuClose: (callback: () => void) => void
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
}

interface TileItem {
  id: string
  appId: string
  size: 'small' | 'medium' | 'wide' | 'large'
  liveEnabled: boolean
  position: number
}

interface Window {
  electronAPI: ElectronAPI
  openTileContextMenu: (x: number, y: number, tileId: string) => void
  showInputDialog: (
    title: string,
    defaultValue: string,
    callback: (value: string) => void
  ) => void
}
