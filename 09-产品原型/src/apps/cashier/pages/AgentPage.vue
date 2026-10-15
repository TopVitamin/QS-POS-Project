<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { AGENT_STATUS } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { useFeedback } from '@/shared/naive/feedback'
import type { AgentOrder, Store } from '@/shared/types'
import { maskName, maskPhone } from '@/shared/utils/format'
import { timeOf, todayBizDate } from '@/shared/utils/time'
import { useCart } from '../stores/cart'
import { useSession } from '../stores/session'

const props = defineProps<{ store: Store }>()
const session = useSession()
const cart = useCart()
const fb = useFeedback()

const { data: products } = useRequest(() => api.master.products(), { live: false })
const { data: employees } = useRequest(() => api.master.employees(), { live: false })
const { data: stockRows } = useRequest(() => api.stock.list([props.store.id]))
const scope = ref<'today' | 'all'>('today')
const { data: orders } = useRequest(
  () => api.fulfil.agentOrders({ storeIds: [props.store.id], bizDate: scope.value === 'today' ? todayBizDate() : undefined }),
  { watch: [scope] },
)

const productOf = (sku: string) => products.value?.find((p) => p.sku === sku)
const availOf = (sku: string) => stockRows.value?.find((r) => r.sku === sku)?.available ?? 0
const guides = computed(() => (employees.value ?? []).filter((e) => e.active && e.duties.includes('guide') && e.storeIds.includes(props.store.id)))
const nameOf = (jobNo: string) => employees.value?.find((e) => e.jobNo === jobNo)?.name ?? jobNo

const prefill = computed(() => cart.s.agentPrefill)
const items = ref<{ sku: string; qty: number }[]>(prefill.value?.items.map((i) => ({ ...i })) ?? [])
const guideJobNo = ref(session.user?.duties.includes('guide') ? session.user.jobNo : cart.s.guideJobNo)
const customer = ref({ name: '', phone: '', address: '' })
const note = ref('')
const busy = ref(false)

const reference = computed(() => items.value.reduce((s, i) => s + (productOf(i.sku)?.price ?? 0) * i.qty, 0))

function addItem(sku: string) {
  const it = items.value.find((i) => i.sku === sku)
  if (it) it.qty += 1
  else items.value.push({ sku, qty: 1 })
}
function setQty(sku: string, qty: number) {
  if (qty <= 0) items.value = items.value.filter((i) => i.sku !== sku)
  else items.value = items.value.map((i) => (i.sku === sku ? { ...i, qty } : i))
}

const showPicker = ref(false)
const keyword = ref('')
const candidates = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return (products.value ?? []).filter(
    (p) => p.status === 'active' && (!k || p.name.toLowerCase().includes(k) || p.sku.toLowerCase().includes(k) || p.spec.toLowerCase().includes(k) || p.barcodes.includes(k)),
  )
})

function dropPrefill() {
  cart.setAgentPrefill(null)
}

async function submit() {
  if (!session.user) return
  busy.value = true
  try {
    const order = await api.fulfil.createAgentOrder({
      storeId: props.store.id,
      guideJobNo: guideJobNo.value,
      creatorJobNo: session.user.jobNo,
      source: prefill.value?.source ?? 'cashier',
      sourceRef: prefill.value?.sourceRef,
      customer: customer.value,
      items: items.value,
      note: note.value,
    })
    fb.ok('已提交中央OMS', `代客单 ${order.no}，OMS单号 ${order.oms.omsNo}。路由结果回来后在右侧查看`)
    cart.setAgentPrefill(null)
    items.value = []
    customer.value = { name: '', phone: '', address: '' }
    note.value = ''
    scope.value = 'today'
  } catch (e) {
    fb.fail(e)
  } finally {
    busy.value = false
  }
}

const steps: { key: AgentOrder['status']; label: string }[] = [
  { key: 'submitted', label: '已提交' },
  { key: 'routed', label: '已路由' },
  { key: 'shipped', label: '已发货' },
  { key: 'signed', label: '已签收' },
]
const stepIndex = (s: AgentOrder['status']) => steps.findIndex((x) => x.key === s)
const SOURCE: Record<AgentOrder['source'], string> = { cashier: '收银端', mobile: '移动端', pickup_rejected: '核销被拒' }
</script>

