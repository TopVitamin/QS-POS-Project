<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Product } from '@/shared/types'
import { formatMoney } from '@/shared/utils/format'

/** 底部弹出的选商品面板：点一行就选中，面板不关，选完点「完成」 */
const props = defineProps<{ products: Product[]; selected?: string[]; hint?: (sku: string) => string; title?: string }>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ pick: [sku: string] }>()

const keyword = ref('')
const list = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return props.products.filter((p) => p.status === 'active' && (!k || [p.name, p.sku, p.spec, ...p.barcodes].some((t) => t.toLowerCase().includes(k))))
})
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round closeable teleport="body" :style="{ height: '80%' }">
    <div class="flex h-full flex-col">
      <div class="px-4 pt-4 text-16px font-600">{{ title ?? '选商品' }}</div>
      <van-search v-model="keyword" placeholder="商品名、SKU或条码" shape="round" />
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div v-for="p in list" :key="p.sku" class="m-press flex items-center gap-3 border-b border-line px-4 py-3" @click="emit('pick', p.sku)">
          <div class="min-w-0 flex-1">
            <div class="truncate text-14px font-500">{{ p.name }}</div>
            <div class="truncate text-12px text-t3"><span class="font-mono">{{ p.sku }}</span> · {{ p.spec }}</div>
            <div v-if="hint" class="text-12px text-t2">{{ hint(p.sku) }}</div>
          </div>
          <span class="qs-num shrink-0 text-13px text-t2">{{ formatMoney(p.price) }}</span>
          <span class="shrink-0 text-22px" :class="selected?.includes(p.sku) ? 'i-ph-check-circle-fill text-brand-600' : 'i-ph-plus-circle text-t3'" />
        </div>
        <van-empty v-if="!list.length" image="search" description="没有匹配的商品" />
      </div>
      <div class="border-t border-line px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
        <van-button block round type="primary" @click="show = false">完成{{ selected?.length ? `（已选${selected.length}种）` : '' }}</van-button>
      </div>
    </div>
  </van-popup>
</template>
