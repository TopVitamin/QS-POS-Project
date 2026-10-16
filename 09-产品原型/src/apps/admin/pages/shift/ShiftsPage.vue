<script setup lang="ts">
import { computed, h, ref } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { PAY_METHOD, PAY_METHODS, SHIFT_STATUS } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { payColors } from '@/shared/theme/tokens'
import type { Shift } from '@/shared/types'
import { orEmpty } from '@/shared/utils/format'
import { bill, clickable, money, muted, pagination, status, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const storeId = ref<string | null>(null)
const bizDate = ref<string | null>(null)
const st = ref<Shift['status'] | null>(null)

const filter = computed(() => ({ storeIds: storeId.value ? [storeId.value] : admin.storeIds, bizDate: bizDate.value ?? undefined, status: st.value ?? undefined }))
const { data, loading } = useRequest(() => api.shift.list(filter.value), { watch: [filter] })

const diffCell = (s: Shift) => {
  if (s.status === 'open') return muted('当班中')
  const d = s.cashDiff ?? 0
  return h(MoneyText, { value: d, sign: true, strong: !!d, tone: d ? 'bad' : 'muted' })
}

const columns: DataTableColumns<Shift> = [
  { title: '班次号', key: 'no', width: 230, fixed: 'left', render: (s) => two(bill(s.no), admin.storeText(s.storeId)) },
  { title: '收银台', key: 'registerNo', width: 80, render: (s) => `${s.registerNo}号` },
  { title: '收银员', key: 'cashier', width: 110, render: (s) => admin.who(s.cashierJobNo) },
  { title: '营业日', key: 'bizDate', width: 110, render: (s) => h('span', { class: 'qs-num' }, s.bizDate) },
  { title: '开班 / 交班', key: 'time', width: 130, render: (s) => two(h('span', { class: 'qs-num' }, s.openedAt.slice(11, 16)), s.closedAt ? h('span', { class: 'qs-num' }, s.closedAt.slice(11, 16)) : '未交班') },
  { title: '备用金', key: 'float', width: 100, align: 'right', render: (s) => money(s.float) },
  { title: '成交/退货', key: 'count', width: 96, align: 'right', render: (s) => h('span', { class: 'qs-num' }, `${s.summary?.saleCount ?? 0} / ${s.summary?.returnCount ?? 0}`) },
  { title: '应有现金', key: 'expectedCash', width: 110, align: 'right', render: (s) => money(s.summary?.expectedCash) },
  { title: '实点现金', key: 'countedCash', width: 110, align: 'right', render: (s) => (s.status === 'closed' ? money(s.countedCash, { strong: true }) : muted('-')) },
  { title: '现金差异', key: 'cashDiff', width: 110, align: 'right', render: diffCell },
  { title: '差异说明', key: 'diffNote', minWidth: 160, ellipsis: { tooltip: true }, render: (s) => s.diffNote ?? '' },
  { title: '状态', key: 'status', width: 90, fixed: 'right', render: (s) => status(SHIFT_STATUS[s.status]) },
]
const statusOptions = Object.entries(SHIFT_STATUS).map(([value, d]) => ({ label: d.label, value }))
const stats = computed(() => {
  const list = data.value ?? []
  return { open: list.filter((s) => s.status === 'open').length, withDiff: list.filter((s) => s.cashDiff).length, total: list.length }
})

const openNo = ref('')
const current = computed(() => (data.value ?? []).find((s) => s.no === openNo.value) ?? null)
const show = computed({
  get: () => !!openNo.value,
  set: (v) => {
    if (!v) openNo.value = ''
  },
})
const methodRows = computed(() => {
  const m = current.value?.summary?.byMethod
  if (!m) return []
  return PAY_METHODS.map((k) => ({ key: k, label: PAY_METHOD[k].label, ...m[k], net: m[k].sales - m[k].refunds }))
})
</script>

<template>
  <div>
    <PageHead title="班次">
      <template #desc>班次只说明这一班的现金和备用金，不产生库存。交班差异留下，不在交班时改写销售单（《4.全局业务规则》§六）</template>
    </PageHead>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <StoreSelect v-model="storeId" />
      <n-date-picker v-model:formatted-value="bizDate" value-format="yyyy-MM-dd" type="date" clearable placeholder="全部营业日" class="!w-160px" />
      <n-select v-model:value="st" :options="statusOptions" clearable placeholder="全部状态" class="!w-130px" />
      <div class="flex-1" />
      <span class="text-13px text-t2">
        共 <b class="qs-num text-t1">{{ stats.total }}</b> 个班次 · 当班中 <b class="qs-num text-info">{{ stats.open }}</b> · 有现金差异 <b class="qs-num" :class="stats.withDiff ? 'text-bad' : 'text-t1'">{{ stats.withDiff }}</b>
      </span>
    </div>

    <Hint class="mb-4">
      应有现金 = 备用金 + 现金收款 − 现金退款。交班在收银端做：有结果不明的支付先查单，差异必须写说明 <AssumptionTag k="shiftDiff" />；现金缴款方式 <PendingTag id="待确认-10" />
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="data ?? []"
        :loading="loading && !data"
        :pagination="pagination"
        :row-key="(s: Shift) => s.no"
        :row-props="clickable((s: Shift) => (openNo = s.no))"
        :scroll-x="1500"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="560">
      <n-drawer-content v-if="current" closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">班次 <BillNo :no="current.no" /> <StatusTag :def="SHIFT_STATUS[current.status]" /></span>
        </template>
        <div class="flex flex-col gap-4 text-14px">
          <n-descriptions :column="2" label-placement="left" size="small" bordered>
            <n-descriptions-item label="门店" :span="2">{{ admin.storeText(current.storeId) }}</n-descriptions-item>
            <n-descriptions-item label="收银台">{{ current.registerNo }}号</n-descriptions-item>
            <n-descriptions-item label="收银员">{{ admin.who(current.cashierJobNo) }}</n-descriptions-item>
            <n-descriptions-item label="开班"><span class="qs-num">{{ current.openedAt }}</span></n-descriptions-item>
            <n-descriptions-item label="交班"><span class="qs-num">{{ orEmpty(current.closedAt) }}</span></n-descriptions-item>
          </n-descriptions>

          <div class="overflow-hidden rounded-10px border border-line">
            <div class="grid grid-cols-[1fr_100px_100px_100px] bg-subtle px-3 py-2 text-12px font-600 text-t2">
              <span>支付方式</span><span class="text-right">收款</span><span class="text-right">退款</span><span class="text-right">净额</span>
            </div>
            <div v-for="m in methodRows" :key="m.key" class="grid grid-cols-[1fr_100px_100px_100px] items-center border-t border-line px-3 py-2">
              <span class="flex items-center gap-2"><span class="h-8px w-8px rounded-full" :style="{ background: payColors[m.key] }" />{{ m.label }}</span>
              <MoneyText :value="m.sales" class="text-right" />
              <MoneyText :value="m.refunds" class="text-right" :tone="m.refunds ? 'promo' : 'muted'" />
              <MoneyText :value="m.net" class="text-right font-600" />
            </div>
          </div>

          <div class="rounded-12px bg-subtle px-4 py-3">
            <div class="flex justify-between py-1"><span class="text-t2">备用金</span><MoneyText :value="current.float" /></div>
            <div class="flex justify-between py-1"><span class="text-t2">＋ 现金收款</span><MoneyText :value="current.summary?.byMethod.cash.sales" /></div>
            <div class="flex justify-between py-1"><span class="text-t2">− 现金退款</span><MoneyText :value="current.summary?.byMethod.cash.refunds" /></div>
            <div class="flex justify-between border-t border-line-strong py-1.5 font-600"><span>应有现金</span><MoneyText :value="current.summary?.expectedCash" strong /></div>
            <template v-if="current.status === 'closed'">
              <div class="flex justify-between py-1"><span class="text-t2">实点现金</span><MoneyText :value="current.countedCash" strong /></div>
              <div class="flex justify-between py-1">
                <span class="text-t2">差异</span>
                <MoneyText :value="current.cashDiff ?? 0" sign strong :tone="current.cashDiff ? 'bad' : 'muted'" />
              </div>
              <div v-if="current.diffNote" class="mt-1 rounded-8px bg-white px-3 py-2 text-13px">差异说明：{{ current.diffNote }}</div>
            </template>
            <div v-else class="pt-1 text-12px text-t3">当班中，数字随收款实时变化，交班时定格；实点现金在收银端交班时录入</div>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
