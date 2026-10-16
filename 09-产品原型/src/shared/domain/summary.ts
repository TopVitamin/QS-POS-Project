import type { ByMethod, Cents, DailySummary, MethodSummary, PayMethod, ReturnOrder, SaleOrder, ShiftSummary } from '../types'

export const PAY_METHOD_KEYS: PayMethod[] = ['cash', 'wechat', 'alipay', 'unionpay']

export function emptyByMethod(): ByMethod<MethodSummary> {
  return {
    cash: { sales: 0, refunds: 0 },
    wechat: { sales: 0, refunds: 0 },
    alipay: { sales: 0, refunds: 0 },
    unionpay: { sales: 0, refunds: 0 },
  }
}

/** 只汇总通道已成功的收款和退款 */
export function summarizeMoney(sales: SaleOrder[], returns: ReturnOrder[]) {
  const byMethod = emptyByMethod()
  for (const s of sales) {
    for (const p of s.payments) if (p.status === 'success') byMethod[p.method].sales += p.amount
  }
  for (const r of returns) {
    for (const p of r.refunds) if (p.status === 'success') byMethod[p.method].refunds += p.amount
  }
  const gross = PAY_METHOD_KEYS.reduce((s, m) => s + byMethod[m].sales, 0)
  const refunds = PAY_METHOD_KEYS.reduce((s, m) => s + byMethod[m].refunds, 0)
  return { byMethod, gross, refunds, net: gross - refunds, saleCount: sales.length, returnCount: returns.length }
}

/** 交班汇总。应有现金 = 备用金 + 现金收款 − 现金退款 */
export function shiftSummary(float: Cents, sales: SaleOrder[], returns: ReturnOrder[]): ShiftSummary {
  const m = summarizeMoney(sales, returns)
  return {
    saleCount: m.saleCount,
    returnCount: m.returnCount,
    byMethod: m.byMethod,
    expectedCash: float + m.byMethod.cash.sales - m.byMethod.cash.refunds,
  }
}

/** 日结汇总。核销和代客单只计件数，不进成交净额（【待确认-14】） */
export function dailySummary(
  sales: SaleOrder[],
  returns: ReturnOrder[],
  pickupsVerified: number,
  agentOrders: number,
): DailySummary {
  const m = summarizeMoney(sales, returns)
  return {
    saleCount: m.saleCount,
    returnCount: m.returnCount,
    gross: m.gross,
    refunds: m.refunds,
    net: m.net,
    byMethod: m.byMethod,
    pickupsVerified,
    agentOrders,
  }
}

/** 加盟应缴：按支付方式的净额（收款 − 退款）。线上已付的自提单本来就不在门店收款里 */
export function dueByMethod(byMethod: ByMethod<MethodSummary>): { byMethod: ByMethod; total: Cents } {
  const out = { cash: 0, wechat: 0, alipay: 0, unionpay: 0 } as ByMethod
  for (const m of PAY_METHOD_KEYS) out[m] = byMethod[m].sales - byMethod[m].refunds
  return { byMethod: out, total: PAY_METHOD_KEYS.reduce((s, m) => s + out[m], 0) }
}
