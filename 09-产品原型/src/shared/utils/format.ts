import type { Cents } from '../types'

/** 空值统一显示 */
export const EMPTY = '-'

const money = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const unit = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))

/** 金额：分 → ¥1,234.00。sign 为 true 时正数带 + */
export function formatMoney(cents: Cents | null | undefined, opts: { sign?: boolean; symbol?: boolean } = {}): string {
  if (isBlank(cents)) return EMPTY
  const value = cents as number
  const symbol = opts.symbol === false ? '' : '¥'
  const sign = value < 0 ? '-' : opts.sign && value > 0 ? '+' : ''
  return `${sign}${symbol}${money.format(Math.abs(value) / 100)}`
}

/** 单价：4位小数（编码规则§二的展示精度） */
export function formatUnitPrice(cents: Cents | null | undefined): string {
  if (isBlank(cents)) return EMPTY
  const value = cents as number
  return `${value < 0 ? '-' : ''}¥${unit.format(Math.abs(value) / 100)}`
}

/** 不带符号的金额数字，用于大号金额展示 */
export function moneyDigits(cents: Cents | null | undefined): string {
  if (isBlank(cents)) return EMPTY
  return money.format((cents as number) / 100)
}

export function formatInt(n: number | null | undefined): string {
  return isBlank(n) ? EMPTY : integer.format(n as number)
}

export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (isBlank(ratio) || !Number.isFinite(ratio as number)) return EMPTY
  return `${((ratio as number) * 100).toFixed(digits)}%`
}

/** 带编码的主数据按 Code-Name 展示 */
export function codeName(code?: string | null, name?: string | null): string {
  if (!code && !name) return EMPTY
  if (!code) return name as string
  if (!name) return code
  return `${code} ${name}`
}

/** 手机号脱敏：138****5678。脱敏规则见【待确认-52】 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return EMPTY
  if (phone.length < 7) return phone
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

/** 姓名脱敏：只留姓 */
export function maskName(name?: string | null): string {
  if (!name) return EMPTY
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(1, Math.min(2, name.length - 1)))}`
}

/** 收货地址只露前6个字，够判断大致区域 */
export function maskAddress(address?: string | null): string {
  if (!address) return EMPTY
  return address.length > 6 ? `${address.slice(0, 6)}****` : address
}

/** 提货码只露前3位：还能用的码只给顾客，后台不展示全码 */
export function maskCode(code?: string | null): string {
  if (!code) return EMPTY
  return `${code.slice(0, 3)}***`
}

/** 空字符串、null、undefined 都显示 - */
export function orEmpty(v: string | number | null | undefined): string {
  return isBlank(v) || v === '' ? EMPTY : String(v)
}

/** 元（用户输入）→ 分。非法输入返回 null */
export function yuanToCents(input: string | number | null | undefined): Cents | null {
  if (input === null || input === undefined || input === '') return null
  const n = typeof input === 'number' ? input : Number(String(input).replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function centsToYuan(cents: Cents): number {
  return Math.round(cents) / 100
}
