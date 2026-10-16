<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { STORE_MODE, TRANSFER_STATUS } from '@/shared/config/labels'
import type { StoreTransfer } from '@/shared/types'
import { shortDate, timeOf } from '@/shared/utils/time'
import MAssumptionTag from '../components/MAssumptionTag.vue'
import MBillNo from '../components/MBillNo.vue'
import MPendingTag from '../components/MPendingTag.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import QtyLines from '../components/QtyLines.vue'
import SkuPicker from '../components/SkuPicker.vue'
import { run } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const { data: rows } = useRequest(() => api.storeops.transfers({ storeIds: [mobile.storeId] }))
const { data: allStores } = useRequest(() => api.master.stores(), { live: false })
const { data: products } = useRequest(() => api.master.products(), { live: false })

const open = ref<StoreTransfer | null>(null)
const showNew = ref(false)
const showPicker = ref(false)
const fromStoreId = ref<string | null>(null)
const items = ref<{ sku: string; qty: number }[]>([])
const note = ref('')
const { data: fromStock } = useRequest(
  () => (fromStoreId.value ? api.stock.list([fromStoreId.value]) : Promise.resolve([])),
  { watch: [fromStoreId] },
)
const availOf = (sku: string) => fromStock.value?.find((r) => r.sku === sku)?.available ?? 0
const fromStores = computed(() => (allStores.value ?? []).filter((s) => s.id !== mobile.storeId))
const fromName = (id: string) => {
  const s = allStores.value?.find((x) => x.id === id)
  return s ? `${s.name}（${STORE_MODE[s.mode].label}）` : id
}

function pick(sku: string) {
  if (items.value.some((i) => i.sku === sku)) items.value = items.value.filter((i) => i.sku !== sku)
  else items.value = [...items.value, { sku, qty: 1 }]
}

const busy = ref(false)
async function submit() {
  if (!fromStoreId.value) return
  busy.value = true
  const r = await run(
    () =>
      api.storeops.createTransfer({
        fromStoreId: fromStoreId.value!,
        toStoreId: mobile.storeId,
        creatorJobNo: mobile.user!.jobNo,
        items: items.value,
        note: note.value,
      }),
    (x) => `已提交 ${x.no}，等中枢审核`,
  )
  busy.value = false
  if (r) {
    showNew.value = false
    fromStoreId.value = null
    items.value = []
    note.value = ''
    open.value = r
  }
}

const roleOf = (t: StoreTransfer) => (t.toStoreId === mobile.storeId ? '本店调入' : '本店调出')
</script>

