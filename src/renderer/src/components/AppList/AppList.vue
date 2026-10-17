<template>
  <div class="app-list win7-style" @click="closeFolderMenu">
    <!-- 搜索框 -->
    <SearchBox @search="handleSearch" />

    <!-- 程序列表滚动区 -->
    <div class="app-scroll-area">
      <!-- 最近添加 -->
      <div v-if="appsStore.recentApps.length > 0 && !appsStore.searchQuery" class="section">
        <div class="section-title" title="首次完整扫描后新发现的应用，显示 7 天，最多 5 个；并非系统安装时间">最近添加</div>
        <AppItem
          v-for="app in appsStore.recentApps"
          :key="app.id"
          :app="app"
          @mousedown="handleAppMouseDown($event, app)"
          @click="handleLaunch(app)"
          @contextmenu="handleContextMenu($event, app)"
        />
      </div>

      <!-- 已固定 -->
      <div v-if="appsStore.pinnedAppList.length > 0 && !appsStore.searchQuery" class="section">
        <div class="section-title">已固定到"开始"菜单</div>
        <AppItem
          v-for="app in appsStore.pinnedAppList"
          :key="app.id"
          :app="app"
          @mousedown="handleAppMouseDown($event, app)"
          @click="handleLaunch(app)"
          @contextmenu="handleContextMenu($event, app)"
        />
      </div>

      <!-- 所有应用 - 按字母分组 -->
      <div
        class="section all-apps-section"
        :class="{ 'drag-over': dragOverFolderId === '__root__' }"
      >
        <div v-if="!appsStore.searchQuery" class="section-title all-apps-title">
          所有应用
        </div>

        <!-- 文件夹列表 -->
        <FolderItem
          v-for="folder in appsStore.folders"
          :key="folder.id"
          :folder="folder"
          @contextmenu="handleFolderContextMenu($event, folder)"
          @launch-app="handleLaunch"
          @app-contextmenu="handleContextMenu"
          @app-mousedown="handleAppMouseDown"
        />

        <!-- 按字母分组的应用（排除文件夹里的） -->
        <template v-for="group in appsStore.groupedApps" :key="group.group">
          <div
            :id="'letter-group-' + group.group"
            class="letter-header"
            @click="showLetterPicker(group.group)"
          >
            {{ group.group }}
          </div>
          <AppItem
            v-for="app in group.items"
            :key="app.id"
            :app="app"
            @mousedown="handleAppMouseDown($event, app)"
            @click="handleLaunch(app)"
            @contextmenu="handleContextMenu($event, app)"
          />
        </template>
      </div>

      <!-- 空状态 -->
      <div v-if="appsStore.filteredApps.length === 0" class="empty-state">
        未找到匹配的程序
      </div>
    </div>

    <!-- 文件夹右键菜单 -->
    <div
      v-if="folderMenu.visible"
      class="folder-context-menu"
      :style="{ left: folderMenu.x + 'px', top: folderMenu.y + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <div class="menu-item" @click="handleFolderRename">
        <span class="menu-label"><Pencil :size="14" class="menu-icon" /> 重命名</span>
      </div>
      <div
        v-if="!folderMenu.isEmpty"
        class="menu-item"
        @click="handleFolderDissolve"
      >
        <span class="menu-label"><X :size="14" class="menu-icon" /> 解散文件夹</span>
      </div>
      <div
        v-else
        class="menu-item danger"
        @click="handleFolderDelete"
      >
        <span class="menu-label"><Trash2 :size="14" class="menu-icon" /> 删除文件夹</span>
      </div>
    </div>

    <!-- 拖拽跟随浮层 -->
    <div v-if="dragGhost.visible" class="drag-ghost" :style="{ left: dragGhost.x + 'px', top: dragGhost.y + 'px' }">
      <span v-if="dragGhost.icon" class="ghost-icon" :style="{ backgroundImage: `url(${dragGhost.icon})` }"></span>
      <span v-else class="ghost-icon ghost-icon-ph">{{ dragGhost.name.charAt(0).toUpperCase() }}</span>
      <span class="ghost-name">{{ dragGhost.name }}</span>
    </div>

    <!-- 字母跳转面板 -->
    <div
      v-if="letterPicker.visible"
      class="letter-picker-overlay"
      @click="closeLetterPicker"
    >
      <div class="letter-picker" @click.stop>
        <div class="letter-picker-title">跳转到</div>
        <div class="letter-picker-grid">
          <button
            v-for="letter in allLetters"
            :key="letter"
            class="letter-picker-item"
            :class="{ disabled: !availableLetters.has(letter), active: letterPicker.currentLetter === letter }"
            @click="jumpToLetter(letter)"
          >
            {{ letter }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import SearchBox from './SearchBox.vue'
import AppItem from './AppItem.vue'
import FolderItem from './FolderItem.vue'
import { useAppsStore } from '../../stores/useApps'
import { useTilesStore } from '../../stores/useTiles'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Pencil, Trash2, X } from 'lucide-vue-next'

