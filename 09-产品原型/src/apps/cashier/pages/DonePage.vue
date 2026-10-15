<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { errorInfo, useRequest } from '@/shared/composables/useRequest'
import { HUB_SYNC, PAY_METHOD } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { payColors } from '@/shared/theme/tokens'
import type { Store } from '@/shared/types'
import { formatMoney, maskName, maskPhone } from '@/shared/utils/format'
import { timeOf } from '@/shared/utils/time'
import { useSession } from '../stores/session'

const props = defineProps<{ store: Store }>()
const route = useRoute()
const router = useRouter()
const session = useSession()

const no = computed(() => String(route.params.no ?? ''))
const { data, error } = useRequest(() => api.sales.get(no.value), { watch: [no] })
const { data: employees } = useRequest(() => api.master.employees(), { live: false })
const nameOf = (jobNo: string) => employees.value?.find((e) => e.jobNo === jobNo)?.name ?? jobNo

const sale = computed(() => data.value?.sale)
const change = computed(() => (sale.value?.payments ?? []).reduce((s, p) => s + (p.change ?? 0), 0))
const tendered = computed(() => (sale.value?.payments ?? []).reduce((s, p) => s + (p.tendered ?? 0), 0))
const discount = computed(() => (sale.value ? sale.value.totals.list - sale.value.totals.payable : 0))
const qty = computed(() => (sale.value?.lines ?? []).reduce((n, l) => n + l.qty, 0))
const register = computed(() => props.store.registers.find((r) => r.no === sale.value?.registerNo))
const guides = computed(() => [...new Set((sale.value?.lines ?? []).map((l) => l.guideJobNo))])
const deducted = computed(() => (data.value?.ledger ?? []).reduce((n, l) => n - l.change, 0))
</script>

