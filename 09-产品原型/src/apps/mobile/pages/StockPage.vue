<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import Note from '../components/Note.vue'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const { data: products } = useRequest(() => api.master.products(), { live: false })
const { data: stock } = useRequest(() => api.stock.list([mobile.storeId]))

const rows = computed(() =>
  (products.value ?? [])
    .filter((p) => p.status === 'active')
    .map((p) => {
      const r = stock.value?.find((s) => s.sku === p.sku)
      return { product: p, onHand: r?.onHand ?? 0, locked: r?.locked ?? 0, available: r?.available ?? 0, inTransit: r?.inTransit ?? 0 }
    }),
)

const keyword = ref('')
type Filter = 'all' | 'locked' | 'transit' | 'empty'
const filter = ref<Filter>('all')
const FILTERS: { key: Filter; label: string; test: (r: (typeof rows.value)[number]) => boolean }[] = [
  { key: 'all', label: '全部', test: () => true },
  { key: 'locked', label: '有自提锁定', test: (r) => r.locked > 0 },
  { key: 'transit', label: '有在途', test: (r) => r.inTransit > 0 },
  { key: 'empty', label: '可用为0', test: (r) => r.available === 0 },
]
const shown = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  const f = FILTERS.find((x) => x.key === filter.value)!
  return rows.value.filter((r) => f.test(r) && (!k || [r.product.name, r.product.sku, r.product.spec, ...r.product.barcodes].some((t) => t.toLowerCase().includes(k))))
})
const total = (key: 'locked' | 'inTransit') => rows.value.reduce((s, r) => s + r[key], 0)
</script>

<template>
  <div class="pb-4">
    <div class="sticky top-46px z-10 bg-canvas">
      <van-search v-model="keyword" placeholder="商品名、SKU或条码" shape="round" background="transparent" />
      <div class="flex gap-2 overflow-x-auto px-3 pb-2">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          type="button"
          class="shrink-0 rounded-full px-3 py-1 text-13px"
          :class="filter === f.key ? 'bg-brand-600 text-white' : 'bg-white text-t2'"
          @click="filter = f.key"
        >
          {{ f.label }} {{ rows.filter(f.test).length }}
        </button>
      </div>
    </div>

    <div class="mx-3 grid grid-cols-3 gap-2 rounded-14px bg-white px-3 py-3 text-center shadow-card">
      <div><div class="qs-num text-18px font-700">{{ rows.length }}</div><div class="text-11px text-t3">在售SKU</div></div>
      <div><div class="qs-num text-18px font-700 text-info">{{ total('locked') }}</div><div class="text-11px text-t3">自提锁定件数</div></div>
      <div><div class="qs-num text-18px font-700 text-warn">{{ total('inTransit') }}</div><div class="text-11px text-t3">在途件数</div></div>
    </div>

    <router-link v-for="r in shown" :key="r.product.sku" :to="`/stock/${r.product.sku}`" class="m-press mx-3 mt-2 flex items-center gap-3 rounded-14px bg-white px-4 py-3 shadow-card">
      <div class="min-w-0 flex-1">
        <div class="truncate text-14px font-600">{{ r.product.name }}</div>
        <div class="truncate text-12px text-t3"><span class="font-mono">{{ r.product.sku }}</span> · {{ r.product.spec }}</div>
        <div class="mt-1 flex gap-3 text-12px text-t2">
          <span>账面 <b class="qs-num font-600">{{ r.onHand }}</b></span>
          <span :class="r.locked ? 'text-info' : ''">锁定 <b class="qs-num font-600">{{ r.locked }}</b></span>
          <span :class="r.inTransit ? 'text-warn' : ''">在途 <b class="qs-num font-600">{{ r.inTransit }}</b></span>
        </div>
      </div>
      <div class="shrink-0 text-right">
        <div class="qs-num text-24px font-700 leading-28px" :class="r.available ? 'text-t1' : 'text-bad'">{{ r.available }}</div>
        <div class="text-11px text-t3">可用</div>
      </div>
      <span class="i-ph-caret-right text-t3" />
    </router-link>
    <van-empty v-if="!shown.length" image="search" image-size="80" description="没有符合条件的商品" />

    <Note>数字是中枢逻辑库存在本店的投影。可用 = 账面 − 自提锁定，在途不算可用；进店销售卖不到已经锁给自提的件数</Note>
  </div>
</template>
