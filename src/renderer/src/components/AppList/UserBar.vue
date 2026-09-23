<template>
  <div class="user-bar win7-userbar">
    <div class="user-avatar-section">
      <div class="avatar-circle"><User :size="20" /></div>
      <span class="username">用户</span>
    </div>
    <div class="user-actions">
      <!-- 设置按钮 -->
      <div class="action-btn" @click.stop="showSettingsMenu = !showSettingsMenu">
        <Settings :size="16" />
      </div>

      <!-- 电源按钮 -->
      <div class="action-btn" @click.stop="showPowerMenu = !showPowerMenu">
        <Power :size="16" />
      </div>
    </div>

    <!-- 设置选项下拉 -->
    <div v-if="showSettingsMenu" class="settings-dropdown" @click.stop>
      <div class="settings-item" @click="addGroup">
        <span class="settings-icon"><Plus :size="14" /></span> 新增分组
      </div>
      <div class="settings-item" @click="openWallpaperWindow">
        <span class="settings-icon"><Palette :size="14" /></span> 自定义壁纸
      </div>
      <div class="settings-item" @click="refreshTiles">
        <span class="settings-icon"><RefreshCw :size="14" /></span> 刷新磁贴
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
import { ref, onMounted, onUnmounted } from 'vue'
import { Plus, Palette, Moon, Power, RotateCcw, User, Settings, Lock, RefreshCw } from 'lucide-vue-next'
import { useTilesStore } from '../../stores/useTiles'
import { useAppsStore } from '../../stores/useApps'

const tilesStore = useTilesStore()
const appsStore = useAppsStore()

const showPowerMenu = ref(false)
const showSettingsMenu = ref(false)

// 点击菜单外部时关闭所有下拉菜单
function handleClickOutside() {
  showPowerMenu.value = false
  showSettingsMenu.value = false
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function powerAction(action: 'shutdown' | 'restart' | 'sleep' | 'lock') {
  showPowerMenu.value = false
  window.electronAPI.powerAction?.(action)
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

async function openWallpaperWindow() {
  showSettingsMenu.value = false
  // 先保存当前布局，确保壁纸设置窗口（独立渲染进程）能读到最新数据
  await tilesStore.saveLayout()
  // 通过 IPC 打开独立壁纸设置窗口
  window.electronAPI.openWallpaperWindow?.()
}

// 强制刷新磁贴：重新从主进程加载布局和应用列表
async function refreshTiles() {
  showSettingsMenu.value = false
  try {
    await Promise.all([
      tilesStore.loadLayout(),
      appsStore.loadApps()
    ])
    console.log('[Refresh] 磁贴和应用列表已刷新')
  } catch (e) {
    console.error('[Refresh] 刷新失败:', e)
  }
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
