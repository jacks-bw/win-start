<template>
  <div class="avatar-settings-window" :style="{ background: pageBg }">
    <!-- 加载遮罩：数据加载完成前不可操作 -->
    <div v-if="loading" class="loading-mask">
      <div class="loading-spinner"></div>
      <div class="loading-text">正在加载…</div>
    </div>

    <!-- 标题栏（无边框窗口自绘，可拖动） -->
    <div class="page-header">
      <span class="page-title">用户头像</span>
      <button class="win-close" @click="discardAndClose"><X :size="14" /></button>
    </div>

    <!-- 内容 -->
    <div class="avatar-body">
      <div class="avatar-circle">
        <div v-if="displayed.url" class="avatar-clip">
          <img
            :src="displayed.url"
            class="avatar-img"
            :class="{ 'no-crop': !displayedHasCrop }"
            :style="displayedImgStyle"
            draggable="false"
          />
        </div>
        <User v-else :size="48" class="avatar-placeholder" />
      </div>

      <div class="avatar-tip">{{ tipText }}</div>

      <div class="btn-group">
        <button class="action-btn primary" @click="chooseImage">
          <ImagePlus :size="14" class="btn-icon" />选择图片
        </button>
        <button
          v-if="!confirmClear"
          class="action-btn danger"
          :disabled="!current.url"
          @click="beginConfirmClear"
        >
          <Trash2 :size="14" class="btn-icon" />清空头像
        </button>
        <button v-else class="action-btn danger solid" @click="markClear">
          确认清空？
        </button>
      </div>
    </div>

    <!-- 底部保存（关闭即丢弃未保存改动） -->
    <div class="page-footer">
      <button class="footer-btn primary" :disabled="!dirty" @click="save">保存</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { X, ImagePlus, Trash2, User } from 'lucide-vue-next'
import { useSettingsStore } from './stores/useSettings'

const settingsStore = useSettingsStore()
const pageBg = computed(() => `rgba(32, 32, 32, ${settingsStore.getListAlpha()})`)

const loading = ref(true)
const confirmClear = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | null = null

interface AvatarData {
  url?: string
  cropX?: number
  cropY?: number
  scale?: number
  imgW?: number
  imgH?: number
  cropSize?: number
}
// 已保存的头像
const current = ref<AvatarData>({})
// 本次新选并裁剪、暂存的头像
const staged = ref<AvatarData | null>(null)
// 本次标记为清空
const stagedClear = ref(false)

const dirty = computed(() => stagedClear.value || !!staged.value)
const displayed = computed<AvatarData>(() =>
  stagedClear.value ? {} : (staged.value || current.value)
)
const displayedHasCrop = computed(() => !!(displayed.value.cropSize && displayed.value.scale))
const tipText = computed(() => {
  if (stagedClear.value) return '保存后将清空头像'
  if (staged.value) return '已选择新头像，点击保存生效'
  if (current.value.url) return '当前头像'
  return '尚未设置头像'
})

const displayedImgStyle = computed(() => {
  const a = displayed.value
  if (!a.cropSize || !a.scale || !a.imgW || !a.imgH) return {}
  // 预览圆形容器 96px
  const container = 96
  const k = container / a.cropSize
  return {
    width: `${a.imgW * a.scale * k}px`,
    height: `${a.imgH * a.scale * k}px`,
    transform: `translate(${a.cropX! * k}px, ${a.cropY! * k}px)`
  }
})

async function loadCurrent() {
  const saved = await window.api.getUserAvatar?.()
  current.value = saved ? (saved as AvatarData) : {}
}
async function loadStaged() {
  const s = await window.api.getStagedAvatar?.()
  staged.value = s ? (s as AvatarData) : null
}

// 选择图片：Rust 端打开文件选择器并接着打开裁剪窗，裁剪结果只暂存
async function chooseImage() {
  try {
    await window.api.selectUserAvatar?.()
  } catch (e) {
    console.error('打开图片选择失败', e)
  }
}

function beginConfirmClear() {
  confirmClear.value = true
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmTimer = setTimeout(() => { confirmClear.value = false }, 3000)
}

function markClear() {
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmClear.value = false
  staged.value = null
  stagedClear.value = true
}

async function save() {
  if (!dirty.value) return
  await window.api.commitAvatar?.(stagedClear.value)
  window.api.closeAvatarSettings?.()
}

async function discardAndClose() {
  await window.api.discardStagedAvatar?.()
  window.api.closeAvatarSettings?.()
}

function onAvatarStaged() {
  loadStaged()
  stagedClear.value = false
}

onMounted(async () => {
  try {
    await loadCurrent()
    await loadStaged()
    window.api.onAvatarStaged?.(onAvatarStaged)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (confirmTimer) clearTimeout(confirmTimer)
})
</script>

<style scoped>
.avatar-settings-window {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(32, 32, 32, 0.62);
  color: #e0e0e0;
  overflow: hidden;
  position: relative;
}

/* 加载遮罩 */
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
  animation: avatar-settings-spin 0.8s linear infinite;
}
@keyframes avatar-settings-spin {
  to { transform: rotate(360deg); }
}
.loading-text {
  font-size: 12px;
  color: #bbb;
}

/* 标题栏 */
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

/* 内容 */
.avatar-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 10px 20px;
}
.avatar-circle {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #fff;
  flex-shrink: 0;
}
.avatar-clip {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 50%;
  position: relative;
}
.avatar-img {
  display: block;
  max-width: none;
}
.avatar-img.no-crop {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-placeholder {
  opacity: 0.9;
}
.avatar-tip {
  font-size: 12px;
  color: #aaa;
}

.btn-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin-top: 6px;
}
.action-btn {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #e0e0e0;
  padding: 9px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
}
.action-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.16); }
.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.action-btn.primary { background: var(--accent-color); color: #fff; }
.action-btn.primary:hover { background: #106ebe; }
.action-btn.danger { color: #ff9090; }
.action-btn.danger:hover:not(:disabled) { background: rgba(255, 100, 100, 0.15); }
.action-btn.danger.solid {
  background: rgba(255, 80, 80, 0.85);
  color: #fff;
}
.btn-icon { vertical-align: middle; margin-right: 6px; }

/* 底部 */
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
.footer-btn.primary:hover:not(:disabled) { background: #106ebe; }
.footer-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
