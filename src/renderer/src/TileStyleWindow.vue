<template>
  <div class="tile-style-window" :style="{ background: pageBg }">
    <!-- 标题栏（无边框窗口自绘，可拖动） -->
    <div class="page-header">
      <div class="header-text">
        <span class="page-title">磁贴样式</span>
        <span v-if="tile" class="page-subtitle">{{ displayName }}</span>
      </div>
      <button class="win-close" @click="closeWindow"><X :size="14" /></button>
    </div>

    <!-- 上栏：实时预览 -->
    <div class="preview-area">
      <div class="preview-stage" :style="previewStageStyle">
        <LiveTile v-if="tile" :tile="tile" :group="group" static @bg-loaded="onPreviewReady" />
      </div>
      <div class="preview-hint">实时预览</div>
    </div>

    <!-- 下栏：设置控件（可滚动）；预览背景未加载完前禁用 -->
    <div class="controls" :class="{ disabled: !ready }">
      <div class="section-label">背景图片</div>
      <div class="btn-row">
        <button class="action-btn" @click="chooseBackground">
          <ImagePlus :size="13" class="btn-icon" />选择图片
        </button>
        <button
          v-if="tile?.background"
          class="action-btn danger"
          @click="tilesStore.setTileBackground(tileId, undefined); pushUpdate()"
        >
          <Trash2 :size="13" class="btn-icon" />清除背景
        </button>
      </div>

      <div class="divider"></div>

      <label class="toggle-item">
        <input type="checkbox" :checked="tile?.showIcon !== false" @change="onToggle('icon', ($event.target as HTMLInputElement).checked)" />
        <span>显示图标</span>
      </label>
      <label class="toggle-item">
        <input type="checkbox" :checked="tile?.showName !== false" @change="onToggle('name', ($event.target as HTMLInputElement).checked)" />
        <span>显示名称</span>
      </label>

      <div class="divider"></div>

      <div class="section-label">自定义图标</div>
      <div class="btn-row">
        <button class="action-btn" @click="showIconPicker = true">
          <Palette :size="13" class="btn-icon" />内置图标
        </button>
        <button class="action-btn" @click="importIcon">
          <Upload :size="13" class="btn-icon" />导入图标
        </button>
        <button
          v-if="tile?.customIcon || tile?.customIconImage"
          class="action-btn danger"
          @click="resetIcon"
        >
          <Undo2 :size="13" class="btn-icon" />恢复默认
        </button>
      </div>
      <div v-if="tile?.customIcon" class="current-hint">当前：{{ tile.customIcon }}</div>
      <div v-else-if="tile?.customIconImage" class="current-hint">当前：自定义图片</div>

      <div class="divider"></div>

      <div class="color-line">
        <span class="color-label">图标颜色</span>
        <input type="color" class="color-input" :value="tile?.iconColor || '#ffffff'" @input="tilesStore.setTileIconColor(tileId, ($event.target as HTMLInputElement).value); pushUpdate()" />
        <button v-if="tile?.iconColor" class="mini-btn" @click="tilesStore.setTileIconColor(tileId, undefined); pushUpdate()">清除</button>
      </div>
      <div class="color-line">
        <span class="color-label">名称颜色</span>
        <input type="color" class="color-input" :value="tile?.nameColor || '#ffffff'" @input="tilesStore.setTileNameColor(tileId, ($event.target as HTMLInputElement).value); pushUpdate()" />
        <button v-if="tile?.nameColor" class="mini-btn" @click="tilesStore.setTileNameColor(tileId, undefined); pushUpdate()">清除</button>
      </div>
      <div class="color-line">
        <span class="color-label">图标底色</span>
        <input type="color" class="color-input" :value="tile?.iconBgColor || '#ffffff'" @input="tilesStore.setTileIconBgColor(tileId, ($event.target as HTMLInputElement).value); pushUpdate()" />
      </div>

      <div class="color-line" style="margin-top: 10px;">
        <span class="color-label">图标透明度 {{ Math.round((tile?.iconOpacity ?? 0) * 100) }}%</span>
        <input
          type="range"
          class="opacity-slider"
          min="0"
          max="1"
          step="0.05"
          :value="tile?.iconOpacity ?? 0"
          @input="tilesStore.setTileIconOpacity(tileId, parseFloat(($event.target as HTMLInputElement).value)); pushUpdate()"
        />
      </div>

      <div class="divider"></div>

      <div class="section-label">内容位置</div>
      <div class="align-grid">
        <button
          v-for="pos in alignPositions"
          :key="pos"
          class="align-btn"
          :class="{ active: (tile?.contentAlign || defaultAlign) === pos }"
          @click="setAlign(pos)"
        >
          <span class="align-dot"></span>
        </button>
      </div>
    </div>

    <!-- 底部确定 / 取消 -->
    <div class="page-footer">
      <button class="footer-btn" @click="cancelWindow">取消</button>
      <button class="footer-btn primary" @click="confirmWindow">确定</button>
    </div>

    <!-- 图标选择器 -->
    <div v-if="showIconPicker" class="icon-picker-overlay" @click.self="showIconPicker = false">
      <div class="icon-picker-dialog">
        <div class="icon-picker-header">
          <span>选择图标</span>
          <button class="icon-picker-close" @click="showIconPicker = false"><X :size="14" /></button>
        </div>
        <div class="icon-picker-search">
          <input v-model="iconQuery" type="text" placeholder="搜索图标..." class="icon-search-input" />
        </div>
        <div class="icon-picker-grid">
          <button
            v-for="icon in filteredIcons"
            :key="icon.name"
            class="icon-picker-item"
            :class="{ active: tile?.customIcon === icon.name }"
            @click="selectIcon(icon.name)"
          >
            <component :is="icon.component" :size="20" />
          </button>
        </div>
      </div>
    </div>

    <!-- 图片裁剪预览 -->
    <CropImageDialog
      :visible="cropVisible"
      :image-url="cropImageUrl"
      :target-ratio="cropRatio"
      :gif-mode="cropGifMode"
      @cancel="cropVisible = false"
      @confirm="onCropConfirmed"
      @transform="onCropTransform"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, onMounted, ref, watch } from 'vue'
