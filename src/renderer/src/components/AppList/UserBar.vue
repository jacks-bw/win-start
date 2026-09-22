<template>
  <div class="user-bar win7-userbar">
    <div class="user-avatar-section">
      <div class="avatar-circle">U</div>
      <span class="username">用户</span>
    </div>
    <div class="user-actions">
      <!-- 设置按钮 -->
      <div class="action-btn" @click="showSettingsMenu = !showSettingsMenu">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M8 4.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM3.5 8a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0Z" />
          <path d="M8 1.75a.75.75 0 0 1 .75.75v.75a.75.75 0 0 1-1.5 0v-.75A.75.75 0 0 1 8 1.75Zm0 11a.75.75 0 0 1 .75.75v.75a.75.75 0 0 1-1.5 0v-.75a.75.75 0 0 1 .75-.75ZM2.5 8a.75.75 0 0 1-.75.75H1a.75.75 0 0 1 0-1.5h.75A.75.75 0 0 1 2.5 8Zm12.5 0a.75.75 0 0 1-.75.75h-.75a.75.75 0 0 1 0-1.5h.75A.75.75 0 0 1 15 8ZM3.97 3.97a.75.75 0 0 1 1.06 0l.53.53a.75.75 0 0 1-1.06 1.06l-.53-.53a.75.75 0 0 1 0-1.06Zm6.47 6.47a.75.75 0 0 1 1.06 0l.53.53a.75.75 0 0 1-1.06 1.06l-.53-.53a.75.75 0 0 1 0-1.06ZM12.03 3.97a.75.75 0 0 1 0 1.06l-.53.53a.75.75 0 0 1-1.06-1.06l.53-.53a.75.75 0 0 1 1.06 0ZM5.56 10.44a.75.75 0 0 1 0 1.06l-.53.53a.75.75 0 0 1-1.06-1.06l.53-.53a.75.75 0 0 1 1.06 0Z" />
        </svg>
      </div>

      <!-- 电源按钮 -->
      <div class="action-btn" @click="showPowerMenu = !showPowerMenu">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M8 1a.75.75 0 0 1 .75.75V6a.75.75 0 0 1-1.5 0V1.75A.75.75 0 0 1 8 1Zm.75 7V3.75a.75.75 0 0 0-1.5 0V8a3.75 3.75 0 1 0 1.5 0Z" />
        </svg>
      </div>
    </div>

    <!-- 设置选项下拉 -->
    <div v-if="showSettingsMenu" class="settings-dropdown" @click.stop>
      <div class="settings-item" @click="addGroup">
        <span class="settings-icon">➕</span> 新增分组
      </div>
      <div class="settings-item" @click="openWallpaperWindow">
        <span class="settings-icon">🎨</span> 自定义壁纸
      </div>
    </div>

    <!-- 电源选项下拉 -->
    <div v-if="showPowerMenu" class="power-dropdown" @click.stop>
      <div class="power-item" @click="powerAction('sleep')">
        <span class="power-icon">💤</span> 睡眠
      </div>
      <div class="power-item" @click="powerAction('shutdown')">
        <span class="power-icon">⏻</span> 关机
      </div>
      <div class="power-item" @click="powerAction('restart')">
        <span class="power-icon">🔄</span> 重启
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const showPowerMenu = ref(false)
const showSettingsMenu = ref(false)

function powerAction(action: string) {
  showPowerMenu.value = false
  console.log('电源操作:', action)
}

function addGroup() {
  showSettingsMenu.value = false
  if (window.showInputDialog) {
    window.showInputDialog('新建分组', '新分组', (name) => {
      // 通过事件通知 TileGrid
      window.dispatchEvent(new CustomEvent('add-tile-group', { detail: { name } }))
    })
  }
}

function openWallpaperWindow() {
  showSettingsMenu.value = false
  // 通过 IPC 打开独立壁纸设置窗口
  window.electronAPI.openWallpaperWindow?.()
}
</script>

<style scoped>
/* Win7 风格用户栏 */
.user-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.25);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
}

.user-avatar-section {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 2px;
  transition: background 0.1s ease;
}

.user-avatar-section:hover {
  background: var(--item-hover);
}

.avatar-circle {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: var(--accent-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  margin-right: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.username {
  font-size: 12.5px;
  color: #e0e0e0;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 2px;
  transition: background 0.1s ease;
  color: #ccc;
}

.action-btn:hover {
  background: var(--item-hover);
  color: #fff;
}

.settings-dropdown,
.power-dropdown {
  position: absolute;
  bottom: 100%;
  right: 8px;
  background: rgba(45, 45, 45, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 140px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 100;
  margin-bottom: 4px;
}

.settings-item,
.power-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12.5px;
  color: #e0e0e0;
  transition: background 0.1s ease;
}

.settings-item:hover,
.power-item:hover {
  background: var(--item-hover);
  color: #fff;
}

.settings-icon,
.power-icon {
  margin-right: 8px;
  font-size: 13px;
}
</style>
