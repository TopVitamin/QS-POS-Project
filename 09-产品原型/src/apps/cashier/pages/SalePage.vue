<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { errorInfo, useRequest } from '@/shared/composables/useRequest'
import { activePromotions, promoMatches } from '@/shared/domain/pricing'
import type { Shortage } from '@/shared/domain/rules'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import { useFeedback } from '@/shared/naive/feedback'
import type { Checkout, Member, PriceAdjustment, Product, Store } from '@/shared/types'
import { formatMoney, maskName, maskPhone } from '@/shared/utils/format'
import { nowText, timeOf } from '@/shared/utils/time'
import CartLineItem from '../components/CartLineItem.vue'
import LineEditModal from '../components/LineEditModal.vue'
import MemberModal from '../components/MemberModal.vue'
import ProductCard from '../components/ProductCard.vue'
import { useCart } from '../stores/cart'
import { useSession } from '../stores/session'

const props = defineProps<{ store: Store }>()
const session = useSession()
const cart = useCart()
const router = useRouter()
const fb = useFeedback()

cart.bindStore(props.store.id)

const { data: products } = useRequest(() => api.master.products(), { live: false })
const { data: categories } = useRequest(() => api.master.categories(), { live: false })
const { data: promotions } = useRequest(() => api.master.promotions(), { live: false })
const { data: templates } = useRequest(() => api.master.couponTemplates(), { live: false })
const { data: employees } = useRequest(() => api.master.employees(), { live: false })
const { data: stockRows } = useRequest(() => api.stock.list([props.store.id]))

const productMap = computed(() => new Map((products.value ?? []).map((p) => [p.sku, p])))
const availMap = computed(() => new Map((stockRows.value ?? []).map((r) => [r.sku, r.available])))
const guides = computed(() =>
  (employees.value ?? []).filter((e) => e.active && e.duties.includes('guide') && e.storeIds.includes(props.store.id)),
)
const guideName = (jobNo: string) => guides.value.find((g) => g.jobNo === jobNo)?.name ?? jobNo

watch(
  guides,
  (gs) => {
    if (!gs.length || gs.some((g) => g.jobNo === cart.s.guideJobNo)) return
    const me = gs.find((g) => g.jobNo === session.user?.jobNo)
    cart.setGuide((me ?? gs[0]).jobNo)
  },
  { immediate: true },
)

// ---------- 商品区 ----------
const firstLevel = computed(() => (categories.value ?? []).filter((c) => !c.parentCode))
const iconOf = (p: Product) => firstLevel.value.find((c) => p.categoryCode.startsWith(c.code))?.icon ?? 'i-ph-cube-fill'
const cat = ref('all')
const keyword = ref('')
const shown = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return (products.value ?? []).filter(
    (p) =>
      p.status === 'active' &&
      (cat.value === 'all' || p.categoryCode.startsWith(cat.value)) &&
      (!k || p.name.toLowerCase().includes(k) || p.spec.toLowerCase().includes(k) || p.sku.toLowerCase().includes(k) || p.barcodes.some((b) => b.includes(k))),
  )
})
const active = computed(() => activePromotions(promotions.value ?? [], props.store.id, nowText()))
function badgeOf(p: Product) {
  const hit = active.value.find((x) => x.type !== 'threshold_reduction' && promoMatches(x, p))
  if (!hit) return null
  return hit.type === 'special_price' ? `特价${(hit.specialPrice ?? 0) / 100}` : `第${hit.nth}件${(hit.nthRatePercent ?? 100) / 10}折`
}

const canOpen = computed(() => session.has('sale.open'))

function warnDropped(dropped: boolean) {
  if (dropped) fb.message.warning('购物车有变化，已授权的改价已清除，需要重新授权')
}

function add(p: Product) {
  if (!canOpen.value) return
  warnDropped(cart.add(p.sku, p.snRequired, cart.s.guideJobNo))
}

async function search() {
  const k = keyword.value.trim()
  if (!k) return
  const found = await api.master.findProducts(k)
  if (found.length === 1) {
    add(found[0])
    keyword.value = ''
  } else if (!found.length) {
    fb.message.warning('没有找到这个商品')
  }
}

