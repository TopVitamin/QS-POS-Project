<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { errorInfo, useRequest } from '@/shared/composables/useRequest'
import { PAY_METHOD, RETURN_REASONS, SALE_STATUS } from '@/shared/config/labels'
import { allocateRefund, refundForLine } from '@/shared/domain/refund'
import { BASIS } from '@/shared/domain/rules'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { useFeedback } from '@/shared/naive/feedback'
import { payColors } from '@/shared/theme/tokens'
import type { ReturnOrder, SaleLine, Store } from '@/shared/types'
import { formatMoney } from '@/shared/utils/format'
import { addDays, timeOf, todayBizDate } from '@/shared/utils/time'
import { useSession } from '../stores/session'

const props = defineProps<{ store: Store }>()
const session = useSession()
const fb = useFeedback()

const range = ref<'today' | 'week'>('today')
const { data: sales } = useRequest(
  () => api.sales.list({ storeIds: [props.store.id], from: range.value === 'today' ? todayBizDate() : addDays(todayBizDate(), -6), to: todayBizDate() }),
  { watch: [range] },
)

const input = ref('')
const saleNo = ref('')
const busy = ref(false)
const done = ref<ReturnOrder | null>(null)
const { data: detail, error } = useRequest(() => (saleNo.value ? api.sales.get(saleNo.value) : Promise.resolve(null)), { watch: [saleNo] })
const sale = computed(() => detail.value?.sale)
const crossStore = computed(() => !!sale.value && sale.value.storeId !== props.store.id)

function open(no: string) {
  input.value = no
  saleNo.value = no
  done.value = null
}

const qtys = ref<Record<number, number>>({})
const pickedSns = ref<Record<number, string[]>>({})
const reason = ref('')
watch(saleNo, () => {
  qtys.value = {}
  pickedSns.value = {}
  reason.value = ''
})

const remainingOf = (l: SaleLine) => l.qty - l.returnedQty
const availableSns = (l: SaleLine) => l.sns.slice(l.returnedQty)
const qtyOf = (l: SaleLine) => (l.sns.length ? (pickedSns.value[l.lineNo]?.length ?? 0) : (qtys.value[l.lineNo] ?? 0))

function setQty(l: SaleLine, q: number) {
  qtys.value = { ...qtys.value, [l.lineNo]: Math.max(0, Math.min(remainingOf(l), q)) }
}
function toggleSn(l: SaleLine, sn: string) {
  const cur = pickedSns.value[l.lineNo] ?? []
  pickedSns.value = { ...pickedSns.value, [l.lineNo]: cur.includes(sn) ? cur.filter((x) => x !== sn) : [...cur, sn] }
}
function all(l: SaleLine) {
  if (l.sns.length) pickedSns.value = { ...pickedSns.value, [l.lineNo]: availableSns(l) }
  else setQty(l, remainingOf(l))
}

const preview = computed(() => {
  if (!sale.value) return null
  const lines = sale.value.lines.filter((l) => qtyOf(l) > 0).map((l) => ({ line: l, qty: qtyOf(l), refund: refundForLine(l, qtyOf(l)) }))
  const total = lines.reduce((s, l) => s + l.refund, 0)
  return { lines, total, alloc: total > 0 ? allocateRefund(sale.value.payments, total) : [] }
})

