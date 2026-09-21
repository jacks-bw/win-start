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
      <button class="customize-btn" @click="showWallpaperDialog = true">
        <span>🎨</span> 自定义
      </button>
    </div>

    <!-- 磁贴壁纸设置对话框 -->
    <div v-if="showWallpaperDialog" class="wallpaper-overlay" @click.self="showWallpaperDialog = false">
      <div class="wallpaper-dialog">
        <div class="wallpaper-header">
          <span>磁贴壁纸设置</span>
          <button class="close-btn" @click="showWallpaperDialog = false">×</button>
        </div>

        <div class="wallpaper-body">
          <!-- 左侧：磁贴布局预览 -->
          <div class="wallpaper-preview">
            <div
              v-for="group in tilesStore.groups"
              :key="group.id"
              class="preview-group"
            >
              <div class="preview-group-name">{{ group.name }}</div>
              <div class="preview-grid">
                <div
                  v-for="tile in sortedTiles(group)"
                  :key="tile.id"
                  class="preview-tile"
                  :class="`size-${tile.size}`"
                  :style="{
                    backgroundImage: tile.background ? `url(${tile.background})` : 'rgba(255,255,255,0.1)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    cursor: 'pointer'
                  }"
                  @click="selectedTileId = tile.id"
                ></div>
              </div>
            </div>
          </div>

          <!-- 右侧：操作区 -->
          <div class="wallpaper-actions">
            <div v-if="selectedTile" class="selected-tile-info">
              <div class="tile-name">{{ selectedTileName }}</div>
              <div class="tile-size">尺寸：{{ sizeName[selectedTile.size] }}</div>
            </div>

            <button class="action-btn" @click="selectTileImage">
              📷 选择图片
            </button>
            <button
              v-if="selectedTile?.background"
              class="action-btn danger"
              @click="clearTileBackground"
            >
              🗑️ 清除背景
            </button>
            <button class="action-btn" @click="clearAllBackgrounds">
              🧹 清除全部背景
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
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

// ========== 磁贴壁纸功能 ==========
const showWallpaperDialog = ref(false)
const selectedTileId = ref<string | null>(null)

const selectedTile = computed(() => {
  if (!selectedTileId.value) return null
  for (const group of tilesStore.groups) {
    const tile = group.tiles.find((t) => t.id === selectedTileId.value)
    if (tile) return tile
  }
  return null
})

const selectedTileName = computed(() => {
  if (!selectedTile.value) return ''
  const app = appsStore.apps.find((a) => a.id === selectedTile.value!.appId)
  return app?.name || selectedTile.value.appId
})

const sizeName: Record<string, string> = {
  small: '小',
  medium: '中',
  wide: '宽',
  large: '大'
}

async function selectTileImage() {
  if (!selectedTileId.value) return
  const filePath = await window.electronAPI.selectImage()
  if (filePath) {
    tilesStore.setTileBackground(selectedTileId.value, filePath)
  }
}

function clearTileBackground() {
  if (selectedTileId.value) {
    tilesStore.setTileBackground(selectedTileId.value, undefined)
  }
}

function clearAllBackgrounds() {
  tilesStore.clearAllBackgrounds()
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

.tile-group-section::-webkit-scrollbar {
  width: 8px;
}

.tile-group-section::-webkit-scrollbar-track {
  background: transparent;
}

.tile-group-section::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.tile-group-section::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.tile-group-section {
  flex-shrink: 0;
  width: 460px; /* 6列磁贴450 + 10边距 */
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
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

.customize-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: 2px;
  cursor: pointer;
  font-size: var(--font-size-base);
  transition: color 0.1s ease;
}

.customize-btn:hover {
  background: var(--item-hover);
  color: var(--text-primary);
}

/* 磁贴壁纸设置对话框 */
.wallpaper-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wallpaper-dialog {
  background: rgba(40, 40, 40, 0.95);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.wallpaper-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
}

.close-btn:hover {
  color: var(--text-primary);
}

.wallpaper-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.wallpaper-preview {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
}

.preview-group {
  margin-bottom: 16px;
}

.preview-group-name {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(6, 40px);
  grid-auto-rows: 40px;
  gap: 4px;
}

.preview-tile.size-small { grid-column: span 1; grid-row: span 1; }
.preview-tile.size-medium { grid-column: span 2; grid-row: span 2; }
.preview-tile.size-wide { grid-column: span 4; grid-row: span 2; }
.preview-tile.size-large { grid-column: span 4; grid-row: span 4; }

.preview-tile {
  border-radius: 2px;
  transition: outline 0.1s ease;
}

.preview-tile:hover {
  outline: 2px solid var(--accent-color);
}

.wallpaper-actions {
  width: 180px;
  padding: 16px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.selected-tile-info {
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  margin-bottom: 8px;
}

.tile-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.tile-size {
  font-size: 11px;
  color: var(--text-secondary);
}

.action-btn {
  background: var(--item-hover);
  border: none;
  color: var(--text-primary);
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  transition: background 0.1s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.action-btn.danger {
  color: #ff8080;
}

.action-btn.danger:hover {
  background: rgba(255, 100, 100, 0.2);
}
</style>
