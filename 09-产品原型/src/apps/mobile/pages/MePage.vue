<script setup lang="ts">
import { computed } from 'vue'
import { showConfirmDialog } from 'vant'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { DUTY, STORE_MODE } from '@/shared/config/labels'
import { semantic } from '@/shared/theme/tokens'
import type { Duty } from '@/shared/types'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import Section from '../components/Section.vue'
import { alertFail, toastOk } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const { data: meta } = useRequest(() => api.master.meta())

/** 演示账号都只授权一家店，按店分组 */
const groups = computed(() =>
  (mobile.stores ?? [])
    .map((store) => ({ store, items: mobile.accounts.filter((e) => e.storeIds[0] === store.id) }))
    .filter((g) => g.items.length),
)
const dutyText = (duties: Duty[]) => duties.map((d) => DUTY[d].label).join('·')

function switchTo(jobNo: string) {
  if (jobNo === mobile.user?.jobNo) return
  mobile.switchTo(jobNo)
  toastOk(`已切换为 ${mobile.who(jobNo)}`)
}

async function reset() {
  try {
    await showConfirmDialog({
      title: '重置演示数据',
      message: '三个端共用的本地演示库会按种子重新生成，刚才做过的核销、代客单、收货和盘点都会清掉',
      confirmButtonText: '重置',
      confirmButtonColor: semantic.error,
    })
  } catch {
    return
  }
  try {
    await api.master.reset()
    toastOk('演示数据已重置')
  } catch (e) {
    alertFail(e)
  }
}
</script>

<template>
  <div class="pb-4">
    <div v-if="mobile.user" class="mx-3 mt-3 rounded-16px bg-white px-4 py-4 shadow-card">
      <div class="flex items-center gap-3">
        <span class="qs-flex-center h-48px w-48px shrink-0 rounded-14px bg-ink-900 text-20px font-700 text-volt-400">{{ mobile.user.name.slice(0, 1) }}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 text-17px font-600">{{ mobile.user.name }}<span class="qs-num text-13px font-500 text-t3">{{ mobile.user.jobNo }}</span></div>
          <div class="truncate text-12px text-t2">{{ mobile.user.title }} · {{ mobile.user.employer === 'qs' ? '强盛员工' : '加盟商员工' }}</div>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2 rounded-10px bg-subtle px-3 py-2 text-13px">
        <span class="i-ph-storefront-fill text-15px text-brand-600" />
        <span class="min-w-0 flex-1 truncate">{{ mobile.storeText }}</span>
        <MStatusTag v-if="mobile.store" :def="STORE_MODE[mobile.store.mode]" />
      </div>
      <div class="mt-3 flex flex-col gap-1.5">
        <div v-for="d in mobile.user.duties" :key="d" class="flex gap-2 text-12px leading-18px">
          <span class="shrink-0 rounded-4px bg-brand-50 px-1.5 font-600 text-brand-700">{{ DUTY[d].label }}</span>
          <span class="text-t2">{{ DUTY[d].desc }}</span>
        </div>
      </div>
    </div>

    <Section title="切换演示身份" desc="页面、按钮和数据范围按职责变化。演示切换不校验PIN；授权人确认时要输PIN，演示PIN都是1234">
      <template v-for="g in groups" :key="g.store.id">
        <div class="flex items-center gap-1.5 border-t border-line bg-subtle px-4 py-1.5 text-12px text-t3">
          {{ g.store.name }} <MStatusTag :def="STORE_MODE[g.store.mode]" />
        </div>
        <div
          v-for="e in g.items"
          :key="e.jobNo"
          role="button"
          class="m-press flex items-center gap-3 border-t border-line px-4 py-2.5"
          @click="switchTo(e.jobNo)"
        >
          <span
            class="qs-flex-center h-34px w-34px shrink-0 rounded-10px text-14px font-700"
            :class="e.jobNo === mobile.user?.jobNo ? 'bg-brand-600 text-white' : 'bg-subtle text-t2'"
          >{{ e.name.slice(0, 1) }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 text-14px"><span class="font-600">{{ e.name }}</span><span class="qs-num text-12px text-t3">{{ e.jobNo }}</span></div>
            <div class="truncate text-12px text-t3">{{ e.title }} · {{ dutyText(e.duties) }}</div>
          </div>
          <span v-if="e.jobNo === mobile.user?.jobNo" class="i-ph-check-circle-fill text-20px text-brand-600" />
        </div>
      </template>
    </Section>

    <van-cell-group inset title="其他端">
      <van-cell title="收银端" label="开单、收款、退货、交班" url="./cashier.html" is-link>
        <template #icon><span class="i-ph-desktop-tower-fill mr-2.5 self-center text-20px text-brand-600" /></template>
      </van-cell>
      <van-cell title="管理端" label="总部和门店后台、日结、加盟结算、中枢模拟器" url="./admin.html" is-link>
        <template #icon><span class="i-ph-squares-four-fill mr-2.5 self-center text-20px text-brand-600" /></template>
      </van-cell>
      <van-cell title="演示入口" label="三个端和演示账号一览" url="./index.html" is-link>
        <template #icon><span class="i-ph-house-fill mr-2.5 self-center text-20px text-brand-600" /></template>
      </van-cell>
    </van-cell-group>

    <van-cell-group inset title="演示数据">
      <van-cell title="生成时间" :value="meta?.seededAt ?? '-'" />
      <van-cell title="重置演示数据" label="三个端共用一份本地库，重置后回到种子状态" is-link @click="reset">
        <template #icon><span class="i-ph-arrow-counter-clockwise-bold mr-2.5 self-center text-20px text-bad" /></template>
      </van-cell>
    </van-cell-group>

    <Note>演示库存在浏览器本地，跨天打开会按当天重新生成。门店、员工、商品、价格和交易都是演示数据，不是强盛的真实数据</Note>
  </div>
</template>
