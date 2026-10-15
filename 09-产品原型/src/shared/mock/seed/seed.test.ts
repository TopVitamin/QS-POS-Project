import { describe, expect, it } from 'vitest'
import { availableOf } from '../../domain/rules'
import { dueByMethod, PAY_METHOD_KEYS } from '../../domain/summary'
import { parseDateTime } from '../../utils/time'
import { buildSeedWithReport } from './history'

/** 北京时间的几个时刻：凌晨、开门前、下午、深夜 */
const MOMENTS = ['2026-10-15 01:30:00', '2026-10-15 09:20:00', '2026-10-15 18:48:00', '2026-10-15 23:58:00']

describe.each(MOMENTS)('种子数据 @ %s', (moment) => {
  const { db, errors } = buildSeedWithReport(parseDateTime(moment))
  const stock = (storeId: string, sku: string) => db.stock.find((s) => s.storeId === storeId && s.sku === sku)!

  it('所有种子任务都执行成功', () => {
    expect(errors).toEqual([])
  })

  it('万象天地店的设计库存：套装2件全被锁定，140W无货，磁吸10000只剩1件', () => {
    expect(stock('s01', 'SP0401010001')).toMatchObject({ onHand: 2, locked: 2 })
    expect(stock('s01', 'SP0101020003').onHand).toBe(0)
    expect(stock('s01', 'SP0301010002').onHand).toBe(1)
    expect(stock('s01', 'SP0301010002').inTransit).toBe(6)
  })

  it('库存不为负，锁定不超过账面，流水余额和库存对得上', () => {
    for (const r of db.stock) {
      expect(r.onHand).toBeGreaterThanOrEqual(0)
      expect(r.locked).toBeGreaterThanOrEqual(0)
      expect(r.locked).toBeLessThanOrEqual(r.onHand)
      const entries = db.ledger.filter((l) => l.storeId === r.storeId && l.sku === r.sku)
      entries.forEach((l) => expect(l.balanceAfter).toBeGreaterThanOrEqual(0))
      if (entries.length) expect(entries[entries.length - 1].balanceAfter).toBe(r.onHand)
    }
    const lockedByPickups = db.pickups
      .filter((p) => p.status === 'pending' && p.lock.status === 'locked')
      .flatMap((p) => p.items.map((i) => ({ key: `${p.storeId}|${i.sku}`, qty: i.qty })))
    for (const r of db.stock) {
      const expected = lockedByPickups.filter((x) => x.key === `${r.storeId}|${r.sku}`).reduce((s, x) => s + x.qty, 0)
      expect(r.locked).toBe(expected)
    }
  })

  it('每张销售单应付等于成功收款合计，单号不重复', () => {
    for (const s of db.sales) {
      const paid = s.payments.filter((p) => p.status === 'success').reduce((a, p) => a + p.amount, 0)
      expect(paid).toBe(s.totals.payable)
      expect(s.hubSync.status).toBe('accepted')
    }
    const nos = [...db.sales, ...db.returns, ...db.shifts, ...db.dailyCloses, ...db.dues].map((x) => x.no)
    expect(new Set(nos).size).toBe(nos.length)
  })

  it('加盟应缴等于日结按支付方式的净额', () => {
    for (const due of db.dues) {
      const close = db.dailyCloses.find((d) => d.no === due.dailyCloseNo)!
      expect(due).toMatchObject(dueByMethod(close.summary.byMethod))
      expect(db.stores.find((s) => s.id === due.storeId)!.mode).toBe('franchise')
    }
    const directDue = db.dailyCloses.filter((d) => ['s01', 's02'].includes(d.storeId) && d.franchiseDueNo)
    expect(directDue).toEqual([])
  })

  it('已交班的班次，应有现金 = 备用金 + 现金收款 − 现金退款', () => {
    for (const sh of db.shifts.filter((s) => s.status === 'closed')) {
      const cash = sh.summary!.byMethod.cash
      expect(sh.summary!.expectedCash).toBe(sh.float + cash.sales - cash.refunds)
      expect(sh.countedCash! - sh.summary!.expectedCash).toBe(sh.cashDiff)
      if (sh.cashDiff) expect(sh.diffNote).toBeTruthy()
    }
    for (const close of db.dailyCloses) {
      const sum = PAY_METHOD_KEYS.reduce((s, m) => s + close.summary.byMethod[m].sales, 0)
      expect(sum).toBe(close.summary.gross)
    }
  })

  it('同一时刻生成两次，结果一样', () => {
    const again = buildSeedWithReport(parseDateTime(moment)).db
    expect(again.sales.map((s) => [s.no, s.totals.payable])).toEqual(db.sales.map((s) => [s.no, s.totals.payable]))
    expect(again.stock).toEqual(db.stock)
  })

  it('演示提货码都在', () => {
    const code = (c: string) => db.pickups.find((p) => p.pickupCode === c)!
    expect(code('820145')).toMatchObject({ storeId: 's01', status: 'pending' })
    expect(code('640218').status).toBe('verified')
    expect(code('559302').status).toBe('expired')
    expect(code('918274').storeId).toBe('s03')
    expect(code('370615').lock.status).toBe('released')
    expect(availableOf(stock('s01', 'SP0401010001'))).toBe(0)
  })
})
