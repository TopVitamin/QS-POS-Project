<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { NTag, type DataTableColumns } from 'naive-ui'
import { DUTY } from '@/shared/config/labels'
import { DUTY_ORDER } from '@/shared/config/permissions'
import PendingTag from '@/shared/naive/PendingTag.vue'
import type { Duty, SessionUser } from '@/shared/types'
import { mono, muted, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const duty = ref<Duty | null>(null)
const keyword = ref('')

/** 授权到本人范围内门店的账号，加盟商账号按加盟商 */
const scoped = computed(() =>
  (admin.employees ?? []).filter(
    (e) => e.storeIds.some((id) => admin.storeIds.includes(id)) || (!!e.franchiseeId && admin.franchiseeIds.includes(e.franchiseeId)),
  ),
)
const rows = computed(() => {
  const k = keyword.value.trim()
  return scoped.value.filter((e) => (!duty.value || e.duties.includes(duty.value)) && (!k || e.jobNo.includes(k.toUpperCase()) || e.name.includes(k)))
})

const columns: DataTableColumns<SessionUser> = [
  { title: '工号', key: 'jobNo', width: 100, render: (e) => mono(e.jobNo) },
  { title: '姓名', key: 'name', width: 140, render: (e) => two(h('span', { class: 'font-600' }, e.name), e.title) },
  {
    title: '职责',
    key: 'duties',
    minWidth: 220,
    render: (e) => h('div', { class: 'flex flex-wrap gap-1' }, e.duties.map((d) => h(NTag, { size: 'small', bordered: false, type: d === 'guide' ? 'primary' : 'default' }, () => DUTY[d].label))),
  },
  { title: '授权门店', key: 'storeIds', width: 260, render: (e) => (e.storeIds.length ? e.storeIds.map((id) => admin.storeText(id)).join('、') : muted('不到店')) },
  { title: '加盟商', key: 'franchiseeId', width: 200, render: (e) => (e.franchiseeId ? admin.franchiseeText(e.franchiseeId) : muted('-')) },
  { title: '所属', key: 'employer', width: 100, render: (e) => (e.employer === 'qs' ? '强盛员工' : '加盟商员工') },
  { title: '状态', key: 'active', width: 80, render: (e) => h(NTag, { size: 'small', bordered: false, type: e.active ? 'success' : 'default' }, () => (e.active ? '启用' : '停用')) },
]
const dutyOptions = DUTY_ORDER.map((d) => ({ label: DUTY[d].label, value: d }))
</script>

<template>
  <div>
    <PageHead title="导购与员工">
      <template #desc>工号和组织从上游主数据单向进入POS（《3.上下游链路》§3.7、《8.角色权限原则》§四）。导购工号是业绩归属的主键，登录名可以不同。这里不显示PIN</template>
    </PageHead>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <n-select v-model:value="duty" :options="dutyOptions" clearable placeholder="全部职责" class="!w-150px" />
      <n-input v-model:value="keyword" clearable placeholder="工号或姓名" class="!w-200px">
        <template #prefix><span class="i-ph-magnifying-glass-bold text-t3" /></template>
      </n-input>
      <div class="flex-1" />
      <span class="text-13px text-t2">共 <b class="qs-num text-t1">{{ rows.length }}</b> 个账号</span>
    </div>

    <Hint class="mb-4">
      职责不是已定稿的角色名，演示账号按兼岗组合职责，兼岗不扩大数据范围（《8.角色权限原则》§一）。姓名都是演示数据。加盟店店员的提成由谁计算和发放 <PendingTag id="待确认-36" />；经营权 <PendingTag id="待确认-35" />
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table :columns="columns" :data="rows" :row-key="(e: SessionUser) => e.jobNo" :scroll-x="1100" :bordered="false" />
    </div>
  </div>
</template>
