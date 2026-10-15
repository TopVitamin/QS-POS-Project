<script setup lang="ts">
import { computed } from 'vue'
import type { CartLineDraft } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import type { PricedLine } from '@/shared/domain/pricing'
import type { PriceAdjustment, Product } from '@/shared/types'
import { formatMoney } from '@/shared/utils/format'

const props = defineProps<{
  line: CartLineDraft
  product: Product
  priced?: PricedLine
  promoNames: string[]
  adjustment?: PriceAdjustment
  available?: number
  guideName: string
}>()
const emit = defineEmits<{ inc: []; dec: []; edit: []; remove: [] }>()

const snDone = computed(() => props.line.sns.filter(Boolean).length)
const over = computed(() => props.available !== undefined && props.line.qty > props.available)
const discounted = computed(() => !!props.priced && props.priced.payable !== props.priced.listAmount)
</script>

<template>
  <div class="group border-b border-line px-4 py-3 last:border-b-0" :class="over ? 'bg-[#FFF7F5]' : ''">
    <div class="flex items-start gap-3">
      <button type="button" class="min-w-0 flex-1 text-left" @click="emit('edit')">
        <div class="truncate text-15px font-600 text-t1">{{ product.name }}</div>
        <div class="mt-0.5 truncate text-12px text-t3">
          {{ product.spec }} · {{ formatMoney(product.price) }} · 导购 {{ guideName }}
        </div>
      </button>
      <div class="text-right">
        <MoneyText :value="priced?.payable ?? product.price * line.qty" class="text-18px font-700" />
        <div v-if="discounted" class="qs-num text-12px text-t3 line-through">{{ formatMoney(priced!.listAmount) }}</div>
      </div>
    </div>
    <div class="mt-2 flex items-center gap-2">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <span v-for="n in promoNames" :key="n" class="rounded-5px bg-promo-50 px-1.5 text-11px font-600 leading-18px text-promo-600">{{ n }}</span>
        <button
          v-if="line.sns.length"
          type="button"
          class="rounded-5px px-1.5 text-11px font-600 leading-18px"
          :class="snDone === line.qty ? 'bg-[#E8F7EE] text-ok' : 'bg-[#FDF3E3] text-warn'"
          @click="emit('edit')"
        >
          SN {{ snDone }}/{{ line.qty }}
        </button>
        <span v-if="adjustment" class="rounded-5px bg-info/10 px-1.5 text-11px font-600 leading-18px text-info">已改价·已授权</span>
        <span v-if="over" class="rounded-5px bg-[#FDECEC] px-1.5 text-11px font-600 leading-18px text-bad">本店可用{{ available }}</span>
      </div>
      <div class="flex items-center rounded-12px border border-line bg-subtle">
        <button type="button" class="pos-press qs-flex-center h-40px w-42px rounded-l-12px text-t2 hover:text-brand-700" aria-label="减一" @click="emit('dec')">
          <span class="i-ph-minus-bold text-16px" />
        </button>
        <span class="qs-num w-34px text-center text-18px font-700">{{ line.qty }}</span>
        <button type="button" class="pos-press qs-flex-center h-40px w-42px rounded-r-12px text-t2 hover:text-brand-700" aria-label="加一" @click="emit('inc')">
          <span class="i-ph-plus-bold text-16px" />
        </button>
      </div>
      <button type="button" class="pos-press qs-flex-center h-40px w-40px rounded-12px text-t3 hover:bg-[#FDECEC] hover:text-bad" aria-label="删除" @click="emit('remove')">
        <span class="i-ph-trash-bold text-18px" />
      </button>
    </div>
  </div>
</template>
