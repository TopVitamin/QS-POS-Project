<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { HUB_SYNC, PAY_METHOD, SALE_STATUS } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { SaleOrder } from '@/shared/types'
import { formatMoney } from '@/shared/utils/format'
import { addDays, todayBizDate } from '@/shared/utils/time'
import { bill, clickable, dateTime, money, pagination, two } from '../../components/cells'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const router = useRouter()

const storeId = ref<string | null>(null)
const range = ref<[string, string] | null>([addDays(todayBizDate(), -6), todayBizDate()])
const status = ref<SaleOrder['status'] | null>(null)
const keyword = ref('')

const filter = computed(() => ({
  storeIds: storeId.value ? [storeId.value] : admin.storeIds,
  from: range.value?.[0],
  to: range.value?.[1],
  status: status.value ?? undefined,
  keyword: keyword.value.trim() || undefined,
}))
const { data, loading } = useRequest(() => api.sales.list(filter.value), { watch: [filter] })

const stats = computed(() => {
  const list = data.value ?? []
  return {
    count: list.length,
    payable: list.reduce((s, x) => s + x.totals.payable, 0),
    discount: list.reduce((s, x) => s + x.totals.list - x.totals.payable, 0),
    refunded: list.reduce((s, x) => s + x.lines.reduce((n, l) => n + l.refundedAmount, 0), 0),
  }
})

const statusOptions = Object.entries(SALE_STATUS).map(([value, d]) => ({ label: d.label, value }))
const methodsOf = (s: SaleOrder) => [...new Set(s.payments.map((p) => PAY_METHOD[p.method].short))].join(' + ')
const guidesOf = (s: SaleOrder) => {
  const jobs = [...new Set(s.lines.map((l) => l.guideJobNo))]
  return jobs.length > 1 ? `${admin.who(jobs[0])} 等${jobs.length}人` : admin.who(jobs[0])
}

const columns: DataTableColumns<SaleOrder> = [
  { title: '销售单号', key: 'no', width: 250, render: (r) => two(bill(r.no), admin.storeText(r.storeId)) },
  { title: '成交时间', key: 'createdAt', width: 170, render: (r) => dateTime(r.createdAt) },
  {
    title: '商品',
    key: 'lines',
    minWidth: 220,
    ellipsis: { tooltip: true },
    render: (r) => two(r.lines.map((l) => `${l.name}×${l.qty}`).join('、'), `${r.lines.reduce((n, l) => n + l.qty, 0)}件 · 导购 ${guidesOf(r)}`),
  },
  { title: '优惠', key: 'discount', width: 110, align: 'right', render: (r) => money(r.totals.list - r.totals.payable, { discount: true }) },
  { title: '实收', key: 'payable', width: 120, align: 'right', render: (r) => money(r.totals.payable, { strong: true }) },
  { title: '支付', key: 'payments', width: 120, render: (r) => methodsOf(r) },
  { title: '状态', key: 'status', width: 96, render: (r) => h(StatusTag, { def: SALE_STATUS[r.status] }) },
  {
    title: '回传与日结',
    key: 'hub',
    width: 150,
    render: (r) =>
      h('div', { class: 'flex flex-col items-start gap-1' }, [
        h(StatusTag, { def: HUB_SYNC[r.hubSync.status] }),
        h('span', { class: `text-12px ${r.dailyCloseNo ? 'text-t3' : 'text-warn'}` }, r.dailyCloseNo ? '已封账' : '未封账'),
      ]),
  },
]

const open = (r: SaleOrder) => router.push({ name: 'sale-detail', params: { no: r.no } })
</script>

<template>
  <div>
    <PageHead title="销售单">
      <template #desc>门店执行记录。价格、促销和导购都是成交时的快照，事后改主数据不改历史单（《4.全局业务规则》§五）</template>
      <template #tags><AssumptionTag k="billPrefix" /></template>
    </PageHead>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <StoreSelect v-model="storeId" />
      <n-date-picker v-model:formatted-value="range" value-format="yyyy-MM-dd" type="daterange" class="!w-260px" />
      <n-select v-model:value="status" :options="statusOptions" clearable placeholder="全部状态" class="!w-140px" />
      <n-input v-model:value="keyword" clearable placeholder="单号、商品名或SKU" class="!w-220px">
        <template #prefix><span class="i-ph-magnifying-glass-bold text-t3" /></template>
      </n-input>
      <div class="flex-1" />
      <div class="flex items-center gap-5 text-13px text-t2">
        <span>共 <b class="qs-num text-t1">{{ stats.count }}</b> 笔</span>
        <span>实收 <b class="qs-num text-t1">{{ formatMoney(stats.payable) }}</b></span>
        <span>优惠 <b class="qs-num text-promo-600">{{ formatMoney(stats.discount) }}</b></span>
        <span>已退 <b class="qs-num text-t1">{{ formatMoney(stats.refunded) }}</b></span>
      </div>
    </div>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="data ?? []"
        :loading="loading && !data"
        :pagination="pagination"
        :row-key="(r: SaleOrder) => r.no"
        :row-props="clickable(open)"
        :scroll-x="1150"
        :bordered="false"
      />
    </div>
  </div>
</template>
