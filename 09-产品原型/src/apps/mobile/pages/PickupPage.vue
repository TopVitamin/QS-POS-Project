<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type JudgeResult } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import { PICKUP_STATUS, VERIFY_REJECT } from '@/shared/config/labels'
import { judgePickup } from '@/shared/domain/rules'
import type { PickupOrder, VerificationRecord } from '@/shared/types'
import { maskCode, maskName, maskPhone } from '@/shared/utils/format'
import { timeOf, todayBizDate } from '@/shared/utils/time'
import MAssumptionTag from '../components/MAssumptionTag.vue'
import MBillNo from '../components/MBillNo.vue'
import MPendingTag from '../components/MPendingTag.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import Section from '../components/Section.vue'
import { alertFail } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const router = useRouter()
const store = computed(() => mobile.store!)

const { data: pickups } = useRequest(() => api.fulfil.pickups())
const { data: records } = useRequest(() => api.fulfil.verifications({ storeIds: [mobile.storeId], bizDate: todayBizDate() }))

/** 演示捷径：本店待核销的码，加上已核销、过期、别家店和不存在的码各一个。正式系统里码只在顾客手机上 */
const demoCodes = computed(() => {
  const all = pickups.value ?? []
  const mine = all.filter((p) => p.storeId === mobile.storeId)
  const list: PickupOrder[] = mine.filter((p) => p.status === 'pending').slice(0, 4)
  for (const p of [mine.find((x) => x.status === 'verified'), mine.find((x) => x.status === 'expired'), all.find((x) => x.storeId !== mobile.storeId && x.status === 'pending')]) {
    if (p) list.push(p)
  }
  return [...list.map((p) => ({ code: p.pickupCode, verdict: judgePickup(p, mobile.storeId) })), { code: '000000', verdict: judgePickup(undefined, mobile.storeId) }]
})

const code = ref('')
const busy = ref(false)
const result = ref<JudgeResult | null>(null)
const checked = ref(false)
const done = ref<{ record: VerificationRecord; order: PickupOrder } | null>(null)

const passed = computed(() => (result.value?.ok ? result.value.order : null))
const rejected = computed(() => (result.value && !result.value.ok ? result.value : null))

function reset() {
  result.value = null
  done.value = null
  checked.value = false
}

async function judge(c = code.value) {
  if (!c.trim()) return
  code.value = c.trim()
  reset()
  busy.value = true
  try {
    result.value = await api.fulfil.judge({ storeId: mobile.storeId, code: code.value, operatorJobNo: mobile.user!.jobNo })
  } catch (e) {
    alertFail(e)
  } finally {
    busy.value = false
  }
}

async function confirm() {
  if (!passed.value || !checked.value) return
  busy.value = true
  try {
    done.value = await api.fulfil.confirm({ storeId: mobile.storeId, code: code.value, operatorJobNo: mobile.user!.jobNo })
    result.value = null
    code.value = ''
  } catch (e) {
    alertFail(e, '核销没有成功')
    result.value = null
  } finally {
    busy.value = false
  }
}

function toAgent() {
  const r = rejected.value
  if (!r) return
  router.push({
    name: 'agent-new',
    query: {
      source: 'pickup_rejected',
      ref: code.value,
      reason: `提货码核销被拒：${r.label}`,
      items: (r.order?.items ?? []).map((i) => `${i.sku}*${i.qty}`).join(','),
    },
  })
}
</script>

