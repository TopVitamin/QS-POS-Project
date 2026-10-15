import { describe, expect, it } from 'vitest'
import type { CouponTemplate, Promotion } from '../types'
import { activePromotions, allocate, priceCart, type PricingLineInput } from './pricing'

const base = { storeIds: 'all' as const, startAt: '2026-10-01 00:00:00', endAt: '2026-10-31 23:59:59', status: 'active' as const }

const PROMOS: Promotion[] = [
  { ...base, id: 'p1', code: 'PROMO-01', name: '65W三口特价169', type: 'special_price', skus: ['SP0101020001'], specialPrice: 16900 },
  { ...base, id: 'p2', code: 'PROMO-02', name: '数据线第2件5折', type: 'nth_discount', categoryPrefixes: ['0201'], nth: 2, nthRatePercent: 50 },
  { ...base, id: 'p3', code: 'PROMO-03', name: '全场满300减30', type: 'threshold_reduction', threshold: 30000, reduction: 3000 },
  { ...base, id: 'p4', code: 'PROMO-04', name: '移动电源满399减50', type: 'threshold_reduction', categoryPrefixes: ['03'], threshold: 39900, reduction: 5000 },
]

const COUPON_199_20: CouponTemplate = { id: 'ct1', name: '满199减20', threshold: 19900, amount: 2000 }
const COUPON_10: CouponTemplate = { id: 'ct2', name: '10元无门槛', threshold: 0, amount: 1000 }

const line = (lineNo: number, sku: string, categoryCode: string, unitPrice: number, qty = 1): PricingLineInput => ({
  lineNo,
  sku,
  categoryCode,
  unitPrice,
  qty,
})

const W65 = (n: number, qty = 1) => line(n, 'SP0101020001', '010102', 19900, qty)
const CABLE = (n: number, qty = 1) => line(n, 'SP0201010001', '020101', 3900, qty)
const CABLE240 = (n: number, qty = 1) => line(n, 'SP0201010002', '020101', 7900, qty)
const MAG10K = (n: number, qty = 1) => line(n, 'SP0301010002', '030101', 19900, qty)
const PB20K = (n: number, qty = 1) => line(n, 'SP0302010001', '030201', 25900, qty)

describe('allocate', () => {
  it('按比例分摊，和等于总额，尾差给余数大的', () => {
    expect(allocate(3000, [16900, 5850, 19900])).toEqual([1189, 411, 1400])
  })
  it('每份不超过权重', () => {
    const shares = allocate(1001, [1, 1000])
    expect(shares).toEqual([1, 1000])
  })
  it('总额超过权重之和时封顶', () => {
    expect(allocate(500, [100, 200])).toEqual([100, 200])
  })
  it('零权重不分', () => {
    expect(allocate(100, [0, 0])).toEqual([0, 0])
  })
})

describe('priceCart', () => {
  it('演示样例：原价476，促销49.5，满减30，券20，应付376.5', () => {
    const r = priceCart({
      lines: [W65(1), CABLE(2, 2), MAG10K(3)],
      promotions: PROMOS,
      coupon: { couponId: 'c1', template: COUPON_199_20 },
    })
    expect(r.totals).toEqual({ list: 47600, promo: 4950, order: 3000, coupon: 2000, manual: 0, payable: 37650 })
    expect(r.promotions.map((p) => p.code)).toEqual(['PROMO-01', 'PROMO-02', 'PROMO-03', 'ct1'])
    expect(r.lines.reduce((s, l) => s + l.payable, 0)).toBe(37650)
    expect(r.lines.find((l) => l.lineNo === 2)!.promoDiscount).toBe(1950)
    // 移动电源只有199，没到399，给出差额提示
    expect(r.hints).toEqual([{ promotionId: 'p4', name: '移动电源满399减50', shortBy: 20000 }])
  })

  it('第N件折扣跨SKU成组，按单价从高到低排，折扣落在每组第N件', () => {
    const r = priceCart({ lines: [CABLE240(1), CABLE(2)], promotions: [PROMOS[1]] })
    // 79 和 39 一组，第2件是39，五折优惠19.5
    expect(r.lines.map((l) => l.promoDiscount)).toEqual([0, 1950])
  })

  it('整单满减只取优惠最大的一个', () => {
    const r = priceCart({ lines: [MAG10K(1), PB20K(2)], promotions: PROMOS })
    const orderPromos = r.promotions.filter((p) => p.type === 'threshold_reduction')
    expect(orderPromos).toHaveLength(1)
    expect(orderPromos[0].code).toBe('PROMO-04')
    expect(r.totals.order).toBe(5000)
  })

  it('券未达门槛不生效并说明原因', () => {
    const r = priceCart({ lines: [CABLE(1)], promotions: [], coupon: { couponId: 'c1', template: COUPON_199_20 } })
    expect(r.coupon).toMatchObject({ applied: false, discount: 0 })
    expect(r.coupon!.reason).toContain('满199元可用')
    expect(r.totals.payable).toBe(3900)
  })

  it('无门槛券不超过应付', () => {
    const r = priceCart({ lines: [line(1, 'X', '99', 500)], promotions: [], coupon: { couponId: 'c2', template: COUPON_10 } })
    expect(r.totals.coupon).toBe(500)
    expect(r.totals.payable).toBe(0)
  })

  it('改价最后算，只能往下改，不低于0', () => {
    const r = priceCart({ lines: [W65(1)], promotions: PROMOS, adjustments: [{ lineNo: 1, after: 15000 }] })
    expect(r.lines[0].beforeManual).toBe(16900)
    expect(r.lines[0].manualDiscount).toBe(1900)
    expect(r.totals.payable).toBe(15000)
    const up = priceCart({ lines: [W65(1)], promotions: PROMOS, adjustments: [{ lineNo: 1, after: 99999 }] })
    expect(up.totals.manual).toBe(0)
    const neg = priceCart({ lines: [W65(1)], promotions: PROMOS, adjustments: [{ lineNo: 1, after: -1 }] })
    expect(neg.totals.payable).toBe(0)
  })

  it('每行应付都不为负，且各项相加对得上', () => {
    const r = priceCart({
      lines: [W65(1, 3), CABLE(2, 5), CABLE240(3, 2), MAG10K(4), PB20K(5, 2)],
      promotions: PROMOS,
      coupon: { couponId: 'c1', template: COUPON_199_20 },
    })
    for (const l of r.lines) {
      expect(l.payable).toBeGreaterThanOrEqual(0)
      expect(l.listAmount - l.promoDiscount - l.orderDiscount - l.couponDiscount - l.manualDiscount).toBe(l.payable)
    }
    expect(r.totals.list - r.totals.promo - r.totals.order - r.totals.coupon - r.totals.manual).toBe(r.totals.payable)
  })

  it('只算生效中、适用本店的促销', () => {
    const list: Promotion[] = [
      { ...PROMOS[0], id: 'a' },
      { ...PROMOS[0], id: 'b', storeIds: ['s02'] },
      { ...PROMOS[0], id: 'c', status: 'ended' },
      { ...PROMOS[0], id: 'd', endAt: '2026-10-10 23:59:59' },
    ]
    expect(activePromotions(list, 's01', '2026-10-15 10:00:00').map((p) => p.id)).toEqual(['a'])
  })
})
