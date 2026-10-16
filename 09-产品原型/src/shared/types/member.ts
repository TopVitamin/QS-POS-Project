import type { DateTimeText } from './common'

export interface MemberCoupon {
  id: string
  templateId: string
  status: 'unused' | 'used'
  expireAt: DateTimeText
  usedOrderNo?: string
}

/**
 * 会员一期只做到店识别和基础券、积分核销。
 * 档案放在哪个系统、是否跨店共享见【待确认-37】，原型只识别本店会员。
 */
export interface Member {
  id: string
  phone: string
  name: string
  level: string
  /** 积分只展示，不抵扣、不累计，见【待确认-54】 */
  points: number
  storeId: string
  coupons: MemberCoupon[]
  joinedAt: DateTimeText
}
