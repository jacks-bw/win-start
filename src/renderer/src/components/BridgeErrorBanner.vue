<template>
  <div v-if="message" class="bridge-error" role="alert">
    <span>{{ message }}</span>
    <button @click="message = ''">关闭</button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
const message = ref('')
let stop: (() => void) | undefined
onMounted(() => {
  stop = window.api.onBridgeError(error => { message.value = `窗口事件连接失败：${error.message}` })
})
onUnmounted(() => stop?.())
</script>

<style scoped>
.bridge-error { position: fixed; top: 8px; left: 12px; right: 12px; padding: 10px; background: #573b29; color: #fff0dc; z-index: 11000; font-size: 12px; }
button { margin-left: 12px; cursor: pointer; }
</style>
