<template>
  <div class="tile-grid">
    <div v-for="group in tilesStore.groups" :key="group.id" class="tile-group-section">
      <!-- 分组标题 -->
      <div class="group-header">
        <span class="group-name">{{ group.name }}</span>
        <button class="edit-group-btn" @click="renameGroup(group)">编辑</button>
      </div>

      <!-- 磁贴网格 -->
      <div class="tile-grid-inner">
        <LiveTile
          v-for="tile in sortedTiles(group)"
          :key="tile.id"
          :tile="tile"
          @click="handleTileClick(tile)"
          @contextmenu="handleTileContextMenu($event, tile.id)"
        />
      </div>
    </div>

    <!-- 添加分组按钮 -->
    <div class="add-group-section">
      <button class="add-group-btn" @click="addGroup">
        <span>+</span> 自定义
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTilesStore } from '../../stores/useTiles'
import LiveTile from './LiveTile.vue'

const tilesStore = useTilesStore()

function sortedTiles(group: TileGroup): TileItem[] {
  return [...group.tiles].sort((a, b) => a.position - b.position)
}

function handleTileClick(tile: TileItem) {
  // TODO: 根据 appId 查找并启动对应应用
  console.log('点击磁贴:', tile.appId)
}

function handleTileContextMenu(e: MouseEvent, tileId: string) {
  e.preventDefault()
  e.stopPropagation()
  if (window.openTileContextMenu) {
    window.openTileContextMenu(e.clientX, e.clientY, tileId)
  }
}

function renameGroup(group: TileGroup) {
  const newName = prompt('输入新的分组名称:', group.name)
  if (newName && newName.trim()) {
    tilesStore.renameGroup(group.id, newName.trim())
  }
}

function addGroup() {
  const name = prompt('输入新分组名称:', '新分组')
  if (name && name.trim()) {
    tilesStore.addGroup(name.trim())
  }
}
</script>

<style scoped>
.tile-grid {
  padding: 20px 16px;
  height: 100%;
  overflow-y: auto;
}

.tile-grid::-webkit-scrollbar {
  width: 6px;
}

.tile-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.tile-group-section {
  margin-bottom: 24px;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 4px;
}

.group-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.edit-group-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.1s ease;
}

.edit-group-btn:hover {
  background: var(--item-hover);
  color: var(--text-primary);
}

.tile-grid-inner {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tile-gap);
  align-content: flex-start;
}

.add-group-section {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.add-group-btn {
  background: transparent;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  color: var(--text-secondary);
  padding: 10px 20px;
  border-radius: 2px;
  cursor: pointer;
  font-size: var(--font-size-base);
  transition: all 0.1s ease;
}

.add-group-btn:hover {
  background: var(--item-hover);
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.4);
}
</style>
