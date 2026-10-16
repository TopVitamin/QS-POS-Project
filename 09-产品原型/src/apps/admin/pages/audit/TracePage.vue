<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { api, type TraceResult } from '@/shared/api'
import { errorInfo, useRequest } from '@/shared/composables/useRequest'
import { AUDIT_ACTION } from '@/shared/config/labels'
import BillNo from '@/shared/naive/BillNo.vue'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import TraceChain from '../../components/TraceChain.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const route = useRoute()
const router = useRouter()

const q = computed(() => String(route.query.q ?? '').trim())
const input = ref(q.value)
watch(q, (v) => (input.value = v))

const { data, error, loading } = useRequest(() => (q.value ? api.audit.trace({ q: q.value, storeIds: admin.storeIds }) : Promise.resolve(null)), {
  watch: [q],
})
const { data: samples } = useRequest(() => api.audit.traceSamples(admin.storeIds))
const err = computed(() => (error.value ? errorInfo(error.value) : null))

function search(text = input.value) {
  const v = text.trim()
  input.value = v
  router.replace({ query: v ? { q: v } : {} })
}

const KIND: Record<TraceResult['kind'], { label: string; icon: string }> = {
  sale: { label: '店内销售', icon: 'i-ph-receipt-fill' },
  return: { label: '销售退货', icon: 'i-ph-arrow-u-up-left-bold' },
  pickup: { label: '自提核销', icon: 'i-ph-package-fill' },
  agent: { label: '代客下单', icon: 'i-ph-truck-fill' },
}

/** 回到业务页面看原单 */
const source = computed<{ text: string; to: RouteLocationRaw } | null>(() => {
  const r = data.value
  if (!r) return null
  if (r.kind === 'sale' && admin.has('trade.view')) return { text: '打开销售单详情', to: { name: 'sale-detail', params: { no: r.keyNo } } }
  if (r.kind === 'return' && admin.has('trade.view')) return { text: '到退货单列表', to: { name: 'returns' } }
  if (r.kind === 'pickup' && admin.has('fulfil.view')) return { text: '到自提履约单', to: { name: 'pickups' } }
  if (r.kind === 'agent' && admin.has('fulfil.view')) return { text: '到代客单', to: { name: 'agent-orders' } }
  return null
})

/** 《5.单据目录与分层》§四的目标链条，从凭证往下 */
const CHAIN = [
  { text: '金蝶凭证', note: '不在POS生成', external: true },
  { text: '中枢已审核结果', note: '结果单号' },
  { text: 'POS销售单、核销记录或盘点单', note: '原单' },
  { text: '支付流水、提货码、收货来源单', note: '通道流水号原样保存' },
  { text: '班次和日结', note: '加盟再接应缴和缴款' },
]
</script>

