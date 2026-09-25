<template>
  <div
    class="context-menu"
    :style="{ left: x + 'px', top: y + 'px' }"
    @click.stop
    @contextmenu.prevent
  >
    <div class="menu-section">
      <div class="menu-item" @click="handleResize('small')">
        <span class="menu-label">调整大小</span>
        <span class="menu-submenu">›</span>
      </div>
      <!-- 大小子菜单 -->
      <div class="submenu">
        <div class="submenu-item" @click="handleResize('small')">小</div>
        <div class="submenu-item" @click="handleResize('medium')">中</div>
        <div class="submenu-item" @click="handleResize('wide')">宽</div>
      </div>
    </div>

    <div class="menu-divider"></div>

    <div class="menu-item" @click="handleLiveToggle">
      <span class="menu-label">
        {{ tile?.liveEnabled ? '关闭实时动态磁贴' : '开启实时动态磁贴' }}
      </span>
    </div>

    <div class="menu-item" @click="handleUnpin">
      <span class="menu-label">从"开始"屏幕取消固定</span>
    </div>

    <div class="menu-divider"></div>

    <div class="menu-item" @click="handlePinTaskbar">
      <span class="menu-label">固定到任务栏</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTilesStore } from '../../stores/useTiles'

const props = defineProps<{
  x: number
  y: number
  tileId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const tilesStore = useTilesStore()

const tile = computed(() => {
  for (const group of tilesStore.groups) {
    const found = group.tiles.find((t) => t.id === props.tileId)
    if (found) return found
  }
  return null
})

function handleResize(size: 'small' | 'medium' | 'wide') {
  tilesStore.resizeTile(props.tileId, size)
  emit('close')
}

function handleLiveToggle() {
  tilesStore.toggleLiveTile(props.tileId)
  emit('close')
}

function handleUnpin() {
  tilesStore.removeTile(props.tileId)
  emit('close')
}

function handlePinTaskbar() {
  console.log('固定到任务栏:', props.tileId)
  emit('close')
}
</script>

<style scoped>
.context-menu {
  position: fixed;
  min-width: 220px;
  background: rgba(45, 45, 45, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 4px 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  backdrop-filter: blur(20px);
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.1s ease;
}

.menu-item:hover {
  background: var(--item-hover);
}

.menu-label {
  flex: 1;
}

.menu-submenu {
  opacity: 0.6;
  font-size: 14px;
}

.menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

.submenu {
  background: rgba(35, 35, 35, 0.98);
  border-radius: 2px;
  padding: 2px 0;
}

.submenu-item {
  padding: 6px 24px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.submenu-item:hover {
  background: var(--item-hover);
}
</style>
