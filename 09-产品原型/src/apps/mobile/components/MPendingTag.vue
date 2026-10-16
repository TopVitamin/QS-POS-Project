<script setup lang="ts">
import { computed } from 'vue'
import { pendingText } from '@/shared/config/pending'
import type { PendingId } from '@/shared/types'
import { explain } from '../feedback'

/** 【待确认】标记的手机版：手机上没有悬停，点一下弹出缺口说明 */
const props = defineProps<{ id: PendingId | PendingId[]; dark?: boolean }>()
const ids = computed(() => (Array.isArray(props.id) ? props.id : [props.id]))

function open() {
  explain('背景里还没定', `${ids.value.map((id) => `【${id}】${pendingText(id)}`).join('\n\n')}\n\n原型不替业务定规则，见《12.待对齐事项》§三`)
}
</script>

<template>
  <span
    role="button"
    class="inline-flex items-center whitespace-nowrap rounded-6px border border-dashed px-1 align-middle text-11px font-500 leading-17px"
    :class="dark ? 'border-volt-400/70 text-volt-300' : 'border-[#E2A650] bg-[#FFF8EB] text-[#A35A06]'"
    @click.stop.prevent="open"
  >
    <template v-for="(id, i) in ids" :key="id"><span v-if="i > 0" class="opacity-60">·</span>【{{ id }}】</template>
  </span>
</template>