<template>
  <div class="pb-4">
    <div v-if="mobile.has('storeops.manage')" class="px-3 pt-3">
      <van-button block round type="primary" icon="plus" @click="showNew = true">新建调拨申请</van-button>
    </div>

    <div
      v-for="r in rows ?? []"
      :key="r.no"
      class="m-press mx-3 mt-3 rounded-14px bg-white px-4 py-3 shadow-card"
      @click="open = r"
    >
      <div class="flex items-center gap-2">
        <MBillNo :no="r.no" class="text-13px font-600" />
        <span class="rounded-4px bg-subtle px-1 text-11px text-t2">{{ roleOf(r) }}</span>
        <div class="flex-1" />
        <MStatusTag :def="TRANSFER_STATUS[r.status]" />
      </div>
      <div class="mt-1.5 text-14px">{{ r.lines.map((l) => `${l.name}×${l.qty}`).join('、') }}</div>
      <div class="mt-1 text-12px text-t3">
        {{ fromName(r.fromStoreId) }} → {{ fromName(r.toStoreId) }} · {{ shortDate(r.createdAt) }} {{ timeOf(r.createdAt) }}
      </div>
    </div>
    <van-empty v-if="rows && !rows.length" image-size="80" description="还没有店间调拨单" />

    <Note>
      没有单据的调货不改变任何一边的可用量。发运后调出店账面扣减，调入店先计入在途，按出库单收货。
      是否允许跨模式 <MPendingTag id="待确认-26" /> <MAssumptionTag k="storeTransfer" />
    </Note>

    <van-popup :show="!!open" position="bottom" round closeable teleport="body" :style="{ maxHeight: '80%' }" @update:show="(v: boolean) => !v && (open = null)">
      <div v-if="open" class="px-4 pb-8 pt-5">
        <div class="flex items-center gap-2">
          <MBillNo :no="open.no" class="text-15px font-700" />
          <MStatusTag :def="TRANSFER_STATUS[open.status]" />
        </div>
        <div class="mt-3 text-14px leading-22px text-t2">
          <div>调出 {{ fromName(open.fromStoreId) }}</div>
          <div>调入 {{ fromName(open.toStoreId) }}</div>
          <div v-if="open.note">说明 {{ open.note }}</div>
          <div v-if="open.hub.reviewNote">中枢 {{ open.hub.reviewNote }}</div>
          <div v-if="open.hub.outboundNo" class="mt-1">出库单 <MBillNo :no="open.hub.outboundNo" plain /></div>
        </div>
        <div class="mt-3 rounded-12px border border-line">
          <div v-for="l in open.lines" :key="l.sku" class="flex justify-between border-b border-line px-3 py-2 last:border-0">
            <span>{{ l.name }} <span class="text-12px text-t3">{{ l.spec }}</span></span>
            <span class="qs-num font-600">× {{ l.qty }}</span>
          </div>
        </div>
        <van-button v-if="open.hub.outboundNo && open.toStoreId === mobile.storeId" block round type="primary" class="mt-4" :to="`/receive/${open.hub.outboundNo}`">去收货</van-button>
      </div>
    </van-popup>

    <van-popup v-model:show="showNew" position="bottom" round closeable teleport="body" :style="{ maxHeight: '88%' }">
      <div class="flex max-h-[88vh] flex-col">
        <div class="px-4 pt-5">
          <div class="text-17px font-700">新建调拨申请</div>
          <div class="mt-1 text-12px text-t3">{{ mobile.storeText }} 作为调入店，向另一家店申请</div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto pb-2">
          <div class="px-4 pt-4 text-14px font-600">从哪家店调出</div>
          <div class="flex flex-wrap gap-2 px-4 pt-2">
            <button
              v-for="s in fromStores"
              :key="s.id"
              type="button"
              class="rounded-full border px-3.5 py-1.5 text-13px"
              :class="fromStoreId === s.id ? 'border-brand-600 bg-brand-50 font-600 text-brand-700' : 'border-line-strong bg-white text-t2'"
              @click="fromStoreId = s.id; items = []"
            >
              {{ s.name }}（{{ STORE_MODE[s.mode].label }}）
            </button>
          </div>
          <div class="mt-4 flex items-center justify-between px-4">
            <span class="text-14px font-600">调拨商品</span>
            <van-button size="small" round plain type="primary" icon="plus" :disabled="!fromStoreId" @click="showPicker = true">选商品</van-button>
          </div>
          <div class="mx-3 mt-2 overflow-hidden rounded-12px border border-line">
            <QtyLines v-model="items" :products="products ?? []" :hint="(sku) => `调出店可用 ${availOf(sku)}`" :max="availOf">
              <template #empty><div class="px-4 py-4 text-13px text-t3">先选调出店，再选商品。发运时才扣对方可用</div></template>
            </QtyLines>
          </div>
          <van-cell-group inset class="mt-3">
            <van-field v-model="note" type="textarea" rows="2" autosize placeholder="说明，选填" maxlength="60" />
          </van-cell-group>
        </div>
        <div class="border-t border-line px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          <van-button block round type="primary" size="large" :loading="busy" :disabled="!fromStoreId || !items.length" @click="submit">
            {{ !fromStoreId ? '先选调出店' : !items.length ? '再选商品' : `提交调拨单（${items.reduce((s, i) => s + i.qty, 0)}件）` }}
          </van-button>
        </div>
      </div>
    </van-popup>

    <SkuPicker
      v-model:show="showPicker"
      :products="products ?? []"
      :selected="items.map((i) => i.sku)"
      :hint="(sku) => `调出店可用 ${availOf(sku)}`"
      title="选要调入的商品"
      @pick="pick"
    />
  </div>
</template>
