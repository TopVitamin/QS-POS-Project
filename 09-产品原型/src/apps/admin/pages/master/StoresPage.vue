<script setup lang="ts">
import { computed } from 'vue'
import { STORE_MODE } from '@/shared/config/labels'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import type { PendingId } from '@/shared/types'
import { codeName } from '@/shared/utils/format'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const stores = computed(() => admin.scopedStores)

/** 《7.模式说明》§二：2026-10-15确认，不能做成可选开关 */
const CONFIRMED = [
  { icon: 'i-ph-package-fill', text: '货权在强盛，代销仓记在强盛账上' },
  { icon: 'i-ph-hand-coins-fill', text: '营业款由门店收取，再结算归集' },
  { icon: 'i-ph-path-bold', text: '参与中央OMS的自提和代发路由' },
]

/** 合同配置：背景没有给值，原型留空 */
const CONTRACT: { label: string; pending: PendingId[] }[] = [
  { label: '收款商户号', pending: ['待确认-16'] },
  { label: '上缴方式和时限', pending: ['待确认-17'] },
  { label: '分成口径和比例', pending: ['待确认-18'] },
  { label: '结算周期', pending: ['待确认-19'] },
  { label: '履约佣金', pending: ['待确认-20'] },
  { label: '铺货额度', pending: ['待确认-24'] },
  { label: '保证金', pending: ['待确认-33'] },
  { label: '价格带', pending: ['待确认-34'] },
  { label: '经营权', pending: ['待确认-35'] },
]
</script>

<template>
  <div>
    <PageHead title="门店">
      <template #desc>门店档案由上游主数据单向下发，POS不回写（《3.上下游链路》§3.7）。门店只有直营和加盟两种，加盟是代销</template>
      <template #tags><AssumptionTag k="storeRoster" /></template>
    </PageHead>

    <Hint v-if="admin.isSysAdmin" class="mb-4" tone="info">系统管理也按授权到店查看，不到「全部未来新店」（《8.角色权限原则》§二）；只读，不能改数据（§五）</Hint>

    <div class="grid grid-cols-2 gap-4">
      <div v-for="s in stores" :key="s.id" class="qs-card overflow-hidden">
        <div class="flex items-center gap-3 border-b border-line px-5 py-4">
          <span
            class="qs-flex-center h-42px w-42px shrink-0 rounded-12px text-22px"
            :class="s.mode === 'direct' ? 'bg-brand-50 text-brand-600' : 'bg-[#FDF3E3] text-warn'"
          >
            <span class="i-ph-storefront-fill" />
          </span>
          <div class="min-w-0 flex-1 leading-tight">
            <div class="flex items-center gap-2">
              <span class="text-16px font-700">{{ codeName(s.code, s.name) }}</span>
              <n-tag size="small" :bordered="false" :type="STORE_MODE[s.mode].tone">{{ STORE_MODE[s.mode].label }}{{ s.mode === 'franchise' ? '（代销）' : '' }}</n-tag>
              <n-tag v-if="s.pausedForRouting" size="small" :bordered="false" type="error">临时停接</n-tag>
            </div>
            <div class="mt-1 text-12px text-t3">{{ s.city }} · {{ s.district }} · 营业时间 {{ s.openHours }}（演示）</div>
          </div>
        </div>

        <div class="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 px-5 py-4 text-13px">
          <span class="text-t3">地址</span>
          <span>{{ s.address || '-' }} <span class="text-12px text-t3">由主数据下发，原型不编</span></span>
          <span class="text-t3">库存位置</span>
          <span>{{ codeName(s.warehouse.code, s.warehouse.name) }} <span class="text-12px text-t3">· {{ s.warehouse.kind === 'micro' ? '门店微仓' : '代销仓' }}，编码是占位码</span></span>
          <span class="text-t3">收银台</span>
          <span class="flex flex-wrap items-center gap-1.5">
            <n-tag v-for="r in s.registers" :key="r.no" size="small" :bordered="false">{{ r.no }} {{ r.name }}</n-tag>
            <PendingTag id="待确认-01" />
          </span>
          <template v-if="s.franchiseeId">
            <span class="text-t3">加盟商</span>
            <span>{{ admin.franchiseeText(s.franchiseeId) }}</span>
          </template>
          <span class="text-t3">自提和代发</span>
          <span>{{ s.pausedForRouting ? '临时停接（盘点或停业），不改合同上的「参与路由」' : '正常接单' }}</span>
        </div>

        <template v-if="s.mode === 'franchise'">
          <div class="mx-5 mb-3 rounded-12px bg-[#F1FAF4] px-4 py-3">
            <div class="mb-1.5 text-12px font-600 text-ok">已确认口径（2026-10-15）</div>
            <div v-for="c in CONFIRMED" :key="c.text" class="flex items-center gap-2 py-0.5 text-13px">
              <span :class="c.icon" class="text-ok" />{{ c.text }}
            </div>
          </div>
          <div class="mx-5 mb-5 rounded-12px border border-dashed border-line-strong px-4 py-3">
            <div class="mb-2 text-12px font-600 text-t2">合同配置：背景没有给值，原型留空</div>
            <div class="grid grid-cols-3 gap-x-4 gap-y-2 text-13px">
              <div v-for="c in CONTRACT" :key="c.label" class="flex flex-col gap-0.5">
                <span class="text-t3">{{ c.label }}</span>
                <span class="flex items-center gap-1"><span class="text-t3">-</span><PendingTag :id="c.pending" /></span>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="mx-5 mb-5 rounded-12px bg-subtle px-4 py-3 text-13px text-t2">直营：货权在强盛，顾客付款进强盛收款主体；日结之后收银对账，没有加盟结算单（《7.模式说明》§三）</div>
      </div>
    </div>
    <div v-if="!stores.length" class="qs-card py-16 text-center text-t3">当前身份没有授权到店</div>
  </div>
</template>
