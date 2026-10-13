<template>
  <div v-if="visible" class="crop-overlay">
    <div class="crop-dialog">
      <div class="crop-header">
        <span>裁剪图片</span>
        <button class="close-btn" @click="handleCancel"><X :size="18" /></button>
      </div>
      <div class="crop-body">
        <!-- 裁剪取景框（固定，图片在框内拖动/缩放） -->
        <div
          class="crop-viewport"
          ref="viewportRef"
          :style="{ width: viewW + 'px', height: viewH + 'px' }"
          @wheel.prevent="onWheelZoom"
          @mousedown="startDrag"
        >
          <img
            :src="imageUrl"
            class="crop-image"
            :style="imageStyle"
            draggable="false"
          />
          <div class="crop-frame"></div>
        </div>
        <div class="zoom-info">缩放：{{ Math.round(scale * 100) }}%（滚轮缩放，拖动图片调整位置）</div>
      </div>
      <div class="crop-footer">
        <button class="dialog-btn" @click="handleCancel">取消</button>
        <button class="dialog-btn primary" @click="handleConfirm">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  imageUrl: string
  targetRatio: number
  // GIF 等不能用 canvas 裁剪的图：只记录缩放/位移坐标，动画保留
  gifMode?: boolean
  // 裁剪结果输出的目标逻辑像素（默认正方形 256）；实际会按倍率超采样保证清晰
  outputWidth?: number
  outputHeight?: number
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [dataUrl: string]
  // GIF 模式：仅返回裁剪坐标（相对比例，与具体磁贴尺寸无关）
  transform: [meta: { rw: number; rh: number; px: number; py: number }]
}>()

const viewportRef = ref<HTMLElement | null>(null)

const scale = ref(1)
const imgWidth = ref(0)
const imgHeight = ref(0)
const offsetX = ref(0)
const offsetY = ref(0)

// 取景框尺寸：严格按目标比例计算，保证裁剪框与输出比例一致，不拉伸
const viewportSize = computed(() => {
  const ratio = props.targetRatio || 1
  const maxW = 320
  const maxH = 220
  let w = maxW
  let h = w / ratio
  if (h > maxH) {
    h = maxH
    w = h * ratio
  }
  return { w: Math.round(w), h: Math.round(h) }
})
const viewW = computed(() => viewportSize.value.w)
const viewH = computed(() => viewportSize.value.h)

const imageStyle = computed(() => ({
  width: `${imgWidth.value * scale.value}px`,
  height: `${imgHeight.value * scale.value}px`,
  transform: `translate(${offsetX.value}px, ${offsetY.value}px)`
}))

function setupImage() {
  if (!props.imageUrl) return
  const img = new Image()
  img.onload = () => {
    imgWidth.value = img.naturalWidth
    imgHeight.value = img.naturalHeight
    // 初始缩放：让图片完全覆盖取景框
    scale.value = Math.max(viewW.value / img.naturalWidth, viewH.value / img.naturalHeight)
    // 初始居中
    offsetX.value = (viewW.value - img.naturalWidth * scale.value) / 2
    offsetY.value = (viewH.value - img.naturalHeight * scale.value) / 2
    clampOffset()
  }
  img.src = props.imageUrl
}

// 图片完全覆盖取景框所需的最小缩放
function minScale() {
  return Math.max(viewW.value / (imgWidth.value || 1), viewH.value / (imgHeight.value || 1))
}

// 图片边缘不能拖进取景框内（始终铺满）
function clampOffset() {
  const w = imgWidth.value * scale.value
  const h = imgHeight.value * scale.value
  offsetX.value = Math.min(0, Math.max(viewW.value - w, offsetX.value))
  offsetY.value = Math.min(0, Math.max(viewH.value - h, offsetY.value))
}

watch(
  () => props.visible,
  (v) => {
    if (v) requestAnimationFrame(setupImage)
  }
)

// ---- 滚轮缩放（每次 2%） ----
function onWheelZoom(e: WheelEvent) {
  const delta = e.deltaY > 0 ? -0.02 : 0.02
  scale.value = Math.max(minScale(), Math.min(5, scale.value + delta))
  clampOffset()
}

// ---- 拖动图片 ----
let dragging = false
let startX = 0
let startY = 0
let startOffsetX = 0
let startOffsetY = 0

function startDrag(e: MouseEvent) {
  if (!imgWidth.value) return
  e.preventDefault()
  dragging = true
  startX = e.clientX
  startY = e.clientY
  startOffsetX = offsetX.value
  startOffsetY = offsetY.value
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', stopDrag)
}

function onMove(e: MouseEvent) {
  if (!dragging) return
  offsetX.value = startOffsetX + (e.clientX - startX)
  offsetY.value = startOffsetY + (e.clientY - startY)
  clampOffset()
}

function stopDrag() {
  dragging = false
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', stopDrag)
}

// ---- 确认 ----
function handleConfirm() {
  if (!props.imageUrl || !imgWidth.value) return
  const img = new Image()
  img.onload = () => {
    const s = scale.value

    // GIF 模式：只记录裁剪比例，不做 canvas 截图（保留动图）
    if (props.gifMode) {
      const rw = (img.width * s) / viewW.value
      const rh = (img.height * s) / viewH.value
      const px = offsetX.value / viewW.value
      const py = offsetY.value / viewH.value
      emit('transform', { rw, rh, px, py })
      return
    }

    const cropX = -offsetX.value / s
    const cropY = -offsetY.value / s
    const cropW = viewW.value / s
    const cropH = viewH.value / s

    const canvas = document.createElement('canvas')
    const outW = props.outputWidth || 256
    const outH = props.outputHeight || Math.round(256 / props.targetRatio)
    // 超采样：至少 2x，并覆盖屏幕缩放，避免磁贴放大后模糊
    const factor = Math.max(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(outW * factor)
    canvas.height = Math.round(outH * factor)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height)
    emit('confirm', canvas.toDataURL('image/png'))
  }
  img.src = props.imageUrl
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.crop-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.crop-dialog {
  background: rgba(38, 38, 38, 0.92);
  border-radius: 8px;
  width: 420px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.crop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
}
.close-btn {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
}
.close-btn:hover { color: #fff; background: rgba(255, 80, 80, 0.7); }

.crop-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 22px 20px 16px;
}

/* 取景框：固定尺寸、overflow 裁剪，图片只能在框内移动 */
.crop-viewport {
  position: relative;
  overflow: hidden;
  background: #141414;
  cursor: grab;
  user-select: none;
  border-radius: 2px;
  /* 框外压暗 */
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
}
.crop-viewport:active { cursor: grabbing; }

.crop-image {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  transform-origin: top left;
}

.crop-frame {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border: 2px solid #ffffff;
  box-sizing: border-box;
}

.zoom-info {
  font-size: 12px;
  color: #999;
}

.crop-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 18px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.dialog-btn {
  padding: 7px 22px;
  border-radius: 5px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.08);
  color: #e0e0e0;
}
.dialog-btn:hover { background: rgba(255, 255, 255, 0.16); }
.dialog-btn.primary { background: var(--accent-color); color: #fff; }
.dialog-btn.primary:hover { background: #106ebe; }
</style>
