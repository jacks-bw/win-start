<template>
  <!-- 壁纸设置窗口 -->
  <WallpaperWindow v-if="isWallpaperRoute" />

  <!-- 快捷键设置窗口 -->
  <ShortcutsWindow v-else-if="isShortcutsRoute" />

  <!-- 头像裁剪窗口 -->
  <AvatarCropWindow v-else-if="isAvatarCropRoute" />

  <!-- 磁贴样式设置窗口（独立窗口） -->
  <TileStyleWindow v-else-if="isTileStyleRoute" />

  <!-- 开始菜单主窗口 -->
  <div v-else class="start-menu" :class="{ visible: isVisible }">
    <!-- 最左侧：纵向工具栏（可自定义功能按钮：文件夹、设置、控制面板等） -->
    <SideToolbar :background="toolbarBg" />

    <!-- 左侧：Win7 风格程序列表 -->
    <div class="app-list-panel" :style="{ width: appListWidth + 'px', background: listPanelBg }">
      <AppList />
    </div>

    <!-- 拖拽分割线 -->
    <div class="resizer" @mousedown="startDrag"></div>

    <!-- 右侧：Win10 磁贴区 -->
    <div class="tile-grid-panel" :style="{ background: tilePanelBg }">
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

    <!-- 右键菜单（分组） -->
    <GroupContextMenu
      v-if="groupMenu.visible"
      :x="groupMenu.x"
      :y="groupMenu.y"
      :group-id="groupMenu.groupId"
      @close="groupMenu.visible = false"
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

    <!-- 自定义输入对话框（替代 prompt） -->
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

    <!-- 自定义确认对话框（替代 confirm / alert） -->
    <div v-if="confirmDialog.visible" class="dialog-overlay">
      <div class="dialog-box">
        <div class="dialog-title">{{ confirmDialog.title }}</div>
        <div v-if="confirmDialog.message" class="dialog-message">{{ confirmDialog.message }}</div>
        <div class="dialog-buttons">
          <button class="dialog-btn" @click="closeConfirmDialog">
            {{ confirmDialog.cancelText || '取消' }}
          </button>
          <button
            class="dialog-btn"
            :class="confirmDialog.danger ? 'danger' : 'primary'"
            @click="confirmDialogOk"
          >
            {{ confirmDialog.confirmText || '确定' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 图片裁剪预览对话框（设置磁贴/分组背景时使用） -->
    <CropImageDialog
      :visible="cropDialog.visible"
      :image-url="cropDialog.imageUrl"
      :target-ratio="cropDialog.targetRatio"
      @cancel="closeCropDialog"
      @confirm="confirmCropDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import AvatarCropWindow from './AvatarCropWindow.vue'
import AppContextMenu from './components/AppList/AppContextMenu.vue'
import AppList from './components/AppList/AppList.vue'
import CropImageDialog from './components/CropImageDialog.vue'
import TileStyleWindow from './TileStyleWindow.vue'
import TileContextMenu from './components/TileGrid/TileContextMenu.vue'
import GroupContextMenu from './components/TileGrid/GroupContextMenu.vue'
import TileGrid from './components/TileGrid/TileGrid.vue'
import ShortcutsWindow from './ShortcutsWindow.vue'
import SideToolbar from './components/SideToolbar/SideToolbar.vue'
import { useAppsStore } from './stores/useApps'
import { useSettingsStore } from './stores/useSettings'
import { useTilesStore } from './stores/useTiles'
import WallpaperWindow from './WallpaperWindow.vue'

const appsStore = useAppsStore()
const tilesStore = useTilesStore()
const settingsStore = useSettingsStore()

// 根据透明度设置动态计算两个面板的背景色
const listPanelBg = computed(() => `rgba(32, 32, 32, ${settingsStore.getListAlpha()})`)
// 侧边工具栏背景：比列表区略深一档，形成独立的竖条视觉
const toolbarBg = computed(() => `rgba(22, 22, 22, ${settingsStore.getListAlpha()})`)
const tilePanelBg = computed(() => 'transparent')

// 判断是否是壁纸设置窗口（通过 hash 路由）
const isWallpaperRoute = computed(() => window.location.hash.includes('/wallpaper'))

// 判断是否是快捷键设置窗口（通过 hash 路由）
const isShortcutsRoute = computed(() => window.location.hash.includes('/shortcuts'))

// 判断是否是头像裁剪窗口（通过 hash 路由）
const isAvatarCropRoute = computed(() => window.location.hash.includes('/avatar-crop'))

// 判断是否是磁贴样式设置窗口（通过 hash 路由）
const isTileStyleRoute = computed(() => window.location.hash.includes('/tile-style'))

const isVisible = ref(false)
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  tileId: ''
})

