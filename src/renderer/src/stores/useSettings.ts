import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  // 磁贴背景透明度（0.1-1，默认0.9）
  const tileOpacity = ref(0.9)
  // 透明度是否作用于设置了壁纸的磁贴
  const includeWallpaperOpacity = ref(true)
  // 程序列表 / 工具栏背景深度（0-1，默认0.4）
  const panelAlpha = ref(0.4)

  // 列表与工具栏背景深度
  function getListAlpha(): number {
    return panelAlpha.value
  }

  function getTileAlpha(): number {
    return 0.2
  }

  async function loadTileOpacity() {
    try {
      const s = await window.api.getSettings()
      if (s && typeof s.tileOpacity === 'number') {
        tileOpacity.value = s.tileOpacity
        includeWallpaperOpacity.value = s.includeWallpaperOpacity !== false
        if (typeof s.panelAlpha === 'number') panelAlpha.value = s.panelAlpha
      } else {
        tileOpacity.value = await window.api.getTileOpacity()
      }
    } catch (e) {
      console.error('加载磁贴透明度失败:', e)
    }
  }

  async function setTileOpacity(opacity: number) {
    try {
      tileOpacity.value = await window.api.setTileOpacity(opacity)
    } catch (e) {
      console.error('设置磁贴透明度失败:', e)
    }
  }

  async function setIncludeWallpaperOpacity(enable: boolean) {
    try {
      includeWallpaperOpacity.value = enable
      await window.api.setIncludeWallpaperOpacity(enable)
    } catch (e) {
      includeWallpaperOpacity.value = !enable
      console.error('设置壁纸磁贴透明度开关失败:', e)
    }
  }

  return {
    tileOpacity,
    includeWallpaperOpacity,
    panelAlpha,
    getListAlpha,
    getTileAlpha,
    loadTileOpacity,
    setTileOpacity,
    setIncludeWallpaperOpacity
  }
})
