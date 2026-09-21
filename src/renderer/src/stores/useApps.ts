import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppsStore = defineStore('apps', () => {
  const apps = ref<AppItem[]>([])
  const searchQuery = ref('')
  const pinnedApps = ref<string[]>([])

  // 按拼音分组
  const groupedApps = computed(() => {
    const filtered = filteredApps.value
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

  // 最近添加的应用（前5个）
  const recentApps = computed(() => {
    return apps.value.filter((a) => a.recentlyAdded).slice(0, 5)
  })

  // 已固定的应用
  const pinnedAppList = computed(() => {
    return apps.value.filter((a) => pinnedApps.value.includes(a.id))
  })

  async function loadApps() {
    try {
      const list = await window.electronAPI.getAppList()
      apps.value = list
      pinnedApps.value = list.filter((a) => a.pinned).map((a) => a.id)
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
    groupedApps,
    filteredApps,
    recentApps,
    pinnedAppList,
    loadApps,
    launchApp,
    togglePin,
    setSearchQuery
  }
})
