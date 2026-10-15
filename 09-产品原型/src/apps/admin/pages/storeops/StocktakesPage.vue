<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { NTag, type DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { STOCKTAKE_STATUS } from '@/shared/config/labels'
import { BASIS, stocktakeDiffs } from '@/shared/domain/rules'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import AuthorizeModal from '@/shared/naive/AuthorizeModal.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import { useFeedback } from '@/shared/naive/feedback'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { AuthorizeResult } from '@/shared/naive/types'
import type { Stocktake } from '@/shared/types'
import { orEmpty } from '@/shared/utils/format'
import { bill, clickable, dateTime, muted, pagination, status, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import StoreSelect from '../../components/StoreSelect.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const fb = useFeedback()
const storeId = ref<string | null>(null)
const st = ref<Stocktake['status'] | null>(null)

const filter = computed(() => ({ storeIds: storeId.value ? [storeId.value] : admin.storeIds, status: st.value ?? undefined }))
const { data, loading } = useRequest(() => api.storeops.stocktakes(filter.value), { watch: [filter] })

const diffSummary = (s: Stocktake) => {
  const diffs = stocktakeDiffs(s.lines)
  const gain = diffs.filter((d) => d.diff > 0).reduce((n, d) => n + d.diff, 0)
  const loss = diffs.filter((d) => d.diff < 0).reduce((n, d) => n - d.diff, 0)
  return { rows: diffs.length, gain, loss }
}

const columns: DataTableColumns<Stocktake> = [
  { title: '盘点单号', key: 'no', width: 250, fixed: 'left', render: (s) => two(bill(s.no), admin.storeText(s.storeId)) },
  {
    title: '范围',
    key: 'scope',
    width: 130,
    render: (s) =>
      h('span', { class: 'flex items-center gap-1.5' }, [
        s.scope === 'full' ? '全盘' : '抽盘',
        s.joint ? h(NTag, { size: 'tiny', bordered: false, type: 'warning' }, () => '共同盘点') : null,
      ]),
  },
  { title: '建单', key: 'createdAt', width: 170, render: (s) => two(dateTime(s.createdAt), admin.who(s.creatorJobNo)) },
  { title: '已录', key: 'counted', width: 90, render: (s) => h('span', { class: 'qs-num' }, `${s.lines.filter((l) => l.countedQty !== null).length}/${s.lines.length}`) },
  {
    title: '差异',
    key: 'diff',
    width: 160,
    render: (s) => {
      if (s.status === 'counting') return muted('录入中')
      const d = diffSummary(s)
      if (!d.rows) return h('span', { class: 'text-ok' }, '账实相符')
      return two(`${d.rows}行有差异`, h('span', { class: 'qs-num' }, `盘盈${d.gain}件 · 盘亏${d.loss}件`))
    },
  },
  { title: '提交', key: 'submittedAt', width: 170, render: (s) => dateTime(s.submittedAt) },
  { title: '授权过账', key: 'auth', width: 170, render: (s) => (s.authorizedAt ? two(admin.who(s.authorizerJobNo), s.authorizedAt) : muted('-')) },
  { title: '中枢调账', key: 'hub', width: 200, render: (s) => (s.hubResultNo ? bill(s.hubResultNo) : muted('-')) },
  { title: '状态', key: 'status', width: 110, fixed: 'right', render: (s) => status(STOCKTAKE_STATUS[s.status]) },
]
const statusOptions = Object.entries(STOCKTAKE_STATUS).map(([value, d]) => ({ label: d.label, value }))

const openNo = ref('')
const show = computed({
  get: () => !!openNo.value,
  set: (v) => {
    if (!v) openNo.value = ''
  },
})
const { data: detail } = useRequest(() => (openNo.value ? api.storeops.stocktake(openNo.value) : Promise.resolve(null)), { watch: [openNo] })
const lineDiff = (sku: string) => detail.value?.diffs.find((d) => d.sku === sku)?.diff ?? 0

const canPost = computed(() => {
  const s = detail.value?.stocktake
  return !!s && s.status === 'submitted' && admin.has('stocktake.post') && admin.storeIds.includes(s.storeId)
})
const showAuth = ref(false)
function post(cred: AuthorizeResult) {
  const s = detail.value!.stocktake
  return api.storeops.postStocktake({ no: s.no, operatorJobNo: admin.user!.jobNo, authorizer: { jobNo: cred.jobNo, pin: cred.pin } })
}
function onPosted(cred: AuthorizeResult) {
  fb.ok('差异已过账', `授权人 ${cred.jobNo} ${cred.name}，中枢已按差异调账`)
}
</script>

<template>
  <div>
    <PageHead title="盘点单">
      <template #desc>盘点录入和提交在移动端做。差异在授权之前不改变可售数量，授权之后由中枢调整（《4.全局业务规则》§二）</template>
      <template #actions>
        <StoreSelect v-model="storeId" />
        <n-select v-model:value="st" :options="statusOptions" clearable placeholder="全部状态" class="!w-140px" />
      </template>
    </PageHead>

    <Hint class="mb-4">
      盘点期间 <AssumptionTag k="stocktakeSales" />，抽盘差异阈值 <PendingTag id="待确认-15" />；差异过账由店长发起、授权人确认，授权层级 <PendingTag id="待确认-51" />；
      加盟店是共同盘点，只记事实，不出赔偿金额 <PendingTag id="待确认-23" />
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="data ?? []"
        :loading="loading && !data"
        :pagination="pagination"
        :row-key="(s: Stocktake) => s.no"
        :row-props="clickable((s: Stocktake) => (openNo = s.no))"
        :scroll-x="1450"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="620">
      <n-drawer-content closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">盘点单 <BillNo :no="openNo" /> <StatusTag v-if="detail" :def="STOCKTAKE_STATUS[detail.stocktake.status]" /></span>
        </template>
        <template v-if="detail">
          <div class="flex flex-col gap-4 text-14px">
            <n-descriptions :column="2" label-placement="left" size="small" bordered>
              <n-descriptions-item label="门店" :span="2">{{ admin.storeText(detail.stocktake.storeId) }}</n-descriptions-item>
              <n-descriptions-item label="范围">{{ detail.stocktake.scope === 'full' ? '全盘' : '抽盘' }}{{ detail.stocktake.joint ? '（共同盘点）' : '' }}</n-descriptions-item>
              <n-descriptions-item label="建单人">{{ admin.who(detail.stocktake.creatorJobNo) }}</n-descriptions-item>
              <n-descriptions-item label="提交时间"><span class="qs-num">{{ orEmpty(detail.stocktake.submittedAt) }}</span></n-descriptions-item>
              <n-descriptions-item label="授权人">{{ admin.who(detail.stocktake.authorizerJobNo) }}</n-descriptions-item>
              <n-descriptions-item label="备注" :span="2">{{ orEmpty(detail.stocktake.note) }}</n-descriptions-item>
            </n-descriptions>

            <div class="overflow-hidden rounded-10px border border-line">
              <div class="grid grid-cols-[1fr_88px_64px_64px] bg-subtle px-3 py-2 text-12px font-600 text-t2">
                <span>商品</span><span class="text-right">账面（建单时）</span><span class="text-right">实盘</span><span class="text-right">差异</span>
              </div>
              <div class="qs-scroll max-h-420px overflow-y-auto">
                <div v-for="l in detail.stocktake.lines" :key="l.sku" class="grid grid-cols-[1fr_88px_64px_64px] items-center border-t border-line px-3 py-1.5" :class="lineDiff(l.sku) ? 'bg-[#FFFBF2]' : ''">
                  <span class="min-w-0 leading-tight">
                    <span class="block truncate">{{ l.name }}</span>
                    <span class="text-12px text-t3"><span class="font-mono">{{ l.sku }}</span> · {{ l.spec }}</span>
                  </span>
                  <span class="qs-num text-right">{{ l.bookQty }}</span>
                  <span class="qs-num text-right font-600">{{ l.countedQty ?? '-' }}</span>
                  <span class="qs-num text-right font-600" :class="lineDiff(l.sku) > 0 ? 'text-ok' : lineDiff(l.sku) < 0 ? 'text-bad' : 'text-t3'">
                    {{ l.countedQty === null ? '-' : lineDiff(l.sku) > 0 ? `+${lineDiff(l.sku)}` : lineDiff(l.sku) }}
                  </span>
                </div>
              </div>
            </div>

            <Hint v-if="detail.stocktake.status === 'submitted'" tone="warn">
              {{ detail.diffs.length ? `${detail.diffs.length}行有差异，` : '账实相符，' }}授权过账之前本店可用不变。{{ BASIS.stocktake }}
            </Hint>
            <Hint v-else-if="detail.stocktake.status === 'adjusted'" tone="info">
              中枢已调账 <BillNo :no="detail.stocktake.hubResultNo" />，库存流水记为「盘点调账」。
              <template v-if="detail.stocktake.joint">共同盘点只记事实，赔偿规则 <PendingTag id="待确认-23" /></template>
            </Hint>
            <Hint v-else>还在盘点中，移动端录完实盘数后提交</Hint>
          </div>
        </template>
        <div v-else class="py-16 text-center"><n-spin /></div>
        <template v-if="detail?.stocktake.status === 'submitted'" #footer>
          <div class="flex w-full items-center justify-between gap-3">
            <span class="text-12px text-t3">{{ canPost ? '发起后由授权人输入工号和PIN确认' : '差异过账由本店店长发起，例如 QS1001 王海' }}</span>
            <n-button v-if="canPost" type="primary" @click="showAuth = true">
              <template #icon><span class="i-ph-seal-check-fill" /></template>
              差异过账
            </n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <AuthorizeModal
      v-if="detail"
      v-model:show="showAuth"
      :store-id="detail.stocktake.storeId"
      title="盘点差异过账授权"
      confirm-text="确认过账"
      :action="post"
      @authorized="onPosted"
    >
      <div class="rounded-10px bg-[#FDF3E3] px-3 py-2.5 text-13px text-[#7C4A03]">
        盘点单 <BillNo :no="detail.stocktake.no" plain />：{{ detail.diffs.length }}行差异，授权后中枢按差异调账，可用量随之变化
      </div>
    </AuthorizeModal>
  </div>
</template>
