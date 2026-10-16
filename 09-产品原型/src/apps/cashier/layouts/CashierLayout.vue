<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useIntervalFn, useNow } from '@vueuse/core'
import { api } from '@/shared/api'
import { DUTY, STORE_MODE } from '@/shared/config/labels'
import { useRequest } from '@/shared/composables/useRequest'
import BillNo from '@/shared/naive/BillNo.vue'
import DemoBadge from '@/shared/naive/DemoBadge.vue'
import { codeName } from '@/shared/utils/format'
import { toDateTimeText, weekdayOf } from '@/shared/utils/time'
import { workRoutes } from '../router'
import { useCart } from '../stores/cart'
import { useSession } from '../stores/session'

const session = useSession()
const cart = useCart()
const route = useRoute()
const router = useRouter()
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 1000) })
const clock = computed(() => toDateTimeText(now.value.getTime()))

const { data: stores } = useRequest(() => api.master.stores())
const store = computed(() => stores.value?.find((s) => s.id === session.storeId))
const register = computed(() => store.value?.registers.find((r) => r.no === session.registerNo))

const nav = computed(() => workRoutes.filter((r) => r.meta?.nav && r.meta.perms?.some((p) => session.has(p))))

/** 班次在别处交了（另一个标签页、换天重置），就退回登录页 */
const { data: shift } = useRequest(() => (session.shiftNo ? api.shift.get(session.shiftNo) : Promise.resolve(null)), {
  watch: [() => session.shiftNo],
})
watch(shift, (s) => {
  if (session.isCashier && session.shiftNo && s !== undefined && (!s || s.status !== 'open')) {
    session.signOut()
    router.replace({ name: 'login', query: { reason: 'shift' } })
  }
})

const duties = computed(() => session.user?.duties.map((d) => DUTY[d].label).join('·') ?? '')

function lock() {
  session.signOut()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="flex h-full flex-col bg-canvas">
    <header class="flex h-56px shrink-0 items-center gap-4 bg-ink-900 pl-4 pr-3 text-white">
      <div class="flex items-center gap-2.5">
        <div class="qs-flex-center h-34px w-34px rounded-10px bg-brand-600">
          <span class="i-ph-lightning-fill text-20px text-volt-400" />
        </div>
        <div class="text-16px font-700 tracking-wide">强盛门店POS</div>
      </div>
      <div class="h-22px w-px bg-white/12" />
      <div v-if="store" class="flex items-center gap-2">
        <span class="text-15px font-600">{{ codeName(store.code, store.name) }}</span>
        <span
          class="rounded-6px px-1.5 py-px text-12px font-600"
          :class="store.mode === 'direct' ? 'bg-brand-500/30 text-[#9BE7DC]' : 'bg-volt-400/20 text-volt-300'"
        >
          {{ STORE_MODE[store.mode].label }}
        </span>
      </div>
      <div class="flex items-center gap-1.5 rounded-8px bg-white/8 px-2.5 py-1 text-14px">
        <span class="i-ph-desktop-tower-fill text-white/60" />{{ register?.name ?? `${session.registerNo}号收银台` }}
      </div>
      <div v-if="session.shiftNo" class="flex items-center gap-1.5 text-13px text-white/70">
        <span>班次</span>
        <BillNo :no="session.shiftNo" dark />
      </div>
      <div v-else-if="!session.isCashier" class="text-13px text-white/60">导购模式：只开单和挂单，不收款</div>

      <div class="flex-1" />

      <div class="flex items-center gap-1.5 rounded-full bg-[#16A34A]/18 px-2.5 py-1 text-13px text-[#86EFAC]">
        <span class="relative flex h-2 w-2">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ADE80] opacity-60" />
          <span class="relative inline-flex h-2 w-2 rounded-full bg-[#4ADE80]" />
        </span>
        中枢已连接<span class="text-white/45">（模拟）</span>
      </div>
      <div class="text-right leading-tight">
        <div class="qs-num text-18px font-600">{{ clock.slice(11, 19) }}</div>
        <div class="text-11px text-white/50">{{ clock.slice(0, 10) }} {{ weekdayOf(clock.slice(0, 10)) }}</div>
      </div>
      <div class="flex items-center gap-2 rounded-10px bg-white/6 py-1 pl-1 pr-3">
        <div class="qs-flex-center h-32px w-32px rounded-8px bg-volt-400 text-15px font-700 text-ink-900">
          {{ session.user?.name.slice(0, 1) }}
        </div>
        <div class="leading-tight">
          <div class="text-14px font-600">{{ session.user?.name }} <span class="qs-num text-12px text-white/50">{{ session.user?.jobNo }}</span></div>
          <div class="text-11px text-white/50">{{ duties }}</div>
        </div>
      </div>
      <DemoBadge kind="data" dark />
      <button type="button" class="pos-press qs-flex-center h-40px w-40px rounded-10px text-white/70 hover:bg-white/10 hover:text-white" title="锁屏退出" @click="lock">
        <span class="i-ph-sign-out-bold text-20px" />
      </button>
    </header>

    <div class="flex min-h-0 flex-1">
      <nav class="flex w-88px shrink-0 flex-col gap-1 bg-ink-900 px-2 pb-3 pt-2">
        <router-link
          v-for="r in nav"
          :key="r.name as string"
          v-slot="{ navigate }"
          :to="{ name: r.name }"
          custom
        >
          <button
            type="button"
            class="pos-press relative flex h-76px flex-col items-center justify-center gap-1.5 rounded-14px text-13px"
            :class="route.name === r.name || (r.name === 'sale' && (route.name === 'pay' || route.name === 'done'))
              ? 'bg-white/10 font-600 text-white'
              : 'text-white/60 hover:bg-white/5 hover:text-white'"
            @click="navigate"
          >
            <span
              v-if="route.name === r.name || (r.name === 'sale' && (route.name === 'pay' || route.name === 'done'))"
              class="absolute left-0 top-4 h-44px w-4px rounded-r-4px bg-volt-400"
            />
            <span
              class="text-28px"
              :class="[r.meta!.nav!.icon, route.name === r.name ? 'text-volt-400' : '']"
            />
            {{ r.meta!.nav!.label }}
            <span
              v-if="r.name === 'sale' && cart.heldHere.length"
              class="absolute right-2 top-2 min-w-18px rounded-full bg-promo-500 px-1 text-center text-11px font-700 leading-18px text-white"
            >
              {{ cart.heldHere.length }}
            </span>
          </button>
        </router-link>
      </nav>
      <main class="min-w-0 flex-1 overflow-hidden">
        <router-view v-slot="{ Component }">
          <component :is="Component" v-if="store" :store="store" />
        </router-view>
      </main>
    </div>
  </div>
</template>
