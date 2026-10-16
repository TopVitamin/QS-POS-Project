<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { DISCREPANCY_STATUS, SHIPMENT_STATUS } from '@/shared/config/labels'
import { shortDate, timeOf } from '@/shared/utils/time'
import MAssumptionTag from '../components/MAssumptionTag.vue'
import MBillNo from '../components/MBillNo.vue'
import MPendingTag from '../components/MPendingTag.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import Section from '../components/Section.vue'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const { data: shipments } = useRequest(() => api.storeops.shipments({ storeIds: [mobile.storeId] }))
const { data: discrepancies } = useRequest(() => api.storeops.discrepancies({ storeIds: [mobile.storeId] }))

const tab = ref<'in_transit' | 'received'>('in_transit')
const shown = computed(() => (shipments.value ?? []).filter((s) => s.status === tab.value))
const count = (s: 'in_transit' | 'received') => (shipments.value ?? []).filter((x) => x.status === s).length
</script>

<template>
  <div class="pb-4">
    <van-tabs v-model:active="tab" sticky offset-top="46" :border="false">
      <van-tab name="in_transit" :title="`在途待收 ${count('in_transit')}`" />
      <van-tab name="received" :title="`已收货 ${count('received')}`" />
    </van-tabs>

    <router-link v-for="s in shown" :key="s.outboundNo" :to="`/receive/${s.outboundNo}`" class="m-press mx-3 mt-3 block rounded-14px bg-white px-4 py-3 shadow-card">
      <div class="flex items-center gap-2">
        <span class="i-ph-truck-fill text-18px text-warn" />
        <MBillNo :no="s.outboundNo" class="text-13px font-600" />
        <div class="flex-1" />
        <MStatusTag :def="SHIPMENT_STATUS[s.status]" />
      </div>
      <div class="mt-1.5 text-14px">{{ s.lines.map((l) => `${l.name}×${l.qty}`).join('、') }}</div>
      <div class="mt-1 flex items-center text-12px text-t3">
        <span class="flex-1">{{ s.sourceNodeName }} · {{ shortDate(s.shippedAt) }} {{ timeOf(s.shippedAt) }} 发运<template v-if="s.replenishmentNo"> · 要货单 <MBillNo :no="s.replenishmentNo" plain /></template><template v-else-if="s.transferNo"> · 调拨单 <MBillNo :no="s.transferNo" plain /></template></span>
        <span v-if="s.status === 'in_transit' && mobile.has('storeops.manage')" class="text-brand-700">去收货</span>
        <span class="i-ph-caret-right" />
      </div>
    </router-link>
    <van-empty v-if="!shown.length" image-size="80" :description="tab === 'in_transit' ? '没有在途待收的出库单' : '还没有收货记录'" />

    <Section v-if="discrepancies?.length" title="收货差异单" desc="实收和出库不一致时另记，交中枢处理">
      <router-link v-for="d in discrepancies" :key="d.no" :to="`/receive/${d.outboundNo}`" class="m-press block border-t border-line px-4 py-2.5 first:border-0">
        <div class="flex items-center gap-2 text-13px">
          <MBillNo :no="d.no" plain />
          <div class="flex-1" />
          <MStatusTag :def="DISCREPANCY_STATUS[d.status]" />
        </div>
        <div class="mt-1 text-12px text-t2">
          <template v-for="l in d.lines" :key="l.sku">{{ l.name }} <span :class="l.diff < 0 ? 'text-bad' : 'text-ok'" class="qs-num font-600">{{ l.diff > 0 ? '+' : '' }}{{ l.diff }}</span>　</template>
        </div>
        <div class="text-12px text-t3">出库单 <MBillNo :no="d.outboundNo" plain /> · {{ shortDate(d.createdAt) }} {{ timeOf(d.createdAt) }}</div>
      </router-link>
    </Section>

    <Note>
      按来源出库单逐行录入实收，实收不预填出库数；数量不一致另记差异单，不把实收改成和出库一样（《4.全局业务规则》§四）。
      在途短少和破损的责任 <MPendingTag id="待确认-22" />，原型只生成差异单 <MAssumptionTag k="transitShortage" />
    </Note>
  </div>
</template>
