<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { PAY_METHOD, PAY_METHODS, STORE_MODE } from '@/shared/config/labels'
import type { Perm } from '@/shared/config/permissions'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import { payColors } from '@/shared/theme/tokens'
import { codeName, formatMoney, formatPercent } from '@/shared/utils/format'
import { shortDate, todayBizDate, weekdayOf } from '@/shared/utils/time'
import PageHead from '../components/PageHead.vue'
import StoreSelect from '../components/StoreSelect.vue'
import { useAdmin } from '../stores/session'

const admin = useAdmin()
const storeId = ref<string | null>(null)
const picked = ref<string | null>(todayBizDate())
const bizDate = computed(() => picked.value ?? todayBizDate())
const storeIds = computed(() => (storeId.value ? [storeId.value] : admin.storeIds))

const { data } = useRequest(() => api.dashboard.dashboard({ storeIds: storeIds.value, bizDate: bizDate.value }), {
  watch: [storeIds, bizDate],
})

const isToday = computed(() => bizDate.value === todayBizDate())

const methods = computed(() => {
  const m = data.value?.money
  if (!m) return []
  return PAY_METHODS.map((k) => ({ key: k, ...PAY_METHOD[k], net: m.byMethod[k].sales - m.byMethod[k].refunds, sales: m.byMethod[k].sales }))
})

/** 支付构成环图：按收款额占比 */
const ring = computed(() => {
  const total = methods.value.reduce((s, m) => s + m.sales, 0)
  const c = 2 * Math.PI * 52
  let offset = 0
  return methods.value.map((m) => {
    const len = total ? (m.sales / total) * c : 0
    const seg = { key: m.key, color: payColors[m.key], dash: `${len} ${c - len}`, offset: -offset, ratio: total ? m.sales / total : null }
    offset += len
    return seg
  })
})

const maxDay = computed(() => Math.max(1, ...(data.value?.days ?? []).map((d) => d.net)))

interface Todo {
  label: string
  count: number
  route: string
  query?: Record<string, string>
  perm: Perm
  icon: string
  hint: string
}
const todos = computed<Todo[]>(() => {
  const t = data.value?.todo
  if (!t) return []
  const list: Todo[] = [
    { label: '待核销自提', count: t.pickupsPending, route: 'pickups', perm: 'fulfil.view', icon: 'i-ph-package-fill', hint: '锁定有效，等顾客到店' },
    { label: '代客单履约中', count: t.agentInProgress, route: 'agent-orders', perm: 'fulfil.view', icon: 'i-ph-truck-fill', hint: 'OMS路由、发货、签收' },
    { label: '在途待收货', count: t.inTransit, route: 'receipts', perm: 'storeops.view', icon: 'i-ph-tray-arrow-down-fill', hint: '按出库单逐行录实收' },
    { label: '盘点差异待授权', count: t.stocktakeToPost, route: 'stocktakes', perm: 'storeops.view', icon: 'i-ph-list-checks-bold', hint: '授权前不改可用' },
    { label: '要货审核中', count: t.replenishReviewing, route: 'replenishments', perm: 'storeops.view', icon: 'i-ph-clipboard-text-fill', hint: '中枢审核，本店可用不变' },
    { label: '店间调拨待审核', count: t.transfersReviewing, route: 'transfers', perm: 'storeops.view', icon: 'i-ph-arrows-left-right-bold', hint: '有单据才改库存' },
    { label: '本店待代发', count: t.dropshipsPending, route: 'agent-orders', query: { dropship: '1' }, perm: 'fulfil.view', icon: 'i-ph-path-bold', hint: 'OMS把代客单路由到本店' },
    { label: '收货差异待处理', count: t.discrepancies, route: 'receipts', perm: 'storeops.view', icon: 'i-ph-seal-warning-fill', hint: '责任见【待确认-22】' },
    { label: '当班中的班次', count: t.openShifts, route: 'shifts', perm: 'shift.view', icon: 'i-ph-clock-counter-clockwise-bold', hint: '交班后才能日结' },
    { label: '往日未日结', count: t.unclosedDays, route: 'daily-close', perm: 'shift.view', icon: 'i-ph-calendar-check-fill', hint: '营业日封账' },
  ]
  return list.filter((x) => admin.has(x.perm))
})
</script>

