<template>
  <div class="app-list win7-style">
    <!-- 搜索框 -->
    <SearchBox @search="handleSearch" />

    <!-- 程序列表滚动区 -->
    <div class="app-scroll-area">
      <!-- 最近添加 -->
      <div v-if="appsStore.recentApps.length > 0 && !appsStore.searchQuery" class="section">
        <div class="section-title">最近添加</div>
        <AppItem
          v-for="app in appsStore.recentApps"
          :key="app.id"
          :app="app"
          @click="handleLaunch(app)"
          @contextmenu="handleContextMenu($event, app)"
        />
      </div>

      <!-- 已固定 -->
      <div v-if="appsStore.pinnedAppList.length > 0 && !appsStore.searchQuery" class="section">
        <div class="section-title">已固定到"开始"菜单</div>
        <AppItem
          v-for="app in appsStore.pinnedAppList"
          :key="app.id"
          :app="app"
          @click="handleLaunch(app)"
          @contextmenu="handleContextMenu($event, app)"
        />
      </div>

      <!-- 所有应用 - 按字母分组 -->
      <div class="section">
        <div v-if="!appsStore.searchQuery" class="section-title all-apps-title">所有应用</div>
        <template v-for="group in appsStore.groupedApps" :key="group.group">
          <div class="letter-header">{{ group.group }}</div>
          <AppItem
            v-for="app in group.items"
            :key="app.id"
            :app="app"
            @click="handleLaunch(app)"
            @contextmenu="handleContextMenu($event, app)"
          />
        </template>
      </div>

      <!-- 空状态 -->
      <div v-if="appsStore.filteredApps.length === 0" class="empty-state">
        未找到匹配的程序
      </div>
    </div>

    <!-- 底部用户栏 -->
    <UserBar />
  </div>
</template>

<script setup lang="ts">
import SearchBox from './SearchBox.vue'
import AppItem from './AppItem.vue'
import UserBar from './UserBar.vue'
import { useAppsStore } from '../../stores/useApps'

const appsStore = useAppsStore()

function handleSearch(query: string) {
  appsStore.setSearchQuery(query)
}

function handleLaunch(app: AppItem) {
  appsStore.launchApp(app)
}

function handleContextMenu(e: MouseEvent, app: AppItem) {
  e.preventDefault()
  console.log('右键菜单:', app.name)
}
</script>

<style scoped>
.app-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgba(28, 28, 28, 0.98);
}

/* Win7 风格：更紧凑的间距和字体 */
.win7-style .app-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.app-scroll-area::-webkit-scrollbar {
  width: 8px;
}

.app-scroll-area::-webkit-scrollbar-track {
  background: transparent;
}

.app-scroll-area::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.app-scroll-area::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.section {
  margin-bottom: 4px;
}

.section-title {
  padding: 8px 20px 4px;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
}

.all-apps-title {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 4px;
  padding-top: 8px;
}

.letter-header {
  padding: 6px 20px 2px;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
