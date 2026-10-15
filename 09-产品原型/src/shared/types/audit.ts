import type { DateTimeText } from './common'

/** 《4.全局业务规则》§七 列出的必须留痕动作，加上原型里的几类辅助动作 */
export type AuditAction =
  | '改价'
  | '退货'
  | '核销成功'
  | '核销拒绝'
  | '代客下单'
  | '收货差异'
  | '盘点审核'
  | '交班差异'
  | '日结封账'
  | '加盟缴款登记'
  | '结算异议'
  | '支付查单'
  | '撤销收款'
  | '重复回传'

export interface AuditLog {
  id: string
  action: AuditAction
  at: DateTimeText
  operatorJobNo: string
  storeId?: string
  objectType: string
  objectNo: string
  before?: string
  after?: string
  reason?: string
  authorizerJobNo?: string
}
