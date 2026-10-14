<template>
  <div class="group-style-window" :style="{ background: pageBg }">
    <!-- 加载遮罩：数据加载完成前不可操作 -->
    <div v-if="loading" class="loading-mask">
      <div class="loading-spinner"></div>
      <div class="loading-text">正在加载…</div>
    </div>
    <!-- 标题栏（无边框窗口自绘，可拖动） -->
    <div class="page-header">
      <div class="header-text">
        <span class="page-title">分组背景</span>
        <span v-if="group" class="page-subtitle">{{ group.name }}</span>
      </div>
      <button class="win-close" @click="closeWindow"><X :size="14" /></button>
    </div>

    <!-- 上栏：实时预览 -->
    <div class="preview-area">
      <div class="preview-viewport" :style="previewViewportStyle">
        <div class="preview-stage" :style="previewStageStyle">
          <div class="preview-grid" :style="previewGridStyle">
            <div
              v-for="tile in sortedTiles"
              :key="tile.id"
              class="preview-cell"
              :style="cellStyle(tile)"
            ></div>
          </div>
        </div>
      </div>
      <div class="preview-hint">实时预览</div>
    </div>

    <!-- 下栏：设置控件（可滚动） -->
    <div class="controls">
      <div class="section-label">背景图片</div>
      <div class="btn-row">
        <button class="action-btn" @click="chooseBackground">
          <ImagePlus :size="13" class="btn-icon" />选择图片
        </button>
        <button
          v-if="group?.background"
          class="action-btn danger"
          @click="tilesStore.setGroupBackground(groupId, undefined); pushUpdate()"
        >
          <Trash2 :size="13" class="btn-icon" />清除背景
        </button>
      </div>
      <div class="hint-text">组背景只对设置时组内已存在的磁贴生效；之后新增的磁贴不会自动继承。</div>
    </div>

    <!-- 底部确定 / 取消 -->
    <div class="page-footer">
      <button class="footer-btn" @click="cancelWindow">取消</button>
      <button class="footer-btn primary" @click="confirmWindow">确定</button>
    </div>

    <!-- 图片裁剪预览 -->
    <CropImageDialog
      :visible="cropVisible"
      :image-url="cropImageUrl"
      :target-ratio="cropRatio"
      :output-width="cropOutW"
      :output-height="cropOutH"
      :gif-mode="cropGifMode"
      @cancel="cropVisible = false"
      @confirm="onCropConfirmed"
      @transform="onCropTransform"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { X, ImagePlus, Trash2 } from 'lucide-vue-next'
import CropImageDialog from './components/CropImageDialog.vue'
import { useTilesStore } from './stores/useTiles'
import { useAppsStore } from './stores/useApps'
import { useSettingsStore } from './stores/useSettings'

const tilesStore = useTilesStore()

// TODO(组背景 BUG 待修复): 组背景设置仍存在问题，修复前勿视为完成。
// 已知反馈：组背景裁剪后的图片可能模糊/拉伸（单磁贴裁剪已高清化并修正比例，组背景切片仍需复核）。
const settingsStore = useSettingsStore()
const appsStore = useAppsStore()

const pageBg = computed(() => `rgba(32, 32, 32, ${settingsStore.getListAlpha()})`)

const groupId = ref('')
const loading = ref(true)
const group = computed(() => tilesStore.groups.find((g) => g.id === groupId.value))

const sizeSpan: Record<string, { rows: number; cols: number }> = {
  small: { rows: 1, cols: 1 },
  medium: { rows: 2, cols: 2 },
  wide: { rows: 2, cols: 4 }
}

const sortedTiles = computed(() =>
  group.value ? [...group.value.tiles].sort((a, b) => a.position - b.position) : []
)

// ---- 布局/刷新同步（编辑期间不通知主窗口，点确定才保存） ----
let updateTimer: ReturnType<typeof setTimeout> | null = null
let snapshot = ''

function closeWindow() {
  cancelWindow()
}

function pushUpdate() {
  if (updateTimer) clearTimeout(updateTimer)
}

async function confirmWindow() {
  await tilesStore.saveLayout()
  await window.api.notifyLayoutUpdated()
  window.api.closeGroupStyleWindow()
}

async function cancelWindow() {
  try {
    if (snapshot) {
      tilesStore.groups = JSON.parse(snapshot)
      await tilesStore.saveLayout()
    }
  } catch (e) {
    console.error('回滚失败', e)
  }
  window.api.closeGroupStyleWindow()
}

onMounted(async () => {
  try {
    await settingsStore.loadTileOpacity()
    await tilesStore.loadLayout()
    // 独立窗口有独立的 apps store，需自行加载，否则预览显示 appId
    appsStore.loadApps()
    const target = await window.api.getGroupStyleTarget()
    if (target) groupId.value = target
    snapshot = JSON.stringify(tilesStore.groups)
    // 给预览图片一点渲染时间
    setTimeout(() => { loading.value = false }, 300)
  } finally {
    // 兜底：加载异常时也不卡住界面
    setTimeout(() => { loading.value = false }, 1500)
  }
})

