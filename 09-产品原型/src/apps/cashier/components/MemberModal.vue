<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/shared/api'
import { errorInfo, useRequest } from '@/shared/composables/useRequest'
import AssumptionTag from '@/shared/naive/AssumptionTag.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import type { CouponTemplate, Member } from '@/shared/types'
import { formatMoney, maskName, maskPhone } from '@/shared/utils/format'
import NumPad from './NumPad.vue'

const props = defineProps<{ show: boolean; storeId: string; current: Member | null; couponId: string | null; templates: CouponTemplate[] }>()
const emit = defineEmits<{ 'update:show': [v: boolean]; apply: [member: Member | null, couponId: string | null] }>()

const phone = ref('')
const member = ref<Member | null>(null)
const coupon = ref<string | null>(null)
const err = ref<{ message: string; basis?: string } | null>(null)
const busy = ref(false)

watch(
  () => props.show,
  (v) => {
    if (!v) return
    phone.value = props.current?.phone ?? ''
    member.value = props.current
    coupon.value = props.couponId
    err.value = null
  },
)

const { data: hints } = useRequest(() => api.master.demoMembers(props.storeId), { watch: [() => props.storeId], live: false })

async function lookup() {
  busy.value = true
  err.value = null
  try {
    member.value = await api.master.findMember(props.storeId, phone.value)
    coupon.value = null
  } catch (e) {
    member.value = null
    err.value = errorInfo(e)
  } finally {
    busy.value = false
  }
}

const coupons = computed(() =>
  (member.value?.coupons ?? [])
    .filter((c) => c.status === 'unused')
    .map((c) => ({ ...c, template: props.templates.find((t) => t.id === c.templateId) }))
    .filter((c) => c.template),
)

function apply() {
  emit('apply', member.value, coupon.value)
  emit('update:show', false)
}
</script>

<template>
  <n-modal :show="show" preset="card" title="识别会员" :style="{ width: '820px' }" @update:show="(v: boolean) => emit('update:show', v)">
    <div class="grid grid-cols-[1fr_340px] gap-6">
      <div class="flex flex-col gap-4">
        <div class="rounded-14px border-2 px-4 py-3" :class="err ? 'border-bad/50' : 'border-brand-200'">
          <div class="text-13px text-t3">会员手机号</div>
          <div class="qs-num h-44px text-34px font-600 tracking-wider text-t1">{{ phone || ' ' }}</div>
        </div>
        <n-alert v-if="err" type="error" :bordered="false">
          <div class="font-600">{{ err.message }}</div>
          <div v-if="err.basis" class="mt-0.5 text-12px opacity-80">{{ err.basis }}</div>
        </n-alert>
        <div v-if="member" class="rounded-14px bg-brand-50 p-4">
          <div class="flex items-center gap-3">
            <div class="qs-flex-center h-46px w-46px rounded-full bg-brand-600 text-20px font-700 text-white">{{ member.name.slice(0, 1) }}</div>
            <div>
              <div class="text-18px font-700">{{ maskName(member.name) }} <span class="qs-num text-15px font-500 text-t2">{{ maskPhone(member.phone) }}</span></div>
              <div class="mt-0.5 flex items-center gap-2 text-13px text-t2">
                {{ member.level }} · 积分 <span class="qs-num font-600">{{ member.points }}</span>
                <span class="text-t3">只显示，不抵扣</span>
                <PendingTag id="待确认-54" />
              </div>
            </div>
          </div>
          <div class="mt-4 text-14px font-600 text-t1">可用券（每单最多一张）<AssumptionTag k="couponPoints" class="ml-1" /></div>
          <div class="mt-2 flex flex-col gap-2">
            <button
              type="button"
              class="pos-press flex items-center justify-between rounded-12px border-2 bg-white px-4 py-3 text-left"
              :class="coupon === null ? 'border-brand-600' : 'border-transparent'"
              @click="coupon = null"
            >
              <span class="text-15px">不用券</span>
              <span v-if="coupon === null" class="i-ph-check-circle-fill text-22px text-brand-600" />
            </button>
            <button
              v-for="c in coupons"
              :key="c.id"
              type="button"
              class="pos-press flex items-center justify-between rounded-12px border-2 bg-white px-4 py-3 text-left"
              :class="coupon === c.id ? 'border-brand-600' : 'border-transparent'"
              @click="coupon = c.id"
            >
              <span>
                <span class="text-15px font-600 text-promo-600">{{ c.template!.name }}</span>
                <span class="ml-2 text-12px text-t3">{{ c.template!.threshold ? `满${formatMoney(c.template!.threshold)}可用` : '无门槛' }} · 有效期至{{ c.expireAt.slice(0, 10) }}</span>
              </span>
              <span v-if="coupon === c.id" class="i-ph-check-circle-fill text-22px text-brand-600" />
            </button>
            <div v-if="!coupons.length" class="text-13px text-t3">这位会员没有可用券</div>
          </div>
        </div>
        <div v-else class="rounded-14px bg-subtle px-4 py-3 text-13px leading-22px text-t2">
          <div class="mb-1 flex items-center gap-2 font-600 text-t1">只识别本店会员 <AssumptionTag k="memberScope" /></div>
          <div class="text-t3">演示会员（虚构号码，点一下填入）：</div>
          <div class="mt-1 flex flex-wrap gap-2">
            <button
              v-for="h in hints ?? []"
              :key="h.phone"
              type="button"
              class="rounded-8px border border-line bg-white px-2 py-0.5 qs-num text-13px hover:border-brand-400"
              @click="phone = h.phone"
            >
              {{ h.phone }}
            </button>
          </div>
        </div>
      </div>
      <NumPad v-model="phone" mode="int" :max-length="11" confirm-text="识别" :confirm-disabled="phone.length !== 11 || busy" keyboard @confirm="lookup" />
    </div>
    <template #footer>
      <div class="flex justify-between">
        <n-button v-if="current" size="large" @click="emit('apply', null, null); emit('update:show', false)">移除会员</n-button>
        <span v-else />
        <div class="flex gap-3">
          <n-button size="large" @click="emit('update:show', false)">取消</n-button>
          <n-button type="primary" size="large" :disabled="!member" @click="apply">使用这位会员</n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>
