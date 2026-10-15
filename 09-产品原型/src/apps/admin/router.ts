import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

/** 菜单按设计说明3.3分组；meta.icon 有值的才进菜单 */
export const pages: RouteRecordRaw[] = [
  { path: 'dashboard', name: 'dashboard', component: () => import('./pages/DashboardPage.vue'), meta: { title: '工作台', group: '工作台', icon: 'i-ph-squares-four-fill', perms: ['trade.view', 'storeops.view', 'dues.view', 'fulfil.view'] } },

  { path: 'sales', name: 'sales', component: () => import('./pages/trade/SalesPage.vue'), meta: { title: '销售单', group: '门店交易', icon: 'i-ph-receipt-fill', perms: ['trade.view'] } },
  { path: 'sales/:no', name: 'sale-detail', component: () => import('./pages/trade/SaleDetailPage.vue'), meta: { title: '销售单详情', group: '门店交易', menu: 'sales', perms: ['trade.view'] } },
  { path: 'returns', name: 'returns', component: () => import('./pages/trade/ReturnsPage.vue'), meta: { title: '退货单', group: '门店交易', icon: 'i-ph-arrow-u-up-left-bold', perms: ['trade.view'] } },
  { path: 'payments', name: 'payments', component: () => import('./pages/trade/PaymentsPage.vue'), meta: { title: '支付流水', group: '门店交易', icon: 'i-ph-credit-card-fill', perms: ['trade.view'] } },

  { path: 'pickups', name: 'pickups', component: () => import('./pages/fulfil/PickupsPage.vue'), meta: { title: '自提履约单', group: '到店履约', icon: 'i-ph-package-fill', perms: ['fulfil.view'] } },
  { path: 'agent-orders', name: 'agent-orders', component: () => import('./pages/fulfil/AgentOrdersPage.vue'), meta: { title: '代客单', group: '到店履约', icon: 'i-ph-truck-fill', perms: ['fulfil.view'] } },

  { path: 'replenishments', name: 'replenishments', component: () => import('./pages/storeops/ReplenishmentsPage.vue'), meta: { title: '要货单', group: '门店店务', icon: 'i-ph-clipboard-text-fill', perms: ['storeops.view'] } },
  { path: 'receipts', name: 'receipts', component: () => import('./pages/storeops/ReceiptsPage.vue'), meta: { title: '收货与差异', group: '门店店务', icon: 'i-ph-tray-arrow-down-fill', perms: ['storeops.view'] } },
  { path: 'stocktakes', name: 'stocktakes', component: () => import('./pages/storeops/StocktakesPage.vue'), meta: { title: '盘点单', group: '门店店务', icon: 'i-ph-list-checks-bold', perms: ['storeops.view'] } },
  { path: 'return-warehouse', name: 'return-warehouse', component: () => import('./pages/storeops/ReturnWarehousePage.vue'), meta: { title: '退仓单', group: '门店店务', icon: 'i-ph-arrow-bend-up-left-bold', perms: ['storeops.view'] } },
  { path: 'transfers', name: 'transfers', component: () => import('./pages/storeops/TransfersPage.vue'), meta: { title: '店间调拨', group: '门店店务', icon: 'i-ph-arrows-left-right-bold', perms: ['storeops.view'] } },

  { path: 'inventory', name: 'inventory', component: () => import('./pages/InventoryPage.vue'), meta: { title: '门店库存', group: '门店库存', icon: 'i-ph-stack-fill', perms: ['inventory.view'] } },

  { path: 'shifts', name: 'shifts', component: () => import('./pages/shift/ShiftsPage.vue'), meta: { title: '班次', group: '班次日结', icon: 'i-ph-clock-counter-clockwise-bold', perms: ['shift.view'] } },
  { path: 'daily-close', name: 'daily-close', component: () => import('./pages/shift/DailyClosePage.vue'), meta: { title: '日结', group: '班次日结', icon: 'i-ph-calendar-check-fill', perms: ['shift.view'] } },

  { path: 'franchise/dues', name: 'dues', component: () => import('./pages/franchise/DuesPage.vue'), meta: { title: '应缴营业款', group: '加盟结算', icon: 'i-ph-hand-coins-fill', perms: ['dues.view'] } },
  { path: 'franchise/remittances', name: 'remittances', component: () => import('./pages/franchise/RemittancesPage.vue'), meta: { title: '缴款登记', group: '加盟结算', icon: 'i-ph-bank-fill', perms: ['remit.view'] } },
  { path: 'franchise/settlements', name: 'settlements', component: () => import('./pages/franchise/SettlementsPage.vue'), meta: { title: '加盟结算单', group: '加盟结算', icon: 'i-ph-file-text-fill', perms: ['settlement.view'] } },

  { path: 'master/stores', name: 'master-stores', component: () => import('./pages/master/StoresPage.vue'), meta: { title: '门店', group: '主数据', icon: 'i-ph-storefront-fill', perms: ['master.view'] } },
  { path: 'master/products', name: 'master-products', component: () => import('./pages/master/ProductsPage.vue'), meta: { title: '商品与价格', group: '主数据', icon: 'i-ph-tag-fill', perms: ['master.view'] } },
  { path: 'master/promotions', name: 'master-promotions', component: () => import('./pages/master/PromotionsPage.vue'), meta: { title: '促销', group: '主数据', icon: 'i-ph-seal-percent-fill', perms: ['master.view'] } },
  { path: 'master/staff', name: 'master-staff', component: () => import('./pages/master/StaffPage.vue'), meta: { title: '导购与员工', group: '主数据', icon: 'i-ph-identification-card-fill', perms: ['master.view'] } },

  { path: 'audit/logs', name: 'audit-logs', component: () => import('./pages/audit/LogsPage.vue'), meta: { title: '操作日志', group: '审计', icon: 'i-ph-scroll-fill', perms: ['audit.view'] } },
  { path: 'audit/trace', name: 'audit-trace', component: () => import('./pages/audit/TracePage.vue'), meta: { title: '交易追溯', group: '审计', icon: 'i-ph-flow-arrow-bold', perms: ['audit.view'] } },

  // 这两页是演示说明和演示工具，不计入权限
  { path: 'system/roles', name: 'system-roles', component: () => import('./pages/system/RolesPage.vue'), meta: { title: '角色与数据范围', group: '系统', icon: 'i-ph-shield-check-fill' } },
  { path: 'system/hub', name: 'system-hub', component: () => import('./pages/system/HubPage.vue'), meta: { title: '中枢模拟器', group: '系统', icon: 'i-ph-cpu-fill' } },
]

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('./layouts/AdminLayout.vue'), redirect: '/dashboard', children: pages },
  { path: '/:rest(.*)*', redirect: '/dashboard' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
