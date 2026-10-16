<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { STOCKTAKE_STATUS } from '@/shared/config/labels'
import { stocktakeDiffs } from '@/shared/domain/rules'
import { shortDate, timeOf } from '@/shared/utils/time'
import MAssumptionTag from '../components/MAssumptionTag.vue'
import MBillNo from '../components/MBillNo.vue'
import MPendingTag from '../components/MPendingTag.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import SkuPicker from '../components/SkuPicker.vue'
import { run } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const router = useRouter()
const { data: rows } = useRequest(() => api.storeops.stocktakes({ storeIds: [mobile.storeId] }))
const { data: products } = useRequest(() => api.master.products(), { live: false })

const showScope = ref(false)
const SCOPES = [
  { name: '全盘', subname: '本店全部在售商品', scope: 'full' as const },
  { name: '抽盘', subname: '自己选要盘的商品', scope: 'partial' as const },
]
const showPicker = ref(false)
const partial = ref<string[]>([])

async function create(scope: 'full' | 'partial') {
  const st = await run(
    () => api.storeops.createStocktake({ storeId: mobile.storeId, creatorJobNo: mobile.user!.jobNo, scope, skus: scope === 'partial' ? partial.value : undefined }),
    (s) => `已建盘点单，记下${s.lines.length}个商品的账面快照`,
  )
  partial.value = []
  if (st) router.push(`/stocktake/${st.no}`)
}

function onScope(_: unknown, i: number) {
  if (SCOPES[i].scope === 'full') void create('full')
  else showPicker.value = true
}

function togglePartial(sku: string) {
  partial.value = partial.value.includes(sku) ? partial.value.filter((s) => s !== sku) : [...partial.value, sku]
}

async function onPickerClose(open: boolean) {
  if (open || !partial.value.length) return
  try {
    await showConfirmDialog({ title: '开始抽盘', message: `已选${partial.value.length}种商品，建单时记下账面快照`, confirmButtonText: '建单' })
    await create('partial')
  } catch {
    /* 取消就留着选择，下次接着选 */
  }
}

const progress = (lines: { countedQty: number | null }[]) => `${lines.filter((l) => l.countedQty !== null).length}/${lines.length}`
</script>

<template>
  <div class="pb-4">
    <div v-if="mobile.has('stocktake.manage')" class="px-3 pt-3">
      <van-button block round type="primary" icon="plus" @click="showScope = true">新建盘点</van-button>
    </div>

    <router-link v-for="s in rows ?? []" :key="s.no" :to="`/stocktake/${s.no}`" class="m-press mx-3 mt-3 block rounded-14px bg-white px-4 py-3 shadow-card">
      <div class="flex items-center gap-2">
        <MBillNo :no="s.no" class="text-13px font-600" />
        <span class="rounded-4px bg-subtle px-1 text-11px text-t2">{{ s.scope === 'full' ? '全盘' : '抽盘' }}</span>
        <span v-if="s.joint" class="rounded-4px bg-[#FDF3E3] px-1 text-11px text-[#92400E]">共同盘点</span>
        <div class="flex-1" />
        <MStatusTag :def="STOCKTAKE_STATUS[s.status]" />
      </div>
      <div class="mt-1.5 flex items-center text-13px text-t2">
        <span class="flex-1">{{ s.lines.length }}个商品 · 已录 {{ progress(s.lines) }}</span>
        <span v-if="s.status !== 'counting'" :class="stocktakeDiffs(s.lines).length ? 'text-bad' : 'text-ok'">
          {{ stocktakeDiffs(s.lines).length ? `${stocktakeDiffs(s.lines).length}个商品有差异` : '账实相符' }}
        </span>
        <span class="i-ph-caret-right text-t3" />
      </div>
      <div class="mt-1 text-12px text-t3">{{ shortDate(s.createdAt) }} {{ timeOf(s.createdAt) }} · {{ mobile.who(s.creatorJobNo) }}建单</div>
    </router-link>
    <van-empty v-if="rows && !rows.length" image-size="80" description="还没有盘点单" />

    <Note>
      盘点差异在授权之前不改变可售数量，授权之后由中枢调整（《4.全局业务规则》§二）。原型盘点期间不停售 <MAssumptionTag k="stocktakeSales" />，抽盘差多少算通过 <MPendingTag id="待确认-15" />。
      加盟店是共同盘点，只记事实，不出赔偿金额 <MPendingTag id="待确认-23" />
    </Note>

    <van-action-sheet v-model:show="showScope" :actions="SCOPES" cancel-text="取消" description="同一家店同时只能有一张盘点中的单" @select="onScope" />
    <SkuPicker
      v-model:show="showPicker"
      :products="products ?? []"
      :selected="partial"
      title="选要抽盘的商品"
      @pick="togglePartial"
      @update:show="onPickerClose"
    />
  </div>
</template>
