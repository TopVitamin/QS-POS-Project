<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { NTag, type DataTableColumns } from 'naive-ui'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import type { Category, Product } from '@/shared/types'
import { codeName } from '@/shared/utils/format'
import { clickable, mono, pagination, two } from '../../components/cells'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'

const { data: products, loading } = useRequest(() => api.master.products())
const { data: categories } = useRequest(() => api.master.categories())
const keyword = ref('')
const top = ref<string | null>(null)

const catOf = (code: string) => categories.value?.find((c) => c.code === code)
/** 三级分类按「一级 / 二级 / 三级」展示 */
const pathOf = (code: string) => {
  const names: string[] = []
  let c: Category | undefined = catOf(code)
  while (c) {
    names.unshift(c.name)
    c = c.parentCode ? catOf(c.parentCode) : undefined
  }
  return names.join(' / ')
}

const rows = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return (products.value ?? []).filter(
    (p) =>
      (!top.value || p.categoryCode.startsWith(top.value)) &&
      (!k || p.sku.toLowerCase().includes(k) || p.name.toLowerCase().includes(k) || p.barcodes.some((b) => b.includes(k))),
  )
})
const topOptions = computed(() => (categories.value ?? []).filter((c) => !c.parentCode).map((c) => ({ label: codeName(c.code, c.name), value: c.code })))

const columns: DataTableColumns<Product> = [
  { title: 'SKU', key: 'sku', width: 140, render: (p) => mono(p.sku) },
  { title: '商品', key: 'name', minWidth: 220, render: (p) => two(h('span', { class: 'font-600' }, p.name), p.spec) },
  { title: '分类', key: 'categoryCode', width: 260, render: (p) => two(pathOf(p.categoryCode), h('span', { class: 'font-mono' }, p.categoryCode)) },
  { title: '条码', key: 'barcodes', width: 150, render: (p) => h('div', { class: 'flex flex-col font-mono text-12.5px' }, p.barcodes.map((b) => h('span', null, b))) },
  { title: '统一零售价（含税）', key: 'price', width: 160, align: 'right', render: (p) => h(MoneyText, { value: p.price, unit: true, strong: true }) },
  { title: '采集SN', key: 'snRequired', width: 90, render: (p) => (p.snRequired ? h(NTag, { size: 'small', bordered: false, type: 'info' }, () => '需采集') : h('span', { class: 'text-t3' }, '-')) },
  { title: '状态', key: 'status', width: 80, render: (p) => h(NTag, { size: 'small', bordered: false, type: p.status === 'active' ? 'success' : 'default' }, () => (p.status === 'active' ? '在售' : '停用')) },
]

const openSku = ref('')
const current = computed(() => rows.value.find((p) => p.sku === openSku.value) ?? null)
const show = computed({
  get: () => !!openSku.value,
  set: (v) => {
    if (!v) openSku.value = ''
  },
})
</script>

<template>
  <div>
    <PageHead title="商品与价格">
      <template #desc>SKU、条码和统一零售价由上游下发，POS只读；成交时保存价格和规则的快照，事后改主数据不改写已成交的价格（《3.上下游链路》§3.7、《4.全局业务规则》§五）。不展示成本和供应商价格</template>
    </PageHead>

    <div class="qs-card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
      <n-select v-model:value="top" :options="topOptions" clearable placeholder="全部一级分类" class="!w-200px" />
      <n-input v-model:value="keyword" clearable placeholder="SKU、商品名或条码" class="!w-260px">
        <template #prefix><span class="i-ph-magnifying-glass-bold text-t3" /></template>
      </n-input>
      <div class="flex-1" />
      <span class="text-13px text-t2">共 <b class="qs-num text-t1">{{ rows.length }}</b> 个SKU</span>
    </div>

    <Hint class="mb-4">
      SKU沿用ERP商品编码，POS不建SPU、不按门店重编；单价按4位小数展示（《6.编码规则》）。演示SKU和分类编码是占位码，商品、规格、价格是演示数据；条码用20开头的店内码，不会撞上真实商品条码。哪些品类强制采集SN <AssumptionTag k="snProducts" />；加盟店能否在价格带内调价 <PendingTag id="待确认-34" />
    </Hint>

    <div class="qs-card overflow-hidden">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading && !products"
        :pagination="pagination"
        :row-key="(p: Product) => p.sku"
        :row-props="clickable((p: Product) => (openSku = p.sku))"
        :scroll-x="1100"
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="show" :width="480">
      <n-drawer-content v-if="current" closable :native-scrollbar="false">
        <template #header>{{ current.name }}</template>
        <div class="flex flex-col gap-4 text-14px">
          <n-descriptions :column="1" label-placement="left" size="small" bordered>
            <n-descriptions-item label="SKU"><span class="font-mono">{{ current.sku }}</span></n-descriptions-item>
            <n-descriptions-item label="规格">{{ current.spec }}</n-descriptions-item>
            <n-descriptions-item label="分类">{{ pathOf(current.categoryCode) }}</n-descriptions-item>
            <n-descriptions-item label="分类编码"><span class="font-mono">{{ current.categoryCode }}</span></n-descriptions-item>
            <n-descriptions-item label="条码">{{ current.barcodes.join('、') }}</n-descriptions-item>
            <n-descriptions-item label="统一零售价（含税）"><MoneyText :value="current.price" unit strong /></n-descriptions-item>
            <n-descriptions-item label="采集SN">{{ current.snRequired ? '需采集' : '不采集' }}</n-descriptions-item>
            <n-descriptions-item label="状态">{{ current.status === 'active' ? '在售' : '停用' }}</n-descriptions-item>
          </n-descriptions>
          <Hint>主数据由上游下发，POS不回写。成交时保存价格快照，事后改这里不改已成交的单</Hint>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
