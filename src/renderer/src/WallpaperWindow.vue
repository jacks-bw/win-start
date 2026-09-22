<template>
  <div class="wallpaper-window">
    <div class="wallpaper-header">
      <span class="title">磁贴壁纸设置</span>
    </div>

    <div class="wallpaper-body">
      <!-- 左侧：磁贴布局预览 -->
      <div class="wallpaper-preview">
        <div
          v-for="group in tilesStore.groups"
          :key="group.id"
          class="preview-group"
        >
          <div class="preview-group-header">
            <span class="preview-group-name">{{ group.name }}</span>
            <div class="group-actions">
              <button class="group-bg-btn" @click="selectGroupBackground(group)">
                🖼️ 组背景
              </button>
              <button class="group-bg-btn danger" @click="clearGroupBackground(group.id)">
                🗑️ 清除组
              </button>
            </div>
          </div>
          <div class="preview-grid">
            <div
              v-for="tile in sortedTiles(group)"
              :key="tile.id"
              class="preview-tile"
              :class="[`size-${tile.size}`, { selected: selectedTileId === tile.id }]"
              :style="{
                gridRow: `${tile.row + 1} / span ${sizeSpan[tile.size]?.rows || 1}`,
                gridColumn: `${tile.col + 1} / span ${sizeSpan[tile.size]?.cols || 1}`,
                ...getTileStyle(tile, group)
              }"
              @click="selectedTileId = tile.id"
            >
              <div class="preview-tile-content" :class="previewContentLayout(tile.size)">
                <div v-if="tile.showIcon !== false" class="preview-tile-icon">
                  <component
                    v-if="getCustomIconComponent(tile.customIcon)"
                    :is="getCustomIconComponent(tile.customIcon)"
                    :size="previewIconSize(tile.size)"
                    :color="tile.iconColor || '#fff'"
                    :stroke-width="2"
                  />
                  <span v-else-if="getAppIcon(tile.appId)" class="preview-icon-img" :style="{ backgroundImage: `url(${getAppIcon(tile.appId)})` }"></span>
                  <span v-else class="preview-icon-placeholder">{{ getAppName(tile.appId).charAt(0) }}</span>
                </div>
                <div v-if="tile.showName !== false && tile.size !== 'small'" class="preview-tile-text">
                  <div class="preview-tile-title" :style="{ color: tile.nameColor || undefined }">{{ getAppName(tile.appId) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：操作区 -->
      <div class="wallpaper-actions">
        <div v-if="selectedTile" class="selected-tile-info">
          <div class="tile-name">{{ selectedTileName }}</div>
          <div class="tile-size">尺寸：{{ sizeName[selectedTile.size] }}</div>
        </div>
        <div v-else class="no-selection">
          点击左侧磁贴选择
        </div>

        <button class="action-btn" :disabled="!selectedTile" @click="selectTileImage">
          📷 选择图片
        </button>
        <button
          v-if="selectedTile?.background"
          class="action-btn danger"
          @click="clearTileBackground"
        >
          🗑️ 清除背景
        </button>

        <!-- 图标和名称控制 -->
        <div v-if="selectedTile" class="toggle-section">
          <label class="toggle-item">
            <input type="checkbox" :checked="showIcon" @change="toggleIcon" />
            <span>显示图标</span>
          </label>
          <label class="toggle-item">
            <input type="checkbox" :checked="showName" @change="toggleName" />
            <span>显示名称</span>
          </label>
        </div>

        <!-- 自定义 Icon -->
        <div v-if="selectedTile" class="custom-section">
          <div class="section-label">自定义图标</div>
          <div class="color-row">
            <button class="action-btn small" @click="showIconPicker = true">
              {{ selectedTile.customIcon ? '✏️ 更换图标' : '➕ 选择图标' }}
            </button>
            <button
              v-if="selectedTile.customIcon"
              class="action-btn small danger"
              @click="clearCustomIcon"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- 颜色设置 -->
        <div v-if="selectedTile" class="custom-section">
          <div class="section-label">图标颜色</div>
          <div class="color-row">
            <input
              type="color"
              class="color-input"
              :value="selectedTile.iconColor || '#ffffff'"
              @input="setIconColor(($event.target as HTMLInputElement).value)"
            />
            <button
              v-if="selectedTile.iconColor"
              class="action-btn small danger"
              @click="clearIconColor"
            >
              ✕ 清除
            </button>
          </div>

          <div class="section-label" style="margin-top: 12px;">名称颜色</div>
          <div class="color-row">
            <input
              type="color"
              class="color-input"
              :value="selectedTile.nameColor || '#ffffff'"
              @input="setNameColor(($event.target as HTMLInputElement).value)"
            />
            <button
              v-if="selectedTile.nameColor"
              class="action-btn small danger"
              @click="clearNameColor"
            >
              ✕ 清除
            </button>
          </div>
        </div>

        <div class="divider"></div>

        <button
          v-if="selectedTile && (selectedTile.background || (pendingBackgrounds[selectedTile.id] && pendingBackgrounds[selectedTile.id] !== CLEAR_MARKER))"
          class="action-btn danger"
          @click="clearTileBackground"
        >
          🗑️ 清除此磁贴背景
        </button>

        <div v-if="hasPendingChanges" class="pending-actions">
          <div class="pending-hint">有未保存的更改</div>
          <button class="action-btn primary" @click="savePendingBackgrounds">
            💾 保存应用
          </button>
          <div class="divider"></div>
        </div>

        <button class="action-btn" @click="clearAllBackgrounds">
          🧹 清除全部背景
        </button>
      </div>
    </div>

    <!-- 图片裁剪弹窗 -->
    <div v-if="cropDialog.visible" class="crop-overlay">
      <div class="crop-dialog">
        <div class="crop-header">
          <span>裁剪图片</span>
          <button class="close-btn" @click="cropDialog.visible = false">×</button>
        </div>
        <div class="crop-body">
          <div class="crop-container" ref="cropContainerRef" @wheel="onWheelZoom">
            <img
              :src="cropDialog.imageUrl"
              class="crop-image"
              :style="imageTransformStyle"
              @mousedown="startImageDrag"
              draggable="false"
            />
            <div class="crop-overlay-mask">
              <div class="crop-box" :style="cropBoxStyle" @mousedown="startCropBoxDrag">
                <div class="crop-corner tl" @mousedown.stop="startResize('tl', $event)"></div>
                <div class="crop-corner tr" @mousedown.stop="startResize('tr', $event)"></div>
                <div class="crop-corner bl" @mousedown.stop="startResize('bl', $event)"></div>
                <div class="crop-corner br" @mousedown.stop="startResize('br', $event)"></div>
              </div>
            </div>
          </div>
          <div class="crop-controls">
            <label class="scale-control">
              缩放: {{ Math.round(cropDialog.scale * 100) }}%
              <input type="range" min="0.1" max="3" step="0.01" v-model.number="cropDialog.scale" />
            </label>
          </div>
        </div>
        <div class="crop-footer">
          <button class="dialog-btn" @click="cropDialog.visible = false">取消</button>
          <button class="dialog-btn primary" @click="confirmCrop">确定</button>
        </div>
      </div>
    </div>

    <!-- Icon 选择面板 -->
    <div v-if="showIconPicker" class="icon-picker-overlay" @click.self="showIconPicker = false">
      <div class="icon-picker-dialog">
        <div class="icon-picker-header">
          <span>选择图标</span>
          <button class="icon-picker-close" @click="showIconPicker = false">✕</button>
        </div>
        <div class="icon-picker-search">
          <input
            type="text"
            v-model="iconSearchQuery"
            placeholder="搜索图标..."
            class="icon-search-input"
          />
        </div>
        <div class="icon-picker-grid">
          <button
            v-for="icon in filteredIcons"
            :key="icon.name"
            class="icon-picker-item"
            :class="{ active: selectedTile?.customIcon === icon.name }"
            @click="selectIcon(icon.name)"
            :title="icon.name"
          >
            <component :is="icon.component" :size="24" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, markRaw } from 'vue'
import { useTilesStore } from './stores/useTiles'
import { useAppsStore } from './stores/useApps'
import * as LucideIcons from 'lucide-vue-next'

const tilesStore = useTilesStore()
const appsStore = useAppsStore()

const selectedTileId = ref<string | null>(null)
const cropContainerRef = ref<HTMLElement | null>(null)

// Icon 选择器
const showIconPicker = ref(false)
const iconSearchQuery = ref('')

// 常用 icon 列表（精选一组）
const popularIconNames = [
  'home', 'user', 'settings', 'search', 'heart', 'star', 'mail', 'phone',
  'camera', 'image', 'music', 'video', 'gamepad-2', 'book', 'file', 'folder',
  'download', 'upload', 'share', 'link', 'lock', 'unlock', 'key', 'shield',
  'globe', 'map', 'navigation', 'compass', 'clock', 'calendar', 'bell', 'flag',
  'sun', 'moon', 'cloud', 'cloud-rain', 'wind', 'zap', 'droplets', 'thermometer',
  'cpu', 'hard-drive', 'monitor', 'smartphone', 'tablet', 'laptop', 'wifi', 'bluetooth',
  'code', 'terminal', 'git-branch', 'package', 'box', 'archive', 'layers', 'grid',
  'palette', 'brush', 'pen', 'pencil', 'scissors', 'crop', 'zoom-in', 'zoom-out',
  'trash', 'edit', 'copy', 'clipboard', 'save', 'printer', 'send', 'inbox',
  'shopping-cart', 'shopping-bag', 'tag', 'gift', 'credit-card', 'dollar-sign', 'percent', 'pie-chart',
  'bar-chart', 'line-chart', 'activity', 'trending-up', 'trending-down', 'target', 'award', 'trophy',
  'rocket', 'plane', 'car', 'bike', 'train', 'ship', 'footprints', 'umbrella',
  'coffee', 'utensils', 'apple', 'pizza', 'ice-cream', 'cake', 'wine', 'beer',
  'dumbbell', 'heart-pulse', 'stethoscope', 'pill', 'brain', 'eye', 'ear', 'smile'
]

const iconList = computed(() => {
  return popularIconNames
    .map((name) => {
      const componentName = name
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')
      const component = (LucideIcons as Record<string, unknown>)[componentName]
      return component ? { name, component: markRaw(component) } : null
    })
    .filter(Boolean) as { name: string; component: unknown }[]
})

const filteredIcons = computed(() => {
  if (!iconSearchQuery.value) return iconList.value
  const q = iconSearchQuery.value.toLowerCase()
  return iconList.value.filter((icon) => icon.name.includes(q))
})

function selectIcon(iconName: string) {
  if (selectedTileId.value) {
    tilesStore.setTileCustomIcon(selectedTileId.value, iconName)
  }
  showIconPicker.value = false
}

function clearCustomIcon() {
  if (selectedTileId.value) {
    tilesStore.setTileCustomIcon(selectedTileId.value, undefined)
  }
}

function setIconColor(color: string) {
  if (selectedTileId.value) {
    tilesStore.setTileIconColor(selectedTileId.value, color)
  }
}

function clearIconColor() {
  if (selectedTileId.value) {
    tilesStore.setTileIconColor(selectedTileId.value, undefined)
  }
}

function setNameColor(color: string) {
  if (selectedTileId.value) {
    tilesStore.setTileNameColor(selectedTileId.value, color)
  }
}

function clearNameColor() {
  if (selectedTileId.value) {
    tilesStore.setTileNameColor(selectedTileId.value, undefined)
  }
}

const sizeSpan: Record<string, { rows: number; cols: number }> = {
  small: { rows: 1, cols: 1 },
  medium: { rows: 2, cols: 2 },
  wide: { rows: 2, cols: 4 },
  large: { rows: 4, cols: 4 }
}

const sizeName: Record<string, string> = {
  small: '小',
  medium: '中',
  wide: '宽',
  large: '大'
}

// 裁剪弹窗状态
const cropDialog = reactive({
  visible: false,
  imageUrl: '',
  imagePath: '',
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  imgWidth: 0,
  imgHeight: 0,
  cropBox: { x: 50, y: 50, width: 200, height: 200 },
  targetRatio: 1, // 裁剪框目标宽高比
  mode: 'tile' as 'tile' | 'group',
  targetGroupId: '',
  targetTileId: ''
})

// 待应用的临时背景（预览用，点击保存后才真正应用）
const pendingBackgrounds = reactive<Record<string, string>>({}) // tileId -> filePath
const hasPendingChanges = ref(false)

// 图片完整 transform（图片左上角定位，计算居中位置）
const imageTransformStyle = computed(() => {
  if (!cropContainerRef.value || cropDialog.imgWidth === 0) return {}
  const containerW = cropContainerRef.value.clientWidth
  const containerH = cropContainerRef.value.clientHeight
  const centerX = containerW / 2
  const centerY = containerH / 2
  const x = centerX - (cropDialog.imgWidth * cropDialog.scale) / 2 + cropDialog.offsetX
  const y = centerY - (cropDialog.imgHeight * cropDialog.scale) / 2 + cropDialog.offsetY
  return {
    transform: `translate(${x}px, ${y}px) scale(${cropDialog.scale})`,
    transformOrigin: 'top left'
  }
})

function sortedTiles(group: TileGroup) {
  return [...group.tiles].sort((a, b) => a.row * 100 + a.col - (b.row * 100 + b.col))
}

// 获取应用名称
function getAppName(appId: string): string {
  const app = appsStore.apps.find((a) => a.id === appId)
  return app?.name || appId
}

// 获取应用图标
function getAppIcon(appId: string): string {
  const app = appsStore.apps.find((a) => a.id === appId)
  return app?.icon || ''
}

// 获取自定义 icon 组件
function getCustomIconComponent(iconName?: string) {
  if (!iconName) return null
  const componentName = iconName
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  return (LucideIcons as Record<string, unknown>)[componentName] || null
}

// 预览 icon 尺寸
function previewIconSize(size: string): number {
  switch (size) {
    case 'small': return 24
    case 'medium': return 32
    case 'wide': return 32
    case 'large': return 40
    default: return 32
  }
}

// 预览内容布局
function previewContentLayout(size: string): string {
  switch (size) {
    case 'small': return 'center-icon'
    case 'medium': return 'bottom-left'
    case 'wide': return 'bottom-left'
    case 'large': return 'top-left'
    default: return 'bottom-left'
  }
}

const selectedTile = computed(() => {
  if (!selectedTileId.value) return null
  for (const group of tilesStore.groups) {
    const tile = group.tiles.find((t) => t.id === selectedTileId.value)
    if (tile) return tile
  }
  return null
})

const selectedTileName = computed(() => {
  if (!selectedTile.value) return ''
  const app = appsStore.apps.find((a) => a.id === selectedTile.value!.appId)
  return app?.name || selectedTile.value.appId
})

const showIcon = computed(() => selectedTile.value?.showIcon !== false)
const showName = computed(() => selectedTile.value?.showName !== false)

function getTileStyle(tile: TileItem, group?: TileGroup) {
  // 引用 refreshKey 触发响应式更新
  void refreshKey.value
  void hasPendingChanges.value
  const style: Record<string, string> = {
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }

  // 优先显示待应用的临时背景
  const pendingBg = pendingBackgrounds[tile.id]
  // 如果标记为清除，则不显示背景
  if (pendingBg === CLEAR_MARKER) {
    style.backgroundColor = 'rgba(255,255,255,0.1)'
    return style
  }
  // 优先用磁贴自己的背景，否则用组背景
  const bgPath = pendingBg || tile.background || group?.background

  if (bgPath) {
    // 如果是组背景（且没有磁贴自己的背景和临时背景），计算每个磁贴显示图片的不同部分
    if (!pendingBg && !tile.background && group?.background) {
      // 计算组的网格范围
      let maxRow = 0
      let maxCol = 0
      for (const t of group.tiles) {
        const span = sizeSpan[t.size]
        maxRow = Math.max(maxRow, t.row + span.rows)
        maxCol = Math.max(maxCol, t.col + span.cols)
      }
      const cellSize = 76 // 每个格子占据的大小（70内容+6gap），与实际磁贴一致
      const groupWidth = maxCol * cellSize
      const groupHeight = maxRow * cellSize
      style.backgroundSize = `${groupWidth}px ${groupHeight}px`
      style.backgroundPosition = `-${tile.col * cellSize}px -${tile.row * cellSize}px`
    }

    const cached = imageCache.get(bgPath)
    if (cached) {
      style.backgroundImage = `url(${cached})`
    } else {
      style.backgroundColor = 'rgba(255,255,255,0.1)'
      loadTileBackground(bgPath)
    }
  } else {
    style.backgroundColor = 'rgba(255,255,255,0.1)'
  }
  return style
}

// 图片缓存
const imageCache = new Map<string, string>()
const refreshKey = ref(0)

async function loadTileBackground(filePath: string) {
  if (imageCache.has(filePath)) return
  const base64 = await window.electronAPI.readImageBase64(filePath)
  if (base64) {
    imageCache.set(filePath, base64)
    refreshKey.value++
  }
}

function toggleIcon() {
  if (selectedTileId.value) {
    tilesStore.setTileShowIcon(selectedTileId.value, !showIcon.value)
  }
}

function toggleName() {
  if (selectedTileId.value) {
    tilesStore.setTileShowName(selectedTileId.value, !showName.value)
  }
}

async function selectTileImage() {
  if (!selectedTileId.value) return
  const filePath = await window.electronAPI.selectImage()
  if (filePath) {
    const base64 = await window.electronAPI.readImageBase64(filePath)
    if (base64) {
      cropDialog.targetTileId = selectedTileId.value
      // 计算单个磁贴的宽高比
      const tile = findTile(selectedTileId.value)
      if (tile) {
        const span = sizeSpan[tile.size]
        cropDialog.targetRatio = span.cols / span.rows
      }
      openCropDialog(filePath, base64, 'tile')
    }
  }
}

async function selectGroupBackground(group: TileGroup) {
  const filePath = await window.electronAPI.selectImage()
  if (filePath) {
    const base64 = await window.electronAPI.readImageBase64(filePath)
    if (base64) {
      cropDialog.targetGroupId = group.id
      // 计算整组磁贴的宽高比
      let maxRow = 0
      let maxCol = 0
      for (const t of group.tiles) {
        const span = sizeSpan[t.size]
        maxRow = Math.max(maxRow, t.row + span.rows)
        maxCol = Math.max(maxCol, t.col + span.cols)
      }
      cropDialog.targetRatio = maxCol / maxRow
      openCropDialog(filePath, base64, 'group')
    }
  }
}

function findTile(tileId: string): TileItem | null {
  for (const group of tilesStore.groups) {
    const tile = group.tiles.find((t) => t.id === tileId)
    if (tile) return tile
  }
  return null
}

function openCropDialog(filePath: string, imageUrl: string, mode: 'tile' | 'group') {
  cropDialog.visible = true
  cropDialog.imagePath = filePath
  cropDialog.imageUrl = imageUrl
  cropDialog.mode = mode
  cropDialog.offsetX = 0
  cropDialog.offsetY = 0
  cropDialog.scale = 1

  // 等图片加载完成后，自动缩放到容器中间
  const img = new Image()
  img.onload = () => {
    if (!cropContainerRef.value) return
    const containerW = cropContainerRef.value.clientWidth
    const containerH = cropContainerRef.value.clientHeight

    cropDialog.imgWidth = img.width
    cropDialog.imgHeight = img.height

    // 计算缩放比例，让图片适应容器（contain）
    const scaleX = containerW / img.width
    const scaleY = containerH / img.height
    const scale = Math.min(scaleX, scaleY) * 0.9 // 留一点边距

    cropDialog.scale = scale
    cropDialog.offsetX = 0
    cropDialog.offsetY = 0

    // 按目标比例计算裁剪框大小，居中显示
    const ratio = cropDialog.targetRatio
    const maxW = containerW * 0.8
    const maxH = containerH * 0.8
    let cropW = maxW
    let cropH = cropW / ratio
    if (cropH > maxH) {
      cropH = maxH
      cropW = cropH * ratio
    }
    cropDialog.cropBox = {
      x: (containerW - cropW) / 2,
      y: (containerH - cropH) / 2,
      width: cropW,
      height: cropH
    }
  }
  img.src = imageUrl
}

const CLEAR_MARKER = '__CLEAR__'

function clearTileBackground() {
  if (selectedTileId.value) {
    pendingBackgrounds[selectedTileId.value] = CLEAR_MARKER
    hasPendingChanges.value = true
  }
}

function clearGroupBackground(groupId: string) {
  const group = tilesStore.groups.find((g) => g.id === groupId)
  if (group) {
    for (const tile of group.tiles) {
      pendingBackgrounds[tile.id] = CLEAR_MARKER
    }
    hasPendingChanges.value = true
  }
}

function clearAllBackgrounds() {
  // 对所有有背景的磁贴标记为清除
  for (const group of tilesStore.groups) {
    for (const tile of group.tiles) {
      if (tile.background) {
        pendingBackgrounds[tile.id] = CLEAR_MARKER
      }
    }
  }
  hasPendingChanges.value = true
}

// 图片拖动
let isImageDragging = false
let imageDragStartX = 0
let imageDragStartY = 0
let imageStartOffsetX = 0
let imageStartOffsetY = 0

function startImageDrag(e: MouseEvent) {
  e.preventDefault()
  isImageDragging = true
  imageDragStartX = e.clientX
  imageDragStartY = e.clientY
  imageStartOffsetX = cropDialog.offsetX
  imageStartOffsetY = cropDialog.offsetY
  window.addEventListener('mousemove', onImageDrag)
  window.addEventListener('mouseup', stopImageDrag)
}

function onImageDrag(e: MouseEvent) {
  if (!isImageDragging) return
  cropDialog.offsetX = imageStartOffsetX + (e.clientX - imageDragStartX)
  cropDialog.offsetY = imageStartOffsetY + (e.clientY - imageDragStartY)
}

function stopImageDrag() {
  isImageDragging = false
  window.removeEventListener('mousemove', onImageDrag)
  window.removeEventListener('mouseup', stopImageDrag)
}

// 裁剪框整体拖动
let isCropBoxDragging = false
let cropBoxDragStartX = 0
let cropBoxDragStartY = 0
let cropBoxStartX = 0
let cropBoxStartY = 0

function startCropBoxDrag(e: MouseEvent) {
  e.preventDefault()
  isCropBoxDragging = true
  cropBoxDragStartX = e.clientX
  cropBoxDragStartY = e.clientY
  cropBoxStartX = cropDialog.cropBox.x
  cropBoxStartY = cropDialog.cropBox.y
  window.addEventListener('mousemove', onCropBoxDrag)
  window.addEventListener('mouseup', stopCropBoxDrag)
}

function onCropBoxDrag(e: MouseEvent) {
  if (!isCropBoxDragging) return
  cropDialog.cropBox.x = cropBoxStartX + (e.clientX - cropBoxDragStartX)
  cropDialog.cropBox.y = cropBoxStartY + (e.clientY - cropBoxDragStartY)
}

function stopCropBoxDrag() {
  isCropBoxDragging = false
  window.removeEventListener('mousemove', onCropBoxDrag)
  window.removeEventListener('mouseup', stopCropBoxDrag)
}

// 鼠标滚轮缩放（以画面中心为锚点）
function onWheelZoom(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  // 图片中心位置 = center + offset，与 scale 无关，所以缩放时不需要调整 offset
  cropDialog.scale = Math.max(0.1, Math.min(5, cropDialog.scale + delta))
}

// 裁剪框四角缩放
let isResizing = false
let resizeCorner = ''
let resizeStartX = 0
let resizeStartY = 0
let resizeStartBox = { x: 0, y: 0, width: 0, height: 0 }

function startResize(corner: string, e: MouseEvent) {
  e.stopPropagation()
  isResizing = true
  resizeCorner = corner
  resizeStartX = e.clientX
  resizeStartY = e.clientY
  resizeStartBox = { ...cropDialog.cropBox }
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}

function onResize(e: MouseEvent) {
  if (!isResizing) return
  const dx = e.clientX - resizeStartX
  const dy = e.clientY - resizeStartY
  const ratio = cropDialog.targetRatio
  const box = { ...resizeStartBox }

  // 保持宽高比，以水平拖动为主
  let newWidth = resizeStartBox.width
  if (resizeCorner.includes('r')) newWidth = resizeStartBox.width + dx
  if (resizeCorner.includes('l')) newWidth = resizeStartBox.width - dx

  // 如果垂直拖动更大，以垂直为主
  let newHeight = resizeStartBox.height
  if (resizeCorner.includes('b')) newHeight = resizeStartBox.height + dy
  if (resizeCorner.includes('t')) newHeight = resizeStartBox.height - dy

  // 取变化更大的那个方向，保持比例
  if (Math.abs(newWidth - resizeStartBox.width) * ratio > Math.abs(newHeight - resizeStartBox.height)) {
    newWidth = Math.max(50, newWidth)
    newHeight = newWidth / ratio
  } else {
    newHeight = Math.max(50 / ratio, newHeight)
    newWidth = newHeight * ratio
  }

  // 调整位置
  if (resizeCorner.includes('l')) box.x = resizeStartBox.x + (resizeStartBox.width - newWidth)
  if (resizeCorner.includes('t')) box.y = resizeStartBox.y + (resizeStartBox.height - newHeight)
  box.width = newWidth
  box.height = newHeight

  cropDialog.cropBox = box
}

function stopResize() {
  isResizing = false
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
}

const cropBoxStyle = computed(() => ({
  left: `${cropDialog.cropBox.x}px`,
  top: `${cropDialog.cropBox.y}px`,
  width: `${cropDialog.cropBox.width}px`,
  height: `${cropDialog.cropBox.height}px`
}))

async function confirmCrop() {
  if (cropDialog.mode === 'tile' && cropDialog.targetTileId) {
    // 单个磁贴：先截取裁剪框区域，保存到临时状态
    const base64 = await cropSingleTile()
    if (base64) {
      const savedPath = await window.electronAPI.saveImage(base64, `tile-${cropDialog.targetTileId}-${Date.now()}`)
      if (savedPath) {
        pendingBackgrounds[cropDialog.targetTileId] = savedPath
        hasPendingChanges.value = true
      }
    }
  } else if (cropDialog.mode === 'group') {
    // 组背景：切割成每个磁贴独立的小图，保存到临时状态
    await splitImageToTiles()
  }
  cropDialog.visible = false
}

// 截取单个磁贴的裁剪框区域
async function cropSingleTile(): Promise<string | null> {
  if (!cropContainerRef.value) return null
  const containerW = cropContainerRef.value.clientWidth
  const containerH = cropContainerRef.value.clientHeight

  // 加载原图
  const img = new Image()
  img.src = cropDialog.imageUrl
  await new Promise((resolve) => {
    img.onload = resolve
    img.onerror = resolve
  })

  // 图片左上角在容器中的位置
  const scale = cropDialog.scale
  const imgLeft = containerW / 2 - (img.width * scale) / 2 + cropDialog.offsetX
  const imgTop = containerH / 2 - (img.height * scale) / 2 + cropDialog.offsetY

  // 创建 canvas，大小等于裁剪框大小
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(cropDialog.cropBox.width)
  canvas.height = Math.round(cropDialog.cropBox.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // 黑色背景
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 把图片绘制到 canvas 上，只显示裁剪框区域
  const drawX = imgLeft - cropDialog.cropBox.x
  const drawY = imgTop - cropDialog.cropBox.y
  const drawW = img.width * scale
  const drawH = img.height * scale
  ctx.drawImage(img, drawX, drawY, drawW, drawH)

  return canvas.toDataURL('image/png')
}

// 把图片切割成每个磁贴独立的小图（参考 Tile Genie 原理）
async function splitImageToTiles() {
  const group = tilesStore.groups.find((g) => g.id === cropDialog.targetGroupId)
  if (!group) return

  // 第一步：先把裁剪框区域截取成一张完整的图
  const croppedBase64 = await cropSingleTile()
  if (!croppedBase64) return

  // 加载截取后的图
  const croppedImg = new Image()
  croppedImg.src = croppedBase64
  await new Promise((resolve) => {
    croppedImg.onload = resolve
    croppedImg.onerror = resolve
  })

  // 第二步：计算组的网格范围
  let maxRow = 0
  let maxCol = 0
  for (const tile of group.tiles) {
    const span = sizeSpan[tile.size]
    maxRow = Math.max(maxRow, tile.row + span.rows)
    maxCol = Math.max(maxCol, tile.col + span.cols)
  }

  // 第三步：按网格切割，每个磁贴对应截取图的一部分
  const cellW = croppedImg.width / maxCol
  const cellH = croppedImg.height / maxRow

  for (const tile of group.tiles) {
    const span = sizeSpan[tile.size]
    const sx = tile.col * cellW
    const sy = tile.row * cellH
    const sw = span.cols * cellW
    const sh = span.rows * cellH

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw))
    canvas.height = Math.max(1, Math.round(sh))
    const ctx = canvas.getContext('2d')
    if (!ctx) continue

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(croppedImg, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

    const base64 = canvas.toDataURL('image/png')
    const savedPath = await window.electronAPI.saveImage(base64, `tile-${tile.id}-${Date.now()}`)
    if (savedPath) {
      pendingBackgrounds[tile.id] = savedPath
    }
  }

  hasPendingChanges.value = true
}

// 保存待应用的背景到实际磁贴
async function savePendingBackgrounds() {
  for (const [tileId, bgPath] of Object.entries(pendingBackgrounds)) {
    if (bgPath === CLEAR_MARKER) {
      tilesStore.setTileBackground(tileId, undefined)
    } else {
      tilesStore.setTileBackground(tileId, bgPath)
    }
  }
  for (const key of Object.keys(pendingBackgrounds)) delete pendingBackgrounds[key]
  hasPendingChanges.value = false
  // 通知开始菜单窗口重新加载布局
  await window.electronAPI.notifyLayoutUpdated()
}

// 取消待应用的更改
function cancelPendingChanges() {
  for (const key of Object.keys(pendingBackgrounds)) delete pendingBackgrounds[key]
  hasPendingChanges.value = false
}
</script>

<style scoped>
.wallpaper-window {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.wallpaper-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: #252525;
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.wallpaper-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.wallpaper-preview {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #1a1a1a;
}

.wallpaper-preview::-webkit-scrollbar {
  width: 8px;
}

.wallpaper-preview::-webkit-scrollbar-track {
  background: transparent;
}

.wallpaper-preview::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.wallpaper-preview::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.preview-group {
  margin-bottom: 24px;
}

.preview-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.preview-group-name {
  font-size: 12px;
  color: #888;
  font-weight: 600;
}

.group-bg-btn {
  background: #333;
  border: none;
  color: #ccc;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: background 0.15s ease;
}

.group-bg-btn:hover {
  background: #444;
}

.group-bg-btn.danger {
  color: #ff8080;
}

.group-bg-btn.danger:hover {
  background: rgba(255, 100, 100, 0.15);
}

.group-actions {
  display: flex;
  gap: 6px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(6, 70px);
  grid-auto-rows: 70px;
  gap: 6px;
}

.preview-tile {
  border-radius: 3px;
  cursor: pointer;
  transition: outline 0.1s ease, transform 0.1s ease;
  border: 2px solid transparent;
  overflow: hidden;
}

.preview-tile:hover {
  transform: scale(0.98);
}

.preview-tile.selected {
  border-color: #0078d7;
  box-shadow: 0 0 0 2px rgba(0, 120, 215, 0.3);
}

.preview-tile-content {
  width: 100%;
  height: 100%;
  display: flex;
  padding: 8px;
  box-sizing: border-box;
}

.preview-tile-content.center-icon {
  align-items: center;
  justify-content: center;
}

.preview-tile-content.bottom-left {
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-start;
}

.preview-tile-content.top-left {
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
}

.preview-tile-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-icon-img {
  display: block;
  width: 32px;
  height: 32px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.preview-icon-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.preview-tile-text {
  margin-top: 4px;
}

.preview-tile-title {
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.wallpaper-actions {
  width: 220px;
  padding: 20px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  background: #252525;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selected-tile-info {
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  margin-bottom: 8px;
}

.tile-name {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.tile-size {
  font-size: 12px;
  color: #888;
}

.no-selection {
  padding: 12px;
  text-align: center;
  color: #666;
  font-size: 12px;
  margin-bottom: 8px;
}

.action-btn {
  background: #333;
  border: none;
  color: #e0e0e0;
  padding: 10px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  transition: background 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background: #444;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn.danger {
  color: #ff8080;
}

.action-btn.danger:hover {
  background: rgba(255, 100, 100, 0.15);
}

.action-btn.primary {
  background: #0078d7;
  color: #fff;
}

.action-btn.primary:hover {
  background: #106ebe;
}

.pending-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pending-hint {
  font-size: 12px;
  color: #ffc000;
  text-align: center;
  padding: 6px;
  background: rgba(255, 192, 0, 0.1);
  border-radius: 4px;
}

.toggle-section {
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
  font-size: 12px;
  color: #ccc;
}

.toggle-item input[type="checkbox"] {
  cursor: pointer;
}

.divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 8px 0;
}

/* 裁剪弹窗 */
.crop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.crop-dialog {
  background: #252525;
  border-radius: 8px;
  width: 600px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
}

.crop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 14px;
  font-weight: 600;
}

.close-btn {
  background: transparent;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
}

.close-btn:hover {
  color: #fff;
}

.crop-body {
  padding: 20px;
}

.crop-container {
  position: relative;
  width: 100%;
  height: 350px;
  background: #111;
  border-radius: 4px;
  overflow: hidden;
  cursor: move;
  user-select: none;
  -webkit-user-select: none;
}

.crop-image {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
  user-select: none;
  -webkit-user-drag: none;
}

.crop-overlay-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.crop-box {
  position: absolute;
  border: 2px solid #0078d7;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  cursor: move;
}

.crop-corner {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #0078d7;
  border: 2px solid #fff;
  border-radius: 50%;
}

.crop-corner.tl { top: -6px; left: -6px; cursor: nwse-resize; }
.crop-corner.tr { top: -6px; right: -6px; cursor: nesw-resize; }
.crop-corner.bl { bottom: -6px; left: -6px; cursor: nesw-resize; }
.crop-corner.br { bottom: -6px; right: -6px; cursor: nwse-resize; }

.crop-controls {
  margin-top: 16px;
}

.scale-control {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #ccc;
}

.scale-control input[type="range"] {
  flex: 1;
}

.crop-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.dialog-btn {
  padding: 8px 20px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  background: #333;
  color: #ccc;
  transition: background 0.15s ease;
}

.dialog-btn:hover {
  background: #444;
}

.dialog-btn.primary {
  background: #0078d7;
  color: #fff;
}

.dialog-btn.primary:hover {
  background: #106ebe;
}

/* 自定义设置区域 */
.custom-section {
  margin-top: 12px;
}

.section-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 6px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-input {
  width: 40px;
  height: 28px;
  border: 1px solid #444;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.color-input::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.color-input::-webkit-color-swatch {
  border: none;
  border-radius: 2px;
}

.action-btn.small {
  padding: 4px 10px;
  font-size: 12px;
  flex: 1;
}

/* Icon 选择面板 */
.icon-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.icon-picker-dialog {
  background: #2a2a2a;
  border-radius: 8px;
  width: 520px;
  max-height: 500px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.icon-picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid #3a3a3a;
  font-size: 14px;
  font-weight: 600;
}

.icon-picker-close {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 8px;
  border-radius: 4px;
}

.icon-picker-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.icon-picker-search {
  padding: 12px 18px;
  border-bottom: 1px solid #3a3a3a;
}

.icon-search-input {
  width: 100%;
  padding: 8px 12px;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  outline: none;
}

.icon-search-input:focus {
  border-color: #0078d7;
}

.icon-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  padding: 14px 18px;
  overflow-y: auto;
  flex: 1;
}

.icon-picker-item {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #ccc;
  transition: all 0.15s ease;
}

.icon-picker-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.icon-picker-item.active {
  background: rgba(0, 120, 215, 0.2);
  border-color: #0078d7;
  color: #fff;
}

.icon-picker-grid::-webkit-scrollbar {
  width: 8px;
}

.icon-picker-grid::-webkit-scrollbar-track {
  background: transparent;
}

.icon-picker-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.icon-picker-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
</style>
