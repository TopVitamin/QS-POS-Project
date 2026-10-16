<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { REPLENISH_STATUS } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import { useFeedback } from '@/shared/naive/feedback'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { Replenishment } from '@/shared/types'
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
const st = ref<Replenishment['status'] | null>(null)

const filter = computed(() => ({ storeIds: storeId.value ? [storeId.value] : admin.storeIds, status: st.value ?? undefined }))
const { data, loading } = useRequest(() => api.storeops.replenishments(filter.value), { watch: [filter] })

const qtyText = (r: Replenishment) => `${r.lines.length}个SKU · ${r.lines.reduce((s, l) => s + l.qty, 0)}件`

const columns: DataTableColumns<Replenishment> = [
  { title: '要货单号', key: 'no', width: 250, fixed: 'left', render: (r) => two(bill(r.no), admin.storeText(r.storeId)) },
  { title: '提交时间', key: 'createdAt', width: 170, render: (r) => dateTime(r.createdAt) },
  { title: '提交人', key: 'creator', width: 110, render: (r) => admin.who(r.creatorJobNo) },
  { title: '商品', key: 'lines', minWidth: 220, ellipsis: { tooltip: true }, render: (r) => two(r.lines.map((l) => `${l.name}×${l.qty}`).join('、'), qtyText(r)) },
  { title: '要货说明', key: 'note', width: 160, ellipsis: { tooltip: true }, render: (r) => r.note || muted('-') },
  { title: '中枢审核', key: 'review', width: 190, ellipsis: { tooltip: true }, render: (r) => (r.hub.reviewedAt ? two(r.hub.reviewNote ?? '', r.hub.reviewedAt) : muted('等中枢审核')) },
  { title: '调出仓', key: 'source', width: 100, render: (r) => r.hub.sourceNodeName ?? muted('-') },
  { title: '调拨出库单', key: 'outbound', width: 220, render: (r) => (r.hub.outboundNo ? bill(r.hub.outboundNo) : muted('-')) },
  { title: '状态', key: 'status', width: 110, fixed: 'right', render: (r) => status(REPLENISH_STATUS[r.status]) },
]
const statusOptions = Object.entries(REPLENISH_STATUS).map(([value, d]) => ({ label: d.label, value }))

// ---------- 详情 ----------
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
    { title: '门店提交', at: r.createdAt, desc: admin.who(r.creatorJobNo) },
    { title: r.status === 'rejected' ? '中枢驳回' : '中枢审核', at: r.hub.reviewedAt, desc: r.hub.reviewNote ?? '审核人和安全库存见【待确认-48】' },
    { title: '调拨出库', at: r.hub.shippedAt, desc: r.hub.outboundNo ? `${r.hub.sourceNodeName}发出，出库单 ${r.hub.outboundNo}` : '中枢下调拨指令，WMS出库' },
    { title: '门店收货', at: undefined, desc: r.status === 'received' ? '已按出库单收货，见「收货与差异」' : '到货后按出库单逐行录实收' },
  ]
})
const stepNow = computed(() => ({ reviewing: 2, rejected: 2, approved: 3, shipped: 4, received: 4 })[current.value?.status ?? 'reviewing'])

// ---------- 新建 ----------
const manageable = computed(() => (admin.has('storeops.manage') ? admin.scopedStores : []))
const showNew = ref(false)
const form = ref({ storeId: null as string | null, items: [] as { sku: string; qty: number }[], note: '' })
const busy = ref(false)
const { data: products } = useRequest(() => api.master.products(), { live: false })
const { data: stock } = useRequest(() => (form.value.storeId ? api.stock.list([form.value.storeId]) : Promise.resolve([])), { watch: [() => form.value.storeId] })
const stockHint = (sku: string) => {
  const r = stock.value?.find((x) => x.sku === sku)
  return r ? `本店可用 ${r.available} · 在途 ${r.inTransit}` : '本店可用 0'
}

function openNew() {
  form.value = { storeId: manageable.value[0]?.id ?? null, items: [], note: '' }
  showNew.value = true
}
watch(
  () => form.value.storeId,
  () => (form.value.items = []),
)