<template>
  <div class="pb-6">
    <Section>
      <div class="px-4 pb-4 pt-4">
        <div class="mb-2 flex items-center justify-between text-13px">
          <span class="font-600">输入提货码</span>
          <span class="text-t3">顾客出示小程序里的码</span>
        </div>
        <div class="flex items-center gap-2 rounded-14px border-2 bg-subtle px-3" :class="code ? 'border-brand-400' : 'border-line'">
          <span class="i-ph-barcode text-22px text-t3" />
          <input
            v-model="code"
            inputmode="numeric"
            maxlength="8"
            placeholder="由中枢核验，POS不生成提货码"
            class="qs-num h-56px min-w-0 flex-1 bg-transparent text-26px font-700 tracking-[0.2em] outline-none placeholder:text-14px placeholder:font-400 placeholder:tracking-normal placeholder:text-t3"
            @keyup.enter="judge()"
          />
          <span v-if="code" role="button" class="i-ph-x-circle-fill text-20px text-t3" @click="code = ''; reset()" />
        </div>
        <van-button block type="primary" size="large" class="!mt-3" :loading="busy && !passed" :disabled="!code" @click="judge()">核验</van-button>
      </div>
    </Section>

    <Section v-if="passed">
      <div class="flex items-center gap-3 bg-[#E8F7EE] px-4 py-3">
        <span class="i-ph-seal-check-fill text-30px text-ok" />
        <div class="min-w-0 flex-1">
          <div class="text-16px font-700 text-[#166534]">中枢核验通过</div>
          <div class="text-12px text-t2">门店一致、锁定有效、未过期、未核销</div>
        </div>
        <MStatusTag :def="PICKUP_STATUS[passed.status]" />
      </div>
      <van-cell-group :border="false">
        <van-cell title="OMS履约单" title-class="!flex-none w-88px"><template #value><MBillNo :no="passed.omsNo" /></template></van-cell>
        <van-cell title="顾客" title-class="!flex-none w-88px">
          <template #value>{{ maskName(passed.customer.name) }} {{ maskPhone(passed.customer.phone) }} <MPendingTag id="待确认-52" /></template>
        </van-cell>
        <van-cell title="线上已付" title-class="!flex-none w-88px"><template #value><MoneyText :value="passed.paidAmount" strong /> <span class="text-12px text-t3">门店不再收钱</span></template></van-cell>
      </van-cell-group>
      <div class="mx-4 mb-3 overflow-hidden rounded-12px border border-line">
        <div class="bg-subtle px-3 py-1.5 text-12px text-t2">商品以中枢下发为准，POS不改</div>
        <div v-for="i in passed.items" :key="i.sku" class="flex items-center gap-3 border-t border-line px-3 py-2.5">
          <div class="min-w-0 flex-1">
            <div class="truncate text-14px font-600">{{ i.name }}</div>
            <div class="truncate text-12px text-t3">{{ i.spec }}</div>
          </div>
          <span class="qs-num text-20px font-700">×{{ i.qty }}</span>
        </div>
      </div>
      <div class="flex items-center gap-3 border-t border-line px-4 py-3">
        <van-checkbox v-model="checked" shape="square">已当面核对商品和数量</van-checkbox>
        <div class="flex-1" />
        <van-button size="small" @click="reset">取消</van-button>
        <van-button size="small" type="primary" :disabled="!checked" :loading="busy" @click="confirm">确认核销</van-button>
      </div>
    </Section>

    <Section v-else-if="rejected">
      <div class="flex items-start gap-3 bg-[#FDECEC] px-4 py-4">
        <span class="qs-flex-center h-40px w-40px shrink-0 rounded-12px bg-bad text-white"><span class="i-ph-prohibit-bold text-24px" /></span>
        <div class="min-w-0 flex-1">
          <div class="text-17px font-700 text-bad">核销被拒：{{ rejected.label }}</div>
          <div class="mt-0.5 text-13px leading-20px text-t1">{{ rejected.detail }}</div>
          <div v-if="rejected.basis" class="mt-1 text-12px leading-18px text-t2">依据：{{ rejected.basis }}</div>
        </div>
      </div>
      <div class="px-4 py-3 text-13px">
        <template v-if="rejected.order">
          <div class="flex flex-wrap items-center gap-1.5 text-t2">
            中枢履约单 <MBillNo :no="rejected.order.omsNo" plain /> <MStatusTag :def="PICKUP_STATUS[rejected.order.status]" />
            <span v-if="rejected.order.storeId !== mobile.storeId" class="text-warn">自提门店不是本店</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span v-for="i in rejected.order.items" :key="i.sku" class="rounded-8px bg-subtle px-2 py-1 text-13px">{{ i.name }} × {{ i.qty }}</span>
          </div>
        </template>
        <div v-else class="text-t3">中枢没有这张提货码对应的履约单</div>
        <div class="mt-3 text-12px leading-19px text-t3">
          被拒也留了核销记录和操作日志，不出库。顾客还要这件商品时可以转代客下单，由中央OMS路由发货。无码核销不开放 <MPendingTag id="待确认-05" />
        </div>
      </div>
      <div class="flex gap-2 border-t border-line px-4 py-3">
        <van-button class="flex-1" @click="reset(); code = ''">重新输入</van-button>
        <van-button v-if="mobile.has('agent.create') && rejected.reason !== 'already_verified'" class="flex-1" type="primary" icon="logistics" @click="toAgent">转代客下单</van-button>
      </div>
    </Section>

    <Section v-else-if="done">
      <div class="flex flex-col items-center px-4 pb-4 pt-6 text-center">
        <span class="qs-flex-center h-60px w-60px rounded-18px bg-ok text-white"><span class="i-ph-check-bold text-34px" /></span>
        <div class="mt-3 text-20px font-700">核销成功</div>
        <div class="mt-1 text-13px text-t2">{{ done.order.items.map((i) => `${i.name}×${i.qty}`).join('、') }}</div>
      </div>
      <van-cell-group :border="false">
        <van-cell title="核销单号" title-class="!flex-none w-96px"><template #value><MBillNo :no="done.record.no" /></template></van-cell>
        <van-cell title="中枢结果单号" title-class="!flex-none w-96px"><template #value><MBillNo :no="done.order.hubResultNo" /></template></van-cell>
      </van-cell-group>
      <div class="px-4 pb-2 text-12px leading-19px text-t3">
        核销记录已回传，中枢扣减{{ store.warehouse.name }}并释放锁定。核销不收钱，不计入成交净额；是否另生零金额销售单 <MPendingTag id="待确认-14" />
        <template v-if="store.mode === 'franchise'">。加盟店核销不进应缴营业款，履约佣金 <MPendingTag id="待确认-20" /></template>
      </div>
      <div class="px-4 pb-4"><van-button block round type="primary" @click="reset">继续核销</van-button></div>
    </Section>

    <Section title="演示用提货码" desc="演示捷径，点一下直接核验。正式系统里提货码只在顾客手机上">
      <div class="grid grid-cols-3 gap-2 px-4 pb-4 pt-2">
        <button
          v-for="d in demoCodes"
          :key="d.code"
          type="button"
          class="rounded-10px border px-2 py-1.5 text-left leading-tight"
          :class="d.verdict.ok ? 'border-ok/40 bg-[#E8F7EE] text-[#166534]' : 'border-line bg-white text-t2'"
          @click="judge(d.code)"
        >
          <span class="qs-num block text-15px font-700 text-t1">{{ d.code }}</span>
          <span class="block truncate text-11px">{{ d.verdict.ok ? '可核销' : VERIFY_REJECT[d.verdict.reason].label }}</span>
        </button>
      </div>
    </Section>

    <Section title="今日本店核销记录">
      <template #extra>
        <span class="text-12px text-t3">成功 {{ records?.filter((r) => r.result === 'success').length ?? 0 }} · 被拒 {{ records?.filter((r) => r.result === 'rejected').length ?? 0 }}</span>
      </template>
      <div v-for="r in (records ?? []).slice(0, 10)" :key="r.id" class="flex items-center gap-2 border-t border-line px-4 py-2.5 text-13px first:border-0">
        <span :class="r.result === 'success' ? 'i-ph-check-circle-fill text-ok' : 'i-ph-x-circle-fill text-bad'" class="text-16px" />
        <span class="qs-num w-64px font-600">{{ r.result === 'success' ? r.pickupCode : maskCode(r.pickupCode) }}</span>
        <span class="flex-1 truncate text-t3">{{ timeOf(r.at) }} {{ mobile.nameOf(r.operatorJobNo) }}</span>
        <span v-if="r.reason" class="text-12px text-bad">{{ VERIFY_REJECT[r.reason].label }}</span>
      </div>
      <van-empty v-if="!records?.length" image-size="64" description="今天还没有核销记录" />
    </Section>

    <Note>中枢核验门店、锁定、有效期和是否已核销；同一提货码再次扫描不会再次扣减。提货截止 <MAssumptionTag k="pickupDeadline" /></Note>
  </div>
</template>
