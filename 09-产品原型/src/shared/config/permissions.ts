import type { Duty, Employee, Franchisee, Store } from '../types'

/**
 * 职责 × 功能矩阵。与《前端设计说明》5.2 一一对应，改一处要同步另一处。
 * do 可以操作；view 只读；auth 可以发起但要授权人确认；none 不可见。
 */
export type Perm =
  | 'sale.open'
  | 'member.use'
  | 'price.adjust'
  | 'payment.collect'
  | 'return.create'
  | 'return.noReceipt'
  | 'pickup.verify'
  | 'agent.create'
  | 'performance.self'
  | 'shift.handover'
  | 'daily.close'
  | 'storeops.manage'
  | 'storeops.view'
  | 'stocktake.manage'
  | 'stocktake.post'
  | 'authorize'
  | 'inventory.view'
  | 'trade.view'
  | 'fulfil.view'
  | 'shift.view'
  | 'dues.view'
  | 'remit.register'
  | 'remit.view'
  | 'settlement.view'
  | 'settlement.dispute'
  | 'settlement.viewAll'
  | 'master.view'
  | 'audit.view'
  | 'system.accounts'

export type Level = 'do' | 'view' | 'auth' | 'none'

export const DUTY_ORDER: Duty[] = [
  'guide',
  'cashier',
  'storeManager',
  'hqOps',
  'finance',
  'franchiseAdmin',
  'franchiseFinance',
  'sysAdmin',
]

export interface MatrixRow {
  label: string
  /** 某职责在这一行的级别不是 none 时，就拥有 perms 里的全部权限 */
  perms: Perm[]
  levels: Partial<Record<Duty, Level>>
  note?: string
}

export const MATRIX: MatrixRow[] = [
  { label: '开单、挂单、取单', perms: ['sale.open'], levels: { guide: 'do' } },
  { label: '会员识别、用券', perms: ['member.use'], levels: { guide: 'do', cashier: 'do' } },
  { label: '改价', perms: ['price.adjust'], levels: { guide: 'auth', cashier: 'auth' }, note: '加盟店不开放改价，见【待确认-34】' },
  { label: '收款、查单', perms: ['payment.collect'], levels: { cashier: 'do' } },
  { label: '有原单退货、退款', perms: ['return.create'], levels: { cashier: 'do' } },
  { label: '无原单退货、反结账', perms: ['return.noReceipt'], levels: { cashier: 'auth' }, note: '原型未开放' },
  { label: '自提核销', perms: ['pickup.verify'], levels: { guide: 'do' } },
  { label: '代客下单', perms: ['agent.create'], levels: { guide: 'do' } },
  { label: '本人业绩归属', perms: ['performance.self'], levels: { guide: 'view' } },
  { label: '交班', perms: ['shift.handover'], levels: { cashier: 'do' } },
  { label: '日结封账', perms: ['daily.close'], levels: { storeManager: 'do' }, note: '执行人见【待确认-55】' },
  {
    label: '要货、收货、退仓',
    perms: ['storeops.view'],
    levels: { storeManager: 'do', hqOps: 'view', franchiseAdmin: 'view' },
  },
  { label: '盘点录入和提交', perms: ['storeops.view'], levels: { storeManager: 'do', hqOps: 'view', franchiseAdmin: 'view' } },
  { label: '盘点差异过账', perms: ['stocktake.post'], levels: { storeManager: 'auth' } },
  { label: '担任授权人（改价、盘点差异过账）', perms: ['authorize'], levels: { storeManager: 'do', hqOps: 'do' }, note: '层级见【待确认-51】' },
  {
    label: '门店库存（可用、锁定、在途）',
    perms: ['inventory.view'],
    levels: { guide: 'view', cashier: 'view', storeManager: 'view', hqOps: 'view', franchiseAdmin: 'view' },
  },
  {
    label: '销售单、退货单、支付流水',
    perms: ['trade.view'],
    levels: {
      cashier: 'view',
      storeManager: 'view',
      hqOps: 'view',
      finance: 'view',
      franchiseAdmin: 'view',
      franchiseFinance: 'view',
    },
  },
  {
    label: '自提履约单、代客单',
    perms: ['fulfil.view'],
    levels: { guide: 'view', storeManager: 'view', hqOps: 'view', franchiseAdmin: 'view' },
  },
  {
    label: '班次、日结',
    perms: ['shift.view'],
    levels: { storeManager: 'view', hqOps: 'view', finance: 'view', franchiseAdmin: 'view', franchiseFinance: 'view' },
  },
  { label: '应缴营业款', perms: ['dues.view'], levels: { finance: 'view', franchiseAdmin: 'view', franchiseFinance: 'view' } },
  { label: '缴款登记', perms: ['remit.view'], levels: { finance: 'view', franchiseAdmin: 'do', franchiseFinance: 'do' } },
  {
    label: '加盟结算单、提异议',
    perms: ['settlement.view'],
    levels: { finance: 'view', franchiseAdmin: 'do', franchiseFinance: 'do' },
  },
  { label: '查看全部加盟商结算', perms: ['settlement.viewAll'], levels: { finance: 'auth' }, note: '按加盟商单独授权' },
  {
    label: '主数据',
    perms: ['master.view'],
    levels: {
      storeManager: 'view',
      hqOps: 'view',
      finance: 'view',
      franchiseAdmin: 'view',
      franchiseFinance: 'view',
      sysAdmin: 'view',
    },
  },
  {
    label: '操作日志、交易追溯',
    perms: ['audit.view'],
    levels: {
      storeManager: 'view',
      hqOps: 'view',
      finance: 'view',
      franchiseAdmin: 'view',
      franchiseFinance: 'view',
      sysAdmin: 'view',
    },
  },
  { label: '账号与数据范围', perms: ['system.accounts'], levels: { sysAdmin: 'do' } },
]

