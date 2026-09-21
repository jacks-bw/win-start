<template>
  <div class="start-menu" :class="{ visible: isVisible }">
    <!-- 左侧：Win7 风格程序列表 -->
    <AppList class="app-list-panel" />

    <!-- 右侧：Win10 磁贴区 -->
    <TileGrid class="tile-grid-panel" />

    <!-- 右键菜单 -->
    <TileContextMenu
      v-if="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :tile-id="contextMenu.tileId"
      @close="contextMenu.visible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import AppList from './components/AppList/AppList.vue'
import TileGrid from './components/TileGrid/TileGrid.vue'
import TileContextMenu from './components/TileGrid/TileContextMenu.vue'
import { useAppsStore } from './stores/useApps'
import { useTilesStore } from './stores/useTiles'

const appsStore = useAppsStore()
const tilesStore = useTilesStore()

const isVisible = ref(false)
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  tileId: ''
})

onMounted(async () => {
  // 加载数据
  await Promise.all([appsStore.loadApps(), tilesStore.loadLayout()])

  // 监听菜单打开/关闭事件
  window.electronAPI.onMenuOpen(() => {
    isVisible.value = true
  })

  window.electronAPI.onMenuClose(() => {
    isVisible.value = false
  })

  // 按 ESC 关闭菜单
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      window.electronAPI.hideMenu()
    }
  }
  window.addEventListener('keydown', handleKeydown)

  // 暴露右键菜单打开方法给子组件
  window.openTileContextMenu = (x: number, y: number, tileId: string) => {
    contextMenu.value = { visible: true, x, y, tileId }
  }

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
})
</script>

<style scoped>
.start-menu {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--bg-dark);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.start-menu.visible {
  opacity: 1;
  transform: translateY(0);
}

.app-list-panel {
  width: var(--app-list-width);
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.tile-grid-panel {
  flex: 1;
  overflow-y: auto;
}
</style>
