import type { BizDate, ByMethod, Cents, DateTimeText, PendingId } from './common'

/**
 * 应缴营业款：中枢按加盟店营业日生成。POS 只读，不在店里改数。
 * 只含本店向顾客收的销售净额，按支付方式分开；线上已付款的订单不进来。
 */
export interface FranchiseDue {
  no: string
  storeId: string
  franchiseeId: string
  bizDate: BizDate
  dailyCloseNo: string
  byMethod: ByMethod
  total: Cents
  generatedAt: DateTimeText
  status: 'unpaid' | 'registered' | 'confirmed'
  remittanceNo?: string
}

/** 缴款记录：加盟商登记，中枢核对 */
export interface Remittance {
  no: string
  franchiseeId: string
  dueNos: string[]
  amount: Cents
  method: string
  voucherNo: string
  registeredAt: DateTimeText
  registrantJobNo: string
  status: 'pending' | 'confirmed'
  confirmedAt?: DateTimeText
  note?: string
}

export interface SettlementLine {
  key: string
  label: string
  /** null 表示规则未定、不出金额 */
  amount: Cents | null
  pending?: PendingId[]
  note: string
}

/** 加盟结算单：放在中枢还是金蝶见【待确认-38】。POS 只读，不付款 */
export interface FranchiseSettlement {
  no: string
  franchiseeId: string
  periodStart: BizDate
  periodEnd: BizDate
  generatedAt: DateTimeText
  lines: SettlementLine[]
  status: 'issued' | 'disputed'
  disputes: { at: DateTimeText; byJobNo: string; note: string }[]
}
