<template>
  <div class="wallpaper-window">
    <div class="wallpaper-header">
      <span class="title">磁贴壁纸设置</span>
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
              :class="[`size-${tile.size}`, { selected: selectedTileId === tile.id }]"
              :style="{
                backgroundImage: tile.background ? `url(file://${tile.background})` : undefined,
                backgroundColor: tile.background ? undefined : 'rgba(255,255,255,0.1)',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
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
        <div v-else class="no-selection">
          点击左侧磁贴选择
        </div>

        <button class="action-btn" :disabled="!selectedTile" @click="selectTileImage">
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
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTilesStore } from './stores/useTiles'
import { useAppsStore } from './stores/useApps'

const tilesStore = useTilesStore()
const appsStore = useAppsStore()

const selectedTileId = ref<string | null>(null)

const sizeSpan: Record<string, { rows: number; cols: number }> = {
  small: { rows: 1, cols: 1 },
  medium: { rows: 2, cols: 2 },
  wide: { rows: 2, cols: 4 },
  large: { rows: 4, cols: 4 }
}

const sizeName: Record<string, string> = {
  small: '小',
  medium: '中',
  wide: '宽',
  large: '大'
}

function sortedTiles(group: TileGroup) {
  return [...group.tiles].sort((a, b) => a.row * 100 + a.col - (b.row * 100 + b.col))
}

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
.wallpaper-window {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.wallpaper-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: #252525;
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.wallpaper-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.wallpaper-preview {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #1a1a1a;
}

.preview-group {
  margin-bottom: 24px;
}

.preview-group-name {
  font-size: 12px;
  color: #888;
  margin-bottom: 10px;
  font-weight: 600;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(6, 50px);
  grid-auto-rows: 50px;
  gap: 5px;
}

.preview-tile.size-small { grid-column: span 1; grid-row: span 1; }
.preview-tile.size-medium { grid-column: span 2; grid-row: span 2; }
.preview-tile.size-wide { grid-column: span 4; grid-row: span 2; }
.preview-tile.size-large { grid-column: span 4; grid-row: span 4; }

.preview-tile {
  border-radius: 3px;
  cursor: pointer;
  transition: outline 0.1s ease, transform 0.1s ease;
  border: 2px solid transparent;
}

.preview-tile:hover {
  transform: scale(0.98);
}

.preview-tile.selected {
  border-color: #0078d7;
  box-shadow: 0 0 0 2px rgba(0, 120, 215, 0.3);
}

.wallpaper-actions {
  width: 200px;
  padding: 20px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  background: #252525;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selected-tile-info {
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  margin-bottom: 8px;
}

.tile-name {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.tile-size {
  font-size: 12px;
  color: #888;
}

.no-selection {
  padding: 12px;
  text-align: center;
  color: #666;
  font-size: 12px;
  margin-bottom: 8px;
}

.action-btn {
  background: #333;
  border: none;
  color: #e0e0e0;
  padding: 10px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  transition: background 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background: #444;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn.danger {
  color: #ff8080;
}

.action-btn.danger:hover {
  background: rgba(255, 100, 100, 0.15);
}
</style>
