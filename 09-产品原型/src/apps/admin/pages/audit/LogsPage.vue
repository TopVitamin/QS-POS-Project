<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { NTag, type DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { AUDIT_ACTION } from '@/shared/config/labels'
import type { AuditAction, AuditLog } from '@/shared/types'
import { maskCode } from '@/shared/utils/format'
import { addDays, todayBizDate } from '@/shared/utils/time'
import { bill, clickable, dateTime, link, mono, muted, pagination, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const storeId = ref<string | null>(null)
const action = ref<AuditAction | null>(null)
const range = ref<[string, string] | null>([addDays(todayBizDate(), -7), todayBizDate()])
const keyword = ref('')

const filter = computed(() => ({
  storeIds: storeId.value ? [storeId.value] : admin.storeIds,
  // 选了门店就只看这家店；没选时，不挂门店的结算异议和加盟缴款登记按加盟商授权列出
  franchiseeIds: storeId.value ? [] : admin.franchiseeIds,
  from: range.value?.[0],
  to: range.value?.[1],
  keyword: keyword.value.trim() || undefined,
}))
const { data, loading } = useRequest(() => api.audit.logs(filter.value), { watch: [filter] })
const shown = computed(() => (data.value ?? []).filter((l) => !action.value || l.action === action.value))

const ACTIONS = Object.keys(AUDIT_ACTION) as AuditAction[]
const countOf = computed(() => {
  const m = new Map<AuditAction, number>()
  for (const l of data.value ?? []) m.set(l.action, (m.get(l.action) ?? 0) + 1)
  return m
})
/** §七还点名了反结账和离线交易，原型里没有这两类动作 */
const groups = [
  {
    label: '《4.全局业务规则》§七 必须留痕',
    items: ACTIONS.filter((a) => AUDIT_ACTION[a].required),
    absent: [
      { text: '反结账', note: '原型未开放' },
      { text: '离线交易的产生和回传', note: '不做离线' },
    ],
  },
  { label: '原型补记', items: ACTIONS.filter((a) => !AUDIT_ACTION[a].required), absent: [] },
]
const toggle = (a: AuditAction) => (action.value = action.value === a ? null : a)

/** 提货码的口径同自提履约单页：确定已失效的才显示全码；链接用OMS单号，不把码放进地址栏 */
const { data: pickups } = useRequest(() => api.fulfil.pickups({ storeIds: admin.storeIds }))
const TRACEABLE = ['POS销售单', '退货单', '自提履约单', '代客单']
function objectCell(l: AuditLog) {
  if (l.objectType === '提货码') {
    const p = pickups.value?.find((x) => x.pickupCode === l.objectNo)
    const text = p && p.status !== 'pending' ? l.objectNo : maskCode(l.objectNo)
    return p ? link({ name: 'audit-trace', query: { q: p.omsNo } }, h('span', { class: 'font-mono' }, text)) : mono(text)
  }
  if (TRACEABLE.includes(l.objectType)) return link({ name: 'audit-trace', query: { q: l.objectNo } }, bill(l.objectNo, true))
  return bill(l.objectNo, true)
}

const columns: DataTableColumns<AuditLog> = [
  { title: '时间', key: 'at', width: 170, fixed: 'left', render: (l) => dateTime(l.at) },
  { title: '动作', key: 'action', width: 120, fixed: 'left', render: (l) => h(NTag, { size: 'small', bordered: false, type: AUDIT_ACTION[l.action].tone }, () => l.action) },
  { title: '门店', key: 'storeId', width: 170, render: (l) => (l.storeId ? admin.storeText(l.storeId) : muted('不挂门店')) },
  { title: '操作者', key: 'operator', width: 120, render: (l) => admin.who(l.operatorJobNo) },
  { title: '授权人', key: 'authorizer', width: 120, render: (l) => (l.authorizerJobNo ? admin.who(l.authorizerJobNo) : muted('-')) },
  { title: '对象', key: 'object', width: 250, render: (l) => two(objectCell(l), l.objectType) },
  { title: '前值', key: 'before', width: 220, ellipsis: { tooltip: true }, render: (l) => l.before ?? muted('-') },
  { title: '后值', key: 'after', minWidth: 260, ellipsis: { tooltip: true }, render: (l) => l.after ?? muted('-') },
  { title: '原因', key: 'reason', width: 160, ellipsis: { tooltip: true }, render: (l) => l.reason ?? muted('-') },
]

const openId = ref('')
const current = computed(() => shown.value.find((l) => l.id === openId.value) ?? null)
const show = computed({
  get: () => !!openId.value,
  set: (v) => {
    if (!v) openId.value = ''
  },
})
</script>

<template>
  <div>
    <PageHead title="操作日志">
      <template #desc>必须留痕的动作，每条有操作者、时间、对象和前后值（《4.全局业务规则》§七）。日志只能看，不能改也不能删；后台直接改数如果发生，也要另有记录</template>
    </PageHead>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <StoreSelect v-model="storeId" />
      <n-date-picker v-model:formatted-value="range" value-format="yyyy-MM-dd" type="daterange" clearable class="!w-260px" />
      <n-input v-model:value="keyword" clearable placeholder="单号、工号、原因、后值" class="!w-240px">
        <template #prefix><span class="i-ph-magnifying-glass-bold text-t3" /></template>
      </n-input>
      <div class="flex-1" />
      <span class="text-13px text-t2">共 <b class="qs-num text-t1">{{ shown.length }}</b> 条</span>
    </div>

    <div class="qs-card mb-4 flex flex-col gap-2.5 px-4 py-3">
      <div v-for="g in groups" :key="g.label" class="flex flex-wrap items-center gap-2">
        <span class="w-200px shrink-0 text-12px text-t3">{{ g.label }}</span>
        <button
          v-for="a in g.items"
          :key="a"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-8px border px-2.5 py-1 text-13px transition-colors"
          :class="action === a ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-t2 hover:border-brand-300'"
          @click="toggle(a)"
        >
          {{ a }}
          <span class="qs-num text-12px" :class="countOf.get(a) ? 'font-600 text-t1' : 'text-t3'">{{ countOf.get(a) ?? 0 }}</span>
        </button>
        <span v-for="m in g.absent" :key="m.text" class="inline-flex items-center gap-1.5 rounded-8px border border-dashed border-line-strong px-2.5 py-1 text-13px text-t3">
          {{ m.text }}<span class="text-12px">{{ m.note }}</span>
        </span>
      </div>
    </div>

    <Hint class="mb-4">
      点上面的动作只看这一类；对象是销售单、退货单、提货单、代客单的，点单号进交易追溯；还能用的提货码只露前3位。
      只列授权门店的日志，系统管理也一样，不到「全部未来新店」（《8.角色权限原则》§二）；结算异议不挂门店，加盟缴款登记按加盟商授权，财务按加盟商单独授权后才看得到。
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="shown"
        :loading="loading && !data"
        :pagination="pagination"
        :row-key="(l: AuditLog) => l.id"
        :row-props="clickable((l: AuditLog) => (openId = l.id))"
        :scroll-x="1650"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="520">
      <n-drawer-content v-if="current" closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">{{ current.action }} <span class="qs-num text-13px font-400 text-t3">{{ current.at }}</span></span>
        </template>
        <n-descriptions :column="1" label-placement="left" size="small" bordered>
          <n-descriptions-item label="门店">{{ current.storeId ? admin.storeText(current.storeId) : '不挂门店' }}</n-descriptions-item>
          <n-descriptions-item label="操作者">{{ admin.who(current.operatorJobNo) }}</n-descriptions-item>
          <n-descriptions-item label="授权人">{{ current.authorizerJobNo ? admin.who(current.authorizerJobNo) : '-' }}</n-descriptions-item>
          <n-descriptions-item label="对象">{{ current.objectType }} · {{ current.objectNo }}</n-descriptions-item>
          <n-descriptions-item label="前值">{{ current.before ?? '-' }}</n-descriptions-item>
          <n-descriptions-item label="后值">{{ current.after ?? '-' }}</n-descriptions-item>
          <n-descriptions-item label="原因">{{ current.reason ?? '-' }}</n-descriptions-item>
        </n-descriptions>
        <div v-if="TRACEABLE.includes(current.objectType)" class="mt-4">
          <router-link :to="{ name: 'audit-trace', query: { q: current.objectNo } }" class="text-13px text-brand-700 hover:underline">到交易追溯看 {{ current.objectNo }}</router-link>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
