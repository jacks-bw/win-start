<template>
  <div class="app-list win7-style" @click="closeFolderMenu">
    <!-- 搜索框 -->
    <SearchBox @search="handleSearch" />

    <!-- 程序列表滚动区 -->
    <div class="app-scroll-area">
      <!-- 最近添加 -->
      <div v-if="appsStore.recentApps.length > 0 && !appsStore.searchQuery" class="section">
        <div class="section-title">最近添加</div>
        <AppItem
          v-for="app in appsStore.recentApps"
          :key="app.id"
          :app="app"
          draggable="true"
          @dragstart="handleAppDragStart($event, app)"
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
          draggable="true"
          @dragstart="handleAppDragStart($event, app)"
          @click="handleLaunch(app)"
          @contextmenu="handleContextMenu($event, app)"
        />
      </div>

      <!-- 所有应用 - 按字母分组 -->
      <div
        class="section all-apps-section"
        :class="{ 'drag-over': isSectionDragOver }"
        @dragover.prevent="handleSectionDragOver"
        @dragleave="handleSectionDragLeave"
        @drop.prevent="handleSectionDrop"
      >
        <div v-if="!appsStore.searchQuery" class="section-title all-apps-title">
          所有应用
          <button class="new-folder-btn" @click="createNewFolder" title="新建文件夹">+ 新建文件夹</button>
        </div>

        <!-- 文件夹列表 -->
        <FolderItem
          v-for="folder in appsStore.folders"
          :key="folder.id"
          :folder="folder"
          @contextmenu="handleFolderContextMenu($event, folder)"
          @launch-app="handleLaunch"
          @app-contextmenu="handleContextMenu"
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
            draggable="true"
            @dragstart="handleAppDragStart($event, app)"
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

    <!-- 底部用户栏 -->
    <UserBar />

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
        class="menu-item danger"
        :class="{ disabled: !folderMenu.isEmpty }"
        @click="handleFolderDelete"
      >
        <span class="menu-label"><Trash2 :size="14" class="menu-icon" /> 删除文件夹</span>
      </div>
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
import UserBar from './UserBar.vue'
import { useAppsStore } from '../../stores/useApps'
import { ref, computed } from 'vue'
import { Pencil, Trash2 } from 'lucide-vue-next'

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

function handleAppDragStart(e: DragEvent, app: AppItem) {
  e.dataTransfer?.setData('text/plain', app.id)
  e.dataTransfer!.effectAllowed = 'move'
}

// 所有应用区域拖拽（用于从文件夹移出）
const isSectionDragOver = ref(false)

function handleSectionDragOver(e: DragEvent) {
  e.preventDefault()
  isSectionDragOver.value = true
}

function handleSectionDragLeave() {
  isSectionDragOver.value = false
}

function handleSectionDrop(e: DragEvent) {
  e.preventDefault()
  isSectionDragOver.value = false
  const appId = e.dataTransfer?.getData('text/plain')
  if (appId) {
    const app = appsStore.apps.find((a) => a.id === appId)
    // 如果应用在文件夹里，移出文件夹
    if (app && app.folderId) {
      appsStore.removeAppFromFolder(appId)
    }
  }
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

function createNewFolder() {
  window.showInputDialog('新建文件夹', '新建文件夹', (name: string) => {
    appsStore.createFolder(name)
  })
}
</script>

<style scoped>
.app-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgba(28, 28, 28, 0.98);
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
  background: rgba(0, 120, 215, 0.08);
  outline: 1px dashed rgba(0, 120, 215, 0.4);
  outline-offset: -2px;
}

.new-folder-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  color: #999;
  font-size: 10px;
  padding: 2px 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.new-folder-btn:hover {
  background: rgba(0, 120, 215, 0.2);
  border-color: var(--accent-color);
  color: #fff;
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
  background: rgba(0, 120, 215, 0.3);
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
  background: rgba(0, 120, 215, 0.3);
  border-color: var(--accent-color);
  color: #fff;
}

.letter-picker-item.active {
  background: rgba(0, 120, 215, 0.2);
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
