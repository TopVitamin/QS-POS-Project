<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { DUTY, STORE_MODE } from '@/shared/config/labels'
import { canEnter, END_DUTIES, END_LABEL, scopeFranchiseeIds, scopeStoreIds, type AppEnd } from '@/shared/config/permissions'
import type { Duty, SessionUser } from '@/shared/types'
import { todayBizDate, weekdayOf } from '@/shared/utils/time'

/** 演示入口：不用组件库，只放三个端的入口、演示账号、演示路线和重置 */
const { data: employees } = useRequest(() => api.master.employees())
const { data: stores } = useRequest(() => api.master.stores())
const { data: franchisees } = useRequest(() => api.master.franchisees())
const { data: pickups } = useRequest(() => api.fulfil.pickups({ status: 'pending' }))
const { data: meta } = useRequest(() => api.master.meta())
const today = todayBizDate()

const ENDS: { key: AppEnd; href: string; icon: string; tint: string; tech: string; desc: string; pages: string; tip: string }[] = [
  {
    key: 'cashier',
    href: './cashier.html',
    icon: 'i-ph-desktop-tower-fill',
    tint: 'bg-ink-900 text-volt-400',
    tech: 'Naive UI · 收银机横屏',
    desc: '全屏、大按钮、大字号。开班之后开单、收款、出小票，核销自提和代客下单也在这里。',
    pages: '登录开班、开单、会员与券、支付、小票、自提核销、代客下单、退货、交易查询、交班',
    tip: '建议窗口 1366×768 及以上；店长在收银端当授权人，输工号和PIN确认',
  },
  {
    key: 'admin',
    href: './admin.html',
    icon: 'i-ph-squares-four-fill',
    tint: 'bg-brand-600 text-white',
    tech: 'Naive UI · PC 后台',
    desc: '总部和门店后台。按职责和授权到店的数据范围显示菜单、数据和按钮。',
    pages: '工作台、交易、履约、店务、库存、班次日结、加盟应缴与结算、主数据、操作日志、交易追溯、中枢模拟器',
    tip: '右上角切换演示身份；「中枢模拟器」代替中枢、OMS推进审核、路由、发运和核对',
  },
  {
    key: 'mobile',
    href: './mobile.html',
    icon: 'i-ph-device-mobile-fill',
    tint: 'bg-volt-400 text-ink-900',
    tech: 'Vant 4 · 店务 H5',
    desc: '店长、导购在手机上做店务和履约，不收款。',
    pages: '工作台、自提核销、履约、代客下单、库存、要货、收货、盘点、退仓、我的业绩、门店日报',
    tip: '桌面浏览器里按手机宽度居中显示；「我的」里切换演示身份',
  },
]

const ROUTES: { title: string; steps: string[] }[] = [
  {
    title: '收银开单到交班',
    steps: ['收银端选万象天地店、1号收银台，用 QS1002 李雨桐登录开班', '扫码或点商品开单，带会员和券看促销计算', '组合支付后出小票', '「交班」点现金、写差异说明后封班'],
  },
  {
    title: '自提核销',
    steps: ['收银端或移动端打开「自提核销」', '点下方演示用提货码，或手输下面列出的码', '核验通过后确认出库', '管理端「自提履约单」能看到已核销和锁定释放'],
  },
  {
    title: '核销被拒转代客单',
    steps: ['在万象天地店输入别家店的提货码，核验被拒', '按「转代客下单」，商品自动带入', '管理端「中枢模拟器」里路由、发货、签收', '移动端「履约 · 代客单」看到状态一路推进'],
  },
  {
    title: '要货到收货',
    steps: ['移动端用 QS1001 王海新建要货单', '管理端「中枢模拟器」审核通过、发运', '移动端「收货」按出库单逐行录实收', '数量对不上会另生差异单，交中枢处理'],
  },
  {
    title: '盘点和差异过账',
    steps: ['移动端「盘点」新建抽盘，选几个商品', '盲录实盘数后提交，系统算差异', '「差异过账」由授权人输工号和PIN', '中枢调账后，库存流水记为「盘点调账」'],
  },
  {
    title: '加盟店日结到结算',
    steps: [
      '收银端选松山湖店，用 JMA101 孙浩登录，把当班的班次交掉',
      '管理端切到 JMA101，「日结」封账今天，中枢按营业日生成应缴营业款',
      '切到 JMA002 吴婷「缴款登记」登记缴款，再到「中枢模拟器」核对到账',
      '「中枢模拟器」出一张演示结算单，JMA001 赵磊能看、能提异议',
    ],
  },
]

