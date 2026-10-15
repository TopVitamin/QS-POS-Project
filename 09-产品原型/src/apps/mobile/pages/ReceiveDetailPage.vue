<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { showDialog } from 'vant'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { DISCREPANCY_STATUS, SHIPMENT_STATUS } from '@/shared/config/labels'
import { shortDate, timeOf } from '@/shared/utils/time'
import BottomBar from '../components/BottomBar.vue'
import MBillNo from '../components/MBillNo.vue'
import MPendingTag from '../components/MPendingTag.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import Section from '../components/Section.vue'
import { alertFail } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const route = useRoute()
const no = computed(() => String(route.params.no))
const { data, error } = useRequest(() => api.storeops.shipment(no.value))

const shipment = computed(() => data.value?.shipment)
const canReceive = computed(() => shipment.value?.status === 'in_transit' && mobile.has('storeops.manage') && shipment.value.storeId === mobile.storeId)

/** 实收输入框不预填出库数，空着就是还没点数 */
const input = ref<Record<string, string>>({})
const valueOf = (sku: string): number | null => {
  const v = input.value[sku]
  return v === undefined || v === '' ? null : Number(v)
}
const entered = computed(() => shipment.value?.lines.filter((l) => valueOf(l.sku) !== null).length ?? 0)
const allEntered = computed(() => !!shipment.value && entered.value === shipment.value.lines.length)

const busy = ref(false)
async function submit() {
  const s = shipment.value
  if (!s) return
  busy.value = true
  try {
    const r = await api.storeops.receive({
      outboundNo: s.outboundNo,
      received: Object.fromEntries(s.lines.map((l) => [l.sku, valueOf(l.sku)])),
      operatorJobNo: mobile.user!.jobNo,
    })
    await showDialog({
      title: r.discrepancy ? '已收货，另生成差异单' : '已收货',
      message: r.discrepancy
        ? `收货单 ${r.receipt.no}\n差异单 ${r.discrepancy.no}，交中枢处理。中枢按实收增加本店库存`
        : `收货单 ${r.receipt.no}\n实收和出库一致，中枢按实收增加本店库存`,
      messageAlign: 'left',
      confirmButtonText: '好的',
    })
  } catch (e) {
    alertFail(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="pb-4">
    <van-empty v-if="error" image="error" description="找不到这张出库单" />
    <template v-else-if="shipment">
      <div class="mx-3 mt-3 rounded-14px bg-white px-4 py-3.5 shadow-card">
        <div class="flex items-center gap-2">
          <MBillNo :no="shipment.outboundNo" class="text-14px font-600" />
          <div class="flex-1" />
          <MStatusTag :def="SHIPMENT_STATUS[shipment.status]" />
        </div>
        <div class="mt-1.5 grid grid-cols-2 gap-y-1 text-12px text-t2">
          <span>调出 {{ shipment.sourceNodeName }}</span>
          <span>发运 {{ shortDate(shipment.shippedAt) }} {{ timeOf(shipment.shippedAt) }}</span>
          <span>要货单 <MBillNo :no="shipment.replenishmentNo" plain /></span>
          <span>{{ shipment.lines.length }}行 · {{ shipment.lines.reduce((s, l) => s + l.qty, 0) }}件</span>
        </div>
        <div class="mt-1.5 text-12px text-t3">出库单号按中枢原样保存，收货单必须指回这张出库单</div>
      </div>

      <Section v-if="canReceive" title="逐行点数后录入实收">
        <template #extra><span class="text-12px text-t3">已录 {{ entered }}/{{ shipment.lines.length }}</span></template>
        <div v-for="l in shipment.lines" :key="l.sku" class="flex items-center gap-3 border-t border-line px-4 py-3 first:border-0">
          <div class="min-w-0 flex-1">
            <div class="truncate text-14px font-500">{{ l.name }}</div>
            <div class="text-12px text-t3">出库 <b class="qs-num text-t2">{{ l.qty }}</b>
              <template v-if="valueOf(l.sku) !== null && valueOf(l.sku) !== l.qty">
                · <span :class="(valueOf(l.sku) as number) < l.qty ? 'text-bad' : 'text-ok'">差 {{ (valueOf(l.sku) as number) - l.qty > 0 ? '+' : '' }}{{ (valueOf(l.sku) as number) - l.qty }}</span>
              </template>
            </div>
          </div>
          <input
            v-model="input[l.sku]"
            inputmode="numeric"
            placeholder="实收"
            class="qs-num h-40px w-80px rounded-10px border border-line-strong bg-subtle px-2 text-center text-17px font-600 outline-none focus:border-brand-500"
            @input="input[l.sku] = (input[l.sku] ?? '').replace(/\D/g, '').slice(0, 4)"
          />
        </div>
      </Section>

      <Section v-else-if="data?.receipt" title="收货结果">
        <template #extra><MBillNo :no="data.receipt.no" class="text-12px" /></template>
        <div class="grid grid-cols-[1fr_52px_52px_52px] gap-x-2 border-b border-line bg-subtle px-4 py-1.5 text-12px text-t3">
          <span>商品</span><span class="text-right">出库</span><span class="text-right">实收</span><span class="text-right">差异</span>
        </div>
        <div v-for="l in data.receipt.lines" :key="l.sku" class="grid grid-cols-[1fr_52px_52px_52px] items-center gap-x-2 border-b border-line px-4 py-2.5 text-13px last:border-0">
          <span class="truncate">{{ l.name }}</span>
          <span class="qs-num text-right">{{ l.shippedQty }}</span>
          <span class="qs-num text-right font-600">{{ l.receivedQty }}</span>
          <span class="qs-num text-right" :class="l.receivedQty === l.shippedQty ? 'text-t3' : l.receivedQty < l.shippedQty ? 'text-bad' : 'text-ok'">
            {{ l.receivedQty === l.shippedQty ? '-' : `${l.receivedQty - l.shippedQty > 0 ? '+' : ''}${l.receivedQty - l.shippedQty}` }}
          </span>
        </div>
        <div class="border-t border-line px-4 py-2.5 text-12px leading-19px text-t2">
          {{ mobile.who(data.receipt.operatorJobNo) }} {{ shortDate(data.receipt.receivedAt) }} {{ timeOf(data.receipt.receivedAt) }} 收货 · 中枢结果 <MBillNo :no="data.receipt.hubResultNo" plain />
          <div v-if="data.discrepancy" class="mt-1 flex items-center gap-1.5">差异单 <MBillNo :no="data.discrepancy.no" plain /> <MStatusTag :def="DISCREPANCY_STATUS[data.discrepancy.status]" /></div>
        </div>
      </Section>

      <Section v-else title="出库明细">
        <div v-for="l in shipment.lines" :key="l.sku" class="flex items-center border-t border-line px-4 py-2.5 text-13px first:border-0">
          <span class="flex-1 truncate">{{ l.name }}</span><span class="qs-num font-600">×{{ l.qty }}</span>
        </div>
      </Section>

      <Note>
        实收不预填出库数，要逐行点数后录入；数量不一致时另生成差异单交中枢处理，不把实收改成和出库一样（《4.全局业务规则》§四）。责任判定 <MPendingTag id="待确认-22" />
      </Note>

      <BottomBar v-if="canReceive">
        <van-button block round type="primary" size="large" :loading="busy" :disabled="!allEntered" @click="submit">
          {{ allEntered ? '确认收货并回传' : `还有${shipment.lines.length - entered}行没录实收` }}
        </van-button>
      </BottomBar>
    </template>
  </div>
</template>
