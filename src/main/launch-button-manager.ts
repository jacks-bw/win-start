import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import type Store from 'electron-store'
import type { WindowManager } from './window-manager'

interface ButtonConfig {
  x: number
  y: number
  width: number
  height: number
}

const DEFAULT_BUTTON_SIZE = 48

export class LaunchButtonManager {
  private buttons = new Map<number, BrowserWindow>() // displayId -> window
  private store: Store<any>
  private windowManager: WindowManager
  private editMode = false

  constructor(store: Store<any>, windowManager: WindowManager) {
    this.store = store
    this.windowManager = windowManager
  }

  /** 初始化：为所有屏幕创建按钮，并监听屏幕变化 */
  init(): void {
    this.createAllButtons()

    screen.on('display-added', () => this.recreateAll())
    screen.on('display-removed', () => this.recreateAll())
    screen.on('display-metrics-changed', () => this.recreateAll())
  }

  /** 为每个屏幕创建按钮 */
  private createAllButtons(): void {
    const displays = screen.getAllDisplays()
    for (const display of displays) {
      if (!this.buttons.has(display.id)) {
        this.createButton(display.id)
      }
    }
  }

  /** 屏幕变化时重新创建所有按钮 */
  private recreateAll(): void {
    for (const win of this.buttons.values()) {
      if (!win.isDestroyed()) win.close()
    }
    this.buttons.clear()
    this.createAllButtons()
  }

  /** 创建单个屏幕的悬浮按钮 */
  private createButton(displayId: number): void {
    const displays = screen.getAllDisplays()
    const display = displays.find((d) => d.id === displayId)
    if (!display) return

    // 读取保存的配置，或使用默认值（屏幕左下角，覆盖系统开始按钮）
    const saved = this.getButtonConfig(displayId)
    const config: ButtonConfig = saved || {
      x: display.workArea.x,
      y: display.workArea.y + display.workArea.height - DEFAULT_BUTTON_SIZE,
      width: DEFAULT_BUTTON_SIZE,
      height: DEFAULT_BUTTON_SIZE
    }

    const win = new BrowserWindow({
      width: config.width,
      height: config.height,
      x: config.x,
      y: config.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: this.editMode,
      movable: this.editMode,
      hasShadow: false,
      focusable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    // 确保在最上层（覆盖全屏应用和任务栏）
    win.setAlwaysOnTop(true, 'screen-saver')

    // 加载透明按钮页面（通过 URL 参数传递 displayId）
    const html = this.getButtonHtml(displayId)
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    // 编辑模式下保存位置和大小变化
    win.on('move', () => {
      if (this.editMode) this.saveButtonConfig(displayId, win)
    })
    win.on('resize', () => {
      if (this.editMode) this.saveButtonConfig(displayId, win)
    })

    this.buttons.set(displayId, win)
  }

  /** 生成透明按钮页面的 HTML */
  private getButtonHtml(displayId: number): string {
    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    cursor: pointer;
    overflow: hidden;
  }
  body.edit-mode {
    background: rgba(0, 120, 212, 0.3);
    border: 2px dashed #0078d4;
    box-sizing: border-box;
  }
</style>
</head>
<body>
<script>
  const displayId = ${displayId};
  document.body.addEventListener('click', function() {
    window.electronAPI && window.electronAPI.launcherClick && window.electronAPI.launcherClick(displayId);
  });
  // 监听编辑模式切换
  if (window.electronAPI && window.electronAPI.onLauncherEditMode) {
    window.electronAPI.onLauncherEditMode(function(editing) {
      document.body.classList.toggle('edit-mode', editing);
    });
  }
</script>
</body>
</html>`
  }

  /** 处理按钮点击：在对应屏幕的按钮上方切换开始菜单显示 */
  handleButtonClick(displayId: number): void {
    const win = this.buttons.get(displayId)
    if (!win || win.isDestroyed()) return

    const [x, y] = win.getPosition()
    const [width] = win.getSize()
    const buttonBounds = { x, y, width }

    this.windowManager.toggleStartMenuAt(displayId, buttonBounds)
  }

  /** 切换编辑模式 */
  setEditMode(edit: boolean): void {
    this.editMode = edit
    for (const [, win] of this.buttons) {
      if (win.isDestroyed()) continue
      win.setResizable(edit)
      win.setMovable(edit)
      win.webContents.send('launcher:edit-mode', edit)
    }
  }

  isEditMode(): boolean {
    return this.editMode
  }

  /** 读取指定屏幕的按钮配置 */
  private getButtonConfig(displayId: number): ButtonConfig | null {
    const configs = this.store.get('launchButtons', {}) as Record<string, ButtonConfig>
    return configs[String(displayId)] || null
  }

  /** 保存指定屏幕的按钮配置 */
  private saveButtonConfig(displayId: number, win: BrowserWindow): void {
    const configs = this.store.get('launchButtons', {}) as Record<string, ButtonConfig>
    const [x, y] = win.getPosition()
    const [width, height] = win.getSize()
    configs[String(displayId)] = { x, y, width, height }
    this.store.set('launchButtons', configs)
  }
}
