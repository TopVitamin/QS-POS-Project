<script setup lang="ts">
import type { LabelDef } from '@/shared/config/labels'

withDefaults(defineProps<{ def?: LabelDef | null; size?: 'small' | 'medium' | 'large'; round?: boolean }>(), { size: 'small' })
</script>

<template>
  <n-tag v-if="def" :type="def.tone" :size="size" :bordered="false" :round="round" class="font-500">{{ def.label }}</n-tag>
  <span v-else class="text-t3">-</span>
</template>
