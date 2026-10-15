<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDialog } from 'naive-ui'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { AGENT_STATUS, REPLENISH_STATUS, RTW_STATUS } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import { useFeedback } from '@/shared/naive/feedback'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { PayOutcome } from '@/shared/mock/schema'
import type { PickupOrder, SkuQtyLine } from '@/shared/types'
import { codeName } from '@/shared/utils/format'
import SkuQtyEditor from '../../components/SkuQtyEditor.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const fb = useFeedback()
const dialog = useDialog()

const { data: ov } = useRequest(() => api.hubsim.overview())
const { data: products } = useRequest(() => api.master.products(), { live: false })
const storeName = (id: string) => ov.value?.stores.find((s) => s.id === id)?.name ?? id
const linesText = (lines: Pick<SkuQtyLine, 'name' | 'qty'>[]) => lines.map((l) => `${l.name}×${l.qty}`).join('、')

/** 点了哪个按钮，哪个按钮转圈 */
const busy = ref('')
async function act<T>(key: string, task: () => Promise<T>, okText: string | ((r: T) => string)) {
  busy.value = key
  const r = await fb.run(task, okText)
  busy.value = ''
  return r
}

// ---------- 支付通道 ----------
const OUTCOMES: { value: PayOutcome; label: string }[] = [
  { value: 'success', label: '成功' },
  { value: 'pending', label: '结果不明' },
  { value: 'failed', label: '失败' },
]
const setOutcome = (v: PayOutcome) => act('pay', () => api.hubsim.setNextPayResult(v), v === 'success' ? '下一笔按成功返回' : `下一笔非现金支付返回「${OUTCOMES.find((o) => o.value === v)!.label}」`)

// ---------- 小程序下单 ----------
const form = ref({ storeId: 's01', items: [] as { sku: string; qty: number }[], name: '演示顾客', phone: '13900139099' })
const { data: stock } = useRequest(() => api.stock.list([form.value.storeId]), { watch: [() => form.value.storeId] })
const stockHint = (sku: string) => `该店可用 ${stock.value?.find((r) => r.sku === sku)?.available ?? 0}`
watch(
  () => form.value.storeId,
  () => (form.value.items = []),
)
const storeOptions = computed(() => (ov.value?.stores ?? []).map((s) => ({ label: `${codeName(s.code, s.name)}（${s.mode === 'direct' ? '直营' : '加盟'}）`, value: s.id })))
const created = ref<PickupOrder | null>(null)
async function createPickup() {
  const f = form.value
  const r = await act('create', () => api.hubsim.createPickup({ storeId: f.storeId, items: f.items, customer: { name: f.name.trim() || '演示顾客', phone: f.phone.trim() } }), (o) => `中枢已锁定${storeName(o.storeId)}的库存，出码 ${o.pickupCode}`)
  if (r) {
    created.value = r
    form.value.items = []
  }
}

const hub = api.hubsim
const invalidateLock = (omsNo: string) => act(`lock-${omsNo}`, () => hub.invalidateLock(omsNo), '锁定已失效，再核销会被拒')
const expirePickup = (omsNo: string) => act(`exp-${omsNo}`, () => hub.expirePickup(omsNo), '中枢已判过期，锁定释放')
const toggleRouting = (storeId: string) =>
  act(`route-${storeId}`, () => hub.toggleRoutingPause(storeId), (s) => `${s.name}${s.pausedForRouting ? '临时停接' : '恢复接单'}`)

// ---------- 要货、代客单、退仓、差异、缴款、结算 ----------
const review = (no: string, approve: boolean) =>
  act(`${approve ? 'ok' : 'rej'}-${no}`, () => hub.reviewReplenishment(no, approve, ''), approve ? '审核通过，调出仓深圳主仓' : '已驳回')
const shipReplenishment = (no: string) => act(`ship-${no}`, () => hub.shipReplenishment(no), (s) => `已发运，出库单 ${s.outboundNo}，门店在途增加`)

