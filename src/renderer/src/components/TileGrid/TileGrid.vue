<template>
  <div class="tile-grid">
    <div v-for="group in tilesStore.groups" :key="group.id" class="tile-group-section">
      <!-- 分组标题 -->
      <div class="group-header">
        <span class="group-name">{{ group.name }}</span>
        <button class="edit-group-btn" @click="renameGroup(group)">编辑</button>
      </div>

      <!-- 磁贴网格 - 使用 CSS Grid -->
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
import { useAppsStore } from '../../stores/useApps'
import LiveTile from './LiveTile.vue'

const tilesStore = useTilesStore()
const appsStore = useAppsStore()

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
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.tile-grid::-webkit-scrollbar {
  width: 6px;
}

.tile-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.tile-group-section {
  margin-bottom: 20px;
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

/* CSS Grid 磁贴布局 - 基于 Win10 真实网格 */
.tile-grid-inner {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--tile-medium));
  gap: var(--tile-gap);
  align-content: start;
}

/* 磁贴尺寸通过 LiveTile 组件内部类控制 grid-column-span */
.tile-grid-inner > * {
  grid-column: span 1;
}

.tile-grid-inner > .size-wide {
  grid-column: span 2;
}

.tile-grid-inner > .size-large {
  grid-column: span 2;
  grid-row: span 2;
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
