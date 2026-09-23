<template>
  <div class="user-bar win7-userbar">
    <div class="user-avatar-section">
      <!-- 用户头像：点击弹出菜单 -->
      <div class="avatar-circle action-btn" @click.stop="showUserMenu = !showUserMenu">
        <img v-if="avatarPath" :src="avatarUrl" class="avatar-img" />
        <User v-else :size="20" />
      </div>
    </div>
    <div class="user-actions">
      <!-- 新增分组按钮 -->
      <div class="action-btn" @click="addGroup" title="新增分组">
        <Plus :size="16" />
      </div>

      <!-- 电源按钮 -->
      <div class="action-btn" @click.stop="showPowerMenu = !showPowerMenu">
        <Power :size="16" />
      </div>
    </div>

    <!-- 用户菜单下拉 -->
    <div v-if="showUserMenu" class="user-dropdown" @click.stop>
      <div class="user-item" @click="selectAvatar">
        <span class="user-icon"><ImageIcon :size="14" /></span> 自定义用户头像
      </div>
      <div class="user-item" @click="openControlPanel">
        <span class="user-icon"><Settings :size="14" /></span> 打开控制面板
      </div>
      <div class="user-item" @click="openSystemSettings">
        <span class="user-icon"><SlidersHorizontal :size="14" /></span> 系统设置
      </div>
    </div>

    <!-- 电源选项下拉 -->
    <div v-if="showPowerMenu" class="power-dropdown" @click.stop>
      <div class="power-item" @click="powerAction('lock')">
        <span class="power-icon"><Lock :size="14" /></span> 锁定
      </div>
      <div class="power-item" @click="powerAction('sleep')">
        <span class="power-icon"><Moon :size="14" /></span> 睡眠
      </div>
      <div class="power-item" @click="powerAction('shutdown')">
        <span class="power-icon"><Power :size="14" /></span> 关机
      </div>
      <div class="power-item" @click="powerAction('restart')">
        <span class="power-icon"><RotateCcw :size="14" /></span> 重启
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Plus, Moon, Power, RotateCcw, User, Lock, Settings, SlidersHorizontal, Image as ImageIcon } from 'lucide-vue-next'

const showPowerMenu = ref(false)
const showUserMenu = ref(false)
const avatarPath = ref<string | null>(null)

// 头像图片 URL（file:// 协议）
const avatarUrl = computed(() => {
  if (!avatarPath.value) return ''
  return `file:///${avatarPath.value.replace(/\\/g, '/')}`
})

// 点击菜单外部时关闭所有下拉菜单
function handleClickOutside() {
  showPowerMenu.value = false
  showUserMenu.value = false
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  // 加载已保存的用户头像
  const saved = await window.electronAPI.getUserAvatar?.()
  if (saved) avatarPath.value = saved
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function powerAction(action: 'shutdown' | 'restart' | 'sleep' | 'lock') {
  showPowerMenu.value = false
  window.electronAPI.powerAction?.(action)
}

function addGroup() {
  if (window.showInputDialog) {
    window.showInputDialog('新建分组', '新分组', (name) => {
      window.dispatchEvent(new CustomEvent('add-tile-group', { detail: { name } }))
    })
  }
}

// 选择用户头像
async function selectAvatar() {
  showUserMenu.value = false
  const path = await window.electronAPI.selectUserAvatar?.()
  if (path) avatarPath.value = path
}

// 打开控制面板
function openControlPanel() {
  showUserMenu.value = false
  window.electronAPI.openControlPanel?.()
}

// 打开系统设置
function openSystemSettings() {
  showUserMenu.value = false
  window.electronAPI.openSystemSettings?.()
}
</script>

<style scoped>
/* Win7 风格用户栏 */
.user-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.user-avatar-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0078d4, #005a9e);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s ease;
}

.avatar-circle:hover {
  background: linear-gradient(135deg, #1a86e0, #0067b8);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* 用户下拉菜单 */
.user-dropdown {
  position: absolute;
  bottom: 46px;
  left: 12px;
  min-width: 160px;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  padding: 4px 0;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  color: #e0e0e0;
  transition: background 0.1s ease;
}

.user-item:hover {
  background: rgba(0, 120, 212, 0.3);
}

.user-icon {
  display: flex;
  align-items: center;
  color: #aaa;
}

/* 电源下拉菜单 */
.power-dropdown {
  position: absolute;
  bottom: 46px;
  right: 12px;
  min-width: 140px;
  background: #2d2d2d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  padding: 4px 0;
}

.power-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  color: #e0e0e0;
  transition: background 0.1s ease;
}

.power-item:hover {
  background: rgba(0, 120, 212, 0.3);
}

.power-icon {
  display: flex;
  align-items: center;
  color: #aaa;
}
</style>
