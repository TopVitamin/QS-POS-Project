import type { BizDate, Cents, DateTimeText, HubSync, PayMethod } from './common'
import type { PromotionType } from './product'

/** 支付流水，附在销售或退货上。以通道结果为准 */
export interface Payment {
  id: string
  method: PayMethod
  amount: Cents
  status: 'success' | 'pending' | 'failed'
  /** 通道流水号，原样保存；现金没有 */
  channelTxnNo?: string
  /** 现金：顾客实付和找零 */
  tendered?: Cents
  change?: Cents
  createdAt: DateTimeText
  /** 查单后才变成成功的，记查单时间 */
  queriedAt?: DateTimeText
  /** 已经原路退回的金额 */
  refunded: Cents
}

export interface AppliedPromotion {
  promotionId: string
  code: string
  name: string
  type: PromotionType | 'coupon'
  discount: Cents
  lineNos: number[]
}

export interface SaleLine {
  lineNo: number
  sku: string
  /** 名称、规格、条码都是成交时的快照 */
  name: string
  spec: string
  barcode: string
  qty: number
  /** 下发零售价快照 */
  unitPrice: Cents
  listAmount: Cents
  promoDiscount: Cents
  orderDiscount: Cents
  couponDiscount: Cents
  manualDiscount: Cents
  payable: Cents
  promoIds: string[]
  sns: string[]
  /** 行级导购工号 */
  guideJobNo: string
  returnedQty: number
  refundedAmount: Cents
}

/** 改价留痕：原价、新价、原因、授权人 */
export interface PriceAdjustment {
  lineNo: number
  sku: string
  before: Cents
  after: Cents
  reason: string
  operatorJobNo: string
  authorizerJobNo: string
  at: DateTimeText
}

export interface SaleTotals {
  list: Cents
  promo: Cents
  order: Cents
  coupon: Cents
  manual: Cents
  payable: Cents
}

/** POS 销售单：门店执行记录。库存是否扣减看中枢是否接受 */
export interface SaleOrder {
  no: string
  storeId: string
  registerNo: string
  shiftNo: string
  bizDate: BizDate
  createdAt: DateTimeText
  cashierJobNo: string
  guideJobNo: string
  memberId?: string
  lines: SaleLine[]
  promotions: AppliedPromotion[]
  couponIds: string[]
  adjustments: PriceAdjustment[]
  totals: SaleTotals
  payments: Payment[]
  status: 'paid' | 'partially_returned' | 'returned'
  hubSync: HubSync
  dailyCloseNo?: string
}

export interface ReturnLine {
  lineNo: number
  sku: string
  name: string
  spec: string
  qty: number
  refund: Cents
  sns: string[]
}

/**
 * 进行中的结算：点「结算」时中枢确认过可用量，收齐款才生成销售单。
 * 放在共用库里，是因为交班和日结要检查有没有结果不明、没收完的结算。
 */
export interface Checkout {
  id: string
  storeId: string
  registerNo: string
  shiftNo: string
  cashierJobNo: string
  createdAt: DateTimeText
  payable: Cents
  payments: Payment[]
  /** 撤销时原路退回的流水 */
  refunds: Payment[]
  status: 'open' | 'completed' | 'cancelled'
  saleNo?: string
  cancelledAt?: DateTimeText
  cancelReason?: string
}

/** 退货单：引用原销售单，库存回到本店微仓或代销仓 */
export interface ReturnOrder {
  no: string
  storeId: string
  registerNo: string
  shiftNo: string
  originalSaleNo: string
  bizDate: BizDate
  createdAt: DateTimeText
  operatorJobNo: string
  guideJobNo: string
  reason: string
  lines: ReturnLine[]
  refunds: Payment[]
  total: Cents
  hubSync: HubSync
  dailyCloseNo?: string
}
