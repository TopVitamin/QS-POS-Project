<script setup lang="ts">
import { computed, h, ref } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api, type PaymentRow } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { PAY_METHOD, PAY_METHODS, PAYMENT_STATUS } from '@/shared/config/labels'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { payColors } from '@/shared/theme/tokens'
import type { PayMethod, Payment } from '@/shared/types'
import MoneyText from '@/shared/components/MoneyText.vue'
import { formatMoney } from '@/shared/utils/format'
import { todayBizDate } from '@/shared/utils/time'
import { bill, clickable, dateTime, money, mono, muted, pagination, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'
import BillNo from '@/shared/naive/BillNo.vue'

const admin = useAdmin()
const storeId = ref<string | null>(null)
const bizDate = ref<string | null>(todayBizDate())
const method = ref<PayMethod | null>(null)
const status = ref<Payment['status'] | null>(null)
const kind = ref<PaymentRow['kind'] | null>(null)

const filter = computed(() => ({
  storeIds: storeId.value ? [storeId.value] : admin.storeIds,
  bizDate: bizDate.value ?? undefined,
  method: method.value ?? undefined,
  status: status.value ?? undefined,
}))
const { data: all, loading } = useRequest(() => api.sales.payments(filter.value), { watch: [filter] })
const data = computed(() => (all.value ?? []).filter((r) => !kind.value || r.kind === kind.value))

/** 按方式汇总通道成功的收款和退款 */
const byMethod = computed(() =>
  PAY_METHODS.map((m) => {
    const rows = (all.value ?? []).filter((r) => r.method === m && r.status === 'success')
    const inAmt = rows.filter((r) => r.kind !== 'refund').reduce((s, r) => s + r.amount, 0)
    const outAmt = rows.filter((r) => r.kind === 'refund').reduce((s, r) => s + r.amount, 0)
    return { key: m, label: PAY_METHOD[m].label, icon: PAY_METHOD[m].icon, inAmt, outAmt, count: rows.length }
  }),
)

const KIND = { sale: '成交收款', refund: '退款', unfinished: '未成单' } as const
const methodOptions = PAY_METHODS.map((m) => ({ label: PAY_METHOD[m].label, value: m }))
const statusOptions = Object.entries(PAYMENT_STATUS).map(([value, d]) => ({ label: d.label, value }))
const kindOptions = Object.entries(KIND).map(([value, label]) => ({ label, value }))

const columns: DataTableColumns<PaymentRow> = [
  { title: '时间', key: 'createdAt', width: 170, render: (r) => two(dateTime(r.createdAt), r.queriedAt ? `查单确认 ${r.queriedAt.slice(11)}` : undefined) },
  { title: '门店', key: 'storeId', width: 170, render: (r) => admin.storeText(r.storeId) },
  {
    title: '类型',
    key: 'kind',
    width: 90,
    render: (r) => h('span', { class: r.kind === 'refund' ? 'text-promo-600' : r.kind === 'unfinished' ? 'text-warn' : '' }, KIND[r.kind]),
  },
  { title: '关联单号', key: 'docNo', width: 240, render: (r) => (r.docNo === '-' ? muted('-') : bill(r.docNo, true)) },
  {
    title: '支付方式',
    key: 'method',
    width: 110,
    render: (r) => h('span', { class: 'flex items-center gap-2' }, [h('span', { class: 'h-8px w-8px rounded-full', style: { background: payColors[r.method] } }), PAY_METHOD[r.method].label]),
  },
  { title: '金额', key: 'amount', width: 120, align: 'right', render: (r) => money(r.kind === 'refund' ? -r.amount : r.amount, { strong: true, tone: r.kind === 'refund' ? 'promo' : 'default' }) },
  { title: '状态', key: 'status', width: 96, render: (r) => h(StatusTag, { def: PAYMENT_STATUS[r.status] }) },
  { title: '通道流水号（原样）', key: 'channelTxnNo', minWidth: 210, render: (r) => (r.channelTxnNo ? mono(r.channelTxnNo) : muted(r.method === 'cash' ? '现金没有通道流水号' : '-')) },
  { title: '备注', key: 'note', width: 180, ellipsis: { tooltip: true }, render: (r) => r.note ?? '' },
]

const open = ref<PaymentRow | null>(null)
const show = computed({
  get: () => !!open.value,
  set: (v) => {
    if (!v) open.value = null
  },
})
const current = computed(() => (open.value ? data.value.find((r) => r.id === open.value!.id) ?? open.value : null))
const saleLink = (no: string) => no.startsWith('MDXS-')
const returnLink = (no: string) => no.startsWith('MDTH-')
</script>

<template>
  <div>
    <PageHead title="支付流水">
      <template #desc>成交收款、退货退款，以及没有成单的结算（失败、撤销退回）都列出来。以通道结果为准，结果不明只能按通道查单，不能在POS里改成成功（《4.全局业务规则》§三）</template>
    </PageHead>

    <div class="mb-4 grid grid-cols-4 gap-3">
      <div v-for="m in byMethod" :key="m.key" class="qs-card flex items-center gap-3 px-4 py-3">
        <span class="qs-flex-center h-38px w-38px shrink-0 rounded-10px text-20px text-white" :style="{ background: payColors[m.key] }"><span :class="m.icon" /></span>
        <div class="min-w-0 flex-1 leading-tight">
          <div class="text-13px text-t2">{{ m.label }} · {{ m.count }}笔</div>
          <div class="qs-num mt-0.5 text-18px font-700">{{ formatMoney(m.inAmt - m.outAmt) }}</div>
          <div class="qs-num text-12px text-t3">收 {{ formatMoney(m.inAmt) }} · 退 {{ formatMoney(m.outAmt) }}</div>
        </div>
      </div>
    </div>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <StoreSelect v-model="storeId" />
      <n-date-picker v-model:formatted-value="bizDate" value-format="yyyy-MM-dd" type="date" clearable placeholder="全部日期" class="!w-160px" />
      <n-select v-model:value="method" :options="methodOptions" clearable placeholder="全部方式" class="!w-130px" />
      <n-select v-model:value="status" :options="statusOptions" clearable placeholder="全部状态" class="!w-130px" />
      <n-select v-model:value="kind" :options="kindOptions" clearable placeholder="全部类型" class="!w-130px" />
      <div class="flex-1" />
      <span class="text-13px text-t2">共 <b class="qs-num text-t1">{{ data.length }}</b> 条</span>
    </div>

    <Hint class="mb-4">通道流水号按通道返回的原值保存；演示流水号是模拟通道生成的。支付通道直连还是走聚合服务商 <PendingTag id="待确认-40" /></Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="data"
        :loading="loading && !all"
        :pagination="pagination"
        :row-key="(r: PaymentRow) => r.id"
        :row-props="clickable((r: PaymentRow) => (open = r))"
        :scroll-x="1390"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="520">
      <n-drawer-content v-if="current" closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">支付流水 <StatusTag :def="PAYMENT_STATUS[current.status]" /></span>
        </template>
        <div class="flex flex-col gap-4 text-14px">
          <n-descriptions :column="1" label-placement="left" size="small" bordered>
            <n-descriptions-item label="类型">{{ KIND[current.kind] }}</n-descriptions-item>
            <n-descriptions-item label="门店">{{ admin.storeText(current.storeId) }}</n-descriptions-item>
            <n-descriptions-item label="时间"><span class="qs-num">{{ current.createdAt }}</span></n-descriptions-item>
            <n-descriptions-item label="支付方式">{{ PAY_METHOD[current.method].label }}</n-descriptions-item>
            <n-descriptions-item label="金额"><MoneyText :value="current.kind === 'refund' ? -current.amount : current.amount" strong /></n-descriptions-item>
            <n-descriptions-item label="通道流水号">
              <span v-if="current.channelTxnNo" class="font-mono">{{ current.channelTxnNo }}</span>
              <span v-else class="text-t3">{{ current.method === 'cash' ? '现金没有通道流水号' : '-' }}</span>
            </n-descriptions-item>
            <n-descriptions-item v-if="current.queriedAt" label="查单确认"><span class="qs-num">{{ current.queriedAt }}</span></n-descriptions-item>
            <n-descriptions-item label="关联单据">
              <router-link v-if="saleLink(current.docNo)" :to="{ name: 'sale-detail', params: { no: current.docNo } }" class="text-brand-700 hover:underline">
                <BillNo :no="current.docNo" plain />
              </router-link>
              <router-link v-else-if="returnLink(current.docNo)" :to="{ name: 'returns' }" class="text-brand-700 hover:underline">
                <BillNo :no="current.docNo" plain />
              </router-link>
              <span v-else class="text-t3">{{ current.docNo === '-' ? '未成单，没有销售单' : current.docNo }}</span>
            </n-descriptions-item>
            <n-descriptions-item v-if="current.note" label="备注">{{ current.note }}</n-descriptions-item>
          </n-descriptions>
          <Hint>以通道结果为准。结果不明只能按通道查单，不能在POS里改成成功（《4.全局业务规则》§三）</Hint>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
