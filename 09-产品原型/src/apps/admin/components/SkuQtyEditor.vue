<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Product } from '@/shared/types'

/** 选商品、填数量。要货、模拟小程序下单共用 */
const items = defineModel<{ sku: string; qty: number }[]>({ required: true })
const props = defineProps<{
  products: Product[]
  /** 每个商品旁边显示的参考数，例如本店可用 */
  hint?: (sku: string) => string
  max?: number
}>()

const picking = ref<string | null>(null)
const options = computed(() =>
  props.products
    .filter((p) => p.status === 'active' && !items.value.some((i) => i.sku === p.sku))
    .map((p) => ({ label: `${p.sku} ${p.name} · ${p.spec}`, value: p.sku })),
)
const productOf = (sku: string) => props.products.find((p) => p.sku === sku)

function add(sku: string | null) {
  if (!sku) return
  items.value = [...items.value, { sku, qty: 1 }]
  picking.value = null
}
function remove(sku: string) {
  items.value = items.value.filter((i) => i.sku !== sku)
}
function setQty(sku: string, qty: number | null) {
  items.value = items.value.map((i) => (i.sku === sku ? { ...i, qty: Math.max(1, Math.floor(qty ?? 1)) } : i))
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <n-select :value="picking" :options="options" filterable placeholder="搜索SKU或商品名，选中后加入" @update:value="add" />
    <div v-if="items.length" class="overflow-hidden rounded-10px border border-line">
      <div v-for="i in items" :key="i.sku" class="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
        <div class="min-w-0 flex-1 leading-tight">
          <div class="truncate text-14px font-500">{{ productOf(i.sku)?.name }}</div>
          <div class="text-12px text-t3">
            <span class="font-mono">{{ i.sku }}</span> · {{ productOf(i.sku)?.spec }}<template v-if="hint"> · {{ hint(i.sku) }}</template>
          </div>
        </div>
        <n-input-number :value="i.qty" :min="1" :max="max" size="small" class="!w-110px" @update:value="(v: number | null) => setQty(i.sku, v)" />
        <n-button quaternary circle size="small" @click="remove(i.sku)">
          <template #icon><span class="i-ph-trash-bold text-t3" /></template>
        </n-button>
      </div>
    </div>
    <div v-else class="rounded-10px border border-dashed border-line px-3 py-4 text-center text-13px text-t3">还没有选商品</div>
  </div>
</template>
