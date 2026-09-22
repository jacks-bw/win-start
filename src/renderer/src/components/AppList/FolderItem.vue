<template>
  <div class="folder-item" :class="{ expanded: isExpanded, 'drag-over': isDragOver }">
    <!-- 文件夹头部 -->
    <div
      class="folder-header"
      @click="handleToggle"
      @contextmenu="$emit('contextmenu', $event)"
      @dragover.prevent="handleDragOver"
      @dragleave="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <span class="folder-arrow">{{ isExpanded ? '▼' : '▶' }}</span>
      <div class="folder-icon">
        <span class="folder-icon-img">📁</span>
      </div>
      <template v-if="!isEditing">
        <span class="folder-name" @dblclick.stop="startEdit">{{ folder.name }}</span>
        <span class="folder-count">({{ folder.appIds.length }})</span>
      </template>
      <input
        v-else
        ref="editInput"
        class="folder-edit-input"
        :value="folder.name"
        @input="editName = ($event.target as HTMLInputElement).value"
        @blur="finishEdit"
        @keydown.enter="finishEdit"
        @keydown.esc="cancelEdit"
        @click.stop
      />
    </div>

    <!-- 文件夹内容 -->
    <div v-if="isExpanded" class="folder-content">
      <div
        v-for="app in folderApps"
        :key="app.id"
        class="folder-app-item"
        draggable="true"
        @dragstart="handleAppDragStart($event, app)"
        @click="$emit('launch-app', app)"
        @contextmenu="$emit('app-contextmenu', $event, app)"
      >
        <div class="app-icon">
          <span v-if="app.icon" class="icon-img" :style="{ backgroundImage: `url(${app.icon})` }"></span>
          <span v-else class="icon-placeholder">{{ app.name.charAt(0).toUpperCase() }}</span>
        </div>
        <span class="app-name">{{ app.name }}</span>
      </div>
      <div v-if="folderApps.length === 0" class="folder-empty">空文件夹</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useAppsStore } from '../../stores/useApps'

const props = defineProps<{
  folder: AppFolder
}>()

const emit = defineEmits<{
  contextmenu: [e: MouseEvent]
  'launch-app': [app: AppItem]
  'app-contextmenu': [e: MouseEvent, app: AppItem]
}>()

const appsStore = useAppsStore()
const editInput = ref<HTMLInputElement | null>(null)
const isEditing = ref(false)
const editName = ref('')
const isDragOver = ref(false)

const isExpanded = computed(() => appsStore.expandedFolders.has(props.folder.id))
const folderApps = computed(() => appsStore.getFolderApps(props.folder.id))

function handleToggle() {
  if (!isEditing.value) {
    appsStore.toggleFolder(props.folder.id)
  }
}

function startEdit() {
  isEditing.value = true
  editName.value = props.folder.name
  nextTick(() => {
    editInput.value?.focus()
    editInput.value?.select()
  })
}

function finishEdit() {
  if (isEditing.value && editName.value.trim()) {
    appsStore.renameFolder(props.folder.id, editName.value.trim())
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = true
}

function handleDragLeave() {
  isDragOver.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  isDragOver.value = false
  const appId = e.dataTransfer?.getData('text/plain')
  if (appId) {
    appsStore.moveAppToFolder(appId, props.folder.id)
  }
}

function handleAppDragStart(e: DragEvent, app: AppItem) {
  e.dataTransfer?.setData('text/plain', app.id)
  e.dataTransfer!.effectAllowed = 'move'
}
</script>

<style scoped>
.folder-item {
  margin-bottom: 2px;
}

.folder-header {
  display: flex;
  align-items: center;
  padding: 5px 20px;
  cursor: pointer;
  transition: background 0.08s ease;
  height: 34px;
  position: relative;
}

.folder-header:hover {
  background: linear-gradient(to right, rgba(0, 120, 215, 0.3), rgba(0, 120, 215, 0.15));
  border-left: 3px solid var(--accent-color);
  padding-left: 17px;
}

.folder-header.drag-over {
  background: rgba(0, 120, 215, 0.4);
  border: 1px dashed var(--accent-color);
}

.folder-arrow {
  font-size: 8px;
  color: #888;
  margin-right: 6px;
  width: 12px;
  text-align: center;
}

.folder-icon {
  width: 24px;
  height: 24px;
  margin-right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.folder-icon-img {
  font-size: 18px;
}

.folder-name {
  font-size: 12.5px;
  color: #e0e0e0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-header:hover .folder-name {
  color: #ffffff;
}

.folder-count {
  font-size: 11px;
  color: #888;
  margin-left: 6px;
}

.folder-edit-input {
  flex: 1;
  padding: 2px 6px;
  background: #1e1e1e;
  border: 1px solid var(--accent-color);
  border-radius: 3px;
  color: #fff;
  font-size: 12.5px;
  outline: none;
}

.folder-content {
  padding-left: 32px;
}

.folder-app-item {
  display: flex;
  align-items: center;
  padding: 4px 20px 4px 10px;
  cursor: pointer;
  transition: background 0.08s ease;
  height: 30px;
  border-radius: 3px;
}

.folder-app-item:hover {
  background: rgba(0, 120, 215, 0.2);
}

.app-icon {
  width: 20px;
  height: 20px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-placeholder {
  width: 20px;
  height: 20px;
  background: var(--accent-color);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: white;
}

.icon-img {
  width: 20px;
  height: 20px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.app-name {
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.folder-app-item:hover .app-name {
  color: #fff;
}

.folder-empty {
  padding: 8px 10px;
  font-size: 11px;
  color: #666;
  font-style: italic;
}
</style>
