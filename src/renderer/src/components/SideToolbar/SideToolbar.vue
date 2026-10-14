<template>
  <div class="side-toolbar" :style="{ background }">
    <!-- 已添加的功能按钮 -->
    <div class="toolbar-buttons">
      <div
        v-for="item in visibleItems"
        :key="item.key"
        class="toolbar-btn"
        @click="handleClick(item.key)"
        @contextmenu.prevent="openRemoveMenu($event, item.key)"
      >
        <component :is="iconMap[item.icon]" :size="18" />
        <!-- hover 提示：向右浮出 -->
        <span class="toolbar-tooltip">{{ item.label }}</span>
      </div>
    </div>

    <!-- 底部固定区：添加按钮 / 新建分组 / 用户头像 / 电源 -->
    <div class="toolbar-bottom">
      <!-- 添加工具栏功能按钮 -->
      <div class="toolbar-btn" @click.stop="toggleAddMenu">
        <Plus :size="18" />
        <span class="toolbar-tooltip">添加按钮</span>
      </div>

      <div class="bottom-divider"></div>

      <!-- 新建程序文件夹 -->
      <div class="toolbar-btn" @click="createFolder">
        <FolderPlus :size="18" />
        <span class="toolbar-tooltip">新建文件夹</span>
      </div>

      <!-- 新建磁贴分组 -->
      <div class="toolbar-btn" @click="addGroup">
        <Layers :size="18" />
        <span class="toolbar-tooltip">新建分组</span>
      </div>

      <!-- 电源：点击弹出电源菜单 -->
      <div class="toolbar-btn" @click.stop="togglePowerMenu">
        <Power :size="18" />
        <span class="toolbar-tooltip">电源</span>
      </div>

      <!-- 用户头像：点击直接换头像（最底部） -->
      <div class="avatar-circle" @click.stop="selectAvatar">
        <div v-if="avatarInfo.url" class="avatar-clip">
          <img :src="avatarInfo.url" class="avatar-img" :class="{ 'no-crop': !hasCrop }" :style="avatarImgStyle" />
        </div>
        <User v-else :size="16" />
        <span class="toolbar-tooltip">用户头像</span>
      </div>
    </div>
    <!-- 添加菜单：列出尚未添加的功能 -->
    <div v-if="addMenuVisible" class="side-menu add-menu" @click.stop>
      <div
        v-for="item in availableItems"
        :key="item.key"
        class="side-menu-item"
        @click="addItem(item.key)"
      >
        <component :is="iconMap[item.icon]" :size="14" />
        <span>{{ item.label }}</span>
      </div>
      <div v-if="availableItems.length === 0" class="side-menu-empty">已添加全部功能</div>
    </div>

    <!-- 右键移除菜单 -->
    <div
      v-if="removeMenu.visible"
      class="side-menu remove-menu"
      :style="{ top: removeMenu.y + 'px' }"
      @click.stop
    >
      <div class="side-menu-item" @click="removeCurrentItem">从工具栏移除</div>
    </div>

    <!-- 电源菜单（从电源按钮向右浮出） -->
    <div v-if="powerMenuVisible" class="side-menu power-menu" @click.stop>
      <div class="side-menu-item" @click="powerAction('lock')">
        <Lock :size="14" /> 锁定
      </div>
      <div class="side-menu-item" @click="powerAction('sleep')">
        <Moon :size="14" /> 睡眠
      </div>
      <div class="side-menu-item" @click="powerAction('shutdown')">
        <Power :size="14" /> 关机
      </div>
      <div class="side-menu-item" @click="powerAction('restart')">
        <RotateCcw :size="14" /> 重启
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  Activity,
  Download,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  Lock,
  Moon,
  Plus,
  Power,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Terminal,
  Trash2,
  User
} from 'lucide-vue-next'
import { useAppsStore } from '../../stores/useApps'

defineProps<{ background?: string }>()

const appsStore = useAppsStore()

// 所有可用的工具栏功能注册表
interface ToolbarAction {
  key: string
  label: string
  icon: string
}

const ACTION_REGISTRY: ToolbarAction[] = [
  { key: 'explorer', label: '文件资源管理器', icon: 'Folder' },
  { key: 'settings', label: '系统设置', icon: 'Settings' },
  { key: 'controlPanel', label: '控制面板', icon: 'SlidersHorizontal' },
  { key: 'recycleBin', label: '回收站', icon: 'Trash2' },
  { key: 'documents', label: '文档', icon: 'FolderOpen' },
  { key: 'downloads', label: '下载', icon: 'Download' },
  { key: 'run', label: '运行', icon: 'Terminal' },
  { key: 'taskManager', label: '任务管理器', icon: 'Activity' }
]

const iconMap: Record<string, unknown> = {
  Folder,
  Settings,
  SlidersHorizontal,
  Trash2,
  FolderOpen,
  Download,
  Terminal,
  Activity
}

// 用户已添加的按钮 key 列表（持久化）
const items = ref<string[]>([])
const addMenuVisible = ref(false)
const removeMenu = ref({ visible: false, y: 0, key: '' })
const powerMenuVisible = ref(false)