const ENDS_ORDER: AppEnd[] = ['cashier', 'mobile', 'admin']
const storeName = (id: string) => stores.value?.find((s) => s.id === id)?.name ?? id
const dutyText = (duties: Duty[]) => duties.map((d) => DUTY[d].label).join('、')

function scopeText(u: SessionUser) {
  const list = stores.value ?? []
  const parts = [scopeStoreIds(u, list).map(storeName).join('、')]
  if (u.settlementFranchiseeIds?.length && !u.franchiseeId) parts.push(`加盟结算另授权${scopeFranchiseeIds(u, franchisees.value ?? []).length}家加盟商`)
  if (u.duties.includes('sysAdmin')) parts.push('开账号、分配数据范围')
  return parts.filter(Boolean).join('；') || '-'
}

const groups = computed(() => {
  const list = (employees.value ?? []).filter((e) => e.active)
  return [
    { label: '直营门店', items: list.filter((e) => e.employer === 'qs' && (e.duties.includes('storeManager') || e.duties.includes('guide'))) },
    { label: '强盛总部', items: list.filter((e) => e.employer === 'qs' && !e.duties.includes('storeManager') && !e.duties.includes('guide')) },
    { label: '加盟商', items: list.filter((e) => e.employer === 'franchisee') },
  ]
})

const codesByStore = computed(() =>
  (stores.value ?? []).map((s) => ({ store: s, items: (pickups.value ?? []).filter((p) => p.storeId === s.id) })),
)

const resetting = ref(false)
const resetDone = ref(false)
async function reset() {
  if (!window.confirm('三个端共用的本地演示库会按种子重新生成，做过的开单、核销、日结都会清掉。确定重置？')) return
  resetting.value = true
  await api.master.reset()
  resetting.value = false
  resetDone.value = true
  window.setTimeout(() => (resetDone.value = false), 2400)
}
</script>

