<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney, formatUnitPrice } from '@/shared/utils/format'

/** 金额统一出口：整数分进来，¥1,234.00 出去。单价用 unit 显示4位小数 */
const props = withDefaults(
  defineProps<{
    value: number | null | undefined
    sign?: boolean
    /** 显示为优惠（前面带减号，促销色） */
    discount?: boolean
    unit?: boolean
    tone?: 'default' | 'promo' | 'ok' | 'bad' | 'muted' | 'brand'
    strong?: boolean
  }>(),
  { tone: 'default' },
)

const text = computed(() => {
  if (props.unit) return formatUnitPrice(props.value)
  if (props.discount) {
    if (!props.value) return formatMoney(0)
    return `-${formatMoney(Math.abs(props.value))}`
  }
  return formatMoney(props.value, { sign: props.sign })
})

const toneClass = computed(() => {
  const tone = props.discount && props.value ? 'promo' : props.tone
  return {
    default: '',
    promo: 'text-promo-500',
    ok: 'text-ok',
    bad: 'text-bad',
    muted: 'text-t3',
    brand: 'text-brand-600',
  }[tone]
})
</script>

<template>
  <span class="qs-num whitespace-nowrap" :class="[toneClass, strong ? 'font-600' : '']">{{ text }}</span>
</template>
