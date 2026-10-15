<script setup lang="ts">
import PendingTag from '@/shared/naive/PendingTag.vue'
import PageHead from '../../components/PageHead.vue'

const rules = [
  { icon: 'i-ph-file-text-fill', title: '有单据才算数', text: '店与店之间的货要移动，必须有调拨申请和收货。没有单据的微信调货，不改变任何一边的可用量（《4.全局业务规则》§四）' },
  { icon: 'i-ph-arrows-left-right-bold', title: '允不允许还没定', text: '直营和加盟之间、加盟店之间是否允许调拨，背景没有给出口径；未允许前不列入一期必做（《5.单据目录》）' },
  { icon: 'i-ph-hash-bold', title: '单号不占ERP号段', text: '店间调拨申请的演示前缀是MDDB，是否改用FBDB或ZJDB未确认前，不占用ERP号码段（《6.编码规则》、《12.待对齐事项》A10）' },
]
</script>

<template>
  <div>
    <PageHead title="店间调拨">
      <template #tags><n-tag size="small" :bordered="false">占位</n-tag></template>
      <template #desc>这一页只放说明，不做交互</template>
    </PageHead>

    <div class="qs-card flex flex-col items-center px-8 py-12 text-center">
      <span class="qs-flex-center h-64px w-64px rounded-18px bg-subtle text-32px text-t3"><span class="i-ph-arrows-left-right-bold" /></span>
      <div class="mt-4 text-18px font-700">店间调拨等口径确认后再做</div>
      <div class="mt-2 flex items-center gap-2 text-14px text-t2">是否允许调拨 <PendingTag id="待确认-26" /> 单据前缀 <PendingTag id="待确认-01" /></div>
      <div class="mt-8 grid w-full max-w-960px grid-cols-3 gap-4 text-left">
        <div v-for="r in rules" :key="r.title" class="rounded-14px border border-line px-4 py-4">
          <div class="flex items-center gap-2 font-600"><span :class="r.icon" class="text-18px text-brand-600" />{{ r.title }}</div>
          <div class="mt-1.5 text-13px leading-21px text-t2">{{ r.text }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
