import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/variables.css'
import './styles/animations.css'
import './tauri-bridge'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
const d = document.getElementById('debug')
if (d) d.remove()
