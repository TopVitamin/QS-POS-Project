import type { BizDate } from '../types'
import { summarizeMoney } from '../domain/summary'
import type { DemoDb } from '../mock/schema'
import { addDays, todayBizDate } from '../utils/time'
import { query } from './core'

const within = (storeIds: string[]) => (x: { storeId: string }) => storeIds.includes(x.storeId)

function dayMoney(db: DemoDb, storeIds: string[], date: BizDate) {
  const inScope = within(storeIds)
  return summarizeMoney(
    db.sales.filter((s) => inScope(s) && s.bizDate === date),
    db.returns.filter((r) => inScope(r) && r.bizDate === date),
  )
}

/** 工作台：授权范围内的今日成交、支付构成、门店排行、待办和中枢回传 */
export function dashboard(input: { storeIds: string[]; bizDate?: BizDate }) {
  return query((db) => {
    const date = input.bizDate ?? todayBizDate()
    const inScope = within(input.storeIds)
    const money = dayMoney(db, input.storeIds, date)
    const yesterday = dayMoney(db, input.storeIds, addDays(date, -1))
    const todaySales = db.sales.filter((s) => inScope(s) && s.bizDate === date)

    const stores = db.stores
      .filter((s) => input.storeIds.includes(s.id))
      .map((store) => {
        const m = dayMoney(db, [store.id], date)
        return {
          store,
          net: m.net,
          saleCount: m.saleCount,
          openShifts: db.shifts.filter((x) => x.storeId === store.id && x.status === 'open').length,
          closed: db.dailyCloses.some((d) => d.storeId === store.id && d.bizDate === date),
        }
      })
      .sort((a, b) => b.net - a.net)

    const days = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6)).map((d) => {
      const m = dayMoney(db, input.storeIds, d)
      return { date: d, net: m.net, saleCount: m.saleCount }
    })

    const skuQty = new Map<string, { sku: string; name: string; qty: number; amount: number }>()
    for (const s of todaySales) {
      for (const l of s.lines) {
        const cur = skuQty.get(l.sku) ?? { sku: l.sku, name: l.name, qty: 0, amount: 0 }
        cur.qty += l.qty
        cur.amount += l.payable
        skuQty.set(l.sku, cur)
      }
    }
    const topSkus = [...skuQty.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 5)

    const unclosedDays = new Set(
      db.sales
        .filter((s) => inScope(s) && s.bizDate < date && !s.dailyCloseNo)
        .map((s) => `${s.storeId}|${s.bizDate}`),
    ).size

    const todo = {
      pickupsPending: db.pickups.filter((p) => inScope(p) && p.status === 'pending').length,
      agentInProgress: db.agentOrders.filter((o) => inScope(o) && ['submitted', 'routed', 'shipped'].includes(o.status)).length,
      inTransit: db.shipments.filter((s) => inScope(s) && s.status === 'in_transit').length,
      stocktakeToPost: db.stocktakes.filter((s) => inScope(s) && s.status === 'submitted').length,
      replenishReviewing: db.replenishments.filter((r) => inScope(r) && r.status === 'reviewing').length,
      transfersReviewing: db.transfers.filter((t) => (input.storeIds.includes(t.fromStoreId) || input.storeIds.includes(t.toStoreId)) && t.status === 'reviewing').length,
      dropshipsPending: db.agentOrders.filter((o) => o.oms.nodeKind === 'store' && o.status === 'routed' && !!o.oms.nodeStoreId && input.storeIds.includes(o.oms.nodeStoreId)).length,
      discrepancies: db.discrepancies.filter((d) => inScope(d) && d.status === 'submitted').length,
      openShifts: db.shifts.filter((s) => inScope(s) && s.status === 'open').length,
      unclosedDays,
    }

    const todayDocs = [...todaySales, ...db.returns.filter((r) => inScope(r) && r.bizDate === date)]
    const hub = {
      accepted: todayDocs.filter((d) => d.hubSync.status === 'accepted').length,
      rejected: todayDocs.filter((d) => d.hubSync.status === 'rejected').length,
      duplicateHits: todayDocs.reduce((s, d) => s + d.hubSync.duplicateHits, 0),
      verifyRejected: db.verifications.filter((v) => inScope(v) && v.result === 'rejected' && v.at.startsWith(date)).length,
      verified: db.verifications.filter((v) => inScope(v) && v.result === 'success' && v.at.startsWith(date)).length,
      lastAt: todayDocs.map((d) => d.hubSync.at).sort().pop() ?? null,
    }

    return {
      date,
      money,
      yesterdayNet: yesterday.net,
      avgTicket: money.saleCount ? Math.round(money.gross / money.saleCount) : null,
      stores,
      days,
      topSkus,
      todo,
      hub,
    }
  })
}

/**
 * 本人业绩归属：按行级导购工号汇总成交和代客单。
 * 不算提成（【待确认-13】）；退货按原单行的已退金额扣减，冲减口径同样待确认。
 */
export function performance(input: { jobNo: string; from: BizDate; to: BizDate }) {
  return query((db) => {
    const rows = db.sales
      .filter((s) => s.bizDate >= input.from && s.bizDate <= input.to)
      .flatMap((s) => s.lines.filter((l) => l.guideJobNo === input.jobNo).map((l) => ({ sale: s, line: l })))
    const amount = rows.reduce((s, r) => s + r.line.payable, 0)
    const refunded = rows.reduce((s, r) => s + r.line.refundedAmount, 0)
    const agents = db.agentOrders
      .filter((o) => o.guideJobNo === input.jobNo && o.createdAt.slice(0, 10) >= input.from && o.createdAt.slice(0, 10) <= input.to)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    const days: { date: BizDate; net: number; orders: number }[] = []
    for (let d = input.from; d <= input.to; d = addDays(d, 1)) {
      const dayRows = rows.filter((r) => r.sale.bizDate === d)
      days.push({
        date: d,
        net: dayRows.reduce((s, r) => s + r.line.payable - r.line.refundedAmount, 0),
        orders: new Set(dayRows.map((r) => r.sale.no)).size,
      })
    }

    return {
      orders: new Set(rows.map((r) => r.sale.no)).size,
      qty: rows.reduce((s, r) => s + r.line.qty, 0),
      returnedQty: rows.reduce((s, r) => s + r.line.returnedQty, 0),
      amount,
      refunded,
      net: amount - refunded,
      days,
      recent: rows
        .sort((a, b) => (a.sale.createdAt < b.sale.createdAt ? 1 : -1))
        .slice(0, 12)
        .map((r) => ({
          saleNo: r.sale.no,
          storeId: r.sale.storeId,
          at: r.sale.createdAt,
          name: r.line.name,
          qty: r.line.qty,
          payable: r.line.payable,
          refunded: r.line.refundedAmount,
        })),
      agents,
    }
  })
}
