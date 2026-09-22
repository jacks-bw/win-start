import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppsStore = defineStore('apps', () => {
  const apps = ref<AppItem[]>([])
  const searchQuery = ref('')
  const pinnedApps = ref<string[]>([])
  const folders = ref<AppFolder[]>([])
  const expandedFolders = ref<Set<string>>(new Set())

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

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
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
        app.group.toLowerCase().includes(q)
    )
  })

  // 最近添加的应用（前5个，排除已在文件夹里的）
  const recentApps = computed(() => {
    return apps.value.filter((a) => a.recentlyAdded && !a.folderId).slice(0, 5)
  })

  // 已固定的应用（排除已在文件夹里的）
  const pinnedAppList = computed(() => {
    return apps.value.filter((a) => pinnedApps.value.includes(a.id) && !a.folderId)
  })

  async function loadApps() {
    try {
      const list = await window.electronAPI.getAppList()
      apps.value = list
      pinnedApps.value = list.filter((a) => a.pinned).map((a) => a.id)
      loadFolders()
    } catch (err) {
      console.error('加载应用列表失败:', err)
    }
  }

  async function launchApp(app: AppItem) {
    try {
      await window.electronAPI.launchApp(app.lnkPath)
    } catch (err) {
      console.error('启动应用失败:', err)
    }
  }

  async function togglePin(appId: string) {
    pinnedApps.value = await window.electronAPI.togglePin(appId)
    // 更新 apps 数组中的 pinned 状态
    const app = apps.value.find((a) => a.id === appId)
    if (app) {
      app.pinned = pinnedApps.value.includes(appId)
    }
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  return {
    apps,
    searchQuery,
    pinnedApps,
    folders,
    expandedFolders,
    groupedApps,
    filteredApps,
    recentApps,
    pinnedAppList,
    loadApps,
    launchApp,
    togglePin,
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
