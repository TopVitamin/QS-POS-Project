<script setup lang="ts">
import { computed } from 'vue'
import type { Store } from '@/shared/types'
import { codeName } from '@/shared/utils/format'
import { useAdmin } from '../stores/session'

/** 门店筛选：只列授权范围内的店。清空表示授权范围内的全部门店 */
const model = defineModel<string | null>({ default: null })
const props = withDefaults(defineProps<{ stores?: Store[]; clearable?: boolean; placeholder?: string }>(), {
  clearable: true,
  placeholder: '全部授权门店',
})
const admin = useAdmin()
const options = computed(() =>
  (props.stores ?? admin.scopedStores).map((s) => ({
    label: `${codeName(s.code, s.name)}（${s.mode === 'direct' ? '直营' : '加盟'}）`,
    value: s.id,
  })),
)
</script>

<template>
  <n-select v-model:value="model" :options="options" :clearable="clearable" :placeholder="placeholder" class="!w-260px" />
</template>