// ---------- 购物车和试算 ----------
const draft = computed(() =>
  cart.toDraft({ storeId: props.store.id, registerNo: session.registerNo, shiftNo: session.shiftNo ?? '', cashierJobNo: session.user?.jobNo ?? '' }),
)
const pricing = computed(() => {
  if (!products.value || !promotions.value || !templates.value || !cart.lines.length) return null
  return api.sales.priceDraft(
    { products: products.value, promotions: promotions.value, members: cart.s.member ? [cart.s.member] : [], couponTemplates: templates.value },
    draft.value,
  )
})
const pricedOf = (lineNo: number) => pricing.value?.lines.find((l) => l.lineNo === lineNo)
const promoNamesOf = (lineNo: number) =>
  (pricing.value?.promotions ?? []).filter((p) => p.lineNos.includes(lineNo) && (p.type === 'special_price' || p.type === 'nth_discount')).map((p) => p.name)
const orderPromo = computed(() => pricing.value?.promotions.find((p) => p.type === 'threshold_reduction'))
const couponName = computed(() => {
  const c = cart.s.member?.coupons.find((x) => x.id === cart.s.couponId)
  return templates.value?.find((t) => t.id === c?.templateId)?.name
})
const totals = computed(() => pricing.value?.totals)
const adjustmentOf = (lineNo: number) => cart.s.adjustments.find((a) => a.lineNo === lineNo)

// ---------- 弹窗 ----------
const showMember = ref(false)
const showHeld = ref(false)
const editLineNo = ref<number | null>(null)
const editLine = computed(() => cart.lines.find((l) => l.lineNo === editLineNo.value) ?? null)
const showEdit = computed({ get: () => editLineNo.value !== null, set: (v) => !v && (editLineNo.value = null) })

function applyMember(m: Member | null, couponId: string | null) {
  const dropped = cart.setMember(m)
  if (couponId) cart.setCoupon(couponId)
  warnDropped(dropped)
}

function onAdjust(a: PriceAdjustment) {
  cart.setAdjustment(a)
  fb.message.success('改价已授权')
}

function holdOrder() {
  if (cart.isEmpty || !session.user) return
  cart.hold(session.registerNo, session.user)
  fb.ok(session.isCashier ? '已挂单' : '已挂单给收银', session.isCashier ? undefined : '收银员在这台收银机上点「取单」继续收款')
}

function resume(id: string) {
  if (!session.user) return
  cart.resume(id, session.registerNo, session.user)
  showHeld.value = false
}

function heldAmount(lines: { sku: string; qty: number }[]) {
  return lines.reduce((s, l) => s + (productMap.value.get(l.sku)?.price ?? 0) * l.qty, 0)
}

// ---------- 结算 ----------
/** 收了一部分款、或有结果不明的结算，切到别的页面再回来也要能接着收 */
const { data: openCos } = useRequest(() => api.sales.openCheckouts(props.store.id, session.registerNo))
const paidOf = (c: Checkout) => c.payments.filter((p) => p.status === 'success').reduce((s, p) => s + p.amount, 0)
const unfinished = computed(() => (session.isCashier ? (openCos.value ?? []).find((c) => c.payments.some((p) => p.status !== 'failed')) : undefined))
function resumeCheckout() {
  if (!unfinished.value) return
  cart.setCheckout(unfinished.value.id)
  router.push({ name: 'pay' })
}

const busy = ref(false)
const rejected = ref<{ message: string; basis?: string; shortages: Shortage[] } | null>(null)

const snMissing = computed(() => cart.lines.filter((l) => l.sns.length && l.sns.filter(Boolean).length !== l.qty))

async function checkout() {
  if (!session.isCashier) return holdOrder()
  if (snMissing.value.length) {
    editLineNo.value = snMissing.value[0].lineNo
    fb.message.warning('这件商品需要逐件采集序列号')
    return
  }
  busy.value = true
  try {
    const { checkout: co } = await api.sales.startCheckout(draft.value)
    cart.setCheckout(co.id)
    router.push({ name: 'pay' })
  } catch (e) {
    const info = errorInfo(e)
    if (Array.isArray(info.detail) && info.detail.length) {
      rejected.value = { message: info.message, basis: info.basis, shortages: info.detail as Shortage[] }
    } else fb.fail(e)
  } finally {
    busy.value = false
  }
}

function toAgent() {
  if (!rejected.value) return
  const items = rejected.value.shortages.map((s) => ({ sku: s.sku, qty: s.qty }))
  cart.setAgentPrefill({ items, source: 'cashier', reason: '收银开单时本店可用不足' })
  cart.lines.filter((l) => items.some((i) => i.sku === l.sku)).forEach((l) => cart.remove(l.lineNo))
  rejected.value = null
  router.push({ name: 'agent' })
}
</script>

