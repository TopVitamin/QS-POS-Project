<script setup lang="ts">
import { computed, h, ref } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { DISCREPANCY_STATUS, SHIPMENT_STATUS } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { Discrepancy, GoodsReceipt, InboundShipment } from '@/shared/types'
import { bill, clickable, dateTime, muted, pagination, status, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const tab = ref<'shipments' | 'receipts' | 'discrepancies'>('shipments')
const storeId = ref<string | null>(null)
const storeIds = computed(() => (storeId.value ? [storeId.value] : admin.storeIds))

const { data: shipments, loading: l1 } = useRequest(() => api.storeops.shipments({ storeIds: storeIds.value }), { watch: [storeIds] })
const { data: receipts, loading: l2 } = useRequest(() => api.storeops.receipts({ storeIds: storeIds.value }), { watch: [storeIds] })
const { data: discrepancies, loading: l3 } = useRequest(() => api.storeops.discrepancies({ storeIds: storeIds.value }), { watch: [storeIds] })

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const diffText = (n: number) => h('span', { class: `qs-num font-600 ${n > 0 ? 'text-ok' : 'text-bad'}` }, n > 0 ? `+${n}` : String(n))

const openNo = ref('')
const show = computed({
  get: () => !!openNo.value,
  set: (v) => {
    if (!v) openNo.value = ''
  },
})

const shipmentColumns: DataTableColumns<InboundShipment> = [
  { title: '调拨出库单（中枢）', key: 'outboundNo', width: 240, fixed: 'left', render: (s) => two(bill(s.outboundNo), admin.storeText(s.storeId)) },
  { title: '调出仓', key: 'source', width: 110, render: (s) => s.sourceNodeName },
  { title: '来源单据', key: 'rep', width: 230, render: (s) => (s.replenishmentNo ? two(bill(s.replenishmentNo), '要货') : s.transferNo ? two(bill(s.transferNo), '店间调拨') : muted('-')) },
  { title: '商品', key: 'lines', minWidth: 220, ellipsis: { tooltip: true }, render: (s) => two(s.lines.map((l) => `${l.name}×${l.qty}`).join('、'), `${sum(s.lines.map((l) => l.qty))}件`) },
  { title: '发运时间', key: 'shippedAt', width: 170, render: (s) => dateTime(s.shippedAt) },
  { title: '收货单', key: 'receiptNo', width: 230, render: (s) => (s.receiptNo ? bill(s.receiptNo) : muted('未收货')) },
  { title: '状态', key: 'status', width: 100, fixed: 'right', render: (s) => status(SHIPMENT_STATUS[s.status]) },
]

const receiptColumns: DataTableColumns<GoodsReceipt> = [
  { title: '收货单号', key: 'no', width: 250, fixed: 'left', render: (r) => two(bill(r.no), admin.storeText(r.storeId)) },
  { title: '来源出库单', key: 'outboundNo', width: 220, render: (r) => bill(r.outboundNo) },
  { title: '收货时间', key: 'receivedAt', width: 170, render: (r) => dateTime(r.receivedAt) },
  { title: '经办', key: 'operator', width: 110, render: (r) => admin.who(r.operatorJobNo) },
  { title: '出库', key: 'shipped', width: 70, align: 'right', render: (r) => h('span', { class: 'qs-num' }, sum(r.lines.map((l) => l.shippedQty))) },
  { title: '实收', key: 'received', width: 70, align: 'right', render: (r) => h('span', { class: 'qs-num font-600' }, sum(r.lines.map((l) => l.receivedQty))) },
  { title: '差异单', key: 'discrepancyNo', width: 230, render: (r) => (r.discrepancyNo ? bill(r.discrepancyNo) : h('span', { class: 'text-ok' }, '无差异')) },
  { title: '中枢结果', key: 'hub', width: 200, fixed: 'right', render: (r) => bill(r.hubResultNo) },
]

const discrepancyColumns: DataTableColumns<Discrepancy> = [
  { title: '差异单号', key: 'no', width: 250, fixed: 'left', render: (d) => two(bill(d.no), admin.storeText(d.storeId)) },
  { title: '收货单', key: 'receiptNo', width: 230, render: (d) => bill(d.receiptNo, true) },
  { title: '来源出库单', key: 'outboundNo', width: 220, render: (d) => bill(d.outboundNo) },
  {
    title: '差异行',
    key: 'lines',
    minWidth: 260,
    render: (d) =>
      h(
        'div',
        { class: 'flex flex-col gap-0.5' },
        d.lines.map((l) => h('div', { class: 'flex items-center gap-2' }, [h('span', null, `${l.name} 出库${l.shippedQty} 实收${l.receivedQty}`), diffText(l.diff)])),
      ),
  },
  { title: '登记时间', key: 'createdAt', width: 170, render: (d) => dateTime(d.createdAt) },
  { title: '经办', key: 'operator', width: 110, render: (d) => admin.who(d.operatorJobNo) },
  { title: '状态', key: 'status', width: 110, fixed: 'right', render: (d) => status(DISCREPANCY_STATUS[d.status]) },
]

const { data: detail } = useRequest(() => (openNo.value ? api.storeops.shipment(openNo.value) : Promise.resolve(null)), { watch: [openNo] })
const rows = computed(() =>
  (detail.value?.shipment.lines ?? []).map((l) => {
    const got = detail.value?.receipt?.lines.find((x) => x.sku === l.sku)
    return { ...l, received: got?.receivedQty ?? null, diff: got ? got.receivedQty - l.qty : null }
  }),
)
</script>

<template>
  <div>
    <PageHead title="收货与差异">
      <template #desc>收货必须指回中枢的调拨出库单；实收不预填出库数，逐行点数后录入。数量不一致另记差异单，不把实收改成和出库一样来做平（《4.全局业务规则》§四）</template>
      <template #actions>
        <StoreSelect v-model="storeId" />
      </template>
    </PageHead>

    <Hint class="mb-4">
      收货在移动端「收货」里按出库单录入，这里只看。收货之前货还在途，在途不算可用；在途短少和破损 <AssumptionTag k="transitShortage" />；单据落成哪几张 <PendingTag :id="['待确认-01', '待确认-41']" />
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-tabs v-model:value="tab" type="line" size="large" :tabs-padding="16" pane-style="padding: 0">
        <n-tab-pane name="shipments" :tab="`调拨出库单 ${shipments?.length ?? 0}`">
          <n-data-table
            :columns="shipmentColumns"
            :data="shipments ?? []"
            :loading="l1 && !shipments"
            :pagination="pagination"
            :row-key="(s: InboundShipment) => s.outboundNo"
            :row-props="clickable((s: InboundShipment) => (openNo = s.outboundNo))"
            :scroll-x="1350"
            :bordered="false"
          />
        </n-tab-pane>
        <n-tab-pane name="receipts" :tab="`收货单 ${receipts?.length ?? 0}`">
          <n-data-table
            :columns="receiptColumns"
            :data="receipts ?? []"
            :loading="l2 && !receipts"
            :pagination="pagination"
            :row-key="(r: GoodsReceipt) => r.no"
            :row-props="clickable((r: GoodsReceipt) => (openNo = r.outboundNo))"
            :scroll-x="1300"
            :bordered="false"
          />
        </n-tab-pane>
        <n-tab-pane name="discrepancies" :tab="`差异单 ${discrepancies?.length ?? 0}`">
          <n-data-table
            :columns="discrepancyColumns"
            :data="discrepancies ?? []"
            :loading="l3 && !discrepancies"
            :pagination="pagination"
            :row-key="(d: Discrepancy) => d.no"
            :row-props="clickable((d: Discrepancy) => (openNo = d.outboundNo))"
            :scroll-x="1400"
            :bordered="false"
          />
        </n-tab-pane>
      </n-tabs>
    </div>

    <n-drawer v-model:show="show" :width="600">
      <n-drawer-content closable :native-scrollbar="false">
        <template #header>调拨出库单 <BillNo :no="openNo" /></template>
        <div v-if="detail" class="flex flex-col gap-4 text-14px">
          <n-descriptions :column="2" label-placement="left" size="small" bordered>
            <n-descriptions-item label="收货门店" :span="2">{{ admin.storeText(detail.shipment.storeId) }}</n-descriptions-item>
            <n-descriptions-item label="调出仓">{{ detail.shipment.sourceNodeName }}</n-descriptions-item>
            <n-descriptions-item label="状态"><StatusTag :def="SHIPMENT_STATUS[detail.shipment.status]" /></n-descriptions-item>
            <n-descriptions-item label="发运时间"><span class="qs-num">{{ detail.shipment.shippedAt }}</span></n-descriptions-item>
            <n-descriptions-item :label="detail.shipment.transferNo ? '来源调拨单' : '来源要货单'">
              <BillNo :no="detail.shipment.transferNo || detail.shipment.replenishmentNo" plain />
            </n-descriptions-item>
            <n-descriptions-item label="收货单"><BillNo :no="detail.receipt?.no" plain /></n-descriptions-item>
            <n-descriptions-item label="收货人">{{ admin.who(detail.receipt?.operatorJobNo) }}</n-descriptions-item>
          </n-descriptions>

          <div class="overflow-hidden rounded-10px border border-line">
            <div class="grid grid-cols-[1fr_64px_64px_64px] bg-subtle px-3 py-2 text-12px font-600 text-t2">
              <span>商品</span><span class="text-right">出库</span><span class="text-right">实收</span><span class="text-right">差异</span>
            </div>
            <div v-for="l in rows" :key="l.sku" class="grid grid-cols-[1fr_64px_64px_64px] items-center border-t border-line px-3 py-2">
              <span class="min-w-0 leading-tight">
                <span class="block truncate">{{ l.name }}</span>
                <span class="text-12px text-t3"><span class="font-mono">{{ l.sku }}</span> · {{ l.spec }}</span>
              </span>
              <span class="qs-num text-right">{{ l.qty }}</span>
              <span class="qs-num text-right font-600">{{ l.received ?? '-' }}</span>
              <span class="qs-num text-right font-600" :class="!l.diff ? 'text-t3' : l.diff > 0 ? 'text-ok' : 'text-bad'">
                {{ l.diff === null ? '-' : l.diff > 0 ? `+${l.diff}` : l.diff }}
              </span>
            </div>
          </div>

          <Hint v-if="detail.shipment.status === 'in_transit'" tone="info">在途待收。门店在移动端按这张出库单逐行点数录入实收，实收不预填</Hint>
          <div v-if="detail.discrepancy" class="rounded-12px border border-[#F5D9A8] bg-[#FFFBF2] px-4 py-3">
            <div class="flex items-center gap-2 font-600">
              <span class="i-ph-seal-warning-fill text-warn" />差异单 <BillNo :no="detail.discrepancy.no" />
              <StatusTag :def="DISCREPANCY_STATUS[detail.discrepancy.status]" />
            </div>
            <div class="mt-1 text-13px text-t2">按实收入账，差异另记，交中枢处理。由谁承担 <PendingTag id="待确认-22" /></div>
          </div>
          <div v-if="detail.receipt" class="text-13px text-t3">中枢结果 <BillNo :no="detail.receipt.hubResultNo" />，收货时间 <span class="qs-num">{{ detail.receipt.receivedAt }}</span></div>
        </div>
        <div v-else class="py-16 text-center"><n-spin /></div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