import { useTilesStore } from './stores/useTiles'
import { useAppsStore } from './stores/useApps'
import * as LucideIcons from 'lucide-vue-next'
import { X, ImagePlus, Trash2, Palette, Upload, Undo2 } from 'lucide-vue-next'
import LiveTile from './components/TileGrid/LiveTile.vue'
import CropImageDialog from './components/CropImageDialog.vue'
import { useSettingsStore } from './stores/useSettings'

const tilesStore = useTilesStore()
const settingsStore = useSettingsStore()
const appsStore = useAppsStore()

// 页面背景透明度与开始菜单列表面板保持一致
const pageBg = computed(() => `rgba(32, 32, 32, ${settingsStore.getListAlpha()})`)

const tileId = ref('')
// 预览背景图片加载完成前，禁用控件操作
const ready = ref(false)
function onPreviewReady() {
  ready.value = true
}
watch(tileId, () => {
  ready.value = false
})
const tile = computed(() => {
  if (!tileId.value) return null
  for (const g of tilesStore.groups) {
    const t = g.tiles.find((x) => x.id === tileId.value)
    if (t) return t
  }
  return null
})

const group = computed(() => {
  if (!tileId.value) return undefined
  for (const g of tilesStore.groups) {
    if (g.tiles.some((t) => t.id === tileId.value)) return g
  }
  return undefined
})

// ---- 布局/刷新同步（编辑期间不通知主窗口，点确定才保存） ----
let updateTimer: ReturnType<typeof setTimeout> | null = null
// 打开时的布局快照，用于点取消时回滚
let snapshot = ''

function closeWindow() {
  cancelWindow()
}

// 编辑过程中不主动通知主窗口（主菜单已锁定，确定时统一刷新）
function pushUpdate() {
  if (updateTimer) clearTimeout(updateTimer)
}

// 确定：保存并通知主窗口刷新，然后关闭
async function confirmWindow() {
  await tilesStore.saveLayout()
  await window.electronAPI.notifyLayoutUpdated()
  window.electronAPI.closeTileStyleWindow()
}

// 取消：把布局回滚到打开时的快照，不通知主窗口，直接关闭
async function cancelWindow() {
  try {
    if (snapshot) {
      tilesStore.groups = JSON.parse(snapshot)
      await tilesStore.saveLayout()
    }
  } catch (e) {
    console.error('回滚失败', e)
  }
  window.electronAPI.closeTileStyleWindow()
}

