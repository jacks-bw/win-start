import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import crypto from 'crypto'
import { pinyin } from 'pinyin'

export interface AppItem {
  id: string
  name: string
  lnkPath: string
  targetPath: string
  icon: string
  args?: string
  group: string
  pinned: boolean
  recentlyAdded: boolean
}

/**
 * 扫描系统开始菜单目录下的所有 .lnk 快捷方式
 */
export async function scanStartMenu(): Promise<AppItem[]> {
  const startMenuDirs = getStartMenuDirs()
  const allApps: AppItem[] = []

  for (const dir of startMenuDirs) {
    if (!fs.existsSync(dir)) continue
    const apps = await scanDirectory(dir, dir)
    allApps.push(...apps)
  }

  // 去重（按名称）
  const seen = new Set<string>()
  const uniqueApps = allApps.filter((app) => {
    const key = app.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 按名称拼音排序分组
  uniqueApps.forEach((app) => {
    app.group = getPinyinGroup(app.name)
  })

  uniqueApps.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))

  return uniqueApps
}

function getStartMenuDirs(): string[] {
  const home = os.homedir()
  const appData = process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming')
  const programData = process.env['PROGRAMDATA'] || 'C:\\ProgramData'

  return [
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ]
}

async function scanDirectory(dir: string, rootDir: string): Promise<AppItem[]> {
  const results: AppItem[] = []

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        const subResults = await scanDirectory(fullPath, rootDir)
        results.push(...subResults)
      } else if (entry.isFile() && entry.name.endsWith('.lnk')) {
        const app = parseLnkFile(fullPath, entry.name)
        if (app) {
          results.push(app)
        }
      }
    }
  } catch (err) {
    console.error('扫描目录失败:', dir, err)
  }

  return results
}

function parseLnkFullPath(lnkPath: string): string {
  // 从 .lnk 文件内容中粗略提取目标路径
  // 完整解析 .lnk 二进制格式较复杂，这里用简单方式
  // 对于大多数快捷方式，路径会出现在文件内容中
  try {
    const buf = fs.readFileSync(lnkPath)
    // 尝试 ASCII 解码找路径
    const ascii = buf.toString('latin1')
    // 找 .exe 或 .lnk 路径
    const exeMatch = ascii.match(/[A-Za-z]:[\\\/][^\x00-\x1f]*?\.(exe|lnk|url)/i)
    if (exeMatch) {
      return exeMatch[0].replace(/\0/g, '')
    }
    // 尝试 UTF-16LE 解码
    const utf16 = buf.toString('utf16le')
    const utf16Match = utf16.match(/[A-Za-z]:[\\\/][^\x00]*?\.(exe|lnk|url)/i)
    if (utf16Match) {
      return utf16Match[0].replace(/\0/g, '')
    }
  } catch (err) {
    console.error('解析 lnk 失败:', lnkPath, err)
  }
  return lnkPath
}

function parseLnkFile(lnkPath: string, fileName: string): AppItem | null {
  try {
    const name = fileName.replace(/\.lnk$/i, '')
    const targetPath = parseLnkFullPath(lnkPath)
    const id = crypto.createHash('md5').update(lnkPath).digest('hex').slice(0, 12)

    return {
      id,
      name,
      lnkPath,
      targetPath,
      icon: '', // 图标稍后由主进程提取
      group: '#',
      pinned: false,
      recentlyAdded: false
    }
  } catch (err) {
    console.error('解析快捷方式失败:', lnkPath, err)
    return null
  }
}

function getPinyinGroup(name: string): string {
  // 中文转拼音首字母
  if (/^[\u4e00-\u9fa5]/.test(name)) {
    try {
      const py = pinyin(name[0], { style: pinyin.STYLE_FIRST_LETTER })
      if (py && py[0] && py[0][0]) {
        return py[0][0].toUpperCase()
      }
    } catch {
      // 忽略拼音解析错误
    }
  }
  // 英文字母直接取首字母
  const first = name[0].toUpperCase()
  if (/[A-Z]/.test(first)) {
    return first
  }
  // 其他符号归到 # 分组
  return '#'
}
