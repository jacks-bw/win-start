// Tauri 渲染层 IPC 适配

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import pinyin from 'pinyin'

function groupOf(name: string): string {
  const ch = name.trim().charAt(0)
  if (/[A-Za-z]/.test(ch)) return ch.toUpperCase()
  // 中文取拼音首字母
  if (/[\u4e00-\u9fa5]/.test(ch)) {
    const py = pinyin(ch, { style: pinyin.STYLE_FIRST_LETTER })
    const first = py?.[0]?.[0]?.toUpperCase()
    if (first && /[A-Z]/.test(first)) return first
  }
  return '#'
}

function fullPinyin(name: string): string {
  const py = pinyin(name, { style: pinyin.STYLE_NORMAL, heteronym: false })
  return (py || []).map((p: string[]) => (p[0] || '').toLowerCase()).join(' ')
}

function initialsPinyin(name: string): string {
  const py = pinyin(name, { style: pinyin.STYLE_FIRST_LETTER })
  return (py || []).map((p: string[]) => (p[0] || '').toLowerCase()).join('')
}

const menuOpenCbs: Array<() => void> = []
const menuCloseCbs: Array<() => void> = []

const real = {
  // 应用列表：返回空数组，字段对齐 AppItem
  getAppList: async () => {
    try {
      const apps = await invoke<any[]>('scan_apps')
      const seen = new Set<string>()
      const result: any[] = []
      for (const a of apps) {
        const name: string = (a.name || '').trim()
        if (!name || seen.has(name.toLowerCase())) continue
        seen.add(name.toLowerCase())
        const isUwp = (a.kind ?? a.type) === 'uwp'
        result.push({
          id: a.id,
          name,
          path: a.path,
          icon: a.icon ? `data:image/png;base64,${a.icon}` : '',
          type: a.kind ?? a.type,
          lnkPath: isUwp ? '' : a.path,
          uwp: isUwp,
          uwpAppId: isUwp ? a.path : '',
          pinned: false,
          folderId: null,
          recentlyAdded: false,
          group: groupOf(name),
          pinyin: fullPinyin(name),
          pinyinInitials: initialsPinyin(name)
        })
      }
      return result
    } catch (e) {
      console.error('scan_apps failed', e)
      return []
    }
  },
  scanApps: () => invoke('scan_apps'),
  showStartMenu: () => invoke('show_start_menu'),
  menuReady: () => invoke('menu_ready'),
  hideStartMenu: () => invoke('hide_start_menu'),
  onAppsChanged: (cb: () => void) => { listen('apps-changed', () => cb()) },
  onMenuOpen: (cb: () => void) => { menuOpenCbs.push(cb) },
  onMenuClose: (cb: () => void) => { menuCloseCbs.push(cb) },
  onAccentColorChanged: (_cb: (c: string) => void) => {},
  onTileOpacityChanged: (cb: (o: number) => void) => { listen('tile-opacity-changed', (e: any) => cb(e.payload)) },
  onTileBridgeUpdate: (_cb: (d: unknown) => void) => {},
  onTileBridgeClear: (_cb: (d: unknown) => void) => {},
  onLayoutUpdated: (cb: () => void) => { listen('layout-updated', () => cb()) },
  onMenuBlocked: (cb: (b: boolean) => void) => { listen('menu-blocked', (e: any) => cb(!!e.payload)) },
  getAccentColor: () => invoke<string>('get_accent_color'),
  getToolbarItems: () => Promise.resolve(['explorer', 'settings', 'controlPanel', 'recycleBin']),
  setToolbarItems: () => Promise.resolve(null),
  openToolbarItem: (key: string) => invoke('open_toolbar_item', { key }),
  launchApp: (lnkPath: string) => invoke('launch_app', { path: lnkPath }),
  launchUwpApp: (appId: string) => invoke('launch_uwp', { appId }),
  showInFolder: (path: string) => invoke('show_in_folder', { path }),
  uninstallProgram: () => invoke('uninstall_program'),
  powerAction: () => Promise.resolve(null),
  getUserAvatar: async () => {
    const info = await invoke<{path:string, cropX?:number, cropY?:number, scale?:number, imgW?:number, imgH?:number} | null>('get_user_avatar')
    if (!info) return null
    try {
      const url = await invoke<string>('read_file_base64', { path: info.path })
      return { ...info, url }
    } catch { return info }
  },
  selectUserAvatar: () => invoke<string | null>('select_user_avatar'),
  openAvatarCropWindow: () => Promise.resolve(null),
  setGifAvatar: (path: string) => invoke<string | null>('set_user_avatar', { path }),
  onAvatarUpdated: (cb: () => void) => { listen('avatar:updated', () => cb()) },
  getCropImage: async () => {
    try {
      const path = await invoke<string>('get_crop_image')
      console.log('[crop] path:', path)
      if (!path) return ''
      const data = await invoke<string>('read_file_base64', { path })
      return data
    } catch (e) {
      console.error('[crop] failed:', e)
      return ''
    }
  },
  cancelCrop: () => { import('@tauri-apps/api/window').then(m => m.getCurrentWindow().close()) },
  confirmCrop: (base64: string) => invoke('save_cropped_avatar', { base64 }).then(() => { import('@tauri-apps/api/window').then(m => m.getCurrentWindow().close()) }),
  saveGifAvatar: (dataUrl: string, crop: any) => invoke('save_gif_avatar', { dataUrl, crop }).then(() => { import('@tauri-apps/api/window').then(m => m.getCurrentWindow().close()) }),
  getListAlpha: () => Promise.resolve(0.4),
  getTileOpacity: () => invoke<number>('get_tile_opacity'),
  setTileOpacity: (opacity: number) => invoke<number>('set_tile_opacity', { opacity }),
  setIncludeWallpaperOpacity: (enable: boolean) => invoke('set_include_wallpaper_opacity', { enable }),
  setThemeColor: (color: string | null) => invoke('set_theme_color', { color }),
  setHighlightColor: (color: string | null) => invoke('set_highlight_color', { color }),
  onIncludeWallpaperChanged: (cb: (v: boolean) => void) => { listen('tile-opacity-include-changed', (e: any) => cb(!!e.payload)) },
  // 通用设置
  getSettings: () => invoke<any>('get_settings'),
  setHotkey: (hotkey: string) => invoke('set_hotkey', { hotkey }),
  getAutostart: () => invoke<boolean>('get_autostart'),
  setAutostart: (enable: boolean) => invoke('set_autostart', { enable }),
  openSettingsWindow: () => invoke('open_settings_window'),
  closeSettingsWindow: () => invoke('close_settings_window'),
  // 磁贴布局持久化
  loadTileLayout: () => invoke('load_tile_layout'),
  saveTileLayout: (layout: unknown) => invoke('save_tile_layout', { layout }),
  // 背景图片
  selectImage: () => invoke<string | null>('select_image'),
  selectSvg: () => invoke<string | null>('select_svg'),
  readImageBase64: (path: string) => invoke<string>('read_image_base64', { path }),
  saveImage: (base64: string, fileName: string) => invoke<string>('save_image', { base64, fileName }),
  // 磁贴样式窗口
  openTileStyleWindow: (tileId: string) => invoke('open_tile_style_window', { tileId }),
  getTileStyleTarget: () => invoke<string>('get_tile_style_target'),
  closeTileStyleWindow: () => invoke('close_tile_style_window'),
  onTileStyleSelect: (cb: (id: string) => void) => { listen('tile-style:select', (e: any) => cb(e.payload)) },
  // 分组背景窗口
  openGroupStyleWindow: (groupId: string) => invoke('open_group_style_window', { groupId }),
  getGroupStyleTarget: () => invoke<string>('get_group_style_target'),
  closeGroupStyleWindow: () => invoke('close_group_style_window'),
  notifyLayoutUpdated: () => invoke('notify_layout_updated'),
  hideMenu: () => invoke('hide_start_menu'),
  setMenuBusy: (_b: boolean) => {},
}

const electronAPI = new Proxy(real as any, {
  get(target, prop: string) {
    if (prop in target) return (target as any)[prop]
    return (..._args: any[]) => Promise.resolve(null)
  }
})

// @ts-expect-error
window.electronAPI = electronAPI

// Rust 显式事件（可靠）
listen('menu-open', () => menuOpenCbs.forEach(cb => cb()))
listen('menu-close', () => menuCloseCbs.forEach(cb => cb()))
// 兜底：聚焦也视为打开
listen('tauri://focus', () => menuOpenCbs.forEach(cb => cb()))

export {}
