<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { errorInfo, useRequest } from '@/shared/composables/useRequest'
import { PAY_METHOD, PAY_METHODS, PAYMENT_STATUS } from '@/shared/config/labels'
import type { PayOutcome } from '@/shared/mock/schema'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { useFeedback } from '@/shared/naive/feedback'
import { payColors } from '@/shared/theme/tokens'
import type { PayMethod, Store } from '@/shared/types'
import { formatMoney, moneyDigits, yuanToCents } from '@/shared/utils/format'
import { timeOf } from '@/shared/utils/time'
import NumPad from '../components/NumPad.vue'
import { useCart } from '../stores/cart'
import { useSession } from '../stores/session'

const props = defineProps<{ store: Store }>()
const session = useSession()
const cart = useCart()
const router = useRouter()
const fb = useFeedback()

if (!cart.s.checkoutId) router.replace({ name: 'sale' })

const { data: open } = useRequest(() => api.sales.openCheckouts(props.store.id, session.registerNo))
const checkout = computed(() => open.value?.find((c) => c.id === cart.s.checkoutId))
let leaving = false
watch(checkout, (c) => {
  // 结算在别处被撤销或交班清理了，回到开单页
  if (!leaving && open.value && !c) {
    cart.setCheckout(null)
    router.replace({ name: 'sale' })
  }
})
const { data: sim } = useRequest(() => api.hubsim.sim())
const { data: products } = useRequest(() => api.master.products(), { live: false })
const { data: promotions } = useRequest(() => api.master.promotions(), { live: false })
const { data: templates } = useRequest(() => api.master.couponTemplates(), { live: false })

const draft = computed(() =>
  cart.toDraft({ storeId: props.store.id, registerNo: session.registerNo, shiftNo: session.shiftNo ?? '', cashierJobNo: session.user?.jobNo ?? '' }),
)
const pricing = computed(() => {
  if (!products.value || !promotions.value || !templates.value) return null
  return api.sales.priceDraft(
    { products: products.value, promotions: promotions.value, members: cart.s.member ? [cart.s.member] : [], couponTemplates: templates.value },
    draft.value,
  )
})
const productOf = (sku: string) => products.value?.find((p) => p.sku === sku)

const payable = computed(() => checkout.value?.payable ?? 0)
const paid = computed(() => (checkout.value?.payments ?? []).filter((p) => p.status === 'success').reduce((s, p) => s + p.amount, 0))
const remaining = computed(() => payable.value - paid.value)
const pending = computed(() => checkout.value?.payments.find((p) => p.status === 'pending'))
const lastChange = computed(() => [...(checkout.value?.payments ?? [])].reverse().find((p) => p.method === 'cash')?.change ?? 0)

const method = ref<PayMethod>('wechat')
const amountText = ref('')
const resetAmount = () => (amountText.value = remaining.value > 0 ? moneyDigits(remaining.value).replace(/,/g, '') : '')
watch([remaining, method], resetAmount, { immediate: true })

const amount = computed(() => yuanToCents(amountText.value))
const cashApplied = computed(() => Math.min(amount.value ?? 0, remaining.value))
const change = computed(() => (method.value === 'cash' && amount.value ? Math.max(0, amount.value - remaining.value) : 0))
const amountError = computed(() => {
  if (!amount.value || amount.value <= 0) return '请输入金额'
  if (method.value !== 'cash' && amount.value > remaining.value) return '非现金不能超过待收金额'
  return ''
})

const busy = ref(false)
const completeError = ref<{ message: string; basis?: string } | null>(null)

async function setOutcome(o: PayOutcome) {
  await api.hubsim.setNextPayResult(o)
}

async function complete() {
  if (!checkout.value) return
  try {
    const sale = await api.sales.completeCheckout({ checkoutId: checkout.value.id, draft: draft.value })
    leaving = true
    cart.clear()
    router.replace({ name: 'done', params: { no: sale.no } })
  } catch (e) {
    completeError.value = errorInfo(e)
  }
}