onMounted(async () => {
  await settingsStore.loadTileOpacity()
  // 独立窗口有独立 store，需自行加载磁贴布局与程序列表
  await tilesStore.loadLayout()
  appsStore.loadApps()
  const target = await window.electronAPI.getTileStyleTarget()
  if (target) tileId.value = target
  snapshot = JSON.stringify(tilesStore.groups)
  window.electronAPI.onTileStyleSelect((id) => {
    tileId.value = id
    showIconPicker.value = false
  })
})

// 预览/标题栏显示的软件名（从 apps store 解析）
const displayName = computed(() => {
  if (!tile.value) return ''
  const app = appsStore.apps.find((a) => a.id === tile.value?.appId)
  return app?.name || tile.value.appId
})

// ---- 预览尺寸 ----
const previewStageStyle = computed(() => {
  const cell: Record<string, { rows: number; cols: number }> = {
    small: { rows: 1, cols: 1 },
    medium: { rows: 2, cols: 2 },
    wide: { rows: 2, cols: 4 }
  }
  const s = cell[tile.value?.size || 'medium'] || { rows: 2, cols: 2 }
  // 与实际网格磁贴尺寸一致（格子 76 = 70 内容 + 6 间距，N 格 = N*76-6）
  return {
    width: `${s.cols * 76 - 6}px`,
    height: `${s.rows * 76 - 6}px`
  }
})

// ---- 背景图片 ----
const cropVisible = ref(false)
const cropImageUrl = ref('')
const cropRatio = ref(1)
const cropGifMode = ref(false)
const cropGifBase64 = ref('')

async function chooseBackground() {
  const filePath = await window.electronAPI.selectImage()
  if (!filePath) return
  const base64 = await window.electronAPI.readImageBase64(filePath)
  if (!base64) return
  const isGif = filePath.toLowerCase().endsWith('.gif')
  const ratioMap: Record<string, number> = { small: 1, medium: 1, wide: 2 }
  cropRatio.value = ratioMap[tile.value?.size || 'medium'] || 1
  cropGifMode.value = isGif
  cropGifBase64.value = isGif ? base64 : ''
  cropImageUrl.value = base64
  cropVisible.value = true
}

// GIF：只拿到裁剪坐标，保存原图并附带裁剪信息
async function onCropTransform(meta: { rw: number; rh: number; px: number; py: number }) {
  cropVisible.value = false
  const base64 = cropGifBase64.value
  if (!base64) return
  const saved = await window.electronAPI.saveImage(base64, `tile-${tileId.value}-${Date.now()}`)
  if (saved) {
    tilesStore.setTileBackground(tileId.value, saved, meta)
    pushUpdate()
  }
}

async function onCropConfirmed(dataUrl: string) {
  cropVisible.value = false
  const saved = await window.electronAPI.saveImage(dataUrl, `tile-${tileId.value}-${Date.now()}`)
  if (saved) {
    tilesStore.setTileBackground(tileId.value, saved)
    pushUpdate()
  }
}

// ---- 开关 ----
function onToggle(kind: 'icon' | 'name', checked: boolean) {
  if (kind === 'icon') tilesStore.setTileShowIcon(tileId.value, checked)
  else tilesStore.setTileShowName(tileId.value, checked)
  pushUpdate()
}

// ---- 图标选择器 ----
const showIconPicker = ref(false)
const iconQuery = ref('')

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
  'rocket', 'plane', 'car', 'bike', 'train', 'ship', 'coffee', 'utensils'
]

const iconList = computed(() =>
  popularIconNames
    .map((name) => {
      const componentName = name
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')
      const component = (LucideIcons as Record<string, unknown>)[componentName]
      return component ? { name, component: markRaw(component) } : null
    })
    .filter(Boolean) as { name: string; component: unknown }
)

const filteredIcons = computed(() => {
  if (!iconQuery.value) return iconList.value
  const q = iconQuery.value.toLowerCase()
  return iconList.value.filter((i) => i.name.includes(q))
})

function selectIcon(name: string) {
  tilesStore.setTileCustomIcon(tileId.value, name)
  showIconPicker.value = false
  pushUpdate()
}

