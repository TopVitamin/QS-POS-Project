import type { Cents, DateTimeText } from './common'

export interface Category {
  /** 演示分类编码，每级两位。正式编码以上游主数据为准 */
  code: string
  name: string
  parentCode?: string
  /** Phosphor 图标类名，只用于展示 */
  icon?: string
}

export interface Product {
  /** 沿用 ERP 商品编码，POS 不按门店重编。演示 SKU 是占位码 */
  sku: string
  name: string
  spec: string
  /** 三级分类编码 */
  categoryCode: string
  barcodes: string[]
  /** 统一零售价（含税），由上游下发，POS 只读 */
  price: Cents
  /** 是否采集序列号。哪些品类强制见【待确认-11】，这里是演示配置 */
  snRequired: boolean
  status: 'active' | 'disabled'
  /** 卡片配色，只用于展示 */
  tone: string
}

export type PromotionType = 'special_price' | 'nth_discount' | 'threshold_reduction'

/**
 * 下发到店的促销。来源系统见【待确认-46】，类型和叠加规则见【待确认-53】。
 * 原型只实现三种演示类型。
 */
export interface Promotion {
  id: string
  code: string
  name: string
  type: PromotionType
  /** 行级促销按 SKU 或三级分类命中；整单满减按 SKU/分类圈定参与商品，空表示全场 */
  skus?: string[]
  categoryPrefixes?: string[]
  /** 单品特价 */
  specialPrice?: Cents
  /** 第 N 件折扣：每满 N 件，第 N 件按 rate% 计价 */
  nth?: number
  nthRatePercent?: number
  /** 满减 */
  threshold?: Cents
  reduction?: Cents
  storeIds: 'all' | string[]
  startAt: DateTimeText
  endAt: DateTimeText
  status: 'active' | 'ended'
}

export interface CouponTemplate {
  id: string
  name: string
  /** 门槛，0 表示无门槛 */
  threshold: Cents
  amount: Cents
}
