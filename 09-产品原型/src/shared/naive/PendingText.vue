<script setup lang="ts">
import { computed } from 'vue'
import type { PendingId } from '@/shared/types'
import PendingTag from './PendingTag.vue'

type Part = { kind: 'pending'; id: PendingId } | { kind: 'text'; text: string }

/** 一段说明文字，里面的【待确认-xx】换成可悬停的标记 */
const props = defineProps<{ text: string }>()
const parts = computed(() =>
  props.text
    .split(/(【待确认-\d+】)/)
    .filter(Boolean)
    .map((p): Part => (/^【待确认-\d+】$/.test(p) ? { kind: 'pending', id: p.slice(1, -1) as PendingId } : { kind: 'text', text: p })),
)
</script>

<template>
  <template v-for="(p, i) in parts" :key="i">
    <PendingTag v-if="p.kind === 'pending'" :id="p.id" />
    <span v-else>{{ p.text }}</span>
  </template>
</template>
