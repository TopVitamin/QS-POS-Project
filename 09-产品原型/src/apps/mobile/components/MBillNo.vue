<script setup lang="ts">
import { computed } from 'vue'
import { isPosBillNo } from '@/shared/domain/numbering'
import { explain } from '../feedback'

/** 单号：等宽显示，POS 单号旁标「演示前缀」，中枢号标「演示号」，点标记看说明 */
const props = defineProps<{ no?: string | null; plain?: boolean }>()
const kind = computed(() => (isPosBillNo(props.no) ? 'prefix' : props.no?.startsWith('HUB') ? 'hub' : null))

function open() {
  if (kind.value === 'prefix') explain('单号前缀是演示值', '用《6.编码规则》§1.2 的建议前缀，格式 {前缀}-{YYYYMMDD}-{序号}。正式前缀见【待确认-01】')
  else explain('中枢一侧的演示号', 'HUB 开头，不代表 ERP 单据类型，按中枢原样保存。见【待确认-01】【待确认-14】')
}
</script>

<template>
  <span v-if="no" class="inline-flex items-center gap-1 whitespace-nowrap">
    <span class="font-mono text-[0.92em] tracking-tight">{{ no }}</span>
    <span v-if="kind && !plain" role="button" class="rounded-4px border border-line-strong px-0.5 text-10px leading-14px text-t3" @click.stop.prevent="open">
      {{ kind === 'prefix' ? '演示前缀' : '演示号' }}
    </span>
  </span>
  <span v-else class="text-t3">-</span>
</template>
