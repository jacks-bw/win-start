import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface TileNotification {
  template: 'icon' | 'text' | 'image'
  title?: string
  body?: string
  image?: string
  timestamp: number
}

export const useTilesStore = defineStore('tiles', () => {
  const groups = ref<TileGroup[]>([])
  const flippedTiles = ref<Set<string>>(new Set())
  const tileNotifications = ref<Record<string, TileNotification[]>>({})

  const allTiles = computed(() => {
    const tiles: TileItem[] = []
    groups.value.forEach((group) => {
      group.tiles.forEach((tile) => {
        tiles.push({ ...tile, groupId: group.id })
      })
    })
    return tiles.sort((a, b) => a.position - b.position)
  })

  async function loadLayout() {
    try {
      const layout = await window.electronAPI.loadTileLayout()
      if (layout && layout.groups) {
        groups.value = layout.groups
        // 初始化模拟通知
        initMockNotifications()
      }
    } catch (err) {
      console.error('加载磁贴布局失败:', err)
    }
  }

  async function saveLayout() {
    try {
      // 序列化为纯对象，避免 Vue 响应式 Proxy 导致 IPC 克隆失败
      const plainGroups = JSON.parse(JSON.stringify(groups.value))
      await window.electronAPI.saveTileLayout({ groups: plainGroups })
    } catch (err) {
      console.error('保存磁贴布局失败:', err)
    }
  }

  function addTile(groupId: string, appId: string, size: TileItem['size'] = 'medium') {
    const group = groups.value.find((g) => g.id === groupId)
    if (!group) return

    const maxPosition = Math.max(...group.tiles.map((t) => t.position), -1)
    const newTile: TileItem = {
      id: `tile-${Date.now()}`,
      appId,
      size,
      liveEnabled: size !== 'small',
      position: maxPosition + 1
    }
    group.tiles.push(newTile)
    saveLayout()
  }

  function removeTile(tileId: string) {
    groups.value.forEach((group) => {
      const idx = group.tiles.findIndex((t) => t.id === tileId)
      if (idx >= 0) {
        group.tiles.splice(idx, 1)
      }
    })
    saveLayout()
  }

  function resizeTile(tileId: string, size: TileItem['size']) {
    groups.value.forEach((group) => {
      const tile = group.tiles.find((t) => t.id === tileId)
      if (tile) {
        tile.size = size
        if (size === 'small') {
          tile.liveEnabled = false
        }
      }
    })
    saveLayout()
  }

  function toggleLiveTile(tileId: string) {
    groups.value.forEach((group) => {
      const tile = group.tiles.find((t) => t.id === tileId)
      if (tile && tile.size !== 'small') {
        tile.liveEnabled = !tile.liveEnabled
      }
    })
    saveLayout()
  }

  function flipTile(tileId: string) {
    if (flippedTiles.value.has(tileId)) {
      flippedTiles.value.delete(tileId)
    } else {
      flippedTiles.value.add(tileId)
    }
  }

  function addGroup(name: string) {
    const newGroup: TileGroup = {
      id: `group-${Date.now()}`,
      name,
      tiles: []
    }
    groups.value.push(newGroup)
    saveLayout()
  }

  function renameGroup(groupId: string, name: string) {
    const group = groups.value.find((g) => g.id === groupId)
    if (group) {
      group.name = name
      saveLayout()
    }
  }

  function removeGroup(groupId: string) {
    const idx = groups.value.findIndex((g) => g.id === groupId)
    if (idx >= 0) {
      groups.value.splice(idx, 1)
      saveLayout()
    }
  }

  // 初始化模拟通知数据
  function initMockNotifications() {
    const sampleNotifications: Record<string, TileNotification[]> = {
      'browser': [
        { template: 'text', title: '新闻头条', body: '今日科技要闻速览', timestamp: Date.now() },
        { template: 'text', title: '更新提醒', body: '有新版本可用', timestamp: Date.now() }
      ],
      'files': [
        { template: 'text', title: '存储', body: '已使用 45%', timestamp: Date.now() }
      ]
    }
    tileNotifications.value = sampleNotifications
  }

  function getNotifications(tileId: string): TileNotification[] {
    return tileNotifications.value[tileId] || []
  }

  return {
    groups,
    flippedTiles,
    allTiles,
    loadLayout,
    saveLayout,
    addTile,
    removeTile,
    resizeTile,
    toggleLiveTile,
    flipTile,
    addGroup,
    renameGroup,
    removeGroup,
    getNotifications
  }
})
