import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  root: '.',
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/src-tauri/target/**', '**/out/**', '**/dist/**', '**/node_modules/**']
    }
  }
})