const routeTo = ref<Record<string, string>>({})
const nodeOptions = computed(() => (ov.value?.nodes ?? []).map((n) => ({ label: codeName(n.code, n.name), value: n.name })))
const nodeOf = (no: string) => routeTo.value[no] ?? '深圳主仓'
const routeAgent = (no: string) => act(`rt-${no}`, () => hub.routeAgent(no, nodeOf(no)), `OMS已路由到${nodeOf(no)}`)
const shipAgent = (no: string) => act(`sp-${no}`, () => hub.shipAgent(no), 'WMS已拣发，承运商顺丰')
const signAgent = (no: string) => act(`sg-${no}`, () => hub.signAgent(no), '顾客已签收')

const approveRtw = (no: string) => act(`ra-${no}`, () => hub.approveRtw(no), '中枢已同意，退往深圳主仓')
const shipRtw = (no: string) => act(`rs-${no}`, () => hub.shipRtw(no), '已交运，门店账面扣减')
const handleDiscrepancy = (no: string) => act(`dh-${no}`, () => hub.handleDiscrepancy(no), '差异单已处理')
const confirmRemittance = (no: string) => act(`rc-${no}`, () => hub.confirmRemittance(no), '中枢已核对，对应应缴改为已核对')
const issueSettlement = (franchiseeId: string) => act(`st-${franchiseeId}`, () => hub.issueSettlement(franchiseeId), (s) => `已出结算单 ${s.no}`)

