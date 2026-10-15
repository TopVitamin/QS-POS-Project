import { describe, expect, it } from 'vitest'
import type { Payment } from '../types'
import { allocateRefund, refundForLine } from './refund'

const pay = (id: string, method: Payment['method'], amount: number, refunded = 0, status: Payment['status'] = 'success'): Payment => ({
  id,
  method,
  amount,
  status,
  refunded,
  createdAt: '2026-10-15 10:00:00',
})

describe('refundForLine', () => {
  it('按比例退，最后一件吸收尾差', () => {
    const line = { qty: 3, payable: 10000, returnedQty: 0, refundedAmount: 0 }
    const first = refundForLine(line, 1)
    expect(first).toBe(3333)
    const second = refundForLine({ ...line, returnedQty: 1, refundedAmount: first }, 1)
    expect(second).toBe(3334)
    const last = refundForLine({ ...line, returnedQty: 2, refundedAmount: first + second }, 1)
    expect(first + second + last).toBe(10000)
  })

  it('分几次退和一次退的合计相同', () => {
    const line = { qty: 4, payable: 9999, returnedQty: 0, refundedAmount: 0 }
    const once = refundForLine(line, 2)
    const a = refundForLine(line, 1)
    const b = refundForLine({ ...line, returnedQty: 1, refundedAmount: a }, 1)
    expect(a + b).toBe(once)
  })

  it('数量越界报错', () => {
    const line = { qty: 2, payable: 100, returnedQty: 1, refundedAmount: 50 }
    expect(() => refundForLine(line, 2)).toThrow()
    expect(() => refundForLine(line, 0)).toThrow()
  })
})

describe('allocateRefund', () => {
  it('按支付先后倒序原路退', () => {
    const r = allocateRefund([pay('a', 'cash', 5000), pay('b', 'wechat', 8000)], 10000)
    expect(r).toEqual([
      { paymentId: 'b', method: 'wechat', amount: 8000 },
      { paymentId: 'a', method: 'cash', amount: 2000 },
    ])
  })

  it('跳过失败的支付和已退完的支付', () => {
    const r = allocateRefund([pay('a', 'cash', 5000), pay('b', 'wechat', 8000, 8000), pay('c', 'alipay', 3000, 0, 'failed')], 1000)
    expect(r).toEqual([{ paymentId: 'a', method: 'cash', amount: 1000 }])
  })

  it('超过可退金额报错', () => {
    expect(() => allocateRefund([pay('a', 'cash', 100)], 101)).toThrow()
  })
})
