import type {
  AgentOrder,
  AuditLog,
  BizDate,
  Category,
  Checkout,
  CouponTemplate,
  DailyClose,
  DateTimeText,
  Discrepancy,
  Employee,
  Franchisee,
  FranchiseDue,
  FranchiseSettlement,
  FulfilmentNode,
  GoodsReceipt,
  InboundShipment,
  Member,
  PickupOrder,
  Product,
  Promotion,
  Remittance,
  Replenishment,
  ReturnOrder,
  ReturnToWarehouse,
  SaleOrder,
  Shift,
  StockLedger,
  StockRecord,
  Stocktake,
  Store,
  VerificationRecord,
} from '../types'

export type PayOutcome = 'success' | 'pending' | 'failed'

/** 浏览器本地的一份演示库。三个端读写同一份 */
export interface DemoDb {
  schema: number
  /** 种子按哪一天生成。换天后自动重新生成，保证演示数据总是「今天」 */
  seedDate: BizDate
  seededAt: DateTimeText

  stores: Store[]
  franchisees: Franchisee[]
  nodes: FulfilmentNode[]
  employees: Employee[]
  categories: Category[]
  products: Product[]
  promotions: Promotion[]
  couponTemplates: CouponTemplate[]
  members: Member[]

  stock: StockRecord[]
  ledger: StockLedger[]

  sales: SaleOrder[]
  returns: ReturnOrder[]
  checkouts: Checkout[]

  pickups: PickupOrder[]
  verifications: VerificationRecord[]
  agentOrders: AgentOrder[]

  replenishments: Replenishment[]
  shipments: InboundShipment[]
  receipts: GoodsReceipt[]
  discrepancies: Discrepancy[]
  stocktakes: Stocktake[]
  returnsToWarehouse: ReturnToWarehouse[]

  shifts: Shift[]
  dailyCloses: DailyClose[]

  dues: FranchiseDue[]
  remittances: Remittance[]
  settlements: FranchiseSettlement[]

  auditLogs: AuditLog[]

  /** 单号计数器，键是 前缀-日期 */
  counters: Record<string, number>
  /** 中枢按来源单号去重：来源键 → 中枢结果单号 */
  hubProcessed: Record<string, string>
  /** 演示开关 */
  sim: {
    /** 下一笔非现金支付的通道结果，用一次后回到成功 */
    nextPayResult: PayOutcome
  }
}

/** 种子或结构变了就加一，浏览器里的旧库会按新种子重新生成 */
export const SCHEMA_VERSION = 3