async function submit() {
  if (!form.value.storeId || !admin.user) return
  busy.value = true
  const r = await fb.run(
    () => api.storeops.createReplenishment({ storeId: form.value.storeId!, creatorJobNo: admin.user!.jobNo, items: form.value.items, note: form.value.note }),
    (x) => `要货单 ${x.no} 已提交，等中枢审核`,
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
    <PageHead title="要货单">
      <template #desc>要货是向中枢的申请，不是仓库的出库指令，也不是已经增加的库存。审核通过后由中枢下区域仓到本店的调拨；加盟店要货是同一条调拨，不产生货款（《3.上下游链路》§3.4、《7.模式说明》§2.1）</template>
      <template #actions>
        <n-button v-if="manageable.length" type="primary" @click="openNew">
          <template #icon><span class="i-ph-plus-bold" /></template>
          新建要货单
        </n-button>
      </template>
    </PageHead>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <StoreSelect v-model="storeId" />
      <n-select v-model:value="st" :options="statusOptions" clearable placeholder="全部状态" class="!w-140px" />
      <div class="flex-1" />
      <span v-if="!manageable.length" class="text-12px text-t3">当前身份只能看。新建要货用店长账号，例如 QS1001 王海</span>
    </div>

    <Hint class="mb-4">
      要货提交后本店可用不变，发运后计入在途，收货后才进账面。审核 <AssumptionTag k="replenishReview" />；直送、直通、配销价和超期未收 <PendingTag id="待确认-41" />；单据前缀 <PendingTag id="待确认-01" />
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="data ?? []"
        :loading="loading && !data"
        :pagination="pagination"
        :row-key="(r: Replenishment) => r.no"
        :row-props="clickable((r: Replenishment) => (openNo = r.no))"
        :scroll-x="1560"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="560">
      <n-drawer-content v-if="current" closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">要货单 <BillNo :no="current.no" /> <StatusTag :def="REPLENISH_STATUS[current.status]" /></span>
        </template>
        <div class="flex flex-col gap-5 text-14px">
          <n-steps vertical size="small" :current="stepNow" :status="current.status === 'rejected' ? 'error' : current.status === 'received' ? 'finish' : 'process'">
            <n-step v-for="s in steps" :key="s.title" :title="s.title">
              <div class="text-13px text-t2">{{ s.desc }}</div>
              <div class="qs-num text-12px text-t3">{{ s.at ?? '' }}</div>
            </n-step>
          </n-steps>
          <n-descriptions :column="1" label-placement="left" size="small" bordered>
            <n-descriptions-item label="门店">{{ admin.storeText(current.storeId) }}</n-descriptions-item>
            <n-descriptions-item label="要货说明">{{ orEmpty(current.note) }}</n-descriptions-item>
            <n-descriptions-item label="调拨出库单"><BillNo :no="current.hub.outboundNo" /></n-descriptions-item>
          </n-descriptions>
          <div>
            <div class="mb-1.5 font-600">要货商品</div>
            <div v-for="l in current.lines" :key="l.sku" class="flex justify-between border-b border-line py-2 last:border-0">
              <span>{{ l.name }} <span class="text-t3">{{ l.spec }}</span> <span class="font-mono text-12px text-t3">{{ l.sku }}</span></span>
              <span class="qs-num font-600">× {{ l.qty }}</span>
            </div>
          </div>
          <router-link v-if="current.hub.outboundNo" :to="{ name: 'receipts' }" class="text-13px text-brand-700 hover:underline">到「收货与差异」看这张出库单</router-link>
        </div>
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="showNew" preset="card" title="新建要货单" :style="{ width: '620px' }" :mask-closable="!busy" :segmented="{ content: true, footer: 'soft' }">
      <div class="flex flex-col gap-4">
        <n-form-item label="要货门店" :show-feedback="false">
          <StoreSelect v-model="form.storeId" :stores="manageable" :clearable="false" placeholder="选择门店" />
        </n-form-item>
        <n-form-item label="商品和数量" :show-feedback="false">
          <div class="w-full">
            <SkuQtyEditor v-model="form.items" :products="products ?? []" :hint="stockHint" :max="999" />
          </div>
        </n-form-item>
        <n-form-item label="要货说明" :show-feedback="false">
          <n-input v-model:value="form.note" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="例如：周末备货" maxlength="100" show-count />
        </n-form-item>
        <Hint tone="info">提交后进入中枢审核，审核通过前本店可用不变；调出仓由中枢决定，POS不选仓</Hint>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <n-button :disabled="busy" @click="showNew = false">取消</n-button>
          <n-button type="primary" :loading="busy" :disabled="!form.storeId || !form.items.length" @click="submit">提交中枢审核</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>