<template>
  <div>
    <PageHead title="交易追溯">
      <template #desc>抽一笔店内交易，往下看到支付流水或提货码、中枢结果单号、班次和日结；凭证和银行流水在金蝶，POS不做假凭证（《10.阶段规划与一期交付标准》§3.3、《5.单据目录与分层》§四）</template>
    </PageHead>

    <div class="qs-card mb-4 px-5 py-4">
      <div class="flex items-center gap-3">
        <n-input v-model:value="input" size="large" clearable placeholder="销售单号、退货单号、提货码、OMS单号、小程序订单号、核销单号或代客单号" class="flex-1" @keyup.enter="search()">
          <template #prefix><span class="i-ph-magnifying-glass-bold text-18px text-t3" /></template>
        </n-input>
        <n-button type="primary" size="large" :loading="loading" class="!px-8" @click="search()">追溯</n-button>
      </div>
      <div v-if="samples?.length" class="mt-3 flex flex-wrap items-center gap-2 text-13px">
        <span class="text-t3">示例</span>
        <button
          v-for="s in samples"
          :key="s.q"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-8px border border-line px-2.5 py-1 hover:border-brand-300 hover:bg-brand-50"
          :class="q === s.q ? 'border-brand-600 bg-brand-50' : ''"
          @click="search(s.q)"
        >
          <span class="text-t2">{{ s.label }}</span>
          <span class="font-mono text-12px text-t1">{{ s.q }}</span>
        </button>
      </div>
    </div>

    <div v-if="!q" class="qs-card px-6 py-6">
      <div class="mb-4 text-15px font-600">追溯链从凭证往下，POS负责店里的那几环</div>
      <div class="flex items-stretch gap-2">
        <template v-for="(c, i) in CHAIN" :key="c.text">
          <div class="flex-1 rounded-12px border px-3 py-3" :class="c.external ? 'border-dashed border-line-strong bg-subtle' : 'border-line bg-white'">
            <div class="text-11px font-600 text-t3">第{{ i + 1 }}环</div>
            <div class="mt-1 text-14px font-600" :class="c.external ? 'text-t3' : 'text-t1'">{{ c.text }}</div>
            <div class="mt-0.5 text-12px text-t3">{{ c.note }}</div>
          </div>
          <span v-if="i < CHAIN.length - 1" class="i-ph-caret-right-bold self-center text-t3" />
        </template>
      </div>
      <Hint class="mt-4">
        这里能串的是销售、退货、自提核销和代客单；盘点单、收货单的中枢结果在「盘点单」「收货与差异」的详情里。
        结算单放在中枢还是金蝶没定，链条上不画结算节点假装已经付款（《5.单据目录与分层》§四）。没有商场报送，链条上也不出现报送节点
      </Hint>
    </div>

    <div v-else-if="err" class="qs-card flex flex-col items-center gap-2 py-14 text-center">
      <span class="i-ph-magnifying-glass-minus-bold text-40px text-t3" />
      <div class="text-16px font-600">{{ err.message }}</div>
      <div v-if="err.basis" class="text-13px text-t3">依据：{{ err.basis }}</div>
    </div>

    <template v-else-if="data">
      <div class="qs-card mb-4 flex items-center gap-4 px-5 py-4">
        <span class="qs-flex-center h-44px w-44px shrink-0 rounded-12px bg-brand-50 text-22px text-brand-600"><span :class="KIND[data.kind].icon" /></span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-16px font-700">{{ KIND[data.kind].label }}</span>
            <BillNo :no="data.keyNo" class="text-14px" />
          </div>
          <div class="qs-num mt-0.5 text-13px text-t2">{{ data.headline }}</div>
        </div>
        <n-button v-if="source" secondary @click="router.push(source.to)">
          <template #icon><span class="i-ph-arrow-square-out-bold" /></template>{{ source.text }}
        </n-button>
      </div>

      <div class="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-4">
        <div class="qs-card px-5 py-5">
          <TraceChain :nodes="data.nodes" />
        </div>
        <div class="flex flex-col gap-4">
          <n-card title="关联单据" size="small">
            <button
              v-for="r in data.related"
              :key="r.no"
              type="button"
              class="flex w-full items-center justify-between gap-2 border-b border-line py-2 text-left text-13px last:border-0 hover:text-brand-700"
              @click="search(r.no)"
            >
              <span class="text-t2">{{ r.label }}</span>
              <span class="flex items-center gap-1"><BillNo :no="r.no" plain /><span class="i-ph-flow-arrow-bold text-t3" /></span>
            </button>
            <div v-if="!data.related.length" class="py-2 text-center text-13px text-t3">没有关联单据</div>
          </n-card>
          <n-card title="操作日志" size="small">
            <template #header-extra><router-link :to="{ name: 'audit-logs' }" class="text-12px text-brand-700 hover:underline">全部日志</router-link></template>
            <div v-for="l in data.logs" :key="l.id" class="border-b border-line py-2 text-13px last:border-0">
              <div class="flex items-center justify-between gap-2">
                <n-tag size="small" :bordered="false" :type="AUDIT_ACTION[l.action].tone">{{ l.action }}</n-tag>
                <span class="qs-num text-12px text-t3">{{ l.at }}</span>
              </div>
              <div class="mt-1 text-12px leading-18px text-t2">
                {{ admin.who(l.operatorJobNo) }}<template v-if="l.authorizerJobNo"> · 授权 {{ admin.who(l.authorizerJobNo) }}</template>
              </div>
              <div v-if="l.before" class="text-12px leading-18px text-t3">前：{{ l.before }}</div>
              <div v-if="l.after || l.reason" class="text-12px leading-18px text-t2">{{ l.after ?? '' }}{{ l.reason ? `（${l.reason}）` : '' }}</div>
            </div>
            <div v-if="!data.logs.length" class="py-2 text-center text-13px text-t3">这张单没有需要留痕的动作</div>
          </n-card>
          <Hint>灰色虚线框的环节不在POS里，只说明去哪里接着查。【待确认】悬停可以看缺口</Hint>
        </div>
      </div>
    </template>

    <div v-else class="py-20 text-center"><n-spin /></div>
  </div>
</template>
