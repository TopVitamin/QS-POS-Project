<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { AGENT_STATUS, PICKUP_STATUS } from '@/shared/config/labels'
import { listsCustomer } from '@/shared/config/permissions'
import { brand } from '@/shared/theme/tokens'
import type { AgentOrder, PickupOrder } from '@/shared/types'
import { maskAddress, maskCode, maskName, maskPhone } from '@/shared/utils/format'
import { shortDate, timeOf } from '@/shared/utils/time'
import MAssumptionTag from '../components/MAssumptionTag.vue'
import MBillNo from '../components/MBillNo.vue'
import MPendingTag from '../components/MPendingTag.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import { run } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const route = useRoute()
const showCustomer = computed(() => listsCustomer(mobile.store))
const tab = ref(typeof route.query.tab === 'string' ? route.query.tab : 'pickup')
watch(
  () => route.query.tab,
  (v) => {
    if (typeof v === 'string') tab.value = v
  },
)

const { data: pickups } = useRequest(() => api.fulfil.pickups({ storeIds: [mobile.storeId] }))
const { data: agents } = useRequest(() => api.fulfil.agentOrders({ storeIds: [mobile.storeId] }))
const { data: dropships } = useRequest(() => api.fulfil.inboundDropships({ storeIds: [mobile.storeId] }))

const pickupFilter = ref<PickupOrder['status']>('pending')
const pickupRows = computed(() => (pickups.value ?? []).filter((p) => p.status === pickupFilter.value))
const pickupCount = (s: PickupOrder['status']) => (pickups.value ?? []).filter((p) => p.status === s).length

const agentFilter = ref<'doing' | 'done'>('doing')
const isDoing = (o: AgentOrder) => ['submitted', 'routed', 'shipped'].includes(o.status)
const agentRows = computed(() => (agents.value ?? []).filter((o) => (agentFilter.value === 'doing' ? isDoing(o) : !isDoing(o))))

const dropFilter = ref<'pending' | 'done'>('pending')
const dropPending = (o: AgentOrder) => o.status === 'routed'
const dropRows = computed(() => (dropships.value ?? []).filter((o) => (dropFilter.value === 'pending' ? dropPending(o) : !dropPending(o))))
const dropPendingCount = computed(() => (dropships.value ?? []).filter(dropPending).length)

const STEPS: { key: AgentOrder['status']; label: string }[] = [
  { key: 'submitted', label: '已提交' },
  { key: 'routed', label: '已路由' },
  { key: 'shipped', label: '已发货' },
  { key: 'signed', label: '已签收' },
]
const stepOf = (s: AgentOrder['status']) => STEPS.findIndex((x) => x.key === s)
const SOURCE: Record<AgentOrder['source'], string> = { cashier: '收银端', mobile: '移动端', pickup_rejected: '核销被拒' }

const openPickup = ref<PickupOrder | null>(null)
const openAgent = ref<AgentOrder | null>(null)
const currentAgent = computed(() => {
  const no = openAgent.value?.no
  if (!no) return null
  return (agents.value ?? []).find((o) => o.no === no) ?? (dropships.value ?? []).find((o) => o.no === no) ?? openAgent.value
})

const canDropship = computed(() => mobile.has('storeops.manage'))
const busy = ref('')
async function ship(no: string) {
  busy.value = `ship-${no}`
  const r = await run(() => api.fulfil.shipStoreDropship({ no, operatorJobNo: mobile.user!.jobNo }), (x) => `已发货 ${x.oms.trackingNo}`)
  busy.value = ''
  if (r) openAgent.value = r
}
async function reject(no: string) {
  busy.value = `rej-${no}`
  const r = await run(() => api.fulfil.rejectStoreDropship({ no, operatorJobNo: mobile.user!.jobNo }), '已拒单，退回OMS改派')
  busy.value = ''
  if (r) openAgent.value = null
}
</script>

