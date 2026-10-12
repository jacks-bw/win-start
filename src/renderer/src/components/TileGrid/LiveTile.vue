<template>
  <div
    class="tile-container"
    :class="[
      `size-${tile.size}`,
      {
        flipped: isFlipped,
        dragging: isDragging,
        'drag-target': isDragTarget
      }
    ]"
    :style="{
      ...($attrs.style || {}),
      transform: `perspective(600px) rotateX(${tiltY}deg) rotateY(${tiltX}deg)`
    }"
    draggable="true"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
    @click="$emit('click')"
    @contextmenu="$emit('contextmenu', $event)"
    @mousemove="handleTiltMove"
    @mouseleave="handleTiltLeave"
  >
    <div class="tile-inner">
      <!-- 正面 -->
      <div class="tile-front">
        <div
          class="tile-bg"
          :style="{
            background: tileColor,
            backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
            ...backgroundStyle
          }"
        ></div>
        <div class="tile-content" :style="contentStyle">
          <div v-if="showIcon" class="tile-icon" :style="iconContainerStyle">
            <span
              v-if="customIconImageBase64"
              class="icon-img"
              :style="{ backgroundImage: `url(${customIconImageBase64})`, width: `${iconSize}px`, height: `${iconSize}px` }"
            ></span>
            <component
              v-else-if="customIconComponent"
              :is="customIconComponent"
              :size="iconSize"
              :color="tile.iconColor || '#fff'"
              :stroke-width="2"
            />
            <span
              v-else-if="appIcon"
              class="icon-img"
              :style="appIconStyle"
            ></span>
            <component
              v-else-if="defaultIconComponent"
              :is="defaultIconComponent"
              :size="iconSize"
              :color="tile.iconColor || '#fff'"
              :stroke-width="2"
            />
            <span v-else class="icon-placeholder">{{ tileName.charAt(0) }}</span>
          </div>
          <div v-if="showName && tileSize !== 'small'" class="tile-text">
            <div
              ref="titleRef"
              class="tile-title"
              :class="{ 'tile-title-marquee': isNameOverflowed }"
              :style="{ color: tile.nameColor || undefined, textAlign: textAlign }"
            >
              <span class="tile-title-inner">
                <span class="tile-title-text">{{ tileName }}</span>
                <span class="tile-title-text" aria-hidden="true">{{ tileName }}</span>
              </span>
            </div>
            <div v-if="currentNotification?.body" class="tile-body">
              {{ currentNotification.body }}
            </div>
          </div>
        </div>
      </div>

      <!-- 背面（通知内容；无通知时回退为图标+名称，保持翻转动画可见） -->
      <div class="tile-back">
        <div class="tile-bg" :style="{ background: tileColor }"></div>
        <div class="tile-content" :style="contentStyle">
          <div v-if="showIcon" class="tile-icon" :style="iconContainerStyle">
            <span
              v-if="customIconImageBase64"
              class="icon-img"
              :style="{ backgroundImage: `url(${customIconImageBase64})`, width: `${iconSize}px`, height: `${iconSize}px` }"
            ></span>
            <component
              v-else-if="customIconComponent"
              :is="customIconComponent"
              :size="iconSize"
              :color="tile.iconColor || '#fff'"
              :stroke-width="2"
            />
            <span v-else-if="appIcon" class="icon-img" :style="appIconStyle"></span>
          </div>
          <div v-if="showName && tileSize !== 'small'" class="tile-text">
            <div class="tile-title">{{ nextNotification?.title || tileName }}</div>
            <div v-if="nextNotification?.body" class="tile-body">{{ nextNotification.body }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, markRaw } from 'vue'
import { useTilesStore } from '../../stores/useTiles'
import { useAppsStore } from '../../stores/useApps'
import { useSettingsStore } from '../../stores/useSettings'
import * as LucideIcons from 'lucide-vue-next'

// 图片 base64 缓存
const imageCache = new Map<string, string>()

const props = defineProps<{
  tile: TileItem
  group?: TileGroup
}>()

