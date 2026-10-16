import type { BizDate, ByMethod, Cents, DateTimeText } from './common'

export interface MethodSummary {
  sales: Cents
  refunds: Cents
}

export interface ShiftSummary {
  saleCount: number
  returnCount: number
  byMethod: ByMethod<MethodSummary>
  /** 应有现金 = 备用金 + 现金收款 - 现金退款 */
  expectedCash: Cents
}

/** 班次：只说明这一班的现金和备用金，不产生库存 */
export interface Shift {
  no: string
  storeId: string
  registerNo: string
  cashierJobNo: string
  bizDate: BizDate
  openedAt: DateTimeText
  float: Cents
  status: 'open' | 'closed'
  closedAt?: DateTimeText
  summary?: ShiftSummary
  countedCash?: Cents
  cashDiff?: Cents
  diffNote?: string
}

export interface DailySummary {
  saleCount: number
  returnCount: number
  gross: Cents
  refunds: Cents
  net: Cents
  byMethod: ByMethod<MethodSummary>
  /** 核销和代客单只计件数，不计入成交净额 */
  pickupsVerified: number
  agentOrders: number
}

/** 日结单：营业日封账记录。直营店到此为止，加盟店由此触发中枢生成应缴 */
export interface DailyClose {
  no: string
  storeId: string
  bizDate: BizDate
  closedAt: DateTimeText
  closerJobNo: string
  shiftNos: string[]
  summary: DailySummary
  franchiseDueNo?: string
}