// 头像
interface AvatarData { url: string; cropX?: number; cropY?: number; scale?: number; imgW?: number; imgH?: number; cropSize?: number }
const avatarInfo = ref<AvatarData>({ url: '' })
const hasCrop = computed(() => !!(avatarInfo.value.cropSize && avatarInfo.value.scale))
const avatarImgStyle = computed(() => {
  const a = avatarInfo.value
  if (!a.cropSize || !a.scale || !a.imgW || !a.imgH) return {}
  // 头像容器 32x32，裁剪框 CROP_SIZE=256，缩放比
  const container = 32
  const k = container / a.cropSize
  return {
    width: `${a.imgW * a.scale * k}px`,
    height: `${a.imgH * a.scale * k}px`,
    transform: `translate(${a.cropX! * k}px, ${a.cropY! * k}px)`
  }
})

// 当前配置对应的按钮列表
const visibleItems = computed(() =>
  items.value
    .map((key) => ACTION_REGISTRY.find((a) => a.key === key))
    .filter((a): a is ToolbarAction => !!a)
)

// 尚未添加、可从"+"菜单里选的功能
const availableItems = computed(() =>
  ACTION_REGISTRY.filter((a) => !items.value.includes(a.key))
)

async function loadItems() {
  try {
    items.value = await window.electronAPI.getToolbarItems()
  } catch (e) {
    console.error('加载工具栏配置失败:', e)
    items.value = ['explorer', 'settings', 'controlPanel']
  }
}

async function persistItems() {
  await window.electronAPI.setToolbarItems(items.value)
}

function handleClick(key: string) {
  window.electronAPI.openToolbarItem(key)
}

function closeAllMenus() {
  addMenuVisible.value = false
  removeMenu.value.visible = false
  powerMenuVisible.value = false
}

function toggleAddMenu() {
  const willOpen = !addMenuVisible.value
  closeAllMenus()
  addMenuVisible.value = willOpen
}

function togglePowerMenu() {
  const willOpen = !powerMenuVisible.value
  closeAllMenus()
  powerMenuVisible.value = willOpen
}

function addItem(key: string) {
  if (!items.value.includes(key)) {
    items.value.push(key)
    persistItems()
  }
  addMenuVisible.value = false
}

function openRemoveMenu(e: MouseEvent, key: string) {
  addMenuVisible.value = false
  powerMenuVisible.value = false
  // 菜单高约 36px，防止超出工具栏上下边界
  const menuHeight = 36
  const y = Math.max(4, Math.min(e.clientY - 4, window.innerHeight - menuHeight - 8))
  removeMenu.value = { visible: true, y, key }
}

function removeCurrentItem() {
  const idx = items.value.indexOf(removeMenu.value.key)
  if (idx >= 0) {
    items.value.splice(idx, 1)
    persistItems()
  }
  removeMenu.value.visible = false
}

// 新建磁贴分组（迁移自原 UserBar）
function addGroup() {
  if (window.showInputDialog) {
    window.showInputDialog('新建分组', '新分组', (name) => {
      window.dispatchEvent(new CustomEvent('add-tile-group', { detail: { name } }))
    })
  }
}

// 新建程序文件夹（迁移自原 AppList 头部按钮）
function createFolder() {
  if (window.showInputDialog) {
    window.showInputDialog('新建文件夹', '新建文件夹', (name) => {
      appsStore.createFolder(name)
    })
  }
}

// 电源操作
function powerAction(action: 'shutdown' | 'restart' | 'sleep' | 'lock') {
  powerMenuVisible.value = false
  window.electronAPI.powerAction?.(action)
}

// 点击头像：打开头像设置窗口（选择图片 / 清空头像）
function selectAvatar() {
  window.electronAPI.openAvatarSettingsWindow?.()
}

async function reloadAvatar() {
  const saved = await window.electronAPI.getUserAvatar?.()
  if (saved) {
    avatarInfo.value = saved as AvatarData
  }
}

function handleClickOutside() {
  closeAllMenus()
}

// 开始菜单被隐藏（点外部区域）时，收起所有弹出层
function handleMenuClosing() {
  closeAllMenus()
}

onMounted(() => {
  loadItems()
  reloadAvatar()
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('start-menu:closing', handleMenuClosing)
  window.electronAPI.onAvatarUpdated?.(() => {
    reloadAvatar()
  })
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('start-menu:closing', handleMenuClosing)
})
</script>

<style scoped>
.side-toolbar {
  flex-shrink: 0;
  width: 48px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  padding: 8px 0;
  position: relative;
}

.toolbar-buttons {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.toolbar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.bottom-divider {
  width: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 0;
}

.toolbar-btn {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* 用户头像圆圈 */
.avatar-circle {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
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

/* hover 浮出提示 */
.toolbar-tooltip {
  position: absolute;
  left: 48px;
  top: 50%;
  transform: translateY(-50%);
  padding: 5px 10px;
  background: rgba(45, 45, 45, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  z-index: 1001;
}

.toolbar-btn:hover .toolbar-tooltip,
.avatar-circle:hover .toolbar-tooltip {
  opacity: 1;
}

/* 向右浮出的菜单（添加 / 用户 / 电源） */
.side-menu {
  position: absolute;
  left: 48px;
  min-width: 150px;
  background: rgba(45, 45, 45, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1002;
  padding: 4px 0;
}

.add-menu {
  bottom: 12px;
}

.power-menu {
  bottom: 84px; /* 电源按钮上方（电源在头像上方一格） */
}

.remove-menu {
  min-width: 130px;
}

.side-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  color: #e0e0e0;
  transition: background 0.1s ease;
}

.side-menu-item:hover {
  background: var(--accent-active-bg);
}

.side-menu-empty {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
