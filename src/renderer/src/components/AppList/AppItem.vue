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
    <span
      ref="nameRef"
      class="app-name"
      :class="{ 'app-name-marquee': isNameOverflowed }"
    >
      <span class="app-name-inner">
        <span class="app-name-text">{{ app.name }}</span>
        <span class="app-name-text" aria-hidden="true">{{ app.name }}</span>
      </span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

defineProps<{
  app: AppItem
}>()

defineEmits<{
  click: []
  contextmenu: [e: MouseEvent]
}>()

const nameRef = ref<HTMLElement | null>(null)
const isNameOverflowed = ref(false)

function checkOverflow() {
  requestAnimationFrame(() => {
    if (nameRef.value) {
      isNameOverflowed.value = nameRef.value.scrollWidth > nameRef.value.clientWidth + 1
    }
  })
}

onMounted(() => {
  checkOverflow()
})
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
  min-width: 0;
  color: #e0e0e0;
  display: block;
}

.app-name-marquee {
  text-overflow: clip;
}

.app-name-inner {
  display: inline-flex;
  white-space: nowrap;
}

.app-name-text {
  padding-right: 30px;
  flex-shrink: 0;
}

/* 非悬停时隐藏第二份文本，保持 ellipsis 效果 */
.app-name-text:nth-child(2) {
  display: none;
}

.app-item:hover .app-name {
  color: #ffffff;
}

.app-item:hover .app-name-marquee .app-name-text:nth-child(2) {
  display: inline;
}

.app-item:hover .app-name-marquee .app-name-inner {
  animation: app-name-marquee 6s linear infinite;
}

@keyframes app-name-marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}
</style>
