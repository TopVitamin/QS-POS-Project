<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { LEDGER_TYPE } from '@/shared/config/labels'
import { maskCode } from '@/shared/utils/format'
import { shortDate, timeOf } from '@/shared/utils/time'
import MBillNo from '../components/MBillNo.vue'
import Note from '../components/Note.vue'
import Section from '../components/Section.vue'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const route = useRoute()
const sku = computed(() => String(route.params.sku))

const { data: products } = useRequest(() => api.master.products(), { live: false })
const product = computed(() => products.value?.find((p) => p.sku === sku.value))
const { data } = useRequest(() => api.stock.detail(mobile.storeId, sku.value))
const qtyOf = (lines: { sku: string; qty: number }[]) => lines.find((l) => l.sku === sku.value)?.qty ?? 0
</script>

<template>
  <div class="pb-4">
    <div class="mx-3 mt-3 rounded-14px bg-white px-4 py-4 shadow-card">
      <div class="text-17px font-700">{{ product?.name ?? sku }}</div>
      <div class="mt-0.5 text-12px text-t3"><span class="font-mono">{{ sku }}</span> · {{ product?.spec }}</div>
      <div class="mt-0.5 flex items-center gap-2 text-12px text-t3">
        <span>条码 <span class="font-mono">{{ product?.barcodes[0] ?? '-' }}</span></span>
        <span>零售价 <MoneyText :value="product?.price" /></span>
      </div>
      <div v-if="data" class="mt-3 grid grid-cols-4 gap-1 rounded-12px bg-subtle py-3 text-center">
        <div><div class="qs-num text-20px font-700">{{ data.record.onHand }}</div><div class="text-11px text-t3">账面</div></div>
        <div><div class="qs-num text-20px font-700 text-info">{{ data.record.locked }}</div><div class="text-11px text-t3">自提锁定</div></div>
        <div><div class="qs-num text-20px font-700 text-brand-600">{{ data.record.available }}</div><div class="text-11px text-t3">可用</div></div>
        <div><div class="qs-num text-20px font-700 text-warn">{{ data.record.inTransit }}</div><div class="text-11px text-t3">在途</div></div>
      </div>
    </div>

    <Section v-if="data?.pickups.length" title="锁给自提的件数" desc="中枢锁定成功才出提货码；这些件数进店销售卖不到">
      <div v-for="p in data.pickups" :key="p.omsNo" class="flex items-center gap-3 border-t border-line px-4 py-2.5 text-13px first:border-0">
        <span class="qs-num w-60px font-600">{{ maskCode(p.pickupCode) }}</span>
        <span class="min-w-0 flex-1 truncate text-t3">{{ shortDate(p.createdAt) }} {{ timeOf(p.createdAt) }} · <MBillNo :no="p.omsNo" plain /></span>
        <span class="qs-num font-600 text-info">锁 {{ qtyOf(p.items) }}</span>
      </div>
    </Section>

    <Section v-if="data?.shipments.length" title="在途" desc="中枢发运后计入在途，收货回传后才进账面">
      <router-link v-for="s in data.shipments" :key="s.outboundNo" :to="`/receive/${s.outboundNo}`" class="m-press flex items-center gap-3 border-t border-line px-4 py-2.5 text-13px first:border-0">
        <span class="min-w-0 flex-1">
          <span class="block"><MBillNo :no="s.outboundNo" plain /></span>
          <span class="block text-12px text-t3">{{ s.sourceNodeName }} · {{ shortDate(s.shippedAt) }} {{ timeOf(s.shippedAt) }} 发运</span>
        </span>
        <span class="qs-num font-600 text-warn">+{{ qtyOf(s.lines) }}</span>
        <span class="i-ph-caret-right text-t3" />
      </router-link>
    </Section>

    <Section title="本店库存流水">
      <div v-for="l in data?.ledger ?? []" :key="l.id" class="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-0">
        <div class="min-w-0 flex-1">
          <div class="text-14px">{{ LEDGER_TYPE[l.type] }}</div>
          <div class="truncate text-12px text-t3">{{ shortDate(l.at) }} {{ timeOf(l.at) }} · <MBillNo :no="l.refNo" plain /></div>
        </div>
        <div class="text-right">
          <div class="qs-num text-15px font-700" :class="l.change > 0 ? 'text-ok' : 'text-bad'">{{ l.change > 0 ? '+' : '' }}{{ l.change }}</div>
          <div class="qs-num text-11px text-t3">结存 {{ l.balanceAfter }}</div>
        </div>
      </div>
      <van-empty v-if="data && !data.ledger.length" image-size="64" description="这件商品在本店还没有流水" />
    </Section>

    <Note>流水是中枢接受后回到本店的记录，不是可售真相；对不上时以中枢已接受的结果为准</Note>
  </div>
</template>
