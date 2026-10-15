<script setup lang="ts">
import { computed } from 'vue'
import { isPosBillNo } from '@/shared/domain/numbering'
import DemoBadge from './DemoBadge.vue'

/** 单号：等宽显示，POS 单号旁标「演示前缀」，中枢号标「演示号」 */
const props = defineProps<{ no?: string | null; dark?: boolean; plain?: boolean }>()
const kind = computed(() => (isPosBillNo(props.no) ? 'prefix' : props.no?.startsWith('HUB') ? 'hub' : null))
</script>

<template>
  <span v-if="no" class="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span class="font-mono text-[0.92em] tracking-tight">{{ no }}</span>
    <DemoBadge v-if="kind && !plain" :kind="kind" :dark="dark" />
  </span>
  <span v-else class="text-t3">-</span>
</template>
