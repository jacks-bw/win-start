<template>
  <div
    class="app-context-menu"
    :style="{ left: x + 'px', top: y + 'px' }"
    @click.stop
    @contextmenu.prevent
  >
    <div class="menu-item" @click="handlePinToStart">
      <span class="menu-label">{{ isPinnedToStart ? '从"开始"屏幕取消固定' : '固定到"开始"屏幕' }}</span>
    </div>

    <div class="menu-item" @click="handlePinTaskbar">
      <span class="menu-label">固定到任务栏</span>
    </div>

    <div class="menu-divider"></div>

    <div class="menu-item" @click="handleOpenLocation">
      <span class="menu-label">打开文件位置</span>
    </div>

    <div class="menu-item" @click="handleUninstall">
      <span class="menu-label">卸载</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTilesStore } from '../../stores/useTiles'

const props = defineProps<{
  x: number
  y: number
  app: AppItem
}>()

const emit = defineEmits<{
  close: []
}>()

const tilesStore = useTilesStore()

// 检查该程序是否已经固定为磁贴
const isPinnedToStart = computed(() => {
  for (const group of tilesStore.groups) {
    if (group.tiles.some((t) => t.appId === props.app.id)) {
      return true
    }
  }
  return false
})

function handlePinToStart() {
  if (isPinnedToStart.value) {
    // 从所有分组中移除该程序的磁贴
    tilesStore.groups.forEach((group) => {
      const idx = group.tiles.findIndex((t) => t.appId === props.app.id)
      if (idx >= 0) {
        group.tiles.splice(idx, 1)
      }
    })
    tilesStore.saveLayout()
  } else {
    // 添加到第一个分组
    const firstGroup = tilesStore.groups[0]
    if (firstGroup) {
      tilesStore.addTile(firstGroup.id, props.app.id, 'medium')
    }
  }
  emit('close')
}

function handlePinTaskbar() {
  // 调用 IPC 固定到任务栏
  window.electronAPI.pinToTaskbar(props.app.lnkPath)
  emit('close')
}

function handleOpenLocation() {
  window.electronAPI.showInFolder(props.app.lnkPath)
  emit('close')
}

function handleUninstall() {
  window.electronAPI.uninstallProgram()
  emit('close')
}
</script>

<style scoped>
.app-context-menu {
  position: fixed;
  min-width: 200px;
  background: rgba(45, 45, 45, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 4px 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  backdrop-filter: blur(20px);
  animation: fadeIn 0.1s ease-out forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #e0e0e0;
  transition: background 0.1s ease;
}

.menu-item:hover {
  background: var(--item-hover);
  color: #fff;
}

.menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}
</style>
