import type { DateTimeText } from './common'

/** 中枢逻辑库存在本店的投影。可用 = 账面 - 锁定。在途不算可用 */
export interface StockRecord {
  storeId: string
  sku: string
  onHand: number
  locked: number
  inTransit: number
}

export type LedgerType = 'sale' | 'return' | 'pickup' | 'receipt' | 'stocktake' | 'return_wh'

/** 门店库存流水：回传，不是可售真相。对不上时以中枢已接受的结果为准 */
export interface StockLedger {
  id: string
  storeId: string
  sku: string
  type: LedgerType
  change: number
  balanceAfter: number
  refNo: string
  at: DateTimeText
}

export interface SkuQtyLine {
  sku: string
  name: string
  spec: string
  qty: number
}

/** 要货单：申请。审核和调拨指令都在中枢，审核人见【待确认-48】 */
export interface Replenishment {
  no: string
  storeId: string
  createdAt: DateTimeText
  creatorJobNo: string
  lines: SkuQtyLine[]
  note: string
  status: 'reviewing' | 'rejected' | 'approved' | 'shipped' | 'received'
  hub: {
    reviewedAt?: DateTimeText
    reviewNote?: string
    sourceNodeName?: string
    outboundNo?: string
    shippedAt?: DateTimeText
  }
}

/** 中枢调拨出库单在本店的投影。单号按中枢原样保存 */
export interface InboundShipment {
  outboundNo: string
  storeId: string
  sourceNodeName: string
  replenishmentNo?: string
  lines: SkuQtyLine[]
  shippedAt: DateTimeText
  status: 'in_transit' | 'received'
  receiptNo?: string
}

export interface ReceiptLine {
  sku: string
  name: string
  spec: string
  shippedQty: number
  receivedQty: number
}

/** 收货单：门店执行记录，必须指回来源出库单 */
export interface GoodsReceipt {
  no: string
  storeId: string
  outboundNo: string
  receivedAt: DateTimeText
  operatorJobNo: string
  lines: ReceiptLine[]
  discrepancyNo?: string
  hubResultNo: string
}

/** 差异单：实收和出库不一致时另记，在途短少和破损的责任见【待确认-22】 */
export interface Discrepancy {
  no: string
  storeId: string
  receiptNo: string
  outboundNo: string
  lines: (ReceiptLine & { diff: number })[]
  createdAt: DateTimeText
  operatorJobNo: string
  status: 'submitted' | 'handled'
}

export interface StocktakeLine {
  sku: string
  name: string
  spec: string
  /** 建单时的账面快照 */
  bookQty: number
  countedQty: number | null
}

/** 盘点单：差异授权之前不改可售数量，授权后由中枢调账 */
export interface Stocktake {
  no: string
  storeId: string
  scope: 'full' | 'partial'
  createdAt: DateTimeText
  creatorJobNo: string
  status: 'counting' | 'submitted' | 'adjusted'
  lines: StocktakeLine[]
  submittedAt?: DateTimeText
  authorizerJobNo?: string
  authorizedAt?: DateTimeText
  hubResultNo?: string
  /** 加盟店是共同盘点：只记事实，不出赔偿金额（【待确认-23】） */
  joint: boolean
  note?: string
}

/** 退仓单：门店退回区域仓。加盟店的残次滞销也走这里，不返货款 */
export interface ReturnToWarehouse {
  no: string
  storeId: string
  createdAt: DateTimeText
  creatorJobNo: string
  reason: string
  lines: SkuQtyLine[]
  status: 'submitted' | 'approved' | 'shipped'
  hub: { approvedAt?: DateTimeText; targetNodeName?: string; shippedAt?: DateTimeText }
}
