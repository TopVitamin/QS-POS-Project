<script setup lang="ts">
import { computed, ref } from 'vue'
import { DUTY } from '@/shared/config/labels'
import { canEnter, DUTY_ORDER, END_DUTIES, END_LABEL, LEVEL_TEXT, MATRIX, scopeFranchiseeIds, scopeStoreIds, type AppEnd, type Level } from '@/shared/config/permissions'
import { useFeedback } from '@/shared/naive/feedback'
import PendingTag from '@/shared/naive/PendingTag.vue'
import PendingText from '@/shared/naive/PendingText.vue'
import type { Duty, SessionUser } from '@/shared/types'
import Hint from '../../components/Hint.vue'
import PageHead from '../../components/PageHead.vue'
import { useAdmin } from '../../stores/session'

const admin = useAdmin()
const fb = useFeedback()
const mine = computed(() => new Set(admin.user?.duties ?? []))

/** 设计说明5.1的数据范围，依据《8.角色权限原则》§二 */
const SCOPE: Record<Duty, string> = {
  guide: '本店',
  cashier: '本店',
  storeManager: '本店',
  hqOps: '被明确授权的直营店，授权到店，不到「全部未来新店」',
  finance: '被授权的店的日结和支付流水；加盟应缴和结算按加盟商单独授权',
  franchiseAdmin: '本加盟商名下的店、代销仓、应缴和结算',
  franchiseFinance: '同加盟商管理',
  sysAdmin: '账号和数据范围的配置；主数据和日志只读，也按授权到店',
}
const ENDS: AppEnd[] = ['cashier', 'mobile', 'admin']
const endsOfDuty = (d: Duty) => ENDS.filter((e) => END_DUTIES[e].includes(d))

const LEVEL_CLASS: Record<Level, string> = {
  do: 'bg-brand-600 text-white',
  view: 'bg-brand-50 text-brand-700',
  auth: 'bg-[#FDF3E3] text-[#A35A06] ring-1 ring-inset ring-[#E2A650]',
  none: 'text-t3',
}

function scopeText(e: SessionUser) {
  const stores = admin.stores ?? []
  const names = scopeStoreIds(e, stores).map((id) => stores.find((s) => s.id === id)?.name ?? id)
  const parts = [names.length ? names.join('、') : '不到店']
  if (e.settlementFranchiseeIds?.length && !e.franchiseeId) {
    const fs = scopeFranchiseeIds(e, admin.franchisees ?? [])
    parts.push(`加盟应缴和结算：${fs.map((id) => admin.franchiseeText(id)).join('、')}（单独授权）`)
  }
  if (e.franchiseeId) parts.push(`只落在${admin.franchiseeText(e.franchiseeId)}`)
  return parts.join('；')
}
const accounts = computed(() => (admin.employees ?? []).filter((e) => e.active))
const pickDuty = ref<Duty | null>(null)
const shownAccounts = computed(() => (pickDuty.value ? accounts.value.filter((e) => e.duties.includes(pickDuty.value!)) : accounts.value))
function toggleDuty(d: Duty) {
  pickDuty.value = pickDuty.value === d ? null : d
}

function switchTo(e: SessionUser) {
  admin.switchTo(e.jobNo)
  fb.message.success(`已切换为 ${admin.who(e.jobNo)}`)
}
</script>

