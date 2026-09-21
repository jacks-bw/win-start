<template>
  <div class="group-section">
    <div class="group-header">{{ letter }}</div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  letter: string
}>()
</script>

<style scoped>
.group-section {
  margin-bottom: 8px;
}

.group-header {
  padding: 6px 20px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
}
</style>
