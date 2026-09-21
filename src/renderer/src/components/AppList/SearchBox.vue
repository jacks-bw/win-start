<template>
  <div class="search-box win7-search">
    <input
      v-model="query"
      type="text"
      placeholder="搜索程序和文件..."
      @input="emit('search', query)"
    />
    <svg class="search-icon" viewBox="0 0 16 16" width="14" height="14">
      <path
        d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04Z"
        fill="currentColor"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  search: [query: string]
}>()

const query = ref('')
</script>

<style scoped>
/* Win7 风格搜索框 */
.search-box {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.2);
}

.search-box input {
  flex: 1;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  padding: 4px 8px;
  color: #333;
  font-size: 12.5px;
  font-family: var(--font-family);
  outline: none;
  order: 1;
}

.search-box input::placeholder {
  color: #888;
}

.search-icon {
  margin-left: 6px;
  color: #666;
  flex-shrink: 0;
  order: 2;
}
</style>
