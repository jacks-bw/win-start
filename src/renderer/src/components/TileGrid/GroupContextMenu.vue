<template>
  <div
    class="context-menu group-context-menu"
    :style="{ left: x + 'px', top: y + 'px' }"
    @click.stop
    @contextmenu.prevent
  >
    <div class="menu-item" @click="handleSetBackground">
      <span class="menu-label">设置组背景</span>
    </div>

    <div v-if="group?.background" class="menu-item" @click="handleRemoveBackground">
      <span class="menu-label">移除组背景</span>
    </div>

    <div class="menu-item" @click="handleToggleLiveAll">
      <span class="menu-label">{{ allLive ? '关闭整组动态磁贴' : '开启整组动态磁贴' }}</span>
    </div>

    <div class="menu-divider"></div>

    <div class="menu-item" @click="handleRename">
      <span class="menu-label">重命名</span>
    </div>

    <div v-if="group?.tiles?.length" class="menu-item" @click="handleClearGroup">
      <span class="menu-label">清空组</span>
    </div>

    <div class="menu-item danger" @click="handleDelete">
      <span class="menu-label">删除分组</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTilesStore } from '../../stores/useTiles'

const props = defineProps<{
  x: number
  y: number
  groupId: string
}>()

const emit = defineEmits<{
  close: []
}>()

import { computed } from 'vue'
const tilesStore = useTilesStore()

const group = computed(() => tilesStore.groups.find((g) => g.id === props.groupId))
const allLive = computed(() => {
  const tiles = group.value?.tiles || []
  return tiles.length > 0 && tiles.every((t) => t.liveEnabled)
})

function findGroup(): TileGroup | undefined {
  return tilesStore.groups.find((g) => g.id === props.groupId)
}

function handleRemoveBackground() {
  tilesStore.setGroupBackground(props.groupId, undefined)
  emit('close')
}

function handleToggleLiveAll() {
  const g = findGroup()
  if (!g) return
  const target = !allLive.value
  for (const t of g.tiles) {
    if (t.size !== 'small') t.liveEnabled = target
  }
  tilesStore.saveLayout()
  emit('close')
}

function handleClearGroup() {
  const g = findGroup()
  if (!g) return
  g.tiles.splice(0, g.tiles.length)
  // 清空后清掉背景，避免下次新增磁贴套上旧图
  g.background = undefined
  g.backgroundCrop = undefined
  g.backgroundTiles = undefined
  tilesStore.saveLayout()
  emit('close')
}

async function handleSetBackground() {
  emit('close')
  // 打开独立的分组背景设置窗口（仿磁贴样式窗，开始菜单期间被锁定）
  await window.electronAPI.openGroupStyleWindow(props.groupId)
}

function handleRename() {
  const group = findGroup()
  if (group) {
    window.showInputDialog('重命名分组', group.name, (newName: string) => {
      tilesStore.renameGroup(props.groupId, newName)
    })
  }
  emit('close')
}

function handleDelete() {
  if (tilesStore.groups.length <= 1) {
    window.showConfirmDialog({
      title: '无法删除',
      message: '至少需要保留一个分组。',
      confirmText: '知道了'
    })
    emit('close')
    return
  }
  const group = findGroup()
  window.showConfirmDialog({
    title: `删除分组"${group?.name ?? ''}"？`,
    message: '组内的磁贴也会一并移除，此操作无法撤销。',
    confirmText: '删除',
    danger: true,
    onConfirm: () => {
      tilesStore.removeGroup(props.groupId)
    }
  })
  emit('close')
}
</script>

<style scoped>
.context-menu {
  position: fixed;
  min-width: 200px;
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

.menu-item.danger:hover {
  background: rgba(217, 76, 76, 0.7);
}

.menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}
</style>