<template>
  <div class="flex h-full">
    <section class="flex min-w-0 flex-1 flex-col gap-3 p-4">
      <div v-if="unfinished" class="flex items-center gap-3 rounded-14px border border-warn/30 bg-[#FDF3E3] px-4 py-2.5">
        <span class="i-ph-hourglass-medium-fill text-24px text-warn" />
        <div class="flex-1 text-14px text-[#92400E]">
          <span class="font-700">这台收银机有一笔没收完的结算</span>：应收 {{ formatMoney(unfinished.payable) }}，已收 {{ formatMoney(paidOf(unfinished)) }}<template
            v-if="unfinished.payments.some((p) => p.status === 'pending')"
          >，有一笔支付结果不明</template>
        </div>
        <n-button type="warning" size="large" @click="resumeCheckout">继续收款</n-button>
      </div>
      <div class="flex items-center gap-3">
        <n-input
          v-model:value="keyword"
          size="large"
          clearable
          placeholder="输入条码、SKU或名称后回车（不接扫码枪）"
          class="!rounded-14px"
          :input-props="{ autofocus: true }"
          @keyup.enter="search"
        >
          <template #prefix><span class="i-ph-barcode-bold mr-1 text-22px text-t3" /></template>
        </n-input>
      </div>
      <div class="flex gap-2 overflow-x-auto">
        <button
          type="button"
          class="pos-press flex h-44px shrink-0 items-center gap-1.5 rounded-12px px-4 text-15px"
          :class="cat === 'all' ? 'bg-ink-900 font-600 text-white' : 'bg-white text-t2 hover:text-t1'"
          @click="cat = 'all'"
        >
          <span class="i-ph-squares-four-fill" />全部
        </button>
        <button
          v-for="c in firstLevel"
          :key="c.code"
          type="button"
          class="pos-press flex h-44px shrink-0 items-center gap-1.5 rounded-12px px-4 text-15px"
          :class="cat === c.code ? 'bg-ink-900 font-600 text-white' : 'bg-white text-t2 hover:text-t1'"
          @click="cat = c.code"
        >
          <span :class="c.icon" />{{ c.name }}
        </button>
      </div>
      <div v-if="!canOpen" class="rounded-12px bg-[#FDF3E3] px-4 py-2.5 text-14px text-[#92400E]">
        收银职责只收款，开单由导购完成。可以点右侧「取单」继续收款。
      </div>
      <div class="qs-scroll -mr-2 min-h-0 flex-1 overflow-y-auto pr-2 pt-1.5">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-3 pb-2">
          <ProductCard
            v-for="p in shown"
            :key="p.sku"
            :product="p"
            :icon="iconOf(p)"
            :available="availMap.get(p.sku)"
            :badge="badgeOf(p)"
            :in-cart="cart.lines.find((l) => l.sku === p.sku)?.qty"
            :disabled="!canOpen"
            @add="add(p)"
          />
        </div>
        <div v-if="products && !shown.length" class="py-16 text-center text-t3">没有匹配的商品</div>
      </div>
    </section>

    <aside class="flex w-440px shrink-0 flex-col border-l border-line bg-white">
      <div class="flex h-56px shrink-0 items-center gap-2 border-b border-line px-4">
        <div class="text-18px font-700">购物车</div>
        <span class="qs-num rounded-full bg-subtle px-2 text-13px font-600 text-t2">{{ cart.count }}件</span>
        <div class="flex-1" />
        <n-button quaternary size="medium" :disabled="cart.isEmpty" @click="holdOrder">
          <template #icon><span class="i-ph-pause-circle-bold" /></template>挂单
        </n-button>
        <n-badge :value="cart.heldHere.length" :show="cart.heldHere.length > 0" :offset="[-6, 6]">
          <n-button quaternary size="medium" :disabled="!cart.heldHere.length" @click="showHeld = true">
            <template #icon><span class="i-ph-tray-arrow-up-bold" /></template>取单
          </n-button>
        </n-badge>
        <n-button quaternary size="medium" :disabled="cart.isEmpty" @click="cart.clear()">
          <template #icon><span class="i-ph-x-circle-bold" /></template>清空
        </n-button>
      </div>

      <div class="grid shrink-0 grid-cols-2 gap-2 border-b border-line px-4 py-2.5">
        <button type="button" class="pos-press flex h-48px items-center gap-2 rounded-12px bg-subtle px-3 text-left hover:bg-brand-50" @click="showMember = true">
          <span class="i-ph-identification-card-fill text-22px" :class="cart.s.member ? 'text-brand-600' : 'text-t3'" />
          <span v-if="cart.s.member" class="min-w-0 leading-tight">
            <span class="block truncate text-14px font-600">{{ maskName(cart.s.member.name) }} {{ maskPhone(cart.s.member.phone) }}</span>
            <span class="block truncate text-12px text-promo-600">{{ couponName ?? '未用券' }}</span>
          </span>
          <span v-else class="text-15px text-t2">识别会员</span>
        </button>
        <n-popselect
          :value="cart.s.guideJobNo"
          :options="guides.map((g) => ({ label: `${g.jobNo} ${g.name}`, value: g.jobNo }))"
          size="large"
          trigger="click"
          @update:value="(v: string) => cart.setGuide(v)"
        >
          <button type="button" class="pos-press flex h-48px items-center gap-2 rounded-12px bg-subtle px-3 text-left hover:bg-brand-50">
            <span class="i-ph-user-circle-fill text-22px text-brand-600" />
            <span class="min-w-0 leading-tight">
              <span class="block text-12px text-t3">导购（业绩归属）</span>
              <span class="block truncate text-14px font-600">{{ cart.s.guideJobNo }} {{ guideName(cart.s.guideJobNo) }}</span>
            </span>
          </button>
        </n-popselect>
      </div>

      <div class="qs-scroll min-h-0 flex-1 overflow-y-auto">
        <div v-if="cart.isEmpty" class="flex h-full flex-col items-center justify-center gap-3 text-t3">
          <span class="i-ph-shopping-cart-simple-duotone text-64px text-line-strong" />
          <div class="text-15px">点左侧商品或输入条码加购</div>
        </div>
        <template v-else-if="products">
          <CartLineItem
            v-for="l in cart.lines"
            :key="l.lineNo"
            :line="l"
            :product="productMap.get(l.sku)!"
            :priced="pricedOf(l.lineNo)"
            :promo-names="promoNamesOf(l.lineNo)"
            :adjustment="adjustmentOf(l.lineNo)"
            :available="availMap.get(l.sku)"
            :guide-name="guideName(l.guideJobNo)"
            @inc="warnDropped(cart.setQty(l.lineNo, l.qty + 1))"
            @dec="warnDropped(cart.setQty(l.lineNo, l.qty - 1))"
            @remove="warnDropped(cart.remove(l.lineNo))"
            @edit="editLineNo = l.lineNo"
          />
        </template>
      </div>

      <div class="shrink-0 border-t border-line bg-subtle px-4 pb-4 pt-3">
        <div class="flex flex-col gap-1 text-14px text-t2">
          <div class="flex justify-between"><span>原价合计</span><MoneyText :value="totals?.list ?? 0" /></div>
          <div v-if="totals?.promo" class="flex justify-between"><span>单品促销</span><MoneyText :value="totals.promo" discount /></div>
          <div v-if="totals?.order" class="flex justify-between">
            <span class="truncate">{{ orderPromo?.name }}</span><MoneyText :value="totals.order" discount />
          </div>
          <div v-if="cart.s.couponId" class="flex justify-between">
            <span>{{ couponName }}</span>
            <MoneyText v-if="pricing?.coupon?.applied" :value="totals?.coupon ?? 0" discount />
            <span v-else class="text-13px text-warn">{{ pricing?.coupon?.reason ?? '不可用' }}</span>
          </div>
          <div v-if="totals?.manual" class="flex justify-between"><span>改价（已授权）</span><MoneyText :value="totals.manual" discount /></div>
          <div v-for="h in (pricing?.hints ?? []).slice(0, 1)" :key="h.promotionId" class="flex items-center gap-1.5 text-13px text-promo-600">
            <span class="i-ph-tag-fill" />再买{{ formatMoney(h.shortBy) }}可享「{{ h.name }}」
          </div>
          <div class="flex items-center gap-1 text-12px text-t3">促销自动计算 <AssumptionTag k="promoStacking" /></div>
        </div>
        <div class="mt-2 flex items-end justify-between">
          <span class="pb-1.5 text-15px font-600 text-t1">应收</span>
          <span class="qs-num text-44px font-700 leading-none text-t1">
            <span class="mr-0.5 text-24px">¥</span>{{ formatMoney(totals?.payable ?? 0, { symbol: false }) }}
          </span>
        </div>
        <button
          type="button"
          class="pos-press mt-3 flex h-72px w-full items-center justify-center gap-3 rounded-16px text-24px font-700 disabled:cursor-not-allowed disabled:bg-[#E2E8E6] disabled:text-t3 disabled:shadow-none"
          :class="session.isCashier ? 'bg-volt-400 text-ink-900 shadow-volt hover:bg-volt-500' : 'bg-brand-600 text-white shadow-card hover:bg-brand-500'"
          :disabled="cart.isEmpty || busy"
          @click="checkout"
        >
          <n-spin v-if="busy" :size="22" />
          <template v-else>
            <span :class="session.isCashier ? 'i-ph-lightning-fill' : 'i-ph-pause-circle-fill'" />
            {{ session.isCashier ? '结算' : '挂单给收银' }}
          </template>
        </button>
        <div v-if="session.isCashier" class="mt-1.5 text-center text-12px text-t3">点结算时先向中枢确认本店可用量</div>
      </div>
    </aside>

    <MemberModal
      v-model:show="showMember"
      :store-id="store.id"
      :current="cart.s.member"
      :coupon-id="cart.s.couponId"
      :templates="templates ?? []"
      @apply="applyMember"
    />

    <LineEditModal
      v-if="session.user"
      v-model:show="showEdit"
      :line="editLine"
      :product="editLine ? productMap.get(editLine.sku) ?? null : null"
      :priced="editLine ? pricedOf(editLine.lineNo) : undefined"
      :adjustment="editLine ? adjustmentOf(editLine.lineNo) : undefined"
      :store="store"
      :user="session.user"
      :guides="guides"
      @guide="(j) => editLine && cart.setLineGuide(editLine.lineNo, j)"
      @sns="(s) => editLine && cart.setSns(editLine.lineNo, s)"
      @adjust="onAdjust"
      @unadjust="editLine && cart.removeAdjustment(editLine.lineNo)"
    />

    <n-drawer v-model:show="showHeld" :width="480" placement="right">
      <n-drawer-content title="挂单" closable>
        <div class="flex flex-col gap-3">
          <div v-for="h in cart.heldHere" :key="h.id" class="rounded-14px border border-line p-4">
            <div class="flex items-center justify-between">
              <div class="text-15px font-600">{{ timeOf(h.heldAt) }} 挂单 · {{ h.heldByName }}</div>
              <MoneyText :value="heldAmount(h.lines)" class="text-17px font-700" />
            </div>
            <div class="mt-1 text-13px text-t2">
              {{ h.lines.map((l) => `${productMap.get(l.sku)?.name ?? l.sku}×${l.qty}`).join('、') }}
            </div>
            <div class="mt-1 text-12px text-t3">{{ h.registerNo }}号收银台 · 原价合计，取单后重新计算促销</div>
            <div class="mt-3 flex gap-2">
              <n-button type="primary" size="large" class="flex-1" @click="resume(h.id)">取单</n-button>
              <n-button size="large" @click="cart.dropHeld(h.id)">删除</n-button>
            </div>
          </div>
          <div v-if="!cart.heldHere.length" class="py-12 text-center text-t3">没有挂单</div>
        </div>
      </n-drawer-content>
    </n-drawer>

    <n-modal :show="!!rejected" preset="card" :closable="false" :style="{ width: '640px' }" @update:show="(v: boolean) => !v && (rejected = null)">
      <div v-if="rejected" class="flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <div class="qs-flex-center h-56px w-56px rounded-16px bg-[#FDECEC]"><span class="i-ph-prohibit-bold text-32px text-bad" /></div>
          <div>
            <div class="text-22px font-700 text-bad">中枢拒绝：本店可用不足</div>
            <div class="text-14px text-t2">中枢拒绝之后不能改成本地已售</div>
          </div>
        </div>
        <div class="overflow-hidden rounded-14px border border-line">
          <div class="grid grid-cols-[1fr_90px_90px] bg-subtle px-4 py-2 text-13px font-600 text-t2">
            <span>商品</span><span class="text-right">本次数量</span><span class="text-right">本店可用</span>
          </div>
          <div v-for="s in rejected.shortages" :key="s.sku" class="grid grid-cols-[1fr_90px_90px] border-t border-line px-4 py-3 text-16px">
            <span class="font-600">{{ s.name }}</span>
            <span class="qs-num text-right">{{ s.qty }}</span>
            <span class="qs-num text-right font-700 text-bad">{{ s.available }}</span>
          </div>
        </div>
        <div class="rounded-12px bg-subtle px-4 py-3 text-13px leading-21px text-t2">
          可用 = 账面 − 自提锁定，在途不算可用。已经锁给小程序自提订单的件数，进店销售卖不到。
          <div class="mt-1 text-t3">依据：{{ rejected.basis }}</div>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <n-button size="large" @click="rejected = null">返回修改</n-button>
          <n-button v-if="session.has('agent.create')" type="primary" size="large" @click="toAgent">
            <template #icon><span class="i-ph-truck-fill" /></template>转代客下单
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>
