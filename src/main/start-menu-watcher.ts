import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { BrowserWindow } from 'electron'

/** 防抖间隔：300ms 内的多次文件变化合并为一次刷新 */
const DEBOUNCE_MS = 300
/** 目录不存在时的重试间隔 */
const RETRY_INTERVAL_MS = 5000

/**
 * 开始菜单目录监视器
 * 递归监视用户级和系统级开始菜单 Programs 目录，
 * 检测到 .lnk 快捷方式增删改后通知渲染进程刷新应用列表。
 */
class StartMenuWatcher {
  private watchers: fs.FSWatcher[] = []
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private isWatching = false

  /** 获取需要监视的开始菜单目录（用户级 + 系统级） */
  private getStartMenuDirs(): string[] {
    const home = os.homedir()
    const appData = process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming')
    const programData = process.env['PROGRAMDATA'] || 'C:\\ProgramData'

    return [
      path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    ]
  }

  /** 启动监视 */
  start(): void {
    if (this.isWatching) return
    this.isWatching = true
    this.setupWatchers()
  }

  /** 为每个存在的目录创建递归监视器 */
  private setupWatchers(): void {
    this.closeWatchers()

    const dirs = this.getStartMenuDirs()
    let allMissing = true

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        console.warn('[StartMenuWatcher] 目录不存在，跳过:', dir)
        continue
      }
      allMissing = false

      try {
        const watcher = fs.watch(dir, { recursive: true }, (_eventType, _filename) => {
          this.handleChange()
        })
        watcher.on('error', (err) => {
          console.error('[StartMenuWatcher] 监视错误:', dir, err.message)
          // 监视器出错时尝试重建
          this.scheduleRetry()
        })
        this.watchers.push(watcher)
        console.log('[StartMenuWatcher] 开始监视:', dir)
      } catch (err) {
        console.error('[StartMenuWatcher] 启动监视失败:', dir, err)
      }
    }

    // 如果所有目录都不存在，定时重试（可能是系统刚启动目录尚未就绪）
    if (allMissing) {
      console.warn('[StartMenuWatcher] 所有开始菜单目录均不存在，将在 5 秒后重试')
      this.scheduleRetry()
    }
  }

  /** 安排一次重建重试 */
  private scheduleRetry(): void {
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.isWatching) {
        this.setupWatchers()
      }
    }, RETRY_INTERVAL_MS)
  }

  /** 处理文件变化（防抖） */
  private handleChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.notifyAppsChanged()
    }, DEBOUNCE_MS)
  }

  /** 通知所有渲染进程：应用列表已变化 */
  private notifyAppsChanged(): void {
    console.log('[StartMenuWatcher] 检测到开始菜单变化，通知渲染进程刷新')
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('apps:changed')
      }
    }
  }

  /** 关闭所有监视器 */
  private closeWatchers(): void {
    for (const watcher of this.watchers) {
      try {
        watcher.close()
      } catch {
        // 忽略关闭错误
      }
    }
    this.watchers = []
  }

  /** 停止监视并清理资源 */
  stop(): void {
    this.isWatching = false
    this.closeWatchers()

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    console.log('[StartMenuWatcher] 已停止监视')
  }
}

export const startMenuWatcher = new StartMenuWatcher()
