import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  // 背景透明度 0-100，默认0（使用默认分区透明度）
  const opacity = ref(0)

  // 从主进程加载透明度设置
  async function loadOpacity() {
    try {
      const saved = await window.electronAPI.getOpacity?.()
      if (typeof saved === 'number') {
        opacity.value = saved
      }
    } catch (e) {
      console.warn('加载透明度设置失败', e)
    }
  }

  // 设置透明度并保存
  async function setOpacity(value: number) {
    opacity.value = Math.max(0, Math.min(100, value))
    try {
      await window.electronAPI.setOpacity?.(opacity.value)
    } catch (e) {
      console.warn('保存透明度设置失败', e)
    }
  }

  // 根据透明度计算实际背景 alpha
  // 基础值：列表区 0.25，磁贴区 0.2，列表始终比磁贴深 5%
  // opacity 越大，alpha 越小（越透明）
  function getListAlpha(): number {
    return 0.25 * (1 - opacity.value / 100)
  }

  function getTileAlpha(): number {
    return 0.2 * (1 - opacity.value / 100)
  }

  return {
    opacity,
    loadOpacity,
    setOpacity,
    getListAlpha,
    getTileAlpha
  }
})
