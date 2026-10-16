<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type RouteMeta } from 'vue-router'
import { useDialog, type MenuOption } from 'naive-ui'
import { api } from '@/shared/api'
import { DUTY } from '@/shared/config/labels'
import { scopeFranchiseeIds, scopeStoreIds } from '@/shared/config/permissions'
import { useFeedback } from '@/shared/naive/feedback'
import DemoBadge from '@/shared/naive/DemoBadge.vue'
import type { SessionUser } from '@/shared/types'
import { todayBizDate, weekdayOf } from '@/shared/utils/time'
import { pages } from '../router'
import { useAdmin } from '../stores/session'

const admin = useAdmin()
const route = useRoute()
const router = useRouter()
const dialog = useDialog()
const fb = useFeedback()

const allowed = (meta: RouteMeta | undefined) => !meta?.perms || meta.perms.some((p) => admin.has(p))
const menuPages = computed(() => pages.filter((r) => r.meta?.icon && allowed(r.meta)))

const menuOptions = computed<MenuOption[]>(() => {
  const groups = new Map<string, MenuOption[]>()
  for (const r of menuPages.value) {
    const meta = r.meta!
    const item: MenuOption = {
      key: r.name as string,
      label: () => h(RouterLink, { to: { name: r.name } }, { default: () => meta.title }),
      icon: () => h('span', { class: `${meta.icon} text-18px` }),
    }
    const list = groups.get(meta.group!) ?? []
    list.push(item)
    groups.set(meta.group!, list)
  }
  return [...groups].flatMap(([group, children]) =>
    group === '工作台' ? children : [{ type: 'group', key: `group-${group}`, label: group, children }],
  )
})
const activeKey = computed(() => (route.meta.menu ?? route.name) as string)

/** 换了身份或者直接改地址，当前页没有权限就去第一个有权限的页 */
const pageAllowed = computed(() => admin.ready && !!admin.user && allowed(route.meta))
watch(
  [() => admin.ready, () => admin.user?.jobNo, () => route.name],
  () => {
    if (!admin.ready || pageAllowed.value) return
    const first = menuPages.value[0]
    router.replace({ name: (first?.name as string) ?? 'system-roles' })
  },
  { immediate: true },
)

const content = ref<{ scrollTo: (opt: { top: number }) => void } | null>(null)
watch(() => route.fullPath, () => content.value?.scrollTo({ top: 0 }))

const today = todayBizDate()

function scopeText(u: SessionUser) {
  const stores = admin.stores ?? []
  const storeNames = scopeStoreIds(u, stores).map((id) => stores.find((s) => s.id === id)!.name)
  const franchisees = scopeFranchiseeIds(u, admin.franchisees ?? [])
  const parts: string[] = []
  if (u.duties.includes('sysAdmin')) parts.push('账号和数据范围；主数据和日志只读')
  if (storeNames.length) parts.push(storeNames.join('、'))
  if (u.settlementFranchiseeIds?.length && !u.franchiseeId) parts.push(`加盟结算：${franchisees.length}家加盟商已单独授权`)
  return parts.join('；') || '-'
}

const accountGroups = computed(() => {
  const list = admin.accounts
  return [
    { label: '强盛总部', items: list.filter((e) => e.employer === 'qs' && !e.duties.includes('storeManager')) },
    { label: '直营门店', items: list.filter((e) => e.employer === 'qs' && e.duties.includes('storeManager')) },
    { label: '加盟商', items: list.filter((e) => e.employer === 'franchisee') },
  ]
})
const showSwitch = ref(false)
function switchTo(jobNo: string) {
  admin.switchTo(jobNo)
  showSwitch.value = false
  fb.message.success(`已切换为 ${admin.who(jobNo)}`)
}

const dutyText = (u: SessionUser) => u.duties.map((d) => DUTY[d].label).join('·')

function resetDemo() {
  dialog.warning({
    title: '重置演示数据',
    content: '三个端共用的本地演示库会按种子重新生成，刚才做过的开单、核销、日结都会清掉。',
    positiveText: '重置',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.master.reset()
      fb.ok('演示数据已重置')
    },
  })
}
</script>