async function importIcon() {
  const filePath = await window.electronAPI.selectSvg()
  if (filePath) {
    tilesStore.setTileCustomIconImage(tileId.value, filePath)
    pushUpdate()
  }
}

function resetIcon() {
  tilesStore.setTileCustomIcon(tileId.value, undefined)
  tilesStore.setTileCustomIconImage(tileId.value, undefined)
  pushUpdate()
}

// ---- 内容位置 ----
const alignPositions = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]

const defaultAlign = computed(() => {
  const m: Record<string, string> = { small: 'center', medium: 'bottom-left', wide: 'bottom-left' }
  return m[tile.value?.size || 'medium'] || 'bottom-left'
})

function setAlign(pos: string) {
  tilesStore.setTileContentAlign(tileId.value, pos === defaultAlign.value ? undefined : pos)
  pushUpdate()
}
</script>

<style scoped>
.tile-style-window {
  height: 100vh;
  display: flex;
  flex-direction: column;
  /* 半透明底，透出底层 Acrylic 毛玻璃 */
  background: rgba(32, 32, 32, 0.62);
  color: #e0e0e0;
  overflow: hidden;
}

/* 自绘标题栏：可拖动窗口 */
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
.footer-btn.primary { background: #0078d7; color: #fff; }
.footer-btn.primary:hover { background: #106ebe; }

.controls.disabled {
  pointer-events: none;
  opacity: 0.45;
}

/* 上栏：预览 */
.preview-area {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 0 16px;
}
.preview-hint { margin-top: 10px; font-size: 11px; color: #888; }

/* 下栏：控件，与开始菜单一致的滚动条 */
.controls {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 20px 20px;
}
.controls::-webkit-scrollbar {
  width: 8px;
}
.controls::-webkit-scrollbar-track {
  background: transparent;
}
.controls::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}
.controls::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.section-label { font-size: 12px; color: #aaa; }

.btn-row { display: flex; flex-wrap: wrap; gap: 6px; }

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

.divider { height: 1px; background: rgba(255, 255, 255, 0.08); margin: 6px 0; }

.toggle-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #ccc;
  cursor: pointer;
}

.current-hint {
  font-size: 11px;
  color: #999;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.color-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #ccc;
}
.color-label { width: 64px; flex-shrink: 0; }

.color-input {
  width: 36px;
  height: 24px;
  border: 1px solid #555;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  padding: 0;
}
.color-input::-webkit-color-swatch-wrapper { padding: 2px; }
.color-input::-webkit-color-swatch { border: none; border-radius: 2px; }

.mini-btn {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #ccc;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.mini-btn:hover { background: rgba(255, 255, 255, 0.15); }

.opacity-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  outline: none;
}
.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #0078d7;
  cursor: pointer;
}

.align-grid {
  display: grid;
  grid-template-columns: repeat(3, 28px);
  gap: 4px;
}
.align-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  cursor: pointer;
}
.align-btn:hover { background: rgba(255, 255, 255, 0.12); }
.align-btn.active {
  background: rgba(0, 120, 215, 0.2);
  border-color: #0078d7;
}
.align-dot { width: 5px; height: 5px; border-radius: 50%; background: #888; }
.align-btn.active .align-dot { background: #0078d7; }

/* 图标选择器 */
.icon-picker-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.icon-picker-dialog {
  background: rgba(42, 42, 42, 0.97);
  border-radius: 8px;
  width: 380px;
  max-height: 320px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.icon-picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  font-size: 13px;
  color: #eee;
}
.icon-picker-close { background: none; border: none; color: #999; cursor: pointer; }
.icon-picker-search { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.icon-search-input {
  width: 100%;
  padding: 6px 10px;
  background: rgba(0,0,0,0.3);
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  outline: none;
}
.icon-search-input:focus { border-color: #0078d7; }
.icon-picker-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  padding: 12px 14px;
  overflow-y: auto;
}
.icon-picker-grid::-webkit-scrollbar { width: 8px; }
.icon-picker-grid::-webkit-scrollbar-track { background: transparent; }
.icon-picker-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
.icon-picker-grid::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
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
}
.icon-picker-item:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.icon-picker-item.active {
  background: rgba(0, 120, 215, 0.2);
  border-color: #0078d7;
  color: #fff;
}
</style>
