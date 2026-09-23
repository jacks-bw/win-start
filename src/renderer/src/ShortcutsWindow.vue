<template>
  <div class="shortcuts-window">
    <div class="shortcuts-header">
      <span class="title">快捷键设置</span>
    </div>

    <div class="shortcuts-body">
      <div class="shortcut-item">
        <span class="shortcut-label">打开/关闭开始菜单</span>
        <div class="shortcut-input-wrapper">
          <input
            ref="shortcutInput"
            type="text"
            class="shortcut-input"
            :value="displayShortcut"
            :placeholder="recording ? '请按下快捷键组合...' : '点击录制按钮'"
            readonly
            @keydown="onKeyDown"
            @focus="startRecording"
            @blur="stopRecording"
          />
          <button class="record-btn" :class="{ recording }" @click="toggleRecording">
            <Keyboard :size="14" />
            {{ recording ? '停止' : '录制' }}
          </button>
        </div>
      </div>

      <div class="hint" v-if="recording">
        按下任意组合键（如 Ctrl+Alt+S），按 Enter 确认，按 Esc 取消
      </div>
      <div class="hint" v-else-if="saveError">
        <span class="error">{{ saveError }}</span>
      </div>
      <div class="hint" v-else-if="saveSuccess">
        <span class="success">快捷键已保存并生效</span>
      </div>

      <div class="actions">
        <button class="btn btn-primary" :disabled="!hasChanges || recording" @click="saveShortcut">
          <Check :size="14" />
          保存
        </button>
        <button class="btn" :disabled="!hasChanges || recording" @click="resetShortcut">
          <X :size="14" />
          重置
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Keyboard, Check, X } from 'lucide-vue-next'

const originalShortcut = ref('Alt+Space')
const currentShortcut = ref('Alt+Space')
const recording = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)
const shortcutInput = ref<HTMLInputElement | null>(null)

const displayShortcut = computed(() => currentShortcut.value)
const hasChanges = computed(() => currentShortcut.value !== originalShortcut.value)

onMounted(async () => {
  try {
    const saved = await window.electronAPI.getShortcut?.()
    if (saved) {
      originalShortcut.value = saved
      currentShortcut.value = saved
    }
  } catch (e) {
    console.warn('加载快捷键失败', e)
  }
})

function startRecording() {
  recording.value = true
  saveError.value = ''
  saveSuccess.value = false
}

function stopRecording() {
  // 延迟停止，允许 Enter 键先处理
  setTimeout(() => {
    recording.value = false
  }, 100)
}

function toggleRecording() {
  if (recording.value) {
    recording.value = false
    shortcutInput.value?.blur()
  } else {
    shortcutInput.value?.focus()
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (!recording.value) return
  e.preventDefault()

  // Esc 取消录制
  if (e.key === 'Escape') {
    currentShortcut.value = originalShortcut.value
    recording.value = false
    shortcutInput.value?.blur()
    return
  }

  // Enter 确认
  if (e.key === 'Enter') {
    recording.value = false
    shortcutInput.value?.blur()
    return
  }

  // 忽略单独的修饰键
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    return
  }

  // 组合快捷键
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')

  // 主键转换
  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  else if (key.startsWith('Arrow')) key = key.replace('Arrow', '')
  else if (key === 'Escape') key = 'Esc'

  parts.push(key)
  currentShortcut.value = parts.join('+')
  saveSuccess.value = false
}

async function saveShortcut() {
  try {
    const success = await window.electronAPI.setShortcut?.(currentShortcut.value)
    if (success) {
      originalShortcut.value = currentShortcut.value
      saveError.value = ''
      saveSuccess.value = true
      setTimeout(() => (saveSuccess.value = false), 3000)
    } else {
      saveError.value = '该快捷键已被其他程序占用，请更换'
      saveSuccess.value = false
    }
  } catch (e) {
    saveError.value = '保存失败'
    saveSuccess.value = false
  }
}

function resetShortcut() {
  currentShortcut.value = originalShortcut.value
  saveError.value = ''
  saveSuccess.value = false
}
</script>

<style scoped>
.shortcuts-window {
  width: 100%;
  height: 100vh;
  background: #1e1e1e;
  color: #e0e0e0;
  font-family: var(--font-family, 'Segoe UI', sans-serif);
  display: flex;
  flex-direction: column;
}

.shortcuts-header {
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.shortcuts-body {
  flex: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.shortcut-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-label {
  font-size: 13px;
  color: #aaa;
}

.shortcut-input-wrapper {
  display: flex;
  gap: 8px;
}

.shortcut-input {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  color: #e0e0e0;
  font-size: 13px;
  font-family: 'Consolas', monospace;
  outline: none;
  cursor: pointer;
}

.shortcut-input:focus {
  border-color: #0078d4;
  background: rgba(0, 120, 212, 0.1);
}

.record-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  color: #e0e0e0;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s;
}

.record-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.record-btn.recording {
  background: rgba(232, 17, 35, 0.2);
  border-color: #e81123;
  color: #ff6b6b;
}

.hint {
  font-size: 12px;
  color: #888;
  min-height: 18px;
}

.hint .error {
  color: #ff6b6b;
}

.hint .success {
  color: #4caf50;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  justify-content: flex-end;
}

.btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  color: #e0e0e0;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  background: #0078d4;
  border-color: #0078d4;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #106ebe;
}
</style>
