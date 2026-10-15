<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type JudgeResult } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { PICKUP_STATUS, VERIFY_REJECT } from '@/shared/config/labels'
import { judgePickup } from '@/shared/domain/rules'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import BillNo from '@/shared/naive/BillNo.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import { useFeedback } from '@/shared/naive/feedback'
import type { PickupOrder, Store, VerificationRecord } from '@/shared/types'
import { maskName, maskPhone } from '@/shared/utils/format'
import { timeOf, todayBizDate } from '@/shared/utils/time'
import NumPad from '../components/NumPad.vue'
import { useCart } from '../stores/cart'
import { useSession } from '../stores/session'

const props = defineProps<{ store: Store }>()
const session = useSession()
const cart = useCart()
const router = useRouter()
const fb = useFeedback()

const { data: pickups } = useRequest(() => api.fulfil.pickups())
const { data: records } = useRequest(() => api.fulfil.verifications({ storeIds: [props.store.id], bizDate: todayBizDate() }))
const { data: employees } = useRequest(() => api.master.employees(), { live: false })
const nameOf = (jobNo: string) => employees.value?.find((e) => e.jobNo === jobNo)?.name ?? jobNo

/** 演示用：本店待核销的码，加上已核销、过期、别家店和不存在的码各一个 */
const demoCodes = computed(() => {
  const all = pickups.value ?? []
  const mine = all.filter((p) => p.storeId === props.store.id)
  const list: PickupOrder[] = mine.filter((p) => p.status === 'pending').slice(0, 5)
  const verified = mine.find((p) => p.status === 'verified')
  const expired = mine.find((p) => p.status === 'expired')
  const other = all.find((p) => p.storeId !== props.store.id && p.status === 'pending')
  for (const p of [verified, expired, other]) if (p) list.push(p)
  return [
    ...list.map((p) => ({ code: p.pickupCode, verdict: judgePickup(p, props.store.id) })),
    { code: '000000', verdict: judgePickup(undefined, props.store.id) },
  ]
})

const code = ref('')
const busy = ref(false)
const result = ref<JudgeResult | null>(null)
const checked = ref(false)
const done = ref<{ record: VerificationRecord; order: PickupOrder } | null>(null)

function reset() {
  result.value = null
  done.value = null
  checked.value = false
}

async function judge(c = code.value) {
  if (!session.user || !c.trim()) return
  code.value = c
  reset()
  busy.value = true
  try {
    result.value = await api.fulfil.judge({ storeId: props.store.id, code: c, operatorJobNo: session.user.jobNo })
  } catch (e) {
    fb.fail(e)
  } finally {
    busy.value = false
  }
}

async function confirm() {
  if (!session.user || !result.value?.ok || !checked.value) return
  busy.value = true
  try {
    done.value = await api.fulfil.confirm({ storeId: props.store.id, code: code.value, operatorJobNo: session.user.jobNo })
    result.value = null
    code.value = ''
  } catch (e) {
    fb.fail(e, '核销没有成功')
    result.value = null
  } finally {
    busy.value = false
  }
}

const rejected = computed(() => (result.value && !result.value.ok ? result.value : null))
const passed = computed(() => (result.value?.ok ? result.value.order : null))

function toAgent() {
  const r = rejected.value
  if (!r) return
  cart.setAgentPrefill({
    items: (r.order?.items ?? []).map((i) => ({ sku: i.sku, qty: i.qty })),
    source: 'pickup_rejected',
    sourceRef: code.value,
    reason: `提货码${code.value}核销被拒：${r.label}`,
  })
  router.push({ name: 'agent' })
}

const verdictCls = (ok: boolean) => (ok ? 'border-ok/40 bg-[#E8F7EE] text-[#166534]' : 'border-line bg-white text-t2')
</script>

