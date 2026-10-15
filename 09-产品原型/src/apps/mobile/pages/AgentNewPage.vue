<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showDialog } from 'vant'
import { api } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { useRequest } from '@/shared/composables/useRequest'
import BottomBar from '../components/BottomBar.vue'
import MAssumptionTag from '../components/MAssumptionTag.vue'
import MPendingTag from '../components/MPendingTag.vue'
import Note from '../components/Note.vue'
import QtyLines from '../components/QtyLines.vue'
import Section from '../components/Section.vue'
import SkuPicker from '../components/SkuPicker.vue'
import { alertFail } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const route = useRoute()
const router = useRouter()

const { data: products } = useRequest(() => api.master.products(), { live: false })
const { data: stockRows } = useRequest(() => api.stock.list([mobile.storeId]))
const availOf = (sku: string) => stockRows.value?.find((r) => r.sku === sku)?.available ?? 0

/** 核销被拒转过来时，商品从被拒的提货单带入：items=SKU*数量,SKU*数量 */
const fromPickup = route.query.source === 'pickup_rejected'
const prefillReason = ref(fromPickup ? String(route.query.reason ?? '') : '')
const items = ref<{ sku: string; qty: number }[]>(
  String(route.query.items ?? '')
    .split(',')
    .filter(Boolean)
    .map((s) => {
      const [sku, qty] = s.split('*')
      return { sku, qty: Math.max(1, Number(qty) || 1) }
    }),
)
const showPicker = ref(false)
function pick(sku: string) {
  const it = items.value.find((i) => i.sku === sku)
  if (it) items.value = items.value.map((i) => (i.sku === sku ? { ...i, qty: i.qty + 1 } : i))
  else items.value = [...items.value, { sku, qty: 1 }]
}
const reference = computed(() => items.value.reduce((s, i) => s + (products.value?.find((p) => p.sku === i.sku)?.price ?? 0) * i.qty, 0))

const customer = ref({ name: '', phone: '', address: '' })
const note = ref('')
const guideJobNo = ref(mobile.user?.duties.includes('guide') ? mobile.user.jobNo : '')
const showGuides = ref(false)
const guideActions = computed(() => mobile.guides.map((g) => ({ name: `${g.jobNo} ${g.name}`, subname: g.title, jobNo: g.jobNo })))

const busy = ref(false)
async function submit() {
  busy.value = true
  try {
    const order = await api.fulfil.createAgentOrder({
      storeId: mobile.storeId,
      guideJobNo: guideJobNo.value,
      creatorJobNo: mobile.user!.jobNo,
      source: fromPickup ? 'pickup_rejected' : 'mobile',
      sourceRef: fromPickup ? String(route.query.ref ?? '') : undefined,
      customer: customer.value,
      items: items.value,
      note: note.value,
    })
    await showDialog({
      title: '已提交中央OMS',
      message: `代客单 ${order.no}\nOMS单号 ${order.oms.omsNo}\n路由和发货结果回来后，在「履约 · 代客单」里看`,
      messageAlign: 'left',
      confirmButtonText: '去看代客单',
    })
    router.replace({ name: 'fulfil', query: { tab: 'agent' } })
  } catch (e) {
    alertFail(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="prefillReason" class="mx-3 mt-3 flex items-center gap-2 rounded-12px bg-brand-50 px-3 py-2.5 text-13px text-brand-800">
      <span class="i-ph-arrow-bend-down-right-bold text-16px" />
      <span class="min-w-0 flex-1">{{ prefillReason }}，已带入商品</span>
      <span role="button" class="text-12px text-brand-700" @click="prefillReason = ''">收起</span>
    </div>

    <Section title="商品">
      <template #extra><van-button size="small" round plain type="primary" icon="plus" @click="showPicker = true">添加商品</van-button></template>
      <QtyLines v-model="items" :products="products ?? []" :hint="(sku) => `本店可用 ${availOf(sku)}`">
        <template #empty><div class="px-4 pb-4 pt-2 text-13px text-t3">本店可用不够时，从这里发起代发。商品数量不受本店可用限制</div></template>
      </QtyLines>
      <div v-if="items.length" class="flex items-center justify-between border-t border-line px-4 py-2.5 text-13px">
        <span class="text-t2">参考金额（按下发零售价）</span>
        <MoneyText :value="reference" strong />
      </div>
    </Section>

    <van-cell-group inset title="顾客和收货地址">
      <van-field v-model="customer.name" label="收货人" placeholder="顾客姓名" maxlength="20" />
      <van-field v-model="customer.phone" label="手机号" type="tel" placeholder="11位手机号" maxlength="11" />
      <van-field v-model="customer.address" label="地址" type="textarea" rows="2" autosize placeholder="省市区和详细地址" maxlength="80" />
    </van-cell-group>

    <van-cell-group inset title="业绩归属">
      <van-field
        :model-value="guideJobNo ? mobile.who(guideJobNo) : ''"
        label="导购工号"
        placeholder="选本店导购"
        readonly
        is-link
        @click="showGuides = true"
      />
      <van-field v-model="note" label="备注" placeholder="选填，例如送货时间" maxlength="60" />
    </van-cell-group>

    <Note>
      代客单是申请，不是发货指令：POS不选仓、不选承运商，由中央OMS路由，区域仓发货不扣本店库存。业绩记在本店和导购工号上，提成不在POS里算 <MPendingTag id="待确认-13" />。
      不在POS收款 <MAssumptionTag k="agentPayment" />
    </Note>

    <BottomBar>
      <van-button block round type="primary" size="large" :loading="busy" :disabled="!items.length" @click="submit">提交中央OMS</van-button>
    </BottomBar>

    <SkuPicker v-model:show="showPicker" :products="products ?? []" :selected="items.map((i) => i.sku)" :hint="(sku) => `本店可用 ${availOf(sku)}`" title="选要代发的商品" @pick="pick" />
    <van-action-sheet
      v-model:show="showGuides"
      :actions="guideActions"
      cancel-text="取消"
      description="业绩按导购工号归属"
      @select="(_: unknown, i: number) => (guideJobNo = guideActions[i].jobNo)"
    />
  </div>
</template>
