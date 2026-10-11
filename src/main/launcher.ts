import { shell } from 'electron'
import { execFile } from 'child_process'

/**
 * 启动指定程序（Win32，通过 .lnk 快捷方式）
 */
export async function launchApp(lnkPath: string, args?: string): Promise<void> {
  try {
    // 使用 shell.openExternal 打开快捷方式
    // 对于 .lnk 文件，Windows 会自动解析并启动目标程序
    await shell.openPath(lnkPath)
  } catch (err) {
    console.error('启动程序失败:', lnkPath, err)
    throw err
  }
}

/**
 * 启动 UWP / Microsoft Store 应用（通过 shell:AppsFolder 协议）
 */
export function launchUwpApp(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'explorer.exe',
      [`shell:AppsFolder\\${appId}`],
      { windowsHide: true },
      (err) => {
        if (err) {
          console.error('启动 UWP 应用失败:', appId, err.message)
          reject(err)
        } else {
          resolve()
        }
      }
    )
  })
}

/**
 * 在文件资源管理器中显示文件
 */
export function showInFolder(fullPath: string): void {
  shell.showItemInFolder(fullPath)
}

/**
 * 卸载程序（打开控制面板卸载页面）
 */
export function uninstallProgram(): void {
  shell.openExternal('control appwiz.cpl')
}