defineEmits<{
  click: []
  contextmenu: [e: MouseEvent]
}>()

const tilesStore = useTilesStore()
const appsStore = useAppsStore()
const settingsStore = useSettingsStore()
const isFlipped = ref(false)
const isDragging = ref(false)
let flipInterval: ReturnType<typeof setInterval> | null = null

// 3D 倾斜效果
const tiltX = ref(0)
const tiltY = ref(0)
const MAX_TILT = 6 // 最大倾斜角度

function handleTiltMove(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  // 鼠标相对于磁贴中心的位置（-1 到 1）
  const x = (e.clientX - rect.left) / rect.width - 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5
  // 鼠标在右侧时，rotateY 为正（向右倾斜）；鼠标在下侧时，rotateX 为负（向下倾斜）
  tiltX.value = x * MAX_TILT * 2
  tiltY.value = -y * MAX_TILT * 2
}

function handleTiltLeave() {
  tiltX.value = 0
  tiltY.value = 0
}

// 标题溢出检测
const titleRef = ref<HTMLElement | null>(null)
const isNameOverflowed = ref(false)
let resizeObserver: ResizeObserver | null = null

function checkNameOverflow() {
  requestAnimationFrame(() => {
    if (titleRef.value) {
      isNameOverflowed.value = titleRef.value.scrollWidth > titleRef.value.clientWidth + 1
    }
  })
}

// 当前是否是拖拽的目标位置
const isDragTarget = computed(
  () =>
    tilesStore.draggingTileId !== null &&
    tilesStore.draggingTileId !== props.tile.id &&
    tilesStore.dragTargetId === props.tile.id
)

// 拖拽事件
function handleDragStart(e: DragEvent) {
  isDragging.value = true
  e.dataTransfer?.setData('text/plain', props.tile.id)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
  tilesStore.setDraggingTile(props.tile.id, props.tile.size)
}

function handleDragEnd() {
  isDragging.value = false
  tilesStore.setDraggingTile(null)
}

// 根据 appId 获取显示名称和图标
const tileName = computed(() => {
  // 先在已加载的程序列表中查找
  const app = appsStore.apps.find((a) => a.id === props.tile.appId)
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
  const app = appsStore.apps.find((a) => a.id === props.tile.appId)
  if (app && app.icon) {
    return '' // 使用 app.icon
  }
  const iconMap: Record<string, string> = {
    calc: 'Calculator',
    notepad: 'FileText',
    browser: 'Globe',
    files: 'Folder'
  }
  return iconMap[props.tile.appId] || ''
})

// 默认占位图标组件（lucide）
const defaultIconComponent = computed(() => {
  if (!tileIcon.value) return null
  const component = (LucideIcons as Record<string, unknown>)[tileIcon.value]
  return component ? markRaw(component) : null
})

// 真实程序图标（base64）
const appIcon = computed(() => {
  const app = appsStore.apps.find((a) => a.id === props.tile.appId)
  return app?.icon || ''
})

const tileColor = computed(() => {
  const opacity = settingsStore.tileOpacity
  const colorMap: Record<string, string> = {
    calc: `rgba(var(--accent-color-rgb), ${opacity})`,
    notepad: `rgba(75, 101, 106, ${opacity})`,
    browser: `rgba(var(--accent-color-rgb), ${opacity})`,
    files: `rgba(var(--accent-color-rgb), ${opacity})`
  }
  return colorMap[props.tile.appId] || `rgba(var(--accent-color-rgb), ${opacity})`
})

const tileSize = computed(() => props.tile.size)

const showIcon = computed(() => props.tile.showIcon !== false)
const showName = computed(() => props.tile.showName !== false)

// 尺寸映射
const sizeSpanMap: Record<string, { rows: number; cols: number }> = {
  small: { rows: 1, cols: 1 },
  medium: { rows: 2, cols: 2 },
  wide: { rows: 2, cols: 4 }
}

