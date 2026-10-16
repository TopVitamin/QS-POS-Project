<script setup lang="ts">
import { computed, h, ref } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { DUE_STATUS, REMITTANCE_STATUS, SETTLEMENT_STATUS } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import { useFeedback } from '@/shared/naive/feedback'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { FranchiseSettlement } from '@/shared/types'
import { bill, clickable, dateTime, money, muted, pagination, status, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const fb = useFeedback()
const filter = computed(() => ({ franchiseeIds: admin.franchiseeIds }))
const { data, loading } = useRequest(() => api.franchise.settlements(filter.value), { watch: [filter] })

const lineOf = (s: FranchiseSettlement, key: string) => s.lines.find((l) => l.key === key)?.amount ?? null
const columns: DataTableColumns<FranchiseSettlement> = [
  { title: '结算单号', key: 'no', width: 240, fixed: 'left', render: (s) => two(bill(s.no), admin.franchiseeText(s.franchiseeId)) },
  { title: '结算期间', key: 'period', width: 200, render: (s) => h('span', { class: 'qs-num' }, `${s.periodStart} 至 ${s.periodEnd}`) },
  { title: '应缴合计', key: 'dues', width: 130, align: 'right', render: (s) => money(lineOf(s, 'dues'), { strong: true }) },
  { title: '已缴并核对', key: 'confirmed', width: 130, align: 'right', render: (s) => money(lineOf(s, 'confirmed'), { tone: 'ok' }) },
  { title: '未缴或待核对', key: 'outstanding', width: 130, align: 'right', render: (s) => money(lineOf(s, 'outstanding'), { tone: lineOf(s, 'outstanding') ? 'promo' : 'muted' }) },
  { title: '分成、佣金、赔偿', key: 'pending', width: 150, render: () => muted('规则未定，不出金额') },
  { title: '出单时间', key: 'generatedAt', width: 170, render: (s) => dateTime(s.generatedAt) },
  { title: '状态', key: 'status', width: 100, fixed: 'right', render: (s) => status(SETTLEMENT_STATUS[s.status]) },
]

const openNo = ref('')
const show = computed({
  get: () => !!openNo.value,
  set: (v) => {
    if (!v) openNo.value = ''
  },
})
const { data: detail } = useRequest(() => (openNo.value ? api.franchise.settlement(openNo.value) : Promise.resolve(null)), { watch: [openNo] })

const canDispute = computed(() => admin.has('settlement.dispute'))
const showDispute = ref(false)
const note = ref('')
const busy = ref(false)
async function submitDispute() {
  if (!admin.user || !detail.value) return
  busy.value = true
  const r = await fb.run(() => api.franchise.dispute({ no: detail.value!.settlement.no, byJobNo: admin.user!.jobNo, note: note.value }), '异议已提交，结算单上的数不改')
  busy.value = false
  if (r) {
    showDispute.value = false
    note.value = ''
  }
}
</script>

<template>
  <div>
    <PageHead title="加盟结算单">
      <template #desc>结算单取已经封账的流水，只读，POS不付款。分成、履约佣金、盘亏赔偿等规则未定的项不出金额；有异议另提，不改原始成交，也不改结算单上的数（《4.全局业务规则》§六）</template>
    </PageHead>

    <div v-if="!admin.franchiseeIds.length" class="qs-card py-16 text-center text-t3">当前身份没有被授权查看加盟结算</div>
    <template v-else>
      <Hint class="mb-4">
        结算单放在中枢还是金蝶、加盟商用什么查看 <PendingTag id="待确认-38" />；结算周期和确认时限 <PendingTag id="待确认-19" />；演示期间 <AssumptionTag k="settlementPeriod" />
      </Hint>
      <div class="qs-card overflow-hidden">
        <n-data-table
          :columns="columns"
          :data="data ?? []"
          :loading="loading && !data"
          :pagination="pagination"
          :row-key="(s: FranchiseSettlement) => s.no"
          :row-props="clickable((s: FranchiseSettlement) => (openNo = s.no))"
          :scroll-x="1260"
          :bordered="false"
        />
      </div>
    </template>

    <n-drawer v-model:show="show" :width="640">
      <n-drawer-content closable :native-scrollbar="false">
        <template #header>
          <span class="flex items-center gap-2">结算单 <BillNo :no="openNo" /> <StatusTag v-if="detail" :def="SETTLEMENT_STATUS[detail.settlement.status]" /></span>
        </template>
        <div v-if="detail" class="flex flex-col gap-4 text-14px">
          <div class="text-13px text-t2">
            {{ admin.franchiseeText(detail.settlement.franchiseeId) }} · 期间 <span class="qs-num">{{ detail.settlement.periodStart }} 至 {{ detail.settlement.periodEnd }}</span>
          </div>

          <div class="overflow-hidden rounded-12px border border-line">
            <div v-for="l in detail.settlement.lines" :key="l.key" class="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0" :class="l.amount === null ? 'bg-subtle/60' : ''">
              <div class="min-w-0 flex-1 leading-tight">
                <div class="flex items-center gap-2 font-600">{{ l.label }} <PendingTag v-if="l.pending?.length" :id="l.pending" /></div>
                <div class="mt-1 text-12px text-t3">{{ l.note }}</div>
              </div>
              <MoneyText v-if="l.amount !== null" :value="l.amount" class="text-16px font-700" />
              <span v-else class="whitespace-nowrap rounded-6px border border-dashed border-line-strong px-2 py-0.5 text-12px text-t3">不出金额</span>
            </div>
          </div>

          <div>
            <div class="mb-1.5 font-600">期间应缴 {{ detail.dues.length }}</div>
            <div v-for="d in detail.dues" :key="d.no" class="flex items-center gap-3 border-b border-line py-1.5 text-13px last:border-0">
              <span class="qs-num w-90px text-t2">{{ d.bizDate }}</span>
              <span class="min-w-0 flex-1 truncate font-mono text-12.5px">{{ d.no }}</span>
              <StatusTag :def="DUE_STATUS[d.status]" />
              <MoneyText :value="d.total" class="w-100px text-right font-600" />
            </div>
          </div>

          <div v-if="detail.remittances.length">
            <div class="mb-1.5 font-600">对应缴款</div>
            <div v-for="r in detail.remittances" :key="r.no" class="flex items-center gap-3 border-b border-line py-1.5 text-13px last:border-0">
              <span class="font-mono text-12.5px">{{ r.voucherNo }}</span>
              <span class="text-t3">{{ r.method }} · {{ r.dueNos.length }}笔</span>
              <span class="flex-1" />
              <StatusTag :def="REMITTANCE_STATUS[r.status]" />
              <MoneyText :value="r.amount" class="w-100px text-right font-600" />
            </div>
          </div>

          <div v-if="detail.settlement.disputes.length" class="rounded-12px border border-[#F5D9A8] bg-[#FFFBF2] px-4 py-3">
            <div class="mb-1 font-600">异议记录</div>
            <div v-for="(x, i) in detail.settlement.disputes" :key="i" class="py-1 text-13px">
              <span class="qs-num text-t3">{{ x.at }}</span> {{ admin.who(x.byJobNo) }}：{{ x.note }}
            </div>
          </div>
        </div>
        <div v-else class="py-16 text-center"><n-spin /></div>
        <template v-if="detail" #footer>
          <div class="flex w-full items-center justify-between gap-3">
            <span class="text-12px text-t3">{{ canDispute ? '提异议不改结算单上的数，交给强盛核对' : '提异议由加盟商账号做，例如 JMA001 赵磊' }}</span>
            <n-button v-if="canDispute" @click="showDispute = true">
              <template #icon><span class="i-ph-chat-circle-text-fill" /></template>
              提异议
            </n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="showDispute" preset="card" title="对结算单提异议" :style="{ width: '480px' }" :mask-closable="!busy" :segmented="{ content: true, footer: 'soft' }">
      <div class="flex flex-col gap-3">
        <n-input v-model:value="note" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="写明哪一项、哪一天、差多少" maxlength="200" show-count />
        <Hint>异议另提，不改原始成交，也不改结算单上的数（《7.模式说明》§2.2）</Hint>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <n-button :disabled="busy" @click="showDispute = false">取消</n-button>
          <n-button type="primary" :loading="busy" :disabled="!note.trim()" @click="submitDispute">提交异议</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>
