import type { Duty, LedgerType, PayMethod, StoreMode, VerifyRejectReason } from '../types'

/**
 * 状态和枚举的中文文案。都是原型演示枚举，正式取值以后续字段清单为准。
 * tone 对应 Naive 的 tag type；移动端按同名映射到 Vant。
 */
export type Tone = 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary'

export interface LabelDef {
  label: string
  tone: Tone
}

export const STORE_MODE: Record<StoreMode, LabelDef> = {
  direct: { label: '直营', tone: 'primary' },
  franchise: { label: '加盟', tone: 'warning' },
}

export const PAY_METHOD: Record<PayMethod, { label: string; short: string; icon: string }> = {
  cash: { label: '现金', short: '现金', icon: 'i-ph-money-fill' },
  wechat: { label: '微信支付', short: '微信', icon: 'i-ph-wechat-logo-fill' },
  alipay: { label: '支付宝', short: '支付宝', icon: 'i-ph-qr-code-fill' },
  unionpay: { label: '银联卡', short: '银联', icon: 'i-ph-credit-card-fill' },
}

export const PAY_METHODS: PayMethod[] = ['cash', 'wechat', 'alipay', 'unionpay']

export const PAYMENT_STATUS: Record<'success' | 'pending' | 'failed', LabelDef> = {
  success: { label: '成功', tone: 'success' },
  pending: { label: '结果不明', tone: 'warning' },
  failed: { label: '失败', tone: 'error' },
}

export const SALE_STATUS: Record<'paid' | 'partially_returned' | 'returned', LabelDef> = {
  paid: { label: '已成交', tone: 'success' },
  partially_returned: { label: '部分退货', tone: 'warning' },
  returned: { label: '已全退', tone: 'default' },
}

export const HUB_SYNC: Record<'accepted' | 'rejected', LabelDef> = {
  accepted: { label: '中枢已接受', tone: 'success' },
  rejected: { label: '中枢拒绝', tone: 'error' },
}

export const PICKUP_STATUS: Record<'pending' | 'verified' | 'expired', LabelDef> = {
  pending: { label: '待核销', tone: 'info' },
  verified: { label: '已核销', tone: 'success' },
  expired: { label: '已过期', tone: 'default' },
}

export const VERIFY_REJECT: Record<VerifyRejectReason, { label: string; detail: string }> = {
  not_found: { label: '提货码不存在', detail: '中枢没有这张提货码的履约单，请核对顾客出示的码' },
  store_mismatch: { label: '门店不一致', detail: '这张提货单的自提门店不是本店，不能在本店出库' },
  already_verified: { label: '已经核销', detail: '同一提货码已经核销过，再次扫描不得再次扣减' },
  expired: { label: '提货码已过期', detail: '中枢已把这张提货单判为过期，截止规则见【待确认-04】' },
  lock_invalid: { label: '锁定无效', detail: '中枢没有有效的锁定记录，没有锁定成功的不能核销出库' },
}

export const AGENT_STATUS: Record<'submitted' | 'routed' | 'shipped' | 'signed' | 'cancelled', LabelDef> = {
  submitted: { label: '已提交OMS', tone: 'info' },
  routed: { label: '已路由', tone: 'primary' },
  shipped: { label: '已发货', tone: 'warning' },
  signed: { label: '已签收', tone: 'success' },
  cancelled: { label: '已取消', tone: 'default' },
}

export const REPLENISH_STATUS: Record<'reviewing' | 'rejected' | 'approved' | 'shipped' | 'received', LabelDef> = {
  reviewing: { label: '中枢审核中', tone: 'info' },
  rejected: { label: '已驳回', tone: 'error' },
  approved: { label: '已审核待发', tone: 'primary' },
  shipped: { label: '在途', tone: 'warning' },
  received: { label: '已收货', tone: 'success' },
}

export const SHIPMENT_STATUS: Record<'in_transit' | 'received', LabelDef> = {
  in_transit: { label: '在途待收', tone: 'warning' },
  received: { label: '已收货', tone: 'success' },
}

export const STOCKTAKE_STATUS: Record<'counting' | 'submitted' | 'adjusted', LabelDef> = {
  counting: { label: '盘点中', tone: 'info' },
  submitted: { label: '差异待授权', tone: 'warning' },
  adjusted: { label: '中枢已调账', tone: 'success' },
}

export const RTW_STATUS: Record<'submitted' | 'approved' | 'shipped', LabelDef> = {
  submitted: { label: '已提交', tone: 'info' },
  approved: { label: '中枢已同意', tone: 'primary' },
  shipped: { label: '已交运', tone: 'success' },
}

export const SHIFT_STATUS: Record<'open' | 'closed', LabelDef> = {
  open: { label: '当班中', tone: 'info' },
  closed: { label: '已交班', tone: 'success' },
}

export const DUE_STATUS: Record<'unpaid' | 'registered' | 'confirmed', LabelDef> = {
  unpaid: { label: '待缴', tone: 'warning' },
  registered: { label: '已登记待核对', tone: 'info' },
  confirmed: { label: '中枢已核对', tone: 'success' },
}

export const REMITTANCE_STATUS: Record<'pending' | 'confirmed', LabelDef> = {
  pending: { label: '待中枢核对', tone: 'info' },
  confirmed: { label: '已核对', tone: 'success' },
}

export const SETTLEMENT_STATUS: Record<'issued' | 'disputed', LabelDef> = {
  issued: { label: '已出单', tone: 'info' },
  disputed: { label: '有异议', tone: 'warning' },
}

export const LEDGER_TYPE: Record<LedgerType, string> = {
  sale: '进店销售',
  return: '销售退货',
  pickup: '自提核销',
  receipt: '收货',
  stocktake: '盘点调账',
  return_wh: '退仓',
}

export const DUTY: Record<Duty, { label: string; desc: string }> = {
  guide: { label: '导购', desc: '开单、核销、代客下单、查看自己的业绩归属' },
  cashier: { label: '收银', desc: '收款、退款、交班' },
  storeManager: { label: '店长', desc: '本店要货、收货、盘点、看本店日报' },
  hqOps: { label: '总部运营', desc: '看授权直营店的交易和店务，处理授权范围内的异常' },
  finance: { label: '财务', desc: '看日结、支付流水、加盟应缴和结算结果' },
  franchiseAdmin: { label: '加盟商管理', desc: '本加盟商的店、代销仓、应缴和结算' },
  franchiseFinance: { label: '加盟商财务', desc: '本加盟商的应缴、缴款和结算' },
  sysAdmin: { label: '系统管理', desc: '开通账号、分配数据范围' },
}

export const RETURN_REASONS = ['质量问题', '不想要了', '买错型号', '换货', '其他']
export const RTW_REASONS = ['残次', '滞销', '质量问题', '包装破损', '其他']