// 是否使用组背景（只对设置组背景时已存在的磁贴生效）
const useGroupBg = computed(() => {
  const group = props.group
  if (!group?.background || props.tile.background || (props.tile as Record<string, unknown>).backgroundCleared) return false
  // 没有快照时（旧数据）视为全部生效；有快照则只对快照内的磁贴生效
  return !group.backgroundTiles || group.backgroundTiles.includes(props.tile.id)
})

// 当前使用的背景路径（磁贴自己的优先，否则用组的）
const currentBgPath = computed(() => props.tile.background || (useGroupBg.value ? props.group?.background : undefined))

// 背景样式（组背景时每个磁贴显示图片不同部分）
const backgroundStyle = computed(() => {
  if (useGroupBg.value && props.group) {
    // 计算组的网格范围
    let maxRow = 0
    let maxCol = 0
    for (const t of props.group.tiles) {
      const span = sizeSpanMap[t.size]
      maxRow = Math.max(maxRow, t.row + span.rows)
      maxCol = Math.max(maxCol, t.col + span.cols)
    }

    const cellSize = 76 // 每个格子的大小（70内容+6gap）
    // 优先用设置背景时记录的组尺寸，避免后续增删磁贴拉伸图片
    const storedW = (props.group as Record<string, unknown>).backgroundGroupW as number | undefined
    const storedH = (props.group as Record<string, unknown>).backgroundGroupH as number | undefined
    const groupWidth = storedW || maxCol * cellSize
    const groupHeight = storedH || maxRow * cellSize
    // 用设置时记录的磁贴位置，拖动后切片固定不变
    const off = (props.tile as Record<string, unknown>).bgOffset as { row: number; col: number } | undefined
    const fixedRow = off?.row ?? props.tile.row
    const fixedCol = off?.col ?? props.tile.col
    const offsetX = -(fixedCol * cellSize)
    const offsetY = -(fixedRow * cellSize)

    // GIF 整组 cover：先按组尺寸等比缩放整图，再按磁贴位置切片
    const isGif = (currentBgPath.value || '').toLowerCase().endsWith('.gif')
    if (isGif && bgNaturalSize.value) {
      const iw = bgNaturalSize.value.w
      const ih = bgNaturalSize.value.h
      const s = Math.max(groupWidth / iw, groupHeight / ih)
      const dw = iw * s
      const dh = ih * s
      const centerX = (groupWidth - dw) / 2
      const centerY = (groupHeight - dh) / 2
      return {
        backgroundSize: `${dw}px ${dh}px`,
        backgroundPosition: `${centerX + offsetX}px ${centerY + offsetY}px`,
        backgroundRepeat: 'no-repeat'
      }
    }

    return {
      backgroundSize: `${groupWidth}px ${groupHeight}px`,
      backgroundPosition: `${offsetX}px ${offsetY}px`,
      backgroundRepeat: 'no-repeat'
    }
  }
  return {
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }
})

// 背景图片 base64
const backgroundImage = ref<string | undefined>(undefined)
// GIF 原始尺寸（整组 cover 切片用）
const bgNaturalSize = ref<{ w: number; h: number } | null>(null)

async function loadBackground() {
  if (!currentBgPath.value) {
    backgroundImage.value = undefined
    bgNaturalSize.value = null
    return
  }
  const cached = imageCache.get(currentBgPath.value)
  if (cached) {
    backgroundImage.value = cached
  } else {
    const base64 = await window.electronAPI.readImageBase64(currentBgPath.value)
    if (base64) {
      imageCache.set(currentBgPath.value, base64)
      backgroundImage.value = base64
    }
  }
  // 读取 GIF 原始尺寸用于整组 cover
  if (backgroundImage.value) {
    const img = new Image()
    img.onload = () => {
      bgNaturalSize.value = { w: img.naturalWidth, h: img.naturalHeight }
    }
    img.src = backgroundImage.value
  }
}
watch(currentBgPath, loadBackground, { immediate: true })

// 外部自定义图标 base64
const customIconImageBase64 = ref<string | undefined>(undefined)

