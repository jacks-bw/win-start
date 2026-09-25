import { Tray, Menu, nativeImage, app, screen } from 'electron'
import path from 'path'
import type { WindowManager } from './window-manager'
import type { LaunchButtonManager } from './launch-button-manager'

let tray: Tray | null = null

// 获取图标路径（开发环境和打包后路径不同）
function getIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icons/icon.ico')
    : path.join(__dirname, '../../resources/icons/icon.ico')
}

export function createTray(
  windowManager: WindowManager,
  launchButtonManager?: LaunchButtonManager
): void {
  const iconPath = getIconPath()
  const icon = nativeImage.createFromPath(iconPath)
  console.log('[Tray] Icon path:', iconPath)
  console.log('[Tray] Icon isEmpty:', icon.isEmpty(), 'size:', icon.getSize())
  tray = new Tray(icon)

  const buildMenu = () => {
    const editMode = launchButtonManager?.isEditMode() ?? false
    return Menu.buildFromTemplate([
      {
        label: '打开开始菜单',
        click: () => windowManager.showStartMenu()
      },
      {
        type: 'separator'
      },
      {
        label: editMode ? '完成编辑按钮' : '编辑按钮位置',
        type: 'checkbox' as const,
        checked: editMode,
        click: () => {
          if (!launchButtonManager) return
          const next = !launchButtonManager.isEditMode()
          launchButtonManager.setEditMode(next)
        }
      },
      {
        label: '快捷键设置',
        click: () => windowManager.showShortcutsWindow()
      },
      {
        label: '自定义壁纸',
        click: () => windowManager.showWallpaperWindow()
      },
      {
        label: app.isPackaged ? '开机自启' : '开机自启（打包后可用）',
        type: 'checkbox' as const,
        checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
        enabled: app.isPackaged,
        click: () => {
          if (!app.isPackaged) return
          const current = app.getLoginItemSettings().openAtLogin
          app.setLoginItemSettings({
            openAtLogin: !current,
            path: process.execPath
          })
        }
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
  }

  tray.setToolTip('Win10 开始菜单')

  // 右键手动弹出菜单：使用tray.popUpContextMenu自动处理多屏幕位置
  tray.on('right-click', () => {
    if (!tray) return
    const menu = buildMenu()

    // 临时降低悬浮按钮层级，避免遮挡托盘菜单
    launchButtonManager?.setAllButtonsAlwaysOnTop(false)

    // 菜单关闭后恢复按钮置顶
    menu.once('menu-will-close', () => {
      setTimeout(() => {
        launchButtonManager?.setAllButtonsAlwaysOnTop(true)
      }, 100)
    })

    // 使用托盘自带的弹出方法，自动处理多屏幕位置
    tray.popUpContextMenu(menu)
  })

  // 左键点击托盘图标切换开始菜单
  tray.on('click', () => {
    windowManager.toggleStartMenu()
  })
}

export function getTray(): Tray | null {
  return tray
}
