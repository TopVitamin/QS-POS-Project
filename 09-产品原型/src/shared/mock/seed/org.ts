import type { Employee, Franchisee, FulfilmentNode, Store } from '../../types'

/**
 * 门店名册是演示数据（【待确认-42】【待确认-50】）。万象天地店沿用叙事店名，
 * 其余三家是为了演示直营和加盟两种模式虚构的。门店编码、逻辑仓编码都是占位码。
 * 地址由主数据下发，原型不编。
 */
export const STORES: Store[] = [
  {
    id: 's01',
    code: 'DEMO01',
    name: '万象天地店',
    city: '深圳',
    district: '南山区',
    address: '',
    mode: 'direct',
    warehouse: { code: 'LWH000101', name: '万象天地店门店微仓', kind: 'micro' },
    registers: [
      { no: '01', name: '1号收银台' },
      { no: '02', name: '2号收银台' },
    ],
    pausedForRouting: false,
    openHours: '10:00-22:00',
  },
  {
    id: 's02',
    code: 'DEMO02',
    name: '科技园店',
    city: '深圳',
    district: '南山区',
    address: '',
    mode: 'direct',
    warehouse: { code: 'LWH000102', name: '科技园店门店微仓', kind: 'micro' },
    registers: [{ no: '01', name: '1号收银台' }],
    pausedForRouting: false,
    openHours: '10:00-22:00',
  },
  {
    id: 's03',
    code: 'DEMO03',
    name: '松山湖店',
    city: '东莞',
    district: '松山湖',
    address: '',
    mode: 'franchise',
    franchiseeId: 'fa',
    warehouse: { code: 'LWH000201', name: '松山湖店代销仓', kind: 'consignment' },
    registers: [{ no: '01', name: '1号收银台' }],
    pausedForRouting: false,
    openHours: '10:00-22:00',
  },
  {
    id: 's04',
    code: 'DEMO04',
    name: '千灯湖店',
    city: '佛山',
    district: '南海区',
    address: '',
    mode: 'franchise',
    franchiseeId: 'fb',
    warehouse: { code: 'LWH000202', name: '千灯湖店代销仓', kind: 'consignment' },
    registers: [{ no: '01', name: '1号收银台' }],
    pausedForRouting: false,
    openHours: '10:00-22:00',
  },
]

export const FRANCHISEES: Franchisee[] = [
  { id: 'fa', code: 'DEMOJA', name: '演示加盟商甲（东莞）', contact: '', storeIds: ['s03'] },
  { id: 'fb', code: 'DEMOJB', name: '演示加盟商乙（佛山）', contact: '', storeIds: ['s04'] },
]

/** 阶段5的五个区域仓来自公司背景，逻辑仓编码是占位码 */
export const NODES: FulfilmentNode[] = [
  { code: 'LWH000001', name: '深圳主仓', kind: 'regional' },
  { code: 'LWH000002', name: '嘉兴区域仓', kind: 'regional' },
  { code: 'LWH000003', name: '天津区域仓', kind: 'regional' },
  { code: 'LWH000004', name: '成都区域仓', kind: 'regional' },
  { code: 'LWH000005', name: '武汉区域仓', kind: 'regional' },
]

const created = '2026-09-20 09:00:00'

/** 演示账号，和《前端设计说明》5.3 一致。姓名都是演示数据，不对应背景人物 */
export const EMPLOYEES: Employee[] = [
  { id: 'e01', jobNo: 'QS1001', name: '王海', duties: ['storeManager', 'cashier', 'guide'], storeIds: ['s01'], employer: 'qs', pin: '1234', title: '店长', active: true, createdAt: created },
  { id: 'e02', jobNo: 'QS1002', name: '李雨桐', duties: ['cashier', 'guide'], storeIds: ['s01'], employer: 'qs', pin: '1234', title: '收银员', active: true, createdAt: created },
  { id: 'e03', jobNo: 'QS1003', name: '张一鸣', duties: ['guide'], storeIds: ['s01'], employer: 'qs', pin: '1234', title: '导购', active: true, createdAt: created },
  { id: 'e04', jobNo: 'QS2001', name: '刘佳', duties: ['storeManager', 'cashier', 'guide'], storeIds: ['s02'], employer: 'qs', pin: '1234', title: '店长', active: true, createdAt: created },
  { id: 'e05', jobNo: 'QS9001', name: '陈思远', duties: ['hqOps'], storeIds: ['s01', 's02'], employer: 'qs', pin: '1234', title: '总部运营', active: true, createdAt: created },
  {
    id: 'e06',
    jobNo: 'QS9002',
    name: '周静',
    duties: ['finance'],
    storeIds: ['s01', 's02'],
    settlementFranchiseeIds: ['fa', 'fb'],
    employer: 'qs',
    pin: '1234',
    title: '财务',
    active: true,
    createdAt: created,
  },
  // 主数据和日志也按授权到店看，不到「全部未来新店」（《8.角色权限原则》§二），演示时授权四家店
  { id: 'e07', jobNo: 'SYS001', name: '林晓', duties: ['sysAdmin'], storeIds: ['s01', 's02', 's03', 's04'], employer: 'qs', pin: '1234', title: '系统管理', active: true, createdAt: created },
  { id: 'e08', jobNo: 'JMA001', name: '赵磊', duties: ['franchiseAdmin'], storeIds: ['s03'], franchiseeId: 'fa', employer: 'franchisee', pin: '1234', title: '加盟商管理', active: true, createdAt: created },
  { id: 'e09', jobNo: 'JMA002', name: '吴婷', duties: ['franchiseFinance'], storeIds: ['s03'], franchiseeId: 'fa', employer: 'franchisee', pin: '1234', title: '加盟商财务', active: true, createdAt: created },
  { id: 'e10', jobNo: 'JMA101', name: '孙浩', duties: ['storeManager', 'cashier', 'guide'], storeIds: ['s03'], franchiseeId: 'fa', employer: 'franchisee', pin: '1234', title: '店长（加盟商员工）', active: true, createdAt: created },
  { id: 'e11', jobNo: 'JMB001', name: '何欣', duties: ['franchiseAdmin'], storeIds: ['s04'], franchiseeId: 'fb', employer: 'franchisee', pin: '1234', title: '加盟商管理', active: true, createdAt: created },
  { id: 'e12', jobNo: 'JMB101', name: '郑凯', duties: ['storeManager', 'cashier', 'guide'], storeIds: ['s04'], franchiseeId: 'fb', employer: 'franchisee', pin: '1234', title: '店长（加盟商员工）', active: true, createdAt: created },
]
