import { app } from 'electron'
import { WindowManager } from './window-manager'
import { createTray } from './tray'
import { setupIpc } from './ipc'
import { createStore } from './store'
import { LaunchButtonManager } from './launch-button-manager'

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

  // 启动后自动显示开始菜单窗口
  windowManager.showStartMenu()

  app.on('activate', () => {
    windowManager?.showStartMenu()
  })
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
