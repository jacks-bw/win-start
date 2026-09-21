<template>
  <div
    class="app-context-menu"
    :style="{ left: x + 'px', top: y + 'px' }"
    @click.stop
    @contextmenu.prevent
  >
    <div class="menu-item" @click="handlePin">
      <span class="menu-label">{{ app.pinned ? '从"开始"菜单取消固定' : '固定到"开始"菜单' }}</span>
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
import { useAppsStore } from '../../stores/useApps'

const props = defineProps<{
  x: number
  y: number
  app: AppItem
}>()

const emit = defineEmits<{
  close: []
}>()

const appsStore = useAppsStore()

function handlePin() {
  appsStore.togglePin(props.app.id)
  emit('close')
}

function handlePinTaskbar() {
  console.log('固定到任务栏:', props.app.name)
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
