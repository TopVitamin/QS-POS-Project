<script setup lang="ts">
import { computed, h, ref } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { HUB_SYNC, PAY_METHOD } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { payColors } from '@/shared/theme/tokens'
import type { ReturnOrder } from '@/shared/types'
import { formatMoney } from '@/shared/utils/format'
import { addDays, todayBizDate } from '@/shared/utils/time'
import { bill, clickable, dateTime, link, money, pagination, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const storeId = ref<string | null>(null)
const range = ref<[string, string] | null>([addDays(todayBizDate(), -6), todayBizDate()])
const keyword = ref('')

const filter = computed(() => ({ storeIds: storeId.value ? [storeId.value] : admin.storeIds, keyword: keyword.value.trim() || undefined }))
const { data: all, loading } = useRequest(() => api.sales.listReturns(filter.value), { watch: [filter] })
const data = computed(() => (all.value ?? []).filter((r) => !range.value || (r.bizDate >= range.value[0] && r.bizDate <= range.value[1])))
const total = computed(() => data.value.reduce((s, r) => s + r.total, 0))

const methodsOf = (r: ReturnOrder) => [...new Set(r.refunds.map((p) => PAY_METHOD[p.method].short))].join(' + ')

const columns: DataTableColumns<ReturnOrder> = [
  { title: '退货单号', key: 'no', width: 250, render: (r) => two(bill(r.no), admin.storeText(r.storeId)) },
  { title: '退货时间', key: 'createdAt', width: 170, render: (r) => dateTime(r.createdAt) },
  { title: '原销售单', key: 'originalSaleNo', width: 230, render: (r) => link({ name: 'sale-detail', params: { no: r.originalSaleNo } }, h(BillNo, { no: r.originalSaleNo, plain: true })) },
  { title: '退货商品', key: 'lines', minWidth: 200, ellipsis: { tooltip: true }, render: (r) => r.lines.map((l) => `${l.name}×${l.qty}`).join('、') },
  { title: '应退', key: 'total', width: 110, align: 'right', render: (r) => money(r.total, { tone: 'promo', strong: true }) },
  { title: '原路退回', key: 'refunds', width: 110, render: (r) => methodsOf(r) },
  { title: '原因', key: 'reason', width: 96 },
  { title: '经办', key: 'operator', width: 110, render: (r) => admin.who(r.operatorJobNo) },
  { title: '中枢', key: 'hub', width: 110, render: (r) => h(StatusTag, { def: HUB_SYNC[r.hubSync.status] }) },
]

const openNo = ref('')
const { data: detail } = useRequest(() => (openNo.value ? api.sales.getReturn(openNo.value) : Promise.resolve(null)), { watch: [openNo] })
const show = computed({
  get: () => !!openNo.value,
  set: (v) => {
    if (!v) openNo.value = ''
  },
})
</script>

<template>
  <div>
    <PageHead title="退货单">
      <template #desc>按原销售单退，和原单互相引用；按原支付方式原路退款，库存回到本店微仓或代销仓（《4.全局业务规则》§二）</template>
    </PageHead>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <StoreSelect v-model="storeId" />
      <n-date-picker v-model:formatted-value="range" value-format="yyyy-MM-dd" type="daterange" clearable class="!w-260px" />
      <n-input v-model:value="keyword" clearable placeholder="退货单号或原销售单号" class="!w-240px">
        <template #prefix><span class="i-ph-magnifying-glass-bold text-t3" /></template>
      </n-input>
      <div class="flex-1" />
      <span class="text-13px text-t2">共 <b class="qs-num text-t1">{{ data.length }}</b> 笔，应退 <b class="qs-num text-promo-600">{{ formatMoney(total) }}</b></span>
    </div>

    <Hint class="mb-4">
      无原单退、跨店退原型不开放 <PendingTag :id="['待确认-27', '待确认-51']" />；组合支付的退款顺序 <AssumptionTag k="refundOrder" />；部分退货应退 <AssumptionTag k="partialRefund" />；退货对业绩的冲减 <PendingTag id="待确认-13" />
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="data"
        :loading="loading && !all"
        :pagination="pagination"
        :row-key="(r: ReturnOrder) => r.no"
        :row-props="clickable((r: ReturnOrder) => (openNo = r.no))"
        :scroll-x="1300"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="560">
      <n-drawer-content closable :native-scrollbar="false">
        <template #header>退货单 <BillNo :no="openNo" /></template>
        <div v-if="detail" class="flex flex-col gap-4 text-14px">
          <n-descriptions :column="2" label-placement="left" size="small" bordered>
            <n-descriptions-item label="门店">{{ admin.storeText(detail.ret.storeId) }}</n-descriptions-item>
            <n-descriptions-item label="时间"><span class="qs-num">{{ detail.ret.createdAt }}</span></n-descriptions-item>
            <n-descriptions-item label="经办">{{ admin.who(detail.ret.operatorJobNo) }}</n-descriptions-item>
            <n-descriptions-item label="导购">{{ admin.who(detail.ret.guideJobNo) }}</n-descriptions-item>
            <n-descriptions-item label="原因">{{ detail.ret.reason }}</n-descriptions-item>
            <n-descriptions-item label="班次"><BillNo :no="detail.ret.shiftNo" plain /></n-descriptions-item>
            <n-descriptions-item label="原销售单" :span="2">
              <router-link :to="{ name: 'sale-detail', params: { no: detail.ret.originalSaleNo } }" class="text-brand-700 hover:underline">
                <BillNo :no="detail.ret.originalSaleNo" plain />
              </router-link>
            </n-descriptions-item>
            <n-descriptions-item label="中枢回传" :span="2">
              <StatusTag :def="HUB_SYNC[detail.ret.hubSync.status]" /> <BillNo :no="detail.ret.hubSync.resultNo" />
            </n-descriptions-item>
          </n-descriptions>
          <div>
            <div class="mb-1.5 font-600">退货商品</div>
            <div v-for="l in detail.ret.lines" :key="l.lineNo" class="flex justify-between border-b border-line py-2 last:border-0">
              <span>
                {{ l.name }} <span class="text-t3">{{ l.spec }} × {{ l.qty }}</span>
                <span v-if="l.sns.length" class="ml-1 font-mono text-11px text-t3">SN {{ l.sns.join(' ') }}</span>
              </span>
              <MoneyText :value="l.refund" strong />
            </div>
          </div>
          <div>
            <div class="mb-1.5 font-600">原路退款</div>
            <div v-for="p in detail.ret.refunds" :key="p.id" class="flex items-center justify-between border-b border-line py-2 last:border-0">
              <span class="flex items-center gap-2">
                <span class="h-8px w-8px rounded-full" :style="{ background: payColors[p.method] }" />{{ PAY_METHOD[p.method].label }}
                <span class="font-mono text-12px text-t3">{{ p.channelTxnNo ?? '现金退回' }}</span>
              </span>
              <MoneyText :value="p.amount" strong />
            </div>
          </div>
          <div v-if="detail.ret.dailyCloseNo" class="text-13px text-t3">已随营业日 {{ detail.ret.bizDate }} 封账，日结单 <BillNo :no="detail.ret.dailyCloseNo" plain /></div>
        </div>
        <div v-else class="py-16 text-center"><n-spin /></div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
