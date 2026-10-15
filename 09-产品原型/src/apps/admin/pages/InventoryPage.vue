<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { NTag, type DataTableColumns } from 'naive-ui'
import { api, type StockRow } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { LEDGER_TYPE } from '@/shared/config/labels'
import BillNo from '@/shared/naive/BillNo.vue'
import type { Product } from '@/shared/types'
import { formatInt } from '@/shared/utils/format'
import { clickable, mono, pagination, two } from '../components/cells'
import Hint from '../components/Hint.vue'
import PageHead from '../components/PageHead.vue'
import StoreSelect from '../components/StoreSelect.vue'
import { useAdmin } from '../stores/session'

const admin = useAdmin()
const storeId = ref<string | null>(null)
const keyword = ref('')
const onlyBusy = ref(false)
const storeIds = computed(() => (storeId.value ? [storeId.value] : admin.storeIds))

const { data: stock, loading } = useRequest(() => api.stock.list(storeIds.value), { watch: [storeIds] })
const { data: products } = useRequest(() => api.master.products(), { live: false })
const productMap = computed(() => new Map((products.value ?? []).map((p) => [p.sku, p])))

type Row = StockRow & { product?: Product }
const rows = computed<Row[]>(() => {
  const k = keyword.value.trim().toLowerCase()
  return (stock.value ?? [])
    .map((r) => ({ ...r, product: productMap.value.get(r.sku) }))
    .filter((r) => !onlyBusy.value || r.locked > 0 || r.inTransit > 0)
    .filter((r) => !k || r.sku.toLowerCase().includes(k) || (r.product?.name.toLowerCase().includes(k) ?? false) || (r.product?.barcodes.some((b) => b.includes(k)) ?? false))
    .sort((a, b) => (a.storeId === b.storeId ? (a.sku < b.sku ? -1 : 1) : a.storeId < b.storeId ? -1 : 1))
})
const totals = computed(() => ({
  onHand: rows.value.reduce((s, r) => s + r.onHand, 0),
  locked: rows.value.reduce((s, r) => s + r.locked, 0),
  available: rows.value.reduce((s, r) => s + r.available, 0),
  inTransit: rows.value.reduce((s, r) => s + r.inTransit, 0),
}))

const qty = (n: number, cls = '') => h('span', { class: `qs-num ${n ? cls : 'text-t3'}` }, String(n))

const columns: DataTableColumns<Row> = [
  { title: 'SKU', key: 'sku', width: 130, render: (r) => mono(r.sku) },
  {
    title: '商品',
    key: 'name',
    minWidth: 220,
    render: (r) =>
      two(
        h('span', { class: 'flex items-center gap-1.5' }, [r.product?.name ?? r.sku, r.product?.status === 'disabled' ? h(NTag, { size: 'tiny', bordered: false }, () => '已停用') : null]),
        r.product?.spec,
      ),
  },
  { title: '门店', key: 'storeId', width: 170, render: (r) => admin.storeText(r.storeId) },
  { title: '账面', key: 'onHand', width: 90, align: 'right', render: (r) => qty(r.onHand) },
  { title: '锁定', key: 'locked', width: 90, align: 'right', render: (r) => qty(r.locked, 'text-info font-600') },
  { title: '可用', key: 'available', width: 90, align: 'right', render: (r) => h('span', { class: `qs-num text-15px font-700 ${r.available ? 'text-t1' : 'text-bad'}` }, String(r.available)) },
  { title: '在途', key: 'inTransit', width: 90, align: 'right', render: (r) => qty(r.inTransit, 'text-warn font-600') },
]

const open = ref<{ storeId: string; sku: string } | null>(null)
const show = computed({
  get: () => !!open.value,
  set: (v) => {
    if (!v) open.value = null
  },
})
const { data: detail } = useRequest(() => (open.value ? api.stock.detail(open.value.storeId, open.value.sku) : Promise.resolve(null)), { watch: [open] })
const openProduct = computed(() => (open.value ? productMap.value.get(open.value.sku) : undefined))
</script>

