import type { AppliedPromotion, Cents, CouponTemplate, Promotion, SaleTotals } from '../types'

/**
 * 价格促销计算。叠加和分摊规则都是演示假设，见 config/assumptions.ts 的
 * promoStacking、allocation，对应【待确认-53】：
 * 1. 行级促销（特价、第N件折扣）每行只取优惠最大的一个；
 * 2. 整单满减只取优惠最大的一个，按参与行的促销后金额分摊；
 * 3. 每单最多一张券，按整单优惠后的金额分摊；
 * 4. 改价最后算，只能往下改，不低于0。
 */

export interface PricingLineInput {
  lineNo: number
  sku: string
  categoryCode: string
  qty: number
  unitPrice: Cents
}

export interface PricingCoupon {
  couponId: string
  template: CouponTemplate
}

/** 改价：把这一行的应付改成 after（行金额，不是单价） */
export interface PricingAdjustment {
  lineNo: number
  after: Cents
}

export interface PricingInput {
  lines: PricingLineInput[]
  /** 已按门店和有效期过滤过的促销 */
  promotions: Promotion[]
  coupon?: PricingCoupon | null
  adjustments?: PricingAdjustment[]
}

export interface PricedLine {
  lineNo: number
  listAmount: Cents
  promoDiscount: Cents
  orderDiscount: Cents
  couponDiscount: Cents
  manualDiscount: Cents
  /** 改价前的应付，改价弹窗拿它当原价 */
  beforeManual: Cents
  payable: Cents
  promoIds: string[]
}

export interface PromotionHint {
  promotionId: string
  name: string
  /** 还差多少达到门槛 */
  shortBy: Cents
}

export interface CouponResult {
  couponId: string
  applied: boolean
  discount: Cents
  reason?: string
}

export interface PricingResult {
  lines: PricedLine[]
  promotions: AppliedPromotion[]
  totals: SaleTotals
  coupon: CouponResult | null
  hints: PromotionHint[]
}

const LINE_LEVEL: Promotion['type'][] = ['special_price', 'nth_discount']

/** 最大余数法分摊：结果之和等于 total，且每份不超过权重 */
export function allocate(total: Cents, weights: number[]): Cents[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (total <= 0 || sum <= 0) return weights.map(() => 0)
  const capped = Math.min(total, sum)
  const raw = weights.map((w) => (capped * w) / sum)
  const shares = raw.map((r) => Math.floor(r))
  let rest = capped - shares.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (rest <= 0) break
    shares[i] += 1
    rest -= 1
  }
  return shares
}

export function promoMatches(p: Promotion, line: Pick<PricingLineInput, 'sku' | 'categoryCode'>): boolean {
  const hasSku = !!p.skus?.length
  const hasCat = !!p.categoryPrefixes?.length
  if (!hasSku && !hasCat) return true
  return (hasSku && p.skus!.includes(line.sku)) || (hasCat && p.categoryPrefixes!.some((c) => line.categoryCode.startsWith(c)))
}

/** 第N件折扣：参与的件按单价从高到低排，每满N件，第N件按折扣价计 */
function nthDiscounts(p: Promotion, lines: PricingLineInput[]): Map<number, Cents> {
  const n = p.nth ?? 2
  const rate = p.nthRatePercent ?? 100
  const units = lines
    .flatMap((l) => Array.from({ length: l.qty }, () => ({ lineNo: l.lineNo, price: l.unitPrice })))
    .sort((a, b) => b.price - a.price || a.lineNo - b.lineNo)
  const result = new Map<number, Cents>()
  units.forEach((u, i) => {
    if ((i + 1) % n !== 0) return
    const off = u.price - Math.round((u.price * rate) / 100)
    result.set(u.lineNo, (result.get(u.lineNo) ?? 0) + off)
  })
  return result
}

function lineLevelDiscounts(p: Promotion, lines: PricingLineInput[]): Map<number, Cents> {
  const matched = lines.filter((l) => promoMatches(p, l))
  if (p.type === 'special_price') {
    const result = new Map<number, Cents>()
    for (const l of matched) {
      const off = Math.max(0, l.unitPrice - (p.specialPrice ?? l.unitPrice)) * l.qty
      if (off > 0) result.set(l.lineNo, off)
    }
    return result
  }
  return nthDiscounts(p, matched)
}

