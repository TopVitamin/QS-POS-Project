<script setup lang="ts">
/** 页面里的规则说明：一句话加依据或【待确认】 */
withDefaults(defineProps<{ tone?: 'info' | 'warn' | 'muted' }>(), { tone: 'muted' })
</script>

<template>
  <div
    class="flex items-start gap-2 rounded-10px px-3 py-2 text-13px leading-20px"
    :class="{
      'bg-[#EAF1FE] text-[#1E3A8A]': tone === 'info',
      'bg-[#FDF3E3] text-[#7C4A03]': tone === 'warn',
      'bg-subtle text-t2': tone === 'muted',
    }"
  >
    <span
      class="mt-0.5 shrink-0 text-15px"
      :class="tone === 'warn' ? 'i-ph-warning-fill text-warn' : tone === 'info' ? 'i-ph-info-fill text-info' : 'i-ph-info-fill text-t3'"
    />
    <div class="min-w-0 flex-1"><slot /></div>
  </div>
</template>
