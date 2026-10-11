<template>
  <div v-if="visible" class="crop-overlay" @click.self="handleCancel">
    <div class="crop-dialog">
      <div class="crop-header">
        <span>裁剪图片</span>
        <button class="close-btn" @click="handleCancel"><X :size="18" /></button>
      </div>
      <div class="crop-body">
        <div class="crop-container" ref="containerRef" @wheel.prevent="onWheelZoom">
          <img
            :src="imageUrl"
            class="crop-image"
            :style="imageTransformStyle"
            @mousedown="startImageDrag"
            draggable="false"
          />
          <div class="crop-overlay-mask">
            <div
              class="crop-box"
              :style="cropBoxStyle"
              @mousedown="startCropBoxDrag"
            >
              <div class="crop-corner tl" @mousedown.stop="startResize('tl', $event)"></div>
              <div class="crop-corner tr" @mousedown.stop="startResize('tr', $event)"></div>
              <div class="crop-corner bl" @mousedown.stop="startResize('bl', $event)"></div>
              <div class="crop-corner br" @mousedown.stop="startResize('br', $event)"></div>
            </div>
          </div>
        </div>
        <div class="crop-controls">
          <label class="scale-control">
            缩放: {{ Math.round(scale * 100) }}%
            <input type="range" min="0.1" max="3" step="0.01" v-model.number="scale" />
          </label>
        </div>
      </div>
      <div class="crop-footer">
        <button class="dialog-btn" @click="handleCancel">取消</button>
        <button class="dialog-btn primary" @click="handleConfirm">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  imageUrl: string
  targetRatio: number
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [dataUrl: string]
}>()

const containerRef = ref<HTMLElement | null>(null)

const scale = ref(1)
const imgWidth = ref(0)
const imgHeight = ref(0)
const offsetX = ref(0)
const offsetY = ref(0)
const cropBox = reactive({ x: 50, y: 50, width: 200, height: 200 })

// 图片加载完成后自动缩放到容器中间，并按目标比例居中放置裁剪框
function setupImage() {
  const containerW = containerRef.value?.clientWidth || 0
  const containerH = containerRef.value?.clientHeight || 0
  if (!containerW || !containerH) return

  const img = new Image()
  img.onload = () => {
    imgWidth.value = img.width
    imgHeight.value = img.height
    scale.value = Math.min(containerW / img.width, containerH / img.height) * 0.9
    offsetX.value = 0
    offsetY.value = 0

    const ratio = props.targetRatio || 1
    const maxW = containerW * 0.8
    const maxH = containerH * 0.8
    let cropW = maxW
    let cropH = cropW / ratio
    if (cropH > maxH) {
      cropH = maxH
      cropW = cropH * ratio
    }
    cropBox.x = (containerW - cropW) / 2
    cropBox.y = (containerH - cropH) / 2
    cropBox.width = cropW
    cropBox.height = cropH
  }
  img.src = props.imageUrl
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      // 等待容器渲染完成后再测量
      requestAnimationFrame(setupImage)
    }
  }
)

const imageTransformStyle = computed(() => {
  if (!containerRef.value || imgWidth.value === 0) return {}
  const containerW = containerRef.value.clientWidth
  const containerH = containerRef.value.clientHeight
  const centerX = containerW / 2
  const centerY = containerH / 2
  const x = centerX - (imgWidth.value * scale.value) / 2 + offsetX.value
  const y = centerY - (imgHeight.value * scale.value) / 2 + offsetY.value
  return {
    transform: `translate(${x}px, ${y}px) scale(${scale.value})`,
    transformOrigin: 'top left'
  }
})

const cropBoxStyle = computed(() => ({
  left: `${cropBox.x}px`,
  top: `${cropBox.y}px`,
  width: `${cropBox.width}px`,
  height: `${cropBox.height}px`
}))

// ---- 图片拖动 ----
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
  imageStartOffsetX = offsetX.value
  imageStartOffsetY = offsetY.value
  window.addEventListener('mousemove', onImageDrag)
  window.addEventListener('mouseup', stopImageDrag)
}