<template>
  <div class="flex h-full gap-4 p-4">
    <section class="qs-card flex w-400px shrink-0 flex-col gap-3 p-5">
      <div class="flex items-center justify-between">
        <div class="text-17px font-700">输入提货码</div>
        <div class="text-12px text-t3">顾客出示小程序里的码</div>
      </div>
      <div class="flex h-72px items-center justify-center rounded-16px border-2 bg-subtle" :class="code ? 'border-brand-400' : 'border-line'">
        <span v-if="code" class="qs-num text-44px font-700 tracking-[0.3em] text-t1">{{ code }}</span>
        <span v-else class="text-16px text-t3">由中枢核验，POS不生成提货码</span>
      </div>
      <NumPad v-model="code" mode="code" :max-length="8" compact keyboard :confirm-text="busy ? '核验中' : '核验'" :confirm-disabled="busy || !code" @confirm="judge()" />
      <div class="mt-1 border-t border-line pt-3">
        <div class="mb-2 flex items-center justify-between text-13px">
          <span class="font-600 text-t2">演示用提货码</span>
          <span class="text-12px text-t3">点一下直接核验</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="d in demoCodes"
            :key="d.code"
            type="button"
            class="pos-press rounded-10px border px-2 py-1.5 text-left leading-tight"
            :class="verdictCls(d.verdict.ok)"
            @click="judge(d.code)"
          >
            <span class="qs-num block text-16px font-700 text-t1">{{ d.code }}</span>
            <span class="block truncate text-11px">{{ d.verdict.ok ? '可核销' : VERIFY_REJECT[d.verdict.reason].label }}</span>
          </button>
        </div>
      </div>
    </section>

    <section class="flex min-w-0 flex-1 flex-col gap-4">
      <div class="qs-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <!-- 核验通过：核对商品后确认 -->
        <div v-if="passed" class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center gap-3 border-b border-line bg-[#E8F7EE] px-6 py-4">
            <span class="i-ph-seal-check-fill text-36px text-ok" />
            <div class="flex-1">
              <div class="text-20px font-700 text-[#166534]">中枢核验通过</div>
              <div class="text-13px text-t2">门店一致、锁定有效、未过期、未核销。请核对商品和数量后确认</div>
            </div>
            <StatusTag :def="PICKUP_STATUS[passed.status]" size="medium" />
          </div>
          <div class="qs-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div class="grid grid-cols-3 gap-4 text-14px">
              <div><div class="text-12px text-t3">OMS履约单号</div><BillNo :no="passed.omsNo" /></div>
              <div><div class="text-12px text-t3">小程序订单号</div><span class="font-mono text-13px">{{ passed.channelOrderNo }}</span></div>
              <div><div class="text-12px text-t3">锁定记录</div><BillNo :no="passed.lock.lockNo" /> <span class="text-12px text-t3">{{ timeOf(passed.lock.lockedAt) }}</span></div>
              <div>
                <div class="text-12px text-t3">顾客</div>
                <span class="font-600">{{ maskName(passed.customer.name) }} {{ maskPhone(passed.customer.phone) }}</span>
                <PendingTag v-if="store.mode === 'franchise'" id="待确认-52" />
              </div>
              <div><div class="text-12px text-t3">线上已付</div><MoneyText :value="passed.paidAmount" strong /> <span class="text-12px text-t3">门店不再收钱</span></div>
              <div><div class="text-12px text-t3">下单时间</div><span class="qs-num">{{ passed.createdAt }}</span></div>
            </div>
            <div class="mt-4 overflow-hidden rounded-14px border border-line">
              <div class="grid grid-cols-[1fr_120px] bg-subtle px-4 py-2 text-13px font-600 text-t2"><span>商品（以中枢下发为准，POS不改）</span><span class="text-right">数量</span></div>
              <div v-for="i in passed.items" :key="i.sku" class="grid grid-cols-[1fr_120px] items-center border-t border-line px-4 py-3">
                <div>
                  <div class="text-16px font-600">{{ i.name }}</div>
                  <div class="font-mono text-12px text-t3">{{ i.sku }} · {{ i.spec }}</div>
                </div>
                <div class="qs-num text-right text-24px font-700">× {{ i.qty }}</div>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4 border-t border-line px-6 py-4">
            <n-checkbox v-model:checked="checked" size="large">
              <span class="text-16px font-600">已当面核对商品和数量</span>
            </n-checkbox>
            <div class="flex-1" />
            <n-button size="large" @click="reset">取消</n-button>
            <button
              type="button"
              class="pos-press flex h-60px w-240px items-center justify-center gap-2 rounded-14px bg-brand-600 text-20px font-700 text-white shadow-card hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-[#A7B3B1]"
              :disabled="!checked || busy"
              @click="confirm"
            >
              <span class="i-ph-package-fill" />确认核销
            </button>
          </div>
        </div>

        <!-- 被拒 -->
        <div v-else-if="rejected" class="flex flex-1 flex-col">
          <div class="flex items-start gap-4 bg-[#FDECEC] px-6 py-6">
            <div class="qs-flex-center h-64px w-64px shrink-0 rounded-18px bg-bad text-white"><span class="i-ph-prohibit-bold text-38px" /></div>
            <div class="flex-1">
              <div class="text-26px font-700 text-bad">核销被拒：{{ rejected.label }}</div>
              <div class="mt-1 text-16px text-t1">{{ rejected.detail }}</div>
              <div v-if="rejected.basis" class="mt-2 text-13px text-t2">依据：{{ rejected.basis }}</div>
              <div class="mt-1 text-13px text-t3">提货码 <span class="qs-num font-600 text-t2">{{ code }}</span> · 被拒也留了核销记录和操作日志，不出库</div>
            </div>
          </div>
          <div class="flex-1 px-6 py-4">
            <template v-if="rejected.order">
              <div class="mb-2 flex items-center gap-2 text-14px text-t2">
                中枢上的履约单 <BillNo :no="rejected.order.omsNo" /> <StatusTag :def="PICKUP_STATUS[rejected.order.status]" />
                <span v-if="rejected.order.storeId !== store.id" class="text-warn">自提门店不是本店</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <span v-for="i in rejected.order.items" :key="i.sku" class="rounded-10px bg-subtle px-3 py-1.5 text-14px">{{ i.name }} × {{ i.qty }}</span>
              </div>
            </template>
            <div v-else class="text-14px text-t3">中枢没有这张提货码对应的履约单。</div>
            <div class="mt-4 rounded-12px bg-subtle px-4 py-3 text-13px leading-21px text-t2">
              顾客还要这件商品时，可以转代客下单：由中央OMS路由到有货的节点发货，POS不选仓、不选承运商。
              无码核销不开放 <PendingTag id="待确认-05" />
            </div>
          </div>
          <div class="flex justify-end gap-3 border-t border-line px-6 py-4">
            <n-button size="large" @click="reset(); code = ''">重新输入</n-button>
            <button
              v-if="session.has('agent.create') && rejected.reason !== 'already_verified'"
              type="button"
              class="pos-press flex h-56px items-center gap-2 rounded-14px bg-brand-600 px-6 text-18px font-700 text-white shadow-card hover:bg-brand-500"
              @click="toAgent"
            >
              <span class="i-ph-truck-fill" />转代客下单
            </button>
          </div>
        </div>

        <!-- 核销成功 -->
        <div v-else-if="done" class="flex flex-1 flex-col items-center justify-center gap-4 px-10">
          <div class="qs-flex-center h-84px w-84px rounded-24px bg-ok text-white shadow-card"><span class="i-ph-check-bold text-48px" /></div>
          <div class="text-28px font-700">核销成功</div>
          <div class="grid w-full max-w-640px grid-cols-2 gap-4 text-14px">
            <div class="rounded-14px bg-subtle px-4 py-3"><div class="text-12px text-t3">核销单号</div><BillNo :no="done.record.no" /></div>
            <div class="rounded-14px bg-subtle px-4 py-3"><div class="text-12px text-t3">中枢结果单号</div><BillNo :no="done.order.hubResultNo" /></div>
          </div>
          <div class="text-15px text-t2">{{ done.order.items.map((i) => `${i.name}×${i.qty}`).join('、') }}</div>
          <div class="max-w-640px text-center text-13px leading-21px text-t3">
            核销记录已回传，中枢扣减{{ store.warehouse.name }}并释放锁定。核销不再收钱，不计入门店成交额；是否另生零金额销售单 <PendingTag id="待确认-14" />
            <template v-if="store.mode === 'franchise'">。加盟店核销不进应缴营业款，履约佣金 <PendingTag id="待确认-20" /></template>
          </div>
          <button
            type="button"
            class="pos-press mt-2 flex h-60px w-260px items-center justify-center gap-2 rounded-14px bg-volt-400 text-20px font-700 text-ink-900 shadow-volt hover:bg-volt-500"
            @click="reset"
          >
            继续核销
          </button>
        </div>

        <!-- 空闲 -->
        <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
          <span class="i-ph-package-duotone text-80px text-brand-300" />
          <div class="text-20px font-700">小程序自提，到店核销</div>
          <div class="max-w-560px text-14px leading-22px text-t2">
            中枢核验门店、锁定、有效期和是否已核销。没有锁定成功的不核销出库；同一提货码再次扫描不会再次扣减。
          </div>
          <div class="flex items-center gap-1.5 text-13px text-t3">提货截止 <AssumptionTag k="pickupDeadline" /></div>
        </div>
      </div>

      <div class="qs-card shrink-0 px-5 py-3">
        <div class="mb-1.5 flex items-center justify-between text-14px">
          <span class="font-600">今日本店核销记录</span>
          <span class="text-12px text-t3">成功 {{ records?.filter((r) => r.result === 'success').length ?? 0 }} · 被拒 {{ records?.filter((r) => r.result === 'rejected').length ?? 0 }}</span>
        </div>
        <div class="flex gap-2 overflow-x-auto">
          <div v-for="r in (records ?? []).slice(0, 8)" :key="r.id" class="flex shrink-0 items-center gap-2 rounded-10px bg-subtle px-3 py-1.5 text-13px">
            <span :class="r.result === 'success' ? 'i-ph-check-circle-fill text-ok' : 'i-ph-x-circle-fill text-bad'" />
            <span class="qs-num font-600">{{ r.pickupCode }}</span>
            <span class="text-t3">{{ timeOf(r.at) }} {{ nameOf(r.operatorJobNo) }}</span>
            <span v-if="r.reason" class="text-bad">{{ VERIFY_REJECT[r.reason].label }}</span>
          </div>
          <div v-if="!records?.length" class="py-1 text-13px text-t3">今天还没有核销记录</div>
        </div>
      </div>
    </section>
  </div>
</template>