<template>
  <div class="flex h-full gap-5 p-5">
    <section class="flex min-w-0 flex-1 flex-col gap-4">
      <div v-if="error" class="qs-card flex flex-1 flex-col items-center justify-center gap-4">
        <span class="i-ph-warning-circle-fill text-56px text-bad" />
        <div class="text-18px font-600">{{ errorInfo(error).message }}</div>
        <n-button size="large" type="primary" @click="router.replace({ name: 'sale' })">回到收银</n-button>
      </div>

      <template v-else-if="sale">
        <div class="qs-card relative overflow-hidden px-7 py-6">
          <div class="pointer-events-none absolute -right-16 -top-20 h-220px w-220px rounded-full bg-brand-50" />
          <div class="relative flex items-center gap-4">
            <div class="qs-flex-center h-68px w-68px rounded-20px bg-ok text-white shadow-card">
              <span class="i-ph-check-bold text-40px" />
            </div>
            <div>
              <div class="text-26px font-700">收款完成，已生成销售单</div>
              <div class="mt-1.5 flex flex-wrap items-center gap-2 text-15px text-t2">
                <BillNo :no="sale.no" />
                <StatusTag :def="HUB_SYNC[sale.hubSync.status]" />
                <span class="text-13px text-t3">{{ timeOf(sale.createdAt) }} · {{ qty }}件</span>
              </div>
            </div>
          </div>

          <div class="relative mt-6 grid grid-cols-3 gap-4">
            <div class="rounded-16px bg-subtle px-5 py-4">
              <div class="text-14px text-t3">实收</div>
              <div class="qs-num mt-1.5 text-38px font-700 leading-none">{{ formatMoney(sale.totals.payable) }}</div>
            </div>
            <div class="rounded-16px px-5 py-4" :class="change > 0 ? 'bg-ink-900 text-white' : 'bg-subtle'">
              <div class="text-14px" :class="change > 0 ? 'text-white/60' : 'text-t3'">
                找零<span v-if="tendered" class="ml-1.5">（收现金 {{ formatMoney(tendered) }}）</span>
              </div>
              <div class="qs-num mt-1.5 text-38px font-700 leading-none" :class="change > 0 ? 'text-volt-400' : ''">{{ formatMoney(change) }}</div>
            </div>
            <div class="rounded-16px bg-promo-50 px-5 py-4">
              <div class="text-14px text-promo-600">本单优惠</div>
              <div class="qs-num mt-1.5 text-38px font-700 leading-none text-promo-500">{{ formatMoney(discount) }}</div>
            </div>
          </div>

          <div class="relative mt-5 flex flex-wrap gap-2.5">
            <div v-for="p in sale.payments" :key="p.id" class="flex items-center gap-2.5 rounded-12px border border-line bg-white py-2 pl-2 pr-4">
              <span class="qs-flex-center h-34px w-34px rounded-10px text-18px text-white" :style="{ background: payColors[p.method] }">
                <span :class="PAY_METHOD[p.method].icon" />
              </span>
              <div class="leading-tight">
                <div class="text-14px font-600">{{ PAY_METHOD[p.method].label }} <MoneyText :value="p.amount" /></div>
                <div class="font-mono text-11px text-t3">{{ p.channelTxnNo ?? '现金无通道流水号' }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="qs-card grid grid-cols-3 divide-x divide-line">
          <div class="px-5 py-4">
            <div class="text-13px text-t3">中枢结果单号</div>
            <div class="mt-1 text-15px"><BillNo :no="sale.hubSync.resultNo" /></div>
            <div class="mt-1 text-12px text-t3">按来源单号去重，重复回传不会重复扣减 <AssumptionTag k="hubResultNo" /></div>
          </div>
          <div class="px-5 py-4">
            <div class="text-13px text-t3">本店库存</div>
            <div class="mt-1 text-15px font-600">中枢已扣减 <span class="qs-num">{{ deducted }}</span> 件</div>
            <div class="mt-1 text-12px text-t3">扣的是{{ store.warehouse.name }}，POS不自己记账</div>
          </div>
          <div class="px-5 py-4">
            <div class="text-13px text-t3">业绩归属</div>
            <div class="mt-1 text-15px font-600">{{ guides.map((g) => `${g} ${nameOf(g)}`).join('、') }}</div>
            <div class="mt-1 text-12px text-t3">导购工号写在单头和每一行，提成不在POS里算 <PendingTag id="待确认-13" /></div>
          </div>
        </div>

        <div v-if="store.mode === 'franchise'" class="rounded-14px bg-[#FDF3E3] px-5 py-3 text-14px leading-22px text-[#92400E]">
          加盟店代销：货权归强盛，这笔营业款先由本店收取，日结后由中枢按营业日生成应缴，再通过门店与总部的结算归集到强盛。
        </div>

        <div class="mt-auto flex gap-3">
          <button
            type="button"
            class="pos-press flex h-72px flex-1 items-center justify-center gap-3 rounded-16px bg-volt-400 text-24px font-700 text-ink-900 shadow-volt hover:bg-volt-500"
            @click="router.replace({ name: 'sale' })"
          >
            <span class="i-ph-lightning-fill" />继续收银
          </button>
          <button type="button" disabled class="flex h-72px w-280px cursor-not-allowed items-center justify-center gap-2 rounded-16px border-2 border-dashed border-line-strong text-16px text-t3">
            <span class="i-ph-printer-bold text-22px" />打印小票（原型不接打印机）
          </button>
        </div>
      </template>

      <div v-else class="flex flex-1 items-center justify-center"><n-spin size="large" /></div>
    </section>

    <aside class="qs-scroll w-370px shrink-0 overflow-y-auto pb-4">
      <div class="mb-2 flex items-center justify-between px-1 text-13px text-t3">
        <span>屏幕小票预览</span>
        <span>版式为演示，正式版式待门店确认</span>
      </div>
      <div v-if="sale" class="receipt-paper mx-auto px-6 pb-9 pt-6 text-13px leading-21px text-t1 shadow-card">
        <div class="text-center">
          <div class="text-18px font-700 tracking-wider">强盛科技</div>
          <div class="text-14px">{{ store.name }}</div>
          <div class="text-12px text-t3">销售小票</div>
        </div>
        <div class="my-3 border-t border-dashed border-line-strong" />
        <div class="flex justify-between gap-2"><span class="text-t3">单号</span><span class="font-mono text-12px">{{ sale.no }}</span></div>
        <div class="flex justify-between"><span class="text-t3">时间</span><span class="qs-num">{{ sale.createdAt }}</span></div>
        <div class="flex justify-between"><span class="text-t3">收银台</span><span>{{ register?.name ?? sale.registerNo }}</span></div>
        <div class="flex justify-between"><span class="text-t3">收银员</span><span>{{ sale.cashierJobNo }} {{ nameOf(sale.cashierJobNo) }}</span></div>
        <div class="flex justify-between"><span class="text-t3">导购</span><span>{{ guides.join('、') }}</span></div>
        <div class="my-3 border-t border-dashed border-line-strong" />
        <div v-for="l in sale.lines" :key="l.lineNo" class="mb-2">
          <div class="font-600">{{ l.name }}</div>
          <div class="flex justify-between text-t2">
            <span class="qs-num">{{ l.spec }} · {{ l.qty }} × {{ formatMoney(l.unitPrice) }}</span>
            <span class="qs-num text-t1">{{ formatMoney(l.payable) }}</span>
          </div>
          <div v-if="l.payable !== l.listAmount" class="flex justify-between text-12px text-promo-600">
            <span>优惠</span><span class="qs-num">-{{ formatMoney(l.listAmount - l.payable) }}</span>
          </div>
          <div v-if="l.sns.length" class="break-all font-mono text-11px leading-16px text-t3">SN {{ l.sns.join(' ') }}</div>
        </div>
        <div class="my-3 border-t border-dashed border-line-strong" />
        <div class="flex justify-between"><span>原价合计</span><span class="qs-num">{{ formatMoney(sale.totals.list) }}</span></div>
        <div v-for="p in sale.promotions" :key="p.promotionId" class="flex justify-between gap-3 text-promo-600">
          <span class="truncate">{{ p.name }}</span><span class="qs-num">-{{ formatMoney(p.discount) }}</span>
        </div>
        <div v-if="sale.totals.manual" class="flex justify-between text-promo-600">
          <span>改价（已授权）</span><span class="qs-num">-{{ formatMoney(sale.totals.manual) }}</span>
        </div>
        <div class="mt-1 flex items-end justify-between">
          <span class="font-700">应收</span><span class="qs-num text-20px font-700">{{ formatMoney(sale.totals.payable) }}</span>
        </div>
        <div class="my-3 border-t border-dashed border-line-strong" />
        <div v-for="p in sale.payments" :key="p.id" class="flex justify-between">
          <span>{{ PAY_METHOD[p.method].label }}</span><span class="qs-num">{{ formatMoney(p.amount) }}</span>
        </div>
        <template v-if="tendered">
          <div class="flex justify-between text-t2"><span>收现金</span><span class="qs-num">{{ formatMoney(tendered) }}</span></div>
          <div class="flex justify-between text-t2"><span>找零</span><span class="qs-num">{{ formatMoney(change) }}</span></div>
        </template>
        <template v-if="data?.member">
          <div class="my-3 border-t border-dashed border-line-strong" />
          <div class="flex justify-between"><span class="text-t3">会员</span><span>{{ maskName(data.member.name) }} {{ maskPhone(data.member.phone) }}</span></div>
          <div v-if="sale.couponIds.length" class="flex justify-between"><span class="text-t3">用券</span><span>1张</span></div>
        </template>
        <div class="my-3 border-t border-dashed border-line-strong" />
        <div class="text-12px leading-19px text-t3">
          <div>中枢结果 <span class="font-mono">{{ sale.hubSync.resultNo }}</span></div>
          <div>发票由谁开、走哪套系统未定，原型不开票 <PendingTag id="待确认-31" /></div>
        </div>
        <div class="mt-4 text-center text-12px text-t3">— 演示数据，不作购物凭证 —</div>
      </div>
      <div v-if="session.user" class="mt-3 text-center text-12px text-t3">收银员 {{ session.user.name }} · {{ store.code }}</div>
    </aside>
  </div>
</template>
