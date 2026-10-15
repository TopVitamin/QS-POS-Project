import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

/** 页面清单见设计说明3.2；meta.tab 的四页显示底部标签 */
const pages: RouteRecordRaw[] = [
  { path: 'home', name: 'home', component: () => import('./pages/HomePage.vue'), meta: { title: '工作台', tab: true } },
  { path: 'fulfil', name: 'fulfil', component: () => import('./pages/FulfilPage.vue'), meta: { title: '履约', tab: true, perms: ['fulfil.view'] } },
  { path: 'stock', name: 'stock', component: () => import('./pages/StockPage.vue'), meta: { title: '库存', tab: true, perms: ['inventory.view'] } },
  { path: 'me', name: 'me', component: () => import('./pages/MePage.vue'), meta: { title: '我的', tab: true } },

  { path: 'pickup', name: 'pickup', component: () => import('./pages/PickupPage.vue'), meta: { title: '自提核销', perms: ['pickup.verify'] } },
  { path: 'agent/new', name: 'agent-new', component: () => import('./pages/AgentNewPage.vue'), meta: { title: '代客下单', perms: ['agent.create'] } },
  { path: 'stock/:sku', name: 'stock-detail', component: () => import('./pages/StockDetailPage.vue'), meta: { title: '库存详情', perms: ['inventory.view'] } },
  { path: 'replenish', name: 'replenish', component: () => import('./pages/ReplenishPage.vue'), meta: { title: '要货', perms: ['storeops.view'] } },
  { path: 'replenish/new', name: 'replenish-new', component: () => import('./pages/ReplenishNewPage.vue'), meta: { title: '新建要货单', perms: ['storeops.manage'] } },
  { path: 'receive', name: 'receive', component: () => import('./pages/ReceivePage.vue'), meta: { title: '收货', perms: ['storeops.view'] } },
  { path: 'receive/:no', name: 'receive-detail', component: () => import('./pages/ReceiveDetailPage.vue'), meta: { title: '按出库单收货', perms: ['storeops.view'] } },
  { path: 'stocktake', name: 'stocktake', component: () => import('./pages/StocktakePage.vue'), meta: { title: '盘点', perms: ['storeops.view'] } },
  { path: 'stocktake/:no', name: 'stocktake-detail', component: () => import('./pages/StocktakeDetailPage.vue'), meta: { title: '盘点单', perms: ['storeops.view'] } },
  { path: 'return-wh', name: 'return-wh', component: () => import('./pages/ReturnWhPage.vue'), meta: { title: '退仓', perms: ['storeops.view'] } },
  { path: 'performance', name: 'performance', component: () => import('./pages/PerformancePage.vue'), meta: { title: '我的业绩', perms: ['performance.self'] } },
  { path: 'daily', name: 'daily', component: () => import('./pages/DailyPage.vue'), meta: { title: '门店日报', perms: ['shift.view'] } },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./layouts/MobileLayout.vue'), redirect: '/home', children: pages },
    { path: '/:rest(.*)*', redirect: '/home' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
