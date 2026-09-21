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
  // 拖拽视觉反馈状态
  const draggingTileId = ref<string | null>(null)
  const draggingTileSize = ref<TileItem['size'] | null>(null)
  const dragTargetId = ref<string | null>(null)

  function setDraggingTile(id: string | null, size: TileItem['size'] | null = null) {
    draggingTileId.value = id
    draggingTileSize.value = size
    if (!id) dragTargetId.value = null
  }

  function setDragTarget(id: string | null) {
    dragTargetId.value = id
  }

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
        // 为旧数据补充 row/col
        groups.value.forEach((group) => {
          group.tiles.forEach((tile, idx) => {
            if (tile.row === undefined) {
              const pos = findFreePosition(group, tile.size, idx)
              tile.row = pos.row
              tile.col = pos.col
            }
          })
        })
        // 初始化模拟通知
        initMockNotifications()
      }
    } catch (err) {
      console.error('加载磁贴布局失败:', err)
    }
  }

  // 尺寸对应的网格跨度
  const sizeSpan: Record<string, { rows: number; cols: number }> = {
    small: { rows: 1, cols: 1 },
    medium: { rows: 2, cols: 2 },
    wide: { rows: 2, cols: 4 },
    large: { rows: 4, cols: 4 }
  }

  // 检查位置是否空闲（不与其他磁贴重叠）
  function isPositionFree(
    group: TileGroup,
    row: number,
    col: number,
    size: string,
    excludeTileId?: string
  ): boolean {
    const span = sizeSpan[size] || { rows: 1, cols: 1 }
    for (const tile of group.tiles) {
      if (tile.id === excludeTileId) continue
      const tileSpan = sizeSpan[tile.size] || { rows: 1, cols: 1 }
      // 检查两个矩形是否重叠
      const overlap =
        row < tile.row + tileSpan.rows &&
        row + span.rows > tile.row &&
        col < tile.col + tileSpan.cols &&
        col + span.cols > tile.col
      if (overlap) return false
    }
    return true
  }

  // 自动找空位（行优先扫描）
  function findFreePosition(group: TileGroup, size: string, afterIndex: number = -1): { row: number; col: number } {
    const maxCols = 10
    // 先尝试在现有磁贴之间找空位
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < maxCols; col++) {
        if (isPositionFree(group, row, col, size)) {
          return { row, col }
        }
      }
    }
    return { row: 0, col: 0 }
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
    const pos = findFreePosition(group, size)
    const newTile: TileItem = {
      id: `tile-${Date.now()}`,
      appId,
      size,
      liveEnabled: size !== 'small',
      position: maxPosition + 1,
      row: pos.row,
      col: pos.col
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

  // 移动磁贴：交换两个磁贴的位置
  function moveTile(dragTileId: string, targetTileId: string) {
    if (dragTileId === targetTileId) return

    let dragTile: TileItem | null = null
    let targetTile: TileItem | null = null

    for (const group of groups.value) {
      for (const tile of group.tiles) {
        if (tile.id === dragTileId) dragTile = tile
        if (tile.id === targetTileId) targetTile = tile
      }
    }

    if (!dragTile || !targetTile) return

    // 交换 row/col
    const tempRow = dragTile.row
    const tempCol = dragTile.col
    dragTile.row = targetTile.row
    dragTile.col = targetTile.col
    targetTile.row = tempRow
    targetTile.col = tempCol

    saveLayout()
  }

  // 移动磁贴到指定 row/col（拖到空白或目标位置）
  function moveTileToGrid(dragTileId: string, targetGroupId: string, row: number, col: number) {
    let dragGroup: TileGroup | null = null
    let targetGroup: TileGroup | null = null
    let dragTile: TileItem | null = null

    for (const group of groups.value) {
      for (const tile of group.tiles) {
        if (tile.id === dragTileId) {
          dragGroup = group
          dragTile = tile
        }
      }
      if (group.id === targetGroupId) {
        targetGroup = group
      }
    }

    if (!dragGroup || !targetGroup || !dragTile) {
      console.log('[moveTileToGrid] not found:', { dragGroup: !!dragGroup, targetGroup: !!targetGroup, dragTile: !!dragTile })
      return
    }

    console.log('[moveTileToGrid] start:', { dragTileId, targetGroupId, row, col, dragGroup: dragGroup.id, targetGroup: targetGroup.id })

    // 先临时把磁贴从原位置移除（标记为不存在以便检测冲突）
    const oldRow = dragTile.row
    const oldCol = dragTile.col
    dragTile.row = -100
    dragTile.col = -100

    const span = sizeSpan[dragTile.size] || { rows: 1, cols: 1 }
    const MAX_COLS = 6

    // 检查位置是否有效（不超出列数，不重叠）
    function canPlace(r: number, c: number): boolean {
      // 超出列数
      if (c < 0 || c + span.cols > MAX_COLS) return false
      // 检查重叠
      for (const t of targetGroup!.tiles) {
        if (t.id === dragTileId) continue
        const tSpan = sizeSpan[t.size] || { rows: 1, cols: 1 }
        const overlap =
          r < t.row + tSpan.rows &&
          r + span.rows > t.row &&
          c < t.col + tSpan.cols &&
          c + span.cols > t.col
        if (overlap) return false
      }
      return true
    }

    // 先尝试放到目标位置
    let targetRow = row
    let targetCol = col

    // 如果目标位置放不下，从目标行开始往下扫描找空位
    if (!canPlace(targetRow, targetCol)) {
      let found = false
      for (let r = row; r < 20 && !found; r++) {
        for (let c = 0; c <= MAX_COLS - span.cols; c++) {
          if (canPlace(r, c)) {
            targetRow = r
            targetCol = c
            found = true
            break
          }
        }
      }
      // 整组都满了，不移动
      if (!found) {
        dragTile.row = oldRow
        dragTile.col = oldCol
        return
      }
    }

    // 找到空位，放置
    dragTile.row = targetRow
    dragTile.col = targetCol
    console.log('[moveTileToGrid] placed at:', targetRow, targetCol)

    // 如果跨分组，需要移动磁贴到新分组
    if (dragGroup !== targetGroup) {
      const idx = dragGroup.tiles.findIndex((t) => t.id === dragTileId)
      if (idx >= 0) dragGroup.tiles.splice(idx, 1)
      targetGroup.tiles.push(dragTile)
      console.log('[moveTileToGrid] cross-group moved to', targetGroup.id)
    }

    saveLayout()
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
    draggingTileId,
    draggingTileSize,
    dragTargetId,
    setDraggingTile,
    setDragTarget,
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
    moveTile,
    moveTileToGrid,
    getNotifications
  }
})