// ---- 预览尺寸 ----
// 预览视口可用空间（窗口 560x640，扣掉标题栏和下方控件）
const PREVIEW_W = 500
const PREVIEW_H = 220

const previewViewportStyle = computed(() => ({
  width: `${PREVIEW_W}px`,
  height: `${PREVIEW_H}px`
}))

const previewStageStyle = computed(() => {
  let maxRow = 0
  let maxCol = 0
  if (group.value) {
    for (const t of group.value.tiles) {
      const span = sizeSpan[t.size] || { rows: 2, cols: 2 }
      maxRow = Math.max(maxRow, t.row + span.rows)
      maxCol = Math.max(maxCol, t.col + span.cols)
    }
  }
  if (maxRow === 0) maxRow = 2
  if (maxCol === 0) maxCol = 2
  const cell = 76
  const natW = maxCol * cell
  const natH = maxRow * cell
  // 等比缩放，整组完整放进视口，不出现滚动条
  const scale = Math.min(PREVIEW_W / natW, PREVIEW_H / natH)
  const scaledW = natW * scale
  const scaledH = natH * scale
  return {
    width: `${natW}px`,
    height: `${natH}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    left: `${(PREVIEW_W - scaledW) / 2}px`,
    top: `${(PREVIEW_H - scaledH) / 2}px`
  }
})

// 每个宫格按组背景切片显示：和实际 LiveTile 渲染一致
function cellStyle(tile: any) {
  const span = sizeSpan[tile.size] || { rows: 2, cols: 2 }
  const style: Record<string, string> = {
    gridRow: `${tile.row + 1} / span ${span.rows}`,
    gridColumn: `${tile.col + 1} / span ${span.cols}`
  }
  if (!bgImage.value) return style
  // 只给设置背景时快照里的磁贴显示组背景；新增磁贴不继承
  const snap = group.value?.backgroundTiles
  if (snap && !snap.includes(tile.id)) return style
  const cell = 76
  const g: Record<string, unknown> = group.value || {}
  const natW = (g.backgroundGroupW as number) || 0
  const natH = (g.backgroundGroupH as number) || 0
  const isGif = (group.value?.background || '').toLowerCase().endsWith('.gif')
  style.backgroundImage = `url(${bgImage.value})`
  style.backgroundRepeat = 'no-repeat'
  const off = (tile as Record<string, unknown>).bgOffset as { row: number; col: number } | undefined
  const fixedRow = off?.row ?? tile.row
  const fixedCol = off?.col ?? tile.col
  const gCrop = (g.backgroundGifCrop as { rw: number; rh: number; px: number; py: number } | undefined)
  if (isGif && gCrop) {
    // GIF 按用户裁剪坐标映射到整组平面后切片
    const dw = gCrop.rw * natW, dh = gCrop.rh * natH
    const ox = gCrop.px * natW, oy = gCrop.py * natH
    style.backgroundSize = `${dw}px ${dh}px`
    style.backgroundPosition = `${ox - fixedCol * cell}px ${oy - fixedRow * cell}px`
  } else if (isGif && bgNaturalSize.value) {
    // GIF 整组 cover 等比缩放后切片
    const iw = bgNaturalSize.value.w, ih = bgNaturalSize.value.h
    const s = Math.max(natW / iw, natH / ih)
    const dw = iw * s, dh = ih * s
    const cx = (natW - dw) / 2, cy = (natH - dh) / 2
    style.backgroundSize = `${dw}px ${dh}px`
    style.backgroundPosition = `${cx - fixedCol * cell}px ${cy - fixedRow * cell}px`
  } else {
    style.backgroundSize = `${natW}px ${natH}px`
    style.backgroundPosition = `-${fixedCol * cell}px -${fixedRow * cell}px`
  }
  return style
}


// 宫格列数按组实际列数，避免超过 6 列时换行错位
const previewGridStyle = computed(() => {
  let maxCol = 0
  for (const t of group.value?.tiles || []) {
    const sp = sizeSpan[t.size] || { rows: 2, cols: 2 }
    maxCol = Math.max(maxCol, t.col + sp.cols)
  }
  if (maxCol === 0) maxCol = 2
  return { gridTemplateColumns: `repeat(${maxCol}, 70px)` }
})

// ---- 背景图片 ----
const cropVisible = ref(false)
const cropImageUrl = ref('')
const cropRatio = ref(1)
const cropOutW = ref(256)
const cropOutH = ref(256)
const cropGifMode = ref(false)
const cropGifBase64 = ref('')

// 预览用的组背景图 base64
const bgImage = ref('')
// GIF 原始尺寸（预览 cover 切片用）
const bgNaturalSize = ref<{ w: number; h: number } | null>(null)
watch(bgImage, (url) => {
  bgNaturalSize.value = null
  if (!url) return
  const img = new Image()
  img.onload = () => { bgNaturalSize.value = { w: img.naturalWidth, h: img.naturalHeight } }
  img.src = url
})
watch(
  () => group.value?.background,
  async (path) => {
    if (!path) {
      bgImage.value = ''
      return
    }
    const b64 = await window.api.readImageBase64(path)
    bgImage.value = b64 || ''
  },
  { immediate: true }
)

async function chooseBackground() {
  const filePath = await window.api.selectImage()
  if (!filePath) return
  const base64 = await window.api.readImageBase64(filePath)
  if (!base64) return
  const isGif = filePath.toLowerCase().endsWith('.gif')
  cropGifMode.value = isGif
  cropGifBase64.value = isGif ? base64 : ''
  let maxRow = 0
  let maxCol = 0
  if (group.value) {
    for (const t of group.value.tiles) {
      const span = sizeSpan[t.size] || { rows: 2, cols: 2 }
      maxRow = Math.max(maxRow, t.row + span.rows)
      maxCol = Math.max(maxCol, t.col + span.cols)
    }
  }
  cropRatio.value = maxCol > 0 && maxRow > 0 ? maxCol / maxRow : 1
  cropOutW.value = maxCol * 76
  cropOutH.value = maxRow * 76
  cropImageUrl.value = base64
  cropVisible.value = true
}

async function onCropTransform(meta: { rw: number; rh: number; px: number; py: number }) {
  cropVisible.value = false
  const base64 = cropGifBase64.value
  if (!base64) return
  const saved = await window.api.saveImage(base64, `group-${groupId.value}-${Date.now()}`)
  if (saved) {
    tilesStore.setGroupBackground(groupId.value, saved, undefined, meta)
    pushUpdate()
  }
}

async function onCropConfirmed(dataUrl: string) {
  cropVisible.value = false
  const saved = await window.api.saveImage(dataUrl, `group-${groupId.value}-${Date.now()}`)
  if (saved) {
    tilesStore.setGroupBackground(groupId.value, saved)
    pushUpdate()
  }
}
</script>

<style scoped>
.group-style-window {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(32, 32, 32, 0.62);
  color: #e0e0e0;
  overflow: hidden;
  position: relative;
}
.loading-mask {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(32, 32, 32, 0.92);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(255, 255, 255, 0.18);
  border-top-color: var(--accent-color, #0078d7);
  border-radius: 50%;
  animation: gstyle-spin 0.8s linear infinite;
}
@keyframes gstyle-spin {
  to { transform: rotate(360deg); }
}
.loading-text {
  font-size: 12px;
  color: #bbb;
}


.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 10px 18px;
  -webkit-app-region: drag;
  flex-shrink: 0;
}
.header-text { display: flex; align-items: baseline; gap: 10px; }
.page-title { font-size: 14px; font-weight: 600; color: #fff; }
.page-subtitle { font-size: 12px; color: #999; }
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

.page-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 20px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.footer-btn {
  padding: 7px 22px;
  border-radius: 5px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.08);
  color: #e0e0e0;
}
.footer-btn:hover { background: rgba(255, 255, 255, 0.16); }
.footer-btn.primary { background: var(--accent-color); color: #fff; }
.footer-btn.primary:hover { background: #106ebe; }

.preview-area {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 0 16px;
}
.preview-viewport {
  position: relative;
  overflow: hidden;
}
.preview-stage {
  position: absolute;
  top: 0;
  left: 0;
}
.preview-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 2px;
}
.preview-grid {
  display: grid;
  grid-template-columns: repeat(6, 70px);
  grid-auto-rows: 70px;
  gap: 6px;
  align-content: start;
  width: max-content;
}
.preview-cell {
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  box-sizing: border-box;
}
.preview-hint { margin-top: 10px; font-size: 11px; color: #888; }

.controls {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 20px 20px;
}
.controls::-webkit-scrollbar { width: 8px; }
.controls::-webkit-scrollbar-track { background: transparent; }
.controls::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
.controls::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }

.section-label { font-size: 12px; color: #aaa; }
.btn-row { display: flex; flex-wrap: wrap; gap: 6px; }
.hint-text { font-size: 11px; color: #888; line-height: 1.5; }

.action-btn {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #e0e0e0;
  padding: 7px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.action-btn:hover { background: rgba(255, 255, 255, 0.14); }
.action-btn.danger { color: #ff9090; }
.action-btn.danger:hover { background: rgba(255, 100, 100, 0.15); }
.btn-icon { vertical-align: middle; margin-right: 4px; }
</style>