const appsStore = useAppsStore()

// 文件夹右键菜单状态
const folderMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  folderId: '',
  isEmpty: false
})

// 字母跳转面板状态
const letterPicker = ref({
  visible: false,
  currentLetter: ''
})

// 所有字母 A-Z + #
const allLetters = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

// 当前可用的字母（有应用的字母）
const availableLetters = computed(() => {
  const set = new Set<string>()
  appsStore.groupedApps.forEach((g) => set.add(g.group))
  return set
})

function showLetterPicker(currentLetter: string) {
  letterPicker.value = {
    visible: true,
    currentLetter
  }
}

function closeLetterPicker() {
  letterPicker.value.visible = false
}

function jumpToLetter(letter: string) {
  if (!availableLetters.value.has(letter)) return
  const el = document.getElementById('letter-group-' + letter)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  closeLetterPicker()
}

function handleSearch(query: string) {
  appsStore.setSearchQuery(query)
}

function handleLaunch(app: AppItem) {
  appsStore.launchApp(app)
}

function handleContextMenu(e: MouseEvent, app: AppItem) {
  e.preventDefault()
  e.stopPropagation()
  if (window.openAppContextMenu) {
    window.openAppContextMenu(e.clientX, e.clientY, app)
  }
}

// 鼠标拖拽（WebView2 透明窗口不支持 HTML5 DnD，改用鼠标事件模拟）
const dragGhost = ref({ visible: false, x: 0, y: 0, name: '', icon: '' })
const dragState = ref<{ appId: string; startX: number; startY: number; dragging: boolean } | null>(null)
const dragOverFolderId = ref<string | null>(null)

function handleAppMouseDown(e: MouseEvent, app: AppItem) {
  if (e.button !== 0) return
  dragState.value = { appId: app.id, startX: e.clientX, startY: e.clientY, dragging: false }
  window.addEventListener('mousemove', handleAppMouseMove)
  window.addEventListener('mouseup', handleAppMouseUp)
}

function handleAppMouseMove(e: MouseEvent) {
  const st = dragState.value
  if (!st) return
  if (!st.dragging) {
    const dx = e.clientX - st.startX
    const dy = e.clientY - st.startY
    if (Math.sqrt(dx*dx + dy*dy) < 5) return
    st.dragging = true
    const app = appsStore.apps.find(a => a.id === st.appId)
    dragGhost.value = { visible: true, x: e.clientX, y: e.clientY, name: app?.name || '', icon: app?.icon || '' }
  }
  dragGhost.value.x = e.clientX
  dragGhost.value.y = e.clientY
  // 检测鼠标下的文件夹
  dragOverFolderId.value = null
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
  const header = el?.closest('.folder-header') as HTMLElement | null
  if (header) {
    dragOverFolderId.value = header.dataset.folderId || null
  }
  // 检测是否在"所有应用"区域（移出文件夹）
  const section = el?.closest('.all-apps-section') as HTMLElement | null
  if (section && !header) {
    dragOverFolderId.value = '__root__'
  }
}

function handleAppMouseUp(e: MouseEvent) {
  const st = dragState.value
  window.removeEventListener('mousemove', handleAppMouseMove)
  window.removeEventListener('mouseup', handleAppMouseUp)
  if (st?.dragging && st.appId) {
    const target = dragOverFolderId.value
    if (target === '__root__') {
      appsStore.removeAppFromFolder(st.appId)
    } else if (target) {
      appsStore.moveAppToFolder(st.appId, target)
    } else {
      // 检测是否拖到磁贴区域
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      if (el?.closest('.tile-grid')) {
        const tilesStore = useTilesStore()
        // 已固定的磁贴不允许重复固定
        const exists = tilesStore.allTiles.some((t) => t.appId === st.appId)
        if (!exists) {
          let gid = tilesStore.groups[0]?.id
          if (!gid) {
            tilesStore.addGroup('组1')
            gid = tilesStore.groups[0].id
          }
          tilesStore.addTile(gid, st.appId, 'medium')
        }
      }
    }
  }
  dragState.value = null
  dragOverFolderId.value = null
  dragGhost.value.visible = false
}



function handleFolderContextMenu(e: MouseEvent, folder: AppFolder) {
  e.preventDefault()
  e.stopPropagation()
  folderMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    folderId: folder.id,
    isEmpty: folder.appIds.length === 0
  }
}

function closeFolderMenu() {
  folderMenu.value.visible = false
}

function handleFolderRename() {
  const folder = appsStore.folders.find((f) => f.id === folderMenu.value.folderId)
  if (folder) {
    window.showInputDialog('重命名文件夹', folder.name, (newName: string) => {
      appsStore.renameFolder(folder.id, newName)
    })
  }
  closeFolderMenu()
}