<template>
  <n-layout has-sider position="absolute">
    <n-layout-sider inverted :width="232" :native-scrollbar="false" content-style="display: flex; flex-direction: column; min-height: 100%">
      <div class="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <div class="qs-flex-center h-36px w-36px rounded-10px bg-brand-600 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]">
          <span class="i-ph-lightning-fill text-20px text-volt-400" />
        </div>
        <div class="leading-tight">
          <div class="text-15px font-700 tracking-wide text-white">强盛门店POS</div>
          <div class="text-12px text-white/50">管理端 · 总部与门店后台</div>
        </div>
      </div>
      <n-menu :options="menuOptions" :value="activeKey" inverted :indent="16" :root-indent="14" class="admin-menu flex-1 px-1" />
      <div class="mx-3 mb-4 mt-3 flex flex-col gap-1 rounded-12px bg-white/5 p-2 text-13px">
        <a href="./cashier.html" target="_blank" class="flex items-center gap-2 rounded-8px px-2 py-1.5 text-white/70 hover:bg-white/8 hover:text-white">
          <span class="i-ph-desktop-tower-fill text-white/50" />收银端<span class="i-ph-arrow-square-out-bold ml-auto text-12px text-white/30" />
        </a>
        <a href="./mobile.html" target="_blank" class="flex items-center gap-2 rounded-8px px-2 py-1.5 text-white/70 hover:bg-white/8 hover:text-white">
          <span class="i-ph-device-mobile-fill text-white/50" />移动端店务<span class="i-ph-arrow-square-out-bold ml-auto text-12px text-white/30" />
        </a>
        <a href="./index.html" class="flex items-center gap-2 rounded-8px px-2 py-1.5 text-white/70 hover:bg-white/8 hover:text-white">
          <span class="i-ph-house-fill text-white/50" />演示入口
        </a>
      </div>
    </n-layout-sider>

    <n-layout>
      <n-layout-header bordered position="absolute" class="flex items-center gap-3 px-6" style="height: 56px">
        <div class="flex min-w-0 items-center gap-2 text-14px">
          <span class="text-t3">{{ route.meta.group }}</span>
          <span v-if="route.meta.group !== route.meta.title" class="i-ph-caret-right-bold text-12px text-t3" />
          <span v-if="route.meta.group !== route.meta.title" class="font-600 text-t1">{{ route.meta.title }}</span>
        </div>
        <div class="flex-1" />
        <span class="qs-num text-13px text-t3">营业日 {{ today }} {{ weekdayOf(today) }}</span>
        <DemoBadge kind="data" />
        <n-button quaternary size="small" @click="resetDemo">
          <template #icon><span class="i-ph-arrow-counter-clockwise-bold" /></template>
          重置演示数据
        </n-button>
        <n-popover v-model:show="showSwitch" trigger="click" placement="bottom-end" :show-arrow="false" style="padding: 0; width: 420px">
          <template #trigger>
            <button type="button" class="flex items-center gap-2.5 rounded-10px border border-line py-1 pl-1 pr-2.5 hover:border-brand-300 hover:bg-brand-50/60">
              <span class="qs-flex-center h-32px w-32px rounded-8px bg-ink-900 text-14px font-700 text-volt-400">{{ admin.user?.name.slice(0, 1) }}</span>
              <span class="text-left leading-tight">
                <span class="block text-14px font-600">{{ admin.user?.name ?? '-' }} <span class="qs-num text-12px font-500 text-t3">{{ admin.user?.jobNo }}</span></span>
                <span class="block text-12px text-t3">{{ admin.user?.title }}</span>
              </span>
              <span class="i-ph-user-switch-bold ml-1 text-16px text-t3" />
            </button>
          </template>
          <div class="border-b border-line px-4 py-3">
            <div class="text-14px font-600">切换演示身份</div>
            <div class="mt-0.5 text-12px text-t3">菜单、数据范围和按钮按职责变化。演示切换不校验PIN；只有导购、收银职责的账号用收银端和移动端</div>
          </div>
          <div class="qs-scroll max-h-480px overflow-y-auto px-2 py-2">
            <template v-for="g in accountGroups" :key="g.label">
              <div class="px-2 pb-1 pt-2 text-12px font-600 text-t3">{{ g.label }}</div>
              <button
                v-for="e in g.items"
                :key="e.jobNo"
                type="button"
                class="flex w-full items-start gap-2.5 rounded-10px px-2 py-2 text-left hover:bg-brand-50"
                :class="e.jobNo === admin.user?.jobNo ? 'bg-brand-50' : ''"
                @click="switchTo(e.jobNo)"
              >
                <span class="qs-flex-center mt-0.5 h-30px w-30px shrink-0 rounded-8px text-13px font-700" :class="e.jobNo === admin.user?.jobNo ? 'bg-brand-600 text-white' : 'bg-subtle text-t2'">{{ e.name.slice(0, 1) }}</span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5 text-14px">
                    <span class="font-600">{{ e.name }}</span>
                    <span class="qs-num text-12px text-t3">{{ e.jobNo }}</span>
                    <span class="text-12px text-t2">{{ dutyText(e) }}</span>
                  </span>
                  <span class="block truncate text-12px text-t3">{{ scopeText(e) }}</span>
                </span>
                <span v-if="e.jobNo === admin.user?.jobNo" class="i-ph-check-bold mt-1 text-brand-600" />
              </button>
            </template>
          </div>
        </n-popover>
      </n-layout-header>

      <n-layout-content ref="content" position="absolute" style="top: 56px" :native-scrollbar="false" content-style="padding: 20px 24px 40px">
        <router-view v-if="pageAllowed" v-slot="{ Component }">
          <component :is="Component" :key="`${admin.user?.jobNo}-${route.path}`" />
        </router-view>
        <div v-else class="py-24 text-center"><n-spin /></div>
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<style scoped>
.admin-menu :deep(.n-menu-item-group-title) {
  padding-top: 14px;
  font-size: 12px;
  letter-spacing: 0.04em;
}
</style>