<template>
  <div class="min-h-screen bg-canvas text-t1">
    <header class="relative overflow-hidden bg-ink-900 text-white">
      <span class="i-ph-lightning-fill pointer-events-none absolute -right-10 -top-6 text-[340px] text-white/[0.035]" />
      <div class="relative mx-auto max-w-1200px px-6 pb-28 pt-8 md:px-10">
        <div class="flex items-center gap-3">
          <div class="qs-flex-center h-40px w-40px rounded-12px bg-brand-600 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]">
            <span class="i-ph-lightning-fill text-22px text-volt-400" />
          </div>
          <div class="leading-tight">
            <div class="text-16px font-700 tracking-wide">强盛门店POS</div>
            <div class="text-12px text-white/50">前端原型演示入口</div>
          </div>
          <div class="flex-1" />
          <span class="inline-flex items-center gap-1 rounded-full bg-volt-400 px-2.5 py-1 text-12px font-700 text-ink-900">
            <span class="i-ph-sparkle-fill" />全部是演示数据
          </span>
        </div>

        <h1 class="mt-12 max-w-820px text-32px font-700 leading-tight tracking-tight md:text-42px">
          一套工程，三个端，<span class="text-volt-400">同一份</span>演示数据
        </h1>
        <p class="mt-4 max-w-760px text-15px leading-26px text-white/65">
          收银端、管理端、移动端共用商品、订单、门店、会员等类型定义，以及 mock 数据和价格、促销计算。在一个端做的动作，另外两个端马上能看到。
          不做离线、不接外设，也不接支付通道、中枢和金蝶；背景文档没定的口径都标了【待确认】。
        </p>
        <div class="mt-6 flex flex-wrap gap-2 text-12px">
          <span class="rounded-full bg-white/8 px-3 py-1 text-white/75">营业日 <span class="qs-num">{{ today }}</span> {{ weekdayOf(today) }}</span>
          <span class="rounded-full bg-white/8 px-3 py-1 text-white/75">两家直营、两家加盟（代销）</span>
          <span class="rounded-full bg-white/8 px-3 py-1 text-white/75">演示PIN统一是 <span class="qs-num font-600 text-volt-300">1234</span></span>
          <span class="rounded-full bg-white/8 px-3 py-1 text-white/75">北京时间</span>
        </div>
      </div>
    </header>

    <main class="relative mx-auto -mt-20 max-w-1200px px-6 pb-16 md:px-10">
      <div class="grid gap-4 md:grid-cols-3">
        <a
          v-for="e in ENDS"
          :key="e.key"
          :href="e.href"
          class="group flex flex-col rounded-20px border border-line bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop"
        >
          <div class="flex items-center gap-3">
            <span class="qs-flex-center h-50px w-50px shrink-0 rounded-15px text-26px" :class="e.tint"><span :class="e.icon" /></span>
            <div class="min-w-0 leading-tight">
              <div class="text-19px font-700">{{ END_LABEL[e.key] }}</div>
              <div class="mt-0.5 text-12px text-t3">{{ e.tech }}</div>
            </div>
            <span class="i-ph-arrow-up-right-bold ml-auto text-18px text-t3 transition group-hover:text-brand-600" />
          </div>
          <p class="mt-4 text-14px leading-22px text-t2">{{ e.desc }}</p>
          <div class="mt-4 text-12px font-600 text-t3">给谁用</div>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            <span v-for="d in END_DUTIES[e.key]" :key="d" class="rounded-6px bg-brand-50 px-1.5 py-0.5 text-12px font-500 text-brand-700">{{ DUTY[d].label }}</span>
          </div>
          <div class="mt-4 text-12px font-600 text-t3">主要页面</div>
          <div class="mt-1 text-13px leading-21px text-t1">{{ e.pages }}</div>
          <div class="min-h-16px flex-1" />
          <div class="border-t border-line pt-3 text-12px leading-19px text-t3">{{ e.tip }}</div>
        </a>
      </div>

      <section class="mt-10">
        <div class="flex items-end justify-between gap-4">
          <div>
            <h2 class="text-20px font-700">演示路线</h2>
            <p class="mt-1 text-13px text-t3">六条核心流程，按顺序点就能走通。中枢、OMS和支付通道的回传由管理端「中枢模拟器」代替</p>
          </div>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div v-for="(r, i) in ROUTES" :key="r.title" class="qs-card px-4 py-4">
            <div class="flex items-center gap-2.5">
              <span class="qs-num qs-flex-center h-26px w-26px rounded-8px bg-ink-900 text-13px font-700 text-volt-400">{{ i + 1 }}</span>
              <span class="text-15px font-600">{{ r.title }}</span>
            </div>
            <ol class="mt-3 flex flex-col gap-1.5">
              <li v-for="(s, j) in r.steps" :key="j" class="flex gap-2 text-13px leading-20px text-t2">
                <span class="qs-num mt-0.5 h-16px w-16px shrink-0 rounded-full bg-subtle text-center text-11px leading-16px text-t3">{{ j + 1 }}</span>
                <span>{{ s }}</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section class="mt-10 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div class="qs-card overflow-hidden">
          <div class="px-5 pb-3 pt-4">
            <h2 class="text-18px font-700">演示账号</h2>
            <p class="mt-1 text-13px text-t3">PIN 都是 1234。数据范围一律按授权到店；加盟商账号只看本加盟商的店。姓名都是演示数据</p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-720px border-collapse text-13px">
              <thead>
                <tr class="bg-subtle text-left text-12px text-t3">
                  <th class="px-5 py-2 font-600">工号</th>
                  <th class="px-3 py-2 font-600">姓名 · 岗位</th>
                  <th class="px-3 py-2 font-600">职责</th>
                  <th class="px-3 py-2 font-600">数据范围</th>
                  <th class="px-5 py-2 font-600">能进的端</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="g in groups" :key="g.label">
                  <tr><td colspan="5" class="border-t border-line bg-canvas/60 px-5 py-1.5 text-12px font-600 text-t3">{{ g.label }}</td></tr>
                  <tr v-for="e in g.items" :key="e.jobNo" class="border-t border-line">
                    <td class="qs-num whitespace-nowrap px-5 py-2.5 font-600">{{ e.jobNo }}</td>
                    <td class="whitespace-nowrap px-3 py-2.5">{{ e.name }} <span class="text-t3">· {{ e.title }}</span></td>
                    <td class="whitespace-nowrap px-3 py-2.5 text-t2">{{ dutyText(e.duties) }}</td>
                    <td class="px-3 py-2.5 text-t2">{{ scopeText(e) }}</td>
                    <td class="whitespace-nowrap px-5 py-2.5">
                      <div class="flex gap-1">
                        <span
                          v-for="end in ENDS_ORDER"
                          :key="end"
                          class="whitespace-nowrap rounded-6px px-1.5 py-0.5 text-11px font-500"
                          :class="canEnter(e, end) ? 'bg-brand-50 text-brand-700' : 'bg-subtle text-t3 line-through decoration-t3/40'"
                        >{{ END_LABEL[end].replace('端', '') }}</span>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <div class="qs-card px-4 py-4">
            <h2 class="text-16px font-700">演示用提货码</h2>
            <p class="mt-1 text-12px leading-18px text-t3">各店待核销的码。演示捷径，正式系统里提货码只在顾客手机上；收银端和移动端的核销页也有一键核验</p>
            <div v-for="g in codesByStore" :key="g.store.id" class="mt-3 border-t border-line pt-3">
              <div class="flex items-center gap-1.5 text-13px font-600">
                {{ g.store.name }}
                <span class="rounded-4px px-1 text-11px font-500" :class="g.store.mode === 'direct' ? 'bg-brand-50 text-brand-700' : 'bg-[#FDF3E3] text-[#92400E]'">{{ STORE_MODE[g.store.mode].label }}</span>
              </div>
              <div v-if="g.items.length" class="mt-1.5 flex flex-wrap gap-1.5">
                <span v-for="p in g.items" :key="p.omsNo" class="qs-num rounded-8px bg-subtle px-2 py-0.5 text-14px font-600 tracking-wider" :title="p.items.map((i) => `${i.name}×${i.qty}`).join('、')">{{ p.pickupCode }}</span>
              </div>
              <div v-else class="mt-1 text-12px text-t3">没有待核销的自提单</div>
            </div>
          </div>

          <div class="qs-card px-4 py-4">
            <h2 class="text-16px font-700">演示数据</h2>
            <p class="mt-1 text-12px leading-18px text-t3">
              存在浏览器本地，三个端共用；跨天打开会按当天重新生成。生成于
              <template v-if="meta"><span class="qs-num">{{ meta.seededAt.slice(0, 10) }}</span> <span class="qs-num">{{ meta.seededAt.slice(11) }}</span></template>
              <template v-else>-</template>
            </p>
            <button
              type="button"
              class="mt-3 inline-flex h-36px items-center gap-1.5 rounded-10px border border-line-strong px-3 text-13px font-600 text-t1 hover:border-bad hover:text-bad disabled:opacity-50"
              :disabled="resetting"
              @click="reset"
            >
              <span class="i-ph-arrow-counter-clockwise-bold" />{{ resetting ? '重置中…' : '重置演示数据' }}
            </button>
            <span v-if="resetDone" class="ml-2 text-12px text-ok">已重置</span>
          </div>
        </div>
      </section>

      <footer class="mt-10 border-t border-line pt-4 text-12px leading-20px text-t3">
        业务口径以仓库里的《01-全局背景信息》1–12 篇为准，页面清单、权限矩阵和【待确认】登记见《09-产品原型/前端设计说明.md》。
        门店、员工、商品、价格和交易都是演示数据，不是强盛的真实数据。
      </footer>
    </main>
  </div>
</template>
