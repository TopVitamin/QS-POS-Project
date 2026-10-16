<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { AGENT_STATUS } from '@/shared/config/labels'
import { formatMoney } from '@/shared/utils/format'
import { addDays, shortDate, timeOf, todayBizDate, weekdayOf } from '@/shared/utils/time'
import MBillNo from '../components/MBillNo.vue'
import MPendingTag from '../components/MPendingTag.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import Section from '../components/Section.vue'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const today = todayBizDate()
const RANGES = [
  { key: 'today', label: '今天', from: today },
  { key: 'week', label: '近7天', from: addDays(today, -6) },
] as const
const range = ref<(typeof RANGES)[number]['key']>('today')
const from = computed(() => RANGES.find((r) => r.key === range.value)!.from)

const { data: perf } = useRequest(() => api.dashboard.performance({ jobNo: mobile.user!.jobNo, from: from.value, to: today }), { watch: [from] })
const maxNet = computed(() => Math.max(1, ...(perf.value?.days ?? []).map((d) => d.net)))

const openSaleNo = ref('')
const { data: saleDetail } = useRequest(() => (openSaleNo.value ? api.sales.get(openSaleNo.value) : Promise.resolve(null)), { watch: [openSaleNo] })
const openAgentNo = ref('')
const currentAgent = computed(() => (perf.value?.agents ?? []).find((o) => o.no === openAgentNo.value) ?? null)
</script>

