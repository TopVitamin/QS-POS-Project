<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useIntervalFn, useNow } from '@vueuse/core'
import { api } from '@/shared/api'
import { errorInfo, useRequest } from '@/shared/composables/useRequest'
import { DUTY, STORE_MODE } from '@/shared/config/labels'
import { can } from '@/shared/config/permissions'
import BillNo from '@/shared/naive/BillNo.vue'
import DemoBadge from '@/shared/naive/DemoBadge.vue'
import PendingTag from '@/shared/naive/PendingTag.vue'
import { useFeedback } from '@/shared/naive/feedback'
import type { SessionUser } from '@/shared/types'
import { formatMoney, yuanToCents } from '@/shared/utils/format'
import { timeOf, toDateTimeText, weekdayOf } from '@/shared/utils/time'
import NumPad from '../components/NumPad.vue'
import { useCart } from '../stores/cart'
import { useSession } from '../stores/session'

const session = useSession()
const cart = useCart()
const route = useRoute()
const router = useRouter()
const fb = useFeedback()
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 1000) })
const clock = computed(() => toDateTimeText(now.value.getTime()))

const notice = computed(() => {
  if (route.query.reason === 'shift') return { tone: 'warn', text: '班次已经交班或不存在（可能在别的标签页交了班，或者演示数据换天重置了），请重新登录开班' }
  if (route.query.reason === 'handover') return { tone: 'ok', text: '交班完成。下一位收银员登录后录入备用金开班' }
  return null
})

const { data: stores } = useRequest(() => api.master.stores(), { live: false })
const { data: employees } = useRequest(() => api.master.employees(), { live: false })
const { data: openShifts } = useRequest(() => api.shift.list({ status: 'open' }))

const store = computed(() => stores.value?.find((s) => s.id === session.storeId))
const nameOf = (jobNo: string) => employees.value?.find((e) => e.jobNo === jobNo)?.name ?? jobNo
const shiftOnRegister = (registerNo: string) => openShifts.value?.find((s) => s.storeId === session.storeId && s.registerNo === registerNo)
const shiftOfPerson = (jobNo: string) => openShifts.value?.find((s) => s.cashierJobNo === jobNo)

/** 收银端给导购和收银职责用；总部、财务、加盟商账号走管理端 */
const accounts = computed(() =>
  (employees.value ?? []).filter((e) => e.active && e.storeIds.includes(session.storeId) && (can(e, 'sale.open') || can(e, 'payment.collect'))),
)

function pickStore(id: string) {
  if (session.storeId === id) return
  session.storeId = id
  const s = stores.value?.find((x) => x.id === id)
  if (s && !s.registers.some((r) => r.no === session.registerNo)) session.registerNo = s.registers[0].no
  jobNo.value = ''
  resetStep()
}

const jobNo = ref('')
const pin = ref('')
const busy = ref(false)
const err = ref<{ message: string; basis?: string; fix?: { label: string; run: () => void } } | null>(null)
const pendingUser = ref<SessionUser | null>(null)
const floatText = ref('')

function resetStep() {
  pin.value = ''
  err.value = null
  pendingUser.value = null
  floatText.value = ''
}
watch(() => session.registerNo, resetStep)

function pickAccount(j: string) {
  jobNo.value = j
  resetStep()
}

function enter(u: SessionUser, shiftNo: string | null) {
  session.signIn(u, shiftNo)
  cart.bindStore(session.storeId)
  router.replace({ name: 'sale' })
}

