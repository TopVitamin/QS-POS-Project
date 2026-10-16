<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { explain } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const route = useRoute()
const router = useRouter()

const isTab = computed(() => !!route.meta.tab)
const allowed = computed(() => !route.meta.perms?.length || route.meta.perms.some((p) => mobile.has(p)))

const TABS = [
  { to: '/home', text: '工作台', icon: 'i-ph-house-line', on: 'i-ph-house-line-fill' },
  { to: '/fulfil', text: '履约', icon: 'i-ph-package', on: 'i-ph-package-fill' },
  { to: '/stock', text: '库存', icon: 'i-ph-stack', on: 'i-ph-stack-fill' },
  { to: '/me', text: '我的', icon: 'i-ph-user-circle', on: 'i-ph-user-circle-fill' },
]

function back() {
  if (window.history.state?.back) router.back()
  else router.replace('/home')
}

function aboutDemo() {
  explain('全部是演示数据', '门店、员工、商品、价格、促销和交易都是mock，不接支付、中枢、金蝶和外设，不做离线。演示能走通只证明流程表达，不证明已经联调。')
}
</script>

<template>
  <div class="m-shell mx-auto min-h-screen max-w-480px bg-canvas">
    <van-nav-bar v-if="route.name !== 'home'" :title="route.meta.title" :left-arrow="!isTab" fixed placeholder safe-area-inset-top z-index="30" @click-left="back">
      <template #right>
        <span role="button" class="inline-flex items-center gap-0.5 rounded-full bg-volt-100 px-2 py-0.5 text-11px font-600 text-[#7A5600]" @click="aboutDemo">
          <span class="i-ph-sparkle-fill text-11px" />演示数据
        </span>
      </template>
    </van-nav-bar>

    <div v-if="!mobile.ready" class="py-24 text-center"><van-loading vertical>加载中</van-loading></div>
    <van-empty v-else-if="!mobile.user" description="没有能用移动端的演示账号" />
    <van-empty v-else-if="!allowed" image="error" :description="`${mobile.user.name}的职责里没有「${route.meta.title}」`">
      <van-button round type="primary" size="small" to="/me">切换演示身份</van-button>
    </van-empty>
    <router-view v-else v-slot="{ Component }">
      <component :is="Component" :key="`${mobile.jobNo}-${route.path}`" />
    </router-view>

    <van-tabbar v-if="isTab" route placeholder safe-area-inset-bottom z-index="30">
      <van-tabbar-item v-for="t in TABS" :key="t.to" :to="t.to">
        <template #icon="{ active }"><span class="text-22px" :class="active ? t.on : t.icon" /></template>
        {{ t.text }}
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>
