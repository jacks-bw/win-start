<template>
  <div class="search-box win7-search">
    <Search :size="14" class="search-icon" />
    <input
      v-model="query"
      type="text"
      placeholder="搜索程序和文件..."
      @input="emit('search', query)"
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
</script>

<style scoped>
/* 透明搜索框 */
.search-box {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.2);
}

.search-box input {
  flex: 1;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
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

.search-box input:focus {
  border-color: rgba(255, 255, 255, 0.4);
}

.search-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.5);
  pointer-events: none;
}
</style>
