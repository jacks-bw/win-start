import { Tray, Menu, nativeImage, app } from 'electron'
import path from 'path'
import type { WindowManager } from './window-manager'

let tray: Tray | null = null

// 获取图标路径（开发环境和打包后路径不同）
function getIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icons/icon.ico')
    : path.join(__dirname, '../../resources/icons/icon.ico')
}

export function createTray(windowManager: WindowManager): void {
  const iconPath = getIconPath()
  const icon = nativeImage.createFromPath(iconPath)
  console.log('[Tray] Icon path:', iconPath)
  console.log('[Tray] Icon isEmpty:', icon.isEmpty(), 'size:', icon.getSize())
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开开始菜单',
      click: () => windowManager.showStartMenu()
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        windowManager.getWindow()?.close()
        process.exit(0)
      }
    }
  ])

  tray.setToolTip('Win10 开始菜单')
  tray.setContextMenu(contextMenu)

  // 左键点击托盘图标切换开始菜单
  tray.on('click', () => {
    windowManager.toggleStartMenu()
  })
}

export function getTray(): Tray | null {
  return tray
}
