import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', () => {
  // 固定背景透明度：列表区 0.4，磁贴区 0.2
  function getListAlpha(): number {
    return 0.4
  }

  function getTileAlpha(): number {
    return 0.2
  }

  return {
    getListAlpha,
    getTileAlpha
  }
})