/** 「办」级别额外带上的操作权限 */
const DO_EXTRA: Partial<Record<string, Perm[]>> = {
  '要货、收货、退仓': ['storeops.manage'],
  '盘点录入和提交': ['stocktake.manage'],
  '缴款登记': ['remit.register'],
  '加盟结算单、提异议': ['settlement.dispute'],
}

function permsOfDuty(duty: Duty): Set<Perm> {
  const set = new Set<Perm>()
  for (const row of MATRIX) {
    const level = row.levels[duty] ?? 'none'
    if (level === 'none') continue
    row.perms.forEach((p) => set.add(p))
    if (level === 'do') DO_EXTRA[row.label]?.forEach((p) => set.add(p))
  }
  return set
}

const PERMS_BY_DUTY = new Map<Duty, Set<Perm>>(DUTY_ORDER.map((d) => [d, permsOfDuty(d)]))

/** 权限判断只看职责和授权范围，不需要 PIN */
type Who = Pick<Employee, 'duties' | 'storeIds' | 'franchiseeId' | 'settlementFranchiseeIds'>

export function can(user: Pick<Employee, 'duties'> | null | undefined, perm: Perm): boolean {
  if (!user) return false
  return user.duties.some((d) => PERMS_BY_DUTY.get(d)?.has(perm))
}

/** 数据范围：加盟商账号只看本加盟商的店；其他账号按授权到店 */
export function scopeStoreIds(user: Who | null | undefined, stores: Store[]): string[] {
  if (!user) return []
  if (user.franchiseeId && (user.duties.includes('franchiseAdmin') || user.duties.includes('franchiseFinance'))) {
    return stores.filter((s) => s.franchiseeId === user.franchiseeId).map((s) => s.id)
  }
  return stores.filter((s) => user.storeIds.includes(s.id)).map((s) => s.id)
}

/** 能看到哪些加盟商的应缴和结算。财务要按加盟商单独授权 */
export function scopeFranchiseeIds(user: Who | null | undefined, franchisees: Franchisee[]): string[] {
  if (!user) return []
  const ids = new Set<string>()
  if (user.franchiseeId) ids.add(user.franchiseeId)
  user.settlementFranchiseeIds?.forEach((id) => ids.add(id))
  return franchisees.filter((f) => ids.has(f.id)).map((f) => f.id)
}

/**
 * 履约列表（自提单、代客单）展不展示顾客字段。核销只核验门店、有效期和是否已核销，用不到顾客信息；
 * 加盟店列表里的手机号能不能脱敏后展示见【待确认-52】，定之前不展示（《8.角色权限原则》§二）
 */
export function listsCustomer(store: Pick<Store, 'mode'> | null | undefined): boolean {
  return store?.mode === 'direct'
}

/** 授权人：有授权职责，且门店在其数据范围内 */
export function canAuthorizeFor(user: Who | null | undefined, storeId: string, stores: Store[]): boolean {
  return can(user, 'authorize') && scopeStoreIds(user, stores).includes(storeId)
}

export const LEVEL_TEXT: Record<Level, string> = { do: '办', view: '看', auth: '授', none: '-' }

export type AppEnd = 'cashier' | 'mobile' | 'admin'

/**
 * 三个端各给哪些职责用（设计说明5.1），兼岗的账号有一个职责能进就能进。
 * 店长在收银端只当授权人，输工号和PIN确认，不用登录收银端
 */
export const END_DUTIES: Record<AppEnd, Duty[]> = {
  cashier: ['guide', 'cashier'],
  mobile: ['guide', 'storeManager'],
  admin: ['storeManager', 'hqOps', 'finance', 'franchiseAdmin', 'franchiseFinance', 'sysAdmin'],
}

export const END_LABEL: Record<AppEnd, string> = { cashier: '收银端', mobile: '移动端', admin: '管理端' }

export function canEnter(user: Pick<Employee, 'duties'> | null | undefined, end: AppEnd): boolean {
  return !!user && user.duties.some((d) => END_DUTIES[end].includes(d))
}
