import { app } from 'electron'
import { WindowManager } from './window-manager'
import { createTray } from './tray'
import { setupIpc } from './ipc'
import { createStore } from './store'

let windowManager: WindowManager | null = null
let store: ReturnType<typeof createStore> | null = null

app.whenReady().then(() => {
  store = createStore()
  windowManager = new WindowManager(store)
  windowManager.createStartMenuWindow()

  createTray(windowManager)
  setupIpc(windowManager, store)

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