async function collect() {
  if (!checkout.value || amountError.value || !session.user) return
  busy.value = true
  try {
    const cash = method.value === 'cash'
    const r = await api.sales.pay({
      checkoutId: checkout.value.id,
      method: method.value,
      amount: cash ? cashApplied.value : amount.value!,
      tendered: cash ? amount.value! : undefined,
      operatorJobNo: session.user.jobNo,
    })
    if (r.payment.status === 'failed') fb.fail(new Error(`${PAY_METHOD[r.payment.method].label}支付失败，请换一种方式或重试`))
    else if (r.payment.status === 'pending') fb.message.warning('通道结果不明，只能查单，不能手工改成成功')
    const okPaid = r.checkout.payments.filter((p) => p.status === 'success').reduce((s, p) => s + p.amount, 0)
    if (okPaid === r.checkout.payable) await complete()
  } catch (e) {
    fb.fail(e)
  } finally {
    busy.value = false
  }
}

async function queryPending() {
  if (!checkout.value || !pending.value || !session.user) return
  busy.value = true
  try {
    const r = await api.sales.queryPayment({ checkoutId: checkout.value.id, paymentId: pending.value.id, operatorJobNo: session.user.jobNo })
    fb.ok('查单完成', `通道返回成功，流水号 ${r.payment.channelTxnNo}`)
    const okPaid = r.checkout.payments.filter((p) => p.status === 'success').reduce((s, p) => s + p.amount, 0)
    if (okPaid === r.checkout.payable) await complete()
  } catch (e) {
    fb.fail(e)
  } finally {
    busy.value = false
  }
}

const CANCEL_REASONS = ['顾客不要了', '金额输错', '商品要改', '其他']
const showCancel = ref(false)
const cancelReason = ref(CANCEL_REASONS[0])

async function doCancel(reason: string) {
  if (!checkout.value || !session.user) return
  const hadPaid = paid.value > 0
  busy.value = true
  try {
    await api.sales.cancelCheckout({ checkoutId: checkout.value.id, operatorJobNo: session.user.jobNo, reason })
    leaving = true
    cart.setCheckout(null)
    if (hadPaid) fb.ok('已撤销收款', '已经成功的支付按原路退回，并留下操作日志')
    showCancel.value = false
    router.replace({ name: 'sale' })
  } catch (e) {
    fb.fail(e)
  } finally {
    busy.value = false
  }
}

function cancel() {
  if (paid.value > 0) showCancel.value = true
  else doCancel('返回修改购物车')
}

const outcomes: { v: PayOutcome; label: string; cls: string }[] = [
  { v: 'success', label: '成功', cls: 'bg-ok text-white' },
  { v: 'pending', label: '结果不明', cls: 'bg-warn text-white' },
  { v: 'failed', label: '失败', cls: 'bg-bad text-white' },
]
</script>

