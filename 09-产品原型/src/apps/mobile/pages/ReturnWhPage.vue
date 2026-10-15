<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { RTW_REASONS, RTW_STATUS } from '@/shared/config/labels'
import { shortDate, timeOf } from '@/shared/utils/time'
import MBillNo from '../components/MBillNo.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import QtyLines from '../components/QtyLines.vue'
import SkuPicker from '../components/SkuPicker.vue'
import { run } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const { data: rows } = useRequest(() => api.storeops.rtws({ storeIds: [mobile.storeId] }))
const { data: products } = useRequest(() => api.master.products(), { live: false })
const { data: stock } = useRequest(() => api.stock.list([mobile.storeId]))
const availOf = (sku: string) => stock.value?.find((r) => r.sku === sku)?.available ?? 0
/** 锁给自提的件数不能退，选商品时只列本店可用大于0的 */
const returnable = computed(() => (products.value ?? []).filter((p) => availOf(p.sku) > 0))

const showNew = ref(false)
const showPicker = ref(false)
const reason = ref('')
const items = ref<{ sku: string; qty: number }[]>([])
function pick(sku: string) {
  if (items.value.some((i) => i.sku === sku)) items.value = items.value.filter((i) => i.sku !== sku)
  else items.value = [...items.value, { sku, qty: 1 }]
}

const busy = ref(false)
async function submit() {
  busy.value = true
  const r = await run(
    () => api.storeops.createRtw({ storeId: mobile.storeId, creatorJobNo: mobile.user!.jobNo, reason: reason.value, items: items.value }),
    (x) => `已提交 ${x.no}，等中枢同意`,
  )
  busy.value = false
  if (r) {
    showNew.value = false
    reason.value = ''
    items.value = []
  }
}
</script>

<template>
  <div class="pb-4">
    <div v-if="mobile.has('storeops.manage')" class="px-3 pt-3">
      <van-button block round type="primary" icon="plus" @click="showNew = true">新建退仓单</van-button>
    </div>

    <div v-for="r in rows ?? []" :key="r.no" class="mx-3 mt-3 rounded-14px bg-white px-4 py-3 shadow-card">
      <div class="flex items-center gap-2">
        <MBillNo :no="r.no" class="text-13px font-600" />
        <span class="rounded-4px bg-subtle px-1 text-11px text-t2">{{ r.reason }}</span>
        <div class="flex-1" />
        <MStatusTag :def="RTW_STATUS[r.status]" />
      </div>
      <div class="mt-1.5 text-14px">{{ r.lines.map((l) => `${l.name}×${l.qty}`).join('、') }}</div>
      <div class="mt-1 text-12px text-t3">{{ shortDate(r.createdAt) }} {{ timeOf(r.createdAt) }} · {{ mobile.who(r.creatorJobNo) }}提交 · 共{{ r.lines.reduce((s, l) => s + l.qty, 0) }}件</div>
      <div class="mt-2 rounded-10px bg-subtle px-3 py-2 text-12px leading-19px text-t2">
        <div v-if="r.hub.approvedAt">中枢 {{ shortDate(r.hub.approvedAt) }} {{ timeOf(r.hub.approvedAt) }} 同意，退往{{ r.hub.targetNodeName ?? '-' }}</div>
        <div v-else>等中枢同意并指定退往的仓</div>
        <div v-if="r.hub.shippedAt">{{ shortDate(r.hub.shippedAt) }} {{ timeOf(r.hub.shippedAt) }} 交运，本店账面已扣减</div>
        <div v-else-if="r.status === 'approved'">交运时才扣减本店账面</div>
      </div>
    </div>
    <van-empty v-if="rows && !rows.length" image-size="80" description="还没有退仓单" />

    <Note>
      退仓是门店把货退回区域仓。加盟店的残次、滞销、质量件也走退仓，只转移库存位置，不因退仓把货款退给加盟商（《7.直营与加盟代销模式说明》§2.1）。
      原型提交时只校验本店可用，交运时才扣减账面；同意和交运在管理端「中枢模拟器」里推进。原因选项是演示枚举
    </Note>

    <van-popup v-model:show="showNew" position="bottom" round closeable teleport="body" :style="{ maxHeight: '88%' }">
      <div class="flex max-h-[88vh] flex-col">
        <div class="px-4 pt-5">
          <div class="text-17px font-700">新建退仓单</div>
          <div class="mt-1 text-12px text-t3">{{ mobile.storeText }} · 退回区域仓，退往哪个仓由中枢指定</div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto pb-2">
          <div class="px-4 pt-4 text-14px font-600">退仓原因</div>
          <div class="flex flex-wrap gap-2 px-4 pt-2">
            <button
              v-for="x in RTW_REASONS"
              :key="x"
              type="button"
              class="rounded-full border px-3.5 py-1.5 text-13px"
              :class="reason === x ? 'border-brand-600 bg-brand-50 font-600 text-brand-700' : 'border-line-strong bg-white text-t2'"
              @click="reason = x"
            >
              {{ x }}
            </button>
          </div>
          <div class="mt-4 flex items-center justify-between px-4">
            <span class="text-14px font-600">退仓商品</span>
            <van-button size="small" round plain type="primary" icon="plus" @click="showPicker = true">选商品</van-button>
          </div>
          <div class="mx-3 mt-2 overflow-hidden rounded-12px border border-line">
            <QtyLines v-model="items" :products="products ?? []" :hint="(sku) => `本店可用 ${availOf(sku)}`" :max="availOf">
              <template #empty><div class="px-4 py-4 text-13px text-t3">只能退本店可用的件数，锁给自提的不能退</div></template>
            </QtyLines>
          </div>
        </div>
        <div class="border-t border-line px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          <van-button block round type="primary" size="large" :loading="busy" :disabled="!reason || !items.length" @click="submit">
            {{ !reason ? '先选退仓原因' : !items.length ? '再选退仓商品' : `提交退仓单（${items.reduce((s, i) => s + i.qty, 0)}件）` }}
          </van-button>
        </div>
      </div>
    </van-popup>

    <SkuPicker
      v-model:show="showPicker"
      :products="returnable"
      :selected="items.map((i) => i.sku)"
      :hint="(sku) => `本店可用 ${availOf(sku)}`"
      title="选要退仓的商品"
      @pick="pick"
    />
  </div>
</template>
