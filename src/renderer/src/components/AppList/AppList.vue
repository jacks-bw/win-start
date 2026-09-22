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
  </div>
</template>

<script setup lang="ts">
import SearchBox from './SearchBox.vue'
import AppItem from './AppItem.vue'
import FolderItem from './FolderItem.vue'
import UserBar from './UserBar.vue'
import { useAppsStore } from '../../stores/useApps'
import { ref } from 'vue'

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

  // 关闭已存在的菜单
  const existing = document.querySelector('.folder-context-menu')
  if (existing) existing.remove()

  const isEmpty = folder.appIds.length === 0
  const menu = document.createElement('div')
  menu.className = 'folder-context-menu'
  menu.style.left = `${e.clientX}px`
  menu.style.top = `${e.clientY}px`

  const renameItem = document.createElement('div')
  renameItem.className = 'menu-item'
  renameItem.dataset.action = 'rename'
  renameItem.textContent = '✏️ 重命名'
  renameItem.addEventListener('click', (ev) => {
    ev.stopPropagation()
    window.showInputDialog('重命名文件夹', folder.name, (newName: string) => {
      appsStore.renameFolder(folder.id, newName)
    })
    menu.remove()
    document.removeEventListener('click', handleOutsideClick)
  })

  const deleteItem = document.createElement('div')
  deleteItem.className = isEmpty ? 'menu-item danger' : 'menu-item danger disabled'
  deleteItem.dataset.action = 'delete'
  deleteItem.textContent = '🗑️ 删除文件夹'
  deleteItem.addEventListener('click', (ev) => {
    ev.stopPropagation()
    if (!isEmpty) {
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
    menu.remove()
    document.removeEventListener('click', handleOutsideClick)
  })

  menu.appendChild(renameItem)
  menu.appendChild(deleteItem)
  document.body.appendChild(menu)

  // 点击菜单外部关闭
  const handleOutsideClick = (ev: MouseEvent) => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove()
      document.removeEventListener('click', handleOutsideClick)
    }
  }
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick)
  }, 0)
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

.folder-context-menu .menu-item.disabled {
  color: #555;
  cursor: not-allowed;
  opacity: 0.5;
}

.folder-context-menu .menu-item.disabled:hover {
  background: transparent;
  color: #555;
}