async function login() {
  if (!jobNo.value.trim()) return (err.value = { message: '请选择或输入工号' })
  if (pin.value.length < 4) return (err.value = { message: '请输入PIN' })
  busy.value = true
  err.value = null
  try {
    const u = await api.master.login(jobNo.value, pin.value)
    if (!can(u, 'sale.open') && !can(u, 'payment.collect')) {
      err.value = { message: `${u.name}没有导购或收银职责，不能进收银端`, basis: '总部、财务和加盟商账号请用管理端' }
      return
    }
    if (!u.storeIds.includes(session.storeId)) {
      err.value = { message: `${u.name}不是${store.value?.name ?? '本店'}的账号`, basis: '《8.角色权限原则》：兼岗不扩大数据范围' }
      return
    }
    if (!can(u, 'payment.collect')) return enter(u, null)

    const mine = await api.shift.openShiftOf(u.jobNo)
    if (mine) {
      if (mine.storeId === session.storeId && mine.registerNo === session.registerNo) {
        fb.ok('已回到本人未交班的班次')
        return enter(u, mine.no)
      }
      const other = stores.value?.find((s) => s.id === mine.storeId)
      err.value = {
        message: `你在${other?.name ?? ''}${mine.registerNo}号收银台还有没交班的班次`,
        basis: '一个人同一时间只在一台收银机当班，先回那台交班',
        fix: {
          label: '切到那台收银机',
          run: () => {
            session.storeId = mine.storeId
            session.registerNo = mine.registerNo
          },
        },
      }
      return
    }
    const onRegister = await api.shift.openShiftOn(session.storeId, session.registerNo)
    if (onRegister) {
      err.value = {
        message: `这台收银机还在${onRegister.cashierJobNo} ${nameOf(onRegister.cashierJobNo)}的班次里`,
        basis: '请换一台收银机，或者请当班的收银员先交班。导购职责的账号不受影响',
      }
      return
    }
    pendingUser.value = u
  } catch (e) {
    err.value = errorInfo(e)
  } finally {
    busy.value = false
  }
}

async function openShift() {
  const u = pendingUser.value
  const float = yuanToCents(floatText.value)
  if (!u) return
  if (float === null) return (err.value = { message: '请录入备用金' })
  busy.value = true
  err.value = null
  try {
    const shift = await api.shift.open({ storeId: session.storeId, registerNo: session.registerNo, cashierJobNo: u.jobNo, float })
    fb.ok('开班成功', `班次 ${shift.no}，备用金 ${formatMoney(float)}`)
    enter(u, shift.no)
  } catch (e) {
    err.value = errorInfo(e)
  } finally {
    busy.value = false
  }
}

const selected = computed(() => accounts.value.find((a) => a.jobNo === jobNo.value.trim().toUpperCase()))
const dutyText = (u: SessionUser) => u.duties.map((d) => DUTY[d].label).join('·')
</script>

