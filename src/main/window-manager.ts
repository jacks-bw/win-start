import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import type Store from 'electron-store'
import { setAcrylicEffect } from './acrylic'

// 获取图标路径（开发环境和打包后路径不同）
function getIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icons/icon.ico')
    : join(__dirname, '../../resources/icons/icon.ico')
}

interface StoreType {
  tileLayout: unknown
  pinnedApps: string[]
  theme: 'light' | 'dark'
}

export class WindowManager {
  private startMenuWindow: BrowserWindow | null = null
  private wallpaperWindow: BrowserWindow | null = null
  private shortcutsWindow: BrowserWindow | null = null
  private avatarCropWindow: BrowserWindow | null = null
  private currentCropImagePath: string | null = null
  private tileStyleWindow: BrowserWindow | null = null
  private tileStyleTileId: string | null = null
  private store: Store<StoreType>
  private isVisible = false
  // 忙碌锁（引用计数）：设置磁贴/分组背景等流程期间，忽略窗口 blur 自动关闭；
  // 支持嵌套（磁贴样式窗 → 裁剪窗），配对 +1/-1，归零才允许 blur 关闭
  private busyDepth = 0

  constructor(store: Store<StoreType>) {
    this.store = store
  }

  createStartMenuWindow(): void {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    // Win10 开始菜单默认尺寸：宽 ~640px，高 ~720px
    const winWidth = 740
    const winHeight = Math.min(720, screenHeight - 60)

    this.startMenuWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      minWidth: 800, // 左侧280 + 磁贴区520（一组450 + 70）
      minHeight: 500,
      maxWidth: 1350,
      maxHeight: 900,
      x: 0,
      y: screenHeight - winHeight,
      show: false,
      frame: false,
      transparent: true,
      resizable: true,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: false,
      alwaysOnTop: false,
      fullscreenable: false,
      backgroundColor: '#00000000',
      icon: getIconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false
      }
    })

    // 开发环境加载 dev server，生产环境加载本地文件
    if (process.env['ELECTRON_RENDERER_URL']) {
      this.startMenuWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.startMenuWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // 点击窗口外部时自动关闭（忙碌期间除外，如正在设置磁贴背景）
    this.startMenuWindow.on('blur', () => {
      if (this.isVisible && this.busyDepth === 0) {
        this.hideStartMenu()
      }
    })

    // 开发模式下自动打开 DevTools
    if (process.env['ELECTRON_RENDERER_URL']) {
      this.startMenuWindow.webContents.openDevTools({ mode: 'detach' })
    }
  }

  showStartMenu(displayId?: number, buttonBounds?: { x: number; y: number; width: number }): void {
    if (!this.startMenuWindow) return
    // 每次打开时清理上一轮可能残留的忙碌锁
    this.busyDepth = 0

    const [, height] = this.startMenuWindow.getSize()

    if (buttonBounds) {
      // 菜单显示在按钮上方，左对齐
      const x = buttonBounds.x
      const y = buttonBounds.y - height
      this.startMenuWindow.setPosition(x, y)
    } else if (displayId !== undefined) {
      // 指定屏幕的左下角
      const displays = screen.getAllDisplays()
      const display = displays.find((d) => d.id === displayId)
      if (display) {
        this.startMenuWindow.setPosition(
          display.workArea.x,
          display.workArea.y + display.workArea.height - height
        )
      } else {
        const primary = screen.getPrimaryDisplay()
        this.startMenuWindow.setPosition(0, primary.workAreaSize.height - height)
      }
    } else {
      // 默认：主屏左下角
      const primaryDisplay = screen.getPrimaryDisplay()
      this.startMenuWindow.setPosition(0, primaryDisplay.workAreaSize.height - height)
    }

    this.startMenuWindow.show()
    this.startMenuWindow.focus()
    this.isVisible = true

    // 设置 Windows Acrylic 毛玻璃效果（通过 PowerShell 调用原生 API）
    setAcrylicEffect(this.startMenuWindow, 40)

    // 通知渲染进程开始菜单已打开
    this.startMenuWindow.webContents.send('menu:open')
  }

  /** 点击悬浮按钮时切换菜单：在按钮上方显示，再次点击隐藏 */
  toggleStartMenuAt(displayId: number, buttonBounds: { x: number; y: number; width: number }): void {
    if (this.isVisible && this.startMenuWindow) {
      const [menuX] = this.startMenuWindow.getPosition()
      // 如果菜单已经在这个按钮上方，点击则隐藏
      if (menuX === buttonBounds.x) {
        this.hideStartMenu()
        return
      }
    }
    this.showStartMenu(displayId, buttonBounds)
  }

  hideStartMenu(): void {
    if (!this.startMenuWindow) return
    this.startMenuWindow.hide()
    this.isVisible = false
    this.startMenuWindow.webContents.send('menu:close')
  }

  toggleStartMenu(): void {
    if (this.isVisible) {
      this.hideStartMenu()
    } else {
      this.showStartMenu()
    }
  }

  // 动态设置 Acrylic 透明度（0-255）
  setAcrylicAlpha(alpha: number): void {
    if (!this.startMenuWindow || this.startMenuWindow.isDestroyed()) return
    const clamped = Math.max(0, Math.min(255, alpha))
    setAcrylicEffect(this.startMenuWindow, clamped)
  }

  getWindow(): BrowserWindow | null {
    return this.startMenuWindow
  }

  isMenuVisible(): boolean {
    return this.isVisible
  }

  // 设置忙碌锁：busy=true 计数 +1，false 计数 -1（最低 0）；计数 >0 时 blur 不自动隐藏开始菜单
  setBusy(busy: boolean): void {
    this.busyDepth = Math.max(0, this.busyDepth + (busy ? 1 : -1))
  }

  // 通知开始菜单窗口重新加载磁贴布局
  notifyLayoutUpdated(): void {
    if (this.startMenuWindow && !this.startMenuWindow.isDestroyed()) {
      this.startMenuWindow.webContents.send('layout:updated')
    }
  }

  // 创建/显示壁纸设置窗口
  showWallpaperWindow(): void {
    if (this.wallpaperWindow) {
      this.wallpaperWindow.focus()
      return
    }

    this.wallpaperWindow = new BrowserWindow({
      width: 700,
      height: 600,
      minWidth: 600,
      minHeight: 500,
      frame: true,
      resizable: true,
      title: '磁贴壁纸设置',
      backgroundColor: '#1e1e1e',
      icon: getIconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false
      }
    })

    // 加载壁纸设置页面（用 hash 路由区分）
    if (process.env['ELECTRON_RENDERER_URL']) {
      this.wallpaperWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/wallpaper`)
    } else {
      this.wallpaperWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/wallpaper' })
    }

    // 隐藏原生菜单栏
    this.wallpaperWindow.setMenuBarVisibility(false)

    this.wallpaperWindow.on('closed', () => {
      this.wallpaperWindow = null
    })
  }

  // 创建/显示快捷键设置窗口
  showShortcutsWindow(): void {
    if (this.shortcutsWindow) {
      this.shortcutsWindow.focus()
      return
    }

    this.shortcutsWindow = new BrowserWindow({
      width: 480,
      height: 320,
      minWidth: 400,
      minHeight: 280,
      resizable: false,
      frame: true,
      title: '快捷键设置',
      backgroundColor: '#1e1e1e',
      icon: getIconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false
      }
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      this.shortcutsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/shortcuts`)
    } else {
      this.shortcutsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/shortcuts' })
    }

    this.shortcutsWindow.setMenuBarVisibility(false)

    this.shortcutsWindow.on('closed', () => {
      this.shortcutsWindow = null
    })
  }

  // 创建/显示头像裁剪窗口
  showAvatarCropWindow(imagePath: string): void {
    if (this.avatarCropWindow) {
      this.avatarCropWindow.focus()
      return
    }

    this.currentCropImagePath = imagePath

    this.avatarCropWindow = new BrowserWindow({
      width: 360,
      height: 420,
      minWidth: 360,
      minHeight: 420,
      resizable: false,
      frame: true,
      title: '裁剪用户头像',
      backgroundColor: '#1e1e1e',
      icon: getIconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false
      }
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      this.avatarCropWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/avatar-crop`)
    } else {
      this.avatarCropWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/avatar-crop' })
    }

    this.avatarCropWindow.setMenuBarVisibility(false)

    this.avatarCropWindow.on('closed', () => {
      this.avatarCropWindow = null
      this.currentCropImagePath = null
    })
  }

  // 获取当前裁剪图片路径
  getCurrentCropImagePath(): string | null {
    return this.currentCropImagePath
  }

  // 关闭头像裁剪窗口
  closeAvatarCropWindow(): void {
    if (this.avatarCropWindow) {
      this.avatarCropWindow.close()
    }
  }

  // 通知主窗口头像已更新
  notifyAvatarUpdated(): void {
    if (this.startMenuWindow) {
      this.startMenuWindow.webContents.send('avatar:updated')
    }
  }

  // 创建/显示磁贴样式设置窗口（独立窗口）
  showTileStyleWindow(tileId: string): void {
    this.tileStyleTileId = tileId
    // 样式窗打开期间锁定开始菜单，不因焦点切换而关闭
    this.setBusy(true)

    if (this.tileStyleWindow) {
      this.tileStyleWindow.focus()
      this.tileStyleWindow.webContents.send('tile-style:select', tileId)
      return
    }

    this.tileStyleWindow = new BrowserWindow({
      width: 560,
      height: 640,
      resizable: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      show: false,
      center: true,
      icon: getIconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: false
      }
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      this.tileStyleWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/tile-style`)
    } else {
      this.tileStyleWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/tile-style' })
    }

    this.tileStyleWindow.setMenuBarVisibility(false)

    this.tileStyleWindow.once('ready-to-show', () => {
      this.tileStyleWindow?.show()
      // 与开始菜单一致的 Acrylic 毛玻璃效果
      if (this.tileStyleWindow) {
        setAcrylicEffect(this.tileStyleWindow, 40)
      }
    })

    this.tileStyleWindow.on('closed', () => {
      this.tileStyleWindow = null
      this.tileStyleTileId = null
      // 释放开始菜单忙碌锁
      this.setBusy(false)
      // 样式窗里的改动同步到开始菜单
      this.notifyLayoutUpdated()
    })
  }

  // 供样式窗查询当前要编辑的磁贴 id
  getTileStyleTarget(): string | null {
    return this.tileStyleTileId
  }
}
