<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { errorInfo, useRequest } from '@/shared/composables/useRequest'
import { PAY_METHOD, PAY_METHODS } from '@/shared/config/labels'
import { BASIS } from '@/shared/domain/rules'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import { useFeedback } from '@/shared/naive/feedback'
import { payColors } from '@/shared/theme/tokens'
import type { Store } from '@/shared/types'
import { formatMoney, yuanToCents } from '@/shared/utils/format'
import { timeOf } from '@/shared/utils/time'
import NumPad from '../components/NumPad.vue'
import { useSession } from '../stores/session'

const props = defineProps<{ store: Store }>()
const session = useSession()
const router = useRouter()
const fb = useFeedback()

const { data: report, error } = useRequest(() => api.shift.report(session.shiftNo ?? ''), { watch: [() => session.shiftNo] })
const summary = computed(() => report.value?.summary)
const register = computed(() => props.store.registers.find((r) => r.no === report.value?.shift.registerNo))

const countedText = ref('')
const note = ref('')
const counted = computed(() => yuanToCents(countedText.value))
const expected = computed(() => summary.value?.expectedCash ?? 0)
const diff = computed(() => (counted.value === null ? null : counted.value - expected.value))
const cash = computed(() => summary.value?.byMethod.cash ?? { sales: 0, refunds: 0 })

const partial = computed(() => (report.value?.openCheckouts ?? []).filter((c) => c.payments.some((p) => p.status === 'success')))
const blocker = computed(() => {
  if (!report.value) return null
  if (report.value.pendingPayments > 0) return { message: `还有${report.value.pendingPayments}笔支付结果不明，先查单再交班`, basis: BASIS.paymentPending }
  if (partial.value.length) return { message: '还有一笔收了一部分款的结算，先完成或撤销', basis: '回到「收银」页继续收款，或撤销收款原路退回' }
  return null
})
const noteMissing = computed(() => diff.value !== null && diff.value !== 0 && !note.value.trim())

