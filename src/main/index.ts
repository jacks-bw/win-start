import { app, globalShortcut } from 'electron'
import { WindowManager } from './window-manager'
import { createTray } from './tray'
import { setupIpc } from './ipc'
import { createStore } from './store'
import { LaunchButtonManager } from './launch-button-manager'
import { startMenuWatcher } from './start-menu-watcher'

// 启动参数：限制内存占用
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,WinDelaySpellcheckServiceInit')

let windowManager: WindowManager | null = null
let store: ReturnType<typeof createStore> | null = null
let launchButtonManager: LaunchButtonManager | null = null

app.whenReady().then(() => {
  store = createStore()
  windowManager = new WindowManager(store)
  windowManager.createStartMenuWindow()

  // 初始化悬浮启动按钮（每个屏幕一个）
  launchButtonManager = new LaunchButtonManager(store, windowManager)
  launchButtonManager.init()

  createTray(windowManager, launchButtonManager)
  setupIpc(windowManager, store, launchButtonManager)

  // 启动开始菜单目录监视（安装/卸载软件后自动刷新列表）
  startMenuWatcher.start()

  // 注册全局快捷键（默认 Alt+Space）
  const defaultShortcut = store.get('globalShortcut', 'Alt+Space') as string
  const success = globalShortcut.register(defaultShortcut, () => {
    windowManager?.toggleStartMenu()
  })
  if (success) {
    console.log('[Shortcuts] Registered:', defaultShortcut)
  } else {
    console.error('[Shortcuts] Failed to register:', defaultShortcut)
  }

  // 启动后自动显示开始菜单窗口
  windowManager.showStartMenu()

  app.on('activate', () => {
    windowManager?.showStartMenu()
  })
})

// 退出时取消所有快捷键并停止文件监视
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  startMenuWatcher.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 开机自启
app.setLoginItemSettings({
  openAtLogin: true
})
