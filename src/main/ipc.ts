import { ipcMain, dialog } from 'electron'
import type { WindowManager } from './window-manager'
import { scanStartMenu } from './scanner'
import { launchApp, showInFolder, uninstallProgram } from './launcher'
import type Store from 'electron-store'

export function setupIpc(windowManager: WindowManager, store: Store<any>): void {
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
}
