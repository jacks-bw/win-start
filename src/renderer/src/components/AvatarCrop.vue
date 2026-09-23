<template>
  <div class="avatar-crop-overlay" @click.self="$emit('cancel')">
    <div class="avatar-crop-dialog">
      <div class="crop-header">
        <span class="crop-title">裁剪用户头像</span>
        <button class="crop-close" @click="$emit('cancel')">
          <X :size="16" />
        </button>
      </div>

      <div
        class="crop-container"
        ref="cropContainerRef"
        @wheel.prevent="onWheelZoom"
        @mousedown="onMouseDown"
      >
        <img
          v-if="imgLoaded"
          ref="imgRef"
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

      <div class="crop-footer">
        <div class="zoom-info">缩放: {{ Math.round(scale * 100) }}%</div>
        <div class="crop-actions">
          <button class="btn btn-cancel" @click="$emit('cancel')">取消</button>
          <button class="btn btn-confirm" @click="confirmCrop">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  imagePath: string
}>()

const emit = defineEmits<{
  confirm: [base64: string]
  cancel: []
}>()

const cropContainerRef = ref<HTMLElement | null>(null)
const imgRef = ref<HTMLImageElement | null>(null)
const imgLoaded = ref(false)

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
  return `file:///${props.imagePath.replace(/\\/g, '/')}`
})

const imageStyle = computed(() => {
  if (!imgLoaded.value || imgWidth.value === 0) return {}
  return {
    width: `${imgWidth.value * scale.value}px`,
    height: `${imgHeight.value * scale.value}px`,
    transform: `translate(${offsetX.value}px, ${offsetY.value}px)`
  }
})

onMounted(() => {
  const img = new Image()
  img.onload = () => {
    imgWidth.value = img.naturalWidth
    imgHeight.value = img.naturalHeight
    // 初始缩放：让图片短边等于裁剪框大小
    const minDim = Math.min(imgWidth.value, imgHeight.value)
    scale.value = CROP_SIZE / minDim
    // 居中
    offsetX.value = (CROP_SIZE - imgWidth.value * scale.value) / 2
    offsetY.value = (CROP_SIZE - imgHeight.value * scale.value) / 2
    imgLoaded.value = true
  }
  img.src = imageUrl.value
})

function onWheelZoom(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.max(0.1, Math.min(5, scale.value + delta))
  scale.value = newScale
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

function confirmCrop() {
  if (!imgLoaded.value || imgWidth.value === 0) return

  // 计算裁剪区域在原始图片中的坐标
  // 裁剪框在容器中居中，容器大小 = CROP_SIZE
  // 图片显示位置 = offsetX, offsetY，大小 = imgWidth*scale, imgHeight*scale
  // 裁剪框左上角相对于图片显示位置的偏移 = -offsetX, -offsetY
  // 转换为原始图片坐标 = (-offsetX) / scale, (-offsetY) / scale
  const cropX = -offsetX.value / scale.value
  const cropY = -offsetY.value / scale.value
  const cropW = CROP_SIZE / scale.value
  const cropH = CROP_SIZE / scale.value

  // 使用 canvas 裁剪
  const canvas = document.createElement('canvas')
  const size = 256 // 输出 256x256
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, size, size)
    const base64 = canvas.toDataURL('image/png')
    emit('confirm', base64)
  }
  img.src = imageUrl.value
}
</script>

<style scoped>
.avatar-crop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.avatar-crop-dialog {
  background: #2d2d2d;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  width: 320px;
}

.crop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.crop-title {
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
}

.crop-close {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.crop-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.crop-container {
  width: 240px;
  height: 240px;
  margin: 20px auto;
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
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
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
  padding: 6px 16px;
  font-size: 13px;
  border-radius: 4px;
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
