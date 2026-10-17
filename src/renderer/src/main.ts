import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/variables.css'
import './styles/animations.css'
import './tauri-bridge'
import { initTheme } from './utils/theme'

// 所有窗口（含独立窗口）启动时统一应用系统主题色/自定义颜色
initTheme()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
const d = document.getElementById('debug')
if (d) d.remove()
