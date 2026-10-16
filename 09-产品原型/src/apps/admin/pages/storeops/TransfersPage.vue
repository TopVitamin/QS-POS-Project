<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { STORE_MODE, TRANSFER_STATUS } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import { useFeedback } from '@/shared/naive/feedback'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { StoreTransfer } from '@/shared/types'
import { orEmpty } from '@/shared/utils/format'
import { bill, clickable, dateTime, muted, pagination, status, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import SkuQtyEditor from '../../components/SkuQtyEditor.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const fb = useFeedback()
const storeId = ref<string | null>(null)
const st = ref<StoreTransfer['status'] | null>(null)
const storeIds = computed(() => (storeId.value ? [storeId.value] : admin.storeIds))
const { data, loading } = useRequest(() => api.storeops.transfers({ storeIds: storeIds.value, status: st.value ?? undefined }), { watch: [storeIds, st] })

const qtyText = (r: StoreTransfer) => `${r.lines.length}个SKU · ${r.lines.reduce((s, l) => s + l.qty, 0)}件`
const columns: DataTableColumns<StoreTransfer> = [
  { title: '调拨单号', key: 'no', width: 250, fixed: 'left', render: (r) => two(bill(r.no), qtyText(r)) },
  { title: '调出店', key: 'fromStoreId', width: 180, render: (r) => admin.storeText(r.fromStoreId) },
  { title: '调入店', key: 'toStoreId', width: 180, render: (r) => admin.storeText(r.toStoreId) },
  { title: '提交', key: 'createdAt', width: 170, render: (r) => two(dateTime(r.createdAt), admin.who(r.creatorJobNo)) },
  { title: '商品', key: 'lines', minWidth: 220, ellipsis: { tooltip: true }, render: (r) => r.lines.map((l) => `${l.name}×${l.qty}`).join('、') },
  { title: '中枢审核', key: 'review', width: 180, ellipsis: { tooltip: true }, render: (r) => (r.hub.reviewedAt ? two(r.hub.reviewNote ?? '', r.hub.reviewedAt) : muted('等中枢审核')) },
  { title: '出库单', key: 'outbound', width: 220, render: (r) => (r.hub.outboundNo ? bill(r.hub.outboundNo) : muted('-')) },
  { title: '状态', key: 'status', width: 110, fixed: 'right', render: (r) => status(TRANSFER_STATUS[r.status]) },
]
const statusOptions = Object.entries(TRANSFER_STATUS).map(([value, d]) => ({ label: d.label, value }))

const openNo = ref('')
const current = computed(() => (data.value ?? []).find((r) => r.no === openNo.value) ?? null)
const show = computed({
  get: () => !!openNo.value,
  set: (v) => {
    if (!v) openNo.value = ''
  },
})
const steps = computed(() => {
  const r = current.value
  if (!r) return []
  return [
    { title: '调入店提交', at: r.createdAt, desc: `${admin.who(r.creatorJobNo)} 向${admin.storeText(r.fromStoreId)}申请` },
    { title: r.status === 'rejected' ? '中枢驳回' : '中枢审核', at: r.hub.reviewedAt, desc: r.hub.reviewNote ?? '是否允许跨模式见【待确认-26】' },
    { title: '调出店发运', at: r.hub.shippedAt, desc: r.hub.outboundNo ? `出库单 ${r.hub.outboundNo}，调出店账面已扣` : '审核通过后由中枢发运，POS不选仓' },
    { title: '调入店收货', at: undefined, desc: r.status === 'received' ? '已按出库单收货' : '发运后计入调入店在途，收货后才进账面' },
  ]
})
const stepNow = computed(() => ({ reviewing: 2, rejected: 2, approved: 3, shipped: 4, received: 4 })[current.value?.status ?? 'reviewing'])

const mixed = (r: StoreTransfer) => {
  const a = admin.storeById(r.fromStoreId)
  const b = admin.storeById(r.toStoreId)
  return !!a && !!b && a.mode !== b.mode
}

const { data: allStores } = useRequest(() => api.master.stores(), { live: false })
const { data: products } = useRequest(() => api.master.products(), { live: false })
const manageable = computed(() => (admin.has('storeops.manage') ? admin.scopedStores : []))
const showNew = ref(false)
const form = ref({ toStoreId: null as string | null, fromStoreId: null as string | null, items: [] as { sku: string; qty: number }[], note: '' })
const busy = ref(false)
const { data: fromStock } = useRequest(
  () => (form.value.fromStoreId ? api.stock.list([form.value.fromStoreId]) : Promise.resolve([])),
  { watch: [() => form.value.fromStoreId] },
)
const stockHint = (sku: string) => {
  const r = fromStock.value?.find((x) => x.sku === sku)
  return r ? `调出店可用 ${r.available}` : '调出店可用 0'
}
const fromOptions = computed(() =>
  (allStores.value ?? [])
    .filter((s) => s.id !== form.value.toStoreId)
    .map((s) => ({ label: `${s.code} ${s.name}（${STORE_MODE[s.mode].label}）`, value: s.id })),
)

function openNew() {
  form.value = { toStoreId: manageable.value[0]?.id ?? null, fromStoreId: null, items: [], note: '' }
  showNew.value = true
}
watch(
  () => form.value.fromStoreId,
  () => (form.value.items = []),
)

async function submit() {
  if (!form.value.toStoreId || !form.value.fromStoreId || !admin.user) return
  busy.value = true
  const r = await fb.run(
    () =>
      api.storeops.createTransfer({
        fromStoreId: form.value.fromStoreId!,
        toStoreId: form.value.toStoreId!,
        creatorJobNo: admin.user!.jobNo,
        items: form.value.items,
        note: form.value.note,
      }),
    (x) => `调拨单 ${x.no} 已提交，等中枢审核`,
  )
  busy.value = false
  if (r) {
    showNew.value = false
    openNo.value = r.no
  }
}
</script>

<template>
  <div>
    <PageHead title="店间调拨">
      <template #desc>店与店之间的货要移动，必须有调拨申请和收货。没有单据的微信调货，不改变任何一边的可用量（《4.全局业务规则》§四）</template>
      <template #tags><AssumptionTag k="storeTransfer" /></template>
      <template #actions>
        <n-button v-if="manageable.length" type="primary" @click="openNew">
          <template #icon><span class="i-ph-plus-bold" /></template>
          新建调拨申请
        </n-button>
      </template>
    </PageHead>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <StoreSelect v-model="storeId" />
      <n-select v-model:value="st" :options="statusOptions" clearable placeholder="全部状态" class="!w-140px" />
      <div class="flex-1" />
      <span v-if="!manageable.length" class="text-12px text-t3">当前身份只能看。新建用店长账号，例如 QS1001 王海</span>
    </div>

    <Hint class="mb-4">
      直营和加盟之间、加盟店之间是否允许调拨 <PendingTag id="待确认-26" />。原型按演示假设允许任意两家演示门店走单据，审核和发运在「中枢模拟器」。
      调出店发运后账面扣减，调入店先计入在途，按出库单收货后才进账面。单据前缀 <PendingTag id="待确认-01" />
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="data ?? []"
        :loading="loading && !data"
        :pagination="pagination"
        :row-key="(r: StoreTransfer) => r.no"
        :row-props="clickable((r: StoreTransfer) => (openNo = r.no))"
        :scroll-x="1560"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="560">
      <n-drawer-content v-if="current" closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">调拨单 <BillNo :no="current.no" /> <StatusTag :def="TRANSFER_STATUS[current.status]" /></span>
        </template>
        <div class="flex flex-col gap-5 text-14px">
          <n-steps vertical size="small" :current="stepNow" :status="current.status === 'rejected' ? 'error' : current.status === 'received' ? 'finish' : 'process'">
            <n-step v-for="s in steps" :key="s.title" :title="s.title">
              <div class="text-13px text-t2">{{ s.desc }}</div>
              <div class="qs-num text-12px text-t3">{{ s.at ?? '' }}</div>
            </n-step>
          </n-steps>
          <n-alert v-if="mixed(current)" type="warning" :bordered="false">跨经营模式调拨，口径未定 <PendingTag id="待确认-26" /></n-alert>
          <n-descriptions :column="1" label-placement="left" size="small" bordered>
            <n-descriptions-item label="调出店">{{ admin.storeText(current.fromStoreId) }}</n-descriptions-item>
            <n-descriptions-item label="调入店">{{ admin.storeText(current.toStoreId) }}</n-descriptions-item>
            <n-descriptions-item label="说明">{{ orEmpty(current.note) }}</n-descriptions-item>
            <n-descriptions-item label="调拨出库单"><BillNo :no="current.hub.outboundNo" /></n-descriptions-item>
          </n-descriptions>
          <div>
            <div class="mb-1.5 font-600">调拨商品</div>
            <div v-for="l in current.lines" :key="l.sku" class="flex justify-between border-b border-line py-2 last:border-0">
              <span>{{ l.name }} <span class="text-t3">{{ l.spec }}</span> <span class="font-mono text-12px text-t3">{{ l.sku }}</span></span>
              <span class="qs-num font-600">× {{ l.qty }}</span>
            </div>
          </div>
          <router-link v-if="current.hub.outboundNo" :to="{ name: 'receipts' }" class="text-13px text-brand-700 hover:underline">到「收货与差异」看这张出库单</router-link>
        </div>
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="showNew" preset="card" title="新建调拨申请" :style="{ width: '620px' }" :mask-closable="!busy" :segmented="{ content: true, footer: 'soft' }">
      <div class="flex flex-col gap-4">
        <n-form-item label="调入门店（本店要货）" :show-feedback="false">
          <StoreSelect v-model="form.toStoreId" :stores="manageable" :clearable="false" placeholder="选择调入店" />
        </n-form-item>
        <n-form-item label="调出门店" :show-feedback="false">
          <n-select v-model:value="form.fromStoreId" :options="fromOptions" filterable placeholder="从哪家店调出" class="w-full" />
        </n-form-item>
        <n-form-item label="商品和数量" :show-feedback="false">
          <div class="w-full">
            <SkuQtyEditor v-model="form.items" :products="products ?? []" :hint="stockHint" :max="999" />
          </div>
        </n-form-item>
        <n-form-item label="说明" :show-feedback="false">
          <n-input v-model:value="form.note" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="例如：周末补线材" maxlength="100" show-count />
        </n-form-item>
        <Hint tone="info">提交后进入中枢审核。发运时才扣调出店可用、计入调入店在途。是否允许跨模式 <PendingTag id="待确认-26" /></Hint>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <n-button :disabled="busy" @click="showNew = false">取消</n-button>
          <n-button type="primary" :loading="busy" :disabled="!form.toStoreId || !form.fromStoreId || !form.items.length" @click="submit">提交中枢审核</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>
