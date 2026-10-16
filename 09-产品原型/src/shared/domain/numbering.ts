import type { BizDate, DateTimeText } from '../types'
import { compactDate } from '../utils/time'

/**
 * 单号前缀用《6.编码规则》§1.2 的建议前缀，正式值见【待确认-01】。
 * 页面上单号旁要标「演示前缀」。
 */
export const BILL_PREFIX = {
  sale: 'MDXS',
  return: 'MDTH',
  agent: 'DKXD',
  verification: 'ZTHX',
  replenish: 'MDYH',
  receipt: 'MDSH',
  discrepancy: 'SHCY',
  stocktake: 'MDPD',
  returnWh: 'MDTC',
  transfer: 'MDDB',
  shift: 'BC',
  dailyClose: 'RJ',
  due: 'YJYK',
  settlement: 'JMJS',
  lossComp: 'PKPC',
} as const

export type BillKind = keyof typeof BILL_PREFIX

/** {前缀}-{YYYYMMDD}-{序号}：同类型同一天从0001起，超过9999扩成5位 */
export function formatBillNo(prefix: string, date: BizDate | DateTimeText, seq: number): string {
  return `${prefix}-${compactDate(date)}-${String(seq).padStart(4, '0')}`
}

/** 取下一个号并推进计数器。作废后不重用，所以计数器只增不减 */
export function nextBillNo(counters: Record<string, number>, kind: BillKind, date: BizDate | DateTimeText): string {
  const prefix = BILL_PREFIX[kind]
  const key = `${prefix}-${compactDate(date)}`
  const seq = (counters[key] ?? 0) + 1
  counters[key] = seq
  return formatBillNo(prefix, date, seq)
}

/**
 * 中枢、OMS、WMS 那一侧的号，原型用 HUB 开头的演示号，不代表 ERP 单据类型
 * （【待确认-01】【待确认-14】）。格式和 POS 单号故意不同，避免混淆。
 */
export const HUB_PREFIX = {
  result: 'HUB',
  oms: 'HUBOMS',
  outbound: 'HUBCK',
  lock: 'HUBSD',
} as const

export type HubKind = keyof typeof HUB_PREFIX

export function nextHubNo(counters: Record<string, number>, kind: HubKind, date: BizDate | DateTimeText): string {
  const prefix = HUB_PREFIX[kind]
  const key = `${prefix}#${compactDate(date)}`
  const seq = (counters[key] ?? 0) + 1
  counters[key] = seq
  return `${prefix}${compactDate(date)}${String(seq).padStart(6, '0')}`
}

const PREFIXES = new Set<string>(Object.values(BILL_PREFIX))

/** 是不是 POS 自己的单号（用来决定是否显示「演示前缀」） */
export function isPosBillNo(no: string | undefined | null): boolean {
  if (!no) return false
  const prefix = no.split('-')[0]
  return PREFIXES.has(prefix)
}