async function submit() {
  if (!session.user || !session.shiftNo || !sale.value || !preview.value?.lines.length) return
  busy.value = true
  try {
    done.value = await api.sales.createReturn({
      storeId: props.store.id,
      registerNo: session.registerNo,
      shiftNo: session.shiftNo,
      operatorJobNo: session.user.jobNo,
      saleNo: sale.value.no,
      reason: reason.value,
      lines: preview.value.lines.map((l) => ({ lineNo: l.line.lineNo, qty: l.qty, sns: l.line.sns.length ? pickedSns.value[l.line.lineNo] : [] })),
    })
    qtys.value = {}
    pickedSns.value = {}
    reason.value = ''
  } catch (e) {
    fb.fail(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex h-full gap-4 p-4">
    <section class="qs-card flex w-390px shrink-0 flex-col overflow-hidden">
      <div class="border-b border-line p-4">
        <div class="mb-2 text-17px font-700">找原销售单</div>
        <div class="flex gap-2">
          <n-input v-model:value="input" size="large" placeholder="输入销售单号" clearable @keyup.enter="open(input.trim())">
            <template #prefix><span class="i-ph-receipt-bold mr-1 text-t3" /></template>
          </n-input>
          <n-button type="primary" size="large" :disabled="!input.trim()" @click="open(input.trim())">查找</n-button>
        </div>
        <div class="mt-2 flex items-center justify-between text-12px text-t3">
          <span>无原单退货要另行授权，原型不开放 <PendingTag id="待确认-51" /></span>
        </div>
      </div>
      <div class="flex items-center justify-between px-4 pt-3">
        <span class="text-14px font-600 text-t2">本店销售单</span>
        <n-radio-group v-model:value="range" size="small">
          <n-radio-button value="today">今日</n-radio-button>
          <n-radio-button value="week">近7天</n-radio-button>
        </n-radio-group>
      </div>
      <div class="qs-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <button
          v-for="s in sales ?? []"
          :key="s.no"
          type="button"
          class="pos-press mb-1.5 flex w-full items-center gap-3 rounded-12px border px-3 py-2.5 text-left"
          :class="saleNo === s.no ? 'border-brand-600 bg-brand-50' : 'border-transparent hover:bg-subtle'"
          @click="open(s.no)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2"><span class="font-mono text-13px">{{ s.no }}</span></div>
            <div class="mt-0.5 truncate text-12px text-t3">
              {{ range === 'today' ? timeOf(s.createdAt) : s.createdAt.slice(5, 16) }} · {{ s.lines.map((l) => l.name).join('、') }}
            </div>
          </div>
          <div class="text-right">
            <MoneyText :value="s.totals.payable" class="text-15px font-600" />
            <div v-if="s.status !== 'paid'"><StatusTag :def="SALE_STATUS[s.status]" /></div>
          </div>
        </button>
        <div v-if="sales && !sales.length" class="py-10 text-center text-14px text-t3">没有销售单</div>
      </div>
    </section>

    <section class="qs-card flex min-w-0 flex-1 flex-col overflow-hidden">
      <div v-if="done" class="flex flex-1 flex-col items-center justify-center gap-4 px-10">
        <div class="qs-flex-center h-80px w-80px rounded-24px bg-ok text-white shadow-card"><span class="i-ph-arrow-u-up-left-bold text-44px" /></div>
        <div class="text-26px font-700">退货完成，已按原支付方式退款</div>
        <div class="flex items-center gap-2 text-15px"><span class="text-t3">退货单</span><BillNo :no="done.no" /><span class="text-t3">引用原单</span><BillNo :no="done.originalSaleNo" plain /></div>
        <div class="flex flex-wrap justify-center gap-2.5">
          <div v-for="r in done.refunds" :key="r.id" class="flex items-center gap-2 rounded-12px bg-subtle px-4 py-2">
            <span class="qs-flex-center h-28px w-28px rounded-8px text-15px text-white" :style="{ background: payColors[r.method] }"><span :class="PAY_METHOD[r.method].icon" /></span>
            <span class="text-15px">{{ PAY_METHOD[r.method].label }}退回</span>
            <MoneyText :value="r.amount" class="text-17px font-700" />
          </div>
        </div>
        <div class="max-w-600px text-center text-13px leading-21px text-t3">
          退货单已回传，中枢把商品退回{{ store.warehouse.name }}。中枢结果单号 <BillNo :no="done.hubSync.resultNo" />。日结封账后的更正也走退货，不改已封账的原单。
        </div>
        <n-button size="large" type="primary" @click="done = null">继续</n-button>
      </div>

      <template v-else-if="sale && crossStore">
        <div class="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
          <span class="i-ph-storefront-duotone text-72px text-warn" />
          <div class="text-22px font-700">这张单不是本店卖出的</div>
          <div class="text-15px text-t2">跨店退原型不开放，请顾客回原门店办理</div>
          <div class="flex items-center gap-1 text-13px text-t3">依据：{{ BASIS.crossStore }} <PendingTag id="待确认-27" /></div>
        </div>
      </template>

      <template v-else-if="sale">
        <div class="flex items-center gap-4 border-b border-line px-5 py-3.5">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-16px font-700"><BillNo :no="sale.no" /> <StatusTag :def="SALE_STATUS[sale.status]" /></div>
            <div class="mt-0.5 text-12px text-t3">
              {{ sale.createdAt }} · 收银 {{ sale.cashierJobNo }} ·
              <span v-for="(p, i) in sale.payments" :key="p.id">{{ i ? '、' : '' }}{{ PAY_METHOD[p.method].short }} {{ formatMoney(p.amount) }}<template v-if="p.refunded">（已退{{ formatMoney(p.refunded) }}）</template></span>
            </div>
          </div>
          <div class="text-right">
            <div class="text-12px text-t3">原单实付</div>
            <MoneyText :value="sale.totals.payable" class="text-20px font-700" />
          </div>
        </div>
        <div v-if="sale.dailyCloseNo" class="flex items-center gap-2 bg-[#EAF1FE] px-5 py-2 text-13px text-[#1E40AF]">
          <span class="i-ph-lock-simple-fill" />这一营业日已经日结封账：退货另生成退货单记在今天，不改原单
        </div>

        <div class="qs-scroll min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div v-for="l in sale.lines" :key="l.lineNo" class="flex items-start gap-4 border-b border-line py-3 last:border-0" :class="remainingOf(l) ? '' : 'opacity-50'">
            <div class="min-w-0 flex-1">
              <div class="text-15px font-600">{{ l.name }} <span class="text-13px font-400 text-t3">{{ l.spec }}</span></div>
              <div class="mt-0.5 text-12px text-t3">
                购买 {{ l.qty }} · 已退 {{ l.returnedQty }} · 行实付 {{ formatMoney(l.payable) }}<template v-if="l.refundedAmount"> · 已退款 {{ formatMoney(l.refundedAmount) }}</template>
              </div>
              <div v-if="l.sns.length && remainingOf(l)" class="mt-2 flex flex-wrap gap-1.5">
                <button
                  v-for="sn in availableSns(l)"
                  :key="sn"
                  type="button"
                  class="pos-press rounded-8px border-2 px-2 py-1 font-mono text-12px"
                  :class="pickedSns[l.lineNo]?.includes(sn) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line bg-white text-t2'"
                  @click="toggleSn(l, sn)"
                >
                  <span :class="pickedSns[l.lineNo]?.includes(sn) ? 'i-ph-check-square-fill' : 'i-ph-square-bold'" class="mr-1" />{{ sn }}
                </button>
                <span class="self-center text-11px text-t3">按序列号逐件退 <PendingTag id="待确认-11" /></span>
              </div>
            </div>
            <template v-if="remainingOf(l)">
              <div v-if="!l.sns.length" class="flex items-center gap-1">
                <button type="button" class="pos-press qs-flex-center h-40px w-40px rounded-10px bg-subtle text-18px" @click="setQty(l, qtyOf(l) - 1)"><span class="i-ph-minus-bold" /></button>
                <span class="qs-num w-40px text-center text-20px font-700">{{ qtyOf(l) }}</span>
                <button type="button" class="pos-press qs-flex-center h-40px w-40px rounded-10px bg-subtle text-18px" @click="setQty(l, qtyOf(l) + 1)"><span class="i-ph-plus-bold" /></button>
              </div>
              <div v-else class="qs-num w-132px text-center text-14px text-t2">退 <span class="text-20px font-700 text-t1">{{ qtyOf(l) }}</span> 件</div>
              <n-button size="small" quaternary type="primary" @click="all(l)">全退</n-button>
              <div class="w-96px text-right">
                <div class="text-11px text-t3">应退</div>
                <MoneyText :value="qtyOf(l) ? refundForLine(l, qtyOf(l)) : 0" class="text-16px font-700" :tone="qtyOf(l) ? 'default' : 'muted'" />
              </div>
            </template>
            <span v-else class="self-center text-13px text-t3">已退完</span>
          </div>
        </div>

        <div class="border-t border-line bg-subtle px-5 py-3">
          <div class="flex items-center gap-2">
            <span class="w-64px text-14px font-600">退货原因</span>
            <button
              v-for="r in RETURN_REASONS"
              :key="r"
              type="button"
              class="pos-press rounded-10px border-2 px-3.5 py-1.5 text-14px"
              :class="reason === r ? 'border-brand-600 bg-brand-50 font-600 text-brand-700' : 'border-line bg-white'"
              @click="reason = r"
            >
              {{ r }}
            </button>
            <span v-if="reason === '质量问题'" class="text-12px text-t3">期限不校验 <PendingTag id="待确认-30" /></span>
          </div>
          <div class="mt-3 flex items-center gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-14px">
                <span class="text-t3">原路退回</span>
                <span v-for="a in preview?.alloc ?? []" :key="a.paymentId" class="flex items-center gap-1">
                  <span class="h-8px w-8px rounded-full" :style="{ background: payColors[a.method] }" />{{ PAY_METHOD[a.method].short }} <MoneyText :value="a.amount" strong />
                </span>
                <span v-if="!preview?.alloc.length" class="text-t3">选好要退的行和数量</span>
              </div>
              <div class="mt-1 flex items-center gap-1.5 text-12px text-t3">
                按行实付比例算应退 <AssumptionTag k="partialRefund" /> 组合支付倒序退 <AssumptionTag k="refundOrder" />
              </div>
            </div>
            <div class="text-right">
              <div class="text-12px text-t3">应退合计</div>
              <div class="qs-num text-32px font-700 leading-none">{{ formatMoney(preview?.total ?? 0) }}</div>
            </div>
            <button
              type="button"
              class="pos-press flex h-60px w-220px items-center justify-center gap-2 rounded-14px bg-brand-600 text-19px font-700 text-white shadow-card hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-[#A7B3B1]"
              :disabled="busy || !preview?.lines.length || !reason"
              @click="submit"
            >
              <span class="i-ph-arrow-u-up-left-bold" />确认退货退款
            </button>
          </div>
        </div>
      </template>

      <div v-else-if="error" class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <span class="i-ph-magnifying-glass-duotone text-64px text-line-strong" />
        <div class="text-17px font-600">{{ errorInfo(error).message }}</div>
        <div class="text-13px text-t3">请核对单号，或在左侧列表里选</div>
      </div>

      <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
        <span class="i-ph-arrow-u-up-left-duotone text-72px text-brand-300" />
        <div class="text-20px font-700">按原销售单退货</div>
        <div class="max-w-520px text-14px leading-22px text-t2">
          选行和数量，按行实付算应退，按原支付方式原路退款。退货单引用原单，商品回到本店{{ store.warehouse.kind === 'micro' ? '微仓' : '代销仓' }}。换货用退货单加新销售单表达。
        </div>
        <div class="text-12px text-t3">线上订单到店退由中枢按原渠道退款，原型未做 <PendingTag id="待确认-07" /></div>
      </div>
    </section>
  </div>
</template>
