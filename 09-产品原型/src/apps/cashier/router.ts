import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import type { Perm } from '@/shared/config/permissions'
import { useSession } from './stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** 有其中任一权限就能进 */
    perms?: Perm[]
    nav?: { label: string; icon: string }
  }
}

export const workRoutes: RouteRecordRaw[] = [
  { path: 'sale', name: 'sale', component: () => import('./pages/SalePage.vue'), meta: { perms: ['sale.open', 'payment.collect'], nav: { label: '收银', icon: 'i-ph-shopping-cart-simple-fill' } } },
  { path: 'pay', name: 'pay', component: () => import('./pages/PayPage.vue'), meta: { perms: ['payment.collect'] } },
  { path: 'done/:no', name: 'done', component: () => import('./pages/DonePage.vue'), meta: { perms: ['payment.collect'] } },
  { path: 'pickup', name: 'pickup', component: () => import('./pages/PickupPage.vue'), meta: { perms: ['pickup.verify'], nav: { label: '自提核销', icon: 'i-ph-package-fill' } } },
  { path: 'agent', name: 'agent', component: () => import('./pages/AgentPage.vue'), meta: { perms: ['agent.create'], nav: { label: '代客下单', icon: 'i-ph-truck-fill' } } },
  { path: 'return', name: 'return', component: () => import('./pages/ReturnPage.vue'), meta: { perms: ['return.create'], nav: { label: '退货', icon: 'i-ph-arrow-u-up-left-bold' } } },
  { path: 'orders', name: 'orders', component: () => import('./pages/OrdersPage.vue'), meta: { perms: ['trade.view'], nav: { label: '交易', icon: 'i-ph-receipt-fill' } } },
  { path: 'handover', name: 'handover', component: () => import('./pages/HandoverPage.vue'), meta: { perms: ['shift.handover'], nav: { label: '交班', icon: 'i-ph-clock-counter-clockwise-bold' } } },
]

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('./pages/LoginPage.vue') },
  { path: '/', component: () => import('./layouts/CashierLayout.vue'), redirect: '/sale', children: workRoutes },
  { path: '/:rest(.*)*', redirect: '/sale' },
]

export const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to) => {
  if (to.name === 'login') return true
  const session = useSession()
  if (!session.user) return { name: 'login' }
  // 有收银职责的必须在本人的班次里工作
  if (session.isCashier && !session.shiftNo) return { name: 'login' }
  const perms = to.meta.perms
  if (perms && !perms.some((p) => session.has(p))) {
    const first = workRoutes.find((r) => r.meta?.nav && r.meta.perms?.some((p) => session.has(p)))
    return first ? { name: first.name } : { name: 'login' }
  }
  return true
})