<template>
  <div>
    <PageHead title="门店库存">
      <template #desc>中枢逻辑库存在本店的投影。可用 = 账面 − 锁定，在途不算可用；对不上时以中枢已经接受的结果为准（《4.全局业务规则》§二）。不展示成本</template>
    </PageHead>

    <div class="mb-4 grid grid-cols-4 gap-3">
      <div class="qs-card px-4 py-3">
        <div class="text-13px text-t2">账面</div>
        <div class="qs-num text-24px font-700">{{ formatInt(totals.onHand) }}</div>
      </div>
      <div class="qs-card px-4 py-3">
        <div class="text-13px text-t2">锁定 <span class="text-12px text-t3">自提锁定，等顾客到店</span></div>
        <div class="qs-num text-24px font-700 text-info">{{ formatInt(totals.locked) }}</div>
      </div>
      <div class="rounded-14px bg-ink-900 px-4 py-3 text-white shadow-card">
        <div class="text-13px text-white/65">可用 <span class="text-12px text-white/45">开单和锁定都以此为限</span></div>
        <div class="qs-num text-24px font-700 text-volt-400">{{ formatInt(totals.available) }}</div>
      </div>
      <div class="qs-card px-4 py-3">
        <div class="text-13px text-t2">在途 <span class="text-12px text-t3">收货前不算可用</span></div>
        <div class="qs-num text-24px font-700 text-warn">{{ formatInt(totals.inTransit) }}</div>
      </div>
    </div>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <StoreSelect v-model="storeId" />
      <n-input v-model:value="keyword" clearable placeholder="SKU、商品名或条码" class="!w-240px">
        <template #prefix><span class="i-ph-magnifying-glass-bold text-t3" /></template>
      </n-input>
      <n-checkbox v-model:checked="onlyBusy">只看有锁定或在途</n-checkbox>
      <div class="flex-1" />
      <span class="text-13px text-t2">共 <b class="qs-num text-t1">{{ rows.length }}</b> 行</span>
    </div>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading && !stock"
        :pagination="pagination"
        :row-key="(r: Row) => `${r.storeId}-${r.sku}`"
        :row-props="clickable((r: Row) => (open = { storeId: r.storeId, sku: r.sku }))"
        :scroll-x="900"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="600">
      <n-drawer-content closable :native-scrollbar="false">
        <template #header>
          <div class="leading-tight">
            <div>{{ openProduct?.name ?? open?.sku }}</div>
            <div class="mt-0.5 text-12px font-400 text-t3"><span class="font-mono">{{ open?.sku }}</span> · {{ openProduct?.spec }} · {{ open ? admin.storeText(open.storeId) : '' }}</div>
          </div>
        </template>
        <div v-if="detail" class="flex flex-col gap-4 text-14px">
          <div class="grid grid-cols-4 gap-2 text-center">
            <div class="rounded-10px bg-subtle py-2.5"><div class="qs-num text-22px font-700">{{ detail.record.onHand }}</div><div class="text-12px text-t3">账面</div></div>
            <div class="rounded-10px bg-subtle py-2.5"><div class="qs-num text-22px font-700 text-info">{{ detail.record.locked }}</div><div class="text-12px text-t3">锁定</div></div>
            <div class="rounded-10px bg-ink-900 py-2.5 text-white"><div class="qs-num text-22px font-700 text-volt-400">{{ detail.record.available }}</div><div class="text-12px text-white/60">可用</div></div>
            <div class="rounded-10px bg-subtle py-2.5"><div class="qs-num text-22px font-700 text-warn">{{ detail.record.inTransit }}</div><div class="text-12px text-t3">在途</div></div>
          </div>

          <div v-if="detail.pickups.length">
            <div class="mb-1.5 font-600">锁定来源：待核销的自提单</div>
            <div v-for="p in detail.pickups" :key="p.omsNo" class="flex items-center justify-between border-b border-line py-1.5 text-13px last:border-0">
              <BillNo :no="p.omsNo" />
              <span class="qs-num text-t3">{{ p.createdAt }}</span>
              <span class="qs-num font-600">锁 {{ p.items.find((i) => i.sku === open?.sku)?.qty }}</span>
            </div>
          </div>
          <div v-if="detail.shipments.length">
            <div class="mb-1.5 font-600">在途来源：调拨出库单</div>
            <div v-for="s in detail.shipments" :key="s.outboundNo" class="flex items-center justify-between border-b border-line py-1.5 text-13px last:border-0">
              <BillNo :no="s.outboundNo" />
              <span class="text-t3">{{ s.sourceNodeName }} · <span class="qs-num">{{ s.shippedAt }}</span></span>
              <span class="qs-num font-600">在途 {{ s.lines.find((l) => l.sku === open?.sku)?.qty }}</span>
            </div>
          </div>

          <div>
            <div class="mb-1.5 flex items-center justify-between">
              <span class="font-600">本店库存流水</span>
              <span class="text-12px text-t3">回传记录，不是可售真相</span>
            </div>
            <div class="overflow-hidden rounded-10px border border-line">
              <div class="grid grid-cols-[150px_80px_1fr_56px_56px] bg-subtle px-3 py-2 text-12px font-600 text-t2">
                <span>时间</span><span>类型</span><span>来源单号</span><span class="text-right">变动</span><span class="text-right">结存</span>
              </div>
              <div class="qs-scroll max-h-360px overflow-y-auto">
                <div v-for="l in detail.ledger" :key="l.id" class="grid grid-cols-[150px_80px_1fr_56px_56px] items-center border-t border-line px-3 py-1.5 text-13px">
                  <span class="qs-num text-t2">{{ l.at.slice(5) }}</span>
                  <span>{{ LEDGER_TYPE[l.type] }}</span>
                  <span class="truncate"><BillNo :no="l.refNo" plain /></span>
                  <span class="qs-num text-right font-600" :class="l.change > 0 ? 'text-ok' : 'text-bad'">{{ l.change > 0 ? `+${l.change}` : l.change }}</span>
                  <span class="qs-num text-right">{{ l.balanceAfter }}</span>
                </div>
                <div v-if="!detail.ledger.length" class="px-3 py-6 text-center text-13px text-t3">没有流水</div>
              </div>
            </div>
          </div>
          <Hint>锁定和在途不进流水；流水只记账面的变化：销售、退货、核销、收货、盘点调账和退仓</Hint>
        </div>
        <div v-else class="py-16 text-center"><n-spin /></div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