<template>
  <div class="flex h-full bg-canvas">
    <aside class="relative flex w-440px shrink-0 flex-col overflow-hidden bg-ink-900 px-8 pb-6 pt-8 text-white">
      <div class="pointer-events-none absolute -bottom-24 -left-20 h-320px w-320px rounded-full bg-brand-600/25" />
      <div class="pointer-events-none absolute -right-28 top-24 h-220px w-220px rounded-full bg-volt-400/10" />
      <div class="relative flex items-center gap-3">
        <div class="qs-flex-center h-48px w-48px rounded-14px bg-brand-600 shadow-card">
          <span class="i-ph-lightning-fill text-28px text-volt-400" />
        </div>
        <div>
          <div class="text-24px font-700 tracking-wide">强盛门店POS</div>
          <div class="text-13px text-white/55">收银端 · 前端原型</div>
        </div>
      </div>
      <div class="relative mt-8">
        <div class="qs-num text-56px font-600 leading-none">{{ clock.slice(11, 16) }}</div>
        <div class="mt-2 text-15px text-white/60">{{ clock.slice(0, 10) }} {{ weekdayOf(clock.slice(0, 10)) }} · 北京时间</div>
      </div>

      <div class="relative mt-8 text-13px font-600 text-white/50">选择门店</div>
      <div class="relative mt-2 flex flex-col gap-2">
        <button
          v-for="s in stores ?? []"
          :key="s.id"
          type="button"
          class="pos-press flex items-center gap-3 rounded-14px border px-4 py-3 text-left"
          :class="session.storeId === s.id ? 'border-volt-400 bg-white/10' : 'border-white/10 bg-white/4 hover:bg-white/8'"
          @click="pickStore(s.id)"
        >
          <span class="i-ph-storefront-fill text-24px" :class="session.storeId === s.id ? 'text-volt-400' : 'text-white/45'" />
          <span class="min-w-0 flex-1">
            <span class="block text-16px font-600">{{ s.name }}</span>
            <span class="block text-12px text-white/50">{{ s.code }} · {{ s.city }}{{ s.district }} · {{ s.registers.length }}台收银机</span>
          </span>
          <span
            class="rounded-6px px-1.5 py-px text-12px font-600"
            :class="s.mode === 'direct' ? 'bg-brand-500/30 text-[#9BE7DC]' : 'bg-volt-400/20 text-volt-300'"
          >
            {{ STORE_MODE[s.mode].label }}
          </span>
        </button>
      </div>

      <div class="relative mt-auto flex items-start gap-2 pt-4 text-12px leading-19px text-white/45">
        <DemoBadge kind="data" dark />
        <span>不做离线、不接扫码枪和打印机，数据存在本机浏览器。门店名册和账号都是演示数据。</span>
      </div>
    </aside>

    <main class="flex min-w-0 flex-1 flex-col gap-4 p-6">
      <div
        v-if="notice"
        class="flex items-center gap-2 rounded-12px px-4 py-2.5 text-14px"
        :class="notice.tone === 'ok' ? 'bg-[#E8F7EE] text-[#166534]' : 'bg-[#FDF3E3] text-[#92400E]'"
      >
        <span :class="notice.tone === 'ok' ? 'i-ph-check-circle-fill' : 'i-ph-info-fill'" class="text-18px" />{{ notice.text }}
      </div>

      <div v-if="store">
        <div class="mb-2 text-15px font-600">收银台</div>
        <div class="flex gap-3">
          <button
            v-for="r in store.registers"
            :key="r.no"
            type="button"
            class="pos-press flex min-w-220px items-center gap-3 rounded-14px border-2 bg-white px-4 py-3 text-left"
            :class="session.registerNo === r.no ? 'border-brand-600 shadow-card' : 'border-line hover:border-brand-300'"
            @click="session.registerNo = r.no"
          >
            <span class="i-ph-desktop-tower-fill text-28px" :class="session.registerNo === r.no ? 'text-brand-600' : 'text-t3'" />
            <span class="leading-tight">
              <span class="block text-16px font-600">{{ r.name }}</span>
              <span v-if="shiftOnRegister(r.no)" class="block text-12px text-warn">
                {{ nameOf(shiftOnRegister(r.no)!.cashierJobNo) }} {{ timeOf(shiftOnRegister(r.no)!.openedAt) }}开班，当班中
              </span>
              <span v-else class="block text-12px text-ok">空闲，可开班</span>
            </span>
          </button>
          <div class="flex items-center gap-1 text-12px text-t3">收银台号是否由主数据下发 <PendingTag id="待确认-01" /></div>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-[1fr_400px] gap-4">
        <section class="qs-card flex min-h-0 flex-col p-5">
          <div class="mb-3 flex items-center justify-between">
            <div class="text-15px font-600">选择账号</div>
            <div class="text-12px text-t3">演示PIN统一是 1234</div>
          </div>
          <div class="qs-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto">
            <button
              v-for="a in accounts"
              :key="a.jobNo"
              type="button"
              class="pos-press flex items-center gap-3 rounded-14px border-2 px-4 py-3 text-left"
              :class="jobNo === a.jobNo ? 'border-brand-600 bg-brand-50' : 'border-line bg-white hover:border-brand-300'"
              @click="pickAccount(a.jobNo)"
            >
              <span class="qs-flex-center h-44px w-44px shrink-0 rounded-12px text-18px font-700" :class="jobNo === a.jobNo ? 'bg-brand-600 text-white' : 'bg-subtle text-t2'">
                {{ a.name.slice(0, 1) }}
              </span>
              <span class="min-w-0 leading-tight">
                <span class="block text-16px font-600">{{ a.name }} <span class="qs-num text-13px font-500 text-t3">{{ a.jobNo }}</span></span>
                <span class="mt-0.5 block text-12px text-t2">{{ dutyText(a) }}</span>
                <span v-if="shiftOfPerson(a.jobNo)" class="mt-0.5 block text-12px text-warn">{{ shiftOfPerson(a.jobNo)!.registerNo }}号收银台当班中</span>
                <span v-else-if="!can(a, 'payment.collect')" class="mt-0.5 block text-12px text-t3">只开单、挂单，不开班</span>
              </span>
            </button>
          </div>
          <div class="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <span class="text-13px text-t3">或输入工号</span>
            <n-input v-model:value="jobNo" size="large" placeholder="例如 QS1002" class="max-w-220px" clearable @update:value="resetStep" />
          </div>
        </section>

        <section class="qs-card flex flex-col gap-3 p-5">
          <template v-if="!pendingUser">
            <div class="flex items-center justify-between">
              <div class="text-15px font-600">输入PIN</div>
              <div v-if="selected" class="text-13px text-t2">{{ selected.name }} · {{ selected.title }}</div>
            </div>
            <div class="flex h-56px items-center justify-center gap-4 rounded-14px border-2 border-brand-200 bg-subtle">
              <span
                v-for="i in 4"
                :key="i"
                class="h-16px w-16px rounded-full transition-colors"
                :class="pin.length >= i ? 'bg-brand-600' : 'bg-line-strong'"
              />
              <span v-if="pin.length > 4" class="qs-num text-13px text-t3">+{{ pin.length - 4 }}</span>
            </div>
            <NumPad v-model="pin" mode="int" :max-length="6" compact keyboard :confirm-text="busy ? '登录中' : '登录'" :confirm-disabled="busy" @confirm="login" />
          </template>

          <template v-else>
            <div class="flex items-center gap-3">
              <span class="qs-flex-center h-44px w-44px rounded-12px bg-volt-400 text-18px font-700 text-ink-900">{{ pendingUser.name.slice(0, 1) }}</span>
              <div class="leading-tight">
                <div class="text-16px font-700">{{ pendingUser.name }} 开班</div>
                <div class="text-12px text-t3">{{ store?.name }} · {{ session.registerNo }}号收银台</div>
              </div>
              <n-button quaternary size="small" class="ml-auto" @click="resetStep">换账号</n-button>
            </div>
            <div class="rounded-14px border-2 border-brand-200 px-4 py-2">
              <div class="text-13px text-t3">备用金</div>
              <div class="qs-num h-42px text-36px font-700 leading-42px">¥{{ floatText || '0' }}</div>
            </div>
            <div class="flex items-center gap-2 text-12px text-t3">
              <span>演示金额</span>
              <button
                v-for="q in [0, 200, 500, 1000]"
                :key="q"
                type="button"
                class="pos-press rounded-8px border border-line bg-white px-2.5 py-1 qs-num text-14px text-t1 hover:border-brand-400"
                @click="floatText = String(q)"
              >
                ¥{{ q }}
              </button>
            </div>
            <NumPad v-model="floatText" mode="money" compact keyboard :confirm-text="busy ? '开班中' : '开班'" :confirm-disabled="busy || !floatText" @confirm="openShift" />
            <div class="text-12px leading-18px text-t3">班次只说明这一班的现金和备用金，交班时按「备用金 + 现金收款 − 现金退款」核对实点现金。</div>
          </template>

          <n-alert v-if="err" type="error" :bordered="false">
            <div class="font-600">{{ err.message }}</div>
            <div v-if="err.basis" class="mt-0.5 text-12px opacity-80">{{ err.basis }}</div>
            <n-button v-if="err.fix" size="small" type="primary" secondary class="mt-2" @click="err.fix.run(); err = null">{{ err.fix.label }}</n-button>
          </n-alert>
          <div v-if="session.user && session.shiftNo" class="mt-auto flex items-center gap-1.5 text-12px text-t3">
            上次登录：{{ session.user.name }} · 班次 <BillNo :no="session.shiftNo" plain />
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
