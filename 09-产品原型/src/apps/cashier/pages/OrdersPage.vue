<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { HUB_SYNC, PAY_METHOD, PAYMENT_STATUS, SALE_STATUS } from '@/shared/config/labels'
import BillNo from '@/shared/naive/BillNo.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { payColors } from '@/shared/theme/tokens'
import type { Store } from '@/shared/types'
import { formatMoney, maskName, maskPhone } from '@/shared/utils/format'
import { timeOf, todayBizDate } from '@/shared/utils/time'
import { useSession } from '../stores/session'

const props = defineProps<{ store: Store }>()
const session = useSession()

const tab = ref<'shift' | 'today'>(session.shiftNo ? 'shift' : 'today')
const kind = ref<'sale' | 'return'>('sale')
const keyword = ref('')
const filter = computed(() => ({
  storeIds: [props.store.id],
  ...(tab.value === 'shift' && session.shiftNo ? { shiftNo: session.shiftNo } : { bizDate: todayBizDate() }),
  keyword: keyword.value.trim() || undefined,
}))
const { data: sales } = useRequest(() => api.sales.list(filter.value), { watch: [filter] })
const { data: returns } = useRequest(() => api.sales.listReturns(filter.value), { watch: [filter] })
const { data: employees } = useRequest(() => api.master.employees(), { live: false })
const nameOf = (jobNo: string) => employees.value?.find((e) => e.jobNo === jobNo)?.name ?? jobNo

const stats = computed(() => {
  const gross = (sales.value ?? []).reduce((s, x) => s + x.totals.payable, 0)
  const refunds = (returns.value ?? []).reduce((s, x) => s + x.total, 0)
  return { saleCount: sales.value?.length ?? 0, returnCount: returns.value?.length ?? 0, gross, refunds, net: gross - refunds }
})

const saleNo = ref('')
const returnNo = ref('')
const { data: saleDetail } = useRequest(() => (saleNo.value ? api.sales.get(saleNo.value) : Promise.resolve(null)), { watch: [saleNo] })
const { data: returnDetail } = useRequest(() => (returnNo.value ? api.sales.getReturn(returnNo.value) : Promise.resolve(null)), { watch: [returnNo] })
const showDrawer = computed({
  get: () => !!saleNo.value || !!returnNo.value,
  set: (v) => {
    if (!v) {
      saleNo.value = ''
      returnNo.value = ''
    }
  },
})
function openSale(no: string) {
  returnNo.value = ''
  saleNo.value = no
}
function openReturn(no: string) {
  saleNo.value = ''
  returnNo.value = no
}

