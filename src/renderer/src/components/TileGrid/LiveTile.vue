<template>
  <div
    class="tile-container"
    :class="[`size-${tile.size}`, { flipped: isFlipped, dragging: isDragging }]"
    draggable="true"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
    @dragover.prevent
    @drop="handleDrop"
    @click="$emit('click')"
    @contextmenu="$emit('contextmenu', $event)"
  >
    <div class="tile-inner">
      <!-- 正面 -->
      <div class="tile-front" :style="{ background: tileColor }">
        <div class="tile-content" :class="contentLayout">
          <div class="tile-icon">
            <span v-if="appIcon" class="icon-img" :style="{ backgroundImage: `url(${appIcon})` }"></span>
            <span v-else-if="tileIcon" class="icon-emoji">{{ tileIcon }}</span>
            <span v-else class="icon-placeholder">{{ tileName.charAt(0) }}</span>
          </div>
          <div v-if="tileSize !== 'small'" class="tile-text">
            <div class="tile-title">{{ tileName }}</div>
            <div v-if="currentNotification?.body" class="tile-body">
              {{ currentNotification.body }}
            </div>
          </div>
        </div>
      </div>

      <!-- 背面（通知内容） -->
      <div class="tile-back" :style="{ background: tileColor }">
        <div class="tile-content" :class="contentLayout">
          <div v-if="nextNotification" class="tile-text">
            <div class="tile-title">{{ nextNotification.title || tileName }}</div>
            <div class="tile-body">{{ nextNotification.body }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useTilesStore } from '../../stores/useTiles'
import { useAppsStore } from '../../stores/useApps'

const props = defineProps<{
  tile: TileItem
}>()

defineEmits<{
  click: []
  contextmenu: [e: MouseEvent]
}>()

const tilesStore = useTilesStore()
const { apps } = useAppsStore()
const isFlipped = ref(false)
const isDragging = ref(false)
let flipInterval: ReturnType<typeof setInterval> | null = null

// 拖拽事件
function handleDragStart(e: DragEvent) {
  isDragging.value = true
  e.dataTransfer?.setData('text/plain', props.tile.id)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function handleDragEnd() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  const dragTileId = e.dataTransfer?.getData('text/plain')
  if (dragTileId && dragTileId !== props.tile.id) {
    tilesStore.moveTile(dragTileId, props.tile.id)
  }
}

// 根据 appId 获取显示名称和图标
const tileName = computed(() => {
  // 先在已加载的程序列表中查找
  const app = apps.find((a) => a.id === props.tile.appId)
  if (app) {
    return app.name
  }
  // 内置磁贴 fallback
  const nameMap: Record<string, string> = {
    calc: '计算器',
    notepad: '记事本',
    browser: '浏览器',
    files: '文件资源管理器'
  }
  return nameMap[props.tile.appId] || props.tile.appId
})

const tileIcon = computed(() => {
  // 先在已加载的程序列表中查找
  const app = apps.find((a) => a.id === props.tile.appId)
  if (app && app.icon) {
    return '' // 使用 app.icon
  }
  const iconMap: Record<string, string> = {
    calc: '🧮',
    notepad: '📝',
    browser: '🌐',
    files: '📁'
  }
  return iconMap[props.tile.appId] || ''
})

// 真实程序图标（base64）
const appIcon = computed(() => {
  const app = apps.find((a) => a.id === props.tile.appId)
  return app?.icon || ''
})

const tileColor = computed(() => {
  const colorMap: Record<string, string> = {
    calc: '#0078d7',
    notepad: '#4b656a',
    browser: '#0078d7',
    files: '#0078d7'
  }
  return colorMap[props.tile.appId] || '#2d7d9a'
})

const tileSize = computed(() => props.tile.size)

const contentLayout = computed(() => {
  switch (props.tile.size) {
    case 'small':
      return 'center-icon'
    case 'medium':
      return 'bottom-left'
    case 'wide':
      return 'bottom-left'
    case 'large':
      return 'top-left'
    default:
      return 'bottom-left'
  }
})

// 通知队列
const notifications = computed(() => tilesStore.getNotifications(props.tile.appId))
const currentNotification = computed(() => notifications.value[0])
const nextNotification = computed(() => notifications.value[1])

onMounted(() => {
  // 如果开启动态磁贴，设置定时翻转
  if (props.tile.liveEnabled && notifications.value.length > 1) {
    flipInterval = setInterval(() => {
      isFlipped.value = !isFlipped.value
    }, 5000) // 5秒翻转一次
  }
})

onUnmounted(() => {
  if (flipInterval) {
    clearInterval(flipInterval)
  }
})
</script>

<style scoped>
.tile-container {
  position: relative;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.tile-container:hover {
  transform: scale(0.98);
}

.tile-container.dragging {
  opacity: 0.4;
  transform: scale(0.95);
}

/* 四种尺寸 */
.size-small {
  width: var(--tile-small);
  height: var(--tile-small);
}

.size-medium {
  width: var(--tile-medium);
  height: var(--tile-medium);
}

.size-wide {
  width: var(--tile-wide);
  height: var(--tile-medium);
}

.size-large {
  width: var(--tile-wide);
  height: var(--tile-large);
}

.tile-content {
  width: 100%;
  height: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.tile-content.center-icon {
  justify-content: center;
  align-items: center;
  padding: 0;
}

.tile-content.top-left {
  justify-content: flex-start;
}

.tile-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.center-icon .tile-icon {
  margin-bottom: 0;
}

.icon-img {
  width: 36px;
  height: 36px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.center-icon .icon-img {
  width: 32px;
  height: 32px;
}

.icon-emoji {
  font-size: 28px;
}

.center-icon .icon-emoji {
  font-size: 32px;
}

.icon-placeholder {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
}

.tile-text {
  color: white;
}

.tile-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile-body {
  font-size: 11px;
  opacity: 0.9;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
