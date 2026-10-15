<script setup lang="ts">
import type { LabelDef, Tone } from '@/shared/config/labels'
import { brand, neutral, semantic } from '@/shared/theme/tokens'

defineProps<{ def?: LabelDef | null; size?: 'medium' | 'large' }>()

/** 和管理端同一套状态色：浅底深字 */
const TONE: Record<Tone, { bg: string; fg: string }> = {
  default: { bg: '#EEF1F0', fg: neutral.text2 },
  success: { bg: semantic.successSoft, fg: '#166534' },
  warning: { bg: semantic.warningSoft, fg: '#92400E' },
  error: { bg: semantic.errorSoft, fg: '#B91C1C' },
  info: { bg: semantic.infoSoft, fg: '#1D4ED8' },
  primary: { bg: brand[50], fg: brand[700] },
}
</script>

<template>
  <van-tag v-if="def" :color="TONE[def.tone].bg" :text-color="TONE[def.tone].fg" :size="size" class="!font-500">{{ def.label }}</van-tag>
  <span v-else class="text-t3">-</span>
</template>
