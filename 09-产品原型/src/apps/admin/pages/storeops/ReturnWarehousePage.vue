<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { RTW_STATUS } from '@/shared/config/labels'
import BillNo from '@/shared/naive/BillNo.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { ReturnToWarehouse } from '@/shared/types'
import { bill, clickable, dateTime, muted, pagination, status, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const storeId = ref<string | null>(null)
const storeIds = computed(() => (storeId.value ? [storeId.value] : admin.storeIds))
const { data, loading } = useRequest(() => api.storeops.rtws({ storeIds: storeIds.value }), { watch: [storeIds] })

const columns: DataTableColumns<ReturnToWarehouse> = [
  { title: '退仓单号', key: 'no', width: 250, render: (r) => two(bill(r.no), admin.storeText(r.storeId)) },
  { title: '提交', key: 'createdAt', width: 170, render: (r) => two(dateTime(r.createdAt), admin.who(r.creatorJobNo)) },
  { title: '原因', key: 'reason', width: 96 },
  { title: '商品', key: 'lines', minWidth: 220, ellipsis: { tooltip: true }, render: (r) => two(r.lines.map((l) => `${l.name}×${l.qty}`).join('、'), `${r.lines.reduce((s, l) => s + l.qty, 0)}件`) },
  { title: '中枢同意', key: 'approvedAt', width: 170, render: (r) => dateTime(r.hub.approvedAt) },
  { title: '退往', key: 'target', width: 100, render: (r) => r.hub.targetNodeName ?? muted('-') },
  { title: '交运', key: 'shippedAt', width: 170, render: (r) => dateTime(r.hub.shippedAt) },
  { title: '状态', key: 'status', width: 110, render: (r) => status(RTW_STATUS[r.status]) },
]

const open = ref<string>('')
const current = computed(() => (data.value ?? []).find((r) => r.no === open.value) ?? null)
const show = computed({
  get: () => !!open.value,
  set: (v) => {
    if (!v) open.value = ''
  },
})
const steps = computed(() => {
  const r = current.value
  if (!r) return []
  return [
    { title: '门店提交', at: r.createdAt, desc: `${admin.who(r.creatorJobNo)} · ${r.reason}` },
    { title: '中枢同意', at: r.hub.approvedAt, desc: r.hub.targetNodeName ? `退往${r.hub.targetNodeName}` : '等中枢同意并指定退往的仓' },
    { title: '交运出库', at: r.hub.shippedAt, desc: r.hub.shippedAt ? '本店账面已扣减，库存流水记为「退仓」' : '交运时扣减本店账面' },
  ]
})
const stepNow = computed(() => ({ submitted: 2, approved: 3, shipped: 3 })[current.value?.status ?? 'submitted'])
</script>

<template>
  <div>
    <PageHead title="退仓单">
      <template #desc>门店把货退回区域仓。加盟店的残次、滞销、质量件也走退仓，只转移库存位置，不因退仓把货款退给加盟商（《7.模式说明》§2.1、《5.单据目录》）</template>
      <template #actions>
        <StoreSelect v-model="storeId" />
      </template>
    </PageHead>

    <Hint class="mb-4">新建退仓在移动端做，提交时向中枢确认本店可用；中枢同意后交运，交运时才扣减本店账面</Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="data ?? []"
        :loading="loading && !data"
        :pagination="pagination"
        :row-key="(r: ReturnToWarehouse) => r.no"
        :row-props="clickable((r: ReturnToWarehouse) => (open = r.no))"
        :scroll-x="1290"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="520">
      <n-drawer-content v-if="current" closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">退仓单 <BillNo :no="current.no" /> <StatusTag :def="RTW_STATUS[current.status]" /></span>
        </template>
        <div class="flex flex-col gap-5 text-14px">
          <div class="text-13px text-t2">{{ admin.storeText(current.storeId) }}</div>
          <n-steps vertical size="small" :current="stepNow" :status="current.status === 'shipped' ? 'finish' : 'process'">
            <n-step v-for="s in steps" :key="s.title" :title="s.title">
              <div class="text-13px text-t2">{{ s.desc }}</div>
              <div class="qs-num text-12px text-t3">{{ s.at ?? '' }}</div>
            </n-step>
          </n-steps>
          <div>
            <div class="mb-1.5 font-600">退仓商品</div>
            <div v-for="l in current.lines" :key="l.sku" class="flex justify-between border-b border-line py-2 last:border-0">
              <span>{{ l.name }} <span class="text-t3">{{ l.spec }}</span> <span class="font-mono text-12px text-t3">{{ l.sku }}</span></span>
              <span class="qs-num font-600">× {{ l.qty }}</span>
            </div>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
