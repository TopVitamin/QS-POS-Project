<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { NTag, type DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { PICKUP_STATUS, VERIFY_REJECT } from '@/shared/config/labels'
import { listsCustomer } from '@/shared/config/permissions'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import type { PickupOrder, VerificationRecord } from '@/shared/types'
import { maskCode, maskName, maskPhone } from '@/shared/utils/format'
import { todayBizDate } from '@/shared/utils/time'
import { bill, dateTime, link, money, mono, muted, pagination, status, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const tab = ref<'orders' | 'records'>('orders')
const storeId = ref<string | null>(null)
const orderStatus = ref<PickupOrder['status'] | null>(null)
const result = ref<'success' | 'rejected' | null>(null)
const storeIds = computed(() => (storeId.value ? [storeId.value] : admin.storeIds))

const { data: orders, loading } = useRequest(() => api.fulfil.pickups({ storeIds: storeIds.value }), { watch: [storeIds] })
const { data: records, loading: loadingRecords } = useRequest(() => api.fulfil.verifications({ storeIds: storeIds.value }), { watch: [storeIds] })

const shownOrders = computed(() => (orders.value ?? []).filter((o) => !orderStatus.value || o.status === orderStatus.value))
const shownRecords = computed(() => (records.value ?? []).filter((r) => !result.value || r.result === result.value))

const today = todayBizDate()
const stats = computed(() => {
  const o = orders.value ?? []
  const r = (records.value ?? []).filter((x) => x.at.startsWith(today))
  return [
    { label: '待核销', value: o.filter((x) => x.status === 'pending').length, hint: '锁定有效，等顾客到店', tone: 'text-info' },
    { label: '今日核销', value: r.filter((x) => x.result === 'success').length, hint: '中枢已扣减并释放锁定', tone: 'text-ok' },
    { label: '今日被拒', value: r.filter((x) => x.result === 'rejected').length, hint: '被拒也留记录', tone: 'text-bad' },
    { label: '已过期', value: o.filter((x) => x.status === 'expired').length, hint: '中枢判过期，锁定已释放', tone: 'text-t2' },
  ]
})

/**
 * 还能用的码只给顾客，后台只露前3位；已核销、已过期的码已经失效，原样显示方便追溯。
 * 别的店的单看不到状态（例如顾客把别店的码拿来被拒），一律按还能用处理
 */
const settledOms = computed(() => new Set((orders.value ?? []).filter((o) => o.status !== 'pending').map((o) => o.omsNo)))
const codeText = (code: string, omsNo?: string) => (omsNo && !settledOms.value.has(omsNo) ? maskCode(code) : code)

const trace = (q: string) => (admin.has('audit.view') ? link({ name: 'audit-trace', query: { q } }, '追溯') : null)

const orderColumns: DataTableColumns<PickupOrder> = [
  { title: 'OMS履约单号', key: 'omsNo', width: 250, fixed: 'left', render: (o) => two(bill(o.omsNo), h('span', { class: 'font-mono' }, `小程序 ${o.channelOrderNo}`)) },
  { title: '自提门店', key: 'storeId', width: 160, render: (o) => admin.storeText(o.storeId) },
  { title: '商品', key: 'items', minWidth: 190, ellipsis: { tooltip: true }, render: (o) => o.items.map((i) => `${i.name}×${i.qty}`).join('、') },
  { title: '线上已付', key: 'paidAmount', width: 110, align: 'right', render: (o) => money(o.paidAmount) },
  {
    title: '顾客',
    key: 'customer',
    width: 130,
    render: (o) => (listsCustomer(admin.storeById(o.storeId)) ? two(maskName(o.customer.name), h('span', { class: 'qs-num' }, maskPhone(o.customer.phone))) : muted('加盟店不展示')),
  },
  { title: '提货码', key: 'pickupCode', width: 90, render: (o) => mono(codeText(o.pickupCode, o.omsNo)) },
  {
    title: '锁定',
    key: 'lock',
    width: 200,
    render: (o) =>
      two(
        bill(o.lock.lockNo, true),
        o.lock.status === 'locked' ? h('span', { class: 'text-info' }, '锁定有效') : '已释放',
      ),
  },
  { title: '下发时间', key: 'createdAt', width: 170, render: (o) => dateTime(o.createdAt) },
  {
    title: '核销',
    key: 'verificationNo',
    width: 230,
    render: (o) => (o.verificationNo ? two(bill(o.verificationNo), `${o.verifiedAt?.slice(5, 16)} · ${admin.who(o.verifierJobNo)}`) : muted('-')),
  },
  { title: '状态', key: 'status', width: 90, fixed: 'right', render: (o) => status(PICKUP_STATUS[o.status]) },
  { title: '', key: 'trace', width: 60, fixed: 'right', render: (o) => trace(o.omsNo) },
]

/** 范围里只有加盟店时整列不出 */
const shownOrderColumns = computed(() =>
  admin.scopedStores.some((s) => listsCustomer(s)) ? orderColumns : orderColumns.filter((c) => !('key' in c) || c.key !== 'customer'),
)

const recordColumns: DataTableColumns<VerificationRecord> = [
  { title: '时间', key: 'at', width: 170, fixed: 'left', render: (r) => dateTime(r.at) },
  { title: '门店', key: 'storeId', width: 160, render: (r) => admin.storeText(r.storeId) },
  {
    title: '结果',
    key: 'result',
    width: 130,
    render: (r) =>
      r.result === 'success'
        ? h(NTag, { size: 'small', bordered: false, type: 'success' }, () => '核销成功')
        : h(NTag, { size: 'small', bordered: false, type: 'error' }, () => VERIFY_REJECT[r.reason!].label),
  },
  { title: '核销单号', key: 'no', width: 230, render: (r) => (r.no ? bill(r.no) : muted('被拒不发单号')) },
  { title: '提货码（输入值）', key: 'pickupCode', width: 140, render: (r) => mono(codeText(r.pickupCode, r.omsNo)) },
  { title: 'OMS履约单号', key: 'omsNo', width: 220, render: (r) => (r.omsNo ? bill(r.omsNo) : muted('中枢没有这张码')) },
  { title: '经办', key: 'operator', width: 120, render: (r) => admin.who(r.operatorJobNo) },
  { title: '说明', key: 'detail', minWidth: 240, ellipsis: { tooltip: true }, render: (r) => (r.result === 'success' ? '中枢扣减本店库存，释放锁定' : VERIFY_REJECT[r.reason!].detail) },
]

const statusOptions = Object.entries(PICKUP_STATUS).map(([value, d]) => ({ label: d.label, value }))
const resultOptions = [
  { label: '核销成功', value: 'success' },
  { label: '被拒', value: 'rejected' },
]
</script>

<template>
  <div>
    <PageHead title="自提履约单">
      <template #desc>
        OMS下发到本店的履约单投影。顾客在小程序已付款，门店不再收钱，也不进门店成交净额；核销在收银端和移动端做，这里只看
      </template>
      <template #actions>
        <StoreSelect v-model="storeId" />
      </template>
    </PageHead>

    <div class="mb-4 grid grid-cols-4 gap-3">
      <div v-for="s in stats" :key="s.label" class="qs-card px-4 py-3">
        <div class="text-13px text-t2">{{ s.label }}</div>
        <div class="qs-num mt-0.5 text-26px font-700 leading-32px" :class="s.value ? s.tone : 'text-t3'">{{ s.value }}</div>
        <div class="text-12px text-t3">{{ s.hint }}</div>
      </div>
    </div>

    <Hint class="mb-4">
      先锁后出码，锁定成功才有提货码；中枢核验门店、锁定、是否过期和是否已核销，成功和被拒都留记录（《4.全局业务规则》§二、§七）。
      提货截止 <AssumptionTag k="pickupDeadline" />；无码核销 <PendingTag id="待确认-05" />；核销是否另生零金额销售单 <PendingTag id="待确认-14" />；
      列表里的顾客信息直营店脱敏展示、加盟店不展示 <PendingTag id="待确认-52" />；加盟店核销计件，佣金 <PendingTag id="待确认-20" />
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-tabs v-model:value="tab" type="line" size="large" :tabs-padding="16" pane-style="padding: 0">
        <template #suffix>
          <div class="pr-4">
            <n-select v-if="tab === 'orders'" v-model:value="orderStatus" :options="statusOptions" clearable placeholder="全部状态" size="small" class="!w-130px" />
            <n-select v-else v-model:value="result" :options="resultOptions" clearable placeholder="全部结果" size="small" class="!w-130px" />
          </div>
        </template>
        <n-tab-pane name="orders" :tab="`履约单 ${shownOrders.length}`">
          <n-data-table
            :columns="shownOrderColumns"
            :data="shownOrders"
            :loading="loading && !orders"
            :pagination="pagination"
            :row-key="(o: PickupOrder) => o.omsNo"
            :scroll-x="1720"
            :bordered="false"
          />
        </n-tab-pane>
        <n-tab-pane name="records" :tab="`核销记录 ${shownRecords.length}`">
          <n-data-table
            :columns="recordColumns"
            :data="shownRecords"
            :loading="loadingRecords && !records"
            :pagination="pagination"
            :row-key="(r: VerificationRecord) => r.id"
            :scroll-x="1430"
            :bordered="false"
          />
        </n-tab-pane>
      </n-tabs>
    </div>
    <div class="mt-2 text-12px text-t3">提货码只给顾客，还能用的码在后台只露前3位。演示用的完整码在「中枢模拟器」里，那是顾客手机上看到的码</div>
  </div>
</template>
