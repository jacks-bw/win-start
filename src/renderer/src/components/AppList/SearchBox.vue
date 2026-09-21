<template>
  <div class="search-box">
    <svg class="search-icon" viewBox="0 0 16 16" width="14" height="14">
      <path
        d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04Z"
        fill="currentColor"
      />
    </svg>
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

const emit = defineEmits<{
  search: [query: string]
}>()

const query = ref('')
</script>

<style scoped>
.search-box {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.search-icon {
  margin-right: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.search-box input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: var(--font-size-base);
  font-family: var(--font-family);
}

.search-box input::placeholder {
  color: var(--text-secondary);
}
</style>
