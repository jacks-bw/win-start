<template>
  <div class="tile-grid">
    <div v-for="group in tilesStore.groups" :key="group.id" class="tile-group-section" :data-group-id="group.id">
      <!-- 分组标题（右键打开分组菜单） -->
      <div class="group-header" @contextmenu="handleGroupContextMenu($event, group)">
        <span class="group-name">{{ group.name }}</span>
      </div>

      <!-- 磁贴网格 - 使用 CSS Grid -->
      <div
        class="tile-grid-inner"
        :class="{ dragging: tilesStore.draggingTileId !== null }"
        @dragover.prevent="handleGridDragOver"
        @drop.prevent="handleGridDrop($event, group)"
      >
        <LiveTile
          v-for="tile in sortedTiles(group)"
          :key="tile.id"
          :tile="tile"
          :group="group"
          :style="{ gridRow: `${tile.row + 1} / span ${sizeSpan[tile.size]?.rows || 1}`, gridColumn: `${tile.col + 1} / span ${sizeSpan[tile.size]?.cols || 1}` }"
          @click="handleTileClick(tile)"
          @contextmenu="handleTileContextMenu($event, tile.id)"
        />
      </div>
    </div>

    <!-- 拖拽预览占位块（fixed 定位，只渲染一个） -->
    <div
      v-if="dragPreview.visible && tilesStore.draggingTileId"
      class="drag-preview"
      :style="dragPreview.style"
    ></div>

    <!-- 安卓风格：拖起后跟随光标的浮动磁贴 -->
    <div
      v-if="floatGhost.visible"
      class="tile-float-ghost"
      :class="'size-' + (floatGhost.size || 'medium')"
      :style="{ left: floatGhost.x + 'px', top: floatGhost.y + 'px' }"
    >
      <span v-if="floatGhost.icon" class="float-icon" :style="{ backgroundImage: `url(${floatGhost.icon})` }"></span>
      <span v-else class="float-icon float-icon-ph">{{ floatGhost.name.charAt(0) }}</span>
      <span class="float-name">{{ floatGhost.name }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue'
import { useTilesStore } from '../../stores/useTiles'
import { useAppsStore } from '../../stores/useApps'
import LiveTile from './LiveTile.vue'

const tilesStore = useTilesStore()
const appsStore = useAppsStore()

// 磁贴尺寸对应的网格跨度（单元格数）
const sizeSpan: Record<string, { rows: number; cols: number }> = {
  small: { rows: 1, cols: 1 },
  medium: { rows: 2, cols: 2 },
  wide: { rows: 2, cols: 4 }
}

// 拖拽预览占位块
const dragPreview = reactive({
  visible: false,
  style: {} as Record<string, string>,
  col: 0,
  row: 0,
  groupId: ''
})

// 安卓风格浮动磁贴
const floatGhost = reactive({ visible: false, x: 0, y: 0, size: 'medium', name: '', icon: '' })
function onFloatMove(e: MouseEvent) {
  floatGhost.x = e.clientX
  floatGhost.y = e.clientY
}
watch(() => tilesStore.draggingTileId, (id) => {
  if (id) {
    const tile = tilesStore.allTiles.find((t) => t.id === id)
    const app = tile ? appsStore.apps.find((a) => a.id === tile.appId) : null
    floatGhost.visible = true
    floatGhost.size = tilesStore.draggingTileSize || 'medium'
    floatGhost.name = app?.name || ''
    floatGhost.icon = app?.icon || ''
    window.addEventListener('mousemove', onFloatMove)
  } else {
    floatGhost.visible = false
    window.removeEventListener('mousemove', onFloatMove)
  }
})

function handleGridDragOver(e: DragEvent) {
  if (!tilesStore.draggingTileId || !tilesStore.draggingTileSize) return
  const grid = e.currentTarget as HTMLElement
  if (!grid) return
  console.log('[dragover] grid rect:', grid.getBoundingClientRect(), 'all groups:', tilesStore.groups.map(g => g.id))
  const rect = grid.getBoundingClientRect()
  const cellSize = 76 // tile-small(70) + gap(6)

  const col = Math.floor((e.clientX - rect.left) / cellSize)
  const row = Math.floor((e.clientY - rect.top) / cellSize)

  const span = sizeSpan[tilesStore.draggingTileSize] || { cols: 1, rows: 1 }

  dragPreview.visible = true
  dragPreview.col = Math.max(0, col)
  dragPreview.row = Math.max(0, row)
  dragPreview.style = {
    position: 'fixed',
    left: `${rect.left + Math.max(0, col) * cellSize}px`,
    top: `${rect.top + Math.max(0, row) * cellSize}px`,
    width: `${span.cols * cellSize}px`,
    height: `${span.rows * cellSize}px`,
    background: 'rgba(0, 120, 215, 0.2)',
    border: '2px solid var(--accent-color)',
    borderRadius: '2px',
    pointerEvents: 'none',
    zIndex: '9999'
  }
}

function handleGridDrop(e: DragEvent, group: TileGroup) {
  const dragTileId = e.dataTransfer?.getData('text/plain')
  console.log('[drop] dragTileId:', dragTileId, 'targetGroup:', group.id, 'row/col:', dragPreview.row, dragPreview.col)
  if (!dragTileId) {
    tilesStore.setDraggingTile(null)
    return
  }

  // 用预览块的 row/col 移动磁贴
  tilesStore.moveTileToGrid(dragTileId, group.id, dragPreview.row, dragPreview.col)
  tilesStore.setDraggingTile(null)
}

// 拖拽结束时隐藏预览
function clearDragPreview() {
  dragPreview.visible = false
  dragPreview.style = {}
}

watch(
  () => tilesStore.draggingTileId,
  (id) => {
    if (!id) clearDragPreview()
  }
)

function sortedTiles(group: TileGroup): TileItem[] {
  return [...group.tiles].sort((a, b) => a.position - b.position)
}

async function handleTileClick(tile: TileItem) {
  console.log('点击磁贴:', tile.appId)

  // 1. 先按 appId 精确匹配（固定到磁贴的程序）
  let app = appsStore.apps.find((a) => a.id === tile.appId)

  // 2. 如果没找到，按名称模糊匹配（内置模拟磁贴）
  if (!app) {
    app = appsStore.apps.find(
      (a) =>
        a.name.toLowerCase().includes(tile.appId.toLowerCase()) ||
        tile.appId.toLowerCase().includes(a.name.toLowerCase())
    )
  }

  if (app) {
    await appsStore.launchApp(app)
    return
  }

  // 3. 内置模拟磁贴：尝试直接启动系统程序
  const builtinMap: Record<string, string> = {
    calc: 'calc.exe',
    notepad: 'notepad.exe',
    browser: 'explorer.exe',
    files: 'explorer.exe'
  }

  const target = builtinMap[tile.appId]
  if (target) {
    try {
      await window.electronAPI.launchApp(target)
    } catch (err) {
      console.error('启动内置程序失败:', err)
    }
  }
}

function handleTileContextMenu(e: MouseEvent, tileId: string) {
  e.preventDefault()
  e.stopPropagation()
  if (window.openTileContextMenu) {
    window.openTileContextMenu(e.clientX, e.clientY, tileId)
  }
}

function handleGroupContextMenu(e: MouseEvent, group: TileGroup) {
  e.preventDefault()
  e.stopPropagation()
  if (window.openGroupContextMenu) {
    window.openGroupContextMenu(e.clientX, e.clientY, group.id)
  }
}

function addGroup() {
  if (window.showInputDialog) {
    window.showInputDialog('新建分组', '新分组', (name) => {
      tilesStore.addGroup(name)
    })
  }
}

// 监听来自 UserBar 的新增分组事件
onMounted(() => {
  window.addEventListener('add-tile-group', ((e: CustomEvent) => {
    if (e.detail?.name) {
      tilesStore.addGroup(e.detail.name)
    }
  }) as EventListener)
})
</script>

<style scoped>
.tile-grid {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-content: flex-start;
  padding: 16px 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.tile-grid::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.tile-group-section::-webkit-scrollbar {
  width: 0;
  transition: width 0.2s ease;
}

.tile-group-section:hover::-webkit-scrollbar {
  width: 8px;
}

.tile-group-section::-webkit-scrollbar-track {
  background: transparent;
  margin: 6px 0;
}

.tile-group-section::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  margin: 0 6px;
}

.tile-group-section::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.tile-group-section {
  flex-shrink: 0;
  width: 460px; /* 6列磁贴450 + 10边距 */
  max-height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
  scrollbar-gutter: stable;
  margin-bottom: 16px;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 0 4px;
}

.group-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 2px 6px;
  margin-left: -6px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.group-name:hover {
  background: var(--item-hover, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #fff);
}

/* CSS Grid 磁贴布局 - 基于 Win10 真实网格 */
.tile-grid-inner {
  position: relative;
  display: grid;
  /* 每组 6 列宽（等于 3 个中磁贴） */
  grid-template-columns: repeat(6, var(--tile-small));
  grid-auto-rows: var(--tile-small);
  gap: var(--tile-gap);
  align-content: start;
  min-height: 200px; /* 空分组也有足够高度接收拖拽 */
}

/* 拖拽时显示浅网格线（对齐到单元格起点=磁贴左边缘） */
.tile-grid-inner,
.tile-grid-inner.dragging {
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 76px 76px;
  border-radius: 2px;
}

/* 安卓风格浮动磁贴 */
.tile-float-ghost {
  position: fixed;
  pointer-events: none;
  z-index: 10002;
  transform: translate(-50%, -50%) scale(1.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: rgba(35, 55, 80, 0.92);
  color: #fff;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.12);
  transition: scale 0.12s ease;
  overflow: hidden;
}
.tile-float-ghost.size-small { width: 70px; height: 70px; }
.tile-float-ghost.size-medium { width: 146px; height: 146px; }
.tile-float-ghost.size-wide { width: 298px; height: 146px; }
.float-icon {
  width: 48px; height: 48px;
  background-size: contain; background-repeat: no-repeat; background-position: center;
}
.float-icon-ph {
  background: var(--accent-color, #0078d7);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 600;
}
.float-name { margin-top: 8px; font-size: 12px; text-align: center; padding: 0 6px; }
.tile-float-ghost.size-small .float-name { display: none; }

/* 磁贴尺寸对应的网格跨度（以小磁贴为单位） */
.tile-grid-inner > .size-small {
  grid-column: span 1;
  grid-row: span 1;
}

.tile-grid-inner > .size-medium {
  grid-column: span 2;
  grid-row: span 2;
}

.tile-grid-inner > .size-wide {
  grid-column: span 4;
  grid-row: span 2;
}
</style>
