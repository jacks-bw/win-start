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
  // 启动告警（如配置文件损坏已备份）只取一次，避免用户错过控制台里的信息
  window.api.getStartupWarning()
    .then(warning => { if (warning && !message.value) message.value = warning })
    .catch(() => {})
})
onUnmounted(() => stop?.())
</script>

<style scoped>
.bridge-error { position: fixed; top: 8px; left: 12px; right: 12px; padding: 10px; background: #573b29; color: #fff0dc; z-index: 11000; font-size: 12px; }
button { margin-left: 12px; cursor: pointer; }
</style>
