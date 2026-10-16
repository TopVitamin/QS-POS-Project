<script setup lang="ts">
import { computed } from 'vue'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { DUTY, STORE_MODE } from '@/shared/config/labels'
import type { Perm } from '@/shared/config/permissions'
import { formatMoney } from '@/shared/utils/format'
import { todayBizDate, weekdayOf } from '@/shared/utils/time'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import Section from '../components/Section.vue'
import { explain } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const today = todayBizDate()
const { data: dash } = useRequest(() => api.dashboard.dashboard({ storeIds: [mobile.storeId] }))
const { data: mine } = useRequest(() => api.dashboard.performance({ jobNo: mobile.user!.jobNo, from: today, to: today }))

/** 有交易查看权限的看本店成交；只有导购职责的只看自己的业绩归属 */
const storeView = computed(() => mobile.has('trade.view'))
const dutyText = computed(() => mobile.user?.duties.map((d) => DUTY[d].label).join('、') ?? '')

const ENTRIES: { text: string; icon: string; to: string; perm: Perm; tint: string }[] = [
  { text: '自提核销', icon: 'i-ph-scan-bold', to: '/pickup', perm: 'pickup.verify', tint: 'bg-brand-50 text-brand-700' },
  { text: '代客下单', icon: 'i-ph-truck-fill', to: '/agent/new', perm: 'agent.create', tint: 'bg-brand-50 text-brand-700' },
  { text: '库存查询', icon: 'i-ph-stack-fill', to: '/stock', perm: 'inventory.view', tint: 'bg-[#EAF1FE] text-info' },
  { text: '要货', icon: 'i-ph-clipboard-text-fill', to: '/replenish', perm: 'storeops.view', tint: 'bg-[#FDF3E3] text-warn' },
  { text: '收货', icon: 'i-ph-tray-arrow-down-fill', to: '/receive', perm: 'storeops.view', tint: 'bg-[#FDF3E3] text-warn' },
  { text: '盘点', icon: 'i-ph-list-checks-bold', to: '/stocktake', perm: 'storeops.view', tint: 'bg-[#FDF3E3] text-warn' },
  { text: '退仓', icon: 'i-ph-arrow-bend-up-left-bold', to: '/return-wh', perm: 'storeops.view', tint: 'bg-[#FDF3E3] text-warn' },
  { text: '店间调拨', icon: 'i-ph-arrows-left-right-bold', to: '/transfer', perm: 'storeops.view', tint: 'bg-[#FDF3E3] text-warn' },
  { text: '我的业绩', icon: 'i-ph-chart-line-up-bold', to: '/performance', perm: 'performance.self', tint: 'bg-[#E8F7EE] text-ok' },
  { text: '门店日报', icon: 'i-ph-calendar-check-fill', to: '/daily', perm: 'shift.view', tint: 'bg-[#E8F7EE] text-ok' },
]
const entries = computed(() => ENTRIES.filter((e) => mobile.has(e.perm)))

const todos = computed(() => {
  const t = dash.value?.todo
  if (!t) return []
  const list: { text: string; count: number; unit: string; to: string; perm: Perm }[] = [
    { text: '待核销自提单', count: t.pickupsPending, unit: '单', to: '/fulfil', perm: 'fulfil.view' },
    { text: '代客单履约中', count: t.agentInProgress, unit: '单', to: '/fulfil?tab=agent', perm: 'fulfil.view' },
    { text: '在途待收的出库单', count: t.inTransit, unit: '张', to: '/receive', perm: 'storeops.view' },
    { text: '盘点差异待授权', count: t.stocktakeToPost, unit: '张', to: '/stocktake', perm: 'storeops.view' },
    { text: '要货单在中枢审核', count: t.replenishReviewing, unit: '张', to: '/replenish', perm: 'storeops.view' },
    { text: '店间调拨待审核', count: t.transfersReviewing, unit: '张', to: '/transfer', perm: 'storeops.view' },
    { text: '本店待代发', count: t.dropshipsPending, unit: '单', to: '/fulfil?tab=dropship', perm: 'fulfil.view' },
    { text: '收货差异待中枢处理', count: t.discrepancies, unit: '张', to: '/receive', perm: 'storeops.view' },
    { text: '还没交班的班次', count: t.openShifts, unit: '个', to: '/daily', perm: 'shift.view' },
  ]
  return list.filter((x) => mobile.has(x.perm))
})