const busy = ref(false)
async function submit() {
  if (!session.user || !session.shiftNo || blocker.value || counted.value === null || noteMissing.value) return
  busy.value = true
  try {
    const shift = await api.shift.handover({ shiftNo: session.shiftNo, countedCash: counted.value, note: note.value, operatorJobNo: session.user.jobNo })
    session.signOut()
    fb.ok('交班完成', `班次 ${shift.no}，${shift.cashDiff ? `现金差异 ${formatMoney(shift.cashDiff, { sign: true })}，已留痕` : '现金无差异'}`)
    router.replace({ name: 'login', query: { reason: 'handover' } })
  } catch (e) {
    fb.fail(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex h-full gap-4 p-4">
    <section class="flex min-w-0 flex-1 flex-col gap-4">
      <div v-if="error" class="qs-card px-6 py-5 text-bad">{{ errorInfo(error).message }}</div>
      <template v-else-if="report && summary">
        <div class="qs-card flex items-center gap-6 px-6 py-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-18px font-700">本班交班 <BillNo :no="report.shift.no" /></div>
            <div class="mt-1 text-13px text-t3">
              {{ register?.name }} · {{ report.shift.cashierJobNo }} {{ session.user?.name }} · {{ timeOf(report.shift.openedAt) }} 开班 · 营业日 {{ report.shift.bizDate }} <AssumptionTag k="bizDay" />
            </div>
          </div>
          <div class="text-right"><div class="text-12px text-t3">销售</div><div class="qs-num text-24px font-700">{{ summary.saleCount }}<span class="text-14px font-500 text-t3"> 笔</span></div></div>
          <div class="text-right"><div class="text-12px text-t3">退货</div><div class="qs-num text-24px font-700">{{ summary.returnCount }}<span class="text-14px font-500 text-t3"> 笔</span></div></div>
        </div>

        <div v-if="blocker" class="flex items-center gap-3 rounded-14px border border-bad/30 bg-[#FDECEC] px-5 py-3">
          <span class="i-ph-warning-octagon-fill text-26px text-bad" />
          <div class="flex-1">
            <div class="text-16px font-700 text-bad">{{ blocker.message }}</div>
            <div class="text-12px text-t2">{{ blocker.basis }}</div>
          </div>
          <n-button type="error" size="large" @click="router.push({ name: 'sale' })">去处理</n-button>
        </div>

        <div class="qs-card overflow-hidden">
          <div class="grid grid-cols-[1fr_160px_160px_160px] border-b border-line bg-subtle px-6 py-2.5 text-13px font-600 text-t2">
            <span>支付方式</span><span class="text-right">收款</span><span class="text-right">退款</span><span class="text-right">净额</span>
          </div>
          <div v-for="m in PAY_METHODS" :key="m" class="grid grid-cols-[1fr_160px_160px_160px] items-center border-b border-line px-6 py-3 last:border-0">
            <span class="flex items-center gap-3 text-16px font-600">
              <span class="qs-flex-center h-34px w-34px rounded-10px text-18px text-white" :style="{ background: payColors[m] }"><span :class="PAY_METHOD[m].icon" /></span>
              {{ PAY_METHOD[m].label }}
            </span>
            <MoneyText :value="summary.byMethod[m].sales" class="text-right text-17px" />
            <MoneyText :value="summary.byMethod[m].refunds" class="text-right text-17px" :tone="summary.byMethod[m].refunds ? 'promo' : 'muted'" />
            <MoneyText :value="summary.byMethod[m].sales - summary.byMethod[m].refunds" class="text-right text-17px font-700" />
          </div>
        </div>

        <div class="qs-card px-6 py-4">
          <div class="mb-3 text-15px font-600">应有现金</div>
          <div class="flex items-center gap-3 text-center">
            <div class="flex-1 rounded-12px bg-subtle py-3"><div class="text-12px text-t3">备用金</div><MoneyText :value="report.shift.float" class="text-20px font-700" /></div>
            <span class="i-ph-plus-bold text-t3" />
            <div class="flex-1 rounded-12px bg-subtle py-3"><div class="text-12px text-t3">现金收款</div><MoneyText :value="cash.sales" class="text-20px font-700" /></div>
            <span class="i-ph-minus-bold text-t3" />
            <div class="flex-1 rounded-12px bg-subtle py-3"><div class="text-12px text-t3">现金退款</div><MoneyText :value="cash.refunds" class="text-20px font-700" /></div>
            <span class="i-ph-equals-bold text-t3" />
            <div class="flex-1 rounded-12px bg-ink-900 py-3 text-white"><div class="text-12px text-white/60">应有现金</div><span class="qs-num text-24px font-700 text-volt-400">{{ formatMoney(expected) }}</span></div>
          </div>
          <div class="mt-3 text-12px leading-19px text-t3">
            交班只核对这一班的支付方式和现金，差异留下，不在交班时改写销售单。现金缴款方式 <PendingTag id="待确认-10" />
          </div>
        </div>
      </template>
      <div v-else class="flex flex-1 items-center justify-center"><n-spin size="large" /></div>
    </section>

    <aside class="qs-card flex w-400px shrink-0 flex-col gap-3 p-5">
      <div class="text-17px font-700">录入实点现金</div>
      <div class="rounded-14px border-2 px-4 py-2.5" :class="countedText ? 'border-brand-400' : 'border-line'">
        <div class="text-13px text-t3">钱箱实点</div>
        <div class="qs-num h-44px text-38px font-700 leading-44px">¥{{ countedText || '0' }}</div>
      </div>
      <div class="flex items-center justify-between rounded-12px px-4 py-2.5" :class="diff === null ? 'bg-subtle' : diff === 0 ? 'bg-[#E8F7EE]' : 'bg-[#FDF3E3]'">
        <span class="text-14px text-t2">差异（实点 − 应有）</span>
        <span v-if="diff === null" class="text-14px text-t3">录入后显示</span>
        <span v-else class="qs-num text-22px font-700" :class="diff === 0 ? 'text-ok' : 'text-warn'">{{ diff === 0 ? '无差异' : formatMoney(diff, { sign: true }) }}</span>
      </div>
      <NumPad v-model="countedText" mode="money" compact keyboard />
      <div v-if="diff !== null && diff !== 0">
        <div class="mb-1 flex items-center gap-1.5 text-14px font-600">差异说明<span class="text-bad">*</span> <AssumptionTag k="shiftDiff" /></div>
        <n-input v-model:value="note" type="textarea" :rows="2" placeholder="例如：找零时多找了一张10元" :status="noteMissing ? 'error' : undefined" />
      </div>
      <button
        type="button"
        class="pos-press mt-auto flex h-64px items-center justify-center gap-2 rounded-16px bg-volt-400 text-22px font-700 text-ink-900 shadow-volt hover:bg-volt-500 disabled:cursor-not-allowed disabled:bg-[#E2E8E6] disabled:text-t3 disabled:shadow-none"
        :disabled="busy || !!blocker || counted === null || noteMissing"
        @click="submit"
      >
        <n-spin v-if="busy" :size="20" />
        <template v-else><span class="i-ph-clock-counter-clockwise-bold" />确认交班</template>
      </button>
      <div class="text-center text-12px text-t3">交班后退回登录页，下一位收银员开班</div>
    </aside>
  </div>
</template>
