// One concrete, typed desktop API. Unknown methods are undefined rather than
// silently succeeding; env.d.ts derives Window.api from this implementation.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import pinyin from 'pinyin'
import { isRecentlyDiscovered } from './utils/recent-apps'

export type Unsubscribe = () => void
interface Transport {
  invoke: typeof invoke
  listen: typeof listen
  closeCurrentWindow: () => Promise<void>
}
const native: Transport = { invoke, listen, closeCurrentWindow: () => getCurrentWindow().close() }

function errorOf(error: unknown): Error {
  return error instanceof Error ? error : new Error((typeof error === 'string' ? error : JSON.stringify(error)) || '桌面操作失败')
}

export function createDesktopApi(transport: Transport = native) {
  const errors = new Set<(error: Error) => void>()
  function report(error: unknown) {
    const normalized = errorOf(error)
    console.error('[desktop-api]', normalized)
    errors.forEach(callback => callback(normalized))
  }
  async function command<T = void>(name: string, args?: Record<string, unknown>): Promise<T> {
    try { return await transport.invoke<T>(name, args) }
    catch (error) { throw errorOf(error) }
  }
  function subscribe<T>(name: string, callback: (payload: T) => void, initial?: () => Promise<T>): Unsubscribe {
    let disposed = false
    let unlisten: Unsubscribe | undefined
    transport.listen<T>(name, event => { if (!disposed) callback(event.payload) })
      .then(async stop => {
        if (disposed) { stop(); return }
        unlisten = stop
        if (initial) {
          const payload = await initial()
          if (!disposed) callback(payload)
        }
      })
      .catch(report)
    return () => { disposed = true; unlisten?.(); unlisten = undefined }
  }
  function unsupported(feature: string): Promise<never> {
    return Promise.reject(new Error(`${feature}尚未支持`))
  }
  async function getAppScan(): Promise<AppScanResult> {
    const scan = await command<{ apps: ScannedApp[]; complete: boolean; warnings: string[] }>('scan_apps')
    const seen = new Set<string>()
    const apps: AppItem[] = []
    for (const entry of scan.apps) {
      const name = entry.name.trim()
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      const isShortcut = entry.type === 'win32'
      const syllables = pinyin(name, { style: pinyin.STYLE_NORMAL, heteronym: false })
      const initials = pinyin(name, { style: pinyin.STYLE_FIRST_LETTER })
        .map(part => (part[0] || '').toLowerCase()).join('')
      const first = name.charAt(0)
      const group = /[a-z]/i.test(first) ? first.toUpperCase()
        : /[\u4e00-\u9fa5]/.test(first) && /^[a-z]/i.test(initials) ? initials[0].toUpperCase() : '#'
      apps.push({
        firstSeenAt: entry.firstSeenAt ?? null,
        id: entry.id, name, path: entry.path, type: entry.type,
        icon: entry.icon ? `data:image/png;base64,${entry.icon}` : '',
        lnkPath: isShortcut ? entry.path : '', targetPath: '',
        launchTarget: { kind: isShortcut ? 'path' : 'shell', value: entry.path },
        pinned: false, recentlyAdded: isRecentlyDiscovered(entry.firstSeenAt, Date.now()), group,
        pinyin: syllables.map(part => (part[0] || '').toLowerCase()).join(' '),
        pinyinInitials: initials
      })
    }
    return { apps, complete: scan.complete, warnings: scan.warnings }
  }
  async function readAvatar(name: string): Promise<AvatarInfo | null> {
    const info = await command<AvatarInfo | null>(name)
    if (!info) return null
    return { ...info, url: await command<string>('read_file_base64', { path: info.path }) }
  }
  async function saveCrop(name: string, args: Record<string, unknown>) {
    await command(name, args)
    // The returned promise includes window closure, so failure is observable.
    await transport.closeCurrentWindow()
  }
  return Object.freeze({
    capabilities: Object.freeze({ toolbarCustomization: true, taskbarPinning: false, taskbarPinningGuide: true, powerActions: true, tileBridge: true }),
    onBridgeError: (callback: (error: Error) => void): Unsubscribe => {
      errors.add(callback)
      return () => { errors.delete(callback) }
    },
    getAppScan,
    getAppList: async () => (await getAppScan()).apps,
    showStartMenu: () => command('show_start_menu'),
    menuReady: () => command('menu_ready'),
    hideStartMenu: () => command('hide_start_menu'),
    hideMenu: () => command('hide_start_menu'),
    setResizeBlocked: (blocked: boolean) => command('set_resize_blocked', { blocked }),
    setMenuBusy: (busy: boolean) => command('set_menu_busy', { busy }),
    setWallpaper: (path: string) => command<string>('set_wallpaper', { path }),
    clearWallpaper: () => command('clear_wallpaper'),
    setWallpaperDarken: (v: number) => command<number>('set_wallpaper_darken', { v }),
    setPanelAlpha: (v: number) => command<number>('set_panel_alpha', { v }),
    setTileBlur: (v: number) => command<number>('set_tile_blur', { v }),
    onTileBlurChanged: (cb: (v: number) => void) => subscribe('tile-blur-changed', cb),
    onPanelAlphaChanged: (cb: (v: number) => void) => subscribe('panel-alpha-changed', cb),
    onWallpaperChanged: (cb: (path: string | null) => void) => subscribe('wallpaper-changed', cb),
    onWallpaperDarkenChanged: (cb: (v: number) => void) => subscribe('wallpaper-darken-changed', cb),
    onAppsChanged: (cb: () => void) => subscribe('apps-changed', cb),
    onMenuOpen: (cb: () => void): Unsubscribe => {
      const stopOpen = subscribe('menu-open', cb)
      const stopFocus = subscribe('tauri://focus', cb)
      return () => { stopOpen(); stopFocus() }
    },
    onMenuClose: (cb: () => void) => subscribe('menu-close', cb),
    onTileOpacityChanged: (cb: (v: number) => void) => subscribe('tile-opacity-changed', cb),
    getTileBridgeStatus: () => command<TileBridgeStatus>('get_tile_bridge_status'),
    getTileBridgeSnapshot: () => command<TileBridgeSnapshot>('get_tile_bridge_snapshot'),
    setTileBridgeEnabled: (enabled: boolean) => command<TileBridgeStatus>('set_tile_bridge_enabled', { enabled }),
    onTileBridgeSnapshot: (cb: (snapshot: TileBridgeSnapshot) => void) => subscribe('tile-bridge-snapshot', cb, () => command<TileBridgeSnapshot>('get_tile_bridge_snapshot')),
    onTileBridgeStatus: (cb: (status: TileBridgeStatus) => void) => subscribe('tile-bridge-status', cb),
    onLayoutUpdated: (cb: () => void) => subscribe('layout-updated', cb),
    onMenuBlocked: (cb: (blocked: boolean) => void) => subscribe('menu-blocked', cb),
    getAccentColor: () => command<string>('get_accent_color'),
    getToolbarItems: () => command<string[]>('get_toolbar_items'),
    setToolbarItems: (items: string[]) => command<string[]>('set_toolbar_items', { items }),
    onToolbarItemsChanged: (cb: (items: string[]) => void) => subscribe('toolbar-items-changed', cb),
    openTaskbarPinningGuide: (path: string | null) => command('open_taskbar_pinning_guide', { path }),
    pinToTaskbar: (_path: string) => unsupported('固定到任务栏'),
    powerAction: (action: 'shutdown' | 'restart' | 'sleep' | 'lock') => command('power_action', { action }),
    openToolbarItem: (key: string) => command('open_toolbar_item', { key }),
    launchApp: (path: string) => command('launch_app', { path }),
    launchShellApp: (appId: string) => command('launch_shell_app', { appId }),
    showInFolder: (path: string) => command('show_in_folder', { path }),
    uninstallProgram: () => command('uninstall_program'),
    getUserAvatar: () => readAvatar('get_user_avatar'),
    getStagedAvatar: () => readAvatar('get_staged_avatar'),
    selectUserAvatar: () => command<string | null>('select_user_avatar'),
    openAvatarSettingsWindow: () => command('open_avatar_settings_window'),
    closeAvatarSettings: () => command('close_avatar_settings_window'),
    commitAvatar: (clear: boolean) => command('commit_avatar', { clear }),
    discardStagedAvatar: () => command('discard_staged_avatar'),
    onAvatarStaged: (cb: () => void) => subscribe('avatar-staged', cb),
    onAvatarUpdated: (cb: () => void) => subscribe('avatar:updated', cb),
    getCropImage: async () => {
      const path = await command<string>('get_crop_image')
      return path ? command<string>('read_file_base64', { path }) : ''
    },
    cancelCrop: () => command('close_avatar_crop_window'),
    confirmCrop: (base64: string) => saveCrop('stage_cropped_avatar', { base64 }),
    saveGifAvatar: (dataUrl: string, crop: AvatarCrop) => saveCrop('stage_gif_avatar', { dataUrl, crop }),
    getTileOpacity: () => command<number>('get_tile_opacity'),
    setTileOpacity: (opacity: number) => command<number>('set_tile_opacity', { opacity }),
    setIncludeWallpaperOpacity: (enable: boolean) => command('set_include_wallpaper_opacity', { enable }),
    onThemeColorChanged: (cb: (color: string | null) => void) => subscribe('theme-color-changed', cb),
    onHighlightColorChanged: (cb: (color: string | null) => void) => subscribe('highlight-color-changed', cb),
    setThemeColor: (color: string | null) => command('set_theme_color', { color }),
    setHighlightColor: (color: string | null) => command('set_highlight_color', { color }),
    onIncludeWallpaperChanged: (cb: (v: boolean) => void) => subscribe('tile-opacity-include-changed', cb),
    getSettings: () => command<AppSettings>('get_settings'),
    setHotkey: (hotkey: string) => command('set_hotkey', { hotkey }),
    getAutostart: () => command<boolean>('get_autostart'),
    setAutostart: (enable: boolean) => command('set_autostart', { enable }),
    openSettingsWindow: () => command('open_settings_window'),
    closeSettingsWindow: () => command('close_settings_window'),
    loadTileLayout: () => command<TileLayout>('load_tile_layout'),
    saveTileLayout: (layout: TileLayout, base: TileLayout) => command<TileLayout>('save_tile_layout', { layout, base }),
    selectImage: () => command<string | null>('select_image'),
    selectSvg: () => command<string | null>('select_svg'),
    readImageBase64: (path: string) => command<string>('read_image_base64', { path }),
    saveImage: (base64: string, fileName: string) => command<string>('save_image', { base64, fileName }),
    openTileStyleWindow: (tileId: string) => command('open_tile_style_window', { tileId }),
    getTileStyleTarget: () => command<string>('get_tile_style_target'),
    closeTileStyleWindow: () => command('close_tile_style_window'),
    onTileStyleSelect: (cb: (id: string) => void) => subscribe('tile-style:select', cb),
    openGroupStyleWindow: (groupId: string) => command('open_group_style_window', { groupId }),
    getGroupStyleTarget: () => command<string>('get_group_style_target'),
    onGroupStyleSelect: (cb: (id: string) => void) => subscribe('group-style:select', cb),
    closeGroupStyleWindow: () => command('close_group_style_window'),
    notifyLayoutUpdated: () => command('notify_layout_updated')
  })
}

export const desktopApi = createDesktopApi()
if (typeof window !== 'undefined') window.api = desktopApi
