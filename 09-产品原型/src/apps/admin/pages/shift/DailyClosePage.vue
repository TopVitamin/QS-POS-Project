<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useDialog, type DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { DUE_STATUS, PAY_METHOD, PAY_METHODS, SHIFT_STATUS, STORE_MODE } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import { useFeedback } from '@/shared/naive/feedback'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { payColors } from '@/shared/theme/tokens'
import type { DailyClose, Shift } from '@/shared/types'
import { formatMoney, orEmpty } from '@/shared/utils/format'
import { addDays, todayBizDate, weekdayOf } from '@/shared/utils/time'
import { bill, clickable, dateTime, money, muted, pagination, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const fb = useFeedback()
const dialog = useDialog()

const storeId = ref<string | null>(admin.scopedStores[0]?.id ?? null)
const picked = ref<string | null>(todayBizDate())
const bizDate = computed(() => picked.value ?? todayBizDate())
watch(
  () => admin.scopedStores,
  (list) => {
    if (!storeId.value && list.length) storeId.value = list[0].id
  },
)

const { data: preview, loading } = useRequest(() => (storeId.value ? api.shift.closePreview(storeId.value, bizDate.value) : Promise.resolve(null)), {
  watch: [storeId, bizDate],
})

const methodRows = computed(() => {
  const m = preview.value?.summary.byMethod
  if (!m) return []
  return PAY_METHODS.map((k) => ({ key: k, label: PAY_METHOD[k].label, ...m[k], net: m[k].sales - m[k].refunds }))
})

const canClose = computed(() => !!storeId.value && admin.has('daily.close') && admin.storeIds.includes(storeId.value))
const isFranchise = computed(() => preview.value?.store.mode === 'franchise')
const busy = ref(false)

function confirmClose() {
  const p = preview.value
  if (!p || !storeId.value || !admin.user) return
  dialog.warning({
    title: `封账 ${p.store.name} ${bizDate.value}`,
    content: () =>
      h('div', { class: 'flex flex-col gap-1.5 text-14px leading-22px' }, [
        h('div', `成交${p.summary.saleCount}笔，退货${p.summary.returnCount}笔，成交净额 ${formatMoney(p.summary.net)}。`),
        h('div', '封账之后，这一营业日的成交不靠修改原单来轧差；需要更正走退货或下一张单据。'),
        isFranchise.value ? h('div', { class: 'text-[#7C4A03]' }, '这是加盟店：封账后由中枢按营业日生成应缴营业款，POS只读。') : null,
      ]),
    positiveText: '确认封账',
    negativeText: '取消',
    onPositiveClick: async () => {
      busy.value = true
      const r = await fb.run(() => api.shift.closeDay({ storeId: storeId.value!, bizDate: bizDate.value, closerJobNo: admin.user!.jobNo }))
      busy.value = false
      if (r) fb.ok(`已封账 ${r.no}`, r.franchiseDueNo ? `中枢已生成应缴营业款 ${r.franchiseDueNo}` : '直营店日结到此为止，营业款在强盛收款主体')
    },
  })
}

// ---------- 封账记录 ----------
const range = ref<[string, string] | null>([addDays(todayBizDate(), -7), todayBizDate()])
const historyFilter = computed(() => ({ storeIds: admin.storeIds, from: range.value?.[0], to: range.value?.[1] }))
const { data: closes, loading: loadingCloses } = useRequest(() => api.shift.closes(historyFilter.value), { watch: [historyFilter] })
const columns: DataTableColumns<DailyClose> = [
  { title: '日结单号', key: 'no', width: 230, fixed: 'left', render: (d) => bill(d.no) },
  { title: '门店', key: 'storeId', width: 170, render: (d) => admin.storeText(d.storeId) },
  { title: '营业日', key: 'bizDate', width: 130, render: (d) => h('span', { class: 'qs-num' }, `${d.bizDate} ${weekdayOf(d.bizDate)}`) },
  { title: '封账', key: 'closedAt', width: 170, render: (d) => two(dateTime(d.closedAt), admin.who(d.closerJobNo)) },
  { title: '班次', key: 'shifts', width: 70, align: 'right', render: (d) => h('span', { class: 'qs-num' }, d.shiftNos.length) },
  { title: '成交/退货', key: 'count', width: 96, align: 'right', render: (d) => h('span', { class: 'qs-num' }, `${d.summary.saleCount} / ${d.summary.returnCount}`) },
  { title: '成交净额', key: 'net', width: 120, align: 'right', render: (d) => money(d.summary.net, { strong: true }) },
  { title: '核销/代客', key: 'fulfil', width: 96, align: 'right', render: (d) => h('span', { class: 'qs-num text-t2' }, `${d.summary.pickupsVerified} / ${d.summary.agentOrders}`) },
  { title: '加盟应缴', key: 'due', width: 230, fixed: 'right', render: (d) => (d.franchiseDueNo ? bill(d.franchiseDueNo) : muted('直营不生成')) },
]
function pick(d: DailyClose) {
  storeId.value = d.storeId
  picked.value = d.bizDate
}

const openShiftNo = ref('')
const currentShift = computed((): Shift | null => preview.value?.shifts.find((s) => s.no === openShiftNo.value) ?? null)
const showShift = computed({
  get: () => !!openShiftNo.value,
  set: (v) => {
    if (!v) openShiftNo.value = ''
  },
})
const shiftMethods = computed(() => {
  const m = currentShift.value?.summary?.byMethod
  if (!m) return []
  return PAY_METHODS.map((k) => ({ key: k, label: PAY_METHOD[k].label, ...m[k], net: m[k].sales - m[k].refunds }))
})
</script>

<template>
  <div>
    <PageHead title="日结">
      <template #desc>营业日封账：检查班次是否都已交班，按支付方式汇总。日结不是凭证，营业款、分成和总账在中枢与金蝶（《3.上下游链路》§五、《4.全局业务规则》§六）</template>
      <template #actions>
        <StoreSelect v-model="storeId" :clearable="false" placeholder="选择门店" />
        <n-date-picker v-model:formatted-value="picked" value-format="yyyy-MM-dd" type="date" class="!w-150px" />
      </template>
    </PageHead>

    <div v-if="!admin.storeIds.length" class="qs-card py-16 text-center text-t3">当前身份没有授权到店，没有可日结的门店</div>

    <template v-else>
      <div v-if="preview" class="grid grid-cols-[1fr_400px] gap-4">
        <div class="flex flex-col gap-4">
          <div
            class="flex items-center gap-4 rounded-14px border px-5 py-4"
            :class="preview.close ? 'border-[#BFE3CF] bg-[#F1FAF4]' : preview.check.ok ? 'border-brand-200 bg-brand-50' : 'border-[#F5D9A8] bg-[#FFFBF2]'"
          >
            <span
              class="qs-flex-center h-44px w-44px shrink-0 rounded-12px text-24px text-white"
              :class="preview.close ? 'bg-ok' : preview.check.ok ? 'bg-brand-600' : 'bg-warn'"
            >
              <span :class="preview.close ? 'i-ph-seal-check-fill' : preview.check.ok ? 'i-ph-calendar-check-fill' : 'i-ph-hourglass-medium-fill'" />
            </span>
            <div class="min-w-0 flex-1 leading-tight">
              <div class="flex items-center gap-2 text-16px font-700">
                {{ preview.store.name }} · {{ bizDate }} {{ weekdayOf(bizDate) }}
                <n-tag size="small" :bordered="false" :type="STORE_MODE[preview.store.mode].tone">{{ STORE_MODE[preview.store.mode].label }}</n-tag>
              </div>
              <div v-if="preview.close" class="mt-1 text-13px text-t2">
                已封账 <BillNo :no="preview.close.no" />，{{ admin.who(preview.close.closerJobNo) }} 于 <span class="qs-num">{{ preview.close.closedAt }}</span>
              </div>
              <div v-else-if="preview.check.ok" class="mt-1 text-13px text-t2">
                班次都已交班，可以封账{{ preview.shifts.length ? '' : '。这一营业日没有班次，封账后成交为0' }}
              </div>
              <div v-else class="mt-1 text-13px text-[#7C4A03]">
                {{ preview.check.message }}<span class="text-t3">　依据：{{ preview.check.basis }}</span>
              </div>
            </div>
            <template v-if="!preview.close">
              <n-button v-if="canClose" type="primary" size="large" :disabled="!preview.check.ok" :loading="busy" @click="confirmClose">
                <template #icon><span class="i-ph-lock-key-fill" /></template>
                确认封账
              </n-button>
              <span v-else class="max-w-180px text-right text-12px text-t3">日结由本店店长执行，例如 QS1001 王海、JMA101 孙浩</span>
            </template>
          </div>

          <div class="grid grid-cols-5 gap-3">
            <div class="qs-card px-4 py-3">
              <div class="text-12px text-t2">成交笔数</div>
              <div class="qs-num text-22px font-700">{{ preview.summary.saleCount }}</div>
            </div>
            <div class="qs-card px-4 py-3">
              <div class="text-12px text-t2">退货笔数</div>
              <div class="qs-num text-22px font-700">{{ preview.summary.returnCount }}</div>
            </div>
            <div class="qs-card px-4 py-3">
              <div class="text-12px text-t2">收款</div>
              <MoneyText :value="preview.summary.gross" class="text-20px font-700" />
            </div>
            <div class="qs-card px-4 py-3">
              <div class="text-12px text-t2">退款</div>
              <MoneyText :value="preview.summary.refunds" class="text-20px font-700" :tone="preview.summary.refunds ? 'promo' : 'default'" />
            </div>
            <div class="rounded-14px bg-ink-900 px-4 py-3 text-white shadow-card">
              <div class="text-12px text-white/65">成交净额</div>
              <MoneyText :value="preview.summary.net" class="text-20px font-700 text-volt-400" />
            </div>
          </div>

          <div class="qs-card overflow-hidden">
            <div class="flex items-center justify-between px-4 pt-3 text-15px font-600">
              按支付方式
              <span class="text-12px font-400 text-t3">只汇总通道已成功的收款和退款</span>
            </div>
            <div class="mt-2 grid grid-cols-[1fr_130px_130px_130px] bg-subtle px-4 py-2 text-12px font-600 text-t2">
              <span>支付方式</span><span class="text-right">收款</span><span class="text-right">退款</span><span class="text-right">净额</span>
            </div>
            <div v-for="m in methodRows" :key="m.key" class="grid grid-cols-[1fr_130px_130px_130px] items-center border-t border-line px-4 py-2.5">
              <span class="flex items-center gap-2"><span class="h-8px w-8px rounded-full" :style="{ background: payColors[m.key] }" />{{ m.label }}</span>
              <MoneyText :value="m.sales" class="text-right" />
              <MoneyText :value="m.refunds" class="text-right" :tone="m.refunds ? 'promo' : 'muted'" />
              <MoneyText :value="m.net" class="text-right font-600" />
            </div>
            <div class="border-t border-line px-4 py-2.5 text-13px text-t2">
              自提核销 <b class="qs-num text-t1">{{ preview.summary.pickupsVerified }}</b> 单、代客单 <b class="qs-num text-t1">{{ preview.summary.agentOrders }}</b> 单，只计件数，不进成交净额
              <PendingTag id="待确认-14" />
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <div class="qs-card px-4 py-3">
            <div class="mb-2 text-15px font-600">当日班次 {{ preview.shifts.length }}</div>
            <div
              v-for="s in preview.shifts"
              :key="s.no"
              class="flex cursor-pointer items-center gap-3 border-t border-line py-2.5 first:border-0 hover:bg-subtle"
              @click="openShiftNo = s.no"
            >
              <div class="min-w-0 flex-1 leading-tight">
                <div class="flex items-center gap-2"><BillNo :no="s.no" plain /> <StatusTag :def="SHIFT_STATUS[s.status]" /></div>
                <div class="mt-0.5 text-12px text-t3">{{ s.registerNo }}号台 · {{ admin.who(s.cashierJobNo) }} · <span class="qs-num">{{ s.openedAt.slice(11, 16) }}–{{ s.closedAt?.slice(11, 16) ?? '' }}</span></div>
              </div>
              <div class="text-right leading-tight">
                <MoneyText :value="s.summary?.expectedCash" class="text-13px" />
                <div class="text-12px" :class="s.status === 'open' ? 'text-info' : s.cashDiff ? 'text-bad' : 'text-t3'">
                  {{ s.status === 'open' ? '应有现金·未交班' : s.cashDiff ? `应有现金·差异 ${formatMoney(s.cashDiff, { sign: true })}` : '应有现金·无差异' }}
                </div>
              </div>
            </div>
            <div v-if="!preview.shifts.length" class="py-4 text-center text-13px text-t3">这一营业日没有开过班</div>
            <a v-if="preview.check.openShifts.length" href="./cashier.html" target="_blank" class="mt-1 block text-13px text-brand-700 hover:underline">去收银端交班</a>
          </div>

          <div v-if="isFranchise" class="qs-card px-4 py-3">
            <div class="mb-2 flex items-center justify-between text-15px font-600">
              加盟应缴营业款
              <StatusTag v-if="preview.due" :def="DUE_STATUS[preview.due.status]" />
            </div>
            <template v-if="preview.due">
              <div class="flex items-center justify-between text-13px"><BillNo :no="preview.due.no" /><MoneyText :value="preview.due.total" class="text-18px font-700" /></div>
              <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-13px">
                <div v-for="k in PAY_METHODS" :key="k" class="flex justify-between">
                  <span class="text-t2">{{ PAY_METHOD[k].short }}</span><MoneyText :value="preview.due.byMethod[k]" />
                </div>
              </div>
              <router-link v-if="admin.has('dues.view')" :to="{ name: 'dues' }" class="mt-2 block text-13px text-brand-700 hover:underline">到「应缴营业款」查看</router-link>
            </template>
            <div v-else class="text-13px leading-20px text-t2">封账后由中枢按营业日生成，按支付方式分开；只含本店向顾客收的钱，不含线上已付款、只到店核销的订单（《4.全局业务规则》§六）</div>
            <div class="mt-2 border-t border-line pt-2 text-12px text-t3">POS不在日结界面扣分成 <PendingTag :id="['待确认-17', '待确认-18']" /></div>
          </div>

          <Hint>
            执行人和前置条件 <AssumptionTag k="dailyCloser" /><br />
            切日时点 <AssumptionTag k="bizDay" />；重开已封账的日结原型不开放
          </Hint>
        </div>
      </div>
      <div v-else-if="loading" class="py-16 text-center"><n-spin /></div>

      <div class="mt-6 mb-3 flex items-center justify-between">
        <div class="text-16px font-700">封账记录</div>
        <n-date-picker v-model:formatted-value="range" value-format="yyyy-MM-dd" type="daterange" clearable class="!w-260px" />
      </div>
      <div class="qs-card overflow-hidden">
        <n-data-table
          :columns="columns"
          :data="closes ?? []"
          :loading="loadingCloses && !closes"
          :pagination="pagination"
          :row-key="(d: DailyClose) => d.no"
          :row-props="clickable(pick)"
          :scroll-x="1350"
          :bordered="false"
        />
      </div>
      <div class="mt-2 text-12px text-t3">点一行，上方切到那家店那一天；点当日班次打开交班明细</div>
    </template>

    <n-drawer v-model:show="showShift" :width="560">
      <n-drawer-content v-if="currentShift" closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">班次 <BillNo :no="currentShift.no" /> <StatusTag :def="SHIFT_STATUS[currentShift.status]" /></span>
        </template>
        <div class="flex flex-col gap-4 text-14px">
          <n-descriptions :column="2" label-placement="left" size="small" bordered>
            <n-descriptions-item label="门店" :span="2">{{ admin.storeText(currentShift.storeId) }}</n-descriptions-item>
            <n-descriptions-item label="收银台">{{ currentShift.registerNo }}号</n-descriptions-item>
            <n-descriptions-item label="收银员">{{ admin.who(currentShift.cashierJobNo) }}</n-descriptions-item>
            <n-descriptions-item label="开班"><span class="qs-num">{{ currentShift.openedAt }}</span></n-descriptions-item>
            <n-descriptions-item label="交班"><span class="qs-num">{{ orEmpty(currentShift.closedAt) }}</span></n-descriptions-item>
          </n-descriptions>
          <div class="overflow-hidden rounded-10px border border-line">
            <div class="grid grid-cols-[1fr_100px_100px_100px] bg-subtle px-3 py-2 text-12px font-600 text-t2">
              <span>支付方式</span><span class="text-right">收款</span><span class="text-right">退款</span><span class="text-right">净额</span>
            </div>
            <div v-for="m in shiftMethods" :key="m.key" class="grid grid-cols-[1fr_100px_100px_100px] items-center border-t border-line px-3 py-2">
              <span class="flex items-center gap-2"><span class="h-8px w-8px rounded-full" :style="{ background: payColors[m.key] }" />{{ m.label }}</span>
              <MoneyText :value="m.sales" class="text-right" />
              <MoneyText :value="m.refunds" class="text-right" :tone="m.refunds ? 'promo' : 'muted'" />
              <MoneyText :value="m.net" class="text-right font-600" />
            </div>
          </div>
          <div class="rounded-12px bg-subtle px-4 py-3">
            <div class="flex justify-between py-1"><span class="text-t2">备用金</span><MoneyText :value="currentShift.float" /></div>
            <div class="flex justify-between py-1"><span class="text-t2">＋ 现金收款</span><MoneyText :value="currentShift.summary?.byMethod.cash.sales" /></div>
            <div class="flex justify-between py-1"><span class="text-t2">− 现金退款</span><MoneyText :value="currentShift.summary?.byMethod.cash.refunds" /></div>
            <div class="flex justify-between border-t border-line-strong py-1.5 font-600"><span>应有现金</span><MoneyText :value="currentShift.summary?.expectedCash" strong /></div>
            <template v-if="currentShift.status === 'closed'">
              <div class="flex justify-between py-1"><span class="text-t2">实点现金</span><MoneyText :value="currentShift.countedCash" strong /></div>
              <div class="flex justify-between py-1">
                <span class="text-t2">差异</span>
                <MoneyText :value="currentShift.cashDiff ?? 0" sign strong :tone="currentShift.cashDiff ? 'bad' : 'muted'" />
              </div>
              <div v-if="currentShift.diffNote" class="mt-1 rounded-8px bg-white px-3 py-2 text-13px">差异说明：{{ currentShift.diffNote }}</div>
            </template>
            <div v-else class="pt-1 text-12px text-t3">当班中，数字随收款实时变化；实点现金在收银端交班时录入</div>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
