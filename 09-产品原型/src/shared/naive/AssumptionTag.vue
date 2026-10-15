<script setup lang="ts">
import { computed } from 'vue'
import { ASSUMPTIONS, type AssumptionKey } from '@/shared/config/assumptions'
import PendingTag from './PendingTag.vue'

/** 演示假设：背景没给、原型必须取一个值才能跑通的地方。假设值不能写回01成为规则 */
const props = defineProps<{ k: AssumptionKey; dark?: boolean }>()
const a = computed(() => ASSUMPTIONS[props.k])
</script>

<template>
  <n-popover trigger="hover" placement="top" :style="{ maxWidth: '360px' }">
    <template #trigger>
      <span
        class="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-6px px-1.5 py-px align-middle text-12px font-500 leading-18px"
        :class="dark ? 'bg-white/10 text-white/70' : 'bg-[#EEF1F0] text-t2'"
      >
        <span class="i-ph-flask-fill text-12px opacity-70" />演示假设
      </span>
    </template>
    <div class="flex flex-col gap-1.5 py-1 text-13px leading-20px">
      <div class="font-600 text-t1">{{ a.title }}</div>
      <div class="text-t2">{{ a.value }}</div>
      <div class="flex flex-wrap items-center gap-1 pt-1">
        <span class="text-12px text-t3">口径待定：</span>
        <PendingTag :id="a.pending" />
      </div>
    </div>
  </n-popover>
</template>