<template>
  <div>
    <PageHead title="工作台">
      <template #desc>
        授权范围内的成交、支付构成、门店排行和待办。成交净额 = 通道成功的收款 − 退款，自提核销和代客单只计件数
        <PendingTag id="待确认-14" />
      </template>
      <template #actions>
        <StoreSelect v-model="storeId" />
        <n-date-picker v-model:formatted-value="picked" value-format="yyyy-MM-dd" type="date" class="!w-150px" />
      </template>
    </PageHead>

    <div v-if="!admin.storeIds.length" class="qs-card py-16 text-center text-t3">当前身份没有授权到店，没有门店交易可看</div>

    <template v-else-if="data">
      <div class="grid grid-cols-4 gap-4">
        <div class="relative overflow-hidden rounded-14px bg-ink-900 px-5 py-4 text-white shadow-card">
          <div class="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-brand-600/40" />
          <div class="relative flex items-center gap-1.5 text-13px text-white/65">
            <span class="i-ph-coins-fill text-volt-400" />{{ isToday ? '今日' : shortDate(bizDate) }}成交净额
          </div>
          <div class="qs-num relative mt-1.5 text-32px font-700 leading-38px">{{ formatMoney(data.money.net) }}</div>
          <div class="relative mt-1 text-12px text-white/55">
            前一营业日全天 <span class="qs-num text-white/80">{{ formatMoney(data.yesterdayNet) }}</span>
            <span v-if="isToday" class="ml-1">· 今日截至现在</span>
          </div>
        </div>
        <div class="qs-card px-5 py-4">
          <div class="flex items-center gap-1.5 text-13px text-t2"><span class="i-ph-receipt-fill text-brand-600" />成交笔数</div>
          <div class="qs-num mt-1.5 text-30px font-700 leading-38px">{{ data.money.saleCount }}<span class="ml-1 text-14px font-500 text-t3">笔</span></div>
          <div class="mt-1 text-12px text-t3">退货 {{ data.money.returnCount }} 笔</div>
        </div>
        <div class="qs-card px-5 py-4">
          <div class="flex items-center gap-1.5 text-13px text-t2"><span class="i-ph-shopping-bag-fill text-brand-600" />客单价</div>
          <div class="qs-num mt-1.5 text-30px font-700 leading-38px">{{ formatMoney(data.avgTicket) }}</div>
          <div class="mt-1 text-12px text-t3">收款合计 ÷ 成交笔数</div>
        </div>
        <div class="qs-card px-5 py-4">
          <div class="flex items-center gap-1.5 text-13px text-t2"><span class="i-ph-arrow-u-up-left-bold text-promo-500" />退款</div>
          <div class="qs-num mt-1.5 text-30px font-700 leading-38px" :class="data.money.refunds ? 'text-promo-600' : ''">{{ formatMoney(data.money.refunds) }}</div>
          <div class="mt-1 text-12px text-t3">按原支付方式原路退</div>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-[1fr_380px] gap-4">
        <div class="qs-card px-5 py-4">
          <div class="flex items-center justify-between">
            <div class="text-15px font-600">近7个营业日成交净额</div>
            <div class="flex items-center gap-2 text-12px text-t3">营业日按自然日切日 <AssumptionTag k="bizDay" /></div>
          </div>
          <div class="mt-4 grid h-220px grid-cols-7 items-end gap-3">
            <div v-for="d in data.days" :key="d.date" class="flex h-full cursor-pointer flex-col items-center justify-end gap-1.5" @click="picked = d.date">
              <span class="qs-num whitespace-nowrap text-11px" :class="d.date === bizDate ? 'font-700 text-t1' : 'text-t3'">{{ formatMoney(d.net) }}</span>
              <div
                class="w-full max-w-56px rounded-t-8px transition-all"
                :class="d.date === bizDate ? 'bg-volt-400 shadow-volt' : 'bg-gradient-to-t from-brand-600 to-brand-400'"
                :style="{ height: `${Math.max(3, (d.net / maxDay) * 150)}px` }"
                :title="`${d.date} 成交净额 ${formatMoney(d.net)}，${d.saleCount}笔`"
              />
              <span class="qs-num text-12px" :class="d.date === bizDate ? 'font-600 text-t1' : 'text-t2'">{{ shortDate(d.date) }}</span>
              <span class="-mt-1.5 text-11px text-t3">{{ weekdayOf(d.date) }}</span>
            </div>
          </div>
        </div>

        <div class="qs-card px-5 py-4">
          <div class="text-15px font-600">支付构成</div>
          <div class="mt-3 flex items-center gap-5">
            <svg viewBox="0 0 128 128" class="h-128px w-128px shrink-0 -rotate-90">
              <circle cx="64" cy="64" r="52" fill="none" stroke="#EEF2F1" stroke-width="18" />
              <circle
                v-for="s in ring"
                :key="s.key"
                cx="64"
                cy="64"
                r="52"
                fill="none"
                :stroke="s.color"
                stroke-width="18"
                :stroke-dasharray="s.dash"
                :stroke-dashoffset="s.offset"
              />
            </svg>
            <div class="flex min-w-0 flex-1 flex-col gap-2.5">
              <div v-for="(m, i) in methods" :key="m.key" class="flex items-center gap-2 text-13px">
                <span class="h-10px w-10px shrink-0 rounded-3px" :style="{ background: payColors[m.key] }" />
                <span class="w-48px text-t2">{{ m.short }}</span>
                <MoneyText :value="m.net" class="flex-1 text-right font-600" />
                <span class="qs-num w-44px text-right text-12px text-t3">{{ formatPercent(ring[i]?.ratio, 0) }}</span>
              </div>
            </div>
          </div>
          <div class="mt-3 border-t border-line pt-2.5 text-12px text-t3">金额是收款减退款；占比按收款。储值、积分未开放 <PendingTag :id="['待确认-21', '待确认-54']" /></div>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-[1fr_1fr_340px] gap-4">
        <div class="qs-card px-5 py-4">
          <div class="flex items-center justify-between">
            <div class="text-15px font-600">门店排行</div>
            <router-link v-if="admin.has('shift.view')" :to="{ name: 'daily-close' }" class="text-13px text-brand-700 hover:underline">去日结</router-link>
          </div>
          <div class="mt-2 flex flex-col">
            <div v-for="(s, i) in data.stores" :key="s.store.id" class="flex cursor-pointer items-center gap-3 border-b border-line py-2.5 last:border-0 hover:bg-subtle" @click="storeId = s.store.id">
              <span class="qs-flex-center qs-num h-24px w-24px shrink-0 rounded-6px text-13px font-700" :class="i === 0 ? 'bg-volt-400 text-ink-900' : 'bg-subtle text-t2'">{{ i + 1 }}</span>
              <div class="min-w-0 flex-1 leading-tight">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-14px font-600">{{ codeName(s.store.code, s.store.name) }}</span>
                  <n-tag size="tiny" :bordered="false" :type="STORE_MODE[s.store.mode].tone">{{ STORE_MODE[s.store.mode].label }}</n-tag>
                </div>
                <div class="mt-0.5 text-12px text-t3">
                  {{ s.saleCount }}笔 ·
                  <span v-if="s.openShifts" class="text-info">当班{{ s.openShifts }}个</span>
                  <span v-else>无当班</span> ·
                  <span :class="s.closed ? 'text-ok' : 'text-warn'">{{ s.closed ? '已日结' : '未日结' }}</span>
                </div>
              </div>
              <MoneyText :value="s.net" class="text-15px font-700" />
            </div>
          </div>
        </div>

        <div class="qs-card px-5 py-4">
          <div class="text-15px font-600">履约和店务待办</div>
          <div class="mt-3 grid grid-cols-2 gap-2.5">
            <router-link
              v-for="t in todos"
              :key="t.label"
              :to="{ name: t.route, query: t.query }"
              class="group flex items-center gap-2.5 rounded-12px border px-3 py-2.5 transition-colors"
              :class="t.count ? 'border-[#F5D9A8] bg-[#FFFBF2] hover:border-warn' : 'border-line hover:border-brand-300'"
            >
              <span class="qs-flex-center h-32px w-32px shrink-0 rounded-8px text-16px" :class="t.count ? 'bg-[#FDF3E3] text-warn' : 'bg-subtle text-t3'"><span :class="t.icon" /></span>
              <span class="min-w-0 flex-1 leading-tight">
                <span class="block truncate text-13px text-t2">{{ t.label }}</span>
                <span class="block truncate text-11px text-t3">{{ t.hint }}</span>
              </span>
              <span class="qs-num text-20px font-700" :class="t.count ? 'text-t1' : 'text-t3'">{{ t.count }}</span>
            </router-link>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <div class="qs-card px-5 py-4">
            <div class="flex items-center justify-between">
              <div class="text-15px font-600">中枢回传</div>
              <span class="flex items-center gap-1.5 text-12px text-ok"><span class="h-2 w-2 rounded-full bg-ok" />模拟连接</span>
            </div>
            <div class="mt-3 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-10px bg-subtle py-2">
                <div class="qs-num text-20px font-700 text-ok">{{ data.hub.accepted }}</div>
                <div class="text-11px text-t3">已接受</div>
              </div>
              <div class="rounded-10px bg-subtle py-2">
                <div class="qs-num text-20px font-700" :class="data.hub.rejected ? 'text-bad' : 'text-t3'">{{ data.hub.rejected }}</div>
                <div class="text-11px text-t3">中枢拒绝</div>
              </div>
              <div class="rounded-10px bg-subtle py-2">
                <div class="qs-num text-20px font-700" :class="data.hub.duplicateHits ? 'text-info' : 'text-t3'">{{ data.hub.duplicateHits }}</div>
                <div class="text-11px text-t3">重复回传被去重</div>
              </div>
            </div>
            <div class="mt-2.5 flex justify-between text-12px text-t2">
              <span>核销成功 <b class="qs-num">{{ data.hub.verified }}</b> · 被拒 <b class="qs-num">{{ data.hub.verifyRejected }}</b></span>
              <span class="qs-num text-t3">最近 {{ data.hub.lastAt?.slice(11, 19) ?? '-' }}</span>
            </div>
          </div>
          <div class="qs-card flex-1 px-5 py-4">
            <div class="text-15px font-600">{{ isToday ? '今日' : shortDate(bizDate) }}热销</div>
            <div class="mt-2 flex flex-col gap-1.5">
              <div v-for="(t, i) in data.topSkus" :key="t.sku" class="flex items-center gap-2 text-13px">
                <span class="qs-num w-16px text-t3">{{ i + 1 }}</span>
                <span class="min-w-0 flex-1 truncate">{{ t.name }}</span>
                <span class="qs-num text-t2">×{{ t.qty }}</span>
              </div>
              <div v-if="!data.topSkus.length" class="py-4 text-center text-13px text-t3">还没有成交</div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="py-24 text-center"><n-spin /></div>
  </div>
</template>
