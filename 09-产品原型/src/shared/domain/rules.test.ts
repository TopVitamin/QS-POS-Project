import { describe, expect, it } from 'vitest'
import type { PickupOrder, Shift } from '../types'
import { availableOf, checkDailyClose, checkHandover, checkSellable, judgePickup, stocktakeDiffs } from './rules'

const pickup = (over: Partial<PickupOrder> = {}): PickupOrder => ({
  omsNo: 'HUBOMS20261015000001',
  channelOrderNo: 'XCX1',
  channel: 'miniapp',
  storeId: 's01',
  pickupCode: '820145',
  lock: { status: 'locked', lockNo: 'HUBSD1', lockedAt: '2026-10-15 09:00:00' },
  items: [],
  customer: { name: '陈', phone: '13800000000' },
  paidAmount: 23900,
  createdAt: '2026-10-15 09:00:00',
  status: 'pending',
  ...over,
})

describe('可卖检查', () => {
  it('可用 = 账面 − 锁定，不为负', () => {
    expect(availableOf({ onHand: 2, locked: 2 })).toBe(0)
    expect(availableOf({ onHand: 1, locked: 3 })).toBe(0)
    expect(availableOf(undefined)).toBe(0)
  })

  it('同一SKU多行合并后再比，被锁定的件数卖不出去', () => {
    const stock = { storeId: 's01', sku: 'A', onHand: 2, locked: 2, inTransit: 0 }
    const r = checkSellable([{ sku: 'A', name: '套装', qty: 1 }], () => stock)
    expect(r.ok).toBe(false)
    expect(r.shortages[0]).toMatchObject({ sku: 'A', available: 0, qty: 1 })
    const r2 = checkSellable(
      [
        { sku: 'B', name: '线', qty: 2 },
        { sku: 'B', name: '线', qty: 2 },
      ],
      () => ({ storeId: 's01', sku: 'B', onHand: 3, locked: 0, inTransit: 5 }),
    )
    expect(r2.ok).toBe(false)
    expect(r2.shortages[0].qty).toBe(4)
  })
})

describe('核销核验', () => {
  it('按顺序给出拒绝原因', () => {
    expect(judgePickup(undefined, 's01')).toMatchObject({ ok: false, reason: 'not_found' })
    expect(judgePickup(pickup({ storeId: 's03' }), 's01')).toMatchObject({ ok: false, reason: 'store_mismatch' })
    expect(judgePickup(pickup({ status: 'verified' }), 's01')).toMatchObject({ ok: false, reason: 'already_verified' })
    expect(judgePickup(pickup({ status: 'expired' }), 's01')).toMatchObject({ ok: false, reason: 'expired' })
    expect(judgePickup(pickup({ lock: { status: 'released', lockNo: 'x', lockedAt: '' } }), 's01')).toMatchObject({
      ok: false,
      reason: 'lock_invalid',
    })
    expect(judgePickup(pickup(), 's01')).toEqual({ ok: true })
  })
})

describe('交班', () => {
  it('有结果不明的支付不能交班', () => {
    expect(checkHandover({ pendingPayments: 1, expectedCash: 0, countedCash: 0, note: '' }).ok).toBe(false)
  })
  it('非零差异必须写说明', () => {
    expect(checkHandover({ pendingPayments: 0, expectedCash: 50000, countedCash: 49000, note: '' })).toMatchObject({
      ok: false,
      diff: -1000,
      needNote: true,
    })
    expect(checkHandover({ pendingPayments: 0, expectedCash: 50000, countedCash: 49000, note: '找错零' }).ok).toBe(true)
    expect(checkHandover({ pendingPayments: 0, expectedCash: 50000, countedCash: 50000, note: '' })).toMatchObject({
      ok: true,
      diff: 0,
      needNote: false,
    })
  })
})

describe('日结', () => {
  const shift = (status: Shift['status']): Shift => ({
    no: 'BC-1',
    storeId: 's01',
    registerNo: '01',
    cashierJobNo: 'QS1002',
    bizDate: '2026-10-15',
    openedAt: '2026-10-15 10:00:00',
    float: 50000,
    status,
  })
  it('有未交班的班次不能封账', () => {
    const r = checkDailyClose({ shifts: [shift('closed'), shift('open')], alreadyClosed: false, pendingCheckouts: 0 })
    expect(r.ok).toBe(false)
    expect(r.openShifts).toHaveLength(1)
  })
  it('已封账不能再封', () => {
    expect(checkDailyClose({ shifts: [shift('closed')], alreadyClosed: true, pendingCheckouts: 0 }).ok).toBe(false)
  })
  it('班次都交了可以封账', () => {
    expect(checkDailyClose({ shifts: [shift('closed')], alreadyClosed: false, pendingCheckouts: 0 }).ok).toBe(true)
  })
})

describe('盘点差异', () => {
  it('只列有差异且已录入的行', () => {
    const lines = [
      { sku: 'A', name: 'a', spec: '', bookQty: 5, countedQty: 4 },
      { sku: 'B', name: 'b', spec: '', bookQty: 5, countedQty: 5 },
      { sku: 'C', name: 'c', spec: '', bookQty: 5, countedQty: null },
    ]
    expect(stocktakeDiffs(lines).map((l) => [l.sku, l.diff])).toEqual([['A', -1]])
  })
})
