import type { Cents, PayMethod, Payment, SaleLine } from '../types'

/**
 * 部分退货应退：按该行实付 × 累计退货数量 / 购买数量，减去已退金额。
 * 退到最后一件时正好吸收尾差。演示假设 partialRefund，对应【待确认-53】。
 */
export function refundForLine(
  line: Pick<SaleLine, 'qty' | 'payable' | 'returnedQty' | 'refundedAmount'>,
  returnQty: number,
): Cents {
  const remaining = line.qty - line.returnedQty
  if (!Number.isInteger(returnQty) || returnQty <= 0 || returnQty > remaining) {
    throw new RangeError(`退货数量必须在1到${remaining}之间`)
  }
  const cumulative = line.returnedQty + returnQty
  if (cumulative === line.qty) return line.payable - line.refundedAmount
  return Math.round((line.payable * cumulative) / line.qty) - line.refundedAmount
}

export interface RefundAllocation {
  paymentId: string
  method: PayMethod
  amount: Cents
}

/** 退款在原支付之间分配：按支付先后倒序原路退。演示假设 refundOrder，对应【待确认-08】 */
export function allocateRefund(payments: Payment[], total: Cents): RefundAllocation[] {
  const result: RefundAllocation[] = []
  let rest = total
  const ok = payments.filter((p) => p.status === 'success')
  for (let i = ok.length - 1; i >= 0 && rest > 0; i--) {
    const p = ok[i]
    const refundable = p.amount - p.refunded
    if (refundable <= 0) continue
    const amount = Math.min(refundable, rest)
    result.push({ paymentId: p.id, method: p.method, amount })
    rest -= amount
  }
  if (rest > 0) throw new RangeError('应退金额超过原单可退金额')
  return result
}
