<template>
  <div class="settings-window">
    <!-- 标题栏（无边框窗口自绘，可拖动） -->
    <div class="page-header">
      <span class="page-title">设置</span>
      <button class="win-close" @click="closeWindow"><X :size="14" /></button>
    </div>

    <div class="settings-body">
      <!-- 左栏：菜单 -->
      <div class="side-menu">
        <button
          v-for="item in menus"
          :key="item.key"
          class="menu-item"
          :class="{ active: active === item.key }"
          @click="active = item.key"
        >
          <component :is="item.icon" :size="15" class="menu-icon" />
          <span>{{ item.label }}</span>
        </button>
      </div>

      <!-- 右栏：具体功能 -->
      <div class="content-area">
        <!-- 快捷键设置 -->
        <div v-if="active === 'shortcut'" class="panel">
          <div class="panel-title">快捷键设置</div>
          <div class="panel-desc">设置打开 / 关闭开始菜单的全局快捷键。</div>
          <div class="shortcut-row">
            <input
              ref="shortcutInput"
              type="text"
              class="shortcut-input"
              :value="shortcut"
              :placeholder="recording ? '请按下快捷键组合…' : '点击此处后按下快捷键'"
              readonly
              @keydown="onKeyDown"
              @focus="recording = true"
              @blur="recording = false"
            />
          </div>
          <div class="tip">录制时按下组合键（如 Alt+W、Ctrl+Alt+S），按 Esc 取消。</div>
          <div v-if="hotkeyError" class="tip error">{{ hotkeyError }}</div>
          <div v-else-if="resetOk" class="tip ok">已重置为默认快捷键 Alt+W</div>
          <div v-else-if="hotkeyOk" class="tip ok">快捷键已保存并生效</div>
          <div class="panel-actions">
            <button class="action-btn" @mousedown.prevent="shortcutInput?.blur()" @click="resetShortcut">重置</button>
            <button class="action-btn primary" @mousedown.prevent="shortcutInput?.blur()" @click="saveShortcut">保存</button>
          </div>
        </div>

        <!-- 主题色 -->
        <div v-else-if="active === 'theme'" class="panel">
          <div class="panel-title">主题色</div>
          <div class="panel-desc">软件整体主题色与高亮颜色相互独立，均可单独恢复为跟随系统。</div>

          <div class="color-row">
            <div class="color-info">
              <div class="color-label">软件主题色</div>
              <div class="color-sub">{{ themeColor ? '自定义颜色' : '跟随系统' }} · 按钮、磁贴底色等实色</div>
            </div>
            <label class="color-picker" :style="{ background: themeColor || systemColor }">
              <input
                type="color"
                :value="themeColor || systemColor"
                @input="onThemeColor(($event.target as HTMLInputElement).value)"
              />
            </label>
            <button class="action-btn" :disabled="!themeColor" @click="resetThemeColor">跟随系统</button>
          </div>

          <div class="color-row">
            <div class="color-info">
              <div class="color-label">高亮颜色</div>
              <div class="color-sub">{{ highlightColor ? '自定义颜色' : '跟随系统' }} · 悬停、聚焦、拖拽等半透明高亮</div>
            </div>
            <label class="color-picker" :style="{ background: highlightColor || systemColor }">
              <input
                type="color"
                :value="highlightColor || systemColor"
                @input="onHighlightColor(($event.target as HTMLInputElement).value)"
              />
            </label>
            <button class="action-btn" :disabled="!highlightColor" @click="resetHighlightColor">跟随系统</button>
          </div>

          <div v-if="colorError" class="tip error">{{ colorError }}</div>
        </div>

        <!-- 菜单壁纸 -->
        <div v-else-if="active === 'wallpaper'" class="panel">
          <div class="panel-title">开始菜单壁纸</div>
          <div class="panel-desc">壁纸显示在毛玻璃背景之上、磁贴与列表内容之下；仅支持静态图片，按等比裁剪填充。</div>
          <div class="wallpaper-preview" :class="{ empty: !wallpaperPreview }">
            <img v-if="wallpaperPreview" :src="wallpaperPreview" alt="" />
            <div v-if="wallpaperPreview" class="wallpaper-preview-mask" :style="{ background: `rgba(0,0,0,${wallpaperDarken})` }"></div>
            <span v-else class="wallpaper-preview-empty">未设置壁纸</span>
          </div>
          <div class="opacity-row">
            <span class="darken-label">压暗程度</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              :value="wallpaperDarken"
              @input="onDarkenInput(parseFloat(($event.target as HTMLInputElement).value))"
            />
            <span class="opacity-value">{{ Math.round(wallpaperDarken * 100) }}%</span>
          </div>
          <div class="opacity-row">
            <span class="darken-label">列表/工具栏背景</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              :value="panelAlpha"
              @input="onPanelAlphaInput(parseFloat(($event.target as HTMLInputElement).value))"
            />
            <span class="opacity-value">{{ Math.round(panelAlpha * 100) }}%</span>
          </div>
          <div v-if="wallpaperError" class="tip error">{{ wallpaperError }}</div>
          <div class="panel-actions">
            <button class="action-btn" :disabled="!wallpaperPath" @click="removeWallpaper">移除壁纸</button>
            <button class="action-btn primary" @click="pickWallpaper">选择图片</button>
          </div>
        </div>

        <!-- 磁贴透明度 -->
        <div v-else-if="active === 'opacity'" class="panel">
          <div class="panel-title">磁贴透明度</div>
          <div class="panel-desc">调整磁贴背景颜色的不透明度。</div>
          <div class="opacity-row">
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              :value="opacity"
              @input="onOpacityInput(parseFloat(($event.target as HTMLInputElement).value))"
            />
            <span class="opacity-value">{{ Math.round(opacity * 100) }}%</span>
          </div>
          <label class="check-row">
            <input type="checkbox" :checked="includeWallpaper" @change="onToggleIncludeWallpaper(($event.target as HTMLInputElement).checked)" />
            <span>包含有壁纸的磁贴</span>
          </label>
          <div class="tip">未勾选时，透明度仅对没有设置壁纸的磁贴生效；壁纸磁贴保持原图显示。</div>
        </div>

        <!-- 开机自启 -->
        <div v-else-if="active === 'autostart'" class="panel">
          <div class="panel-title">开机自启</div>
          <div class="panel-desc">开启后，登录 Windows 时自动在后台运行本程序。</div>
          <div class="switch-row">
            <span>开机时自动启动</span>
            <button class="switch" :class="{ on: autostart }" @click="toggleAutostart">
              <span class="knob"></span>
            </button>
          </div>
          <div v-if="autostartError" class="tip error">{{ autostartError }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { X, Keyboard, Grid3x3, Power, Palette, Image as ImageIcon } from 'lucide-vue-next'

const menus = [
  { key: 'theme', label: '主题色', icon: Palette },
  { key: 'wallpaper', label: '菜单壁纸', icon: ImageIcon },
  { key: 'shortcut', label: '快捷键设置', icon: Keyboard },
  { key: 'opacity', label: '磁贴透明度', icon: Grid3x3 },
  { key: 'autostart', label: '开机自启', icon: Power }
] as const

const active = ref<'theme' | 'wallpaper' | 'shortcut' | 'opacity' | 'autostart'>('theme')

function closeWindow() {
  window.electronAPI.closeSettingsWindow()
}

// ---------- 快捷键 ----------
const DEFAULT_HOTKEY = 'Alt+W'
const shortcutInput = ref<HTMLInputElement | null>(null)
const shortcut = ref(DEFAULT_HOTKEY)
const originalShortcut = ref(DEFAULT_HOTKEY)
const recording = ref(false)
const hotkeyError = ref('')
const hotkeyOk = ref(false)
const resetOk = ref(false)

function onKeyDown(e: KeyboardEvent) {
  if (!recording.value) return
  e.preventDefault()
  hotkeyError.value = ''
  hotkeyOk.value = false
  if (e.key === 'Escape') {
    shortcut.value = originalShortcut.value
    recording.value = false
    shortcutInput.value?.blur()
    return
  }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  if (parts.length === 0) return
  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  else if (key.startsWith('Arrow')) key = key.replace('Arrow', '')
  parts.push(key)
  shortcut.value = parts.join('+')
}

async function saveShortcut() {
  try {
    await window.electronAPI.setHotkey(shortcut.value)
    originalShortcut.value = shortcut.value
    hotkeyError.value = ''
    hotkeyOk.value = true
    setTimeout(() => (hotkeyOk.value = false), 2500)
  } catch (e: any) {
    hotkeyError.value = String(e?.message || e || '保存失败')
    hotkeyOk.value = false
  }
}

async function resetShortcut() {
  recording.value = false
  shortcutInput.value?.blur()
  try {
    await window.electronAPI.setHotkey(DEFAULT_HOTKEY)
    shortcut.value = DEFAULT_HOTKEY
    originalShortcut.value = DEFAULT_HOTKEY
    hotkeyError.value = ''
    hotkeyOk.value = false
    resetOk.value = true
    setTimeout(() => (resetOk.value = false), 2500)
  } catch (e: any) {
    resetOk.value = false
    hotkeyError.value = String(e?.message || e || '重置失败')
  }
}

// ---------- 磁贴透明度 ----------
const opacity = ref(0.9)
const includeWallpaper = ref(true)

async function onToggleIncludeWallpaper(enable: boolean) {
  includeWallpaper.value = enable
  try {
    await window.electronAPI.setIncludeWallpaperOpacity(enable)
  } catch (e: any) {
    includeWallpaper.value = !enable
    alert('设置失败：' + String(e?.message || e))
  }
}
async function onOpacityInput(v: number) {
  opacity.value = v
  try {
    const saved = await window.electronAPI.setTileOpacity(v)
    if (typeof saved === 'number') opacity.value = saved
  } catch (e) {
    console.error('设置透明度失败', e)
  }
}

// ---------- 菜单壁纸 ----------
const wallpaperPath = ref<string | null>(null)
const wallpaperPreview = ref('')
const wallpaperDarken = ref(0.5)
const panelAlpha = ref(0.4)
const wallpaperError = ref('')

async function refreshWallpaperPreview(path: string | null) {
  if (!path) {
    wallpaperPreview.value = ''
    return
  }
  try {
    wallpaperPreview.value = await window.electronAPI.readImageBase64(path)
  } catch (e) {
    console.error('壁纸预览失败:', e)
    wallpaperPreview.value = ''
  }
}

async function pickWallpaper() {
  wallpaperError.value = ''
  try {
    const p = await window.electronAPI.selectImage()
    if (!p) return
    const saved = await window.electronAPI.setWallpaper(p)
    wallpaperPath.value = saved
    await refreshWallpaperPreview(saved)
  } catch (e: any) {
    wallpaperError.value = String(e?.message || e || '设置失败')
  }
}

async function removeWallpaper() {
  wallpaperError.value = ''
  try {
    await window.electronAPI.clearWallpaper()
    wallpaperPath.value = null
    wallpaperPreview.value = ''
  } catch (e: any) {
    wallpaperError.value = String(e?.message || e || '移除失败')
  }
}

async function onDarkenInput(v: number) {
  wallpaperDarken.value = v
  try {
    const saved = await window.electronAPI.setWallpaperDarken(v)
    if (typeof saved === 'number') wallpaperDarken.value = saved
  } catch (e) {
    console.error('设置压暗程度失败', e)
  }
}

async function onPanelAlphaInput(v: number) {
  panelAlpha.value = v
  try {
    const saved = await window.electronAPI.setPanelAlpha(v)
    if (typeof saved === 'number') panelAlpha.value = saved
  } catch (e) {
    console.error('设置列表/工具栏背景深度失败', e)
  }
}

// ---------- 主题色 ----------
const themeColor = ref<string | null>(null)
const highlightColor = ref<string | null>(null)
const systemColor = ref('#0078d7')
const colorError = ref('')

async function onThemeColor(v: string) {
  themeColor.value = v
  colorError.value = ''
  try {
    await window.electronAPI.setThemeColor(v)
  } catch (e: any) {
    colorError.value = '主题色设置失败：' + String(e?.message || e)
  }
}

async function resetThemeColor() {
  try {
    await window.electronAPI.setThemeColor(null)
    themeColor.value = null
    colorError.value = ''
  } catch (e: any) {
    colorError.value = '恢复失败：' + String(e?.message || e)
  }
}

async function onHighlightColor(v: string) {
  highlightColor.value = v
  colorError.value = ''
  try {
    await window.electronAPI.setHighlightColor(v)
  } catch (e: any) {
    colorError.value = '高亮颜色设置失败：' + String(e?.message || e)
  }
}

async function resetHighlightColor() {
  try {
    await window.electronAPI.setHighlightColor(null)
    highlightColor.value = null
    colorError.value = ''
  } catch (e: any) {
    colorError.value = '恢复失败：' + String(e?.message || e)
  }
}

// ---------- 开机自启 ----------
const autostart = ref(false)
const autostartError = ref('')
async function toggleAutostart() {
  const next = !autostart.value
  try {
    await window.electronAPI.setAutostart(next)
    autostart.value = next
    autostartError.value = ''
  } catch (e: any) {
    autostartError.value = String(e?.message || e || '设置失败')
  }
}

onMounted(async () => {
  try {
    systemColor.value = (await window.electronAPI.getAccentColor()) || '#0078d7'
  } catch (e) {
    console.error('加载系统颜色失败', e)
  }
  try {
    const s = await window.electronAPI.getSettings()
    if (s?.themeColor) themeColor.value = s.themeColor
    if (s?.highlightColor) highlightColor.value = s.highlightColor
    if (s?.hotkey) {
      shortcut.value = s.hotkey
      originalShortcut.value = s.hotkey
    }
    if (typeof s?.tileOpacity === 'number') opacity.value = s.tileOpacity
    includeWallpaper.value = s?.includeWallpaperOpacity !== false
    if (s?.wallpaperPath) wallpaperPath.value = s.wallpaperPath
    wallpaperDarken.value = typeof s?.wallpaperDarken === 'number' ? s.wallpaperDarken : 0.5
    panelAlpha.value = typeof s?.panelAlpha === 'number' ? s.panelAlpha : 0.4
    if (wallpaperPath.value) await refreshWallpaperPreview(wallpaperPath.value)
  } catch (e) {
    console.error('加载设置失败', e)
  }
  try {
    autostart.value = !!(await window.electronAPI.getAutostart())
  } catch (e) {
    console.error('加载自启状态失败', e)
  }
})
</script>

<style scoped>
.settings-window {
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

.settings-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.side-menu {
  width: 168px;
  flex-shrink: 0;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: #cfcfcf;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.menu-item:hover { background: rgba(255, 255, 255, 0.07); }
.menu-item.active { background: var(--accent-active-bg); color: #fff; }
.menu-icon { flex-shrink: 0; }

.content-area {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 24px;
}
.content-area::-webkit-scrollbar { width: 8px; }
.content-area::-webkit-scrollbar-track { background: transparent; }
.content-area::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
.content-area::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }

.panel { display: flex; flex-direction: column; gap: 14px; }
.panel-title { font-size: 15px; font-weight: 600; color: #fff; }
.panel-desc { font-size: 12px; color: #999; line-height: 1.6; }

.shortcut-row { display: flex; gap: 10px; }
.shortcut-input {
  flex: 1;
  padding: 9px 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 5px;
  color: #e0e0e0;
  font-size: 13px;
  font-family: 'Consolas', monospace;
  outline: none;
  cursor: pointer;
}
.shortcut-input:focus { border-color: var(--accent-color); background: var(--accent-soft); }

.opacity-row { display: flex; align-items: center; gap: 14px; }
.opacity-row input[type='range'] { flex: 1; accent-color: var(--accent-color); }
.opacity-value { font-size: 13px; color: #ddd; min-width: 42px; text-align: right; }
.check-row { display: flex; align-items: center; gap: 8px; margin: 14px 0 8px; font-size: 13px; color: #ddd; cursor: pointer; }
.check-row input { accent-color: var(--accent-color); width: 15px; height: 15px; cursor: pointer; }
.color-row { display: flex; align-items: center; gap: 12px; margin: 16px 0; }
.color-info { flex: 1; min-width: 0; }
.color-label { font-size: 13px; color: #ddd; margin-bottom: 4px; }
.color-sub { font-size: 12px; color: #999; }
.color-picker { width: 34px; height: 34px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; overflow: hidden; position: relative; flex-shrink: 0; }
.color-picker input { position: absolute; inset: -4px; width: 120%; height: 120%; border: none; padding: 0; cursor: pointer; background: transparent; }

.darken-label { font-size: 13px; color: #ddd; }
.wallpaper-preview {
  position: relative;
  width: 100%;
  height: 180px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.25);
}
.wallpaper-preview.empty { display: flex; align-items: center; justify-content: center; }
.wallpaper-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wallpaper-preview-mask { position: absolute; inset: 0; }
.wallpaper-preview-empty { font-size: 13px; color: #888; }

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  font-size: 13px;
}
.switch {
  width: 42px;
  height: 22px;
  border-radius: 11px;
  border: none;
  background: rgba(255, 255, 255, 0.18);
  position: relative;
  cursor: pointer;
  transition: background 0.15s;
  padding: 0;
}
.switch.on { background: var(--accent-color); }
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.switch.on .knob { transform: translateX(20px); }

.tip { font-size: 12px; color: #888; }
.tip.error { color: #ff8080; }
.tip.ok { color: #6fcf6f; }

.panel-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  border-radius: 5px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.08);
  color: #e0e0e0;
}
.action-btn:hover { background: rgba(255, 255, 255, 0.16); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn.primary { background: var(--accent-color); color: #fff; }
.action-btn.primary:hover { background: #106ebe; }
.btn-icon { flex-shrink: 0; }
</style>
