<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { DUE_STATUS, PAY_METHOD, PAY_METHODS, SHIFT_STATUS } from '@/shared/config/labels'
import { payColors } from '@/shared/theme/tokens'
import { formatMoney } from '@/shared/utils/format'
import { addDays, shortDate, timeOf, todayBizDate, weekdayOf } from '@/shared/utils/time'
import MAssumptionTag from '../components/MAssumptionTag.vue'
import MBillNo from '../components/MBillNo.vue'
import MPendingTag from '../components/MPendingTag.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import Section from '../components/Section.vue'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const today = todayBizDate()
const DAYS = Array.from({ length: 7 }, (_, i) => addDays(today, -i))
const dayLabel = (d: string) => (d === today ? '今天' : d === addDays(today, -1) ? '昨天' : shortDate(d))
const date = ref(today)

const { data: day } = useRequest(() => api.shift.closePreview(mobile.storeId, date.value), { watch: [date] })
const methods = computed(() => {
  const m = day.value?.summary.byMethod
  if (!m) return []
  return PAY_METHODS.map((k) => ({ key: k, ...PAY_METHOD[k], ...m[k], net: m[k].sales - m[k].refunds }))
})
const isFranchise = computed(() => day.value?.store.mode === 'franchise')

const banner = computed(() => {
  const d = day.value
  if (!d) return null
  if (d.close) {
    return { box: 'bg-[#F1FAF4] border-[#BFE3CF]', dot: 'bg-ok', icon: 'i-ph-seal-check-fill', title: '已日结封账', desc: `${mobile.who(d.close.closerJobNo)} ${shortDate(d.close.closedAt)} ${timeOf(d.close.closedAt)}封账` }
  }
  if (d.check.ok) {
    return { box: 'bg-brand-50 border-brand-200', dot: 'bg-brand-600', icon: 'i-ph-calendar-check-fill', title: '班次都已交班，可以封账', desc: '店长在管理端「班次日结 · 日结」里封账' }
  }
  return { box: 'bg-[#FFFBF2] border-[#F5D9A8]', dot: 'bg-warn', icon: 'i-ph-hourglass-medium-fill', title: d.check.message ?? '还不能封账', desc: d.check.basis }
})
</script>

