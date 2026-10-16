<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { REMITTANCE_STATUS } from '@/shared/config/labels'
import BillNo from '@/shared/naive/BillNo.vue'
import { useFeedback } from '@/shared/naive/feedback'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { Remittance } from '@/shared/types'
import { codeName } from '@/shared/utils/format'
import { clickable, dateTime, money, mono, muted, pagination, status, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const fb = useFeedback()
const st = ref<Remittance['status'] | null>(null)
const filter = computed(() => ({ franchiseeIds: admin.franchiseeIds, status: st.value ?? undefined }))
const { data, loading } = useRequest(() => api.franchise.remittances(filter.value), { watch: [filter] })

const columns: DataTableColumns<Remittance> = [
  { title: '凭证号', key: 'voucherNo', width: 200, fixed: 'left', render: (r) => two(mono(r.voucherNo), admin.franchiseeText(r.franchiseeId)) },
  { title: '缴款方式', key: 'method', width: 100 },
  { title: '对应应缴', key: 'dueNos', minWidth: 240, render: (r) => h('div', { class: 'flex flex-col font-mono text-12.5px leading-18px' }, r.dueNos.map((n) => h('span', null, n))) },
  { title: '金额', key: 'amount', width: 130, align: 'right', render: (r) => money(r.amount, { strong: true }) },
  { title: '登记', key: 'registeredAt', width: 170, render: (r) => two(dateTime(r.registeredAt), admin.who(r.registrantJobNo)) },
  { title: '中枢核对', key: 'confirmedAt', width: 170, render: (r) => (r.confirmedAt ? dateTime(r.confirmedAt) : muted('等中枢核对')) },
  { title: '备注', key: 'note', width: 160, ellipsis: { tooltip: true }, render: (r) => r.note ?? '' },
  { title: '状态', key: 'status', width: 110, fixed: 'right', render: (r) => status(REMITTANCE_STATUS[r.status]) },
]
const statusOptions = Object.entries(REMITTANCE_STATUS).map(([value, d]) => ({ label: d.label, value }))

// ---------- 登记缴款 ----------
const canRegister = computed(() => admin.has('remit.register') && admin.franchiseeIds.length > 0)
const showNew = ref(false)
const busy = ref(false)
const METHODS = ['银行转账', '其他']
const form = ref({ franchiseeId: null as string | null, dueNos: [] as string[], method: '银行转账', voucherNo: '', note: '' })
const { data: unpaid } = useRequest(
  () => (form.value.franchiseeId ? api.franchise.dues({ franchiseeIds: [form.value.franchiseeId], status: 'unpaid' }) : Promise.resolve([])),
  { watch: [() => form.value.franchiseeId] },
)
const picked = computed(() => (unpaid.value ?? []).filter((d) => form.value.dueNos.includes(d.no)))
const amount = computed(() => picked.value.reduce((s, d) => s + d.total, 0))
watch(
  () => form.value.franchiseeId,
  () => (form.value.dueNos = []),
)
const franchiseeOptions = computed(() => admin.scopedFranchisees.map((f) => ({ label: codeName(f.code, f.name), value: f.id })))
function toggle(no: string) {
  const list = form.value.dueNos
  form.value.dueNos = list.includes(no) ? list.filter((x) => x !== no) : [...list, no]
}

function openNew() {
  form.value = { franchiseeId: admin.franchiseeIds[0] ?? null, dueNos: [], method: '银行转账', voucherNo: '', note: '' }
  showNew.value = true
}
const openNo = ref('')
const current = computed(() => (data.value ?? []).find((r) => r.no === openNo.value) ?? null)
const showDetail = computed({
  get: () => !!openNo.value,
  set: (v) => {
    if (!v) openNo.value = ''
  },
})
const { data: relatedDues } = useRequest(
  () => (current.value ? api.franchise.dues({ franchiseeIds: [current.value.franchiseeId] }) : Promise.resolve([])),
  { watch: [() => current.value?.no] },
)
const dueRows = computed(() => (relatedDues.value ?? []).filter((d) => current.value?.dueNos.includes(d.no)))

async function submit() {
  if (!form.value.franchiseeId || !admin.user) return
  busy.value = true
  const r = await fb.run(
    () =>
      api.franchise.registerRemittance({
        franchiseeId: form.value.franchiseeId!,
        dueNos: form.value.dueNos,
        method: form.value.method,
        voucherNo: form.value.voucherNo,
        registrantJobNo: admin.user!.jobNo,
        note: form.value.note.trim() || undefined,
      }),
    (x) => `已登记${x.dueNos.length}笔应缴，等中枢核对`,
  )
  busy.value = false
  if (r) showNew.value = false
}
</script>

<template>
  <div>
    <PageHead title="缴款登记">
      <template #desc>加盟商把应缴营业款缴给强盛后在这里登记，中枢核对到账。金额取所选应缴之和，不能手改；分成不在这里扣，等结算单（《7.模式说明》§2.2）</template>
      <template #actions>
        <n-select v-model:value="st" :options="statusOptions" clearable placeholder="全部状态" class="!w-140px" />
        <n-button v-if="canRegister" type="primary" @click="openNew">
          <template #icon><span class="i-ph-plus-bold" /></template>
          登记缴款
        </n-button>
      </template>
    </PageHead>

    <div v-if="!admin.franchiseeIds.length" class="qs-card py-16 text-center text-t3">当前身份没有被授权查看加盟商的缴款</div>
    <template v-else>
      <Hint class="mb-4">
        上缴全额还是净额、时限和逾期处理 <PendingTag id="待确认-17" />；收款用谁的商户号 <PendingTag id="待确认-16" />；现金缴款方式 <PendingTag id="待确认-10" />。
        {{ canRegister ? '核对在「中枢模拟器」里演示。' : '强盛财务只看，登记由加盟商财务或加盟商管理做，例如 JMA002 吴婷。' }}
      </Hint>
      <div class="qs-card overflow-hidden">
        <n-data-table
          :columns="columns"
          :data="data ?? []"
          :loading="loading && !data"
          :pagination="pagination"
          :row-key="(r: Remittance) => r.no"
          :row-props="clickable((r: Remittance) => (openNo = r.no))"
          :scroll-x="1300"
          :bordered="false"
        />
      </div>
    </template>

    <n-drawer v-model:show="showDetail" :width="520">
      <n-drawer-content v-if="current" closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">缴款 <span class="font-mono">{{ current.voucherNo }}</span> <StatusTag :def="REMITTANCE_STATUS[current.status]" /></span>
        </template>
        <div class="flex flex-col gap-4 text-14px">
          <n-descriptions :column="1" label-placement="left" size="small" bordered>
            <n-descriptions-item label="加盟商">{{ admin.franchiseeText(current.franchiseeId) }}</n-descriptions-item>
            <n-descriptions-item label="方式">{{ current.method }}</n-descriptions-item>
            <n-descriptions-item label="金额"><MoneyText :value="current.amount" strong /></n-descriptions-item>
            <n-descriptions-item label="登记">{{ admin.who(current.registrantJobNo) }} · <span class="qs-num">{{ current.registeredAt }}</span></n-descriptions-item>
            <n-descriptions-item label="中枢核对">{{ current.confirmedAt ?? '等中枢核对' }}</n-descriptions-item>
            <n-descriptions-item v-if="current.note" label="备注">{{ current.note }}</n-descriptions-item>
          </n-descriptions>
          <div>
            <div class="mb-1.5 font-600">对应应缴</div>
            <div v-for="d in dueRows" :key="d.no" class="flex justify-between border-b border-line py-2 last:border-0">
              <span><BillNo :no="d.no" plain /> <span class="text-12px text-t3">{{ admin.storeText(d.storeId) }} · {{ d.bizDate }}</span></span>
              <MoneyText :value="d.total" />
            </div>
          </div>
          <Hint>核对在「中枢模拟器」里演示。金额取所选应缴之和，不能手改</Hint>
        </div>
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="showNew" preset="card" title="登记缴款" :style="{ width: '600px' }" :mask-closable="!busy" :segmented="{ content: true, footer: 'soft' }">
      <div class="flex flex-col gap-4">
        <n-form-item v-if="franchiseeOptions.length > 1" label="加盟商" :show-feedback="false">
          <n-select v-model:value="form.franchiseeId" :options="franchiseeOptions" />
        </n-form-item>
        <n-form-item label="选择待缴的应缴" :show-feedback="false">
          <div class="qs-scroll max-h-260px w-full overflow-y-auto rounded-10px border border-line">
            <div
              v-for="d in unpaid ?? []"
              :key="d.no"
              class="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-0 hover:bg-subtle"
              @click="toggle(d.no)"
            >
              <n-checkbox :checked="form.dueNos.includes(d.no)" class="pointer-events-none" />
              <span class="min-w-0 flex-1 leading-tight">
                <span class="block font-mono text-13px">{{ d.no }}</span>
                <span class="text-12px text-t3">{{ admin.storeText(d.storeId) }} · 营业日 <span class="qs-num">{{ d.bizDate }}</span></span>
              </span>
              <MoneyText :value="d.total" strong />
            </div>
            <div v-if="unpaid && !unpaid.length" class="px-3 py-5 text-center text-13px text-t3">没有待缴的应缴。加盟店日结封账后中枢才会生成</div>
          </div>
        </n-form-item>
        <div class="flex items-center justify-between rounded-10px bg-subtle px-4 py-3">
          <span class="text-14px text-t2">缴款金额 <span class="text-12px text-t3">（所选应缴之和，不能手改）</span> <PendingTag id="待确认-17" /></span>
          <MoneyText :value="amount" class="text-20px font-700" />
        </div>
        <div class="grid grid-cols-[160px_1fr] gap-3">
          <n-form-item label="缴款方式" :show-feedback="false">
            <n-select v-model:value="form.method" :options="METHODS.map((m) => ({ label: m, value: m }))" />
          </n-form-item>
          <n-form-item label="凭证号" :show-feedback="false">
            <n-input v-model:value="form.voucherNo" placeholder="银行回单号或其他凭证号" clearable />
          </n-form-item>
        </div>
        <n-form-item label="备注" :show-feedback="false">
          <n-input v-model:value="form.note" placeholder="选填" maxlength="60" />
        </n-form-item>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <n-button :disabled="busy" @click="showNew = false">取消</n-button>
          <n-button type="primary" :loading="busy" :disabled="!form.dueNos.length || !form.voucherNo.trim()" @click="submit">提交登记</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>
