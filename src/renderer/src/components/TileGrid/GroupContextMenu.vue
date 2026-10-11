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

    <div class="menu-divider"></div>

    <div class="menu-item" @click="handleRename">
      <span class="menu-label">重命名</span>
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

const tilesStore = useTilesStore()

function findGroup(): TileGroup | undefined {
  return tilesStore.groups.find((g) => g.id === props.groupId)
}

async function handleSetBackground() {
  // 忙碌锁：选图对话框和后续裁剪期间，开始菜单不因点外部而关闭
  window.electronAPI.setMenuBusy(true)
  const filePath = await window.electronAPI.selectImage()
  emit('close')
  if (!filePath) {
    window.electronAPI.setMenuBusy(false)
    return
  }
  const base64 = await window.electronAPI.readImageBase64(filePath)
  if (!base64) {
    window.electronAPI.setMenuBusy(false)
    return
  }

  // 按整组磁贴网格计算裁剪框比例
  const spanMap: Record<string, { rows: number; cols: number }> = {
    small: { rows: 1, cols: 1 },
    medium: { rows: 2, cols: 2 },
    wide: { rows: 2, cols: 4 }
  }
  const group = findGroup()
  let maxRow = 0
  let maxCol = 0
  if (group) {
    for (const t of group.tiles) {
      const span = spanMap[t.size] || { rows: 2, cols: 2 }
      maxRow = Math.max(maxRow, t.row + span.rows)
      maxCol = Math.max(maxCol, t.col + span.cols)
    }
  }
  const targetRatio = maxCol > 0 && maxRow > 0 ? maxCol / maxRow : 1

  // 交接：释放选图阶段的锁，由 openImageCrop 内部同步重新加锁（无间隙）
  window.electronAPI.setMenuBusy(false)
  window.openImageCrop(base64, targetRatio, async (croppedDataUrl) => {
    const savedPath = await window.electronAPI.saveImage(
      croppedDataUrl,
      `group-${props.groupId}-${Date.now()}`
    )
    if (savedPath) {
      tilesStore.setGroupBackground(props.groupId, savedPath)
    }
  })
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