<template>
  <div class="pb-4">
    <div class="flex gap-2 px-3 pt-3">
      <button
        v-for="r in RANGES"
        :key="r.key"
        type="button"
        class="rounded-full px-3.5 py-1 text-13px"
        :class="range === r.key ? 'bg-brand-600 text-white' : 'bg-white text-t2'"
        @click="range = r.key"
      >
        {{ r.label }}
      </button>
      <div class="flex-1" />
      <span class="self-center text-12px text-t3">{{ from === today ? today : `${shortDate(from)} 至 ${shortDate(today)}` }}</span>
    </div>

    <div class="relative mx-3 mt-3 overflow-hidden rounded-16px bg-ink-900 px-4 py-4 text-white shadow-card">
      <span class="i-ph-chart-line-up-fill pointer-events-none absolute -right-4 -top-2 text-[110px] text-white/[0.05]" />
      <div class="text-12px text-white/60">{{ mobile.who(mobile.user?.jobNo) }} · 成交净额归属</div>
      <div class="qs-num mt-1 text-32px font-700 leading-38px text-volt-400">{{ formatMoney(perf?.net ?? 0) }}</div>
      <div class="mt-1 text-12px text-white/50">成交 {{ formatMoney(perf?.amount ?? 0) }} − 已退 {{ formatMoney(perf?.refunded ?? 0) }}</div>
      <div class="mt-3 grid grid-cols-4 gap-2 border-t border-white/10 pt-3 text-center">
        <div><div class="qs-num text-17px font-600">{{ perf?.orders ?? 0 }}</div><div class="text-11px text-white/50">归属单数</div></div>
        <div><div class="qs-num text-17px font-600">{{ perf?.qty ?? 0 }}</div><div class="text-11px text-white/50">件数</div></div>
        <div><div class="qs-num text-17px font-600">{{ perf?.returnedQty ?? 0 }}</div><div class="text-11px text-white/50">退货件数</div></div>
        <div><div class="qs-num text-17px font-600">{{ perf?.agents.length ?? 0 }}</div><div class="text-11px text-white/50">代客单</div></div>
      </div>
    </div>

    <Section v-if="range === 'week' && perf" title="每天的净额归属">
      <div class="flex h-132px items-end gap-2 px-4 pb-3 pt-2">
        <div v-for="d in perf.days" :key="d.date" class="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span class="qs-num text-10px text-t3">{{ d.net ? (d.net / 100).toFixed(0) : '' }}</span>
          <div class="w-full max-w-26px rounded-t-6px" :class="d.date === today ? 'bg-brand-600' : 'bg-brand-200'" :style="{ height: `${Math.max(3, (d.net / maxNet) * 84)}px` }" />
          <span class="text-11px" :class="d.date === today ? 'font-600 text-brand-700' : 'text-t3'">{{ d.date === today ? '今天' : weekdayOf(d.date) }}</span>
        </div>
      </div>
    </Section>

    <Section title="最近的成交行" desc="按销售单行上的导购工号归属，一张单可以有多个导购">
      <div v-for="(r, i) in perf?.recent ?? []" :key="`${r.saleNo}-${i}`" class="m-press flex items-center gap-3 border-t border-line px-4 py-2.5" @click="openSaleNo = r.saleNo">
        <div class="min-w-0 flex-1">
          <div class="truncate text-14px">{{ r.name }} <span class="qs-num text-t3">×{{ r.qty }}</span></div>
          <div class="truncate text-12px text-t3"><MBillNo :no="r.saleNo" plain /> · {{ shortDate(r.at) }} {{ timeOf(r.at) }}</div>
        </div>
        <div class="shrink-0 text-right">
          <MoneyText :value="r.payable" strong class="text-14px" />
          <div v-if="r.refunded" class="text-12px text-promo-500">已退 {{ formatMoney(r.refunded) }}</div>
        </div>
      </div>
      <div v-if="perf && !perf.recent.length" class="px-4 pb-4 pt-1 text-13px text-t3">这段时间没有记到你工号上的成交</div>
    </Section>

    <Section title="我发起的代客单" desc="业绩记在发起门店和导购工号上，钱不在POS收">
      <div v-for="o in perf?.agents ?? []" :key="o.no" class="m-press border-t border-line px-4 py-2.5" @click="openAgentNo = o.no">
        <div class="flex items-center gap-2 text-13px">
          <MBillNo :no="o.no" plain />
          <div class="flex-1" />
          <MStatusTag :def="AGENT_STATUS[o.status]" />
        </div>
        <div class="mt-1 truncate text-13px">{{ o.items.map((i) => `${i.name}×${i.qty}`).join('、') }}</div>
        <div class="text-12px text-t3">{{ shortDate(o.createdAt) }} {{ timeOf(o.createdAt) }} · 参考金额 <MoneyText :value="o.referenceAmount" /></div>
      </div>
      <div v-if="perf && !perf.agents.length" class="px-4 pb-4 pt-1 text-13px text-t3">这段时间没有代客单</div>
    </Section>

    <Note>
      这里只看业绩归属，不算提成：提成由谁算、计算日、退款怎么冲减 <MPendingTag id="待确认-13" />。
      原型的退货按原单行的已退金额扣在原成交那天
      <template v-if="mobile.store?.mode === 'franchise'">。加盟店店员的提成由谁计算和发放 <MPendingTag id="待确认-36" /></template>
    </Note>

    <van-popup :show="!!openSaleNo" position="bottom" round closeable teleport="body" :style="{ maxHeight: '80%' }" @update:show="(v: boolean) => !v && (openSaleNo = '')">
      <div class="px-4 pb-8 pt-5">
        <div v-if="saleDetail" class="">
          <div class="flex items-center gap-2">
            <MBillNo :no="saleDetail.sale.no" class="text-15px font-700" />
          </div>
          <div class="mt-2 text-13px text-t2">{{ saleDetail.sale.createdAt }} · {{ saleDetail.sale.lines.length }}行</div>
          <div class="mt-3 rounded-12px border border-line">
            <div v-for="l in saleDetail.sale.lines" :key="l.lineNo" class="flex justify-between border-b border-line px-3 py-2 last:border-0">
              <span>{{ l.name }} <span class="qs-num text-t3">×{{ l.qty }}</span></span>
              <MoneyText :value="l.payable" />
            </div>
          </div>
          <div class="mt-2 flex justify-between text-14px font-600">
            <span>成交应付</span>
            <MoneyText :value="saleDetail.sale.totals.payable" strong />
          </div>
        </div>
        <div v-else class="py-10 text-center"><van-loading /></div>
      </div>
    </van-popup>

    <van-popup :show="!!currentAgent" position="bottom" round closeable teleport="body" :style="{ maxHeight: '70%' }" @update:show="(v: boolean) => !v && (openAgentNo = '')">
      <div v-if="currentAgent" class="px-4 pb-8 pt-5">
        <div class="flex items-center gap-2">
          <MBillNo :no="currentAgent.no" class="text-15px font-700" />
          <MStatusTag :def="AGENT_STATUS[currentAgent.status]" />
        </div>
        <div class="mt-2 text-13px text-t2">{{ currentAgent.createdAt }} · 参考金额 <MoneyText :value="currentAgent.referenceAmount" /></div>
        <div class="mt-3 rounded-12px border border-line">
          <div v-for="i in currentAgent.items" :key="i.sku" class="flex justify-between border-b border-line px-3 py-2 last:border-0">
            <span>{{ i.name }}</span>
            <span class="qs-num font-600">× {{ i.qty }}</span>
          </div>
        </div>
        <van-button block round type="primary" class="mt-4" to="/fulfil?tab=agent">到履约看进度</van-button>
      </div>
    </van-popup>
  </div>
</template>