const methodsOf = (ps: { method: keyof typeof PAY_METHOD }[]) => [...new Set(ps.map((p) => PAY_METHOD[p.method].short))].join('+')
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex items-center gap-3">
      <n-radio-group v-model:value="tab" size="large">
        <n-radio-button v-if="session.shiftNo" value="shift">本班</n-radio-button>
        <n-radio-button value="today">今日本店</n-radio-button>
      </n-radio-group>
      <n-radio-group v-model:value="kind" size="large">
        <n-radio-button value="sale">销售单 {{ stats.saleCount }}</n-radio-button>
        <n-radio-button value="return">退货单 {{ stats.returnCount }}</n-radio-button>
      </n-radio-group>
      <n-input v-model:value="keyword" size="large" clearable placeholder="单号、商品名或SKU" class="max-w-300px">
        <template #prefix><span class="i-ph-magnifying-glass-bold mr-1 text-t3" /></template>
      </n-input>
      <div class="flex-1" />
      <div class="flex gap-5 rounded-14px bg-white px-5 py-2 shadow-card">
        <div><div class="text-12px text-t3">销售实收</div><MoneyText :value="stats.gross" class="text-18px font-700" /></div>
        <div><div class="text-12px text-t3">退款</div><MoneyText :value="stats.refunds" class="text-18px font-700" :tone="stats.refunds ? 'promo' : 'default'" /></div>
        <div><div class="text-12px text-t3">净额</div><MoneyText :value="stats.net" class="text-18px font-700" tone="brand" /></div>
      </div>
    </div>

    <div class="qs-card flex min-h-0 flex-1 flex-col overflow-hidden">
      <template v-if="kind === 'sale'">
        <div class="grid grid-cols-[70px_220px_1fr_60px_120px_110px_100px_110px] gap-3 border-b border-line bg-subtle px-5 py-2.5 text-13px font-600 text-t2">
          <span>时间</span><span>销售单号</span><span>商品</span><span class="text-right">件数</span><span class="text-right">实付</span><span>支付</span><span>导购</span><span>状态</span>
        </div>
        <div class="qs-scroll min-h-0 flex-1 overflow-y-auto">
          <button
            v-for="s in sales ?? []"
            :key="s.no"
            type="button"
            class="grid w-full grid-cols-[70px_220px_1fr_60px_120px_110px_100px_110px] items-center gap-3 border-b border-line px-5 py-3 text-left text-14px hover:bg-brand-50/50"
            @click="openSale(s.no)"
          >
            <span class="qs-num text-t2">{{ timeOf(s.createdAt) }}</span>
            <span class="font-mono text-13px">{{ s.no }}</span>
            <span class="truncate">{{ s.lines.map((l) => `${l.name}×${l.qty}`).join('、') }}</span>
            <span class="qs-num text-right">{{ s.lines.reduce((n, l) => n + l.qty, 0) }}</span>
            <MoneyText :value="s.totals.payable" class="text-right font-600" />
            <span class="text-t2">{{ methodsOf(s.payments) }}</span>
            <span class="truncate text-t2">{{ nameOf(s.guideJobNo) }}</span>
            <span><StatusTag :def="SALE_STATUS[s.status]" /></span>
          </button>
          <div v-if="sales && !sales.length" class="py-16 text-center text-t3">{{ tab === 'shift' ? '本班还没有销售单' : '今天还没有销售单' }}</div>
        </div>
      </template>
      <template v-else>
        <div class="grid grid-cols-[70px_220px_220px_1fr_120px_110px_100px] gap-3 border-b border-line bg-subtle px-5 py-2.5 text-13px font-600 text-t2">
          <span>时间</span><span>退货单号</span><span>原销售单</span><span>商品</span><span class="text-right">退款</span><span>退回</span><span>原因</span>
        </div>
        <div class="qs-scroll min-h-0 flex-1 overflow-y-auto">
          <button
            v-for="r in returns ?? []"
            :key="r.no"
            type="button"
            class="grid w-full grid-cols-[70px_220px_220px_1fr_120px_110px_100px] items-center gap-3 border-b border-line px-5 py-3 text-left text-14px hover:bg-brand-50/50"
            @click="openReturn(r.no)"
          >
            <span class="qs-num text-t2">{{ timeOf(r.createdAt) }}</span>
            <span class="font-mono text-13px">{{ r.no }}</span>
            <span class="font-mono text-13px text-t2">{{ r.originalSaleNo }}</span>
            <span class="truncate">{{ r.lines.map((l) => `${l.name}×${l.qty}`).join('、') }}</span>
            <MoneyText :value="r.total" class="text-right font-600" tone="promo" />
            <span class="text-t2">{{ methodsOf(r.refunds) }}</span>
            <span class="truncate text-t2">{{ r.reason }}</span>
          </button>
          <div v-if="returns && !returns.length" class="py-16 text-center text-t3">没有退货单</div>
        </div>
      </template>
    </div>

    <n-drawer v-model:show="showDrawer" :width="600" placement="right">
      <n-drawer-content closable :native-scrollbar="false">
        <template #header>
          <span v-if="saleNo">销售单 <BillNo :no="saleNo" /></span>
          <span v-else>退货单 <BillNo :no="returnNo" /></span>
        </template>

        <div v-if="saleNo && saleDetail" class="flex flex-col gap-4 text-14px">
          <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-12px bg-subtle px-4 py-3">
            <div><span class="text-t3">时间 </span><span class="qs-num">{{ saleDetail.sale.createdAt }}</span></div>
            <div><span class="text-t3">状态 </span><StatusTag :def="SALE_STATUS[saleDetail.sale.status]" /></div>
            <div><span class="text-t3">收银 </span>{{ saleDetail.sale.cashierJobNo }} {{ nameOf(saleDetail.sale.cashierJobNo) }}</div>
            <div><span class="text-t3">收银台 </span>{{ saleDetail.sale.registerNo }}号</div>
            <div><span class="text-t3">班次 </span><BillNo :no="saleDetail.sale.shiftNo" plain /></div>
            <div><span class="text-t3">会员 </span>{{ saleDetail.member ? `${maskName(saleDetail.member.name)} ${maskPhone(saleDetail.member.phone)}` : '-' }}</div>
            <div class="col-span-2"><span class="text-t3">中枢回传 </span><StatusTag :def="HUB_SYNC[saleDetail.sale.hubSync.status]" /> <BillNo :no="saleDetail.sale.hubSync.resultNo" /></div>
          </div>

          <div>
            <div class="mb-1.5 font-600">商品（成交时的价格快照）</div>
            <div v-for="l in saleDetail.sale.lines" :key="l.lineNo" class="border-b border-line py-2 last:border-0">
              <div class="flex justify-between gap-3">
                <span class="font-600">{{ l.name }} <span class="font-400 text-t3">{{ l.spec }}</span></span>
                <MoneyText :value="l.payable" strong />
              </div>
              <div class="flex justify-between text-12px text-t3">
                <span>{{ l.qty }} × {{ formatMoney(l.unitPrice) }} · 导购 {{ l.guideJobNo }} {{ nameOf(l.guideJobNo) }}<template v-if="l.returnedQty"> · 已退{{ l.returnedQty }}</template></span>
                <span v-if="l.payable !== l.listAmount" class="text-promo-600">优惠 {{ formatMoney(l.listAmount - l.payable) }}</span>
              </div>
              <div v-if="l.sns.length" class="font-mono text-11px text-t3">SN {{ l.sns.join(' ') }}</div>
            </div>
          </div>

          <div class="rounded-12px border border-line px-4 py-3">
            <div class="flex justify-between"><span class="text-t2">原价合计</span><MoneyText :value="saleDetail.sale.totals.list" /></div>
            <div v-for="p in saleDetail.sale.promotions" :key="p.promotionId" class="flex justify-between">
              <span class="text-t2">{{ p.name }} <span class="font-mono text-11px text-t3">{{ p.code }}</span></span><MoneyText :value="p.discount" discount />
            </div>
            <div v-if="saleDetail.sale.totals.manual" class="flex justify-between"><span class="text-t2">改价（已授权）</span><MoneyText :value="saleDetail.sale.totals.manual" discount /></div>
            <div class="mt-1 flex justify-between border-t border-line pt-1.5 font-700"><span>实付</span><MoneyText :value="saleDetail.sale.totals.payable" /></div>
          </div>

          <div v-if="saleDetail.sale.adjustments.length">
            <div class="mb-1.5 font-600">改价留痕</div>
            <div v-for="a in saleDetail.sale.adjustments" :key="a.lineNo" class="rounded-10px bg-[#FDF3E3] px-3 py-2 text-13px">
              第{{ a.lineNo }}行 {{ formatMoney(a.before) }} → {{ formatMoney(a.after) }} · {{ a.reason }} · 操作 {{ a.operatorJobNo }} · 授权 {{ a.authorizerJobNo }} {{ nameOf(a.authorizerJobNo) }}
            </div>
          </div>

          <div>
            <div class="mb-1.5 font-600">支付流水</div>
            <div v-for="p in saleDetail.sale.payments" :key="p.id" class="flex items-center gap-3 border-b border-line py-2 last:border-0">
              <span class="qs-flex-center h-30px w-30px rounded-8px text-16px text-white" :style="{ background: payColors[p.method] }"><span :class="PAY_METHOD[p.method].icon" /></span>
              <div class="min-w-0 flex-1">
                <div>{{ PAY_METHOD[p.method].label }} <StatusTag :def="PAYMENT_STATUS[p.status]" /></div>
                <div class="truncate font-mono text-11px text-t3">{{ p.channelTxnNo ?? `现金 实收${formatMoney(p.tendered)} 找零${formatMoney(p.change)}` }}</div>
              </div>
              <div class="text-right">
                <MoneyText :value="p.amount" strong />
                <div v-if="p.refunded" class="text-11px text-promo-600">已退 {{ formatMoney(p.refunded) }}</div>
              </div>
            </div>
          </div>

          <div v-if="saleDetail.returns.length">
            <div class="mb-1.5 font-600">退货</div>
            <button
              v-for="r in saleDetail.returns"
              :key="r.no"
              type="button"
              class="flex w-full items-center justify-between rounded-10px bg-subtle px-3 py-2 text-left hover:bg-brand-50"
              @click="openReturn(r.no)"
            >
              <span><span class="font-mono text-13px">{{ r.no }}</span> <span class="text-12px text-t3">{{ r.reason }}</span></span>
              <MoneyText :value="r.total" tone="promo" strong />
            </button>
          </div>
        </div>

        <div v-else-if="returnNo && returnDetail" class="flex flex-col gap-4 text-14px">
          <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-12px bg-subtle px-4 py-3">
            <div><span class="text-t3">时间 </span><span class="qs-num">{{ returnDetail.ret.createdAt }}</span></div>
            <div><span class="text-t3">经办 </span>{{ returnDetail.ret.operatorJobNo }} {{ nameOf(returnDetail.ret.operatorJobNo) }}</div>
            <div><span class="text-t3">原因 </span>{{ returnDetail.ret.reason }}</div>
            <div><span class="text-t3">导购 </span>{{ returnDetail.ret.guideJobNo }} {{ nameOf(returnDetail.ret.guideJobNo) }}</div>
            <div class="col-span-2">
              <span class="text-t3">原销售单 </span>
              <button type="button" class="font-mono text-13px text-brand-700 underline-offset-2 hover:underline" @click="openSale(returnDetail.ret.originalSaleNo)">{{ returnDetail.ret.originalSaleNo }}</button>
            </div>
            <div class="col-span-2"><span class="text-t3">中枢回传 </span><StatusTag :def="HUB_SYNC[returnDetail.ret.hubSync.status]" /> <BillNo :no="returnDetail.ret.hubSync.resultNo" /></div>
          </div>
          <div>
            <div class="mb-1.5 font-600">退货商品</div>
            <div v-for="l in returnDetail.ret.lines" :key="l.lineNo" class="flex justify-between border-b border-line py-2 last:border-0">
              <span>{{ l.name }} <span class="text-t3">{{ l.spec }} × {{ l.qty }}</span><span v-if="l.sns.length" class="ml-1 font-mono text-11px text-t3">{{ l.sns.join(' ') }}</span></span>
              <MoneyText :value="l.refund" strong />
            </div>
          </div>
          <div>
            <div class="mb-1.5 font-600">原路退款</div>
            <div v-for="p in returnDetail.ret.refunds" :key="p.id" class="flex items-center justify-between border-b border-line py-2 last:border-0">
              <span class="flex items-center gap-2"><span class="h-8px w-8px rounded-full" :style="{ background: payColors[p.method] }" />{{ PAY_METHOD[p.method].label }} <span class="font-mono text-11px text-t3">{{ p.channelTxnNo }}</span></span>
              <MoneyText :value="p.amount" strong />
            </div>
          </div>
        </div>
        <div v-else class="py-16 text-center"><n-spin /></div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
