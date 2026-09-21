<template>
  <div class="tile-grid">
    <div v-for="group in tilesStore.groups" :key="group.id" class="tile-group-section">
      <!-- 分组标题 -->
      <div class="group-header" @contextmenu="handleGroupContextMenu($event, group)">
        <span class="group-name">{{ group.name }}</span>
        <div class="group-actions">
          <button class="edit-group-btn" @click.stop="renameGroup(group)">重命名</button>
          <button class="delete-group-btn" @click.stop="deleteGroup(group)">删除</button>
        </div>
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

    <!-- 添加分组按钮 -->
    <div class="add-group-section">
      <button class="add-group-btn" @click="addGroup">
        <span>+</span> 新增
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useTilesStore } from '../../stores/useTiles'
import { useAppsStore } from '../../stores/useApps'
import LiveTile from './LiveTile.vue'

const tilesStore = useTilesStore()
const appsStore = useAppsStore()

// 磁贴尺寸对应的网格跨度（单元格数）
const sizeSpan: Record<string, { rows: number; cols: number }> = {
  small: { rows: 1, cols: 1 },
  medium: { rows: 2, cols: 2 },
  wide: { rows: 2, cols: 4 },
  large: { rows: 4, cols: 4 }
}

// 拖拽预览占位块
const dragPreview = reactive({
  visible: false,
  style: {} as Record<string, string>,
  col: 0,
  row: 0,
  groupId: ''
})

function handleGridDragOver(e: DragEvent) {
  if (!tilesStore.draggingTileId || !tilesStore.draggingTileSize) return
  const grid = e.currentTarget as HTMLElement
  if (!grid) return

  const rect = grid.getBoundingClientRect()
  const cellSize = 76 // tile-small(70) + gap(6)

  const col = Math.floor((e.clientX - rect.left) / cellSize)
  const row = Math.floor((e.clientY - rect.top) / cellSize)

  const span = sizeSpan[tilesStore.draggingTileSize] || { cols: 1, rows: 1 }

  dragPreview.visible = true
  dragPreview.col = col
  dragPreview.row = row
  dragPreview.style = {
    position: 'fixed',
    left: `${rect.left + col * cellSize}px`,
    top: `${rect.top + row * cellSize}px`,
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

function renameGroup(group: TileGroup) {
  if (window.showInputDialog) {
    window.showInputDialog('重命名分组', group.name, (newName) => {
      tilesStore.renameGroup(group.id, newName)
    })
  }
}

function deleteGroup(group: TileGroup) {
  if (tilesStore.groups.length <= 1) {
    window.showConfirmDialog({
      title: '无法删除',
      message: '至少需要保留一个分组。',
      confirmText: '知道了'
    })
    return
  }
  window.showConfirmDialog({
    title: `删除分组"${group.name}"？`,
    message: '组内的磁贴也会一并移除，此操作无法撤销。',
    confirmText: '删除',
    danger: true,
    onConfirm: () => {
      tilesStore.removeGroup(group.id)
    }
  })
}

function handleGroupContextMenu(e: MouseEvent, group: TileGroup) {
  e.preventDefault()
  e.stopPropagation()
  if (tilesStore.groups.length <= 1) return
  window.showConfirmDialog({
    title: `删除分组"${group.name}"？`,
    message: '组内的磁贴也会一并移除，此操作无法撤销。',
    confirmText: '删除',
    danger: true,
    onConfirm: () => {
      tilesStore.removeGroup(group.id)
    }
  })
}

function addGroup() {
  if (window.showInputDialog) {
    window.showInputDialog('新建分组', '新分组', (name) => {
      tilesStore.addGroup(name)
    })
  }
}
</script>

<style scoped>
.tile-grid {
  display: flex;
  flex-direction: row;
  padding: 16px 0;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.tile-grid::-webkit-scrollbar {
  height: 6px;
}

.tile-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.tile-group-section {
  flex-shrink: 0;
  width: 450px; /* 6列宽度 */
  padding: 0 12px;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.tile-group-section:first-child {
  padding-left: 16px;
}

.tile-group-section:last-child {
  padding-right: 16px;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 0 4px;
}

.group-header:hover .group-actions {
  opacity: 1;
}

.group-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.group-actions {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.edit-group-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 2px 4px;
  cursor: pointer;
  transition: color 0.1s ease;
}

.edit-group-btn:hover {
  color: var(--text-primary);
}

.delete-group-btn {
  background: transparent;
  border: none;
  color: rgba(255, 150, 150, 0.8);
  font-size: 11px;
  padding: 2px 4px;
  cursor: pointer;
  transition: color 0.1s ease;
}

.delete-group-btn:hover {
  color: #ff8080;
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
.tile-grid-inner.dragging {
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 76px 76px;
  border-radius: 2px;
}

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

.tile-grid-inner > .size-large {
  grid-column: span 4;
  grid-row: span 4;
}

.add-group-section {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 16px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tile-grid:hover .add-group-section {
  opacity: 1;
}

.add-group-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: 2px;
  cursor: pointer;
  font-size: var(--font-size-base);
  transition: color 0.1s ease;
}

.add-group-btn:hover {
  background: var(--item-hover);
  color: var(--text-primary);
}
</style>
