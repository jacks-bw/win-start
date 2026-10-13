<template>
  <div
    class="context-menu"
    :style="{ left: x + 'px', top: y + 'px' }"
    @click.stop
    @contextmenu.prevent
  >
    <div class="menu-section">
      <div class="menu-item">
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

    <div class="menu-item" @click="handleUnpin">
      <PinOff :size="14" class="menu-icon" />
      <span class="menu-label">从"开始"屏幕取消固定</span>
    </div>

    <div class="menu-item" @click="handleLiveToggle">
      <Zap :size="14" class="menu-icon" />
      <span class="menu-label">
        {{ tile?.liveEnabled ? '关闭实时动态磁贴' : '开启实时动态磁贴' }}
      </span>
    </div>

    <div class="menu-item" @click="handleSetBackground">
      <ImagePlus :size="14" class="menu-icon" />
      <span class="menu-label">设置磁贴背景</span>
    </div>

    <div v-if="canRemoveBg" class="menu-item" @click="handleRemoveBackground">
      <Trash2 :size="14" class="menu-icon" />
      <span class="menu-label">移除磁贴背景</span>
    </div>

    <div v-if="canApplyGroupBg" class="menu-item" @click="handleApplyGroupBg">
      <Layers :size="14" class="menu-icon" />
      <span class="menu-label">应用组背景</span>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PinOff, Zap, ImagePlus, Trash2, Layers } from 'lucide-vue-next'
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

// 有自己的背景，或正在继承组背景（且没被手动清掉）时，都允许"移除"
const canRemoveBg = computed(() => {
  if (!tile.value) return false
  if (tile.value.background) return true
  for (const group of tilesStore.groups) {
    if (group.tiles.find((t) => t.id === props.tileId)) {
      return !!group.background && !(tile.value as Record<string, unknown>).backgroundCleared
    }
  }
  return false
})

// 被手动清空、但所在组仍有组背景时，显示"应用组背景"
const canApplyGroupBg = computed(() => {
  if (!tile.value) return false
  if (tile.value.background) return false
  if (!(tile.value as Record<string, unknown>).backgroundCleared) return false
  for (const group of tilesStore.groups) {
    if (group.tiles.find((t) => t.id === props.tileId)) return !!group.background
  }
  return false
})

function handleResize(size: 'small' | 'medium' | 'wide') {
  tilesStore.resizeTile(props.tileId, size)
  emit('close')
}

function handleLiveToggle() {
  tilesStore.toggleLiveTile(props.tileId)
  emit('close')
}

async function handleSetBackground() {
  // 打开独立的磁贴样式窗口（背景图片 + 图标/名称样式同步设置）
  emit('close')
  try {
    await window.electronAPI.openTileStyleWindow(props.tileId)
  } catch (e) {
    alert('打开磁贴样式窗口失败: ' + (e as any)?.message + ' | ' + String(e))
  }
}

function handleRemoveBackground() {
  tilesStore.setTileBackground(props.tileId, undefined)
  emit('close')
}

function handleApplyGroupBg() {
  tilesStore.applyGroupBackground(props.tileId)
  emit('close')
}

function handleUnpin() {
  tilesStore.removeTile(props.tileId)
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

.menu-icon {
  flex-shrink: 0;
  margin-right: 10px;
  opacity: 0.85;
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
