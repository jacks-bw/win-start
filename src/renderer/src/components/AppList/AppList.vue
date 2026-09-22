<template>
  <div class="app-list win7-style">
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
      <div class="section">
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
          <div class="letter-header">{{ group.group }}</div>
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

    <!-- 自定义对话框 -->
    <div v-if="dialogVisible" class="dialog-overlay" @click.self="closeDialog">
      <div class="dialog-box">
        <div class="dialog-title">
          {{ dialogType === 'create' ? '新建文件夹' : dialogType === 'rename' ? '重命名文件夹' : '删除文件夹' }}
        </div>
        <div class="dialog-content">
          <template v-if="dialogType === 'delete'">
            <p>确定删除文件夹吗？里面的应用会移出来。</p>
          </template>
          <template v-else>
            <input
              ref="dialogInput"
              class="dialog-input"
              :value="dialogInputValue"
              @input="dialogInputValue = ($event.target as HTMLInputElement).value"
              @keydown.enter="confirmDialog"
              @keydown.esc="closeDialog"
              autofocus
            />
          </template>
        </div>
        <div class="dialog-buttons">
          <button class="dialog-btn cancel" @click="closeDialog">取消</button>
          <button
            class="dialog-btn confirm"
            :class="{ danger: dialogType === 'delete' }"
            @click="confirmDialog"
          >
            {{ dialogType === 'delete' ? '删除' : '确定' }}
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

const appsStore = useAppsStore()

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

function handleFolderContextMenu(e: MouseEvent, folder: AppFolder) {
  e.preventDefault()
  e.stopPropagation()
  // 用自定义菜单
  const menu = document.createElement('div')
  menu.className = 'folder-context-menu'
  menu.style.left = `${e.clientX}px`
  menu.style.top = `${e.clientY}px`
  menu.innerHTML = `
    <div class="menu-item" data-action="rename">✏️ 重命名</div>
    <div class="menu-item danger" data-action="delete">🗑️ 删除文件夹</div>
  `
  document.body.appendChild(menu)

  const handleClick = (ev: MouseEvent) => {
    const target = ev.target as HTMLElement
    if (target.classList.contains('menu-item')) {
      const action = target.dataset.action
      if (action === 'rename') {
        openDialog('rename', folder.id)
      } else if (action === 'delete') {
        openDialog('delete', folder.id)
      }
    }
    cleanup()
  }

  const cleanup = () => {
    document.removeEventListener('click', handleClick)
    menu.remove()
  }

  setTimeout(() => {
    document.addEventListener('click', handleClick)
  }, 0)
}

// 自定义对话框
import { ref } from 'vue'
const dialogVisible = ref(false)
const dialogType = ref<'create' | 'rename' | 'delete'>('create')
const dialogFolderId = ref('')
const dialogInputValue = ref('')

function openDialog(type: 'create' | 'rename' | 'delete', folderId = '') {
  dialogType.value = type
  dialogFolderId.value = folderId
  if (type === 'create') {
    dialogInputValue.value = '新建文件夹'
  } else if (type === 'rename') {
    const folder = appsStore.folders.find((f) => f.id === folderId)
    dialogInputValue.value = folder?.name || ''
  }
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
}

function confirmDialog() {
  if (dialogType.value === 'create') {
    if (dialogInputValue.value.trim()) {
      appsStore.createFolder(dialogInputValue.value.trim())
    }
  } else if (dialogType.value === 'rename') {
    if (dialogInputValue.value.trim() && dialogFolderId.value) {
      appsStore.renameFolder(dialogFolderId.value, dialogInputValue.value.trim())
    }
  } else if (dialogType.value === 'delete') {
    if (dialogFolderId.value) {
      appsStore.deleteFolder(dialogFolderId.value)
    }
  }
  closeDialog()
}

function createNewFolder() {
  openDialog('create')
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
</style>

/* 全局右键菜单样式 */
.folder-context-menu {
  position: fixed;
  background: #2a2a2a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 140px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 9999;
}

.folder-context-menu .menu-item {
  padding: 8px 16px;
  font-size: 12.5px;
  color: #ccc;
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

/* 自定义对话框 */
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
  background: #2a2a2a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
  min-width: 300px;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.dialog-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 16px;
}

.dialog-content {
  margin-bottom: 20px;
}

.dialog-content p {
  font-size: 13px;
  color: #ccc;
  line-height: 1.5;
  margin: 0;
}

.dialog-input {
  width: 100%;
  padding: 8px 12px;
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.dialog-input:focus {
  border-color: var(--accent-color);
}

.dialog-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-btn {
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 12.5px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.dialog-btn.cancel {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.2);
  color: #ccc;
}

.dialog-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.dialog-btn.confirm {
  background: var(--accent-color);
  color: #fff;
}

.dialog-btn.confirm:hover {
  background: #1a8ad4;
}

.dialog-btn.confirm.danger {
  background: #e74c3c;
}

.dialog-btn.confirm.danger:hover {
  background: #c0392b;
}
