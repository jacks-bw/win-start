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
        result.push({
          id: a.id,
          name,
          path: a.path,
          icon: a.icon ? `data:image/png;base64,${a.icon}` : '',
          type: a.kind,
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
  hideStartMenu: () => invoke('hide_start_menu'),
  onAppsChanged: (cb: () => void) => { listen('apps-changed', () => cb()) },
  onMenuOpen: (cb: () => void) => { menuOpenCbs.push(cb) },
  onMenuClose: (cb: () => void) => { menuCloseCbs.push(cb) },
  onAccentColorChanged: (_cb: (c: string) => void) => {},
  onTileOpacityChanged: (_cb: (o: number) => void) => {},
  onTileBridgeUpdate: (_cb: (d: unknown) => void) => {},
  onTileBridgeClear: (_cb: (d: unknown) => void) => {},
  onLayoutUpdated: (_cb: () => void) => {},
  onMenuBlocked: (_cb: (b: boolean) => void) => {},
  getAccentColor: () => Promise.resolve('#f7630c'),
  getToolbarItems: () => Promise.resolve(['explorer', 'settings', 'controlPanel', 'recycleBin']),
  setToolbarItems: () => Promise.resolve(null),
  openToolbarItem: (key: string) => invoke('open_toolbar_item', { key }),
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
  getTileOpacity: () => Promise.resolve(0.9),
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

listen('tauri://focus', () => menuOpenCbs.forEach(cb => cb()))
// 不在 blur 时关闭内容：Rust 端失焦已自动 hide 整个窗口
setTimeout(() => menuOpenCbs.forEach(cb => cb()), 100)

export {}
