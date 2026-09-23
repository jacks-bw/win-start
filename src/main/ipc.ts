import { ipcMain, dialog, app, globalShortcut } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { extname, join } from 'path'
import { exec } from 'child_process'
import type { WindowManager } from './window-manager'
import { scanStartMenu } from './scanner'
import { launchApp, showInFolder, uninstallProgram } from './launcher'
import type Store from 'electron-store'

import type { LaunchButtonManager } from './launch-button-manager'

export function setupIpc(
  windowManager: WindowManager,
  store: Store<any>,
  launchButtonManager?: LaunchButtonManager
): void {
  // 扫描程序列表
  ipcMain.handle('app:list', async () => {
    const apps = await scanStartMenu()
    // 标记已固定的程序
    const pinnedApps = store.get('pinnedApps', []) as string[]
    const recentApps = store.get('recentApps', []) as string[]

    return apps.map((app) => ({
      ...app,
      pinned: pinnedApps.includes(app.id),
      recentlyAdded: recentApps.includes(app.id)
    }))
  })

  // 启动程序
  ipcMain.handle('app:launch', async (_event, lnkPath: string, args?: string) => {
    try {
      await launchApp(lnkPath, args)
      // 启动后自动隐藏开始菜单
      windowManager.hideStartMenu()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // 显示文件所在位置
  ipcMain.handle('app:show-in-folder', (_event, fullPath: string) => {
    showInFolder(fullPath)
  })

  // 卸载程序
  ipcMain.handle('app:uninstall', () => {
    uninstallProgram()
  })

  // 固定到任务栏
  ipcMain.handle('app:pin-taskbar', async (_event, lnkPath: string) => {
    try {
      const { exec } = await import('child_process')
      // 使用 PowerShell 通过 Shell 对象固定到任务栏
      const script = `
        $shell = New-Object -ComObject Shell.Application
        $folder = $shell.Namespace('${require('path').dirname(lnkPath)}')
        $item = $folder.ParseName('${require('path').basename(lnkPath)}')
        $item.InvokeVerb('taskbarpin')
      `
      exec(`powershell -Command "${script.replace(/"/g, '\\"')}"`)
      return { success: true }
    } catch (err) {
      console.error('固定到任务栏失败:', err)
      return { success: false, error: String(err) }
    }
  })

  // 固定/取消固定程序到开始菜单
  ipcMain.handle('app:toggle-pin', (_event, appId: string) => {
    const pinnedApps = store.get('pinnedApps', []) as string[]
    const idx = pinnedApps.indexOf(appId)
    if (idx >= 0) {
      pinnedApps.splice(idx, 1)
    } else {
      pinnedApps.push(appId)
    }
    store.set('pinnedApps', pinnedApps)
    return pinnedApps
  })

  // 保存磁贴布局
  ipcMain.handle('tile:layout-save', (_event, layout: unknown) => {
    store.set('tileLayout', layout)
  })

  // 加载磁贴布局
  ipcMain.handle('tile:layout-load', () => {
    return store.get('tileLayout')
  })

  // 隐藏开始菜单
  ipcMain.handle('menu:hide', () => {
    windowManager.hideStartMenu()
  })

  // 获取主题
  ipcMain.handle('theme:get', () => {
    return store.get('theme', 'dark')
  })

  // 设置主题
  ipcMain.handle('theme:set', (_event, theme: 'light' | 'dark') => {
    store.set('theme', theme)
    return theme
  })

  // 获取背景透明度（0-100，默认0）
  ipcMain.handle('opacity:get', () => {
    return store.get('opacity', 0)
  })

  // 设置背景透明度
  ipcMain.handle('opacity:set', (_event, opacity: number) => {
    const clamped = Math.max(0, Math.min(100, opacity))
    store.set('opacity', clamped)
    return clamped
  })

  // 设置 Acrylic 透明度（0-255）
  ipcMain.handle('acrylic:set', (_event, alpha: number) => {
    windowManager.setAcrylicAlpha(alpha)
    return alpha
  })

  // 选择图片
  ipcMain.handle('dialog:select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // 选择 SVG 图标
  ipcMain.handle('dialog:select-svg', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'SVG 图标', extensions: ['svg'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // 读取图片并转 base64
  ipcMain.handle('image:read-base64', async (_event, filePath: string) => {
    try {
      const ext = extname(filePath).toLowerCase().replace('.', '')
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        bmp: 'image/bmp',
        webp: 'image/webp'
      }
      const mime = mimeMap[ext] || 'image/png'
      const data = readFileSync(filePath)
      return `data:${mime};base64,${data.toString('base64')}`
    } catch (err) {
      console.error('读取图片失败:', err)
      return null
    }
  })

  // 保存 base64 图片到用户数据目录，返回文件路径
  ipcMain.handle('image:save', async (_event, base64Data: string, fileName: string) => {
    try {
      const userDataPath = app.getPath('userData')
      const tileBgDir = join(userDataPath, 'tile-backgrounds')
      mkdirSync(tileBgDir, { recursive: true })

      // 解析 base64
      const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/)
      if (!matches) return null
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
      const data = Buffer.from(matches[2], 'base64')

      const filePath = join(tileBgDir, `${fileName}.${ext}`)
      writeFileSync(filePath, data)
      return filePath
    } catch (err) {
      console.error('保存图片失败:', err)
      return null
    }
  })

  // 打开壁纸设置窗口
  ipcMain.handle('wallpaper:open', () => {
    windowManager.showWallpaperWindow()
  })

  // 通知开始菜单窗口布局已更新
  ipcMain.handle('layout:notify-updated', () => {
    windowManager.notifyLayoutUpdated()
  })

  // 系统电源操作：shutdown / restart / sleep / lock
  ipcMain.handle('system:power', (_event, action: 'shutdown' | 'restart' | 'sleep' | 'lock') => {
    const commands: Record<string, string> = {
      shutdown: 'shutdown /s /t 0',
      restart: 'shutdown /r /t 0',
      sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
      lock: 'rundll32.exe user32.dll,LockWorkStation'
    }
    const cmd = commands[action]
    if (!cmd) return
    exec(cmd, (error) => {
      if (error) console.error(`[Power] ${action} failed:`, error.message)
    })
  })

  // 悬浮启动按钮点击
  ipcMain.handle('launcher:click', (_event, displayId: number) => {
    launchButtonManager?.handleButtonClick(displayId)
  })

  // 获取当前全局快捷键
  ipcMain.handle('shortcuts:get', () => {
    return store.get('globalShortcut', 'Alt+Space')
  })

  // 设置全局快捷键
  ipcMain.handle('shortcuts:set', (_event, shortcut: string) => {
    const oldShortcut = store.get('globalShortcut', 'Alt+Space') as string
    // 先取消旧快捷键
    globalShortcut.unregister(oldShortcut)
    // 注册新快捷键
    const success = globalShortcut.register(shortcut, () => {
      windowManager.toggleStartMenu()
    })
    if (success) {
      store.set('globalShortcut', shortcut)
      console.log('[Shortcuts] Registered:', shortcut)
    } else {
      console.error('[Shortcuts] Failed to register:', shortcut)
      // 注册失败，恢复旧快捷键
      globalShortcut.register(oldShortcut, () => {
        windowManager.toggleStartMenu()
      })
    }
    return success
  })
}