<template>
  <div class="flex h-full gap-4 p-4">
    <section class="qs-card flex min-w-0 flex-1 flex-col overflow-hidden">
      <div class="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <div class="text-17px font-700">代客下单</div>
        <span class="text-13px text-t3">申请，不是发货指令：POS不选仓、不选承运商，由中央OMS路由</span>
      </div>

      <div class="qs-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div v-if="prefill" class="mb-4 flex items-center gap-3 rounded-12px bg-brand-50 px-4 py-2.5 text-14px text-brand-800">
          <span class="i-ph-arrow-bend-down-right-bold text-18px" />
          <span class="flex-1">{{ prefill.reason }}，已带入商品</span>
          <n-button size="small" quaternary @click="dropPrefill">不用了</n-button>
        </div>

        <div class="mb-2 flex items-center justify-between">
          <div class="text-15px font-600">商品</div>
          <n-button size="medium" secondary type="primary" @click="showPicker = true">
            <template #icon><span class="i-ph-plus-bold" /></template>添加商品
          </n-button>
        </div>
        <div class="overflow-hidden rounded-14px border border-line">
          <div v-for="i in items" :key="i.sku" class="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
            <div class="min-w-0 flex-1">
              <div class="truncate text-15px font-600">{{ productOf(i.sku)?.name ?? i.sku }}</div>
              <div class="text-12px text-t3">
                <span class="font-mono">{{ i.sku }}</span> · {{ productOf(i.sku)?.spec }} · 本店可用 <span class="qs-num" :class="availOf(i.sku) < i.qty ? 'text-bad' : ''">{{ availOf(i.sku) }}</span>
              </div>
            </div>
            <MoneyText :value="productOf(i.sku)?.price" class="text-13px text-t3" />
            <div class="flex items-center gap-1">
              <button type="button" class="pos-press qs-flex-center h-40px w-40px rounded-10px bg-subtle text-18px" @click="setQty(i.sku, i.qty - 1)"><span class="i-ph-minus-bold" /></button>
              <span class="qs-num w-36px text-center text-18px font-700">{{ i.qty }}</span>
              <button type="button" class="pos-press qs-flex-center h-40px w-40px rounded-10px bg-subtle text-18px" @click="setQty(i.sku, i.qty + 1)"><span class="i-ph-plus-bold" /></button>
            </div>
          </div>
          <div v-if="!items.length" class="px-4 py-6 text-center text-14px text-t3">还没有商品，点「添加商品」</div>
        </div>
        <div class="mt-2 flex items-center justify-end gap-2 text-13px text-t2">
          参考金额（按下发零售价） <MoneyText :value="reference" strong class="text-16px" />
          <span class="text-t3">POS不收款</span> <AssumptionTag k="agentPayment" />
        </div>

        <div class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <n-form-item label="收货人" :show-feedback="false" size="large">
            <n-input v-model:value="customer.name" placeholder="顾客姓名" clearable />
          </n-form-item>
          <n-form-item label="手机号" :show-feedback="false" size="large">
            <n-input v-model:value="customer.phone" placeholder="11位手机号" :maxlength="11" clearable :input-props="{ inputmode: 'numeric' }" />
          </n-form-item>
          <n-form-item label="收货地址" :show-feedback="false" size="large" class="col-span-2">
            <n-input v-model:value="customer.address" placeholder="省市区和详细地址" clearable />
          </n-form-item>
          <n-form-item label="导购（业绩归属）" :show-feedback="false" size="large">
            <n-select v-model:value="guideJobNo" :options="guides.map((g) => ({ label: `${g.jobNo} ${g.name}`, value: g.jobNo }))" />
          </n-form-item>
          <n-form-item label="备注" :show-feedback="false" size="large">
            <n-input v-model:value="note" placeholder="选填" clearable />
          </n-form-item>
        </div>
      </div>

      <div class="flex items-center gap-4 border-t border-line bg-subtle px-5 py-3">
        <div class="flex-1 text-12px leading-19px text-t3">
          代发不扣本店库存，扣减发生在OMS选中的节点。承运商 <AssumptionTag k="carrier" />，提成不在POS里算 <PendingTag id="待确认-13" />
        </div>
        <button
          type="button"
          class="pos-press flex h-60px w-240px items-center justify-center gap-2 rounded-14px bg-brand-600 text-20px font-700 text-white shadow-card hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-[#A7B3B1]"
          :disabled="busy || !items.length"
          @click="submit"
        >
          <n-spin v-if="busy" :size="20" stroke="#fff" />
          <template v-else><span class="i-ph-paper-plane-tilt-fill" />提交中央OMS</template>
        </button>
      </div>
    </section>

    <aside class="qs-card flex w-430px shrink-0 flex-col overflow-hidden">
      <div class="flex items-center justify-between border-b border-line px-4 py-3">
        <div class="text-16px font-700">本店代客单</div>
        <n-radio-group v-model:value="scope" size="small">
          <n-radio-button value="today">今日</n-radio-button>
          <n-radio-button value="all">全部</n-radio-button>
        </n-radio-group>
      </div>
      <div class="qs-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <div v-for="o in orders ?? []" :key="o.no" class="mb-3 rounded-14px border border-line p-3.5 last:mb-0">
          <div class="flex items-center justify-between gap-2">
            <BillNo :no="o.no" />
            <StatusTag :def="AGENT_STATUS[o.status]" />
          </div>
          <div class="mt-1.5 text-14px font-600">{{ o.items.map((i) => `${i.name}×${i.qty}`).join('、') }}</div>
          <div class="mt-0.5 text-12px text-t3">
            {{ o.createdAt.slice(5, 16) }} · {{ SOURCE[o.source] }}<template v-if="o.sourceRef">（{{ o.sourceRef }}）</template> · 导购 {{ o.guideJobNo }} {{ nameOf(o.guideJobNo) }}
          </div>
          <div class="mt-0.5 text-12px text-t3">收货人 {{ maskName(o.customer.name) }} {{ maskPhone(o.customer.phone) }}</div>
          <div class="mt-2.5 grid grid-cols-4">
            <div v-for="(s, i) in steps" :key="s.key" class="relative flex flex-col items-center gap-1">
              <span v-if="i > 0" class="absolute right-1/2 top-4px h-2px w-full" :class="stepIndex(o.status) >= i ? 'bg-brand-500' : 'bg-line'" />
              <span class="relative h-10px w-10px rounded-full" :class="stepIndex(o.status) >= i ? 'bg-brand-500' : 'bg-line-strong'" />
              <span class="text-11px" :class="stepIndex(o.status) >= i ? 'font-600 text-brand-700' : 'text-t3'">{{ s.label }}</span>
            </div>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-10px bg-subtle px-3 py-2 text-12px">
            <div><span class="text-t3">OMS单号 </span><BillNo :no="o.oms.omsNo" /></div>
            <div><span class="text-t3">履约节点 </span>{{ o.oms.nodeName ?? '待OMS路由' }}</div>
            <div><span class="text-t3">承运商 </span>{{ o.oms.carrier ?? '-' }}</div>
            <div><span class="text-t3">运单号 </span><span class="font-mono">{{ o.oms.trackingNo ?? '-' }}</span></div>
          </div>
          <div v-if="o.status === 'routed' || o.status === 'shipped'" class="mt-1.5 text-11px text-t3">
            {{ o.status === 'routed' ? `${timeOf(o.oms.routedAt)} 由OMS路由` : `${timeOf(o.oms.shippedAt)} 已发货` }}
          </div>
        </div>
        <div v-if="orders && !orders.length" class="py-12 text-center text-14px text-t3">{{ scope === 'today' ? '今天还没有代客单' : '没有代客单' }}</div>
      </div>
      <div class="border-t border-line px-4 py-2 text-12px text-t3">路由、发货、签收由中枢模拟器推进（管理端「系统 › 中枢模拟器」）</div>
    </aside>

    <n-modal v-model:show="showPicker" preset="card" title="添加商品" :style="{ width: '720px' }">
      <n-input v-model:value="keyword" size="large" placeholder="名称、SKU、规格或条码" clearable>
        <template #prefix><span class="i-ph-magnifying-glass-bold mr-1 text-t3" /></template>
      </n-input>
      <div class="qs-scroll mt-3 max-h-420px overflow-y-auto">
        <button
          v-for="p in candidates"
          :key="p.sku"
          type="button"
          class="pos-press flex w-full items-center gap-3 border-b border-line px-2 py-2.5 text-left last:border-0 hover:bg-subtle"
          @click="addItem(p.sku)"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate text-15px font-600">{{ p.name }}</div>
            <div class="text-12px text-t3"><span class="font-mono">{{ p.sku }}</span> · {{ p.spec }}</div>
          </div>
          <span class="text-13px" :class="availOf(p.sku) ? 'text-t2' : 'text-bad'">本店可用 {{ availOf(p.sku) }}</span>
          <MoneyText :value="p.price" class="w-100px text-right text-15px font-600" />
          <span class="qs-num w-48px text-right text-13px text-brand-600">{{ items.find((i) => i.sku === p.sku) ? `已选${items.find((i) => i.sku === p.sku)!.qty}` : '' }}</span>
        </button>
      </div>
      <template #footer>
        <div class="flex justify-end"><n-button type="primary" size="large" @click="showPicker = false">完成</n-button></div>
      </template>
    </n-modal>
  </div>
</template>