function aboutDemo() {
  explain('全部是演示数据', '门店、员工、商品、价格、促销和交易都是mock，不接支付、中枢、金蝶和外设，不做离线。演示能走通只证明流程表达，不证明已经联调。')
}
</script>

<template>
  <div class="pb-4">
    <div class="relative overflow-hidden bg-ink-900 px-4 pb-16 pt-[calc(16px+env(safe-area-inset-top))] text-white">
      <span class="i-ph-lightning-fill pointer-events-none absolute -right-6 top-4 text-[150px] text-white/[0.04]" />
      <div class="flex items-center gap-3">
        <span class="qs-flex-center h-42px w-42px shrink-0 rounded-14px bg-volt-400 text-18px font-700 text-ink-900">{{ mobile.user?.name.slice(0, 1) }}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 text-16px font-600">{{ mobile.user?.name }}<span class="qs-num text-12px font-500 text-white/50">{{ mobile.user?.jobNo }}</span></div>
          <div class="truncate text-12px text-white/60">{{ dutyText }}</div>
        </div>
        <span role="button" class="inline-flex items-center gap-0.5 rounded-full bg-volt-400 px-2 py-0.5 text-11px font-700 text-ink-900" @click="aboutDemo">
          <span class="i-ph-sparkle-fill text-11px" />演示数据
        </span>
      </div>
      <div class="mt-4 flex items-center gap-2">
        <span class="i-ph-storefront-fill text-16px text-volt-400" />
        <span class="truncate text-15px font-600">{{ mobile.storeText }}</span>
        <MStatusTag v-if="mobile.store" :def="STORE_MODE[mobile.store.mode]" />
      </div>
      <div class="mt-0.5 text-12px text-white/50">营业日 {{ today }} {{ weekdayOf(today) }}</div>
    </div>

    <div class="relative z-1 mx-3 -mt-12 rounded-16px bg-white px-4 py-4 shadow-card">
      <template v-if="storeView">
        <div class="text-12px text-t3">本店今日成交净额</div>
        <div class="qs-num mt-0.5 text-30px font-700 leading-36px">{{ formatMoney(dash?.money.net ?? 0) }}</div>
        <div class="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
          <div><div class="qs-num text-17px font-600">{{ dash?.money.saleCount ?? 0 }}</div><div class="text-11px text-t3">成交笔数</div></div>
          <div><div class="qs-num text-17px font-600">{{ dash?.avgTicket === null || dash?.avgTicket === undefined ? '-' : formatMoney(dash.avgTicket) }}</div><div class="text-11px text-t3">客单价</div></div>
          <div><div class="qs-num text-17px font-600">{{ dash?.hub.verified ?? 0 }}</div><div class="text-11px text-t3">今日核销</div></div>
        </div>
      </template>
      <template v-else>
        <div class="text-12px text-t3">我今天的成交归属（按工号）</div>
        <div class="qs-num mt-0.5 text-30px font-700 leading-36px">{{ formatMoney(mine?.net ?? 0) }}</div>
        <div class="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-center">
          <div><div class="qs-num text-17px font-600">{{ mine?.orders ?? 0 }}</div><div class="text-11px text-t3">归属单数</div></div>
          <div><div class="qs-num text-17px font-600">{{ mine?.agents.length ?? 0 }}</div><div class="text-11px text-t3">代客单</div></div>
        </div>
      </template>
    </div>

    <Section>
      <van-grid :column-num="4" :border="false" clickable class="py-1">
        <van-grid-item v-for="e in entries" :key="e.to" :to="e.to">
          <template #icon><span class="qs-flex-center h-42px w-42px rounded-14px text-22px" :class="e.tint"><span :class="e.icon" /></span></template>
          <template #text><span class="mt-1.5 text-12px text-t1">{{ e.text }}</span></template>
        </van-grid-item>
      </van-grid>
    </Section>

    <Section title="待办">
      <van-cell v-for="t in todos" :key="t.text" :title="t.text" :to="t.to" is-link center>
        <template #value>
          <span v-if="t.count" class="qs-num font-600 text-t1">{{ t.count }} <span class="text-12px font-400 text-t3">{{ t.unit }}</span></span>
          <span v-else class="text-t3">无</span>
        </template>
      </van-cell>
    </Section>

    <Note>移动端做店务和履约，不收款；收款、退款和交班在收银端。数据和收银端、管理端是同一份，在哪一端做的动作，这里都能看到</Note>
  </div>
</template>
