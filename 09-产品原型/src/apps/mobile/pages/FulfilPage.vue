<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { useMobile } from '../stores/session'

const mobile = useMobile()
const route = useRoute()
const showCustomer = computed(() => listsCustomer(mobile.store))
const tab = ref(route.query.tab === 'agent' ? 'agent' : 'pickup')

const { data: pickups } = useRequest(() => api.fulfil.pickups({ storeIds: [mobile.storeId] }))
const { data: agents } = useRequest(() => api.fulfil.agentOrders({ storeIds: [mobile.storeId] }))

const pickupFilter = ref<PickupOrder['status']>('pending')
const pickupRows = computed(() => (pickups.value ?? []).filter((p) => p.status === pickupFilter.value))
const pickupCount = (s: PickupOrder['status']) => (pickups.value ?? []).filter((p) => p.status === s).length

const agentFilter = ref<'doing' | 'done'>('doing')
const isDoing = (o: AgentOrder) => ['submitted', 'routed', 'shipped'].includes(o.status)
const agentRows = computed(() => (agents.value ?? []).filter((o) => (agentFilter.value === 'doing' ? isDoing(o) : !isDoing(o))))

const STEPS: { key: AgentOrder['status']; label: string }[] = [
  { key: 'submitted', label: '已提交' },
  { key: 'routed', label: '已路由' },
  { key: 'shipped', label: '已发货' },
  { key: 'signed', label: '已签收' },
]
const stepOf = (s: AgentOrder['status']) => STEPS.findIndex((x) => x.key === s)
const SOURCE: Record<AgentOrder['source'], string> = { cashier: '收银端', mobile: '移动端', pickup_rejected: '核销被拒' }
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
        <div v-for="p in pickupRows" :key="p.omsNo" class="mx-3 mt-3 rounded-14px bg-white px-4 py-3 shadow-card">
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
        <div v-for="o in agentRows" :key="o.no" class="mx-3 mt-3 rounded-14px bg-white px-4 py-3 shadow-card">
          <div class="flex items-center gap-2">
            <MBillNo :no="o.no" class="text-13px font-600" />
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
          代客单是申请，不是发货指令：发货节点和承运商都由OMS给出，区域仓发货不扣本店库存。业绩记在发起门店和导购工号上；不在POS收款 <MPendingTag id="待确认-06" />，承运商 <MAssumptionTag k="carrier" /><template v-if="!showCustomer">；加盟店列表不展示收货人 <MPendingTag id="待确认-52" /></template>
        </Note>
      </van-tab>
    </van-tabs>
  </div>
</template>
