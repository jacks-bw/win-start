<template>
  <div class="search-box win7-search" :class="{ focused: isFocused }">
    <div class="pulse-layer"></div>
    <Search :size="14" class="search-icon" />
    <input
      v-model="query"
      type="text"
      placeholder="搜索程序和文件..."
      @input="emit('search', query)"
      @focus="isFocused = true"
      @blur="isFocused = false"
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
const isFocused = ref(false)
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

/* 脉冲高亮层：聚焦时从左到右展开，失焦时从右往左收起 */
.pulse-layer {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, rgba(0, 120, 212, 0.25), rgba(0, 120, 212, 0.1));
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.35s ease-out;
  pointer-events: none;
}

/* 失焦时：从右往左收起 */
.search-box:not(.focused) .pulse-layer {
  transform-origin: right center;
}

/* 聚焦时：从左到右展开并保持 */
.search-box.focused .pulse-layer {
  transform: scaleX(1);
  transform-origin: left center;
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