function handleFolderDissolve() {
  const folder = appsStore.folders.find((f) => f.id === folderMenu.value.folderId)
  if (!folder) { closeFolderMenu(); return }
  window.showConfirmDialog({
    title: '解散文件夹',
    message: `确定解散文件夹"${folder.name}"吗？里面的 ${folder.appIds.length} 个应用将移回列表。`,
    confirmText: '解散',
    danger: true,
    onConfirm: () => {
      for (const appId of [...folder.appIds]) {
        appsStore.removeAppFromFolder(appId)
      }
      appsStore.deleteFolder(folder.id)
    }
  })
  closeFolderMenu()
}

function handleFolderDelete() {
  const folder = appsStore.folders.find((f) => f.id === folderMenu.value.folderId)
  if (!folder) {
    closeFolderMenu()
    return
  }
  if (!folderMenu.value.isEmpty) {
    window.showConfirmDialog({
      title: '无法删除',
      message: `文件夹"${folder.name}"不为空，请先移出里面的应用后再删除。`,
      confirmText: '知道了',
      danger: false,
      onConfirm: () => {}
    })
  } else {
    window.showConfirmDialog({
      title: '删除文件夹',
      message: `确定删除文件夹"${folder.name}"吗？`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => {
        appsStore.deleteFolder(folder.id)
      }
    })
  }
  closeFolderMenu()
}

// 开始菜单被隐藏（点外部区域）时，收起文件夹菜单和字母跳转面板
function handleMenuClosing() {
  folderMenu.value.visible = false
  letterPicker.value.visible = false
}

onMounted(() => {
  window.addEventListener('start-menu:closing', handleMenuClosing)
})

onUnmounted(() => {
  window.removeEventListener('start-menu:closing', handleMenuClosing)
  window.removeEventListener('mousemove', handleAppMouseMove)
  window.removeEventListener('mouseup', handleAppMouseUp)
})
</script>

<style scoped>
.app-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

/* Win7 风格：更紧凑的间距和字体 */
.win7-style .app-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.app-scroll-area::-webkit-scrollbar {
  width: 8px;
}

.app-scroll-area::-webkit-scrollbar-track {
  background: transparent;
}

.app-scroll-area::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.app-scroll-area::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.section {
  margin-bottom: 4px;
}

.section-title {
  padding: 8px 20px 4px;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
}

.all-apps-title {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 4px;
  padding-top: 8px;
}

.letter-header {
  padding: 6px 20px 2px;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s ease;
}

.letter-header:hover {
  color: var(--accent-color);
  background: var(--accent-soft);
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.all-apps-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.all-apps-section {
  transition: background 0.15s ease;
  border-radius: 4px;
}

.all-apps-section.drag-over {
  background: var(--accent-soft);
  outline: 1px dashed var(--accent-border);
  outline-offset: -2px;
}

.drag-ghost {
  position: fixed;
  pointer-events: none;
  display: flex;
  align-items: center;
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid var(--accent-border);
  padding: 5px 12px;
  border-radius: 3px;
  font-size: 12.5px;
  color: #e0e0e0;
  z-index: 10001;
  transform: translate(12px, 12px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  max-width: 220px;
}
.ghost-icon {
  width: 20px;
  height: 20px;
  margin-right: 8px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;
}
.ghost-icon-ph {
  background: var(--accent-color, #0078d7);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}
.ghost-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 文件夹右键菜单 */
.folder-context-menu {
  position: fixed;
  background: rgba(45, 45, 45, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 9999;
  backdrop-filter: blur(20px);
}

.folder-context-menu .menu-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  font-size: 13px;
  color: #e0e0e0;
  cursor: pointer;
  transition: background 0.1s ease;
}

.folder-context-menu .menu-item:hover {
  background: var(--accent-active-bg);
  color: #fff;
}

.folder-context-menu .menu-item.danger {
  color: #ff8080;
}

.folder-context-menu .menu-item.danger:hover {
  background: rgba(255, 100, 100, 0.15);
}

.folder-context-menu .menu-item.disabled {
  color: #555;
  cursor: not-allowed;
  opacity: 0.5;
}

.folder-context-menu .menu-item.disabled:hover {
  background: transparent;
  color: #555;
}

.folder-context-menu .menu-label {
  flex: 1;
}

.folder-context-menu .menu-icon {
  vertical-align: middle;
  margin-right: 6px;
}

/* 字母跳转面板 */
.letter-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.letter-picker {
  background: rgba(40, 40, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
  min-width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.letter-picker-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 16px;
  text-align: center;
}

.letter-picker-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.letter-picker-item {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: #ccc;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}

.letter-picker-item:hover:not(.disabled) {
  background: var(--accent-active-bg);
  border-color: var(--accent-color);
  color: #fff;
}

.letter-picker-item.active {
  background: var(--accent-hover-bg);
  border-color: var(--accent-color);
  color: #fff;
}

.letter-picker-item.disabled {
  color: #444;
  cursor: not-allowed;
  opacity: 0.4;
}

.letter-picker-item.disabled:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
  color: #444;
}
</style>
