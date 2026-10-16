import type { DateTimeText } from './common'

/** 门店只有直营和加盟两种，加盟为代销 */
export type StoreMode = 'direct' | 'franchise'

/** 库存位置。直营是门店微仓，加盟是代销仓，都记在强盛账上 */
export interface LogicalWarehouseRef {
  /** 中枢逻辑仓编码，ERP 定稿格式 LWH+6位 */
  code: string
  name: string
  kind: 'micro' | 'consignment'
}

export interface Register {
  /** 收银台号只在本店内区分，是否由主数据下发见【待确认-01】 */
  no: string
  name: string
}

export interface Store {
  id: string
  /** 上游门店编码，原型用占位码，见【待确认-42】 */
  code: string
  name: string
  city: string
  district: string
  address: string
  mode: StoreMode
  franchiseeId?: string
  warehouse: LogicalWarehouseRef
  registers: Register[]
  /** 临时停接开关：盘点或停业时不接自提和代发，不改合同上的「参与路由」 */
  pausedForRouting: boolean
  openHours: string
}

export interface Franchisee {
  id: string
  code: string
  name: string
  contact: string
  storeIds: string[]
}

/** 区域仓等中枢履约节点，只用于展示 OMS 的路由结果 */
export interface FulfilmentNode {
  code: string
  name: string
  kind: 'regional' | 'store'
}

/**
 * 职责，不是已定稿的角色名，见《8.角色权限原则》§一。
 * 演示账号按兼岗组合多个职责，兼岗不扩大数据范围。
 */
export type Duty =
  | 'guide'
  | 'cashier'
  | 'storeManager'
  | 'hqOps'
  | 'finance'
  | 'franchiseAdmin'
  | 'franchiseFinance'
  | 'sysAdmin'

export interface Employee {
  id: string
  /** 工号，业绩归属主键。登录名可以不同 */
  jobNo: string
  name: string
  duties: Duty[]
  /** 授权到店的门店 */
  storeIds: string[]
  /** 加盟商账号只落在本加盟商 */
  franchiseeId?: string
  /** 财务查看加盟结算需按加盟商单独授权 */
  settlementFranchiseeIds?: string[]
  employer: 'qs' | 'franchisee'
  /** 演示 PIN */
  pin: string
  title: string
  active: boolean
  createdAt: DateTimeText
}

/** 登录后拿到的员工信息，不含 PIN */
export type SessionUser = Omit<Employee, 'pin'>
