<script setup lang="ts">
import type { TraceNode, TraceTone } from '@/shared/api'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingText from '@/shared/naive/PendingText.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'

/** 追溯链：一环一张卡片，按系统分层。不在POS里的环节灰显 */
defineProps<{ nodes: TraceNode[]; dense?: boolean }>()

const toneColor: Record<TraceTone, string> = {
  brand: '#0B7A6E',
  ok: '#16A34A',
  warn: '#D97706',
  bad: '#DC2626',
  muted: '#A7B3B1',
}
const layerIcon: Record<TraceNode['layer'], string> = {
  POS: 'i-ph-storefront-fill',
  支付通道: 'i-ph-credit-card-fill',
  中枢: 'i-ph-cpu-fill',
  OMS: 'i-ph-git-branch-bold',
  WMS: 'i-ph-warehouse-fill',
  金蝶: 'i-ph-bank-fill',
}
</script>

<template>
  <ol class="m-0 list-none p-0">
    <li v-for="(n, i) in nodes" :key="n.key" class="relative flex gap-3 pb-3 last:pb-0">
      <div class="relative flex w-30px shrink-0 justify-center">
        <span class="qs-flex-center relative z-1 mt-2 h-30px w-30px rounded-full text-15px text-white" :style="{ background: toneColor[n.tone] }">
          <span :class="layerIcon[n.layer]" />
        </span>
        <span v-if="i < nodes.length - 1" class="absolute bottom-[-12px] top-38px w-2px bg-line" />
      </div>
      <div class="min-w-0 flex-1 rounded-12px border px-4 py-3" :class="n.external ? 'border-dashed border-line-strong bg-subtle' : 'border-line bg-white'">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="rounded-4px px-1.5 text-11px font-600 leading-18px" :class="n.external ? 'bg-white text-t3' : 'bg-subtle text-t2'">{{ n.layer }}</span>
          <span class="text-14px font-600" :class="n.external ? 'text-t3' : 'text-t1'">{{ n.title }}</span>
          <BillNo v-if="n.no" :no="n.no" class="text-13px" />
          <StatusTag v-if="n.status" :def="n.status" />
          <span v-if="n.at" class="qs-num ml-auto text-12px text-t3">{{ n.at }}</span>
        </div>
        <div v-if="n.fields.length" class="mt-2 grid gap-x-6 gap-y-1 text-13px" :class="dense ? 'grid-cols-1' : 'grid-cols-2'">
          <div v-for="f in n.fields" :key="f.label + f.value" class="flex min-w-0 gap-2">
            <span class="shrink-0 text-t3">{{ f.label }}</span>
            <span class="min-w-0" :class="f.mono ? 'break-all font-mono text-12px leading-20px' : 'break-words'">{{ f.value }}</span>
          </div>
        </div>
        <div v-if="n.note" class="mt-2 flex flex-wrap items-center gap-1 text-12px leading-18px text-t3">
          <span class="i-ph-info-fill" />
          <PendingText :text="n.note" />
        </div>
      </div>
    </li>
  </ol>
</template>
