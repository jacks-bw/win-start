<template>
  <div class="app-list">
    <!-- 搜索框 -->
    <SearchBox @search="handleSearch" />

    <!-- 程序列表 -->
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
        <div class="section-title">已固定</div>
        <AppItem
          v-for="app in appsStore.pinnedAppList"
          :key="app.id"
          :app="app"
          @click="handleLaunch(app)"
          @contextmenu="handleContextMenu($event, app)"
        />
      </div>

      <!-- 所有应用分组 -->
      <div v-for="group in appsStore.groupedApps" :key="group.group" class="section">
        <div class="section-title letter-group">{{ group.group }}</div>
        <AppItem
          v-for="app in group.items"
          :key="app.id"
          :app="app"
          @click="handleLaunch(app)"
          @contextmenu="handleContextMenu($event, app)"
        />
      </div>
    </div>

    <!-- 底部用户栏 -->
    <UserBar />
  </div>
</template>

<script setup lang="ts">
import SearchBox from './SearchBox.vue'
import AppItem from './AppItem.vue'
import GroupSection from './GroupSection.vue'
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
  // TODO: 实现程序项右键菜单
  console.log('右键菜单:', app.name)
}
</script>

<style scoped>
.app-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.app-scroll-area::-webkit-scrollbar {
  width: 6px;
}

.app-scroll-area::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.section {
  margin-bottom: 8px;
}

.section-title {
  padding: 6px 20px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.letter-group {
  text-transform: uppercase;
}
</style>
