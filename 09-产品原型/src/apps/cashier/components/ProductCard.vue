<script setup lang="ts">
import { computed } from 'vue'
import MoneyText from '@/shared/components/MoneyText.vue'
import type { Product } from '@/shared/types'

const props = defineProps<{
  product: Product
  icon: string
  available?: number
  badge?: string | null
  inCart?: number
  disabled?: boolean
}>()
const emit = defineEmits<{ add: [] }>()

const availCls = computed(() => {
  const a = props.available ?? 0
  if (a <= 0) return 'bg-[#FDECEC] text-bad'
  if (a <= 3) return 'bg-[#FDF3E3] text-warn'
  return 'bg-subtle text-t2'
})
</script>

<template>
  <button
    type="button"
    class="pos-press relative flex h-146px flex-col rounded-16px border border-line bg-white p-3 text-left shadow-card enabled:hover:border-brand-300 disabled:opacity-55"
    :disabled="disabled"
    @click="emit('add')"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="qs-flex-center h-42px w-42px shrink-0 rounded-12px" :style="{ background: `${product.tone}1A`, color: product.tone }">
        <span :class="icon" class="text-24px" />
      </div>
      <div class="flex flex-col items-end gap-1">
        <span v-if="badge" class="rounded-6px bg-promo-500 px-1.5 py-0.5 text-11px font-700 leading-14px text-white">{{ badge }}</span>
        <span v-if="product.snRequired" class="rounded-6px border border-line-strong px-1 text-10px font-600 leading-14px text-t3">需采集SN</span>
      </div>
    </div>
    <div class="mt-2 line-clamp-2 text-15px font-600 leading-20px text-t1">{{ product.name }}</div>
    <div class="truncate text-12px leading-18px text-t3">{{ product.spec }}</div>
    <div class="mt-auto flex items-end justify-between gap-1 pt-1">
      <MoneyText :value="product.price" class="text-19px font-700 leading-none" />
      <span class="whitespace-nowrap rounded-6px px-1.5 text-12px font-600 leading-20px" :class="availCls">可用 {{ available ?? 0 }}</span>
    </div>
    <span
      v-if="inCart"
      class="qs-flex-center absolute -right-1.5 -top-1.5 h-26px min-w-26px rounded-full bg-brand-600 px-1.5 text-14px font-700 text-white ring-3 ring-canvas"
    >
      {{ inCart }}
    </span>
  </button>
</template>
