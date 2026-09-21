<template>
  <div class="start-menu" :class="{ visible: isVisible }">
    <!-- 左侧：Win7 风格程序列表 -->
    <div class="app-list-panel" :style="{ width: appListWidth + 'px' }">
      <AppList />
    </div>

    <!-- 拖拽分割线 -->
    <div class="resizer" @mousedown="startDrag"></div>

    <!-- 右侧：Win10 磁贴区 -->
    <div class="tile-grid-panel">
      <TileGrid />
    </div>

    <!-- 右键菜单（磁贴） -->
    <TileContextMenu
      v-if="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :tile-id="contextMenu.tileId"
      @close="contextMenu.visible = false"
    />

    <!-- 右键菜单（程序列表） -->
    <AppContextMenu
      v-if="appContextMenu.visible && appContextMenu.app"
      :x="appContextMenu.x"
      :y="appContextMenu.y"
      :app="appContextMenu.app"
      @close="appContextMenu.visible = false"
    />

    <!-- 右下角 resize 手柄 -->
    <div class="window-resize-handle"></div>

    <!-- 自定义确认对话框（替代 prompt） -->
    <div v-if="inputDialog.visible" class="dialog-overlay" @click.self="closeInputDialog">
      <div class="dialog-box">
        <div class="dialog-title">{{ inputDialog.title }}</div>
        <input
          v-model="inputDialog.value"
          class="dialog-input"
          @keyup.enter="confirmInputDialog"
          ref="dialogInputRef"
        />
        <div class="dialog-buttons">
          <button class="dialog-btn" @click="closeInputDialog">取消</button>
          <button class="dialog-btn primary" @click="confirmInputDialog">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import AppList from './components/AppList/AppList.vue'
import TileGrid from './components/TileGrid/TileGrid.vue'
import TileContextMenu from './components/TileGrid/TileContextMenu.vue'
import AppContextMenu from './components/AppList/AppContextMenu.vue'
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

// 左侧程序列表右键菜单
const appContextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  app: null as AppItem | null
})

// 左侧列表宽度（可拖拽调整）
const appListWidth = ref(280)
const isDragging = ref(false)

// 自定义输入对话框
const inputDialog = ref({
  visible: false,
  title: '',
  value: '',
  callback: null as ((value: string) => void) | null
})
const dialogInputRef = ref<HTMLInputElement | null>(null)

// ESC 关闭菜单
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    window.electronAPI.hideMenu()
  }
}

// 拖拽调整宽度
function startDrag(e: MouseEvent) {
  isDragging.value = true
  const startX = e.clientX
  const startWidth = appListWidth.value

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging.value) return
    const delta = e.clientX - startX
    const newWidth = Math.max(200, Math.min(450, startWidth + delta))
    appListWidth.value = newWidth
  }

  const onMouseUp = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// 自定义 prompt 替代
function showInputDialog(title: string, defaultValue: string, callback: (value: string) => void) {
  inputDialog.value = {
    visible: true,
    title,
    value: defaultValue,
    callback
  }
  nextTick(() => {
    dialogInputRef.value?.focus()
    dialogInputRef.value?.select()
  })
}

function closeInputDialog() {
  inputDialog.value.visible = false
  inputDialog.value.callback = null
}

function confirmInputDialog() {
  if (inputDialog.value.callback && inputDialog.value.value.trim()) {
    inputDialog.value.callback(inputDialog.value.value.trim())
  }
  closeInputDialog()
}

// 暴露方法给子组件
window.openTileContextMenu = (x: number, y: number, tileId: string) => {
  // 右键菜单大约 220px 宽，280px 高，防止超出窗口边界
  const menuWidth = 240
  const menuHeight = 300
  const maxX = window.innerWidth - menuWidth - 4
  const maxY = window.innerHeight - menuHeight - 4
  const adjustedX = Math.min(x, maxX)
  const adjustedY = Math.min(y, maxY)
  contextMenu.value = { visible: true, x: adjustedX, y: adjustedY, tileId }
}

window.showInputDialog = showInputDialog

// 左侧程序列表右键菜单
window.openAppContextMenu = (x: number, y: number, app: AppItem) => {
  const menuWidth = 200
  const menuHeight = 200
  const maxX = window.innerWidth - menuWidth - 4
  const maxY = window.innerHeight - menuHeight - 4
  const adjustedX = Math.min(x, maxX)
  const adjustedY = Math.min(y, maxY)
  appContextMenu.value = { visible: true, x: adjustedX, y: adjustedY, app }
}

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

  window.addEventListener('keydown', handleKeydown)

  // 点击任意位置关闭右键菜单（但点击菜单内部时不关闭）
  const handleGlobalClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    // 检查点击是否发生在菜单内部
    const isInsideMenu = target.closest('.context-menu') || target.closest('.app-context-menu')
    if (isInsideMenu) return

    if (contextMenu.value.visible) {
      contextMenu.value.visible = false
    }
    if (appContextMenu.value.visible) {
      appContextMenu.value.visible = false
    }
  }
  document.addEventListener('mousedown', handleGlobalClick)

  onUnmounted(() => {
    document.removeEventListener('mousedown', handleGlobalClick)
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
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
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  height: 100%;
}

.resizer {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.resizer:hover,
.resizer:active {
  background: var(--accent-color);
}

.tile-grid-panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 右下角窗口 resize 手柄 */
.window-resize-handle {
  position: fixed;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 9999;
  /* Electron 系统级拖拽区域 */
  -webkit-app-region: no-drag;
}

.window-resize-handle::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 8px;
  height: 8px;
  background: transparent;
  border-right: 2px solid rgba(255, 255, 255, 0.3);
  border-bottom: 2px solid rgba(255, 255, 255, 0.3);
  border-bottom-right-radius: 2px;
}

/* 对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dialog-box {
  background: rgba(45, 45, 45, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
  min-width: 300px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.dialog-title {
  font-size: 14px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.dialog-input {
  width: 100%;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  margin-bottom: 16px;
}

.dialog-input:focus {
  border-color: var(--accent-color);
}

.dialog-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-btn {
  padding: 6px 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.dialog-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.dialog-btn.primary {
  background: var(--accent-color);
  border-color: var(--accent-color);
}

.dialog-btn.primary:hover {
  background: var(--accent-hover);
}
</style>