export function priceCart(input: PricingInput): PricingResult {
  const lines = input.lines.filter((l) => l.qty > 0)
  const priced = new Map<number, PricedLine>()
  for (const l of lines) {
    const listAmount = l.unitPrice * l.qty
    priced.set(l.lineNo, {
      lineNo: l.lineNo,
      listAmount,
      promoDiscount: 0,
      orderDiscount: 0,
      couponDiscount: 0,
      manualDiscount: 0,
      beforeManual: listAmount,
      payable: listAmount,
      promoIds: [],
    })
  }
  const applied: AppliedPromotion[] = []
  const hints: PromotionHint[] = []

  // 1. 行级促销：先按完整参与池给每行挑优惠最大的，再让每行只归属一个促销，按归属重算。
  //    第N件折扣里按原价计的那一件也要留在池里，否则凑不成组
  const linePromos = input.promotions.filter((p) => LINE_LEVEL.includes(p.type))
  const choice = new Map<number, { promo: Promotion; off: Cents }>()
  for (const p of linePromos) {
    for (const [lineNo, off] of lineLevelDiscounts(p, lines)) {
      const current = choice.get(lineNo)
      if (off > 0 && (!current || off > current.off)) choice.set(lineNo, { promo: p, off })
    }
  }
  const owner = new Map<number, string>()
  for (const l of lines) {
    const o = choice.get(l.lineNo)?.promo ?? linePromos.find((p) => promoMatches(p, l))
    if (o) owner.set(l.lineNo, o.id)
  }
  for (const p of linePromos) {
    const pool = lines.filter((l) => owner.get(l.lineNo) === p.id)
    if (!pool.length) continue
    const offs = lineLevelDiscounts(p, pool)
    let total = 0
    const lineNos: number[] = []
    for (const l of pool) {
      const off = Math.min(offs.get(l.lineNo) ?? 0, priced.get(l.lineNo)!.listAmount)
      if (off <= 0) continue
      const pl = priced.get(l.lineNo)!
      pl.promoDiscount = off
      pl.promoIds.push(p.id)
      total += off
      lineNos.push(l.lineNo)
    }
    if (total > 0) applied.push({ promotionId: p.id, code: p.code, name: p.name, type: p.type, discount: total, lineNos })
  }

  const afterPromo = (lineNo: number) => {
    const pl = priced.get(lineNo)!
    return pl.listAmount - pl.promoDiscount
  }

  // 2. 整单满减：只取一个
  let best: { promo: Promotion; reduction: Cents; scope: PricingLineInput[] } | null = null
  for (const p of input.promotions.filter((x) => x.type === 'threshold_reduction')) {
    const scope = lines.filter((l) => promoMatches(p, l))
    const base = scope.reduce((s, l) => s + afterPromo(l.lineNo), 0)
    const threshold = p.threshold ?? 0
    if (!scope.length || base <= 0) continue
    if (base < threshold) {
      hints.push({ promotionId: p.id, name: p.name, shortBy: threshold - base })
      continue
    }
    const reduction = Math.min(p.reduction ?? 0, base)
    if (reduction > 0 && (!best || reduction > best.reduction)) best = { promo: p, reduction, scope }
  }
  if (best) {
    const shares = allocate(
      best.reduction,
      best.scope.map((l) => afterPromo(l.lineNo)),
    )
    best.scope.forEach((l, i) => {
      const pl = priced.get(l.lineNo)!
      pl.orderDiscount = shares[i]
      if (shares[i] > 0) pl.promoIds.push(best!.promo.id)
    })
    applied.push({
      promotionId: best.promo.id,
      code: best.promo.code,
      name: best.promo.name,
      type: 'threshold_reduction',
      discount: best.reduction,
      lineNos: best.scope.map((l) => l.lineNo),
    })
  }

  // 3. 券：每单一张
  let coupon: CouponResult | null = null
  if (input.coupon) {
    const { couponId, template } = input.coupon
    const base = lines.reduce((s, l) => s + afterPromo(l.lineNo) - priced.get(l.lineNo)!.orderDiscount, 0)
    if (base <= 0) {
      coupon = { couponId, applied: false, discount: 0, reason: '购物车为空' }
    } else if (base < template.threshold) {
      coupon = { couponId, applied: false, discount: 0, reason: `未达门槛，满${template.threshold / 100}元可用` }
    } else {
      const discount = Math.min(template.amount, base)
      const shares = allocate(
        discount,
        lines.map((l) => afterPromo(l.lineNo) - priced.get(l.lineNo)!.orderDiscount),
      )
      lines.forEach((l, i) => {
        priced.get(l.lineNo)!.couponDiscount = shares[i]
      })
      coupon = { couponId, applied: true, discount }
      applied.push({
        promotionId: couponId,
        code: template.id,
        name: template.name,
        type: 'coupon',
        discount,
        lineNos: lines.filter((_, i) => shares[i] > 0).map((l) => l.lineNo),
      })
    }
  }

  // 4. 改价最后算
  for (const pl of priced.values()) {
    pl.beforeManual = pl.listAmount - pl.promoDiscount - pl.orderDiscount - pl.couponDiscount
    const adj = input.adjustments?.find((a) => a.lineNo === pl.lineNo)
    if (adj) {
      const after = Math.max(0, Math.min(adj.after, pl.beforeManual))
      pl.manualDiscount = pl.beforeManual - after
    }
    pl.payable = pl.beforeManual - pl.manualDiscount
  }

  const out = lines.map((l) => priced.get(l.lineNo)!)
  const sum = (k: keyof Pick<PricedLine, 'listAmount' | 'promoDiscount' | 'orderDiscount' | 'couponDiscount' | 'manualDiscount' | 'payable'>) =>
    out.reduce((s, l) => s + l[k], 0)
  return {
    lines: out,
    promotions: applied,
    totals: {
      list: sum('listAmount'),
      promo: sum('promoDiscount'),
      order: sum('orderDiscount'),
      coupon: sum('couponDiscount'),
      manual: sum('manualDiscount'),
      payable: sum('payable'),
    },
    coupon,
    hints: hints.sort((a, b) => a.shortBy - b.shortBy),
  }
}

/** 按门店、时间过滤生效中的促销 */
export function activePromotions(all: Promotion[], storeId: string, at: string): Promotion[] {
  return all.filter(
    (p) =>
      p.status === 'active' &&
      (p.storeIds === 'all' || p.storeIds.includes(storeId)) &&
      p.startAt <= at &&
      at <= p.endAt,
  )
}
