<template>
  <div class="user-bar">
    <div class="user-avatar">
      <div class="avatar-circle">U</div>
      <span class="username">用户</span>
    </div>
    <div class="power-menu" @click="showPowerMenu = !showPowerMenu">
      <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
        <path d="M8 1a.75.75 0 0 1 .75.75V6a.75.75 0 0 1-1.5 0V1.75A.75.75 0 0 1 8 1Zm.75 7V3.75a.75.75 0 0 0-1.5 0V8a3.75 3.75 0 1 0 1.5 0Z" />
      </svg>
    </div>

    <!-- 电源选项下拉 -->
    <div v-if="showPowerMenu" class="power-dropdown" @click.stop>
      <div class="power-item" @click="powerAction('sleep')">
        <span>💤</span> 睡眠
      </div>
      <div class="power-item" @click="powerAction('shutdown')">
        <span>⏻</span> 关机
      </div>
      <div class="power-item" @click="powerAction('restart')">
        <span>🔄</span> 重启
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
  // 实际调用系统 API 时在此实现
}
</script>

<style scoped>
.user-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
}

.user-avatar {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 2px;
  transition: background 0.1s ease;
}

.user-avatar:hover {
  background: var(--item-hover);
}

.avatar-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  margin-right: 10px;
}

.username {
  font-size: var(--font-size-base);
}

.power-menu {
  padding: 8px;
  cursor: pointer;
  border-radius: 2px;
  transition: background 0.1s ease;
}

.power-menu:hover {
  background: var(--item-hover);
}

.power-dropdown {
  position: absolute;
  bottom: 100%;
  right: 16px;
  background: rgba(45, 45, 45, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.power-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  font-size: var(--font-size-base);
  transition: background 0.1s ease;
}

.power-item:hover {
  background: var(--item-hover);
}

.power-item span {
  margin-right: 10px;
}
</style>
