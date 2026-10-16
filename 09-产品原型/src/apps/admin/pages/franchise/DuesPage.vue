<script setup lang="ts">
import { computed, h, ref } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { DUE_STATUS, PAY_METHOD, PAY_METHODS } from '@/shared/config/labels'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { payColors } from '@/shared/theme/tokens'
import type { FranchiseDue } from '@/shared/types'
import { codeName } from '@/shared/utils/format'
import { addDays, todayBizDate, weekdayOf } from '@/shared/utils/time'
import { bill, clickable, dateTime, money, muted, pagination, status, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const franchiseeId = ref<string | null>(null)
const storeId = ref<string | null>(null)
const st = ref<FranchiseDue['status'] | null>(null)
const range = ref<[string, string] | null>([addDays(todayBizDate(), -7), todayBizDate()])

const stores = computed(() => admin.franchiseStores.filter((s) => !franchiseeId.value || s.franchiseeId === franchiseeId.value))
const filter = computed(() => ({
  franchiseeIds: franchiseeId.value ? [franchiseeId.value] : admin.franchiseeIds,
  storeIds: storeId.value ? [storeId.value] : undefined,
  status: st.value ?? undefined,
  from: range.value?.[0],
  to: range.value?.[1],
}))
const { data, loading } = useRequest(() => api.franchise.dues(filter.value), { watch: [filter] })

const totals = computed(() => {
  const list = data.value ?? []
  const sumOf = (s?: FranchiseDue['status']) => list.filter((d) => !s || d.status === s).reduce((n, d) => n + d.total, 0)
  return { all: sumOf(), unpaid: sumOf('unpaid'), registered: sumOf('registered'), confirmed: sumOf('confirmed') }
})

const columns: DataTableColumns<FranchiseDue> = [
  { title: '应缴单号', key: 'no', width: 240, fixed: 'left', render: (d) => two(bill(d.no), admin.franchiseeText(d.franchiseeId)) },
  { title: '门店', key: 'storeId', width: 160, render: (d) => admin.storeText(d.storeId) },
  { title: '营业日', key: 'bizDate', width: 130, render: (d) => h('span', { class: 'qs-num' }, `${d.bizDate} ${weekdayOf(d.bizDate)}`) },
  { title: '日结单', key: 'dailyCloseNo', width: 210, render: (d) => bill(d.dailyCloseNo, true) },
  { title: '应缴合计', key: 'total', width: 120, align: 'right', render: (d) => money(d.total, { strong: true }) },
  ...PAY_METHODS.map((m) => ({
    title: PAY_METHOD[m].short,
    key: m,
    width: 100,
    align: 'right' as const,
    render: (d: FranchiseDue) => money(d.byMethod[m], { tone: d.byMethod[m] ? 'default' : 'muted' }),
  })),
  { title: '生成时间', key: 'generatedAt', width: 170, render: (d) => dateTime(d.generatedAt) },
  { title: '状态', key: 'status', width: 120, fixed: 'right', render: (d) => status(DUE_STATUS[d.status]) },
  { title: '缴款', key: 'remittanceNo', width: 110, fixed: 'right', render: (d) => (d.remittanceNo ? h('span', { class: 'text-t2' }, '已登记') : muted('-')) },
]
const statusOptions = Object.entries(DUE_STATUS).map(([value, d]) => ({ label: d.label, value }))
const franchiseeOptions = computed(() => admin.scopedFranchisees.map((f) => ({ label: codeName(f.code, f.name), value: f.id })))

const openNo = ref('')
const current = computed(() => (data.value ?? []).find((d) => d.no === openNo.value) ?? null)
const show = computed({
  get: () => !!openNo.value,
  set: (v) => {
    if (!v) openNo.value = ''
  },
})
</script>

<template>
  <div>
    <PageHead title="应缴营业款">
      <template #desc>加盟店日结封账后，中枢按营业日生成应缴，按支付方式分开。只含本店向顾客收的钱，不含线上已付款、只到店核销的订单。POS只读，不在店里改应缴金额（《4.全局业务规则》§六、《7.模式说明》§2.2）</template>
    </PageHead>

    <div v-if="!admin.franchiseeIds.length" class="qs-card py-16 text-center text-t3">当前身份没有被授权查看加盟商的应缴</div>
    <template v-else>
      <div class="mb-4 grid grid-cols-4 gap-3">
        <div class="rounded-14px bg-ink-900 px-4 py-3 text-white shadow-card">
          <div class="text-13px text-white/65">期间应缴合计</div>
          <MoneyText :value="totals.all" class="text-24px font-700 text-volt-400" />
        </div>
        <div class="qs-card px-4 py-3">
          <div class="text-13px text-t2">待缴</div>
          <MoneyText :value="totals.unpaid" class="text-22px font-700" :tone="totals.unpaid ? 'promo' : 'muted'" />
        </div>
        <div class="qs-card px-4 py-3">
          <div class="text-13px text-t2">已登记待核对</div>
          <MoneyText :value="totals.registered" class="text-22px font-700" />
        </div>
        <div class="qs-card px-4 py-3">
          <div class="text-13px text-t2">中枢已核对</div>
          <MoneyText :value="totals.confirmed" class="text-22px font-700" tone="ok" />
        </div>
      </div>

      <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <n-select v-if="franchiseeOptions.length > 1" v-model:value="franchiseeId" :options="franchiseeOptions" clearable placeholder="全部授权加盟商" class="!w-240px" @update:value="storeId = null" />
        <StoreSelect v-model="storeId" :stores="stores" placeholder="全部加盟店" />
        <n-select v-model:value="st" :options="statusOptions" clearable placeholder="全部状态" class="!w-150px" />
        <n-date-picker v-model:formatted-value="range" value-format="yyyy-MM-dd" type="daterange" clearable class="!w-260px" />
        <div class="flex-1" />
        <span class="text-13px text-t2">共 <b class="qs-num text-t1">{{ data?.length ?? 0 }}</b> 笔</span>
      </div>

      <Hint class="mb-4">
        <span class="mr-3 inline-flex items-center gap-3">
          <span v-for="m in PAY_METHODS" :key="m" class="inline-flex items-center gap-1"><span class="h-8px w-8px rounded-full" :style="{ background: payColors[m] }" />{{ PAY_METHOD[m].short }}</span>
        </span>
        每种方式是收款减退款。收款用谁的商户号 <PendingTag id="待确认-16" />；上缴全额还是净额、时限 <PendingTag id="待确认-17" />；储值不算进应缴 <PendingTag id="待确认-21" />
      </Hint>

      <div class="qs-card overflow-hidden">
        <n-data-table
          :columns="columns"
          :data="data ?? []"
          :loading="loading && !data"
          :pagination="pagination"
          :row-key="(d: FranchiseDue) => d.no"
          :row-props="clickable((d: FranchiseDue) => (openNo = d.no))"
          :scroll-x="1660"
          :bordered="false"
        />
      </div>
    </template>

    <n-drawer v-model:show="show" :width="520">
      <n-drawer-content v-if="current" closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">应缴 <BillNo :no="current.no" /> <StatusTag :def="DUE_STATUS[current.status]" /></span>
        </template>
        <div class="flex flex-col gap-4 text-14px">
          <n-descriptions :column="1" label-placement="left" size="small" bordered>
            <n-descriptions-item label="加盟商">{{ admin.franchiseeText(current.franchiseeId) }}</n-descriptions-item>
            <n-descriptions-item label="门店">{{ admin.storeText(current.storeId) }}</n-descriptions-item>
            <n-descriptions-item label="营业日"><span class="qs-num">{{ current.bizDate }} {{ weekdayOf(current.bizDate) }}</span></n-descriptions-item>
            <n-descriptions-item label="日结单"><BillNo :no="current.dailyCloseNo" plain /></n-descriptions-item>
            <n-descriptions-item label="生成时间"><span class="qs-num">{{ current.generatedAt }}</span></n-descriptions-item>
            <n-descriptions-item label="缴款">{{ current.remittanceNo ? '已登记' : '待缴' }}</n-descriptions-item>
          </n-descriptions>
          <div>
            <div class="mb-1.5 font-600">按支付方式</div>
            <div v-for="m in PAY_METHODS" :key="m" class="flex items-center justify-between border-b border-line py-2 last:border-0">
              <span class="flex items-center gap-2"><span class="h-8px w-8px rounded-full" :style="{ background: payColors[m] }" />{{ PAY_METHOD[m].label }}</span>
              <MoneyText :value="current.byMethod[m]" />
            </div>
            <div class="flex justify-between pt-2 font-600">
              <span>应缴合计</span>
              <MoneyText :value="current.total" strong />
            </div>
          </div>
          <Hint>POS只读，不在店里改应缴金额。只含本店向顾客收的钱，不含线上已付款的自提</Hint>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