function onImageDrag(e: MouseEvent) {
  if (!isImageDragging) return
  offsetX.value = imageStartOffsetX + (e.clientX - imageDragStartX)
  offsetY.value = imageStartOffsetY + (e.clientY - imageDragStartY)
}

function stopImageDrag() {
  isImageDragging = false
  window.removeEventListener('mousemove', onImageDrag)
  window.removeEventListener('mouseup', stopImageDrag)
}

// ---- 滚轮缩放 ----
function onWheelZoom(e: WheelEvent) {
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  scale.value = Math.max(0.1, Math.min(5, scale.value + delta))
}

// ---- 裁剪框整体拖动 ----
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
  cropBoxStartX = cropBox.x
  cropBoxStartY = cropBox.y
  window.addEventListener('mousemove', onCropBoxDrag)
  window.addEventListener('mouseup', stopCropBoxDrag)
}

function onCropBoxDrag(e: MouseEvent) {
  if (!isCropBoxDragging) return
  cropBox.x = cropBoxStartX + (e.clientX - cropBoxDragStartX)
  cropBox.y = cropBoxStartY + (e.clientY - cropBoxDragStartY)
}

function stopCropBoxDrag() {
  isCropBoxDragging = false
  window.removeEventListener('mousemove', onCropBoxDrag)
  window.removeEventListener('mouseup', stopCropBoxDrag)
}

// ---- 裁剪框四角缩放 ----
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
  resizeStartBox = { ...cropBox }
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}

function onResize(e: MouseEvent) {
  if (!isResizing) return
  const dx = e.clientX - resizeStartX
  const dy = e.clientY - resizeStartY
  const ratio = props.targetRatio || 1
  const box = { ...resizeStartBox }

  let newWidth = resizeStartBox.width
  if (resizeCorner.includes('r')) newWidth = resizeStartBox.width + dx
  if (resizeCorner.includes('l')) newWidth = resizeStartBox.width - dx

  let newHeight = resizeStartBox.height
  if (resizeCorner.includes('b')) newHeight = resizeStartBox.height + dy
  if (resizeCorner.includes('t')) newHeight = resizeStartBox.height - dy

  if (Math.abs(newWidth - resizeStartBox.width) * ratio > Math.abs(newHeight - resizeStartBox.height)) {
    newWidth = Math.max(50, newWidth)
    newHeight = newWidth / ratio
  } else {
    newHeight = Math.max(50 / ratio, newHeight)
    newWidth = newHeight * ratio
  }

  if (resizeCorner.includes('l')) box.x = resizeStartBox.x + (resizeStartBox.width - newWidth)
  if (resizeCorner.includes('t')) box.y = resizeStartBox.y + (resizeStartBox.height - newHeight)
  box.width = newWidth
  box.height = newHeight

  cropBox.x = box.x
  cropBox.y = box.y
  cropBox.width = box.width
  cropBox.height = box.height
}

function stopResize() {
  isResizing = false
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
}

// ---- 确认：把裁剪框区域截成一张图 ----
function handleConfirm() {
  const container = containerRef.value
  if (!container || !props.imageUrl) return
  const containerW = container.clientWidth
  const containerH = container.clientHeight

  const img = new Image()
  img.src = props.imageUrl
  img.onload = () => {
    const s = scale.value
    const imgLeft = containerW / 2 - (img.width * s) / 2 + offsetX.value
    const imgTop = containerH / 2 - (img.height * s) / 2 + offsetY.value

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(cropBox.width)
    canvas.height = Math.round(cropBox.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const drawX = imgLeft - cropBox.x
    const drawY = imgTop - cropBox.y
    ctx.drawImage(img, drawX, drawY, img.width * s, img.height * s)

    emit('confirm', canvas.toDataURL('image/png'))
  }
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.crop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 3000;
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
  color: #e0e0e0;
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
</style>