<template>
  <div class="pb-4">
    <van-tabs v-model:active="tab" sticky offset-top="46" :border="false">
      <van-tab name="pickup" :title="`自提单${pickupCount('pending') ? ` ${pickupCount('pending')}` : ''}`">
        <div class="flex gap-2 px-3 pt-3">
          <button
            v-for="s in (['pending', 'verified', 'expired'] as const)"
            :key="s"
            type="button"
            class="rounded-full px-3 py-1 text-13px"
            :class="pickupFilter === s ? 'bg-brand-600 text-white' : 'bg-white text-t2'"
            @click="pickupFilter = s"
          >
            {{ PICKUP_STATUS[s].label }} {{ pickupCount(s) }}
          </button>
          <div class="flex-1" />
          <van-button v-if="mobile.has('pickup.verify')" size="small" type="primary" round icon="scan" to="/pickup">去核销</van-button>
        </div>
        <div v-for="p in pickupRows" :key="p.omsNo" class="m-press mx-3 mt-3 rounded-14px bg-white px-4 py-3 shadow-card" @click="openPickup = p">
          <div class="flex items-center gap-2">
            <span class="qs-num text-17px font-700 tracking-wider">{{ p.status === 'pending' ? maskCode(p.pickupCode) : p.pickupCode }}</span>
            <MStatusTag :def="PICKUP_STATUS[p.status]" />
            <span v-if="p.status === 'pending'" class="text-12px" :class="p.lock.status === 'locked' ? 'text-info' : 'text-bad'">{{ p.lock.status === 'locked' ? '锁定有效' : '锁定已失效' }}</span>
            <div class="flex-1" />
            <MoneyText :value="p.paidAmount" class="text-13px text-t2" />
          </div>
          <div class="mt-1.5 text-14px">{{ p.items.map((i) => `${i.name}×${i.qty}`).join('、') }}</div>
          <div class="mt-1 flex items-center gap-1 text-12px text-t3">
            <template v-if="showCustomer">
              <span>{{ maskName(p.customer.name) }} {{ maskPhone(p.customer.phone) }}</span>
              <span>·</span>
            </template>
            <span>{{ shortDate(p.createdAt) }} {{ timeOf(p.createdAt) }} 下单</span>
          </div>
          <div class="mt-1 text-12px text-t3"><MBillNo :no="p.omsNo" plain /><template v-if="p.verifiedAt"> · {{ mobile.nameOf(p.verifierJobNo) }} {{ timeOf(p.verifiedAt) }}核销</template></div>
        </div>
        <van-empty v-if="!pickupRows.length" image-size="80" :description="`没有${PICKUP_STATUS[pickupFilter].label}的自提单`" />
        <Note>
          自提单是OMS下发到本店的履约单，线上已付款，门店不再收钱。待核销的提货码只露前3位，完整的码在顾客手机上。{{ showCustomer ? '列表里的顾客信息脱敏' : '加盟店列表不展示顾客信息，核销时再看' }} <MPendingTag id="待确认-52" />，提货截止 <MAssumptionTag k="pickupDeadline" />
        </Note>
      </van-tab>

      <van-tab name="agent" title="代客单">
        <div class="flex gap-2 px-3 pt-3">
          <button
            v-for="f in ([['doing', '履约中'], ['done', '已结束']] as const)"
            :key="f[0]"
            type="button"
            class="rounded-full px-3 py-1 text-13px"
            :class="agentFilter === f[0] ? 'bg-brand-600 text-white' : 'bg-white text-t2'"
            @click="agentFilter = f[0]"
          >
            {{ f[1] }} {{ (agents ?? []).filter((o) => (f[0] === 'doing' ? isDoing(o) : !isDoing(o))).length }}
          </button>
          <div class="flex-1" />
          <van-button v-if="mobile.has('agent.create')" size="small" type="primary" round icon="plus" to="/agent/new">代客下单</van-button>
        </div>
        <div v-for="o in agentRows" :key="o.no" class="m-press mx-3 mt-3 rounded-14px bg-white px-4 py-3 shadow-card" @click="openAgent = o">
          <div class="flex items-center gap-2">
            <MBillNo :no="o.no" class="text-13px font-600" />
            <span v-if="o.oms.nodeKind === 'store'" class="rounded-4px bg-subtle px-1 text-11px text-t2">门店代发</span>
            <div class="flex-1" />
            <MStatusTag :def="AGENT_STATUS[o.status]" />
          </div>
          <div class="mt-1.5 text-14px">{{ o.items.map((i) => `${i.name}×${i.qty}`).join('、') }}</div>
          <div v-if="showCustomer" class="mt-1 text-12px text-t3">
            {{ maskName(o.customer.name) }} {{ maskPhone(o.customer.phone) }} · {{ maskAddress(o.customer.address) }}
          </div>
          <van-steps v-if="o.status !== 'cancelled'" :active="stepOf(o.status)" :active-color="brand[600]" class="!mt-1 !px-0 !pb-0">
            <van-step v-for="s in STEPS" :key="s.key">{{ s.label }}</van-step>
          </van-steps>
          <div class="mt-1 flex flex-wrap gap-x-3 text-12px text-t2">
            <span>导购 {{ mobile.who(o.guideJobNo) }}</span>
            <span>来源 {{ SOURCE[o.source] }}</span>
            <span v-if="o.oms.nodeName">发货节点 {{ o.oms.nodeName }}</span>
            <span v-if="o.oms.trackingNo">{{ o.oms.carrier }} <span class="font-mono">{{ o.oms.trackingNo }}</span></span>
          </div>
          <div class="mt-1 text-12px text-t3">{{ shortDate(o.createdAt) }} {{ timeOf(o.createdAt) }} 提交 · 参考金额 <MoneyText :value="o.referenceAmount" /></div>
        </div>
        <van-empty v-if="!agentRows.length" image-size="80" description="没有代客单" />
        <Note>
          代客单是申请，不是发货指令：发货节点和承运商都由OMS给出。区域仓发货不扣本店库存；路由到另一家店时由代发店发货并扣该店库存。业绩记在发起门店和导购工号上；不在POS收款 <MPendingTag id="待确认-06" />，承运商 <MAssumptionTag k="carrier" /><template v-if="!showCustomer">；加盟店列表不展示收货人 <MPendingTag id="待确认-52" /></template>
        </Note>
      </van-tab>

      <van-tab name="dropship" :title="`本店代发${dropPendingCount ? ` ${dropPendingCount}` : ''}`">
        <div class="flex gap-2 px-3 pt-3">
          <button
            v-for="f in ([['pending', '待代发'], ['done', '已处理']] as const)"
            :key="f[0]"
            type="button"
            class="rounded-full px-3 py-1 text-13px"
            :class="dropFilter === f[0] ? 'bg-brand-600 text-white' : 'bg-white text-t2'"
            @click="dropFilter = f[0]"
          >
            {{ f[1] }} {{ (dropships ?? []).filter((o) => (f[0] === 'pending' ? dropPending(o) : !dropPending(o))).length }}
          </button>
        </div>
        <div v-for="o in dropRows" :key="o.no" class="m-press mx-3 mt-3 rounded-14px bg-white px-4 py-3 shadow-card" @click="openAgent = o">
          <div class="flex items-center gap-2">
            <MBillNo :no="o.no" class="text-13px font-600" />
            <span class="rounded-4px bg-subtle px-1 text-11px text-t2">发起 {{ mobile.storeName(o.storeId) }}</span>
            <div class="flex-1" />
            <MStatusTag :def="AGENT_STATUS[o.status]" />
          </div>
          <div class="mt-1.5 text-14px">{{ o.items.map((i) => `${i.name}×${i.qty}`).join('、') }}</div>
          <div class="mt-1 text-12px text-t3">{{ shortDate(o.createdAt) }} {{ timeOf(o.createdAt) }} · 参考金额 <MoneyText :value="o.referenceAmount" /></div>
          <div v-if="o.oms.trackingNo" class="mt-1 text-12px text-t2">{{ o.oms.carrier }} <span class="font-mono">{{ o.oms.trackingNo }}</span></div>
        </div>
        <van-empty v-if="!dropRows.length" image-size="80" :description="dropFilter === 'pending' ? '没有待本店代发的单' : '还没有本店代发记录'" />
        <Note>
          OMS把别家店的代客单路由到本店时，发货扣本店库存，不扣发起店。店长可发货或拒单改派。履约佣金 <MPendingTag id="待确认-20" />
        </Note>
      </van-tab>
    </van-tabs>

    <van-popup :show="!!openPickup" position="bottom" round closeable teleport="body" :style="{ maxHeight: '80%' }" @update:show="(v: boolean) => !v && (openPickup = null)">
      <div v-if="openPickup" class="px-4 pb-8 pt-5">
        <div class="flex items-center gap-2">
          <span class="qs-num text-20px font-700 tracking-wider">{{ openPickup.status === 'pending' ? maskCode(openPickup.pickupCode) : openPickup.pickupCode }}</span>
          <MStatusTag :def="PICKUP_STATUS[openPickup.status]" />
        </div>
        <div class="mt-3 text-14px leading-22px text-t2">
          <div>OMS <MBillNo :no="openPickup.omsNo" plain /></div>
          <div>小程序 {{ openPickup.channelOrderNo }}</div>
          <div v-if="showCustomer">{{ maskName(openPickup.customer.name) }} {{ maskPhone(openPickup.customer.phone) }}</div>
          <div>线上已付 <MoneyText :value="openPickup.paidAmount" /></div>
          <div>锁定 {{ openPickup.lock.lockNo }} · {{ openPickup.lock.status === 'locked' ? '有效' : '已释放' }}</div>
        </div>
        <div class="mt-3 rounded-12px border border-line">
          <div v-for="i in openPickup.items" :key="i.sku" class="flex justify-between border-b border-line px-3 py-2 last:border-0">
            <span>{{ i.name }} <span class="text-12px text-t3">{{ i.spec }}</span></span>
            <span class="qs-num font-600">× {{ i.qty }}</span>
          </div>
        </div>
        <van-button v-if="openPickup.status === 'pending' && mobile.has('pickup.verify')" block round type="primary" class="mt-4" to="/pickup">去核销</van-button>
      </div>
    </van-popup>

    <van-popup :show="!!currentAgent" position="bottom" round closeable teleport="body" :style="{ maxHeight: '85%' }" @update:show="(v: boolean) => !v && (openAgent = null)">
      <div v-if="currentAgent" class="px-4 pb-8 pt-5">
        <div class="flex items-center gap-2">
          <MBillNo :no="currentAgent.no" class="text-15px font-700" />
          <MStatusTag :def="AGENT_STATUS[currentAgent.status]" />
        </div>
        <div class="mt-3 text-14px leading-22px text-t2">
          <div>发起 {{ mobile.storeName(currentAgent.storeId) }} · {{ SOURCE[currentAgent.source] }}</div>
          <div>导购 {{ mobile.who(currentAgent.guideJobNo) }}</div>
          <div v-if="showCustomer || currentAgent.oms.nodeStoreId === mobile.storeId">
            {{ maskName(currentAgent.customer.name) }} {{ maskPhone(currentAgent.customer.phone) }} · {{ maskAddress(currentAgent.customer.address) }}
          </div>
          <div v-if="currentAgent.oms.nodeName">{{ currentAgent.oms.nodeKind === 'store' ? '代发门店' : '履约节点' }} {{ currentAgent.oms.nodeName }}</div>
          <div v-if="currentAgent.oms.trackingNo">{{ currentAgent.oms.carrier }} <span class="font-mono">{{ currentAgent.oms.trackingNo }}</span></div>
          <div v-if="currentAgent.oms.rejectNote">{{ currentAgent.oms.rejectNote }}</div>
          <div v-if="currentAgent.note">备注 {{ currentAgent.note }}</div>
        </div>
        <div class="mt-3 rounded-12px border border-line">
          <div v-for="i in currentAgent.items" :key="i.sku" class="flex justify-between border-b border-line px-3 py-2 last:border-0">
            <span>{{ i.name }} <span class="text-12px text-t3">{{ i.spec }}</span></span>
            <span class="qs-num font-600">× {{ i.qty }}</span>
          </div>
        </div>
        <div class="mt-2 text-12px text-t3">参考金额 <MoneyText :value="currentAgent.referenceAmount" /> · POS不收款</div>
        <div v-if="canDropship && currentAgent.oms.nodeKind === 'store' && currentAgent.oms.nodeStoreId === mobile.storeId && currentAgent.status === 'routed'" class="mt-4 flex gap-2">
          <van-button block round :loading="busy.startsWith('rej')" :disabled="!!busy" @click="reject(currentAgent.no)">拒单改派</van-button>
          <van-button block round type="primary" :loading="busy.startsWith('ship')" :disabled="!!busy" @click="ship(currentAgent.no)">确认发货</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>