<template>
  <div>
    <PageHead title="角色与数据范围">
      <template #desc>角色名称、菜单和审批层级都没有定稿，原型按职责建演示角色，演示账号按兼岗组合职责，兼岗不扩大数据范围（《8.角色权限原则》§一）。这一页只是说明，原型里不改权限</template>
    </PageHead>

    <div class="mb-4 grid grid-cols-4 gap-3">
      <div
        v-for="d in DUTY_ORDER"
        :key="d"
        class="qs-card cursor-pointer px-4 py-3"
        :class="pickDuty === d ? 'ring-2 ring-brand-600' : mine.has(d) ? 'ring-1 ring-brand-200' : ''"
        @click="toggleDuty(d)"
      >
        <div class="flex items-center gap-2">
          <span class="text-15px font-700">{{ DUTY[d].label }}</span>
          <span v-if="mine.has(d)" class="rounded-4px bg-brand-600 px-1.5 text-11px font-600 leading-18px text-white">当前身份</span>
          <span class="ml-auto flex gap-1">
            <span v-for="e in endsOfDuty(d)" :key="e" class="rounded-4px bg-subtle px-1.5 text-11px leading-18px text-t2">{{ END_LABEL[e] }}</span>
          </span>
        </div>
        <div class="mt-1.5 text-13px leading-19px text-t2">{{ DUTY[d].desc }}</div>
        <div class="mt-1.5 text-12px leading-18px text-t3">范围：{{ SCOPE[d] }}</div>
      </div>
    </div>

    <div class="qs-card mb-4 overflow-hidden">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-5 py-3">
        <span class="text-15px font-600">功能矩阵</span>
        <span v-for="l in (['do', 'view', 'auth'] as Level[])" :key="l" class="inline-flex items-center gap-1.5 text-12px text-t2">
          <span class="qs-flex-center h-20px w-24px rounded-5px text-12px font-700" :class="LEVEL_CLASS[l]">{{ LEVEL_TEXT[l] }}</span>
          {{ l === 'do' ? '可以操作' : l === 'view' ? '只读' : '可以发起，要授权人确认' }}
        </span>
        <span class="text-12px text-t3">「-」不可见。和《前端设计说明》5.2一一对应</span>
      </div>
      <div class="qs-scroll overflow-x-auto">
        <table class="w-full min-w-1180px border-collapse text-13px">
          <thead>
            <tr class="bg-subtle text-12px text-t2">
              <th class="sticky left-0 z-1 w-230px bg-subtle px-4 py-2.5 text-left font-600">功能</th>
              <th v-for="d in DUTY_ORDER" :key="d" class="w-82px px-1 py-2.5 text-center font-600" :class="mine.has(d) ? 'bg-brand-50 text-brand-700' : ''">{{ DUTY[d].label }}</th>
              <th class="px-4 py-2.5 text-left font-600">说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in MATRIX" :key="row.label" class="border-t border-line">
              <td class="sticky left-0 z-1 bg-white px-4 py-2 font-500">{{ row.label }}</td>
              <td v-for="d in DUTY_ORDER" :key="d" class="px-1 py-1.5 text-center" :class="mine.has(d) ? 'bg-brand-50/50' : ''">
                <span class="qs-flex-center mx-auto h-24px w-30px rounded-6px text-13px font-700" :class="LEVEL_CLASS[row.levels[d] ?? 'none']">{{ LEVEL_TEXT[row.levels[d] ?? 'none'] }}</span>
              </td>
              <td class="px-4 py-2 text-12px text-t3"><PendingText v-if="row.note" :text="row.note" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Hint class="mb-4">
      谁能当授权人、授权到哪一层 <PendingTag id="待确认-51" />，原型里由本店店长和被授权的总部运营担任；店长在收银端只当授权人，输工号和PIN确认，不用登录收银端。
      跨店退 <PendingTag id="待确认-27" />、修改已封账日结、离线开关在原型里都不开放。有菜单权限也不能绕过「中枢拒绝锁库则不能卖」；系统管理开通账号、分配数据范围，不能直接改数据（《8.角色权限原则》§五）。
      所有端都不展示存货成本和供应商价格。中枢模拟器是演示工具，不计入权限
    </Hint>

    <div class="qs-card overflow-hidden">
      <div class="flex items-center gap-3 border-b border-line px-5 py-3">
        <span class="text-15px font-600">演示账号</span>
        <span class="text-12px text-t3">点上面的职责卡片只看这一类。演示PIN统一是1234。姓名都是演示数据，不对应背景里的人物（《2.项目背景》§六）</span>
      </div>
      <table class="w-full border-collapse text-13px">
        <thead>
          <tr class="bg-subtle text-12px text-t2">
            <th class="w-100px px-4 py-2.5 text-left font-600">工号</th>
            <th class="w-150px px-2 py-2.5 text-left font-600">姓名</th>
            <th class="w-210px px-2 py-2.5 text-left font-600">职责</th>
            <th class="w-200px px-2 py-2.5 text-left font-600">能进的端</th>
            <th class="px-2 py-2.5 text-left font-600">数据范围</th>
            <th class="w-150px px-4 py-2.5 text-right font-600" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in shownAccounts" :key="e.jobNo" class="border-t border-line" :class="e.jobNo === admin.user?.jobNo ? 'bg-brand-50/60' : ''">
            <td class="px-4 py-2.5 font-mono">{{ e.jobNo }}</td>
            <td class="px-2 py-2.5">
              <div class="font-600">{{ e.name }}</div>
              <div class="text-12px text-t3">{{ e.title }} · {{ e.employer === 'qs' ? '强盛员工' : '加盟商员工' }}</div>
            </td>
            <td class="px-2 py-2.5">
              <span class="flex flex-wrap gap-1">
                <n-tag v-for="d in e.duties" :key="d" size="small" :bordered="false">{{ DUTY[d].label }}</n-tag>
              </span>
            </td>
            <td class="px-2 py-2.5">
              <span class="flex flex-wrap gap-1">
                <span
                  v-for="end in ENDS"
                  :key="end"
                  class="rounded-5px px-1.5 text-12px leading-20px"
                  :class="canEnter(e, end) ? 'bg-ink-900 text-white' : 'bg-subtle text-t3 line-through'"
                >{{ END_LABEL[end] }}</span>
              </span>
            </td>
            <td class="px-2 py-2.5 text-t2">{{ scopeText(e) }}</td>
            <td class="px-4 py-2.5 text-right">
              <span v-if="e.jobNo === admin.user?.jobNo" class="text-12px font-600 text-brand-700">当前身份</span>
              <n-button v-else-if="canEnter(e, 'admin')" size="small" secondary @click="switchTo(e)">切换为此身份</n-button>
              <span v-else class="text-12px text-t3">在收银端或移动端登录</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