// 分组右键菜单
const groupMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  groupId: ''
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

// 自定义确认对话框
const confirmDialog = ref({
  visible: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  callback: null as (() => void) | null
})

// 图片裁剪对话框（设置磁贴/分组背景时使用）
const cropDialog = ref({
  visible: false,
  imageUrl: '',
  targetRatio: 1,
  callback: null as ((dataUrl: string) => void) | null
})

// ESC 关闭：优先关闭弹窗/菜单，其次隐藏开始菜单
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (cropDialog.value.visible) {
      closeCropDialog()
      return
    }
    if (confirmDialog.value.visible) {
      closeConfirmDialog()
      return
    }
    if (inputDialog.value.visible) {
      closeInputDialog()
      return
    }
    if (contextMenu.value.visible) {
      contextMenu.value.visible = false
      return
    }
    if (appContextMenu.value.visible) {
      appContextMenu.value.visible = false
      return
    }
    window.electronAPI.hideMenu()
  }
  // Enter 确认对话框主操作
  if (e.key === 'Enter' && confirmDialog.value.visible) {
    confirmDialogOk()
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
    const newWidth = Math.max(200, Math.min(420, startWidth + delta))
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

// 全局确认对话框（替代 confirm/alert）
function showConfirmDialog(options: {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
}) {
  confirmDialog.value = {
    visible: true,
    title: options.title,
    message: options.message || '',
    confirmText: options.confirmText || '确定',
    cancelText: options.cancelText || '取消',
    danger: options.danger || false,
    callback: options.onConfirm
  }
}

function closeConfirmDialog() {
  confirmDialog.value.visible = false
  confirmDialog.value.callback = null
}

function confirmDialogOk() {
  if (confirmDialog.value.callback) {
    confirmDialog.value.callback()
  }
  closeConfirmDialog()
}

// 菜单隐藏时无条件取消所有未完成的对话框（不触发回调，等同用户点取消）
function cancelAllTransientDialogs() {
  inputDialog.value.visible = false
  inputDialog.value.callback = null
  confirmDialog.value.visible = false
  confirmDialog.value.callback = null
  cropDialog.value.visible = false
  cropDialog.value.callback = null
}

// 图片裁剪对话框：打开后用户裁剪/预览，确定后回调裁剪出的 dataURL
function openImageCropDialog(
  imageUrl: string,
  targetRatio: number,
  callback: (dataUrl: string) => void
) {
  // 忙碌锁：裁剪期间开始菜单不因点外部而关闭
  window.electronAPI.setMenuBusy(true)
  cropDialog.value = {
    visible: true,
    imageUrl,
    targetRatio: targetRatio || 1,
    callback
  }
}

function closeCropDialog() {
  cropDialog.value.visible = false
  cropDialog.value.callback = null
  // 裁剪流程结束，解除忙碌锁，菜单可正常关闭
  window.electronAPI.setMenuBusy(false)
}

function confirmCropDialog(dataUrl: string) {
  const cb = cropDialog.value.callback
  closeCropDialog()
  if (cb) cb(dataUrl)
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

// 分组右键菜单
window.openGroupContextMenu = (x: number, y: number, groupId: string) => {
  const menuWidth = 220
  const menuHeight = 180
  const maxX = window.innerWidth - menuWidth - 4
  const maxY = window.innerHeight - menuHeight - 4
  groupMenu.value = {
    visible: true,
    x: Math.min(x, maxX),
    y: Math.min(y, maxY),
    groupId
  }
}

window.showInputDialog = showInputDialog
window.showConfirmDialog = showConfirmDialog
window.openImageCrop = openImageCropDialog

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

// 应用系统主题色到 CSS 变量
function applyAccentColor(color: string) {
  const root = document.documentElement
  root.style.setProperty('--accent-color', color)
  // 设置 RGB 分量，方便用 rgba(var(--accent-color-rgb), alpha) 控制透明度
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  root.style.setProperty('--accent-color-rgb', `${r}, ${g}, ${b}`)
  // 计算 hover 颜色（变暗 15%）
  const hoverColor = darkenColor(color, 0.15)
  root.style.setProperty('--accent-hover', hoverColor)
}

// 颜色变暗工具函数
function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const dr = Math.round(r * (1 - amount))
  const dg = Math.round(g * (1 - amount))
  const db = Math.round(b * (1 - amount))
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`
}

// 清理列表中已不存在的应用对应的死磁贴和死固定（卸载软件后调用）
function pruneDeadReferences() {
  if (appsStore.apps.length === 0) return
  const validIds = new Set(appsStore.apps.map((a) => a.id))
  // 移除指向已卸载应用的磁贴
  for (const group of tilesStore.groups) {
    const dead = group.tiles.filter((t) => !validIds.has(t.appId))
    for (const t of dead) {
      tilesStore.removeTile(t.id)
    }
  }
  // 清理固定状态里的死引用
  appsStore.pinnedApps = appsStore.pinnedApps.filter((id) => validIds.has(id))
}

// 菜单打开后的惰性重扫定时器：菜单快速闪关时取消，不发起后台扫描
let refreshTimer: ReturnType<typeof setTimeout> | undefined

onMounted(async () => {
  // 加载数据
  await Promise.all([appsStore.loadApps(), tilesStore.loadLayout(), settingsStore.loadTileOpacity()])
  // 清理死磁贴和死固定
  pruneDeadReferences()

  // 应用系统主题色
  applyAccentColor(await window.electronAPI.getAccentColor())

  // 监听系统主题色变化
  window.electronAPI.onAccentColorChanged((color) => {
    applyAccentColor(color)
  })

  // 监听磁贴透明度变化
  window.electronAPI.onTileOpacityChanged((opacity) => {
    settingsStore.tileOpacity = opacity
  })

  // 监听磁贴桥接服务事件（第三方软件推送内容）
  window.electronAPI.onTileBridgeUpdate((data) => {
    if (data?.appId) {
      tilesStore.setExternalTileData(data.appId, data)
    }
  })
  window.electronAPI.onTileBridgeClear((data) => {
    if (data?.appId) {
      tilesStore.clearExternalTileData(data.appId)
    }
  })

  // 监听菜单打开/关闭事件
  window.electronAPI.onMenuOpen(() => {
    isVisible.value = true
    // 默认聚焦搜索框
    window.dispatchEvent(new CustomEvent('start-menu:opened'))
    // 菜单保持打开 400ms 后才后台惰性重扫（60s 内只扫一次）；
    // 快速闪一下菜单就关闭的话会在 onMenuClose 里取消
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      appsStore.maybeRefreshApps().then(() => pruneDeadReferences())
    }, 400)
  })

  window.electronAPI.onMenuClose(() => {
    isVisible.value = false
    // 取消尚未发起的后台重扫
    clearTimeout(refreshTimer)
    // 菜单被隐藏（点外部区域/ESC/启动程序）时，一并取消所有未完成的
    // 对话框和右键菜单，避免下次打开时残留
    cancelAllTransientDialogs()
    contextMenu.value.visible = false
    groupMenu.value.visible = false
    appContextMenu.value.visible = false
    // 通知子组件清理各自的弹出层（工具栏菜单、文件夹菜单、字母面板等）
    window.dispatchEvent(new CustomEvent('start-menu:closing'))
  })

  // 监听布局更新事件（壁纸窗口保存后通知）
  window.electronAPI.onLayoutUpdated(() => {
    tilesStore.loadLayout()
  })

  // 监听开始菜单应用列表变化（安装/卸载软件后自动刷新）
  window.electronAPI.onAppsChanged(async () => {
    await appsStore.loadApps()
    // 刷新后清理死磁贴和死固定
    pruneDeadReferences()
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
    if (groupMenu.value.visible) {
      groupMenu.value.visible = false
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
  background: transparent;
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
  min-width: 520px; /* 磁贴区最小宽度：1组450 + 70边距 */
  max-width: 960px; /* 2组宽度：460*2 + 间距 */
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
  animation: dialogFadeIn 0.15s ease-out;
}

@keyframes dialogFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes dialogSlideUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dialog-box {
  background: rgba(45, 45, 45, 0.98);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
  min-width: 300px;
  max-width: 380px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  animation: dialogSlideUp 0.15s ease-out;
}

.dialog-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.dialog-message {
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 16px;
  color: var(--text-secondary);
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

.dialog-btn.danger {
  background: #d94c4c;
  border-color: #d94c4c;
}

.dialog-btn.danger:hover {
  background: #b83e3e;
}
</style>
