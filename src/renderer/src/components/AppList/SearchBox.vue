<template>
  <div class="search-box win7-search">
    <div class="pulse-layer" ref="pulseLayer"></div>
    <Search :size="14" class="search-icon" />
    <input
      v-model="query"
      type="text"
      placeholder="搜索程序和文件..."
      @input="emit('search', query)"
      @focus="triggerPulse"
      @click="triggerPulse"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Search } from 'lucide-vue-next'

const emit = defineEmits<{
  search: [query: string]
}>()

const query = ref('')
const pulseLayer = ref<HTMLElement | null>(null)

// 每次点击/聚焦时重新触发从左到右的脉冲动画
function triggerPulse() {
  const el = pulseLayer.value
  if (!el) return
  el.style.animation = 'none'
  // 强制重排以重置动画
  void el.offsetWidth
  el.style.animation = ''
}
</script>

<style scoped>
.search-box {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

/* 脉冲动画层：从左到右的半透明高亮 */
.pulse-layer {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, rgba(0, 120, 212, 0.25), rgba(0, 120, 212, 0.1));
  transform: scaleX(0);
  transform-origin: left center;
  pointer-events: none;
  animation: searchPulse 0.7s ease-out forwards;
}

@keyframes searchPulse {
  0% {
    transform: scaleX(0);
    opacity: 1;
  }
  60% {
    transform: scaleX(1);
    opacity: 1;
  }
  100% {
    transform: scaleX(1);
    opacity: 0;
  }
}

.search-box input {
  flex: 1;
  background: transparent;
  border: none;
  border-radius: 2px;
  padding: 4px 8px 4px 30px;
  color: #e0e0e0;
  font-size: 12.5px;
  font-family: var(--font-family);
  outline: none;
}

.search-box input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.search-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.5);
  pointer-events: none;
  z-index: 1;
}
</style>
