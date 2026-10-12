import { execFile } from 'child_process'
import crypto from 'crypto'

export interface UwpApp {
  name: string
  appId: string
}

// 明确不展示的系统杂项（开始菜单里没有实际使用价值）
const NAME_BLOCKLIST = new Set(['入门', 'Windows通用商店'])

/**
 * 通过 PowerShell Get-StartApps 枚举 UWP / Microsoft Store 应用。
 * UWP 的 AppID 格式为 PackageFamilyName!ApplicationId，必然包含 "!"。
 * 失败时返回空数组，由调用方降级为纯 .lnk 扫描。
 */
export function enumUwpApps(): Promise<UwpApp[]> {
  return new Promise((resolve) => {
    const script = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress`
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) {
          console.error('[UWP] 枚举失败:', err.message)
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(stdout) as Array<{ Name: string; AppID: string }>
          // Get-StartApps 单条结果时返回对象而不是数组，统一包成数组
          const list = Array.isArray(parsed) ? parsed : [parsed]
          const apps: UwpApp[] = list
            .filter((a) => a && a.AppID)
            .filter((a) => {
              // UWP/Store 应用（带 !）全部保留
              if (a.AppID.includes('!')) return true
              // 系统注册项：只收 Microsoft.Windows.* 这类没有对应 .lnk 的系统工具（如远程桌面）
              if (/^Microsoft\.Windows\.[A-Za-z0-9]+$/i.test(a.AppID)) return true
              return false
            })
            .filter((a) => !NAME_BLOCKLIST.has(a.Name))
            .map((a) => ({ name: a.Name, appId: a.AppID }))
          resolve(apps)
        } catch (e) {
          console.error('[UWP] 解析结果失败:', e)
          resolve([])
        }
      }
    )
  })
}

/** UWP 应用的稳定 id（按 AppID 哈希，不受语言/路径影响） */
export function uwpAppId(app: UwpApp): string {
  return crypto.createHash('md5').update(app.appId).digest('hex').slice(0, 12)
}
