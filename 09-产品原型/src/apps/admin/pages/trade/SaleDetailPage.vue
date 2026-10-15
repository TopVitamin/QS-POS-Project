<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { HUB_SYNC, LEDGER_TYPE, PAY_METHOD, PAYMENT_STATUS, PROMO_TYPE, SALE_STATUS } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import { useFeedback } from '@/shared/naive/feedback'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { payColors } from '@/shared/theme/tokens'
import type { Payment, SaleLine } from '@/shared/types'
import { formatMoney, maskName, maskPhone } from '@/shared/utils/format'
import { dateTime, money, mono, muted, num, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import TraceChain from '../../components/TraceChain.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const route = useRoute()
const router = useRouter()
const fb = useFeedback()

const no = computed(() => String(route.params.no ?? ''))
const { data, error } = useRequest(() => api.sales.get(no.value), { watch: [no] })
const inScope = computed(() => !!data.value && admin.storeIds.includes(data.value.sale.storeId))
const { data: trace } = useRequest(() => api.audit.trace({ q: no.value, storeIds: admin.storeIds }), { watch: [no] })

const sale = computed(() => data.value?.sale)
const store = computed(() => (sale.value ? admin.storeById(sale.value.storeId) : undefined))
const qty = computed(() => sale.value?.lines.reduce((n, l) => n + l.qty, 0) ?? 0)

const lineColumns: DataTableColumns<SaleLine> = [
  { title: '行', key: 'lineNo', width: 48, render: (l) => num(l.lineNo) },
  {
    title: '商品（成交快照）',
    key: 'name',
    minWidth: 220,
    render: (l) =>
      two(
        h('span', { class: 'font-500' }, `${l.name}　${l.spec}`),
        h('span', null, [h('span', { class: 'font-mono' }, l.sku), `　条码 ${l.barcode}${l.sns.length ? `　SN ${l.sns.join(' ')}` : ''}`]),
      ),
  },
  { title: '数量', key: 'qty', width: 60, align: 'right', render: (l) => num(l.qty) },
  { title: '零售价', key: 'unitPrice', width: 120, align: 'right', render: (l) => money(l.unitPrice, { unit: true }) },
  { title: '原价金额', key: 'listAmount', width: 110, align: 'right', render: (l) => money(l.listAmount) },
  { title: '促销', key: 'promo', width: 96, align: 'right', render: (l) => money(l.promoDiscount, { discount: true }) },
  { title: '整单分摊', key: 'order', width: 96, align: 'right', render: (l) => money(l.orderDiscount, { discount: true }) },
  { title: '用券', key: 'coupon', width: 90, align: 'right', render: (l) => money(l.couponDiscount, { discount: true }) },
  { title: '改价', key: 'manual', width: 90, align: 'right', render: (l) => money(l.manualDiscount, { discount: true }) },
  { title: '实付', key: 'payable', width: 110, align: 'right', render: (l) => money(l.payable, { strong: true }) },
  { title: '导购', key: 'guide', width: 110, render: (l) => admin.who(l.guideJobNo) },
  { title: '已退', key: 'returned', width: 100, align: 'right', render: (l) => (l.returnedQty ? two(`${l.returnedQty}件`, formatMoney(l.refundedAmount)) : muted('-')) },
]

const paymentColumns: DataTableColumns<Payment> = [
  {
    title: '支付方式',
    key: 'method',
    width: 130,
    render: (p) => h('span', { class: 'flex items-center gap-2' }, [h('span', { class: 'h-8px w-8px rounded-full', style: { background: payColors[p.method] } }), PAY_METHOD[p.method].label]),
  },
  { title: '金额', key: 'amount', width: 110, align: 'right', render: (p) => money(p.amount, { strong: true }) },
  { title: '状态', key: 'status', width: 90, render: (p) => h(StatusTag, { def: PAYMENT_STATUS[p.status] }) },
  { title: '通道流水号（原样）', key: 'txn', minWidth: 200, render: (p) => (p.channelTxnNo ? mono(p.channelTxnNo) : muted(`现金 实收${formatMoney(p.tendered)} 找零${formatMoney(p.change)}`)) },
  { title: '时间', key: 'at', width: 170, render: (p) => two(dateTime(p.createdAt), p.queriedAt ? `查单确认 ${p.queriedAt.slice(11)}` : undefined) },
  { title: '已退', key: 'refunded', width: 100, align: 'right', render: (p) => (p.refunded ? money(p.refunded, { tone: 'promo' }) : muted('-')) },
]

const busy = ref(false)
async function resubmit() {
  if (!admin.user) return
  busy.value = true
  const r = await fb.run(() => api.sales.resubmit(no.value, admin.user!.jobNo))
  busy.value = false
  if (r) {
    fb.notification.info({
      title: '中枢按来源单号去重，没有再扣库存',
      content: `返回原结果单号 ${r.resultNo}，这是第${r.duplicateHits}次重复回传，本次新增库存流水 ${r.ledgerAdded} 条`,
      duration: 6000,
    })
  }
}
</script>

<template>
  <div>
    <div v-if="error" class="qs-card py-16 text-center text-t3">找不到销售单 {{ no }}</div>
    <div v-else-if="data && !inScope" class="qs-card py-16 text-center text-t3">这张单不在当前身份的数据范围内（《8.角色权限原则》§二）</div>
    <template v-else-if="data && sale">
      <PageHead :title="`销售单 ${sale.no}`">
        <template #tags>
          <StatusTag :def="SALE_STATUS[sale.status]" size="medium" />
          <AssumptionTag k="billPrefix" />
        </template>
        <template #actions>
          <n-button @click="router.push({ name: 'sales' })">
            <template #icon><span class="i-ph-arrow-u-up-left-bold" /></template>返回列表
          </n-button>
          <n-button v-if="admin.has('audit.view')" @click="router.push({ name: 'audit-trace', query: { q: sale.no } })">
            <template #icon><span class="i-ph-flow-arrow-bold" /></template>在交易追溯中打开
          </n-button>
        </template>
      </PageHead>

      <div class="qs-card mb-4 grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto] items-center gap-6 px-5 py-4 text-13px">
        <div>
          <div class="text-t3">门店</div>
          <div class="mt-0.5 text-14px font-600">{{ admin.storeText(sale.storeId) }}</div>
          <div class="text-12px text-t3">{{ store?.mode === 'franchise' ? '加盟代销：货权在强盛，款由门店收取后结算归集' : '直营：顾客付款进入强盛收款主体' }}</div>
        </div>
        <div>
          <div class="text-t3">成交时间</div>
          <div class="qs-num mt-0.5 text-14px">{{ sale.createdAt }}</div>
          <div class="text-12px text-t3">营业日 {{ sale.bizDate }}</div>
        </div>
        <div>
          <div class="text-t3">收银台 · 班次</div>
          <div class="mt-0.5 text-14px">{{ sale.registerNo }}号</div>
          <BillNo :no="sale.shiftNo" plain class="text-12px text-t3" />
        </div>
        <div>
          <div class="text-t3">收银员</div>
          <div class="mt-0.5 text-14px">{{ admin.who(sale.cashierJobNo) }}</div>
          <div class="text-12px text-t3">单头导购 {{ admin.who(sale.guideJobNo) }}</div>
        </div>
        <div>
          <div class="text-t3">会员</div>
          <div class="mt-0.5 text-14px">{{ data.member ? `${maskName(data.member.name)} ${maskPhone(data.member.phone)}` : '-' }}</div>
          <div class="text-12px text-t3">只识别本店会员 <AssumptionTag k="memberScope" /></div>
        </div>
        <div class="text-right">
          <div class="text-t3">实收 · {{ qty }}件</div>
          <MoneyText :value="sale.totals.payable" class="text-28px font-700 leading-34px" />
          <div class="text-12px text-t3">原价 {{ formatMoney(sale.totals.list) }}</div>
        </div>
      </div>

      <div class="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-4">
        <div class="flex min-w-0 flex-col gap-4">
          <n-card title="商品明细" size="small">
            <template #header-extra><span class="text-12px text-t3">价格、促销、导购都是成交时的快照；零售价4位小数</span></template>
            <n-data-table :columns="lineColumns" :data="sale.lines" :row-key="(l: SaleLine) => l.lineNo" :scroll-x="1250" :bordered="false" size="small" />
            <div class="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 text-13px text-t2">
              <span>原价合计 <MoneyText :value="sale.totals.list" /></span>
              <span>促销 <MoneyText :value="sale.totals.promo" discount /></span>
              <span>整单 <MoneyText :value="sale.totals.order" discount /></span>
              <span>用券 <MoneyText :value="sale.totals.coupon" discount /></span>
              <span>改价 <MoneyText :value="sale.totals.manual" discount /></span>
              <span class="font-600 text-t1">实收 <MoneyText :value="sale.totals.payable" strong /></span>
            </div>
          </n-card>

          <div class="grid grid-cols-2 gap-4">
            <n-card title="促销快照" size="small">
              <template #header-extra><AssumptionTag k="promoStacking" /></template>
              <div v-for="p in sale.promotions" :key="p.promotionId" class="flex items-center justify-between border-b border-line py-2 text-13px last:border-0">
                <div class="min-w-0">
                  <div class="truncate font-500">{{ p.name }}</div>
                  <div class="text-12px text-t3"><span class="font-mono">{{ p.code }}</span> · {{ PROMO_TYPE[p.type] }} · 第{{ p.lineNos.join('、') }}行</div>
                </div>
                <MoneyText :value="p.discount" discount strong />
              </div>
              <div v-if="!sale.promotions.length" class="py-3 text-center text-13px text-t3">没有命中促销</div>
              <div class="mt-2 text-12px text-t3">促销来源系统 <PendingTag id="待确认-46" /> 分摊和舍入 <AssumptionTag k="allocation" /></div>
            </n-card>
            <n-card title="改价留痕" size="small">
              <template #header-extra><PendingTag id="待确认-51" /></template>
              <div v-for="a in sale.adjustments" :key="a.lineNo" class="rounded-10px bg-[#FDF3E3] px-3 py-2 text-13px">
                <div class="font-500">第{{ a.lineNo }}行 {{ formatMoney(a.before) }} → {{ formatMoney(a.after) }}</div>
                <div class="text-12px text-[#7C4A03]">原因：{{ a.reason }} · 操作 {{ admin.who(a.operatorJobNo) }} · 授权 {{ admin.who(a.authorizerJobNo) }}</div>
                <div class="qs-num text-11px text-t3">{{ a.at }}</div>
              </div>
              <div v-if="!sale.adjustments.length" class="py-3 text-center text-13px text-t3">这张单没有改价</div>
            </n-card>
          </div>

          <n-card title="支付流水" size="small">
            <template #header-extra><span class="text-12px text-t3">以通道结果为准，结果不明只能查单 <PendingTag id="待确认-40" /></span></template>
            <n-data-table :columns="paymentColumns" :data="sale.payments" :row-key="(p: Payment) => p.id" :bordered="false" size="small" />
          </n-card>

          <n-card v-if="data.returns.length" title="退货" size="small">
            <div v-for="r in data.returns" :key="r.no" class="flex items-center gap-4 border-b border-line py-2 text-13px last:border-0">
              <BillNo :no="r.no" />
              <span class="qs-num text-t3">{{ r.createdAt }}</span>
              <span class="min-w-0 flex-1 truncate">{{ r.lines.map((l) => `${l.name}×${l.qty}`).join('、') }} · {{ r.reason }}</span>
              <MoneyText :value="r.total" tone="promo" strong />
            </div>
          </n-card>

          <div class="grid grid-cols-2 gap-4">
            <n-card title="库存流水（中枢回传）" size="small">
              <div v-for="l in data.ledger" :key="l.id" class="flex items-center justify-between border-b border-line py-1.5 text-13px last:border-0">
                <span>{{ LEDGER_TYPE[l.type] }} <span class="font-mono text-12px text-t3">{{ l.sku }}</span></span>
                <span class="qs-num"><span :class="l.change < 0 ? 'text-bad' : 'text-ok'">{{ l.change > 0 ? '+' : '' }}{{ l.change }}</span> <span class="text-t3">结存 {{ l.balanceAfter }}</span></span>
              </div>
              <div v-if="!data.ledger.length" class="py-3 text-center text-13px text-t3">没有库存流水</div>
            </n-card>
            <n-card title="操作日志" size="small">
              <div v-for="l in data.logs" :key="l.id" class="border-b border-line py-1.5 text-13px last:border-0">
                <div class="flex justify-between"><span class="font-500">{{ l.action }}</span><span class="qs-num text-12px text-t3">{{ l.at }}</span></div>
                <div class="text-12px text-t2">{{ admin.who(l.operatorJobNo) }} · {{ l.after ?? '-' }}</div>
              </div>
              <div v-if="!data.logs.length" class="py-3 text-center text-13px text-t3">没有日志</div>
            </n-card>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <n-card title="中枢回传" size="small">
            <div class="flex items-center gap-2">
              <StatusTag :def="HUB_SYNC[sale.hubSync.status]" size="medium" />
              <BillNo :no="sale.hubSync.resultNo" />
            </div>
            <div class="mt-2 grid grid-cols-2 gap-y-1 text-13px">
              <span class="text-t3">回传时间</span><span class="qs-num text-right">{{ sale.hubSync.at }}</span>
              <span class="text-t3">重复回传</span><span class="qs-num text-right">{{ sale.hubSync.duplicateHits ? `被去重${sale.hubSync.duplicateHits}次` : '无' }}</span>
              <span class="text-t3">日结</span><span class="text-right"><BillNo v-if="sale.dailyCloseNo" :no="sale.dailyCloseNo" plain /><span v-else class="text-warn">未封账</span></span>
            </div>
            <Hint tone="info" class="mt-3">
              「断网卖掉的不是第二笔」不做离线，只用重复回传演示去重：同一来源单号再送一次，中枢返回原结果单号，不再扣减。
            </Hint>
            <n-button type="primary" secondary block class="mt-3" :loading="busy" @click="resubmit">
              <template #icon><span class="i-ph-arrows-clockwise-bold" /></template>模拟重复回传
            </n-button>
          </n-card>

          <n-card title="追溯链" size="small">
            <template #header-extra><span class="text-12px text-t3">凭证在金蝶，POS不生成</span></template>
            <TraceChain v-if="trace" :nodes="trace.nodes" dense />
            <div v-else class="py-6 text-center"><n-spin size="small" /></div>
          </n-card>
        </div>
      </div>
    </template>
    <div v-else class="py-24 text-center"><n-spin /></div>
  </div>
</template>
