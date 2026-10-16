<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CartLineDraft } from '@/shared/api'
import MoneyText from '@/shared/components/MoneyText.vue'
import { canAdjustPrice } from '@/shared/domain/rules'
import type { PricedLine } from '@/shared/domain/pricing'
import AuthorizeModal from '@/shared/naive/AuthorizeModal.vue'
import type { AuthorizeResult } from '@/shared/naive/types'
import PendingTag from '@/shared/naive/PendingTag.vue'
import type { PriceAdjustment, Product, SessionUser, Store } from '@/shared/types'
import { formatMoney, yuanToCents } from '@/shared/utils/format'
import { nowText } from '@/shared/utils/time'
import NumPad from './NumPad.vue'

const props = defineProps<{
  show: boolean
  line: CartLineDraft | null
  product: Product | null
  priced?: PricedLine
  adjustment?: PriceAdjustment
  store: Store
  user: SessionUser
  guides: { jobNo: string; name: string }[]
}>()
const emit = defineEmits<{
  'update:show': [v: boolean]
  guide: [jobNo: string]
  sns: [sns: string[]]
  adjust: [a: PriceAdjustment]
  unadjust: []
}>()

const REASONS = ['外包装轻微破损', '价签与系统价不一致', '展示样机', '其他']

const tab = ref<'info' | 'price'>('info')
const sns = ref<string[]>([])
const newPrice = ref('')
const reason = ref('')
const otherReason = ref('')
const showAuth = ref(false)

watch(
  () => props.show,
  (v) => {
    if (!v || !props.line) return
    tab.value = 'info'
    sns.value = [...props.line.sns]
    newPrice.value = ''
    reason.value = ''
    otherReason.value = ''
  },
)

const priceRule = computed(() => canAdjustPrice(props.store))
const before = computed(() => props.priced?.beforeManual ?? 0)
const after = computed(() => yuanToCents(newPrice.value))
const finalReason = computed(() => (reason.value === '其他' ? otherReason.value.trim() : reason.value))
const priceError = computed(() => {
  if (after.value === null) return '请输入改价后的行金额'
  if (after.value >= before.value) return '改价只能往下改'
  if (after.value < 0) return '金额不对'
  if (!finalReason.value) return '请选择改价原因'
  return ''
})

function demoSn(i: number) {
  const base = `${props.product?.sku.slice(-6) ?? ''}${String(Date.now()).slice(-6)}${i}`
  sns.value[i] = `DEMO${base}`
}

function saveSns() {
  emit('sns', sns.value)
}

function onAuthorized(cred: AuthorizeResult) {
  if (!props.line || !props.product || after.value === null) return
  emit('adjust', {
    lineNo: props.line.lineNo,
    sku: props.product.sku,
    before: before.value,
    after: after.value,
    reason: finalReason.value,
    operatorJobNo: props.user.jobNo,
    authorizerJobNo: cred.jobNo,
    at: nowText(),
  })
  emit('update:show', false)
}

function close() {
  if (props.line?.sns.length) saveSns()
  emit('update:show', false)
}
</script>

