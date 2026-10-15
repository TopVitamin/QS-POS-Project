<script setup lang="ts">
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { REPLENISH_STATUS } from '@/shared/config/labels'
import { shortDate, timeOf } from '@/shared/utils/time'
import MAssumptionTag from '../components/MAssumptionTag.vue'
import MBillNo from '../components/MBillNo.vue'
import MPendingTag from '../components/MPendingTag.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const { data: rows } = useRequest(() => api.storeops.replenishments({ storeIds: [mobile.storeId] }))
</script>

<template>
  <div class="pb-4">
    <div v-if="mobile.has('storeops.manage')" class="px-3 pt-3">
      <van-button block round type="primary" icon="plus" to="/replenish/new">新建要货单</van-button>
    </div>

    <div v-for="r in rows ?? []" :key="r.no" class="mx-3 mt-3 rounded-14px bg-white px-4 py-3 shadow-card">
      <div class="flex items-center gap-2">
        <MBillNo :no="r.no" class="text-13px font-600" />
        <div class="flex-1" />
        <MStatusTag :def="REPLENISH_STATUS[r.status]" />
      </div>
      <div class="mt-1.5 text-14px">{{ r.lines.map((l) => `${l.name}×${l.qty}`).join('、') }}</div>
      <div class="mt-1 text-12px text-t3">{{ shortDate(r.createdAt) }} {{ timeOf(r.createdAt) }} · {{ mobile.who(r.creatorJobNo) }}提交<template v-if="r.note"> · {{ r.note }}</template></div>
      <div v-if="r.hub.reviewedAt || r.hub.outboundNo" class="mt-2 rounded-10px bg-subtle px-3 py-2 text-12px leading-19px text-t2">
        <div v-if="r.hub.reviewedAt">中枢 {{ shortDate(r.hub.reviewedAt) }} {{ timeOf(r.hub.reviewedAt) }} {{ r.status === 'rejected' ? '驳回' : '审核通过' }}<template v-if="r.hub.reviewNote">：{{ r.hub.reviewNote }}</template></div>
        <div v-if="r.hub.sourceNodeName && r.status !== 'rejected'">调出仓 {{ r.hub.sourceNodeName }}</div>
        <router-link v-if="r.hub.outboundNo" :to="`/receive/${r.hub.outboundNo}`" class="flex items-center gap-1 text-brand-700">
          出库单 <MBillNo :no="r.hub.outboundNo" plain /><span class="i-ph-caret-right" />
        </router-link>
      </div>
    </div>
    <van-empty v-if="rows && !rows.length" image-size="80" description="还没有要货单" />

    <Note>
      要货单是申请。审核前和在途期间本店可用都不变，按出库单收货回传后才增加（《4.全局业务规则》§二）。原型由中枢模拟器审核和发运 <MAssumptionTag k="replenishReview" />；
      审核人和安全库存天数 <MPendingTag id="待确认-48" />，直送、直通和超期未收 <MPendingTag id="待确认-41" />
    </Note>
  </div>
</template>
