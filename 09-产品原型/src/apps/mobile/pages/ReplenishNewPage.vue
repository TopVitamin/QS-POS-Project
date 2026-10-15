<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import BottomBar from '../components/BottomBar.vue'
import MPendingTag from '../components/MPendingTag.vue'
import Note from '../components/Note.vue'
import QtyLines from '../components/QtyLines.vue'
import Section from '../components/Section.vue'
import SkuPicker from '../components/SkuPicker.vue'
import { run } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const router = useRouter()
const { data: products } = useRequest(() => api.master.products(), { live: false })
const { data: stock } = useRequest(() => api.stock.list([mobile.storeId]))
const hint = (sku: string) => {
  const r = stock.value?.find((s) => s.sku === sku)
  return `可用 ${r?.available ?? 0} · 在途 ${r?.inTransit ?? 0}`
}

const items = ref<{ sku: string; qty: number }[]>([])
const note = ref('')
const showPicker = ref(false)
function pick(sku: string) {
  if (items.value.some((i) => i.sku === sku)) items.value = items.value.filter((i) => i.sku !== sku)
  else items.value = [...items.value, { sku, qty: 1 }]
}

const busy = ref(false)
async function submit() {
  busy.value = true
  const r = await run(
    () => api.storeops.createReplenishment({ storeId: mobile.storeId, creatorJobNo: mobile.user!.jobNo, items: items.value, note: note.value }),
    (x) => `已提交 ${x.no}，等中枢审核`,
  )
  busy.value = false
  if (r) router.replace('/replenish')
}
</script>

<template>
  <div>
    <Section title="要什么">
      <template #extra><van-button size="small" round plain type="primary" icon="plus" @click="showPicker = true">选商品</van-button></template>
      <QtyLines v-model="items" :products="products ?? []" :hint="hint">
        <template #empty><div class="px-4 pb-4 pt-2 text-13px text-t3">点「选商品」，按本店可用和在途决定要多少</div></template>
      </QtyLines>
    </Section>

    <van-cell-group inset title="说明">
      <van-field v-model="note" type="textarea" rows="2" autosize placeholder="选填，例如周末备货" maxlength="60" />
    </van-cell-group>

    <Note>
      提交后由中枢审核，调出仓也由中枢给出；审核前和在途期间本店可用不变。
      <template v-if="mobile.store?.mode === 'franchise'">加盟店要货走同一条调拨，货权仍在强盛，不产生货款，也不做资金校验（《7.直营与加盟代销模式说明》§2.1）。区域仓还能订多少不展示 <MPendingTag id="待确认-25" /></template>
    </Note>

    <BottomBar>
      <van-button block round type="primary" size="large" :loading="busy" :disabled="!items.length" @click="submit">提交要货单</van-button>
    </BottomBar>

    <SkuPicker v-model:show="showPicker" :products="products ?? []" :selected="items.map((i) => i.sku)" :hint="hint" title="选要货的商品" @pick="pick" />
  </div>
</template>
