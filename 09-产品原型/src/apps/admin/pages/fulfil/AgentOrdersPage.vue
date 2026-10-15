<script setup lang="ts">
import { computed, h, ref } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { AGENT_STATUS } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { AgentOrder } from '@/shared/types'
import { maskCode, maskName, maskPhone, orEmpty } from '@/shared/utils/format'
import { bill, clickable, dateTime, money, mono, muted, pagination, status, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const storeId = ref<string | null>(null)
const st = ref<AgentOrder['status'] | null>(null)
const bizDate = ref<string | null>(null)

const filter = computed(() => ({ storeIds: storeId.value ? [storeId.value] : admin.storeIds, status: st.value ?? undefined, bizDate: bizDate.value ?? undefined }))
const { data, loading } = useRequest(() => api.fulfil.agentOrders(filter.value), { watch: [filter] })

const SOURCE: Record<AgentOrder['source'], string> = { cashier: '收银端', mobile: '移动端', pickup_rejected: '核销被拒转代发' }
/** 收货地址只给OMS和承运商用，后台只露开头 */
const maskAddress = (a: string) => (a.length > 6 ? `${a.slice(0, 6)}****` : a)
/** 来源提货码：确定已核销或已过期的才显示全码，口径同自提履约单页 */
const { data: pickups } = useRequest(() => api.fulfil.pickups({ storeIds: admin.storeIds }))
const sourceCode = (code?: string) => {
  const p = pickups.value?.find((x) => x.pickupCode === code)
  return p && p.status !== 'pending' ? orEmpty(code) : maskCode(code)
}

const columns: DataTableColumns<AgentOrder> = [
  { title: '代客单号', key: 'no', width: 250, render: (o) => two(bill(o.no), admin.storeText(o.storeId)) },
  { title: '提交时间', key: 'createdAt', width: 170, render: (o) => dateTime(o.createdAt) },
  { title: '来源', key: 'source', width: 130, render: (o) => two(SOURCE[o.source], o.source === 'pickup_rejected' ? h('span', { class: 'font-mono' }, sourceCode(o.sourceRef)) : undefined) },
  { title: '导购（业绩归属）', key: 'guide', width: 140, render: (o) => admin.who(o.guideJobNo) },
  { title: '商品', key: 'items', minWidth: 190, ellipsis: { tooltip: true }, render: (o) => o.items.map((i) => `${i.name}×${i.qty}`).join('、') },
  { title: '参考金额', key: 'referenceAmount', width: 110, align: 'right', render: (o) => money(o.referenceAmount) },
  { title: '收货人', key: 'customer', width: 130, render: (o) => two(maskName(o.customer.name), h('span', { class: 'qs-num' }, maskPhone(o.customer.phone))) },
  { title: 'OMS路由', key: 'oms', width: 230, render: (o) => (o.oms.omsNo ? two(bill(o.oms.omsNo), orEmpty(o.oms.nodeName)) : muted('-')) },
  { title: '运单', key: 'tracking', width: 170, render: (o) => (o.oms.trackingNo ? two(mono(o.oms.trackingNo), o.oms.carrier) : muted('-')) },
  { title: '状态', key: 'status', width: 100, render: (o) => status(AGENT_STATUS[o.status]) },
]

const statusOptions = Object.entries(AGENT_STATUS).map(([value, d]) => ({ label: d.label, value }))

const open = ref<AgentOrder | null>(null)
const current = computed(() => (open.value ? (data.value ?? []).find((o) => o.no === open.value!.no) ?? open.value : null))
const show = computed({
  get: () => !!open.value,
  set: (v) => {
    if (!v) open.value = null
  },
})
const steps = computed(() => {
  const o = current.value
  if (!o) return []
  return [
    { title: '已提交OMS', at: o.createdAt, desc: `${SOURCE[o.source]} · ${admin.who(o.creatorJobNo)}` },
    { title: 'OMS路由', at: o.oms.routedAt, desc: o.oms.nodeName ? `履约节点 ${o.oms.nodeName}` : '等OMS按地址、运费、时效、库存选节点' },
    { title: '拣发', at: o.oms.shippedAt, desc: o.oms.trackingNo ? `${o.oms.carrier} ${o.oms.trackingNo}` : 'WMS拣货、打包、交承运商' },
    { title: '签收', at: o.oms.signedAt, desc: o.oms.signedAt ? '顾客已签收' : '-' },
  ]
})
const stepNow = computed(() => {
  const o = current.value
  if (!o) return 1
  return { submitted: 2, routed: 3, shipped: 4, signed: 4, cancelled: 1 }[o.status]
})
</script>

<template>
  <div>
    <PageHead title="代客单">
      <template #desc>导购替顾客向中央OMS提交的申请，不是发货指令。POS不选仓、不选承运商，扣减发生在被路由选中的节点，不扣本店库存（《3.上下游链路》§五、《4.全局业务规则》§二）</template>
    </PageHead>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <StoreSelect v-model="storeId" />
      <n-select v-model:value="st" :options="statusOptions" clearable placeholder="全部状态" class="!w-140px" />
      <n-date-picker v-model:formatted-value="bizDate" value-format="yyyy-MM-dd" type="date" clearable placeholder="全部日期" class="!w-160px" />
      <div class="flex-1" />
      <span class="text-13px text-t2">共 <b class="qs-num text-t1">{{ data?.length ?? 0 }}</b> 单</span>
    </div>

    <Hint class="mb-4">
      收款时点 <AssumptionTag k="agentPayment" />；承运商 <AssumptionTag k="carrier" />；导购工号是业绩归属的主键，提成怎么算 <PendingTag id="待确认-13" />；
      加盟店发起的代客单，佣金 <PendingTag id="待确认-20" />
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="data ?? []"
        :loading="loading && !data"
        :pagination="pagination"
        :row-key="(o: AgentOrder) => o.no"
        :row-props="clickable((o: AgentOrder) => (open = o))"
        :scroll-x="1620"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="560">
      <n-drawer-content v-if="current" closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">代客单 <BillNo :no="current.no" /> <StatusTag :def="AGENT_STATUS[current.status]" /></span>
        </template>
        <div class="flex flex-col gap-5 text-14px">
          <n-steps vertical size="small" :current="stepNow" :status="current.status === 'signed' ? 'finish' : current.status === 'cancelled' ? 'error' : 'process'">
            <n-step v-for="s in steps" :key="s.title" :title="s.title">
              <div class="text-13px text-t2">{{ s.desc }}</div>
              <div class="qs-num text-12px text-t3">{{ s.at ?? '' }}</div>
            </n-step>
          </n-steps>

          <n-descriptions :column="2" label-placement="left" size="small" bordered>
            <n-descriptions-item label="发起门店" :span="2">{{ admin.storeText(current.storeId) }}</n-descriptions-item>
            <n-descriptions-item label="导购">{{ admin.who(current.guideJobNo) }}</n-descriptions-item>
            <n-descriptions-item label="提交人">{{ admin.who(current.creatorJobNo) }}</n-descriptions-item>
            <n-descriptions-item label="收货人">{{ maskName(current.customer.name) }} <span class="qs-num">{{ maskPhone(current.customer.phone) }}</span></n-descriptions-item>
            <n-descriptions-item label="地址">{{ maskAddress(current.customer.address) }}</n-descriptions-item>
            <n-descriptions-item label="OMS单号"><BillNo :no="current.oms.omsNo" /></n-descriptions-item>
            <n-descriptions-item label="履约节点">{{ orEmpty(current.oms.nodeName) }}</n-descriptions-item>
            <n-descriptions-item label="备注" :span="2">{{ orEmpty(current.note) }}</n-descriptions-item>
          </n-descriptions>

          <div>
            <div class="mb-1.5 font-600">商品（按下发零售价参考）</div>
            <div v-for="i in current.items" :key="i.sku" class="flex justify-between border-b border-line py-2 last:border-0">
              <span>{{ i.name }} <span class="text-t3">{{ i.spec }} × {{ i.qty }}</span></span>
              <MoneyText :value="i.unitPrice * i.qty" />
            </div>
            <div class="flex justify-between pt-2 font-600">
              <span>参考金额</span>
              <MoneyText :value="current.referenceAmount" strong />
            </div>
            <div class="mt-1 text-12px text-t3">POS不收款，参考金额不进门店成交净额</div>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
