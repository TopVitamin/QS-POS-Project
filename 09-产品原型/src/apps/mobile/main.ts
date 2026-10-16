import '@/shared/styles/base.css'
import 'vant/lib/index.css'
import 'virtual:uno.css'
import './mobile.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'

createApp(App).use(createPinia()).use(router).mount('#app')
