<template>
  <div
    class="app-item"
    :class="{ pinned: app.pinned }"
    @click="$emit('click')"
    @contextmenu="$emit('contextmenu', $event)"
  >
    <div class="app-icon">
      <span v-if="app.icon" class="icon-img" :style="{ backgroundImage: `url(${app.icon})` }"></span>
      <span v-else class="icon-placeholder">{{ app.name.charAt(0).toUpperCase() }}</span>
    </div>
    <span class="app-name">{{ app.name }}</span>
    <span v-if="app.pinned" class="pin-indicator">📌</span>
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
.app-item {
  display: flex;
  align-items: center;
  padding: 6px 20px;
  cursor: pointer;
  transition: background 0.1s ease;
  position: relative;
}

.app-item:hover {
  background: var(--item-hover);
}

.app-item:active {
  background: var(--item-active);
}

.app-icon {
  width: 32px;
  height: 32px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-placeholder {
  width: 32px;
  height: 32px;
  background: var(--accent-color);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: white;
}

.icon-img {
  width: 32px;
  height: 32px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.app-name {
  font-size: var(--font-size-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.pin-indicator {
  font-size: 10px;
  margin-left: 8px;
  opacity: 0.7;
}
</style>
