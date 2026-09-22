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
            <button class="group-bg-btn" @click="selectGroupBackground(group)">
              🖼️ 组背景
            </button>
          </div>
          <div class="preview-grid">
            <div
              v-for="tile in sortedTiles(group)"
              :key="tile.id"
              class="preview-tile"
              :class="[`size-${tile.size}`, { selected: selectedTileId === tile.id }]"
              :style="getTileStyle(tile, group)"
              @click="selectedTileId = tile.id"
            ></div>
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

        <div class="divider"></div>

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
              :style="{ transform: `translate(${cropDialog.offsetX}px, ${cropDialog.offsetY}px) scale(${cropDialog.scale})` }"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useTilesStore } from './stores/useTiles'
import { useAppsStore } from './stores/useApps'

const tilesStore = useTilesStore()
const appsStore = useAppsStore()

const selectedTileId = ref<string | null>(null)
const cropContainerRef = ref<HTMLElement | null>(null)

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
  cropBox: { x: 50, y: 50, width: 200, height: 200 },
  mode: 'tile' as 'tile' | 'group',
  targetGroupId: ''
})

function sortedTiles(group: TileGroup) {
  return [...group.tiles].sort((a, b) => a.row * 100 + a.col - (b.row * 100 + b.col))
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
  const style: Record<string, string> = {
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }

  // 优先用磁贴自己的背景，否则用组背景
  const bgPath = tile.background || group?.background

  if (bgPath) {
    // 如果是组背景，计算每个磁贴显示图片的不同部分
    if (!tile.background && group?.background) {
      // 计算组的网格范围
      let maxRow = 0
      let maxCol = 0
      for (const t of group.tiles) {
        const span = sizeSpan[t.size]
        maxRow = Math.max(maxRow, t.row + span.rows)
        maxCol = Math.max(maxCol, t.col + span.cols)
      }
      const cellSize = 50 // 预览中每个格子的大小
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
      openCropDialog(filePath, base64, 'group')
    }
  }
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

    // 计算缩放比例，让图片适应容器（contain）
    const scaleX = containerW / img.width
    const scaleY = containerH / img.height
    const scale = Math.min(scaleX, scaleY)

    cropDialog.scale = scale
    // 图片已经通过 CSS top:50%, left:50% 居中，offset 设为 0
    cropDialog.offsetX = 0
    cropDialog.offsetY = 0

    // 默认裁剪框居中，大小为容器的 60%
    const size = Math.min(containerW, containerH) * 0.6
    cropDialog.cropBox = {
      x: (containerW - size) / 2,
      y: (containerH - size) / 2,
      width: size,
      height: size
    }
  }
  img.src = imageUrl
}

function clearTileBackground() {
  if (selectedTileId.value) {
    tilesStore.setTileBackground(selectedTileId.value, undefined)
  }
}

function clearAllBackgrounds() {
  tilesStore.clearAllBackgrounds()
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
  const oldScale = cropDialog.scale
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.max(0.1, Math.min(5, oldScale + delta))

  // 以容器中心为锚点缩放
  if (cropContainerRef.value) {
    const rect = cropContainerRef.value.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    // 图片中心点在容器中的位置（考虑当前偏移和缩放）
    // 图片原始中心点在 transform 之前是 (0,0)（因为 top:50%, left:50%）
    // 缩放后，需要调整 offset 让中心点保持不变
    const ratio = newScale / oldScale
    cropDialog.offsetX = centerX - (centerX - cropDialog.offsetX) * ratio
    cropDialog.offsetY = centerY - (centerY - cropDialog.offsetY) * ratio
  }

  cropDialog.scale = newScale
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
  const box = { ...resizeStartBox }

  if (resizeCorner.includes('r')) box.width = Math.max(50, resizeStartBox.width + dx)
  if (resizeCorner.includes('l')) {
    box.x = resizeStartBox.x + dx
    box.width = Math.max(50, resizeStartBox.width - dx)
  }
  if (resizeCorner.includes('b')) box.height = Math.max(50, resizeStartBox.height + dy)
  if (resizeCorner.includes('t')) {
    box.y = resizeStartBox.y + dy
    box.height = Math.max(50, resizeStartBox.height - dy)
  }

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

function confirmCrop() {
  if (cropDialog.mode === 'tile' && selectedTileId.value) {
    // 单个磁贴：保存图片路径
    tilesStore.setTileBackground(selectedTileId.value, cropDialog.imagePath)
  } else if (cropDialog.mode === 'group') {
    // 组背景：保存到组级别，每个磁贴自动显示图片的不同部分
    tilesStore.setGroupBackground(cropDialog.targetGroupId, cropDialog.imagePath, {
      x: cropDialog.cropBox.x,
      y: cropDialog.cropBox.y,
      width: cropDialog.cropBox.width,
      height: cropDialog.cropBox.height
    })
  }
  cropDialog.visible = false
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

.preview-grid {
  display: grid;
  grid-template-columns: repeat(6, 50px);
  grid-auto-rows: 50px;
  gap: 5px;
}

.preview-tile.size-small { grid-column: span 1; grid-row: span 1; }
.preview-tile.size-medium { grid-column: span 2; grid-row: span 2; }
.preview-tile.size-wide { grid-column: span 4; grid-row: span 2; }
.preview-tile.size-large { grid-column: span 4; grid-row: span 4; }

.preview-tile {
  border-radius: 3px;
  cursor: pointer;
  transition: outline 0.1s ease, transform 0.1s ease;
  border: 2px solid transparent;
}

.preview-tile:hover {
  transform: scale(0.98);
}

.preview-tile.selected {
  border-color: #0078d7;
  box-shadow: 0 0 0 2px rgba(0, 120, 215, 0.3);
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
  top: 50%;
  left: 50%;
  transform-origin: center center;
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
</style>
