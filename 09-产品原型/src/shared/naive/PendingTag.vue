<script setup lang="ts">
import { computed } from 'vue'
import { pendingText } from '@/shared/config/pending'
import type { PendingId } from '@/shared/types'

/** 【待确认】标记：琥珀色虚线框加编号，悬停显示缺口说明（来源 12.待对齐事项） */
const props = defineProps<{ id: PendingId | PendingId[]; dark?: boolean }>()
const ids = computed(() => (Array.isArray(props.id) ? props.id : [props.id]))
</script>

<template>
  <n-popover trigger="hover" placement="top" :style="{ maxWidth: '340px' }">
    <template #trigger>
      <span
        class="inline-flex cursor-help items-center gap-0.5 whitespace-nowrap rounded-6px border border-dashed px-1.5 py-px align-middle text-12px font-500 leading-18px"
        :class="dark ? 'border-volt-400/70 text-volt-300' : 'border-[#E2A650] bg-[#FFF8EB] text-[#A35A06]'"
      >
        <template v-for="(id, i) in ids" :key="id">
          <span v-if="i > 0" class="opacity-60">·</span>
          <span>【{{ id }}】</span>
        </template>
      </span>
    </template>
    <div class="flex flex-col gap-2 py-1">
      <div v-for="id in ids" :key="id" class="text-13px leading-20px">
        <div class="font-600 text-[#A35A06]">【{{ id }}】</div>
        <div class="text-t2">{{ pendingText(id) }}</div>
      </div>
      <div class="border-t border-line pt-1.5 text-12px text-t3">背景没有给出口径，原型不替业务定规则。见《12.待对齐事项》§三</div>
    </div>
  </n-popover>
</template>
