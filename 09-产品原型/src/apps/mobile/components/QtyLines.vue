<script setup lang="ts">
import type { Product } from '@/shared/types'

/** 已选商品和数量：步进器改数，垃圾桶移除 */
const props = defineProps<{ products: Product[]; hint?: (sku: string) => string; max?: (sku: string) => number }>()
const items = defineModel<{ sku: string; qty: number }[]>({ required: true })

const productOf = (sku: string) => props.products.find((p) => p.sku === sku)
function setQty(sku: string, qty: number) {
  items.value = items.value.map((i) => (i.sku === sku ? { ...i, qty } : i))
}
function remove(sku: string) {
  items.value = items.value.filter((i) => i.sku !== sku)
}
</script>

<template>
  <div>
    <div v-for="i in items" :key="i.sku" class="flex items-center gap-2.5 border-b border-line px-4 py-3 last:border-0">
      <div class="min-w-0 flex-1">
        <div class="truncate text-14px font-500">{{ productOf(i.sku)?.name ?? i.sku }}</div>
        <div class="truncate text-12px text-t3">{{ productOf(i.sku)?.spec }}<template v-if="hint"> · {{ hint(i.sku) }}</template></div>
      </div>
      <van-stepper :model-value="i.qty" :min="1" :max="max?.(i.sku) ?? 999" integer button-size="28px" input-width="40px" @update:model-value="(v: string | number) => setQty(i.sku, Number(v))" />
      <span role="button" class="i-ph-trash shrink-0 text-18px text-t3" @click="remove(i.sku)" />
    </div>
    <slot v-if="!items.length" name="empty" />
  </div>
</template>
