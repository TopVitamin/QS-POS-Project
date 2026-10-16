<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { NTag, type DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { PROMO_TYPE } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import type { CouponTemplate, Promotion } from '@/shared/types'
import { formatMoney } from '@/shared/utils/format'
import { clickable, money, mono, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const { data: promotions, loading } = useRequest(() => api.master.promotions())
const { data: coupons } = useRequest(() => api.master.couponTemplates())
const { data: products } = useRequest(() => api.master.products(), { live: false })
const { data: categories } = useRequest(() => api.master.categories(), { live: false })

/** 只列授权门店参与的促销 */
const rows = computed(() => (promotions.value ?? []).filter((p) => p.storeIds === 'all' || p.storeIds.some((id) => admin.storeIds.includes(id))))

function ruleText(p: Promotion) {
  if (p.type === 'special_price') return `特价 ${formatMoney(p.specialPrice)}`
  if (p.type === 'nth_discount') return `每满${p.nth}件，第${p.nth}件按${p.nthRatePercent}%计价`
  return `参与商品满${formatMoney(p.threshold)}减${formatMoney(p.reduction)}`
}
function scopeText(p: Promotion) {
  if (p.skus?.length) return p.skus.map((s) => products.value?.find((x) => x.sku === s)?.name ?? s).join('、')
  if (p.categoryPrefixes?.length) return p.categoryPrefixes.map((c) => `${categories.value?.find((x) => x.code === c)?.name ?? c}全部`).join('、')
  return '全场商品'
}
const storesText = (p: Promotion) =>
  p.storeIds === 'all' ? '全部门店' : p.storeIds.filter((id) => admin.storeIds.includes(id)).map((id) => admin.storeById(id)?.name ?? id).join('、')

const TYPE_TONE: Record<Promotion['type'], 'warning' | 'info' | 'success'> = { special_price: 'warning', nth_discount: 'info', threshold_reduction: 'success' }

const columns: DataTableColumns<Promotion> = [
  { title: '促销', key: 'name', minWidth: 240, render: (p) => two(h('span', { class: 'font-600' }, p.name), h('span', { class: 'font-mono' }, p.code)) },
  { title: '类型', key: 'type', width: 110, render: (p) => h(NTag, { size: 'small', bordered: false, type: TYPE_TONE[p.type] }, () => PROMO_TYPE[p.type]) },
  { title: '规则', key: 'rule', width: 230, render: (p) => ruleText(p) },
  { title: '参与商品', key: 'scope', width: 200, ellipsis: { tooltip: true }, render: (p) => scopeText(p) },
  { title: '门店', key: 'storeIds', width: 150, ellipsis: { tooltip: true }, render: (p) => storesText(p) },
  { title: '有效期', key: 'period', width: 200, render: (p) => two(h('span', { class: 'qs-num' }, p.startAt.slice(0, 16)), h('span', { class: 'qs-num' }, `至 ${p.endAt.slice(0, 16)}`)) },
  { title: '状态', key: 'status', width: 80, fixed: 'right', render: (p) => h(NTag, { size: 'small', bordered: false, type: p.status === 'active' ? 'success' : 'default' }, () => (p.status === 'active' ? '进行中' : '已结束')) },
]

const couponColumns: DataTableColumns<CouponTemplate> = [
  { title: '券', key: 'name', minWidth: 200, render: (c) => two(h('span', { class: 'font-600' }, c.name), mono(c.id)) },
  { title: '门槛', key: 'threshold', width: 140, render: (c) => (c.threshold ? `满${formatMoney(c.threshold)}可用` : '无门槛') },
  { title: '面额', key: 'amount', width: 120, align: 'right', render: (c) => money(c.amount, { tone: 'promo', strong: true }) },
]

const openPromo = ref<Promotion | null>(null)
const openCoupon = ref<CouponTemplate | null>(null)
const showPromo = computed({
  get: () => !!openPromo.value,
  set: (v) => {
    if (!v) openPromo.value = null
  },
})
const showCoupon = computed({
  get: () => !!openCoupon.value,
  set: (v) => {
    if (!v) openCoupon.value = null
  },
})
</script>

<template>
  <div>
    <PageHead title="促销">
      <template #desc>下发到店的促销和会员券。成交时保存命中的促销快照，POS不维护第二套促销规则去覆盖中枢（《4.全局业务规则》§五）</template>
    </PageHead>

    <Hint class="mb-4" tone="warn">
      促销规则由哪个系统维护 <PendingTag id="待确认-46" />；促销类型、叠加互斥和分摊 <PendingTag id="待确认-53" />。原型只实现三种演示类型，叠加按 <AssumptionTag k="promoStacking" />；
      加盟店是否参加同样的促销、能否调价 <PendingTag id="待确认-34" />
    </Hint>

    <div class="qs-card mb-6 overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading && !promotions"
        :row-key="(p: Promotion) => p.id"
        :row-props="clickable((p: Promotion) => (openPromo = p))"
        :scroll-x="1240"
        :bordered="false"
      />
    </div>

    <div class="mb-3 flex items-center gap-2">
      <div class="text-16px font-700">会员券</div>
      <AssumptionTag k="couponPoints" />
      <PendingTag id="待确认-54" />
    </div>
    <div class="qs-card max-w-720px overflow-hidden">
      <n-data-table
        :columns="couponColumns"
        :data="coupons ?? []"
        :row-key="(c: CouponTemplate) => c.id"
        :row-props="clickable((c: CouponTemplate) => (openCoupon = c))"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="showPromo" :width="520">
      <n-drawer-content v-if="openPromo" closable :native-scrollbar="false">
        <template #header>{{ openPromo.name }}</template>
        <n-descriptions :column="1" label-placement="left" size="small" bordered>
          <n-descriptions-item label="编码"><span class="font-mono">{{ openPromo.code }}</span></n-descriptions-item>
          <n-descriptions-item label="类型">{{ PROMO_TYPE[openPromo.type] }}</n-descriptions-item>
          <n-descriptions-item label="规则">{{ ruleText(openPromo) }}</n-descriptions-item>
          <n-descriptions-item label="参与商品">{{ scopeText(openPromo) }}</n-descriptions-item>
          <n-descriptions-item label="门店">{{ storesText(openPromo) }}</n-descriptions-item>
          <n-descriptions-item label="有效期"><span class="qs-num">{{ openPromo.startAt }} 至 {{ openPromo.endAt }}</span></n-descriptions-item>
          <n-descriptions-item label="状态">{{ openPromo.status === 'active' ? '进行中' : '已结束' }}</n-descriptions-item>
        </n-descriptions>
        <Hint class="mt-4">成交时保存命中的促销快照，POS不维护第二套规则。类型和叠加 <PendingTag id="待确认-53" /></Hint>
      </n-drawer-content>
    </n-drawer>

    <n-drawer v-model:show="showCoupon" :width="420">
      <n-drawer-content v-if="openCoupon" closable :native-scrollbar="false">
        <template #header>{{ openCoupon.name }}</template>
        <n-descriptions :column="1" label-placement="left" size="small" bordered>
          <n-descriptions-item label="券ID"><span class="font-mono">{{ openCoupon.id }}</span></n-descriptions-item>
          <n-descriptions-item label="门槛">{{ openCoupon.threshold ? `满${formatMoney(openCoupon.threshold)}可用` : '无门槛' }}</n-descriptions-item>
          <n-descriptions-item label="面额"><span class="text-promo-600 font-700">{{ formatMoney(openCoupon.amount) }}</span></n-descriptions-item>
        </n-descriptions>
        <Hint class="mt-4">会员券下发到店。积分规则 <PendingTag id="待确认-54" /></Hint>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
