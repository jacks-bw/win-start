import { execFile } from 'child_process'

export interface LnkEntry {
  name: string
  path: string
  target: string
  args: string
}

/**
 * 通过 WScript.Shell COM 对象批量解析开始菜单下所有 .lnk 快捷方式。
 * 一条 PowerShell 命令完成目录遍历 + 目标解析，比在 Node 里做二进制正则解析可靠
 * （正确处理中文路径、命令行参数、环境变量、相对路径等）。
 * 失败时 resolve([])，由调用方回退到老的 fs 扫描。
 */
export function scanLnkShortcuts(): Promise<LnkEntry[]> {
  return new Promise((resolve) => {
    const script = [
      '$dirs = @("$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs", "$env:PROGRAMDATA\\Microsoft\\Windows\\Start Menu\\Programs")',
      '$sh = New-Object -ComObject WScript.Shell',
      '$results = foreach ($d in $dirs) {',
      '  if (Test-Path $d) {',
      '    Get-ChildItem $d -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {',
      '      try {',
      '        $s = $sh.CreateShortcut($_.FullName)',
      '        [PSCustomObject]@{ Name=$_.BaseName; Path=$_.FullName; Target=$s.TargetPath; Args=$s.Arguments }',
      '      } catch {}',
      '    }',
      '  }',
      '}',
      'if ($results) { $results | ConvertTo-Json -Compress } else { "[]" }'
    ].join('\n')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) {
          console.error('[LnkScan] COM 解析失败:', err.message)
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(stdout) as LnkEntry[]
          resolve(Array.isArray(parsed) ? parsed : [parsed])
        } catch (e) {
          console.error('[LnkScan] 解析结果失败:', e)
          resolve([])
        }
      }
    )
  })
}
