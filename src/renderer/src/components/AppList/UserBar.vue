<template>
  <div class="user-bar win7-userbar">
    <div class="user-avatar-section">
      <div class="avatar-circle">U</div>
      <span class="username">用户</span>
    </div>
    <div class="power-section" @click="showPowerMenu = !showPowerMenu">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        <path d="M8 1a.75.75 0 0 1 .75.75V6a.75.75 0 0 1-1.5 0V1.75A.75.75 0 0 1 8 1Zm.75 7V3.75a.75.75 0 0 0-1.5 0V8a3.75 3.75 0 1 0 1.5 0Z" />
      </svg>
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

function powerAction(action: string) {
  showPowerMenu.value = false
  console.log('电源操作:', action)
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

.power-section {
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 2px;
  transition: background 0.1s ease;
  color: #ccc;
}

.power-section:hover {
  background: var(--item-hover);
  color: #fff;
}

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

.power-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12.5px;
  color: #e0e0e0;
  transition: background 0.1s ease;
}

.power-item:hover {
  background: var(--item-hover);
  color: #fff;
}

.power-icon {
  margin-right: 8px;
  font-size: 13px;
}
</style>