<template>
  <div class="pb-4">
    <div class="sticky top-46px z-10 flex gap-2 overflow-x-auto bg-canvas px-3 py-2.5">
      <button
        v-for="d in DAYS"
        :key="d"
        type="button"
        class="shrink-0 rounded-12px px-3 py-1 text-center leading-tight"
        :class="date === d ? 'bg-brand-600 text-white' : 'bg-white text-t2'"
        @click="date = d"
      >
        <span class="block text-13px font-600">{{ dayLabel(d) }}</span>
        <span class="block text-10px" :class="date === d ? 'text-white/70' : 'text-t3'">{{ weekdayOf(d) }}</span>
      </button>
    </div>

    <template v-if="day && banner">
      <div class="mx-3 flex items-center gap-3 rounded-14px border px-3.5 py-3" :class="banner.box">
        <span class="qs-flex-center h-38px w-38px shrink-0 rounded-12px text-20px text-white" :class="banner.dot"><span :class="banner.icon" /></span>
        <div class="min-w-0 flex-1 leading-tight">
          <div class="text-15px font-600">{{ banner.title }}</div>
          <div v-if="banner.desc" class="mt-0.5 text-12px leading-17px text-t2">{{ banner.desc }}</div>
          <div v-if="day.close" class="mt-0.5 text-12px text-t3">日结单 <MBillNo :no="day.close.no" /></div>
        </div>
      </div>

      <div class="mx-3 mt-3 rounded-16px bg-ink-900 px-4 py-4 text-white shadow-card">
        <div class="text-12px text-white/60">{{ mobile.store?.name }} · {{ date }} {{ weekdayOf(date) }} · 成交净额</div>
        <div class="qs-num mt-1 text-30px font-700 leading-36px text-volt-400">{{ formatMoney(day.summary.net) }}</div>
        <div class="mt-3 grid grid-cols-4 gap-2 border-t border-white/10 pt-3 text-center">
          <div><div class="qs-num text-16px font-600">{{ day.summary.saleCount }}</div><div class="text-11px text-white/50">成交笔数</div></div>
          <div><div class="qs-num text-16px font-600">{{ day.summary.returnCount }}</div><div class="text-11px text-white/50">退货笔数</div></div>
          <div><div class="qs-num text-14px font-600 leading-20px">{{ formatMoney(day.summary.gross) }}</div><div class="text-11px text-white/50">收款</div></div>
          <div><div class="qs-num text-14px font-600 leading-20px">{{ formatMoney(day.summary.refunds) }}</div><div class="text-11px text-white/50">退款</div></div>
        </div>
      </div>

      <Section title="按支付方式" desc="只汇总通道已成功的收款和退款">
        <div class="grid grid-cols-[1fr_76px_76px_84px] gap-x-1 border-b border-line bg-subtle px-4 py-1.5 text-12px text-t3">
          <span>方式</span><span class="text-right">收款</span><span class="text-right">退款</span><span class="text-right">净额</span>
        </div>
        <div v-for="m in methods" :key="m.key" class="grid grid-cols-[1fr_76px_76px_84px] items-center gap-x-1 border-b border-line px-4 py-2.5 text-13px last:border-0">
          <span class="flex items-center gap-1.5"><span class="h-8px w-8px shrink-0 rounded-full" :style="{ background: payColors[m.key] }" />{{ m.short }}</span>
          <MoneyText :value="m.sales" class="text-right text-12px" />
          <MoneyText :value="m.refunds" class="text-right text-12px" :tone="m.refunds ? 'promo' : 'muted'" />
          <MoneyText :value="m.net" class="text-right" strong />
        </div>
        <div class="border-t border-line px-4 py-2.5 text-12px leading-18px text-t2">
          自提核销 <b class="qs-num text-t1">{{ day.summary.pickupsVerified }}</b> 单、代客单 <b class="qs-num text-t1">{{ day.summary.agentOrders }}</b> 单，只计件数，不进成交净额 <MPendingTag id="待确认-14" />
        </div>
      </Section>

      <Section :title="`当日班次 ${day.shifts.length}`">
        <div v-for="s in day.shifts" :key="s.no" class="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-0">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 text-13px"><MBillNo :no="s.no" plain /><MStatusTag :def="SHIFT_STATUS[s.status]" /></div>
            <div class="mt-0.5 truncate text-12px text-t3">{{ s.registerNo }}号台 · {{ mobile.who(s.cashierJobNo) }} · {{ timeOf(s.openedAt) }}–{{ s.closedAt ? timeOf(s.closedAt) : '' }}</div>
          </div>
          <div class="shrink-0 text-right">
            <MoneyText :value="s.summary?.expectedCash" class="text-13px" />
            <div class="text-11px" :class="s.status === 'open' ? 'text-info' : s.cashDiff ? 'text-bad' : 'text-t3'">
              {{ s.status === 'open' ? '应有现金·未交班' : s.cashDiff ? `应有现金·差异 ${formatMoney(s.cashDiff, { sign: true })}` : '应有现金·无差异' }}
            </div>
          </div>
        </div>
        <div v-if="!day.shifts.length" class="px-4 pb-4 pt-1 text-13px text-t3">这一营业日没有开过班</div>
        <div v-if="day.check.openShifts.length" class="border-t border-line px-4 py-2.5 text-12px text-t2">交班在收银端，由当班的收银员本人交（《8.角色权限原则》：不封别人的班）</div>
      </Section>

      <Section v-if="isFranchise" title="加盟应缴营业款">
        <template #extra><MStatusTag v-if="day.due" :def="DUE_STATUS[day.due.status]" /></template>
        <template v-if="day.due">
          <div class="flex items-center justify-between px-4 pb-1 pt-1 text-13px">
            <MBillNo :no="day.due.no" />
            <MoneyText :value="day.due.total" class="text-18px font-700" />
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 px-4 pb-3 text-13px">
            <div v-for="k in PAY_METHODS" :key="k" class="flex justify-between">
              <span class="text-t2">{{ PAY_METHOD[k].short }}</span><MoneyText :value="day.due.byMethod[k]" />
            </div>
          </div>
        </template>
        <div v-else class="px-4 pb-3 text-13px leading-20px text-t2">封账后由中枢按营业日生成，按支付方式分开；只含本店向顾客收的钱，线上已付款、只到店核销的订单不在里面（《7.直营与加盟代销模式说明》§2.2）</div>
        <div class="border-t border-line px-4 py-2.5 text-12px text-t3">门店不在日结时扣下分成，分成等结算单 <MPendingTag :id="['待确认-17', '待确认-18']" /></div>
      </Section>
    </template>
    <div v-else class="py-20 text-center"><van-loading vertical>加载中</van-loading></div>

    <Note>
      日报只读。封账由店长在管理端执行，前置条件是这一营业日的班次都已交班 <MAssumptionTag k="dailyCloser" />；营业日切日 <MAssumptionTag k="bizDay" />。
      日报不是对账文件，营业款和总账在中枢与金蝶
    </Note>
  </div>
</template>
