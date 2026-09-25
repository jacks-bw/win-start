import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  // 磁贴背景透明度（0.1-1，默认0.7）
  const tileOpacity = ref(0.7)

  // 固定背景透明度：列表区 0.4，磁贴区 0.2
  function getListAlpha(): number {
    return 0.4
  }

  function getTileAlpha(): number {
    return 0.2
  }

  async function loadTileOpacity() {
    try {
      tileOpacity.value = await window.electronAPI.getTileOpacity()
    } catch (e) {
      console.error('加载磁贴透明度失败:', e)
    }
  }

  async function setTileOpacity(opacity: number) {
    try {
      tileOpacity.value = await window.electronAPI.setTileOpacity(opacity)
    } catch (e) {
      console.error('设置磁贴透明度失败:', e)
    }
  }

  return {
    tileOpacity,
    getListAlpha,
    getTileAlpha,
    loadTileOpacity,
    setTileOpacity
  }
})
