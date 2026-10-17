import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { mergeScannedApps } from '../utils/app-scan'
import { selectRecentApps } from '../utils/recent-apps'
import { appLaunchTarget } from '../utils/app-actions'

export const useAppsStore = defineStore('apps', () => {
  const apps = ref<AppItem[]>([])
  const searchQuery = ref('')
  const scanWarning = ref('')
  const launchError = ref('')
  const recentCheckedAt = ref(Date.now())
  const pinnedApps = ref<string[]>([])
  const folders = ref<AppFolder[]>([])
  const expandedFolders = ref<Set<string>>(new Set())

  /** 上次应用列表扫描完成时间戳；距打开菜单不足该间隔则跳过后台重扫 */
  let lastScanAt = 0
  let scanning = false
  const REFRESH_INTERVAL_MS = 60_000

  // 从 localStorage 加载文件夹
  function loadFolders() {
    try {
      const saved = localStorage.getItem('appFolders')
      if (saved) {
        folders.value = JSON.parse(saved)
      }
    } catch (err) {
      console.error('加载文件夹失败:', err)
    }
  }

  // 保存文件夹到 localStorage
  function saveFolders() {
    try {
      localStorage.setItem('appFolders', JSON.stringify(folders.value))
    } catch (err) {
      console.error('保存文件夹失败:', err)
    }
  }

  // 创建文件夹
  function createFolder(name: string, appIds: string[] = []): string {
    const id = `folder-${Date.now()}`
    folders.value.push({ id, name, appIds })
    // 把应用移到文件夹里
    for (const appId of appIds) {
      const app = apps.value.find((a) => a.id === appId)
      if (app) app.folderId = id
    }
    expandedFolders.value.add(id)
    saveFolders()
    return id
  }

  // 重命名文件夹
  function renameFolder(folderId: string, name: string) {
    const folder = folders.value.find((f) => f.id === folderId)
    if (folder) {
      folder.name = name
      saveFolders()
    }
  }

  // 删除文件夹（里面的应用移出来）
  function deleteFolder(folderId: string) {
    const folder = folders.value.find((f) => f.id === folderId)
    if (folder) {
      for (const appId of folder.appIds) {
        const app = apps.value.find((a) => a.id === appId)
        if (app) app.folderId = undefined
      }
      folders.value = folders.value.filter((f) => f.id !== folderId)
      expandedFolders.value.delete(folderId)
      saveFolders()
    }
  }

  // 移动应用到文件夹
  function moveAppToFolder(appId: string, folderId: string) {
    const app = apps.value.find((a) => a.id === appId)
    const folder = folders.value.find((f) => f.id === folderId)
    if (app && folder) {
      // 如果已经在另一个文件夹里，先移出来
      if (app.folderId) {
        const oldFolder = folders.value.find((f) => f.id === app.folderId)
        if (oldFolder) {
          oldFolder.appIds = oldFolder.appIds.filter((id) => id !== appId)
        }
      }
      app.folderId = folderId
      if (!folder.appIds.includes(appId)) {
        folder.appIds.push(appId)
      }
      saveFolders()
    }
  }

  // 从文件夹移出应用
  function removeAppFromFolder(appId: string) {
    const app = apps.value.find((a) => a.id === appId)
    if (app && app.folderId) {
      const folder = folders.value.find((f) => f.id === app.folderId)
      if (folder) {
        folder.appIds = folder.appIds.filter((id) => id !== appId)
      }
      app.folderId = undefined
      saveFolders()
    }
  }

  // 切换文件夹展开/折叠
  function toggleFolder(folderId: string) {
    if (expandedFolders.value.has(folderId)) {
      expandedFolders.value.delete(folderId)
    } else {
      expandedFolders.value.add(folderId)
    }
  }

  // 获取文件夹里的应用
  function getFolderApps(folderId: string): AppItem[] {
    const folder = folders.value.find((f) => f.id === folderId)
    if (!folder) return []
    return folder.appIds
      .map((id) => apps.value.find((a) => a.id === id))
      .filter((a): a is AppItem => !!a)
  }

  // 按拼音分组（排除已在文件夹里的应用）
  const groupedApps = computed(() => {
    const filtered = filteredApps.value.filter((app) => !app.folderId)
    const groups: Record<string, AppItem[]> = {}

    filtered.forEach((app) => {
      if (!groups[app.group]) {
        groups[app.group] = []
      }
      groups[app.group].push(app)
    })

    // 同一分组内按名称排序（中文按拼音）
    Object.values(groups).forEach((items) => {
      items.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    })

    return Object.entries(groups)
      .sort(([a], [b]) => {
        // # 分组排最后
        if (a === '#') return 1
        if (b === '#') return -1
        return a.localeCompare(b)
      })
      .map(([group, items]) => ({ group, items }))
  })

  // 搜索过滤
  const filteredApps = computed(() => {
    if (!searchQuery.value.trim()) {
      return apps.value
    }
    const q = searchQuery.value.toLowerCase()
    return apps.value.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.group.toLowerCase().includes(q) ||
        (app as any).pinyin?.replace(/ /g, '').includes(q) ||
        (app as any).pinyinInitials?.includes(q)
    )
  })

  // 最近添加的应用（前5个，排除已在文件夹里的）
  const recentApps = computed(() => {
    return selectRecentApps(apps.value, recentCheckedAt.value)
  })

  // 已固定的应用（排除已在文件夹里的）
  const pinnedAppList = computed(() => {
    return apps.value.filter((a) => pinnedApps.value.includes(a.id) && !a.folderId)
  })

  async function loadApps() {
    if (scanning) return
    scanning = true
    try {
      const scan = await window.api.getAppScan()
      recentCheckedAt.value = Date.now()
      apps.value = mergeScannedApps(apps.value, scan.apps, scan.complete)
      loadFolders()
      // Restore user metadata rather than trusting scanner defaults.
      for (const app of apps.value) {
        app.pinned = pinnedApps.value.includes(app.id)
        app.folderId = folders.value.find(folder => folder.appIds.includes(app.id))?.id
      }
      scanWarning.value = scan.complete ? '' : '应用列表暂未完整刷新，现有磁贴已保留。'
      if (scan.warnings.length) {
        scanWarning.value = [scanWarning.value, ...scan.warnings].filter(Boolean).join('\n')
        console.warn('应用扫描提示:', scan.warnings)
      }
      if (scan.complete) lastScanAt = Date.now()
    } catch (err) {
      console.error('加载应用列表失败:', err)
      scanWarning.value = '应用列表刷新失败，已保留上次结果和现有磁贴。'
    } finally {
      scanning = false
    }
  }

  /**
   * 菜单打开时的惰性重扫：距上次扫描超过 60 秒才后台刷新一次，
   * 在途扫描未结束时跳过，避免快速开关菜单发起多次 PowerShell。
   */
  function maybeRefreshApps() {
    recentCheckedAt.value = Date.now()
    if (scanning) return Promise.resolve()
    if (Date.now() - lastScanAt < REFRESH_INTERVAL_MS) return Promise.resolve()
    return loadApps()
  }

  async function launchApp(app: AppItem) {
    launchError.value = ''
    try {
      const target = appLaunchTarget(app)
      if (target.kind === 'shell') await window.api.launchShellApp(target.value)
      else await window.api.launchApp(target.value)
      await window.api.hideStartMenu()
    } catch (err) {
      launchError.value = `启动失败：${String(err instanceof Error ? err.message : err)}`
      console.error('启动应用失败:', err)
    }
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  return {
    apps,
    searchQuery,
    scanWarning,
    launchError,
    pinnedApps,
    folders,
    expandedFolders,
    groupedApps,
    filteredApps,
    recentApps,
    pinnedAppList,
    loadApps,
    launchApp,
    maybeRefreshApps,
    setSearchQuery,
    createFolder,
    renameFolder,
    deleteFolder,
    moveAppToFolder,
    removeAppFromFolder,
    toggleFolder,
    getFolderApps
  }
})