<template>
  <n-modal :show="show" preset="card" :title="product?.name ?? '编辑商品行'" :style="{ width: '820px' }" @update:show="(v: boolean) => (v ? null : close())">
    <template v-if="line && product">
      <n-tabs v-model:value="tab" type="segment" size="large" class="mb-4">
        <n-tab name="info">导购和序列号</n-tab>
        <n-tab name="price">改价</n-tab>
      </n-tabs>

      <div v-if="tab === 'info'" class="flex flex-col gap-5">
        <div>
          <div class="mb-2 text-15px font-600">这一行的导购 <span class="text-13px font-400 text-t3">业绩归属按行级导购工号</span></div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="g in guides"
              :key="g.jobNo"
              type="button"
              class="pos-press rounded-12px border-2 px-4 py-2.5 text-15px"
              :class="line.guideJobNo === g.jobNo ? 'border-brand-600 bg-brand-50 font-600 text-brand-700' : 'border-line bg-white'"
              @click="emit('guide', g.jobNo)"
            >
              {{ g.jobNo }} {{ g.name }}
            </button>
          </div>
        </div>
        <div v-if="line.sns.length">
          <div class="mb-2 flex items-center gap-2 text-15px font-600">
            逐件采集序列号 <span class="text-13px font-400 text-t3">不接扫码枪，演示可点「填入演示SN」</span>
            <PendingTag id="待确认-11" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="(_, i) in sns" :key="i" class="flex items-center gap-2">
              <span class="w-44px text-13px text-t3">第{{ i + 1 }}件</span>
              <n-input v-model:value="sns[i]" placeholder="序列号" size="large" @blur="saveSns" />
              <n-button size="large" secondary @click="demoSn(i); saveSns()">填入演示SN</n-button>
            </div>
          </div>
        </div>
        <div v-else class="rounded-12px bg-subtle px-4 py-3 text-14px text-t2">这件商品不需要采集序列号。</div>
      </div>

      <div v-else>
        <div v-if="!priceRule.ok" class="flex flex-col items-start gap-2 rounded-14px bg-[#FDF3E3] px-5 py-4">
          <div class="flex items-center gap-2 text-17px font-700 text-[#92400E]"><span class="i-ph-lock-key-fill" />{{ priceRule.message }}</div>
          <div class="text-14px text-[#92400E]/80">{{ priceRule.basis }}</div>
          <div class="flex items-center gap-2 text-13px text-t2">
            原型不开放，避免加盟店自行定价 <PendingTag :id="['待确认-34', '待确认-51']" />
          </div>
        </div>
        <div v-else-if="adjustment" class="flex flex-col gap-3 rounded-14px bg-info/8 px-5 py-4">
          <div class="text-16px font-700 text-info">这一行已经改价并授权</div>
          <div class="text-15px">
            {{ formatMoney(adjustment.before) }} → <span class="font-700">{{ formatMoney(adjustment.after) }}</span>
            · 原因：{{ adjustment.reason }} · 授权人 {{ adjustment.authorizerJobNo }}
          </div>
          <div><n-button size="large" @click="emit('unadjust')">撤销改价</n-button></div>
        </div>
        <div v-else class="grid grid-cols-[1fr_330px] gap-6">
          <div class="flex flex-col gap-4">
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-14px bg-subtle px-4 py-3">
                <div class="text-13px text-t3">改价前行金额（含促销）</div>
                <MoneyText :value="before" class="text-26px font-700" />
              </div>
              <div class="rounded-14px border-2 border-brand-200 px-4 py-3">
                <div class="text-13px text-t3">改价后行金额</div>
                <div class="qs-num h-36px text-26px font-700 text-brand-700">{{ newPrice ? `¥${newPrice}` : ' ' }}</div>
              </div>
            </div>
            <div>
              <div class="mb-2 text-15px font-600">改价原因</div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="r in REASONS"
                  :key="r"
                  type="button"
                  class="pos-press rounded-12px border-2 px-4 py-2 text-15px"
                  :class="reason === r ? 'border-brand-600 bg-brand-50 font-600 text-brand-700' : 'border-line bg-white'"
                  @click="reason = r"
                >
                  {{ r }}
                </button>
              </div>
              <n-input v-if="reason === '其他'" v-model:value="otherReason" class="mt-2" size="large" placeholder="写明原因" />
            </div>
            <div class="rounded-12px bg-subtle px-4 py-3 text-13px leading-21px text-t2">
              改价要授权，记下操作者、原价、新价、原因和授权人（《4.全局业务规则》§五）。只能往下改，改价在促销和券之后算。
              <div class="mt-1 flex items-center gap-1">授权层级 <PendingTag id="待确认-51" /> 叠加先后 <PendingTag id="待确认-53" /></div>
            </div>
            <div v-if="priceError && newPrice" class="text-14px text-bad">{{ priceError }}</div>
          </div>
          <NumPad v-model="newPrice" mode="money" compact confirm-text="申请授权" :confirm-disabled="!!priceError" @confirm="showAuth = true" />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end">
        <n-button type="primary" size="large" @click="close">完成</n-button>
      </div>
    </template>
  </n-modal>

  <AuthorizeModal v-model:show="showAuth" :store-id="store.id" title="改价授权" large @authorized="onAuthorized">
    <div class="rounded-12px bg-subtle px-4 py-3 text-15px">
      <div class="font-600">{{ product?.name }}</div>
      <div class="mt-1 text-t2">
        {{ formatMoney(before) }} → <span class="font-700 text-brand-700">{{ formatMoney(after) }}</span> · {{ finalReason }}
      </div>
    </div>
  </AuthorizeModal>
</template>
