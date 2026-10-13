import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  // 磁贴背景透明度（0.1-1，默认0.9）
  const tileOpacity = ref(0.9)
  // 透明度是否作用于设置了壁纸的磁贴
  const includeWallpaperOpacity = ref(true)

  // 固定背景透明度：列表区 0.4，磁贴区 0.2
  function getListAlpha(): number {
    return 0.4
  }

  function getTileAlpha(): number {
    return 0.2
  }

  async function loadTileOpacity() {
    try {
      const s = await window.electronAPI.getSettings()
      if (s && typeof s.tileOpacity === 'number') {
        tileOpacity.value = s.tileOpacity
        includeWallpaperOpacity.value = s.includeWallpaperOpacity !== false
      } else {
        tileOpacity.value = await window.electronAPI.getTileOpacity()
      }
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

  async function setIncludeWallpaperOpacity(enable: boolean) {
    try {
      includeWallpaperOpacity.value = enable
      await window.electronAPI.setIncludeWallpaperOpacity(enable)
    } catch (e) {
      includeWallpaperOpacity.value = !enable
      console.error('设置壁纸磁贴透明度开关失败:', e)
    }
  }

  return {
    tileOpacity,
    includeWallpaperOpacity,
    getListAlpha,
    getTileAlpha,
    loadTileOpacity,
    setTileOpacity,
    setIncludeWallpaperOpacity
  }
})