function reset() {
  dialog.warning({
    title: '重置演示数据',
    content: '三个端共用的本地演示库会按种子重新生成，刚才做过的开单、核销、日结都会清掉。',
    positiveText: '重置',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.master.reset()
      created.value = null
      fb.ok('演示数据已重置')
    },
  })
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-5 rounded-16px bg-ink-900 px-6 py-5 text-white shadow-card">
      <span class="qs-flex-center h-48px w-48px shrink-0 rounded-14px bg-white/8 text-26px text-volt-400"><span class="i-ph-cpu-fill" /></span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-20px font-700">中枢模拟器</span>
          <span class="rounded-6px bg-volt-400 px-2 text-12px font-700 leading-20px text-ink-900">演示工具，不属于POS</span>
        </div>
        <div class="mt-1 text-13px leading-20px text-white/65">
          把中枢、OMS、WMS和支付通道那一侧的动作做成按钮，相当于上游系统回来的结果。POS页面只经过接口层读写，这一页不计入权限，任何身份都能用
        </div>
      </div>
      <div v-if="ov" class="grid shrink-0 grid-cols-4 gap-5 text-center">
        <div><div class="qs-num text-20px font-700">{{ ov.counts.sales }}</div><div class="text-12px text-white/50">销售单</div></div>
        <div><div class="qs-num text-20px font-700">{{ ov.counts.ledger }}</div><div class="text-12px text-white/50">库存流水</div></div>
        <div><div class="qs-num text-20px font-700">{{ ov.counts.logs }}</div><div class="text-12px text-white/50">操作日志</div></div>
        <div><div class="qs-num text-20px font-700">{{ ov.counts.hubProcessed }}</div><div class="text-12px text-white/50">去重来源键</div></div>
      </div>
      <div class="shrink-0 border-l border-white/10 pl-5 text-right">
        <div class="text-12px text-white/50">种子生成于</div>
        <div class="qs-num text-13px text-white/80">{{ ov?.seededAt ?? '-' }}</div>
        <n-button size="small" class="mt-2" color="#FFD43B" text-color="#0C2624" @click="reset">
          <template #icon><span class="i-ph-arrow-counter-clockwise-bold" /></template>重置演示数据
        </n-button>
      </div>
    </div>

    <div v-if="!ov" class="py-20 text-center"><n-spin /></div>
    <div v-else class="grid grid-cols-2 items-start gap-4">
      <div class="flex min-w-0 flex-col gap-4">
        <n-card title="支付通道" size="small">
          <template #header-extra><span class="text-12px text-t3">只影响下一笔非现金支付，用一次后回到成功</span></template>
          <n-radio-group :value="ov.sim.nextPayResult" :disabled="busy === 'pay'" @update:value="(v: string | number | boolean) => setOutcome(v as PayOutcome)">
            <n-radio-button v-for="o in OUTCOMES" :key="o.value" :value="o.value" :label="o.label" />
          </n-radio-group>
          <div class="mt-2 text-12px text-t3">「结果不明」用来演示查单：POS只能按通道查单，不能手工改成成功（《4.全局业务规则》§三）。通道直连还是走聚合服务商 <PendingTag id="待确认-40" /></div>
        </n-card>

        <n-card title="小程序顾客下单，选门店自提" size="small">
          <template #header-extra><span class="text-12px text-t3">中枢先锁定该店库存，锁定成功才出码</span></template>
          <div class="flex flex-col gap-3">
            <div class="flex gap-3">
              <n-select v-model:value="form.storeId" :options="storeOptions" class="flex-1" />
              <n-input v-model:value="form.name" placeholder="顾客" class="!w-120px" />
              <n-input v-model:value="form.phone" placeholder="手机号" class="!w-150px" />
            </div>
            <SkuQtyEditor v-model="form.items" :products="products ?? []" :hint="stockHint" :max="99" />
            <div class="flex items-center justify-between gap-3">
              <span class="text-12px text-t3">锁不到就不出码；该店临时停接时中枢不会派单过去。线上已付款，门店不再收钱，也不进加盟应缴</span>
              <n-button type="primary" :loading="busy === 'create'" :disabled="!form.items.length" @click="createPickup">下单并锁定</n-button>
            </div>
            <div v-if="created" class="flex items-center gap-4 rounded-12px bg-brand-50 px-4 py-3">
              <div>
                <div class="text-12px text-brand-700">顾客手机上的码</div>
                <div class="qs-num text-30px font-700 tracking-[0.12em] text-brand-700">{{ created.pickupCode }}</div>
              </div>
              <div class="min-w-0 flex-1 text-13px leading-20px">
                <div>{{ storeName(created.storeId) }} · {{ linesText(created.items) }}</div>
                <div class="text-12px text-t3">OMS单号 <BillNo :no="created.omsNo" plain /> · 锁定 <BillNo :no="created.lock.lockNo" plain /></div>
              </div>
              <div class="flex shrink-0 flex-col gap-1 text-13px">
                <a href="./cashier.html#/pickup" target="_blank" class="text-brand-700 hover:underline">去收银端核销</a>
                <a href="./mobile.html#/pickup" target="_blank" class="text-brand-700 hover:underline">去移动端核销</a>
              </div>
            </div>
          </div>
        </n-card>

        <n-card size="small">
          <template #header>待核销自提单 <span class="qs-num text-t3">{{ ov.pickups.length }}</span></template>
          <template #header-extra><AssumptionTag k="pickupDeadline" /></template>
          <div v-for="p in ov.pickups" :key="p.omsNo" class="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
            <span class="qs-num w-76px shrink-0 text-18px font-700 tracking-wider">{{ p.pickupCode }}</span>
            <div class="min-w-0 flex-1 leading-tight">
              <div class="truncate text-13px">{{ storeName(p.storeId) }} · {{ linesText(p.items) }}</div>
              <div class="text-12px text-t3">
                {{ p.createdAt.slice(5, 16) }} 下单 ·
                <span :class="p.lock.status === 'locked' ? 'text-info' : 'text-bad'">{{ p.lock.status === 'locked' ? '锁定有效' : '锁定已失效' }}</span>
              </div>
            </div>
            <n-button size="small" :disabled="p.lock.status !== 'locked'" :loading="busy === `lock-${p.omsNo}`" @click="invalidateLock(p.omsNo)">让锁定失效</n-button>
            <n-button size="small" :loading="busy === `exp-${p.omsNo}`" @click="expirePickup(p.omsNo)">判过期</n-button>
          </div>
          <div v-if="!ov.pickups.length" class="py-3 text-center text-13px text-t3">没有待核销的自提单</div>
        </n-card>

        <n-card title="门店接单开关" size="small">
          <template #header-extra><span class="text-12px text-t3">盘点或停业时临时不接自提和代发，不改合同上的「参与路由」</span></template>
          <div v-for="s in ov.stores" :key="s.id" class="flex items-center gap-3 border-b border-line py-2 last:border-0">
            <span class="min-w-0 flex-1 text-13px">{{ codeName(s.code, s.name) }} <span class="text-t3">（{{ s.mode === 'direct' ? '直营' : '加盟' }}）</span></span>
            <span class="text-12px" :class="s.pausedForRouting ? 'text-bad' : 'text-ok'">{{ s.pausedForRouting ? '临时停接' : '接单中' }}</span>
            <n-switch :value="!s.pausedForRouting" :loading="busy === `route-${s.id}`" @update:value="toggleRouting(s.id)" />
          </div>
          <div class="mt-2 text-12px text-t3">依据《7.模式说明》§2.3。停接后中枢不再往这家店派自提单</div>
        </n-card>
      </div>

      <div class="flex min-w-0 flex-col gap-4">
        <n-card size="small">
          <template #header>要货审核和发运 <span class="qs-num text-t3">{{ ov.replenishments.length }}</span></template>
          <template #header-extra><AssumptionTag k="replenishReview" /></template>
          <div v-for="r in ov.replenishments" :key="r.no" class="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
            <div class="min-w-0 flex-1 leading-tight">
              <div class="flex items-center gap-2 text-13px"><BillNo :no="r.no" plain /><StatusTag :def="REPLENISH_STATUS[r.status]" /></div>
              <div class="mt-0.5 truncate text-12px text-t3">{{ storeName(r.storeId) }} · {{ linesText(r.lines) }}</div>
            </div>
            <template v-if="r.status === 'reviewing'">
              <n-button size="small" :loading="busy === `rej-${r.no}`" @click="review(r.no, false)">驳回</n-button>
              <n-button size="small" type="primary" :loading="busy === `ok-${r.no}`" @click="review(r.no, true)">通过</n-button>
            </template>
            <n-button v-else size="small" type="primary" secondary :loading="busy === `ship-${r.no}`" @click="shipReplenishment(r.no)">调拨发运</n-button>
          </div>
          <div v-if="!ov.replenishments.length" class="py-3 text-center text-13px text-t3">没有待审核或待发运的要货单</div>
        </n-card>

        <n-card size="small">
          <template #header>代客单履约 <span class="qs-num text-t3">{{ ov.agentOrders.length }}</span></template>
          <template #header-extra><AssumptionTag k="carrier" /></template>
          <div v-for="o in ov.agentOrders" :key="o.no" class="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
            <div class="min-w-0 flex-1 leading-tight">
              <div class="flex items-center gap-2 text-13px"><BillNo :no="o.no" plain /><StatusTag :def="AGENT_STATUS[o.status]" /></div>
              <div class="mt-0.5 truncate text-12px text-t3">{{ storeName(o.storeId) }}发起 · {{ linesText(o.items) }}<template v-if="o.oms.nodeName"> · {{ o.oms.nodeName }}</template></div>
            </div>
            <template v-if="o.status === 'submitted'">
              <n-select :value="nodeOf(o.no)" :options="nodeOptions" size="small" class="!w-170px" @update:value="(v: string) => (routeTo[o.no] = v)" />
              <n-button size="small" type="primary" :loading="busy === `rt-${o.no}`" @click="routeAgent(o.no)">OMS路由</n-button>
            </template>
            <n-button v-else-if="o.status === 'routed'" size="small" type="primary" secondary :loading="busy === `sp-${o.no}`" @click="shipAgent(o.no)">拣发</n-button>
            <n-button v-else size="small" secondary :loading="busy === `sg-${o.no}`" @click="signAgent(o.no)">签收</n-button>
          </div>
          <div v-if="!ov.agentOrders.length" class="py-3 text-center text-13px text-t3">没有在途的代客单</div>
          <div class="mt-2 text-12px text-t3">POS不选仓、不选承运商；区域仓发货不扣发起店的库存（《4.全局业务规则》§二）。原型只路由到区域仓，门店被OMS选为发货店的代发还没做</div>
        </n-card>

        <n-card size="small">
          <template #header>退仓 <span class="qs-num text-t3">{{ ov.rtws.length }}</span></template>
          <div v-for="r in ov.rtws" :key="r.no" class="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
            <div class="min-w-0 flex-1 leading-tight">
              <div class="flex items-center gap-2 text-13px"><BillNo :no="r.no" plain /><StatusTag :def="RTW_STATUS[r.status]" /></div>
              <div class="mt-0.5 truncate text-12px text-t3">{{ storeName(r.storeId) }} · {{ r.reason }} · {{ linesText(r.lines) }}</div>
            </div>
            <n-button v-if="r.status === 'submitted'" size="small" type="primary" :loading="busy === `ra-${r.no}`" @click="approveRtw(r.no)">同意</n-button>
            <n-button v-else size="small" type="primary" secondary :loading="busy === `rs-${r.no}`" @click="shipRtw(r.no)">交运出库</n-button>
          </div>
          <div v-if="!ov.rtws.length" class="py-3 text-center text-13px text-t3">没有待处理的退仓单</div>
        </n-card>

        <n-card size="small">
          <template #header>收货差异 <span class="qs-num text-t3">{{ ov.discrepancies.length }}</span></template>
          <template #header-extra><AssumptionTag k="transitShortage" /></template>
          <div v-for="d in ov.discrepancies" :key="d.no" class="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
            <div class="min-w-0 flex-1 leading-tight">
              <div class="text-13px"><BillNo :no="d.no" plain /></div>
              <div class="mt-0.5 truncate text-12px text-t3">
                {{ storeName(d.storeId) }} ·
                <template v-for="l in d.lines" :key="l.sku">{{ l.name }} <span :class="l.diff < 0 ? 'text-bad' : 'text-ok'">{{ l.diff > 0 ? '+' : '' }}{{ l.diff }}</span> </template>
              </div>
            </div>
            <n-button size="small" :loading="busy === `dh-${d.no}`" @click="handleDiscrepancy(d.no)">标为已处理</n-button>
          </div>
          <div v-if="!ov.discrepancies.length" class="py-3 text-center text-13px text-t3">没有待处理的差异单</div>
          <div class="mt-2 text-12px text-t3">只改状态，不判责任，不出赔偿金额 <PendingTag id="待确认-22" /></div>
        </n-card>

        <n-card size="small">
          <template #header>加盟缴款核对 <span class="qs-num text-t3">{{ ov.remittances.length }}</span></template>
          <div v-for="r in ov.remittances" :key="r.no" class="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
            <div class="min-w-0 flex-1 leading-tight">
              <div class="flex items-center gap-2 text-13px">
                <span class="font-mono">{{ r.voucherNo }}</span>
                <MoneyText :value="r.amount" strong />
              </div>
              <div class="mt-0.5 truncate text-12px text-t3">{{ admin.franchiseeText(r.franchiseeId) }} · {{ r.method }} · {{ r.dueNos.length }}笔应缴 · {{ admin.who(r.registrantJobNo) }}登记</div>
            </div>
            <n-button size="small" type="primary" :loading="busy === `rc-${r.no}`" @click="confirmRemittance(r.no)">核对到账</n-button>
          </div>
          <div v-if="!ov.remittances.length" class="py-3 text-center text-13px text-t3">没有待核对的缴款</div>
          <div class="mt-2 text-12px text-t3">上缴全额还是净额、时限 <PendingTag id="待确认-17" /></div>
        </n-card>

        <n-card title="加盟结算单" size="small">
          <template #header-extra><AssumptionTag k="settlementPeriod" /></template>
          <div v-for="f in ov.franchisees" :key="f.id" class="flex items-center gap-3 border-b border-line py-2 last:border-0">
            <span class="min-w-0 flex-1 text-13px">{{ codeName(f.code, f.name) }} <span class="text-t3">· {{ f.storeIds.map(storeName).join('、') }}</span></span>
            <n-button size="small" :loading="busy === `st-${f.id}`" @click="issueSettlement(f.id)">出一张演示结算单</n-button>
          </div>
          <div class="mt-2 text-12px text-t3">取过去7个营业日已封账的应缴和已核对的缴款；分成、佣金、赔偿、保证金规则未定，不出金额。结算周期 <PendingTag id="待确认-19" />，放在中枢还是金蝶 <PendingTag id="待确认-38" /></div>
        </n-card>
      </div>
    </div>
  </div>
</template>
