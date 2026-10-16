<script setup lang="ts">
import { computed } from 'vue'
import { ASSUMPTIONS, type AssumptionKey } from '@/shared/config/assumptions'
import { pendingText } from '@/shared/config/pending'
import type { PendingId } from '@/shared/types'
import { explain } from '../feedback'

/** 演示假设的手机版：点一下看原型取的值和挂着的【待确认】 */
const props = defineProps<{ k: AssumptionKey }>()
const a = computed(() => ASSUMPTIONS[props.k])

function open() {
  const ids: PendingId[] = a.value.pending
  const pending = ids.length ? `\n\n口径待定：\n${ids.map((id) => `【${id}】${pendingText(id)}`).join('\n')}` : ''
  explain(`演示假设：${a.value.title}`, `${a.value.value}${pending}\n\n假设值不能写回背景文档成为规则`)
}
</script>

<template>
  <span role="button" class="inline-flex items-center gap-0.5 whitespace-nowrap rounded-6px bg-[#EEF1F0] px-1.5 align-middle text-11px font-500 leading-18px text-t2" @click.stop.prevent="open">
    <span class="i-ph-flask-fill text-11px opacity-70" />演示假设
  </span>
</template>
