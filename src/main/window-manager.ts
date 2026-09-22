import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type Store from 'electron-store'

interface StoreType {
  tileLayout: unknown
  pinnedApps: string[]
  theme: 'light' | 'dark'
}

export class WindowManager {
  private startMenuWindow: BrowserWindow | null = null
  private wallpaperWindow: BrowserWindow | null = null
  private store: Store<StoreType>
  private isVisible = false

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
      resizable: true,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: false,
      alwaysOnTop: false,
      fullscreenable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    // 开发环境加载 dev server，生产环境加载本地文件
    if (process.env['ELECTRON_RENDERER_URL']) {
      this.startMenuWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.startMenuWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // 点击窗口外部时自动关闭
    this.startMenuWindow.on('blur', () => {
      if (this.isVisible) {
        this.hideStartMenu()
      }
    })

    // 开发模式下自动打开 DevTools
    if (process.env['ELECTRON_RENDERER_URL']) {
      this.startMenuWindow.webContents.openDevTools({ mode: 'detach' })
    }
  }

  showStartMenu(): void {
    if (!this.startMenuWindow) return

    const primaryDisplay = screen.getPrimaryDisplay()
    const { height: screenHeight } = primaryDisplay.workAreaSize
    const [, y] = this.startMenuWindow.getPosition()

    this.startMenuWindow.setPosition(0, screenHeight - this.startMenuWindow.getSize()[1])
    this.startMenuWindow.show()
    this.startMenuWindow.focus()
    this.isVisible = true

    // 通知渲染进程开始菜单已打开
    this.startMenuWindow.webContents.send('menu:open')
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

  getWindow(): BrowserWindow | null {
    return this.startMenuWindow
  }

  isMenuVisible(): boolean {
    return this.isVisible
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
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    // 加载壁纸设置页面（用 hash 路由区分）
    if (process.env['ELECTRON_RENDERER_URL']) {
      this.wallpaperWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/wallpaper`)
    } else {
      this.wallpaperWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/wallpaper' })
    }

    this.wallpaperWindow.on('closed', () => {
      this.wallpaperWindow = null
    })
  }
}