<template>
  <div class="flex h-full gap-4 p-4">
    <section class="qs-card flex w-340px shrink-0 flex-col overflow-hidden">
      <div class="flex items-center justify-between border-b border-line px-5 py-3.5">
        <div class="text-17px font-700">本单商品</div>
        <span class="text-13px text-t3">{{ cart.count }}件 · 导购 {{ cart.s.guideJobNo }}</span>
      </div>
      <div class="qs-scroll min-h-0 flex-1 overflow-y-auto px-5">
        <div v-for="l in pricing?.lines ?? []" :key="l.lineNo" class="flex items-start justify-between gap-3 border-b border-line py-3 last:border-0">
          <div class="min-w-0">
            <div class="truncate text-15px font-600">{{ productOf(cart.lines.find((x) => x.lineNo === l.lineNo)?.sku ?? '')?.name }}</div>
            <div class="text-12px text-t3">× {{ cart.lines.find((x) => x.lineNo === l.lineNo)?.qty }}</div>
          </div>
          <div class="text-right">
            <MoneyText :value="l.payable" class="text-16px font-600" />
            <div v-if="l.payable !== l.listAmount" class="qs-num text-12px text-t3 line-through">{{ formatMoney(l.listAmount) }}</div>
          </div>
        </div>
      </div>
      <div class="border-t border-line bg-subtle px-5 py-3 text-14px text-t2">
        <div class="flex justify-between"><span>原价合计</span><MoneyText :value="pricing?.totals.list" /></div>
        <div v-for="p in pricing?.promotions ?? []" :key="p.promotionId" class="flex justify-between gap-3">
          <span class="truncate">{{ p.name }}</span><MoneyText :value="p.discount" discount />
        </div>
        <div v-if="pricing?.totals.manual" class="flex justify-between"><span>改价（已授权）</span><MoneyText :value="pricing.totals.manual" discount /></div>
      </div>
    </section>

    <section class="flex min-w-0 flex-1 flex-col gap-4">
      <div class="grid grid-cols-3 gap-4">
        <div class="qs-card px-5 py-4">
          <div class="text-14px text-t3">应收</div>
          <div class="qs-num mt-1 text-34px font-700 leading-none">{{ formatMoney(payable) }}</div>
        </div>
        <div class="qs-card px-5 py-4">
          <div class="text-14px text-t3">已收</div>
          <div class="qs-num mt-1 text-34px font-700 leading-none text-ok">{{ formatMoney(paid) }}</div>
        </div>
        <div class="rounded-14px bg-ink-900 px-5 py-4 text-white shadow-card">
          <div class="text-14px text-white/60">待收</div>
          <div class="qs-num mt-1 text-40px font-700 leading-none text-volt-400">{{ formatMoney(remaining) }}</div>
        </div>
      </div>

      <div v-if="completeError" class="flex items-start gap-3 rounded-14px border border-bad/30 bg-[#FDECEC] px-5 py-4">
        <span class="i-ph-warning-octagon-fill mt-0.5 text-28px text-bad" />
        <div class="flex-1">
          <div class="text-18px font-700 text-bad">没有生成销售单：{{ completeError.message }}</div>
          <div class="mt-1 text-13px text-t2">{{ completeError.basis }}</div>
          <div class="mt-1 text-13px text-t2">已经收到的款不能留在店里，请撤销收款，按原路退回给顾客。</div>
        </div>
        <n-button type="error" size="large" @click="cancel">撤销收款</n-button>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-[1fr_360px] gap-4">
        <div class="flex min-h-0 flex-col gap-4">
          <div class="qs-card p-4">
            <div class="mb-3 text-15px font-600">支付方式 <span class="ml-1 text-13px font-400 text-t3">可组合支付，一笔一笔收</span></div>
            <div class="grid grid-cols-3 gap-3">
              <button
                v-for="m in PAY_METHODS"
                :key="m"
                type="button"
                class="pos-press flex h-72px items-center gap-2.5 rounded-14px border-2 px-3 text-left disabled:opacity-50"
                :class="method === m ? 'border-brand-600 bg-brand-50' : 'border-line bg-white hover:border-brand-300'"
                :disabled="!!pending || remaining <= 0"
                @click="method = m"
              >
                <span class="qs-flex-center h-40px w-40px shrink-0 rounded-12px text-22px text-white" :style="{ background: payColors[m] }">
                  <span :class="PAY_METHOD[m].icon" />
                </span>
                <span class="whitespace-nowrap text-16px font-600">{{ PAY_METHOD[m].label }}</span>
              </button>
              <div class="flex h-72px items-center gap-2.5 rounded-14px border-2 border-dashed border-line bg-subtle px-3 text-t3">
                <span class="i-ph-wallet-fill text-24px" />
                <span class="leading-tight"><span class="block text-15px font-600">储值卡</span><PendingTag id="待确认-21" /></span>
              </div>
              <div class="flex h-72px items-center gap-2.5 rounded-14px border-2 border-dashed border-line bg-subtle px-3 text-t3">
                <span class="i-ph-coins-fill text-24px" />
                <span class="leading-tight"><span class="block text-15px font-600">积分抵扣</span><PendingTag id="待确认-54" /></span>
              </div>
            </div>
            <div class="mt-3 flex items-center gap-3 rounded-12px bg-subtle px-3 py-2">
              <span class="i-ph-flask-fill text-t3" />
              <span class="text-13px text-t2">演示：下一笔非现金支付的通道结果</span>
              <div class="ml-auto flex gap-1.5">
                <button
                  v-for="o in outcomes"
                  :key="o.v"
                  type="button"
                  class="pos-press whitespace-nowrap rounded-8px px-3 py-1.5 text-13px font-600"
                  :class="sim?.nextPayResult === o.v ? o.cls : 'bg-white text-t2'"
                  @click="setOutcome(o.v)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>
          </div>

          <div class="qs-card flex min-h-0 flex-1 flex-col p-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-15px font-600">本单支付流水</span>
              <span class="text-12px text-t3">以通道结果为准，通道流水号原样保存</span>
            </div>
            <div class="qs-scroll min-h-0 flex-1 overflow-y-auto">
              <div v-for="p in checkout?.payments ?? []" :key="p.id" class="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                <span class="qs-flex-center h-34px w-34px rounded-10px text-18px text-white" :style="{ background: payColors[p.method] }"><span :class="PAY_METHOD[p.method].icon" /></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 text-15px font-600">
                    {{ PAY_METHOD[p.method].label }} <StatusTag :def="PAYMENT_STATUS[p.status]" />
                    <span v-if="p.queriedAt" class="text-12px font-400 text-t3">查单确认</span>
                  </div>
                  <div class="truncate font-mono text-12px text-t3">
                    {{ timeOf(p.createdAt) }} · {{ p.channelTxnNo ?? (p.method === 'cash' ? `实收${formatMoney(p.tendered)} 找零${formatMoney(p.change)}` : '通道未返回流水号') }}
                  </div>
                </div>
                <MoneyText :value="p.amount" class="text-17px font-700" :tone="p.status === 'failed' ? 'muted' : 'default'" />
                <n-button v-if="p.status === 'pending'" type="warning" size="large" :loading="busy" @click="queryPending">查单</n-button>
              </div>
              <div v-if="!checkout?.payments.length" class="py-6 text-center text-14px text-t3">还没有收款</div>
            </div>
            <div v-if="pending" class="mt-2 rounded-12px bg-[#FDF3E3] px-3 py-2 text-13px text-[#92400E]">
              有一笔结果不明：只能按通道查单，不能在POS里手工改成成功（《4.全局业务规则》§三）。
            </div>
          </div>
        </div>

        <div class="qs-card flex flex-col gap-3 p-4">
          <div class="rounded-14px border-2 px-4 py-3" :class="amountError && amountText ? 'border-bad/40' : 'border-brand-200'">
            <div class="flex items-center justify-between text-13px text-t3">
              <span>{{ method === 'cash' ? '收到现金' : `本次${PAY_METHOD[method].short}金额` }}</span>
              <span v-if="method === 'cash' && change > 0" class="font-600 text-promo-600">找零 {{ formatMoney(change) }}</span>
            </div>
            <div class="qs-num h-44px text-38px font-700 leading-44px text-t1">¥{{ amountText || '0' }}</div>
          </div>
          <div v-if="method === 'cash'" class="grid grid-cols-4 gap-2">
            <button
              v-for="q in [Math.ceil(remaining / 1000) * 1000, 10000, 20000, 50000].filter((x, i, a) => x >= remaining && a.indexOf(x) === i)"
              :key="q"
              type="button"
              class="pos-press h-44px rounded-10px border border-line bg-white qs-num text-16px font-600 hover:border-brand-400"
              @click="amountText = String(q / 100)"
            >
              ¥{{ q / 100 }}
            </button>
          </div>
          <NumPad
            v-model="amountText"
            mode="money"
            compact
            keyboard
            :confirm-text="busy ? '处理中' : '确认收款'"
            :confirm-disabled="!!amountError || !!pending || busy || remaining <= 0 || !!completeError"
            @confirm="collect"
          />
          <div class="mt-auto flex gap-3">
            <n-button size="large" class="flex-1" :disabled="busy || !!pending" @click="cancel">
              {{ paid > 0 ? '撤销收款' : '返回修改' }}
            </n-button>
          </div>
        </div>
      </div>
      <div v-if="lastChange > 0 && remaining > 0" class="text-right text-13px text-t3">上一笔现金找零 {{ formatMoney(lastChange) }}</div>
    </section>

    <n-modal v-model:show="showCancel" preset="card" title="撤销收款" :style="{ width: '560px' }">
      <div class="flex flex-col gap-4">
        <div class="rounded-12px bg-[#FDF3E3] px-4 py-3 text-15px text-[#92400E]">
          已收 <span class="qs-num font-700">{{ formatMoney(paid) }}</span>，撤销后按原路退回，并留下操作日志。
        </div>
        <div>
          <div class="mb-2 text-15px font-600">撤销原因</div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="r in CANCEL_REASONS"
              :key="r"
              type="button"
              class="pos-press rounded-12px border-2 px-4 py-2 text-15px"
              :class="cancelReason === r ? 'border-brand-600 bg-brand-50 font-600 text-brand-700' : 'border-line bg-white'"
              @click="cancelReason = r"
            >
              {{ r }}
            </button>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <n-button size="large" @click="showCancel = false">再想想</n-button>
          <n-button type="error" size="large" :loading="busy" @click="doCancel(cancelReason)">确认撤销并原路退回</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>
