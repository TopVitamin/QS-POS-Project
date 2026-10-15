import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import { VantResolver } from '@vant/auto-import-resolver'

const entry = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url))

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    UnoCSS(),
    Components({
      // 只自动引入组件库；本地组件一律显式 import，避免三端同名组件互相串用
      dirs: [],
      dts: 'src/components.d.ts',
      resolvers: [NaiveUiResolver(), VantResolver({ importStyle: false })],
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        index: entry('index'),
        admin: entry('admin'),
        cashier: entry('cashier'),
        mobile: entry('mobile'),
      },
    },
  },
})
