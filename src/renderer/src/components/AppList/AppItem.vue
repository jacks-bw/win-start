<template>
  <div
    class="app-item win7-item"
    :class="{ pinned: app.pinned }"
    @click="$emit('click')"
    @contextmenu="$emit('contextmenu', $event)"
  >
    <div class="app-icon">
      <span v-if="app.icon" class="icon-img" :style="{ backgroundImage: `url(${app.icon})` }"></span>
      <span v-else class="icon-placeholder">{{ app.name.charAt(0).toUpperCase() }}</span>
    </div>
    <span class="app-name">{{ app.name }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  app: AppItem
}>()

defineEmits<{
  click: []
  contextmenu: [e: MouseEvent]
}>()
</script>

<style scoped>
/* Win7 风格程序项 */
.app-item {
  display: flex;
  align-items: center;
  padding: 5px 20px;
  cursor: pointer;
  transition: background 0.08s ease;
  position: relative;
  height: 34px;
}

.app-item:hover {
  background: linear-gradient(to right, rgba(0, 120, 215, 0.3), rgba(0, 120, 215, 0.15));
  border-left: 3px solid var(--accent-color);
  padding-left: 17px;
}

.app-item:active {
  background: rgba(0, 120, 215, 0.4);
}

.app-icon {
  width: 24px;
  height: 24px;
  margin-right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-placeholder {
  width: 24px;
  height: 24px;
  background: var(--accent-color);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.icon-img {
  width: 24px;
  height: 24px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.app-name {
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  color: #e0e0e0;
}

.app-item:hover .app-name {
  color: #ffffff;
}
</style>
