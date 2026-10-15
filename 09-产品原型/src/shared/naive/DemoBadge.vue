<script setup lang="ts">
import PendingTag from './PendingTag.vue'

/** 「演示数据」放在各端顶栏；「演示前缀」放在 POS 单号旁 */
defineProps<{ kind: 'data' | 'prefix' | 'hub'; dark?: boolean }>()
</script>

<template>
  <n-popover trigger="hover" placement="bottom" :style="{ maxWidth: '320px' }">
    <template #trigger>
      <span
        v-if="kind === 'data'"
        class="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-12px font-600"
        :class="dark ? 'bg-volt-400 text-ink-900' : 'bg-volt-100 text-[#7A5600]'"
      >
        <span class="i-ph-sparkle-fill text-12px" />演示数据
      </span>
      <span
        v-else
        class="inline-flex cursor-help items-center whitespace-nowrap rounded-4px border px-1 text-11px font-500 leading-16px"
        :class="dark ? 'border-white/25 text-white/60' : 'border-line-strong text-t3'"
      >
        {{ kind === 'prefix' ? '演示前缀' : '演示号' }}
      </span>
    </template>
    <div class="flex flex-col gap-1.5 py-1 text-13px leading-20px text-t2">
      <template v-if="kind === 'data'">
        <div class="font-600 text-t1">全部是演示数据</div>
        <div>门店、员工、商品、价格、促销和交易都是mock，不接支付、中枢、金蝶和外设，不做离线。演示能走通只证明流程表达，不证明已经联调。</div>
      </template>
      <template v-else-if="kind === 'prefix'">
        <div class="font-600 text-t1">单号前缀是演示值</div>
        <div>用《6.编码规则》§1.2 的建议前缀，格式 {前缀}-{YYYYMMDD}-{序号}。</div>
        <div><PendingTag id="待确认-01" /></div>
      </template>
      <template v-else>
        <div class="font-600 text-t1">中枢一侧的演示号</div>
        <div>HUB 开头，不代表 ERP 单据类型，按中枢原样保存。</div>
        <div class="flex gap-1"><PendingTag :id="['待确认-01', '待确认-14']" /></div>
      </template>
    </div>
  </n-popover>
</template>
