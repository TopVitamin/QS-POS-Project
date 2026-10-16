import type { Cents, DateTimeText } from './common'

export interface FulfilmentItem {
  sku: string
  name: string
  spec: string
  qty: number
}

/**
 * 自提履约单：OMS 下发到本店的投影。POS 不改商品和数量，不生成提货码。
 * 状态是演示枚举，正式取值以后续字段清单为准。
 */
export interface PickupOrder {
  omsNo: string
  /** 小程序订单号，普通外部单号 */
  channelOrderNo: string
  channel: 'miniapp'
  storeId: string
  /** 动态提货码，按中枢原值保存。位数和刷新频率留给后续设计 */
  pickupCode: string
  lock: {
    /** locked：中枢锁定有效；released：锁定已释放或失效 */
    status: 'locked' | 'released'
    lockNo: string
    lockedAt: DateTimeText
  }
  items: FulfilmentItem[]
  /** 列表只放完成提货用得到的信息，手机号脱敏见【待确认-52】 */
  customer: { name: string; phone: string }
  /** 线上已付金额，门店不再收钱，也不进加盟应缴 */
  paidAmount: Cents
  createdAt: DateTimeText
  /** pending 待核销；verified 已核销；expired 中枢已判过期（截止规则见【待确认-04】） */
  status: 'pending' | 'verified' | 'expired'
  verifiedAt?: DateTimeText
  verificationNo?: string
  verifierJobNo?: string
  hubResultNo?: string
}

export type VerifyRejectReason = 'not_found' | 'store_mismatch' | 'already_verified' | 'expired' | 'lock_invalid'

/** 核销记录：成功和被拒都留。成功的才发核销单号，被拒的只留记录 */
export interface VerificationRecord {
  id: string
  no?: string
  omsNo?: string
  pickupCode: string
  storeId: string
  result: 'success' | 'rejected'
  reason?: VerifyRejectReason
  operatorJobNo: string
  at: DateTimeText
}

/**
 * 代客单：POS 发起，OMS 路由，WMS 执行区域仓部分。
 * POS 不选履约节点和承运商，只展示 OMS 回来的结果。
 */
export interface AgentOrder {
  no: string
  storeId: string
  guideJobNo: string
  creatorJobNo: string
  source: 'cashier' | 'mobile' | 'pickup_rejected'
  sourceRef?: string
  customer: { name: string; phone: string; address: string }
  items: (FulfilmentItem & { unitPrice: Cents })[]
  /** 参考金额，按下发零售价。收款时点见【待确认-06】，原型不收款 */
  referenceAmount: Cents
  note?: string
  createdAt: DateTimeText
  status: 'submitted' | 'routed' | 'shipped' | 'signed' | 'cancelled'
  oms: {
    omsNo?: string
    nodeName?: string
    /** warehouse 区域仓；store 被选为代发的门店。POS不选节点 */
    nodeKind?: 'warehouse' | 'store'
    nodeStoreId?: string
    carrier?: string
    trackingNo?: string
    routedAt?: DateTimeText
    shippedAt?: DateTimeText
    signedAt?: DateTimeText
    rejectNote?: string
  }
}
