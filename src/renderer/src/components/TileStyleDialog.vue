<template>
  <div v-if="visible" class="style-overlay" @click.self="emit('close')">
    <div class="style-dialog" @dragstart.prevent>
      <div class="style-header">
        <span>磁贴样式</span>
        <button class="close-btn" @click="emit('close')"><X :size="16" /></button>
      </div>

      <div class="style-body">
        <!-- 左侧：实时预览 -->
        <div class="preview-area">
          <div class="preview-stage" :style="previewStageStyle">
            <LiveTile :tile="tile" :group="group" />
          </div>
          <div class="preview-hint">实时预览</div>
        </div>

        <!-- 右侧：控件 -->
        <div class="controls">
          <!-- 背景图片 -->
          <div class="section-label">背景图片</div>
          <div class="btn-row">
            <button class="action-btn" @click="chooseBackground">
              <ImagePlus :size="13" class="btn-icon" />选择图片
            </button>
            <button
              v-if="tile?.background"
              class="action-btn danger"
              @click="tilesStore.setTileBackground(tileId, undefined)"
            >
              <Trash2 :size="13" class="btn-icon" />清除背景
            </button>
          </div>

          <div class="divider"></div>

          <!-- 开关 -->
          <label class="toggle-item">
            <input type="checkbox" :checked="tile?.showIcon !== false" @change="tilesStore.setTileShowIcon(tileId, ($event.target as HTMLInputElement).checked)" />
            <span>显示图标</span>
          </label>
          <label class="toggle-item">
            <input type="checkbox" :checked="tile?.showName !== false" @change="tilesStore.setTileShowName(tileId, ($event.target as HTMLInputElement).checked)" />
            <span>显示名称</span>
          </label>

          <div class="divider"></div>

          <!-- 自定义图标 -->
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

          <!-- 颜色 -->
          <div class="color-line">
            <span class="color-label">图标颜色</span>
            <input type="color" class="color-input" :value="tile?.iconColor || '#ffffff'" @input="tilesStore.setTileIconColor(tileId, ($event.target as HTMLInputElement).value)" />
            <button v-if="tile?.iconColor" class="mini-btn" @click="tilesStore.setTileIconColor(tileId, undefined)">清除</button>
          </div>
          <div class="color-line">
            <span class="color-label">名称颜色</span>
            <input type="color" class="color-input" :value="tile?.nameColor || '#ffffff'" @input="tilesStore.setTileNameColor(tileId, ($event.target as HTMLInputElement).value)" />
            <button v-if="tile?.nameColor" class="mini-btn" @click="tilesStore.setTileNameColor(tileId, undefined)">清除</button>
          </div>
          <div class="color-line">
            <span class="color-label">图标底色</span>
            <input type="color" class="color-input" :value="tile?.iconBgColor || '#ffffff'" @input="tilesStore.setTileIconBgColor(tileId, ($event.target as HTMLInputElement).value)" />
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
              @input="tilesStore.setTileIconOpacity(tileId, parseFloat(($event.target as HTMLInputElement).value))"
            />
          </div>

          <div class="divider"></div>

          <!-- 内容位置 -->
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, markRaw, watch } from 'vue'
import { useTilesStore } from '../stores/useTiles'
import * as LucideIcons from 'lucide-vue-next'
import { X, ImagePlus, Trash2, Palette, Upload, Undo2 } from 'lucide-vue-next'
import LiveTile from './TileGrid/LiveTile.vue'

const props = defineProps<{
  visible: boolean
  tileId: string
}>()

const emit = defineEmits<{ close: [] }>()

const tilesStore = useTilesStore()

const tile = computed(() => {
  for (const g of tilesStore.groups) {
    const t = g.tiles.find((x) => x.id === props.tileId)
    if (t) return t
  }
  return null
})

const group = computed(() => {
  for (const g of tilesStore.groups) {
    if (g.tiles.some((t) => t.id === props.tileId)) return g
  }
  return undefined
})

