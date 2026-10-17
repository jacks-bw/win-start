import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToolbarStore = defineStore('toolbar', () => {
  const items = ref(['explorer', 'settings', 'controlPanel', 'recycleBin'])
  const ready = ref(false)
  const saving = ref(false)
  const error = ref('')
  let version = 0

  function updateFromEvent(next: string[]) {
    version++
    items.value = [...next]
    ready.value = true
    error.value = ''
  }
  async function load() {
    const request = ++version
    try {
      const saved = await window.api.getToolbarItems()
      if (request !== version) return
      items.value = [...saved]
      ready.value = true
      error.value = ''
    } catch (failure) {
      if (request === version) error.value = String(failure)
    }
  }
  async function setItems(next: string[]): Promise<boolean> {
    if (saving.value || !ready.value) return false
    saving.value = true
    error.value = ''
    // The UI changes only after persistence succeeds, avoiding phantom buttons.
    const request = ++version
    try {
      const saved = await window.api.setToolbarItems([...next])
      if (request === version) items.value = [...saved]
      return true
    } catch (failure) {
      error.value = String(failure)
      return false
    } finally { saving.value = false }
  }
  return { items, ready, saving, error, load, setItems, updateFromEvent }
})