async function loadCustomIconImage() {
  if (!props.tile.customIconImage) {
    customIconImageBase64.value = undefined
    return
  }
  const cached = imageCache.get(props.tile.customIconImage)
  if (cached) {
    customIconImageBase64.value = cached
    return
  }
  const base64 = await window.electronAPI.readImageBase64(props.tile.customIconImage)
  if (base64) {
    imageCache.set(props.tile.customIconImage, base64)
    customIconImageBase64.value = base64
  }
}

watch(() => props.tile.customIconImage, loadCustomIconImage, { immediate: true })

// 自定义 icon 组件
const customIconComponent = computed(() => {
  if (!props.tile.customIcon) return null
  const iconName = props.tile.customIcon
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  const component = (LucideIcons as Record<string, unknown>)[iconName]
  return component ? markRaw(component) : null
})

// 应用图标样式（支持用 mask 改颜色）
const appIconStyle = computed(() => {
  if (props.tile.iconColor && appIcon.value) {
    return {
      backgroundImage: 'none',
      backgroundColor: props.tile.iconColor,
      WebkitMaskImage: `url(${appIcon.value})`,
      maskImage: `url(${appIcon.value})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center'
    }
  }
  return {
    backgroundImage: `url(${appIcon.value})`
  }
})

// icon 尺寸根据磁贴大小调整
const iconSize = computed(() => {
  switch (props.tile.size) {
    case 'small': return 28
    case 'medium': return 36
    case 'wide': return 36
    default: return 36
  }
})

// icon 容器样式（圆角背景 + 背景透明度）
const iconContainerStyle = computed(() => {
  const style: Record<string, string> = {}
  // 默认白色背景，透明度默认0（完全透明），用户可直接调整透明度
  const bgColor = props.tile.iconBgColor || '#ffffff'
  const opacity = props.tile.iconOpacity !== undefined ? props.tile.iconOpacity : 0
  if (opacity > 0) {
    const pad = 6
    style.backgroundColor = hexToRgba(bgColor, opacity)
    style.borderRadius = '8px'
    style.padding = `${pad}px`
    style.width = `${iconSize.value + pad * 2}px`
    style.height = `${iconSize.value + pad * 2}px`
    style.boxSizing = 'border-box'
  }
  return style
})

// hex 颜色转 rgba
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// 对齐方式映射（justify=垂直方向，align=水平方向，textAlign=名称文字对齐）
const alignMap: Record<string, { justify: string; align: string; textAlign: string }> = {
  'top-left': { justify: 'flex-start', align: 'flex-start', textAlign: 'left' },
  'top-center': { justify: 'flex-start', align: 'center', textAlign: 'center' },
  'top-right': { justify: 'flex-start', align: 'flex-end', textAlign: 'right' },
  'center-left': { justify: 'center', align: 'flex-start', textAlign: 'left' },
  'center': { justify: 'center', align: 'center', textAlign: 'center' },
  'center-right': { justify: 'center', align: 'flex-end', textAlign: 'right' },
  'bottom-left': { justify: 'flex-end', align: 'flex-start', textAlign: 'left' },
  'bottom-center': { justify: 'flex-end', align: 'center', textAlign: 'center' },
  'bottom-right': { justify: 'flex-end', align: 'flex-end', textAlign: 'right' }
}

// 默认对齐方式（按尺寸）
const defaultAlignMap: Record<string, string> = {
  small: 'center',
  medium: 'bottom-left',
  wide: 'bottom-left'
}

const contentStyle = computed(() => {
  const align = props.tile.contentAlign || defaultAlignMap[props.tile.size] || 'bottom-left'
  const mapped = alignMap[align] || alignMap['bottom-left']
  return {
    flexDirection: 'column' as const,
    justifyContent: mapped.justify,
    alignItems: mapped.align,
    textAlign: mapped.textAlign
  }
})

// 名称文字对齐（直接绑到标题元素，避免继承链断裂）
const textAlign = computed(() => {
  const align = props.tile.contentAlign || defaultAlignMap[props.tile.size] || 'bottom-left'
  return alignMap[align]?.textAlign || 'left'
})

// 通知队列
const notifications = computed(() => tilesStore.getNotifications(props.tile.appId))
const currentNotification = computed(() => notifications.value[0])
const nextNotification = computed(() => notifications.value[1])

onMounted(() => {
  // 检测标题是否溢出
  checkNameOverflow()
  // 监听磁贴尺寸变化，自动重新检测溢出
  if (titleRef.value) {
    resizeObserver = new ResizeObserver(() => {
      checkNameOverflow()
    })
    resizeObserver.observe(titleRef.value)
  }
})

// 监听名称变化，重新检测溢出
watch(tileName, () => {
  checkNameOverflow()
})

let flipTimeout: ReturnType<typeof setTimeout> | null = null
function startFlip() {
  if (flipInterval || flipTimeout) return
  // 按磁贴 id 哈希把初始延迟均匀分布在 0~5s，避免多个磁贴同时翻转
  let h = 0
  const id = props.tile.id || ''
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const delay = (h % 5000)
  flipTimeout = setTimeout(() => {
    flipTimeout = null
    flipInterval = setInterval(() => {
      isFlipped.value = !isFlipped.value
    }, 5000)
  }, delay)
}
function stopFlip() {
  if (flipInterval) {
    clearInterval(flipInterval)
    flipInterval = null
  }
  if (flipTimeout) {
    clearTimeout(flipTimeout)
    flipTimeout = null
  }
  isFlipped.value = false
}

// 监听开关：随时开启/关闭翻转
watch(
  () => props.tile.liveEnabled,
  (on) => {
    if (on) startFlip()
    else stopFlip()
  },
  { immediate: true }
)

onUnmounted(() => {
  if (flipInterval) {
    clearInterval(flipInterval)
  }
  if (flipTimeout) {
    clearTimeout(flipTimeout)
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<style scoped>
.tile-container {
  position: relative;
  cursor: pointer;
  transition: transform 0.15s ease-out;
  transform-style: preserve-3d;
}

/* 背景层：悬停时缩放+变暗，不影响图标和文字 */
.tile-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 2px;
  transition: transform 0.1s ease;
}

.tile-bg::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.15);
  opacity: 0;
  transition: opacity 0.1s ease;
  border-radius: 2px;
}

.tile-container:hover .tile-bg {
  transform: scale(0.98);
}

.tile-container:hover .tile-bg::before {
  opacity: 1;
}

.tile-container.dragging {
  opacity: 0.4;
  transform: scale(0.95);
}

/* 拖拽目标位置高亮 */
.tile-container.drag-target {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
  background: rgba(0, 120, 215, 0.15);
  border-radius: 2px;
}

/* 三种尺寸 - 大小由 Grid 布局控制，磁贴填充单元格 */
.size-small,
.size-medium,
.size-wide {
  width: 100%;
  height: 100%;
}

.tile-content {
  position: relative;
  z-index: 1;
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
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.tile-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  max-width: 100%;
}

/* 溢出的标题：悬停整个磁贴时，名称无缝循环滚动 */
.tile-title-marquee {
  text-overflow: clip;
}

.tile-title-inner {
  display: inline-flex;
  white-space: nowrap;
}

.tile-title-text {
  padding-right: 0;
  flex-shrink: 0;
}

/* 非悬停时隐藏第二份文本，保持 ellipsis 效果 */
.tile-title-text:nth-child(2) {
  display: none;
}

/* 跑马灯模式下，两份文本之间留 30px 间隔 */
.tile-title-marquee .tile-title-text {
  padding-right: 30px;
}

.tile-container:hover .tile-title-marquee .tile-title-text:nth-child(2) {
  display: inline;
}

.tile-container:hover .tile-title-marquee .tile-title-inner {
  animation: tile-marquee 6s linear infinite;
}

@keyframes tile-marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
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
