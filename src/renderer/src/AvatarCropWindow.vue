<template>
  <div class="avatar-crop-window">
    <!-- 标题栏（无边框窗口自绘，可拖动） -->
    <div class="page-header">
      <span class="page-title">裁剪用户头像</span>
      <button class="win-close" @click="onCancel"><X :size="14" /></button>
    </div>

    <div class="crop-body">
      <div
        class="crop-container"
        ref="cropContainerRef"
        @wheel.prevent="onWheelZoom"
        @mousedown="onMouseDown"
      >
        <img
          v-if="imgLoaded"
          :src="imageUrl"
          class="crop-image"
          :style="imageStyle"
          draggable="false"
        />
        <!-- 裁剪框（正方形） -->
        <div class="crop-frame">
          <div class="crop-frame-inner"></div>
        </div>
      </div>
    </div>

    <div class="crop-footer">
      <div class="zoom-info">缩放: {{ Math.round(scale * 100) }}%</div>
      <div class="crop-actions">
        <button class="btn btn-cancel" @click="onCancel">取消</button>
        <button class="btn btn-confirm" @click="confirmCrop">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'

const cropContainerRef = ref<HTMLElement | null>(null)
const imgLoaded = ref(false)
const imagePath = ref('')

// 图片原始尺寸
const imgWidth = ref(0)
const imgHeight = ref(0)

// 变换状态
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

// 拖拽状态
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragStartOffsetX = ref(0)
const dragStartOffsetY = ref(0)

// 裁剪框大小（正方形）
const CROP_SIZE = 240

const imageUrl = computed(() => {
  if (!imagePath.value) return ''
  if (imagePath.value.startsWith('data:')) return imagePath.value
  return `file:///${imagePath.value.replace(/\\/g, '/')}`
})

const imageStyle = computed(() => {
  if (!imgLoaded.value || imgWidth.value === 0) return {}
  return {
    width: `${imgWidth.value * scale.value}px`,
    height: `${imgHeight.value * scale.value}px`,
    transform: `translate(${offsetX.value}px, ${offsetY.value}px)`
  }
})

onMounted(async () => {
  // 从主进程获取要裁剪的图片路径
  const path = await window.electronAPI.getCropImage?.()
  if (!path) return
  imagePath.value = path

  const img = new Image()
  img.onload = () => {
    imgWidth.value = img.naturalWidth
    imgHeight.value = img.naturalHeight
    // 初始缩放：让图片完全覆盖裁剪框
    scale.value = Math.max(CROP_SIZE / imgWidth.value, CROP_SIZE / imgHeight.value)
    clampOffset()
    imgLoaded.value = true
  }
  img.src = imageUrl.value
})

function minScale() {
  return Math.max(CROP_SIZE / (imgWidth.value || 1), CROP_SIZE / (imgHeight.value || 1))
}
function clampOffset() {
  const w = imgWidth.value * scale.value
  const h = imgHeight.value * scale.value
  // 图片边缘不能拖进裁剪框内
  offsetX.value = Math.min(0, Math.max(CROP_SIZE - w, offsetX.value))
  offsetY.value = Math.min(0, Math.max(CROP_SIZE - h, offsetY.value))
}
function onWheelZoom(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.02 : 0.02
  scale.value = Math.max(minScale(), Math.min(5, scale.value + delta))
  clampOffset()
}

function onMouseDown(e: MouseEvent) {
  if (!imgLoaded.value) return
  isDragging.value = true
  dragStartX.value = e.clientX
  dragStartY.value = e.clientY
  dragStartOffsetX.value = offsetX.value
  dragStartOffsetY.value = offsetY.value
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  offsetX.value = dragStartOffsetX.value + (e.clientX - dragStartX.value)
  offsetY.value = dragStartOffsetY.value + (e.clientY - dragStartY.value)
  clampOffset()
}

function onMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

function onCancel() {
  window.electronAPI.cancelCrop?.()
}

function confirmCrop() {
  if (!imgLoaded.value || imgWidth.value === 0) return
  // GIF 保存原图 + 裁剪变换，前端显示时按变换定位
  if (imagePath.value.startsWith('data:image/gif')) {
    const crop = {
      x: offsetX.value,
      y: offsetY.value,
      scale: scale.value,
      imgW: imgWidth.value,
      imgH: imgHeight.value,
      cropSize: CROP_SIZE
    }
    window.electronAPI.saveGifAvatar?.(imagePath.value, crop)
    return
  }

  // 计算裁剪区域在原始图片中的坐标
  const cropX = -offsetX.value / scale.value
  const cropY = -offsetY.value / scale.value
  const cropW = CROP_SIZE / scale.value
  const cropH = CROP_SIZE / scale.value

  // 使用 canvas 裁剪
  const canvas = document.createElement('canvas')
  const size = 256
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, size, size)
    const base64 = canvas.toDataURL('image/png')
    window.electronAPI.confirmCrop?.(base64)
  }
  img.src = imageUrl.value
}
</script>

<style scoped>
.avatar-crop-window {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(32, 32, 32, 0.4);
  color: #e0e0e0;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 10px 18px;
  -webkit-app-region: drag;
  flex-shrink: 0;
}
.page-title { font-size: 14px; font-weight: 600; color: #fff; }
.win-close {
  -webkit-app-region: no-drag;
  background: transparent;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.win-close:hover { background: rgba(255, 80, 80, 0.7); color: #fff; }

.crop-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.crop-container {
  width: 240px;
  height: 240px;
  position: relative;
  overflow: hidden;
  background: #1a1a1a;
  cursor: grab;
  user-select: none;
}

.crop-container:active {
  cursor: grabbing;
}

.crop-image {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.crop-frame {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
}

.crop-frame-inner {
  width: 100%;
  height: 100%;
  border: 2px solid #fff;
  box-sizing: border-box;
}

.crop-footer {
  flex-shrink: 0;
  padding: 10px 20px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.zoom-info {
  font-size: 12px;
  color: #999;
}

.crop-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 7px 22px;
  font-size: 13px;
  border-radius: 5px;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-confirm {
  background: #0078d4;
  color: #fff;
}

.btn-confirm:hover {
  background: #106ebe;
}
</style>
