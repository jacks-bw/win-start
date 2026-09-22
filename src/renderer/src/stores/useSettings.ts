import { defineStore } from 'pinia'
import { ref } from 'vue'

// Acrylic 默认透明度（0-255）
const DEFAULT_ACRYLIC_ALPHA = 20
// CSS 背景默认透明度
const DEFAULT_LIST_ALPHA = 0.15
const DEFAULT_TILE_ALPHA = 0.1

export const useSettingsStore = defineStore('settings', () => {
  // 背景透明度 0-100，默认0（使用默认透明度）
  const opacity = ref(0)

  // 根据滑块值计算 Acrylic alpha（0-255）
  function calcAcrylicAlpha(): number {
    return Math.round(DEFAULT_ACRYLIC_ALPHA * (1 - opacity.value / 100))
  }

  // 从主进程加载透明度设置
  async function loadOpacity() {
    try {
      const saved = await window.electronAPI.getOpacity?.()
      if (typeof saved === 'number') {
        opacity.value = saved
      }
      // 同步设置 Acrylic 透明度
      await window.electronAPI.setAcrylicAlpha?.(calcAcrylicAlpha())
    } catch (e) {
      console.warn('加载透明度设置失败', e)
    }
  }

  // 设置透明度并保存
  async function setOpacity(value: number) {
    opacity.value = Math.max(0, Math.min(100, value))
    try {
      await window.electronAPI.setOpacity?.(opacity.value)
      // 同步设置 Acrylic 透明度
      await window.electronAPI.setAcrylicAlpha?.(calcAcrylicAlpha())
    } catch (e) {
      console.warn('保存透明度设置失败', e)
    }
  }

  // 根据透明度计算实际背景 alpha
  // 列表区始终比磁贴区深 5%（0.15 vs 0.1）
  // opacity 越大，alpha 越小（越透明）
  function getListAlpha(): number {
    return DEFAULT_LIST_ALPHA * (1 - opacity.value / 100)
  }

  function getTileAlpha(): number {
    return DEFAULT_TILE_ALPHA * (1 - opacity.value / 100)
  }

  return {
    opacity,
    loadOpacity,
    setOpacity,
    getListAlpha,
    getTileAlpha
  }
})
