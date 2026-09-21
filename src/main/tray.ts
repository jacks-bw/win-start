import { Tray, Menu, nativeImage } from 'electron'
import type { WindowManager } from './window-manager'

let tray: Tray | null = null

export function createTray(windowManager: WindowManager): void {
  // 使用一个 16x16 的透明图标作为占位
  const icon = nativeImage.createEmpty()
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