// 预览尺寸：与开始菜单网格 cell=76px 对齐
const previewStageStyle = computed(() => {
  const cell: Record<string, { rows: number; cols: number }> = {
    small: { rows: 1, cols: 1 },
    medium: { rows: 2, cols: 2 },
    wide: { rows: 2, cols: 4 }
  }
  const s = cell[tile.value?.size || 'medium'] || { rows: 2, cols: 2 }
  return {
    width: `${s.cols * 76}px`,
    height: `${s.rows * 76}px`
  }
})

// ---- 背景图片：选择 → 裁剪 → 应用 ----
async function chooseBackground() {
  const filePath = await window.electronAPI.selectImage()
  if (!filePath) return
  const base64 = await window.electronAPI.readImageBase64(filePath)
  if (!base64) return
  const ratioMap: Record<string, number> = { small: 1, medium: 1, wide: 2 }
  const ratio = ratioMap[tile.value?.size || 'medium'] || 1
  window.openImageCrop(base64, ratio, async (dataUrl) => {
    const saved = await window.electronAPI.saveImage(dataUrl, `tile-${props.tileId}-${Date.now()}`)
    if (saved) tilesStore.setTileBackground(props.tileId, saved)
  })
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
    .filter(Boolean) as { name: string; component: unknown }[]
)

const filteredIcons = computed(() => {
  if (!iconQuery.value) return iconList.value
  const q = iconQuery.value.toLowerCase()
  return iconList.value.filter((i) => i.name.includes(q))
})

function selectIcon(name: string) {
  tilesStore.setTileCustomIcon(props.tileId, name)
  showIconPicker.value = false
}

async function importIcon() {
  const filePath = await window.electronAPI.selectSvg()
  if (filePath) tilesStore.setTileCustomIconImage(props.tileId, filePath)
}

function resetIcon() {
  tilesStore.setTileCustomIcon(props.tileId, undefined)
  tilesStore.setTileCustomIconImage(props.tileId, undefined)
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
  if (pos === defaultAlign.value) {
    tilesStore.setTileContentAlign(props.tileId, undefined)
  } else {
    tilesStore.setTileContentAlign(props.tileId, pos)
  }
}

// 打开时重置搜索框
watch(
  () => props.visible,
  (v) => {
    if (v) {
      showIconPicker.value = false
      iconQuery.value = ''
    }
  }
)
</script>

<style scoped>
.style-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.style-dialog {
  background: rgba(40, 40, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.style-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 14px;
  font-weight: 600;
  color: #e8e8e8;
}

.close-btn {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.close-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

.style-body {
  display: flex;
  gap: 20px;
  padding: 20px;
}

.preview-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  border-radius: 8px;
  padding: 20px;
  min-width: 220px;
}

.preview-hint {
  margin-top: 12px;
  font-size: 11px;
  color: #777;
}

.controls {
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 2px;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

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

.btn-icon {
  vertical-align: middle;
  margin-right: 4px;
}

.divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 6px 0;
}

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
  color: #888;
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
.color-label {
  width: 64px;
  flex-shrink: 0;
}

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
  background: rgba(255,255,255,0.08);
  border: none;
  color: #ccc;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.mini-btn:hover { background: rgba(255,255,255,0.15); }

.opacity-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255,255,255,0.15);
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
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.align-btn {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  cursor: pointer;
}
.align-btn:hover { background: rgba(255,255,255,0.12); }
.align-btn.active {
  background: rgba(0, 120, 215, 0.2);
  border-color: #0078d7;
}
.align-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #888;
}
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
  background: #2a2a2a;
  border-radius: 8px;
  width: 380px;
  max-height: 320px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.icon-picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid #3a3a3a;
  font-size: 13px;
  color: #eee;
}
.icon-picker-close {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
}
.icon-picker-search { padding: 10px 14px; border-bottom: 1px solid #3a3a3a; }
.icon-search-input {
  width: 100%;
  padding: 6px 10px;
  background: #1e1e1e;
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
.icon-picker-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
.icon-picker-item.active {
  background: rgba(0, 120, 215, 0.2);
  border-color: #0078d7;
  color: #fff;
}
</style>
